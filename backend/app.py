import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import jwt
import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps

app = Flask(__name__, static_folder='../frontend')
app.secret_key = "rapid_crisis_secure_and_premium_secret_key_2024_x99"
CORS(app)

# --- Database Configuration ---
# 1. PASTE YOUR NEON URL HERE:
NEON_URL = "postgresql://neondb_owner:npg_QAsKmDSv9E0u@ep-spring-cloud-akwm5q9r-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require"

def get_db_connection():
    try:
        conn = psycopg2.connect(NEON_URL, cursor_factory=RealDictCursor)
        return conn
    except Exception as e:
        print(f"CRITICAL DATABASE ERROR: {e}")
        return None

def execute_query(query, params=(), fetchone=False, fetchall=False):
    conn = get_db_connection()
    if not conn:
        raise Exception("Database connection failed")
    try:
        cur = conn.cursor()
        cur.execute(query, params)
        
        if fetchone:
            res = cur.fetchone()
            result = dict(res) if res else None
            conn.commit()
            return result
            
        if fetchall:
            res = cur.fetchall()
            result = [dict(r) for r in res]
            conn.commit()
            return result
        
        conn.commit()
        if "RETURNING" in query.upper():
             res = cur.fetchone()
             return dict(res) if res else None
             
        return None
    except Exception as e:
        print(f"QUERY EXECUTION ERROR: {e}\nQuery: {query}\nParams: {params}")
        raise
    finally:
        conn.close()

