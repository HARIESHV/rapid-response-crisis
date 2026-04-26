import os
import sys
import glob

# FOOLPROOF HACK: Force install requirements before starting
os.system(f"{sys.executable} -m pip install -r requirements.txt --break-system-packages")

# HACK 2: Ensure the user site-packages is in sys.path so python can find the installed packages
local_paths = glob.glob(os.path.expanduser("~/.local/lib/python*/site-packages"))
sys.path.extend(local_paths)

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
