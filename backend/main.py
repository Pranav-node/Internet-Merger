"""Main Server and Desktop Application Launcher for Internet Merger.

Starts the single-process local server bound strictly to 127.0.0.1, automatically
allocates an available local port, opens the default web browser to the dashboard
with the per-session security token, and serves both the API and the static web UI.
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import webbrowser

# Configure UTF-8 for console output on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure project root is in sys.path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.core.paths import get_default_downloads_dir, get_user_data_dir, is_frozen
from backend.core.security import get_session_token, set_session_token


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a network port is already bound."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def find_available_port(start_port: int, host: str = "127.0.0.1", max_attempts: int = 25) -> int:
    """Find next available free port if starting port is in use."""
    port = start_port
    for _ in range(max_attempts):
        if not is_port_in_use(port, host):
            return port
        port += 1
    return start_port


def wait_and_open_browser(url: str, host: str, port: int, timeout: float = 12.0) -> None:
    """Poll for server socket readiness and trigger default browser once responsive."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.5)
                if s.connect_ex((host, port)) == 0:
                    time.sleep(0.4)
                    print(f"\n[Browser] Server active on port {port}. Opening default browser to {url} ...")
                    webbrowser.open(url)
                    return
        except Exception:
            pass
        time.sleep(0.25)


def main():
    parser = argparse.ArgumentParser(description="Internet Merger Desktop Server & Launcher")
    parser.add_argument("--host", default="127.0.0.1", help="Host interface (default: 127.0.0.1 only)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically launch web browser")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")

    args = parser.parse_args()

    # Enforce local loopback binding for security
    if args.host not in ("127.0.0.1", "localhost"):
        print(f"[SECURITY ERROR] Refusing to bind to non-local interface: '{args.host}'.")
        print("Internet Merger is designed strictly for local loopback (127.0.0.1).")
        sys.exit(1)

    # 1. Allocate free port
    port = args.port
    if is_port_in_use(port, args.host):
        free_port = find_available_port(port + 1, args.host)
        print(f"[INFO] Port {port} is already in use; automatically selected free port {free_port}.")
        port = free_port

    # 2. Get per-session security token
    token = get_session_token()

    target_url = f"http://{args.host}:{port}"
    browser_url = f"{target_url}/#token={token}"
    user_data_path = get_user_data_dir()
    default_downloads = get_default_downloads_dir()

    # 3. Print startup banner
    banner = f"""
===========================================================================
  [*] INTERNET MERGER - MULTI-LINK PARALLEL DOWNLOAD ACCELERATOR
===========================================================================
  Status:           ONLINE & READY (SINGLE PROCESS)
  Dashboard UI:     {browser_url}
  REST API:         {target_url}/api
  API Documentation:{target_url}/docs
  WebSocket Feed:   ws://{args.host}:{port}/ws?token={token}
  User Data Folder: {user_data_path}
  Downloads Folder: {default_downloads}
===========================================================================
  Security Active:  DNS Rebinding Guard | Session Auth Token | Origin Check
===========================================================================
  Press Ctrl+C in this terminal at any time to cleanly stop the server.
===========================================================================
"""
    print(banner)

    # 4. Launch browser in background once server is responsive
    if not args.no_browser:
        threading.Thread(
            target=wait_and_open_browser,
            args=(browser_url, args.host, port),
            daemon=True,
        ).start()

    # 5. Start Uvicorn Server
    import uvicorn
    from backend.api.app import app

    try:
        if args.reload and not is_frozen():
            uvicorn.run(
                "backend.api.app:app",
                host=args.host,
                port=port,
                reload=True,
                log_level="info",
            )
        else:
            uvicorn.run(
                app,
                host=args.host,
                port=port,
                log_level="info",
            )
    except KeyboardInterrupt:
        print("\n[Shutdown] Internet Merger stopped cleanly. Goodbye!")


if __name__ == "__main__":
    main()
