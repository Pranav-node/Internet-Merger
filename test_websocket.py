"""Test WebSocket communication using Starlette TestClient with security hardening."""

import json
from starlette.testclient import TestClient
from backend.api.app import app
from backend.core.security import get_session_token


def test_ws():
    token = get_session_token()
    with TestClient(app) as client:
        # 1. Test unauthorized connection (no token) -> should fail
        try:
            with client.websocket_connect("/ws", headers={"origin": "http://127.0.0.1:8000"}):
                assert False, "Expected rejection without token"
        except Exception:
            pass

        # 2. Test untrusted origin -> should fail
        try:
            with client.websocket_connect(f"/ws?token={token}", headers={"origin": "https://evil.example"}):
                assert False, "Expected rejection with untrusted origin"
        except Exception:
            pass

        # 3. Valid authorized connection
        with client.websocket_connect(f"/ws?token={token}", headers={"origin": "http://127.0.0.1:8000"}) as websocket:
            data = websocket.receive_json()
            print("Received initial WS message:", data.get("type"))
            assert data["type"] == "initial"
            assert "downloads" in data

            # Send ping
            websocket.send_text("ping")
            resp = websocket.receive_text()
            print("Ping response:", resp)
            assert resp == "pong"

    print("WEBSOCKET SECURITY & MESSAGING TESTS PASSED!")


if __name__ == "__main__":
    test_ws()

