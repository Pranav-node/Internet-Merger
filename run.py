"""Internet Merger — One-Click Application Launcher (run.py)

Running this script alone will completely set up and make the project live:
1. Validates Python environment (>= 3.10).
2. Verifies and automatically installs any missing dependencies.
3. Ensures frontend static bundle exists (builds via Vite if missing).
4. Ensures output directories exist.
5. Launches the backend server (FastAPI + Uvicorn) bound to 127.0.0.1.
6. Automatically opens the Web UI in your default browser.
7. Handles clean shutdown on Ctrl+C.
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser

# Configure UTF-8 for console output on Windows if needed
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure project root is in Python path
ROOT_DIR = os.path.abspath(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

REQUIRED_PACKAGES = {
    "fastapi": "fastapi>=0.110.0",
    "uvicorn": "uvicorn[standard]>=0.28.0",
    "aiohttp": "aiohttp>=3.9.0",
    "psutil": "psutil>=5.9.0",
    "pydantic": "pydantic>=2.6.0",
    "websockets": "websockets>=12.0",
}


def check_python_version() -> None:
    """Ensure Python is 3.10 or newer."""
    if sys.version_info < (3, 10):
        print(f"[ERROR] Internet Merger requires Python 3.10+, but you are running {sys.version}.")
        sys.exit(1)


def check_and_install_dependencies() -> None:
    """Verify backend python dependencies and auto-install if missing."""
    missing = []
    for module_name, pip_spec in REQUIRED_PACKAGES.items():
        try:
            __import__(module_name)
        except ImportError:
            missing.append(pip_spec)

    if missing:
        print("=" * 65)
        print("  Missing Python dependencies detected:")
        for pkg in missing:
            print(f"    - {pkg}")
        print("  Installing missing packages now via pip...")
        print("=" * 65)
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
            print("[OK] Dependencies installed successfully.\n")
        except subprocess.CalledProcessError as e:
            print(f"[ERROR] Failed to install dependencies: {e}")
            print("Please run manually: python -m pip install -r requirements.txt")
            sys.exit(1)


def check_frontend(force_build: bool = False) -> None:
    """Ensure frontend build exists in frontend/dist. If missing or forced, build it."""
    frontend_dir = os.path.join(ROOT_DIR, "frontend")
    dist_dir = os.path.join(frontend_dir, "dist")
    index_file = os.path.join(dist_dir, "index.html")

    if not force_build and os.path.isfile(index_file):
        return

    print("=" * 65)
    print("  Production frontend build not found. Building now...")
    print("=" * 65)

    npm_cmd = shutil.which("npm.cmd") if sys.platform == "win32" else shutil.which("npm")
    if not npm_cmd:
        print("[WARNING] 'npm' was not found in PATH.")
        if os.path.isfile(index_file):
            print("Using existing frontend distribution files.")
            return
        print("[ERROR] Cannot build frontend without Node.js/npm.")
        print("Please install Node.js 18+ or run frontend development mode.")
        sys.exit(1)

    try:
        # Check node_modules
        node_modules = os.path.join(frontend_dir, "node_modules")
        if not os.path.isdir(node_modules):
            print("Running 'npm install' in frontend directory...")
            subprocess.check_call([npm_cmd, "install"], cwd=frontend_dir)

        print("Running 'npm run build'...")
        subprocess.check_call([npm_cmd, "run", "build"], cwd=frontend_dir)
        print("[OK] Frontend built successfully!\n")
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Frontend build failed: {e}")
        if not os.path.isfile(index_file):
            sys.exit(1)


def ensure_directories() -> None:
    """Create runtime directories if they don't exist."""
    downloads_dir = os.path.join(ROOT_DIR, "downloads")
    os.makedirs(downloads_dir, exist_ok=True)


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a network port is already bound."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def find_available_port(start_port: int, host: str = "127.0.0.1", max_attempts: int = 20) -> int:
    """Find next available port if starting port is occupied."""
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
                    # Give the event loop a brief fraction of a second to register the route handlers
                    time.sleep(0.4)
                    print(f"\n[Browser] Server is ready! Launching default browser to {url} ...")
                    webbrowser.open(url)
                    return
        except Exception:
            pass
        time.sleep(0.25)


