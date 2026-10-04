"""Command Line Interface for Internet Merger.

Test and run multi-interface downloads directly from the terminal.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
import uuid

from backend.core.downloader import DownloadStatus, DownloadTask
from backend.core.interfaces import get_available_interfaces, test_interface_connectivity
from backend.core.probing import probe_url


def format_bytes(num_bytes: int) -> str:
    """Format bytes into human-readable string (KB, MB, GB)."""
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    elif num_bytes < 1024 * 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.2f} MB"
    else:
        return f"{num_bytes / (1024 * 1024 * 1024):.2f} GB"


def format_speed(bps: float) -> str:
    """Format bytes per second into readable speed."""
    return f"{format_bytes(int(bps))}/s"


async def run_list_interfaces(test_reachability: bool = False):
    """List available network interfaces and optionally test internet connectivity."""
    print("=" * 70)
    print("Detected Network Interfaces:")
    print("=" * 70)
    ifaces = get_available_interfaces()
    for iface in ifaces:
        if iface.is_loopback:
            continue
        status_str = "UP" if iface.is_up else "DOWN"
        default_str = " (DEFAULT GATEWAY)" if iface.is_default else ""
        link_local_str = " [Link-Local/APIPA]" if iface.is_link_local else ""
        print(f"* {iface.adapter_name:24} | IP: {iface.ip:15} | Status: {status_str}{default_str}{link_local_str}")

        if test_reachability and iface.is_up and not iface.is_link_local:
            success, msg = await test_interface_connectivity(iface.ip)
            res_str = "OK" if success else f"FAIL ({msg})"
            print(f"    Reachability check -> {res_str}")

    print("=" * 70)


async def main_async():
    parser = argparse.ArgumentParser(
        description="Internet Merger CLI: Accelerate downloads by combining multiple connections."
    )
    parser.add_argument("url", nargs="?", help="URL to download")
    parser.add_argument("-o", "--output", default="downloads", help="Output file or directory path (default: downloads/)")
    parser.add_argument("-i", "--interfaces", help="Comma-separated IPs to bind (e.g. '192.168.1.100,192.168.43.15') or 'auto'")
    parser.add_argument("-c", "--connections", type=int, default=2, help="Parallel connections per interface (default: 2)")
    parser.add_argument("-s", "--chunk-size", type=int, default=4, help="Chunk size in MB (default: 4)")
    parser.add_argument("--checksum", help="Expected SHA-256 or MD5 hash to verify")
    parser.add_argument("--list-interfaces", action="store_true", help="List detected network interfaces")
    parser.add_argument("--test-interfaces", action="store_true", help="Test outbound connectivity on active interfaces")

    args = parser.parse_args()

    if args.list_interfaces or args.test_interfaces:
        await run_list_interfaces(test_reachability=args.test_interfaces)
        return

    if not args.url:
        parser.print_help()
        print("\nError: URL is required.")
        sys.exit(1)

    # Resolve output directory/file
    os.makedirs(args.output if not os.path.splitext(args.output)[1] else os.path.dirname(args.output) or ".", exist_ok=True)

    print("\n[1/3] Probing URL...")
    try:
        probe = await probe_url(args.url)
    except Exception as e:
        print(f"Error probing URL: {e}")
        sys.exit(1)

    print(f"  URL:            {probe.final_url}")
    print(f"  Filename:       {probe.filename}")
    print(f"  Total Size:     {format_bytes(probe.total_bytes) if probe.total_bytes else 'Unknown'}")
    print(f"  Supports Range: {probe.supports_range} {'(Multi-link enabled)' if probe.supports_range else '(Single stream fallback)'}")
    if probe.etag:
        print(f"  ETag:           {probe.etag}")

    # Determine destination file path
    dest_path = args.output
    if os.path.isdir(dest_path) or not os.path.splitext(dest_path)[1]:
        dest_path = os.path.join(dest_path, probe.filename)

    # Parse bind IPs
    bind_ips = []
    if args.interfaces and args.interfaces.lower() != "auto":
        bind_ips = [ip.strip() for ip in args.interfaces.split(",") if ip.strip()]
    else:
        # Default or Auto
        bind_ips = [None]

    print(f"\n[2/3] Configuring download engine...")
    print(f"  Destination:        {dest_path}")
    print(f"  Interfaces/Links:   {bind_ips}")
    print(f"  Conns per link:     {args.connections}")
    print(f"  Chunk size:         {args.chunk_size} MB")

    task = DownloadTask(
        download_id=str(uuid.uuid4())[:8],
        url=args.url,
        destination_path=dest_path,
        bind_ips=bind_ips,
        connections_per_link=args.connections,
        chunk_size=args.chunk_size * 1024 * 1024,
        expected_checksum=args.checksum,
    )

    last_line_len = 0

    def print_progress():
        nonlocal last_line_len
        links_info = []
        for k, s in task.link_stats.items():
            links_info.append(f"{k}: {format_speed(s.current_speed_bps)}")
        links_str = " | ".join(links_info)

        pct = task.progress_percent
        cur = format_bytes(task.downloaded_bytes)
        tot = format_bytes(task.total_bytes) if task.total_bytes else "?"
        spd = format_speed(task.total_speed_bps)
        eta_str = f"{task.eta_seconds}s" if task.eta_seconds is not None else "--"

        line = f"\r[{task.status.upper()}] {pct:5.1f}% | {cur}/{tot} | {spd} | ETA: {eta_str} | Links: [{links_str}]"
        # Pad to clear previous characters
        padded = line.ljust(max(last_line_len, len(line)))
        last_line_len = len(line)
        sys.stdout.write(padded)
        sys.stdout.flush()

    # Progress monitor loop
    async def cli_monitor():
        while task.status in (DownloadStatus.QUEUED, DownloadStatus.PROBING, DownloadStatus.DOWNLOADING):
            print_progress()
            await asyncio.sleep(0.3)
        print_progress()
        sys.stdout.write("\n")

    print("\n[3/3] Downloading...")
    monitor_coro = asyncio.create_task(cli_monitor())

    try:
        await task.start()
    except KeyboardInterrupt:
        print("\nDownload interrupted by user.")
        await task.cancel()
    finally:
        await monitor_coro

    print("\n" + "=" * 70)
    if task.status == DownloadStatus.COMPLETED:
        print(f"DOWNLOAD SUCCESSFUL: {task.destination_path}")
        print(f"Total size: {format_bytes(task.downloaded_bytes)}")
        if task.computed_checksum:
            print(f"Checksum:   {task.computed_checksum}")
        print("\nLink Contribution Breakdown:")
        for k, s in task.link_stats.items():
            print(f"  - Link '{k}': {format_bytes(s.bytes_downloaded)} in {s.chunks_completed} chunks (Errors: {s.errors_count})")
    else:
        print(f"DOWNLOAD ENDED WITH STATUS: {task.status}")
        if task.error_message:
            print(f"Error: {task.error_message}")
    print("=" * 70)


def main():
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\nExiting.")


if __name__ == "__main__":
    main()
