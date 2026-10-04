"""FastAPI Application Entry for Internet Merger.

Binds strictly to 127.0.0.1, mounts REST routes, WebSocket broadcaster,
and serves static web UI frontend.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from typing import Optional

from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import JSONResponse
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect

from backend.api import routes
from backend.api.routes import router as api_router
from backend.api.websocket import broadcaster
from backend.core.manager import DownloadManager
from backend.core.paths import get_default_downloads_dir, get_frontend_dist_dir
from backend.core.security import (
    get_session_token,
    is_valid_origin,
    verify_token,
)

# Global background broadcaster task
_broadcast_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: start manager, recovery scan, and broadcast loop."""
    # 1. Initialize DownloadManager in user data directory
    default_dir = get_default_downloads_dir()
    manager = DownloadManager(default_download_dir=default_dir)
    manager.scan_for_resumable_downloads()
    routes.download_manager = manager


    # 2. Start WebSocket broadcast ticker (fires every 1 second)
    global _broadcast_task

    async def broadcast_loop():
        while True:
            try:
                downloads = manager.get_all_downloads()
                await broadcaster.broadcast_json({"type": "progress", "downloads": downloads})
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(1.0)

    _broadcast_task = asyncio.create_task(broadcast_loop())

    yield

    # Clean shutdown
    if _broadcast_task:
        _broadcast_task.cancel()

    # Cancel active downloads safely
    for task in manager.tasks.values():
        if task.status in ("probing", "downloading"):
            await task.cancel()


from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def create_app() -> FastAPI:
    app = FastAPI(
        title="Internet Merger API",
        description="Local multi-connection download aggregator and speed booster",
        version="1.0.0",
        lifespan=lifespan,
    )

    # 1. DNS Rebinding Protection: Accept only 127.0.0.1, localhost, and testserver
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["127.0.0.1", "localhost", "testserver"],
    )

    # 2. CORS Policy: No wildcard CORS. Production is strictly same-origin.
    # Dev mode only permits Vite dev server on port 5173.
    if os.environ.get("INTERNET_MERGER_DEV_MODE") == "1":
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    # 3. Security Hardening Middleware: Session Token & Origin Verification
    @app.middleware("http")
    async def security_middleware(request: Request, call_next):
        path = request.url.path

        # Static assets, UI routes, and documentation do not require a session token
        if not path.startswith("/api"):
            return await call_next(request)

        # A. For state-changing calls, enforce Origin matches the app's own origin
        if request.method in ("POST", "PUT", "DELETE", "PATCH"):
            origin = request.headers.get("origin")
            if origin:
                if not is_valid_origin(origin):
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "Forbidden: Invalid or untrusted Origin"},
                    )
            sec_fetch_site = request.headers.get("sec-fetch-site")
            if sec_fetch_site == "cross-site":
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Forbidden: Cross-site request rejected"},
                )

        # B. Require valid per-session token for all REST endpoints
        token = request.headers.get("X-Auth-Token")
        if not token and "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()

        if not verify_token(token):
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized: Missing or invalid session token"},
            )

        return await call_next(request)

    # Include REST router
    app.include_router(api_router)

    # WebSocket endpoint with Origin and Token verification
    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        # 1. Require Origin to match app origin
        origin = websocket.headers.get("origin")
        if origin and not is_valid_origin(origin):
            await websocket.close(code=1008, reason="Forbidden: Untrusted Origin")
            return

        # 2. Require valid session token as query parameter
        token = websocket.query_params.get("token")
        if not verify_token(token):
            await websocket.close(code=1008, reason="Unauthorized: Missing or invalid token")
            return

        await broadcaster.connect(websocket)
        try:
            # Send immediate snapshot on connect
            if routes.download_manager:
                downloads = routes.download_manager.get_all_downloads()
                await websocket.send_json({"type": "initial", "downloads": downloads})

            while True:
                # Keep socket alive and accept ping/pong or client messages
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            await broadcaster.disconnect(websocket)
        except Exception:
            await broadcaster.disconnect(websocket)

    # Mount frontend static distribution if built
    frontend_dist = get_frontend_dist_dir()
    if os.path.exists(frontend_dist):
        app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            file_path = os.path.join(frontend_dist, full_path)
            if full_path and os.path.isfile(file_path):
                return FileResponse(file_path)
            return FileResponse(os.path.join(frontend_dist, "index.html"))

    return app


app = create_app()