def run_dev_mode(port: int, host: str, token: str, open_browser_flag: bool) -> None:
    """Start backend with reload and Vite dev server concurrently."""
    print("=" * 65)
    print("  STARTING IN FULL DEVELOPMENT MODE (BACKEND + VITE DEV SERVER)")
    print("=" * 65)
    os.environ["INTERNET_MERGER_DEV_MODE"] = "1"
    frontend_dir = os.path.join(ROOT_DIR, "frontend")
    npm_cmd = shutil.which("npm.cmd") if sys.platform == "win32" else shutil.which("npm")
    if not npm_cmd:
        print("[ERROR] 'npm' is required for dev mode but was not found.")
        sys.exit(1)

    vite_proc = None
    try:
        # Start Vite dev server
        print("[Vite] Starting frontend dev server (npm run dev)...")
        vite_proc = subprocess.Popen([npm_cmd, "run", "dev"], cwd=frontend_dir)

        if open_browser_flag:
            dev_browser_url = f"http://localhost:5173/#token={token}"
            threading.Thread(
                target=wait_and_open_browser,
                args=(dev_browser_url, "localhost", 5173),
                daemon=True,
            ).start()

        # Start backend
        import uvicorn
        print(f"[Backend] Starting Uvicorn with auto-reload on http://{host}:{port} ...")
        uvicorn.run("backend.api.app:app", host=host, port=port, reload=True)
    except KeyboardInterrupt:
        print("\n[Shutdown] Shutting down development servers...")
    finally:
        if vite_proc and vite_proc.poll() is None:
            vite_proc.terminate()
            vite_proc.wait()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Internet Merger — One-Click Runner (makes project live instantly)"
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically launch web browser")
    parser.add_argument("--dev", action="store_true", help="Run with Vite dev server and auto-reload")
    parser.add_argument("--build", action="store_true", help="Force rebuild frontend assets before running")
    parser.add_argument("--reload", action="store_true", help="Enable backend auto-reload")

    args = parser.parse_args()

    # Enforce loopback binding
    if args.host not in ("127.0.0.1", "localhost"):
        print(f"[ERROR] Security restriction: host must be 127.0.0.1 or localhost (got '{args.host}').")
        sys.exit(1)

    # 1. Environment verification
    check_python_version()
    check_and_install_dependencies()
    ensure_directories()

    # 2. Generate per-session token for authentication
    import secrets
    from backend.core.security import set_session_token
    session_token = secrets.token_urlsafe(32)
    os.environ["INTERNET_MERGER_SESSION_TOKEN"] = session_token
    set_session_token(session_token)

    # 3. Check frontend distribution
    if not args.dev:
        check_frontend(force_build=args.build)

    # 4. Port check
    port = args.port
    if is_port_in_use(port, args.host):
        alt_port = find_available_port(port + 1, args.host)
        print(f"[WARNING] Port {port} is already in use!")
        print(f"          Automatically switching to port {alt_port}.")
        port = alt_port

    target_url = f"http://{args.host}:{port}"
    browser_launch_url = f"{target_url}/#token={session_token}"

    # Dev mode branch
    if args.dev:
        run_dev_mode(port=port, host=args.host, token=session_token, open_browser_flag=not args.no_browser)
        return

    # 5. Print Welcome & Status Banner
    banner = f"""
===========================================================================
  [*] INTERNET MERGER - MULTI-LINK PARALLEL DOWNLOAD ACCELERATOR
===========================================================================
  Status:           ONLINE & READY (SECURITY HARDENED)
  Dashboard UI:     {browser_launch_url}
  REST API:         {target_url}/api
  API Documentation:{target_url}/docs
  WebSocket Feed:   ws://{args.host}:{port}/ws?token={session_token}
  Downloads Folder: {os.path.join(ROOT_DIR, "downloads")}
===========================================================================
  Security Active:  DNS Rebinding Guard | Session Auth Token | Origin Check
===========================================================================
  Press Ctrl+C in this terminal at any time to cleanly stop the server.
===========================================================================
"""
    print(banner)

    # 6. Launch background browser opener with session token in fragment
    if not args.no_browser:
        threading.Thread(
            target=wait_and_open_browser,
            args=(browser_launch_url, args.host, port),
            daemon=True,
        ).start()

    # 6. Start Uvicorn Server
    import uvicorn

    try:
        uvicorn.run(
            "backend.api.app:app",
            host=args.host,
            port=port,
            reload=args.reload,
            log_level="info",
        )
    except KeyboardInterrupt:
        print("\n[Shutdown] Internet Merger server stopped gracefully. Goodbye!")


if __name__ == "__main__":
    main()
