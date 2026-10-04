# Internet Merger — Test Plan & Verification Report

This document outlines the test strategy, execution steps, expected outcomes, and automated verification results for the 5 core test scenarios required by the project specification.

---

## Automated Test Suite

A unified test runner is provided to execute all 5 scenarios automatically:

```bash
python run_all_tests.py
```

### Automated Suite Results
| Test Scenario | Status | Measured Verification Details |
| :--- | :---: | :--- |
| **1. Range-Supporting Server** | **PASS** | 20 MB parallel chunk download, SHA-256 match `3568217a72ee...` |
| **2. Non-Range Fallback Server** | **PASS** | 5 MB sequential fallback stream, Range unsupported detected |
| **3. Flaky Connection / Error Retry** | **PASS** | Intermittent HTTP 500 errors injected; recovered via backoff |
| **4. Interruption & Crash Resume** | **PASS** | Cancelled after 2 chunks; `.merger.json` verified; resumed to 100% |
| **5. Multi-Link Concurrency & Stats** | **PASS** | Dual link workers: Link 1 (6 chunks), Link 2 (4 chunks) |

---

## Detailed Test Scenarios

### Scenario 1: Range-Supporting Server (Multi-Link Parallel Download)
- **Objective:** Verify URL probing with `GET Range: bytes=0-0`, parsing of `Content-Range`, file preallocation, chunk calculation (default 4 MB or custom 2 MB), and parallel worker writing to byte offsets.
- **Test Server:** Endpoint `http://127.0.0.1:8088/range-file` serving a 20 MB payload with `Accept-Ranges: bytes` and `Content-Range`.
- **CLI Command:**
  ```bash
  python -m backend.cli http://127.0.0.1:8088/range-file -o downloads/test_range.bin -c 4 -s 2 --checksum 3568217a72eed5450d704907de96e14c75cc1b18661f38e0c9f458e462b38def
  ```
- **Expected Outcome:**
  - Prober identifies `Supports Range: True`.
  - File is preallocated on disk to 20,971,520 bytes.
  - Workers fetch chunks concurrently.
  - SHA-256 matches expected checksum.

---

### Scenario 2: Non-Range Server (Single-Stream Fallback)
- **Objective:** Verify graceful fallback when a remote server returns HTTP 200 OK or `Accept-Ranges: none` and ignores range requests.
- **Test Server:** Endpoint `http://127.0.0.1:8088/norange-file`.
- **CLI Command:**
  ```bash
  python -m backend.cli http://127.0.0.1:8088/norange-file -o downloads/test_norange.bin
  ```
- **Expected Outcome:**
  - Prober identifies `Supports Range: False`.
  - UI displays an amber notification: *"Server does not support ranges; downloading sequentially via single stream"*.
  - Engine streams file sequentially into destination path without error.

---

### Scenario 3: Connection Dropped Mid-Download (Flaky Chunks)
- **Objective:** Verify bounded retries (up to 5 attempts) with exponential backoff when connections drop or return HTTP errors.
- **Test Server:** Endpoint `http://127.0.0.1:8088/flaky-file` (intentionally returns HTTP 500 on every 3rd chunk).
- **CLI Command:**
  ```bash
  python -m backend.cli http://127.0.0.1:8088/flaky-file -o downloads/test_flaky.bin -c 2 -s 2 --checksum 3568217a72eed5450d704907de96e14c75cc1b18661f38e0c9f458e462b38def
  ```
- **Expected Outcome:**
  - Chunks experiencing errors increment their `retries` counter.
  - Backoff delay is applied before re-enqueueing the chunk into the shared work queue.
  - Another worker (or the same worker) re-attempts and completes the chunk.
  - Final assembled file integrity passes SHA-256 validation.

---

### Scenario 4: Process Crash & Resume from Disk
- **Objective:** Verify persistence of the chunk completion map (`<file>.merger.json`) and atomic state updates so downloads resume without re-downloading existing chunks.
- **Test Script:**
  ```bash
  python test_resume_integrity.py
  ```
- **Step-by-Step Procedure:**
  1. Start download task for a 20 MB file.
  2. Simulate user cancellation or process crash after 2 chunks finish.
  3. Verify `.merger.json` exists on disk containing chunk metadata and completed indices.
  4. Instantiate a new `DownloadTask` targeting the same destination file.
  5. The engine loads the state file, skips chunks 0 and 1, and only downloads remaining chunks.
  6. State file is automatically deleted upon successful completion.
  7. SHA-256 hash verified against original source.

---

### Scenario 5: Multi-Interface Concurrency & Per-Link Breakdown
- **Objective:** Verify that multiple network links (e.g., Ethernet + Wi-Fi / Hotspot) pull from a shared chunk queue according to their speeds, and per-link metrics accurately record transferred bytes.
- **Test Script:**
  ```bash
  python test_multi_link_stats.py
  ```
- **Expected Outcome:**
  - Multiple distinct link worker pools are spawned.
  - Each link's transferred bytes and active connections are tracked independently.
  - Faster links naturally pull more chunks from the shared queue.
  - Both links show positive chunk completion counts in the final breakdown report.
