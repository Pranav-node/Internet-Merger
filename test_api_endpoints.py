"""Integration tests for FastAPI REST endpoints."""

import time
from starlette.testclient import TestClient
from backend.api.app import app
from backend.core.security import get_session_token

def test_api():
    token = get_session_token()
    headers = {
        "X-Auth-Token": token,
        "Origin": "http://127.0.0.1:8000",
    }
    with TestClient(app) as client:
        # 1. System info
        res = client.get("/api/system/info", headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        print("System Info:", data)
        assert "os" in data
        assert "default_download_dir" in data

        # 2. Interfaces
        res = client.get("/api/interfaces", headers=headers)
        assert res.status_code == 200, res.text
        ifaces = res.json().get("interfaces", [])
        print(f"Detected {len(ifaces)} interfaces via API")
        assert len(ifaces) > 0

        # 3. List downloads (empty or initial)
        res = client.get("/api/downloads", headers=headers)
        assert res.status_code == 200
        dl_list = res.json().get("downloads", [])
        print("Initial downloads count:", len(dl_list))

        # 4. Security rejection check on unauthorized call
        no_auth_res = client.get("/api/downloads")
        assert no_auth_res.status_code == 401, "Expected 401 on missing auth"

        # 5. Security rejection on wrong origin
        wrong_origin_res = client.post(
            "/api/downloads",
            json={"url": "http://127.0.0.1:8088/range-file"},
            headers={"X-Auth-Token": token, "Origin": "https://evil.example"},
        )
        assert wrong_origin_res.status_code == 403, "Expected 403 on wrong origin"

        # 6. Security rejection on directory traversal
        traversal_res = client.post(
            "/api/downloads",
            json={
                "url": "http://127.0.0.1:8088/range-file",
                "destination_path": "../../Windows/test.bin",
            },
            headers=headers,
        )
        assert traversal_res.status_code == 400, "Expected 400 on traversal"

    print("\nALL API ENDPOINTS TESTED SUCCESSFULLY!")

if __name__ == "__main__":
    test_api()
