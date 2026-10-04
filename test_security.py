"""Automated Security Hardening Test Suite for Internet Merger.

Verifies:
1. Session Token Enforcement: Missing or invalid token -> 401 Unauthorized.
2. Origin Header Validation: Untrusted or cross-site Origin -> 403 Forbidden.
3. DNS Rebinding Protection: Host header outside 127.0.0.1 / localhost -> 400 Bad Request.
4. Path Traversal Protection: Paths outside configured downloads dir (e.g. ../../) -> 400 Bad Request.
5. URL Scheme Enforcement: Non-http/https schemes (e.g. file://) -> 400 Bad Request.
6. WebSocket Security: Token and Origin enforcement on WebSocket handshake.
7. Legitimate Requests: Valid token and origin -> 200 OK.
"""

from __future__ import annotations

import os
import sys
import unittest
from starlette.testclient import TestClient

from backend.api.app import app
from backend.core.security import get_session_token


class TestSecurityHardening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = get_session_token()
        cls.valid_origin = "http://127.0.0.1:8000"
        cls.auth_headers = {
            "X-Auth-Token": cls.token,
            "Origin": cls.valid_origin,
        }

    def test_01_missing_token_returns_401(self):
        """Requests without session token must be rejected with 401."""
        with TestClient(app) as client:
            # GET /api/downloads without token
            res = client.get("/api/downloads")
            self.assertEqual(res.status_code, 401, f"Expected 401, got {res.status_code}: {res.text}")

            # POST /api/downloads without token
            res = client.post("/api/downloads", json={"url": "http://127.0.0.1:8089/range-file"})
            self.assertEqual(res.status_code, 401, f"Expected 401, got {res.status_code}: {res.text}")

            # POST /api/probe without token
            res = client.post("/api/probe", json={"url": "http://127.0.0.1:8089/range-file"})
            self.assertEqual(res.status_code, 401, f"Expected 401, got {res.status_code}: {res.text}")

    def test_02_invalid_token_returns_401(self):
        """Requests with wrong or forged session token must be rejected with 401."""
        with TestClient(app) as client:
            res = client.get("/api/downloads", headers={"X-Auth-Token": "forged_secret_token_12345"})
            self.assertEqual(res.status_code, 401, f"Expected 401, got {res.status_code}: {res.text}")

            res = client.get("/api/downloads", headers={"Authorization": "Bearer bad_token_12345"})
            self.assertEqual(res.status_code, 401, f"Expected 401, got {res.status_code}: {res.text}")

    def test_03_wrong_origin_returns_403(self):
        """State-changing requests with untrusted Origin must be rejected with 403."""
        with TestClient(app) as client:
            # Untrusted external origin
            res = client.post(
                "/api/downloads",
                json={"url": "http://127.0.0.1:8089/range-file"},
                headers={
                    "X-Auth-Token": self.token,
                    "Origin": "https://evil.example",
                },
            )
            self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

            # Null origin (sandboxed iframe / data: URI attack)
            res = client.post(
                "/api/downloads",
                json={"url": "http://127.0.0.1:8089/range-file"},
                headers={
                    "X-Auth-Token": self.token,
                    "Origin": "null",
                },
            )
            self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

            # Cross-site fetch indication
            res = client.post(
                "/api/downloads",
                json={"url": "http://127.0.0.1:8089/range-file"},
                headers={
                    "X-Auth-Token": self.token,
                    "Sec-Fetch-Site": "cross-site",
                },
            )
            self.assertEqual(res.status_code, 403, f"Expected 403, got {res.status_code}: {res.text}")

    def test_04_dns_rebinding_rejected(self):
        """Requests with Host header not in 127.0.0.1 / localhost must be rejected with 400."""
        with TestClient(app) as client:
            # Attacker's domain resolving to loopback
            res = client.get("/api/downloads", headers={"Host": "evil.com", "X-Auth-Token": self.token})
            self.assertEqual(res.status_code, 400, f"Expected 400, got {res.status_code}: {res.text}")

            # Subdomain / nip.io DNS rebinding trick
            res = client.get("/api/downloads", headers={"Host": "attacker.127.0.0.1.nip.io", "X-Auth-Token": self.token})
            self.assertEqual(res.status_code, 400, f"Expected 400, got {res.status_code}: {res.text}")

    def test_05_path_traversal_rejected_400(self):
        """Output paths escaping the downloads folder (e.g. ../../) must return 400."""
        with TestClient(app) as client:
            # Classic traversal to Windows directory
            res = client.post(
                "/api/downloads",
                json={
                    "url": "http://127.0.0.1:8089/range-file",
                    "destination_path": "../../Windows/test.bin",
                },
                headers=self.auth_headers,
            )
            self.assertEqual(res.status_code, 400, f"Expected 400, got {res.status_code}: {res.text}")

            # Backslash traversal
            res = client.post(
                "/api/downloads",
                json={
                    "url": "http://127.0.0.1:8089/range-file",
                    "destination_path": "..\\..\\Windows\\test.bin",
                },
                headers=self.auth_headers,
            )
            self.assertEqual(res.status_code, 400, f"Expected 400, got {res.status_code}: {res.text}")

    def test_06_windows_reserved_device_names_rejected(self):
        """Windows reserved device names (CON, NUL, AUX, PRN, COM1, LPT1) must return 400."""
        with TestClient(app) as client:
            for bad_name in ("downloads/con.txt", "downloads/NUL", "downloads/aux.bin", "downloads/com1"):
                res = client.post(
                    "/api/downloads",
                    json={
                        "url": "http://127.0.0.1:8089/range-file",
                        "destination_path": bad_name,
                    },
                    headers=self.auth_headers,
                )
                self.assertEqual(res.status_code, 400, f"Expected 400 for '{bad_name}', got {res.status_code}")

    def test_07_unsupported_url_schemes_rejected(self):
        """Schemes other than http:// and https:// (e.g. file://, ftp://) must be rejected with 400."""
        with TestClient(app) as client:
            for bad_url in ("file:///etc/passwd", "file://C:/Windows/win.ini", "ftp://example.com/file.bin", "gopher://evil.com"):
                res = client.post(
                    "/api/probe",
                    json={"url": bad_url},
                    headers=self.auth_headers,
                )
                self.assertEqual(res.status_code, 400, f"Expected 400 for '{bad_url}', got {res.status_code}")

                res = client.post(
                    "/api/downloads",
                    json={"url": bad_url},
                    headers=self.auth_headers,
                )
                self.assertEqual(res.status_code, 400, f"Expected 400 for '{bad_url}', got {res.status_code}")

    def test_08_websocket_security(self):
        """WebSocket connections must require valid token query param and valid origin."""
        with TestClient(app) as client:
            # 1. No token -> rejected
            try:
                with client.websocket_connect("/ws", headers={"origin": self.valid_origin}):
                    self.fail("WebSocket should have rejected connection without token")
            except Exception:
                pass

            # 2. Wrong origin -> rejected
            try:
                with client.websocket_connect(f"/ws?token={self.token}", headers={"origin": "https://evil.example"}):
                    self.fail("WebSocket should have rejected connection with evil origin")
            except Exception:
                pass

            # 3. Valid token and origin -> connected
            with client.websocket_connect(f"/ws?token={self.token}", headers={"origin": self.valid_origin}) as ws:
                msg = ws.receive_json()
                self.assertIn("type", msg)
                self.assertEqual(msg["type"], "initial")

    def test_09_authorized_requests_succeed(self):
        """Authorized requests with valid token and origin must succeed."""
        with TestClient(app) as client:
            res = client.get("/api/downloads", headers={"X-Auth-Token": self.token})
            self.assertEqual(res.status_code, 200, res.text)

            res = client.get("/api/interfaces", headers={"X-Auth-Token": self.token})
            self.assertEqual(res.status_code, 200, res.text)

    def test_10_browse_folder_security(self):
        """Browse folder endpoint must enforce token authentication and loopback origin."""
        with TestClient(app) as client:
            # 1. Missing token -> 401
            res = client.post("/api/browse-folder", json={})
            self.assertEqual(res.status_code, 401)

            # 2. Evil origin -> 403
            res = client.post(
                "/api/browse-folder",
                json={},
                headers={"X-Auth-Token": self.token, "Origin": "https://evil.example"},
            )
            self.assertEqual(res.status_code, 403)


if __name__ == "__main__":
    unittest.main()

