import os
import sys

# FOOLPROOF HACK: Force install requirements before starting
# This bypasses Render if the Build Command is misconfigured
os.system(f"{sys.executable} -m pip install -r requirements.txt --break-system-packages")

try:
    from waitress import serve
except ImportError:
    os.system(f"{sys.executable} -m pip install waitress --break-system-packages")
    from waitress import serve
from backend.app import app

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting production server on port {port}...")
    serve(app, host='0.0.0.0', port=port)
