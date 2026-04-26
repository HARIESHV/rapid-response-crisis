import http.server
import socketserver
import os

PORT = 8000

os.chdir(os.path.join(os.path.dirname(__file__), 'frontend'))

Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Frontend running at http://localhost:{PORT}")
    print("Open http://localhost:8000/index.html in your browser")
    httpd.serve_forever()
