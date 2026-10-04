"""WebSocket Broadcaster for Real-Time UI Updates.

Pushes download metrics, per-link speeds, and status changes every second.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, List, Set

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("internet_merger.ws")


class WebSocketBroadcaster:
    """Manages connected WebSocket clients and broadcasts state updates."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        """Accept new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove disconnected client."""
        async with self._lock:
            self.active_connections.discard(websocket)

    async def broadcast_json(self, data: dict) -> None:
        """Broadcast JSON payload to all active clients."""
        if not self.active_connections:
            return

        message = json.dumps(data)
        stale_clients = []

        async with self._lock:
            for ws in list(self.active_connections):
                try:
                    await ws.send_text(message)
                except Exception:
                    stale_clients.append(ws)

            for ws in stale_clients:
                self.active_connections.discard(ws)


broadcaster = WebSocketBroadcaster()
