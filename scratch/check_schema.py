import sqlite3
conn = sqlite3.connect('backend/crisis.db')
cur = conn.cursor()
cur.execute("PRAGMA table_info(alerts)")
columns = cur.fetchall()
for col in columns:
    print(col)
conn.close()
