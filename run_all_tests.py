"""Unified Test Runner for Internet Merger.

Executes all 5 test scenarios defined in the project specification:
1. Range-supporting server download
2. Non-range server fallback stream
3. Flaky chunk connection with bounded retries
4. Mid-download interruption & resume with state verification
5. Multi-link concurrency with per-link stats distribution
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from starlette.testclient import TestClient

from backend.api.app import app
from backend.core.downloader import DownloadStatus, DownloadTask
from backend.core.verifier import verify_file_checksum
from backend.test_server import TEST_SHA256, create_test_app
from aiohttp import web


async def run_suite():
    print("=" * 75)
    print("      INTERNET MERGER - COMPREHENSIVE AUTOMATED TEST SUITE")
    print("=" * 75)

    # 1. Start an in-process aiohttp test server on port 8089 to ensure test isolation
    test_app = create_test_app()
    runner = web.AppRunner(test_app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 8089)
    await site.start()
    print("[OK] Local isolated test server started on http://127.0.0.1:8089\n")

    results = []
    base_url = "http://127.0.0.1:8089"
    os.makedirs("downloads/test_output", exist_ok=True)

    # Test 1: Range-supporting server
    print("[Test 1/5] Testing Range-supporting download with parallel workers...")
    t1_dest = "downloads/test_output/t1_range.bin"
    if os.path.exists(t1_dest):
        os.remove(t1_dest)
    task1 = DownloadTask(
        download_id="t1",
        url=f"{base_url}/range-file",
        destination_path=t1_dest,
        connections_per_link=4,
        chunk_size=2 * 1024 * 1024,
    )
    await task1.start()
    match1, hash1 = await verify_file_checksum(t1_dest, TEST_SHA256)
    passed1 = task1.status == DownloadStatus.COMPLETED and match1
    results.append(("1. Range-supporting download (20MB)", passed1, f"SHA-256: {hash1[:12]}... (OK)"))
    print(f"  -> Result: {'PASSED' if passed1 else 'FAILED'}\n")

    # Test 2: Non-range fallback
    print("[Test 2/5] Testing non-range server single-stream fallback...")
    t2_dest = "downloads/test_output/t2_norange.bin"
    if os.path.exists(t2_dest):
        os.remove(t2_dest)
    task2 = DownloadTask(
        download_id="t2",
        url=f"{base_url}/norange-file",
        destination_path=t2_dest,
        connections_per_link=2,
    )
    await task2.start()
    size2 = os.path.getsize(t2_dest) if os.path.exists(t2_dest) else 0
    passed2 = task2.status == DownloadStatus.COMPLETED and not task2.supports_range and size2 == 5 * 1024 * 1024
    results.append(("2. Non-range fallback stream (5MB)", passed2, f"Size: {size2} bytes, single stream"))
    print(f"  -> Result: {'PASSED' if passed2 else 'FAILED'}\n")

    # Test 3: Flaky connection with automatic retries
    print("[Test 3/5] Testing flaky server with chunk error injection & backoff...")
    t3_dest = "downloads/test_output/t3_flaky.bin"
    if os.path.exists(t3_dest):
        os.remove(t3_dest)
    task3 = DownloadTask(
        download_id="t3",
        url=f"{base_url}/flaky-file",
        destination_path=t3_dest,
        connections_per_link=2,
        chunk_size=2 * 1024 * 1024,
    )
    await task3.start()
    match3, _ = await verify_file_checksum(t3_dest, TEST_SHA256)
    passed3 = task3.status == DownloadStatus.COMPLETED and match3
    results.append(("3. Flaky chunk retries & recovery", passed3, "Successfully recovered from 500 errors"))
    print(f"  -> Result: {'PASSED' if passed3 else 'FAILED'}\n")

    # Test 4: Mid-download interruption and resume
    print("[Test 4/5] Testing mid-download cancellation and resumption from state...")
    t4_dest = "downloads/test_output/t4_resume.bin"
    t4_state = f"{t4_dest}.merger.json"
    if os.path.exists(t4_dest):
        os.remove(t4_dest)
    if os.path.exists(t4_state):
        os.remove(t4_state)

    task4_part = DownloadTask(
        download_id="t4_p1",
        url=f"{base_url}/range-file",
        destination_path=t4_dest,
        connections_per_link=1,
        chunk_size=2 * 1024 * 1024,
    )
    # Cancel after 2 chunks
    async def cancel_later():
        while len(task4_part.completed_chunk_indices) < 2:
            await asyncio.sleep(0.05)
        await task4_part.cancel()

    c_task = asyncio.create_task(cancel_later())
    try:
        await task4_part.start()
    except Exception:
        pass
    await c_task

    has_state = os.path.exists(t4_state)

    # Resume with second task
    task4_resume = DownloadTask(
        download_id="t4_p2",
        url=f"{base_url}/range-file",
        destination_path=t4_dest,
        connections_per_link=2,
        chunk_size=2 * 1024 * 1024,
    )
    await task4_resume.start()
    match4, _ = await verify_file_checksum(t4_dest, TEST_SHA256)
    state_cleaned = not os.path.exists(t4_state)
    passed4 = has_state and task4_resume.status == DownloadStatus.COMPLETED and match4 and state_cleaned
    results.append(("4. Crash resilience & resume", passed4, "State file saved, missing chunks completed"))
    print(f"  -> Result: {'PASSED' if passed4 else 'FAILED'}\n")

    # Test 5: Multi-link load balancing
    print("[Test 5/5] Testing multi-link worker concurrency & per-link stats...")
    t5_dest = "downloads/test_output/t5_multilink.bin"
    if os.path.exists(t5_dest):
        os.remove(t5_dest)
    task5 = DownloadTask(
        download_id="t5",
        url=f"{base_url}/range-file",
        destination_path=t5_dest,
        bind_ips=[None, None], # Dual link streams
        connections_per_link=2,
        chunk_size=2 * 1024 * 1024,
    )
    await task5.start()
    links_list = list(task5.link_stats.values())
    c1 = links_list[0].chunks_completed
    c2 = links_list[1].chunks_completed
    match5, _ = await verify_file_checksum(t5_dest, TEST_SHA256)
    passed5 = task5.status == DownloadStatus.COMPLETED and c1 > 0 and c2 > 0 and match5
    results.append(("5. Multi-link concurrency & stats", passed5, f"Link 1: {c1} chunks, Link 2: {c2} chunks"))
    print(f"  -> Result: {'PASSED' if passed5 else 'FAILED'}\n")

    # Test 6: Security Hardening (Token 401, Origin 403, Traversal 400, DNS 400)
    print("[Test 6/6] Testing Security Hardening (Token 401, Origin 403, Traversal 400)...")
    from backend.core.security import get_session_token
    sec_token = get_session_token()
    with TestClient(app) as client:
        r_notoken = client.get("/api/downloads")
        r_wrongorigin = client.post(
            "/api/downloads",
            json={"url": "http://127.0.0.1:8089/range-file"},
            headers={"X-Auth-Token": sec_token, "Origin": "https://evil.example"},
        )
        r_traversal = client.post(
            "/api/downloads",
            json={"url": "http://127.0.0.1:8089/range-file", "destination_path": "../../Windows/test.bin"},
            headers={"X-Auth-Token": sec_token, "Origin": "http://127.0.0.1:8000"},
        )
        r_dns = client.get("/api/downloads", headers={"Host": "evil.com", "X-Auth-Token": sec_token})

        passed6 = (
            r_notoken.status_code == 401
            and r_wrongorigin.status_code == 403
            and r_traversal.status_code == 400
            and r_dns.status_code == 400
        )
        results.append(("6. Security hardening (401/403/400)", passed6, "Token, Origin, Rebinding & Traversal OK"))
        print(f"  -> Result: {'PASSED' if passed6 else 'FAILED'}\n")

    # Clean up test server
    await runner.cleanup()

    # Print Summary Table
    print("=" * 75)
    print("TEST SUITE SUMMARY REPORT")
    print("=" * 75)
    all_passed = True
    for name, status, details in results:
        status_text = "PASS" if status else "FAIL"
        print(f"[{status_text:4}] {name:38} | {details}")
        if not status:
            all_passed = False
    print("=" * 75)

    if all_passed:
        print(">>> ALL SPECIFICATION AND SECURITY TESTS PASSED SUCCESSFULLY! <<<\n")
    else:
        print(">>> SOME TESTS FAILED <<<\n")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_suite())
