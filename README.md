# 🚨 Rapid Crisis Response System

A modern, responsive emergency escalation system for hotels with real-time location tracking and admin command center.

## 🌟 Key Features
- **🔴 One-Click Emergency**: Staff can trigger Fire, Medical, or Security alerts.
- **📍 Live Tracking**: Automatic background location sharing once an alert is active.
- **📊 Admin Command Center**: Real-time dashboard with sound notifications and Google Maps integration.
- **🔐 Secure Auth**: Role-based access with JWT.
- **💎 Premium Design**: Glassmorphism UI, smooth animations, and dark mode aesthetics.

## 🛠️ Setup Instructions

### 1. Database (Neon PostgreSQL)
1. Create a project at [Neon.tech](https://neon.tech/).
2. Open the **SQL Editor** and run the contents of `schema.sql`.
3. Copy your **Connection String**.

### 2. Backend Configuration
1. Open `backend/app.py`.
2. Replace `NEON_URL` with your connection string:
   ```python
   NEON_URL = "postgres://user:password@host/dbname?sslmode=require"
   ```

### 3. Google Maps Integration
1. Open `frontend/admin.html`.
2. Replace `YOUR_GOOGLE_MAPS_API_KEY` in the script tag with your actual API key.

### 4. Installation & Running
```bash
# Install dependencies
pip install flask flask-cors psycopg2-binary pyjwt werkzeug

# Run the system
cd backend
python app.py
```
Access the application at: **http://localhost:5000**

## 🔐 Default Credentials
- **Admin**: `admin@hotel.com` / `admin123`
- **Staff**: Register your own account on the login page.

## 🧩 Tech Stack
- **Frontend**: HTML5, Tailwind CSS, JavaScript (Vanilla), Google Maps API.
- **Backend**: Python (Flask), JWT for Auth.
- **Database**: Neon PostgreSQL.

---
*Created for Rapid Crisis Response System.*
