import os
from waitress import serve
from backend.app import app

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting production server on port {port}...")
    serve(app, host='0.0.0.0', port=port)
