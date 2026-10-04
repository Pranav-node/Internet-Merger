"""Test Resume and File Integrity under Interruption."""

import asyncio
import os
from backend.core.downloader import DownloadStatus, DownloadTask
from backend.core.persistence import get_state_file_path
from backend.core.verifier import verify_file_checksum
from backend.test_server import TEST_SHA256

async def test_interrupted_resume():
    dest = "downloads/test_resume.bin"
    state_file = get_state_file_path(dest)
    if os.path.exists(dest):
        os.remove(dest)
    if os.path.exists(state_file):
        os.remove(state_file)

    print("Step 1: Starting download and interrupting mid-way...")
    task1 = DownloadTask(
        download_id="resume-test-1",
        url="http://127.0.0.1:8088/range-file",
        destination_path=dest,
        chunk_size=2 * 1024 * 1024, # 2 MB chunks
        connections_per_link=1,
    )

    # Coroutine that cancels task1 once at least 2 chunks have completed
    async def cancel_when_partial():
        while len(task1.completed_chunk_indices) < 2:
            await asyncio.sleep(0.05)
        print(f"Cancelling mid-way with {len(task1.completed_chunk_indices)} chunks completed...")
        await task1.cancel()

    cancel_coro = asyncio.create_task(cancel_when_partial())
    try:
        await task1.start()
    except Exception as e:
        pass
    await cancel_coro

    print(f"Task 1 finished with status: {task1.status}")
    print(f"Does state file exist? {os.path.exists(state_file)}")
    assert os.path.exists(state_file), "State file must exist after interruption"
    partial_bytes = os.path.getsize(dest)
    print(f"Preallocated file size on disk: {partial_bytes} bytes")

    print("\nStep 2: Resuming download with a new DownloadTask instance...")
    task2 = DownloadTask(
        download_id="resume-test-2",
        url="http://127.0.0.1:8088/range-file",
        destination_path=dest,
        chunk_size=2 * 1024 * 1024,
        connections_per_link=2,
    )
    await task2.start()

    print(f"Task 2 finished with status: {task2.status}")
    assert task2.status == DownloadStatus.COMPLETED, f"Expected COMPLETED, got {task2.status}"

    # Verify state file was cleaned up on completion
    print(f"State file cleaned up? {not os.path.exists(state_file)}")

    # Verify SHA-256 matches
    matches, actual_hash = await verify_file_checksum(dest, TEST_SHA256)
    print(f"Checksum match: {matches} (Expected: {TEST_SHA256}, Actual: {actual_hash})")
    assert matches, "Checksum must match perfectly after resumed download"
    print("\nRESUME TEST PASSED!")

if __name__ == "__main__":
    asyncio.run(test_interrupted_resume())
