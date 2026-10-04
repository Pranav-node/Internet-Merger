"""Test HTTP Server for verifying download behavior.

Supports:
- HTTP 206 Partial Content (with Range: bytes=X-Y)
- Non-range standard 200 OK downloads
- Intermittent failure simulation (flaky mode) to test worker retries
- Known deterministic payload generation (e.g. predictable byte pattern for SHA-256 validation)
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import os
import re
from aiohttp import web

# Deterministic test data generator
def generate_pattern_data(size: int) -> bytes:
    """Generate deterministic repeating binary data for testing."""
    # Pattern of 256 repeating byte values
    pattern = bytes([i % 256 for i in range(1024)])
    repeat = (size // len(pattern)) + 1
    return (pattern * repeat)[:size]


# 20 MB test payload
DEFAULT_PAYLOAD_SIZE = 20 * 1024 * 1024
TEST_DATA = generate_pattern_data(DEFAULT_PAYLOAD_SIZE)
TEST_SHA256 = hashlib.sha256(TEST_DATA).hexdigest()

flaky_counter = 0


async def handle_range_file(request: web.Request) -> web.Response:
    """Endpoint supporting HTTP Range (206 Partial Content)."""
    data = TEST_DATA
    total_len = len(data)
    range_header = request.headers.get("Range")

    if not range_header:
        # Full content response
        return web.Response(
            body=data,
            headers={
                "Content-Type": "application/octet-stream",
                "Content-Length": str(total_len),
                "Accept-Ranges": "bytes",
                "ETag": '"test-range-etag-v1"',
                "Content-Disposition": 'attachment; filename="test_file_range.bin"',
            },
        )

    # Parse range header: e.g. bytes=0-4194303 or bytes=0-0
    match = re.match(r"bytes=(\d+)-(\d+)?", range_header)
    if not match:
        return web.Response(status=416, headers={"Content-Range": f"bytes */{total_len}"})

    start = int(match.group(1))
    end_str = match.group(2)
    end = int(end_str) if end_str is not None else total_len - 1

    if start >= total_len or end >= total_len or start > end:
        return web.Response(status=416, headers={"Content-Range": f"bytes */{total_len}"})

    chunk_data = data[start : end + 1]
    headers = {
        "Content-Type": "application/octet-stream",
        "Content-Range": f"bytes {start}-{end}/{total_len}",
        "Content-Length": str(len(chunk_data)),
        "Accept-Ranges": "bytes",
        "ETag": '"test-range-etag-v1"',
        "Content-Disposition": 'attachment; filename="test_file_range.bin"',
    }
    return web.Response(status=206, body=chunk_data, headers=headers)


async def handle_non_range_file(request: web.Request) -> web.Response:
    """Endpoint that intentionally ignores Range header (returns 200 OK)."""
    data = TEST_DATA[: 5 * 1024 * 1024]  # 5 MB
    return web.Response(
        body=data,
        headers={
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
            "Accept-Ranges": "none",
            "Content-Disposition": 'attachment; filename="test_file_norange.bin"',
        },
    )


async def handle_flaky_range_file(request: web.Request) -> web.Response:
    """Endpoint that fails every 3rd request with 500 error to test client retry."""
    global flaky_counter
    flaky_counter += 1
    if flaky_counter % 3 == 0:
        return web.Response(status=500, text="Simulated server error for retry testing")
    return await handle_range_file(request)


def create_test_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/range-file", handle_range_file)
    app.router.add_get("/norange-file", handle_non_range_file)
    app.router.add_get("/flaky-file", handle_flaky_range_file)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test Download HTTP Server")
    parser.add_argument("--port", type=int, default=8088, help="Port to listen on (default: 8088)")
    args = parser.parse_args()

    print(f"Starting Test Server on http://127.0.0.1:{args.port}")
    print(f"Test data size: {DEFAULT_PAYLOAD_SIZE} bytes ({DEFAULT_PAYLOAD_SIZE / (1024*1024):.1f} MB)")
    print(f"Expected SHA-256: {TEST_SHA256}")
    print("Endpoints:")
    print(f"  - http://127.0.0.1:{args.port}/range-file   (Range supporting)")
    print(f"  - http://127.0.0.1:{args.port}/norange-file (No Range support)")
    print(f"  - http://127.0.0.1:{args.port}/flaky-file   (Flaky connection/retries)")

    app = create_test_app()
    web.run_app(app, host="127.0.0.1", port=args.port)