# --- Database Initialization & Migration ---
def migrate_db():
    print("--- Running Database Migrations ---")
    conn = get_db_connection()
    if not conn: return
    try:
        cur = conn.cursor()
        # Add missing columns to alerts table if they don't exist
        columns_to_add = [
            ("address", "TEXT"),
            ("hotel_name", "VARCHAR(255)"),
            ("dispatched_services", "TEXT DEFAULT ''"),
            ("admin_reply", "TEXT DEFAULT ''")
        ]
        for col_name, col_type in columns_to_add:
            cur.execute(f"""
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                 WHERE table_name='alerts' AND column_name='{col_name}') THEN
                        ALTER TABLE alerts ADD COLUMN {col_name} {col_type};
                    END IF;
                END $$;
            """)
        # Check if messages table exists
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages')")
        if not cur.fetchone()['exists']:
            cur.execute("""
                CREATE TABLE messages (
                    id SERIAL PRIMARY KEY,
                    sender_id INTEGER REFERENCES users(id),
                    content TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
        
        conn.commit()
        print("--- Migrations Completed Successfully ---")
    except Exception as e:
        print(f"Migration error: {e}")
    finally:
        conn.close()

def init_db():
    print("--- Checking Database Tables ---")
    conn = get_db_connection()
    if not conn:
        print("ERROR: Could not connect to Neon for initialization")
        return
    try:
        cur = conn.cursor()
        cur.execute("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')")
        exists = cur.fetchone()['exists']
        if not exists:
            print("--- Initializing Neon PostgreSQL Database Tables ---")
            schema_path = os.path.join(os.path.dirname(__file__), '../schema.sql')
            if os.path.exists(schema_path):
                with open(schema_path, 'r') as f:
                    cur.execute(f.read())
                conn.commit()
                print("--- Database Tables Created Successfully ---")
            else:
                print(f"ERROR: schema.sql not found at {schema_path}")
        else:
            print("--- Database Tables Already Exist ---")
            migrate_db() # Run migrations if tables already exist
    except Exception as e:
        print(f"Neon PostgreSQL init error: {e}")
    finally:
        conn.close()

# --- JWT Decorator ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        try:
            token = token.split(" ")[1]
            data = jwt.decode(token, app.secret_key, algorithms=["HS256"])
            current_user = execute_query("SELECT * FROM users WHERE id = %s", (data['user_id'],), fetchone=True)
            if not current_user: raise Exception("User not found")
        except Exception as e:
            return jsonify({'message': 'Token is invalid!'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

# --- Routes ---

@app.route('/')
def serve_home():
    return send_from_directory(app.static_folder, 'home.html')

@app.route('/login')
def serve_login():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    
    if not name or not email or not password:
        return jsonify({"error": "Missing fields"}), 400

    hashed_password = generate_password_hash(password)
    
    try:
        execute_query("INSERT INTO users (name, email, password, role) VALUES (%s, %s, %s, 'Staff')",
                    (name, email, hashed_password))
        return jsonify({"message": "Staff registered successfully"}), 201
    except Exception as e:
        return jsonify({"error": "Email already exists"}), 400

@app.route('/api/health')
def health_check():
    try:
        execute_query("SELECT 1")
        return jsonify({"status": "healthy", "database": "connected"}), 200
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    user = execute_query("SELECT * FROM users WHERE email = %s", (email,), fetchone=True)
    
    if user and check_password_hash(user['password'], password):
        token = jwt.encode({
            'user_id': user['id'],
            'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24)
        }, app.secret_key, algorithm="HS256")
        return jsonify({
            "token": token,
            "user": {"id": user['id'], "name": user['name'], "role": user['role']}
        })
    
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/create-alert', methods=['POST'])
@token_required
def create_alert(current_user):
    data = request.json
    alert_type = data.get('type')
    address = data.get('address', 'Unknown Location')
    hotel_name = data.get('hotel_name', 'Not Specified')
    country = data.get('country', '')
    phone_number = data.get('phone_number', '')
    
    if not alert_type:
        return jsonify({"error": "Alert type is required"}), 400
    
    try:
        # Create Alert with Address, Hotel Name, Country, and Phone Number
        res = execute_query("INSERT INTO alerts (user_id, type, status, address, hotel_name, country, phone_number) VALUES (%s, %s, 'Active', %s, %s, %s, %s) RETURNING id",
                          (current_user['id'], alert_type, address, hotel_name, country, phone_number), fetchone=True)
        
        if not res or 'id' not in res:
            raise Exception("Failed to retrieve alert ID from database")
            
        return jsonify({"message": "Alert created successfully", "alert_id": res['id']}), 201
    except Exception as e:
        print(f"ALERT CREATION ERROR: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/get-alerts', methods=['GET'])
@token_required
def get_alerts(current_user):
    status = request.args.get('status', 'Active')
    
    query = """
        SELECT a.id, a.type, a.status, a.timestamp, a.address, a.hotel_name, a.country, a.phone_number, a.admin_reply, a.dispatched_services, u.name as staff_name
        FROM alerts a
        JOIN users u ON a.user_id = u.id
        WHERE a.status = %s
        ORDER BY a.timestamp DESC
    """
    try:
        alerts = execute_query(query, (status,), fetchall=True)
        # Ensure dispatched_services is never None
        for a in alerts:
            if a.get('dispatched_services') is None:
                a['dispatched_services'] = ""
        return jsonify(alerts)
    except Exception as e:
        print(f"GET ALERTS ERROR: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/dispatch-service', methods=['POST'])
@token_required
def dispatch_service(current_user):
    if current_user['role'] != 'Admin':
        return jsonify({"error": "Unauthorized"}), 403
    
    data = request.json
    alert_id = data.get('alert_id')
    service = data.get('service') # e.g. 'Hospital', 'Fire Rescue', 'Security'
    
    if not alert_id or not service:
        return jsonify({"error": "Missing alert_id or service"}), 400
        
    # Append service to existing list
    alert = execute_query("SELECT dispatched_services FROM alerts WHERE id = %s", (alert_id,), fetchone=True)
    current_services = alert['dispatched_services'] if alert['dispatched_services'] else ""
    
    if service not in current_services:
        new_services = f"{current_services}, {service}".strip(", ")
        execute_query("UPDATE alerts SET dispatched_services = %s WHERE id = %s", (new_services, alert_id))
    
    return jsonify({"message": f"{service} dispatched successfully"})

@app.route('/api/resolve-alert', methods=['POST'])
@token_required
def resolve_alert(current_user):
    if current_user['role'] != 'Admin':
        return jsonify({"error": "Unauthorized"}), 403
    data = request.json
    alert_id = data.get('alert_id')
    if not alert_id:
        return jsonify({"error": "Missing alert_id"}), 400
        
    execute_query("UPDATE alerts SET status = 'Resolved' WHERE id = %s", (alert_id,))
    return jsonify({"message": "Alert resolved"})

@app.route('/api/admin-reply', methods=['POST'])
@token_required
def admin_reply(current_user):
    if current_user['role'] != 'Admin':
        return jsonify({"error": "Unauthorized"}), 403
    data = request.json
    alert_id = data.get('alert_id')
    reply = data.get('reply', '').strip()
    print(f"[DEBUG admin-reply] user_id={current_user['id']} role={current_user['role']} alert_id={alert_id} reply_len={len(reply)}")
    if not alert_id or not reply:
        print("[DEBUG admin-reply] validation_failed missing alert_id or reply")
        return jsonify({"error": "Missing alert_id or reply"}), 400
    
    execute_query("UPDATE alerts SET admin_reply = %s WHERE id = %s", (reply, alert_id))
    print(f"[DEBUG admin-reply] alert_updated alert_id={alert_id}")
    
    # Also post to secure message channel so staff see it in messages tab
    alert = execute_query("SELECT hotel_name, type FROM alerts WHERE id = %s", (alert_id,), fetchone=True)
    if alert:
        msg = f"[Admin Reply for {alert['type']} alert at {alert['hotel_name']}]: {reply}"
        execute_query("INSERT INTO messages (sender_id, content) VALUES (%s, %s)",
                      (current_user['id'], msg))
        print(f"[DEBUG admin-reply] message_inserted alert_id={alert_id}")
    
    return jsonify({"message": "Reply sent to staff"})

@app.route('/api/get-alert-reply', methods=['GET'])
@token_required
def get_alert_reply(current_user):
    alert_id = request.args.get('alert_id')
    print(f"[DEBUG get-alert-reply] user_id={current_user['id']} role={current_user['role']} alert_id={alert_id}")
    if not alert_id:
        print("[DEBUG get-alert-reply] validation_failed missing alert_id")
        return jsonify({"error": "Missing alert_id"}), 400
    alert = execute_query(
        "SELECT id, admin_reply, status, dispatched_services FROM alerts WHERE id = %s AND user_id = %s",
        (alert_id, current_user['id']),
        fetchone=True
    )
    if not alert:
        print(f"[DEBUG get-alert-reply] not_found_or_not_owned alert_id={alert_id} user_id={current_user['id']}")
        return jsonify({"error": "Alert not found"}), 404
    print(
        f"[DEBUG get-alert-reply] ok alert_id={alert['id']} "
        f"status={alert.get('status')} reply_len={len((alert.get('admin_reply') or ''))} "
        f"dispatched='{alert.get('dispatched_services') or ''}'"
    )
    return jsonify({
        "alert_id": alert['id'],
        "admin_reply": alert.get('admin_reply') or '',
        "status": alert.get('status') or 'Active',
        "dispatched_services": alert.get('dispatched_services') or ''
    })

@app.route('/api/my-latest-alert', methods=['GET'])
@token_required
def my_latest_alert(current_user):
    print(f"[DEBUG my-latest-alert] user_id={current_user['id']} role={current_user['role']}")
    alert = execute_query("""
        SELECT id, type, status, timestamp, address, hotel_name, admin_reply, dispatched_services
        FROM alerts
        WHERE user_id = %s
        ORDER BY timestamp DESC
        LIMIT 1
    """, (current_user['id'],), fetchone=True)

    if not alert:
        print(f"[DEBUG my-latest-alert] no_alert_found user_id={current_user['id']}")
        return jsonify({"alert": None})

    alert['admin_reply'] = alert.get('admin_reply') or ''
    alert['dispatched_services'] = alert.get('dispatched_services') or ''
    print(
        f"[DEBUG my-latest-alert] ok alert_id={alert['id']} status={alert.get('status')} "
        f"reply_len={len(alert['admin_reply'])} dispatched='{alert['dispatched_services']}'"
    )
    return jsonify({"alert": alert})

@app.route('/api/send-message', methods=['POST'])
@token_required
def send_message(current_user):
    data = request.json
    content = data.get('content')
    if not content:
        return jsonify({"error": "Content required"}), 400
    
    execute_query("INSERT INTO messages (sender_id, content) VALUES (%s, %s)",
                  (current_user['id'], content))
    return jsonify({"message": "Message sent"})

@app.route('/api/get-messages', methods=['GET'])
@token_required
def get_messages(current_user):
    query = """
        SELECT m.*, u.name as sender_name, u.role as sender_role
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        ORDER BY m.created_at DESC
        LIMIT 50
    """
    messages = execute_query(query, fetchall=True)
    return jsonify(messages)

def seed_admin():
    try:
        admin = execute_query("SELECT * FROM users WHERE email = 'admin@hotel.com'", fetchone=True)
        if not admin:
            hashed_password = generate_password_hash('admin123')
            execute_query("INSERT INTO users (name, email, password, role) VALUES (%s, %s, %s, 'Admin')",
                        ('Master Admin', 'admin@hotel.com', hashed_password))
            print("--- Admin User Seeded (admin@hotel.com / admin123) ---")
        elif admin['role'] != 'Admin':
            execute_query("UPDATE users SET role = 'Admin' WHERE email = 'admin@hotel.com'")
            print("--- Admin User Role Corrected to 'Admin' ---")
    except Exception as e:
        print(f"Seeding error: {e}")

def bootstrap_app():
    """Ensure DB schema/admin setup runs for all server entrypoints."""
    init_db()
    seed_admin()

bootstrap_app()

if __name__ == '__main__':
    print("--- Rapid Crisis Backend Started on Port 5000 ---")
    app.run(port=5000, debug=True)
