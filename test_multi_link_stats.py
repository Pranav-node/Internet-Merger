"""Test multi-link download distribution and per-link stats."""

import asyncio
from backend.core.downloader import DownloadStatus, DownloadTask
from backend.test_server import TEST_SHA256

async def test_multi_link():
    dest = "downloads/test_multilink.bin"
    # Test with two simultaneous links pulling from shared chunk work queue
    bind_ips = [None, None]

    print(f"Testing multi-link download with 2 link workers: {bind_ips}")
    task = DownloadTask(
        download_id="multilink-test",
        url="http://127.0.0.1:8088/range-file",
        destination_path=dest,
        bind_ips=bind_ips,
        connections_per_link=2,
        chunk_size=2 * 1024 * 1024, # 2 MB chunks (10 chunks total for 20 MB)
    )

    await task.start()

    print(f"\nDownload finished with status: {task.status}")
    print(f"Total downloaded: {task.downloaded_bytes} bytes")
    print(f"Total speed: {task.total_speed_bps:.2f} B/s")
    print("\nPer-Link Statistics Breakdown:")
    for link_id, stats in task.link_stats.items():
        print(f"  * Link '{link_id}':")
        print(f"      Bytes transferred: {stats.bytes_downloaded} ({stats.bytes_downloaded / (1024*1024):.2f} MB)")
        print(f"      Chunks completed:  {stats.chunks_completed}")
        print(f"      Errors count:      {stats.errors_count}")

    assert task.status == DownloadStatus.COMPLETED
    assert task.computed_checksum == TEST_SHA256
    # Verify BOTH links participated and processed chunks!
    chunks_p1 = list(task.link_stats.values())[0].chunks_completed
    chunks_p2 = list(task.link_stats.values())[1].chunks_completed
    print(f"\nLink 1 chunks: {chunks_p1}, Link 2 chunks: {chunks_p2}")
    assert chunks_p1 > 0 and chunks_p2 > 0, "Both links must pull and complete chunks from the shared queue!"
    print("\nMULTI-LINK LOAD BALANCING TEST PASSED!")

if __name__ == "__main__":
    asyncio.run(test_multi_link())
