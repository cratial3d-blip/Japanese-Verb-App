#!/usr/bin/env python3
"""
Local static file server with better MIME types than `python -m http.server`.

This fixes font loading in some browsers (e.g. .woff2 served as octet-stream).
Run from repo root:
  python scripts/serve.py 8000
"""

from __future__ import annotations

import mimetypes
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def main() -> int:
    port = 8000
    if len(sys.argv) > 1:
        port = int(sys.argv[1])

    # Ensure common web/font types are served with correct Content-Type.
    mimetypes.add_type("text/css", ".css")
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("application/json", ".json")
    mimetypes.add_type("text/plain", ".jsonl")
    mimetypes.add_type("image/svg+xml", ".svg")
    mimetypes.add_type("font/woff2", ".woff2")
    mimetypes.add_type("font/woff", ".woff")
    mimetypes.add_type("font/ttf", ".ttf")
    mimetypes.add_type("font/otf", ".otf")

    handler = SimpleHTTPRequestHandler
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Serving on http://127.0.0.1:{port} (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())

