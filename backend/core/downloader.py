"""Multi-Link Parallel Download Engine with Non-Blocking Disk I/O & Autotuning.

Merges multiple network connections/interfaces to download files in chunks.
Key Performance & Stability Features:
1. Non-blocking asynchronous batched disk I/O via AsyncBatchWriter (dedicated worker thread).
2. Event loop lag and disk write latency profiling logged per second and exposed to UI.
3. Accurate per-link session traffic share percentage (e.g. 82% vs 18%).
4. Dynamic connections per link (default 8, configurable up to 16) and "Find Best Connections" autotuning.
5. Throttled background state persistence without synchronous os.fsync() event loop stalls.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import urllib.parse
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Deque, Dict, List, Optional, Set, Tuple

import aiohttp

from backend.core.chunking import Chunk, ChunkStatus, calculate_chunks
from backend.core.interfaces import (
    create_tcp_connector,
    format_network_error,
    get_windows_if_index_for_ip,
)
from backend.core.persistence import (
    DownloadState,
    FileManager,
    get_state_file_path,
    resolve_and_sanitize_destination,
    validate_destination_path,
)
from backend.core.probing import ProbeResult, probe_url
from backend.core.verifier import compute_file_hash, verify_file_checksum

logger = logging.getLogger("internet_merger.downloader")


@dataclass
class LinkStats:
    """Real-time performance metrics for a specific network link/interface."""
    link_id: str  # IP or "default"
    ip: Optional[str] = None
    if_index: Optional[int] = None
    bytes_downloaded: int = 0
    current_speed_bps: float = 0.0
    active_connections: int = 0
    chunks_completed: int = 0
    errors_count: int = 0
    last_error: Optional[str] = None
    # Sliding window of (timestamp, byte_count) for accurate speed calculation
    _recent_transfers: Deque[Tuple[float, int]] = field(default_factory=lambda: deque(maxlen=200))

    def record_bytes(self, num_bytes: int, now: Optional[float] = None) -> None:
        ts = now if now is not None else time.time()
        self.bytes_downloaded += num_bytes
        self._recent_transfers.append((ts, num_bytes))

    def update_speed(self, window_seconds: float = 1.5) -> None:
        now = time.time()
        cutoff = now - window_seconds
        while self._recent_transfers and self._recent_transfers[0][0] < cutoff:
            self._recent_transfers.popleft()

        total_bytes = sum(b for _, b in self._recent_transfers)
        if self._recent_transfers and len(self._recent_transfers) > 1:
            duration = max(now - self._recent_transfers[0][0], 0.1)
            self.current_speed_bps = total_bytes / duration
        elif total_bytes > 0:
            self.current_speed_bps = total_bytes / max(window_seconds, 0.5)
        else:
            self.current_speed_bps = 0.0


class DownloadStatus:
    QUEUED = "queued"
    PROBING = "probing"
    DOWNLOADING = "downloading"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DownloadTask:
    """Manages an individual multi-link file download."""

    def __init__(
        self,
        download_id: str,
        url: str,
        destination_path: str,
        bind_ips: Optional[List[Optional[str]]] = None,
        connections_per_link: int = 8,
        max_connections_per_link: int = 16,
        chunk_size: int = 4 * 1024 * 1024,
        max_retries: int = 5,
        expected_checksum: Optional[str] = None,
        on_progress: Optional[Callable[[DownloadTask], None]] = None,
    ):
        self.download_id = download_id
        self.url = url
        self.destination_path = os.path.abspath(destination_path)
        self.bind_ips: List[Optional[str]] = bind_ips if bind_ips and len(bind_ips) > 0 else [None]
        self.max_connections_per_link = max(1, min(max_connections_per_link, 32))
        self.connections_per_link = max(1, min(connections_per_link, self.max_connections_per_link))
        self.chunk_size = chunk_size
        self.max_retries = max_retries
        self.expected_checksum = expected_checksum
        self.on_progress = on_progress

        # State and Metadata
        self.status = DownloadStatus.QUEUED
        self.filename: str = os.path.basename(self.destination_path)
        self.final_url: Optional[str] = None
        self.total_bytes: Optional[int] = None
        self.downloaded_bytes: int = 0
        self.supports_range: bool = True
        self.etag: Optional[str] = None
        self.last_modified: Optional[str] = None
        self.error_message: Optional[str] = None
        self.computed_checksum: Optional[str] = None
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None

        # Autotuning State
        self.is_autotuning = False
        self.autotune_status = ""

        # Performance Profiling Metrics
        self.event_loop_lag_ms: float = 0.0
        self._last_perf_log_time: float = 0.0

        # Chunks and queue
        self.chunks: List[Chunk] = []
        self.completed_chunk_indices: Set[int] = set()
        self._work_queue: Optional[asyncio.Queue[Chunk]] = None

        # Per-link stats
        self.link_stats: Dict[str, LinkStats] = {}
        self.link_configs: List[Tuple[str, Optional[str]]] = []
        for idx, ip in enumerate(self.bind_ips):
            if ip:
                link_key = ip if sum(1 for p in self.bind_ips if p == ip) == 1 else f"{ip} (Stream {idx+1})"
            else:
                link_key = "default" if len(self.bind_ips) == 1 else f"Link {idx+1} (Default)"
            if_idx = get_windows_if_index_for_ip(ip) if ip else None
            self.link_configs.append((link_key, ip))
            self.link_stats[link_key] = LinkStats(link_id=link_key, ip=ip, if_index=if_idx)

        # Worker tasks & synchronization
        self._worker_tasks: List[asyncio.Task] = []
        self._monitor_task: Optional[asyncio.Task] = None
        self._lag_task: Optional[asyncio.Task] = None
        self._autotune_task: Optional[asyncio.Task] = None
        self._file_manager: Optional[FileManager] = None
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Set means "running"
        self._cancel_requested = False
        self._sessions: List[aiohttp.ClientSession] = []

    @property
    def disk_write_latency_ms(self) -> float:
        """Current average disk write latency reported by the batch writer."""
        if self._file_manager:
            return self._file_manager.disk_write_latency_ms
        return 0.0

    @property
    def total_speed_bps(self) -> float:
        """Sum of speeds across all links."""
        return sum(s.current_speed_bps for s in self.link_stats.values())

    @property
    def progress_percent(self) -> float:
        """Percentage of file downloaded (0 to 100)."""
        if not self.total_bytes or self.total_bytes <= 0:
            return 0.0
        return min(100.0, (self.downloaded_bytes / self.total_bytes) * 100.0)

    @property
    def eta_seconds(self) -> Optional[int]:
        """Estimated seconds remaining until completion."""
        if not self.total_bytes or self.status != DownloadStatus.DOWNLOADING:
            return None
        remaining = self.total_bytes - self.downloaded_bytes
        speed = self.total_speed_bps
        if speed > 1024 and remaining > 0:
            return int(remaining / speed)
        return None

    def to_dict(self) -> dict:
        """Serialize download task state for API and WebSocket clients."""
        session_total_bytes = sum(s.bytes_downloaded for s in self.link_stats.values())

        return {
            "id": self.download_id,
            "url": self.url,
            "filename": self.filename,
            "destination_path": self.destination_path,
            "status": self.status,
            "total_bytes": self.total_bytes,
            "downloaded_bytes": self.downloaded_bytes,
            "progress_percent": round(self.progress_percent, 2),
            "total_speed_bps": round(self.total_speed_bps, 2),
            "eta_seconds": self.eta_seconds,
            "supports_range": self.supports_range,
            "error_message": self.error_message,
            "computed_checksum": self.computed_checksum,
            "total_chunks": len(self.chunks),
            "completed_chunks_count": len(self.completed_chunk_indices),
            "connections_per_link": self.connections_per_link,
            "max_connections_per_link": self.max_connections_per_link,
            "is_autotuning": self.is_autotuning,
            "autotune_status": self.autotune_status,
            "event_loop_lag_ms": round(self.event_loop_lag_ms, 2),
            "disk_write_latency_ms": round(self.disk_write_latency_ms, 2),
            "links": {
                k: {
                    "link_id": s.link_id,
                    "ip": s.ip,
                    "if_index": s.if_index,
                    "bytes_downloaded": s.bytes_downloaded,
                    "current_speed_bps": round(s.current_speed_bps, 2),
                    "session_share_percent": round((s.bytes_downloaded / session_total_bytes * 100.0), 1) if session_total_bytes > 0 else 0.0,
                    "active_connections": s.active_connections,
                    "chunks_completed": s.chunks_completed,
                    "errors_count": s.errors_count,
                    "last_error": s.last_error,
                }
                for k, s in self.link_stats.items()
            },
        }

    async def set_connections_per_link(self, count: int) -> None:
        """Dynamically update connection count per link, adding workers if scaling up."""
        count = max(1, min(count, self.max_connections_per_link))
        if count == self.connections_per_link:
            return

        old_count = self.connections_per_link
        self.connections_per_link = count
        logger.info(f"Updated connections per link from {old_count} to {count}")

        if count > old_count and self.status == DownloadStatus.DOWNLOADING and self._sessions:
            for (link_key, ip), session in zip(self.link_configs, self._sessions):
                stats = self.link_stats[link_key]
                for worker_id in range(old_count, count):
                    logger.info(f"[Dynamic Worker] Scaling up Link '{link_key}' Worker #{worker_id+1}")
                    task = asyncio.create_task(self._link_worker(session, link_key, ip, worker_id))
                    self._worker_tasks.append(task)

    async def autotune_connections(self) -> None:
        """Incrementally step connections per link and stop when speed gain drops below 5%."""
        if self.is_autotuning or self.status != DownloadStatus.DOWNLOADING:
            return

        self.is_autotuning = True
        try:
            self.autotune_status = "Measuring baseline speed..."
            await asyncio.sleep(2.5)
            best_speed = self.total_speed_bps
            best_conns = self.connections_per_link

            while self.connections_per_link < self.max_connections_per_link and self.status == DownloadStatus.DOWNLOADING:
                next_conns = min(self.connections_per_link + 2, self.max_connections_per_link)
                self.autotune_status = f"Testing {next_conns} connections/link..."
                await self.set_connections_per_link(next_conns)
                await asyncio.sleep(3.5)

                if self.status != DownloadStatus.DOWNLOADING:
                    break

                new_speed = self.total_speed_bps
                gain = (new_speed - best_speed) / max(best_speed, 1.0)
                logger.info(
                    f"[Autotune] Connections={next_conns}: Speed={new_speed/(1024*1024):.2f} MB/s (Gain: {gain*100:.1f}%)"
                )

                if gain < 0.05:  # Less than 5% gain
                    self.autotune_status = f"Optimal locked at {best_conns} conns/link (speed gain was < 5%)"
                    await self.set_connections_per_link(best_conns)
                    break
                else:
                    best_speed = new_speed
                    best_conns = next_conns
                    self.autotune_status = f"Improved! ({next_conns} conns @ {new_speed/(1024*1024):.1f} MB/s)"

            if not self.autotune_status.startswith("Optimal"):
                self.autotune_status = f"Locked optimal {best_conns} connections/link"
        finally:
            self.is_autotuning = False

    async def start(self) -> None:
        """Initialize and start the multi-link download process."""
        self.status = DownloadStatus.PROBING
        self.start_time = time.time()
        self._cancel_requested = False
        self._pause_event.set()

        try:
            # 1. Probe URL
            probe = await probe_url(self.url)
            self.final_url = probe.final_url
            self.total_bytes = probe.total_bytes
            self.supports_range = probe.supports_range
            self.etag = probe.etag
            self.last_modified = probe.last_modified

            # Handle localhost / loopback destination routing
            parsed_dest = urllib.parse.urlparse(self.final_url or self.url)
            if parsed_dest.hostname in ("127.0.0.1", "localhost", "::1"):
                has_external = any(ip and not ip.startswith("127.") for ip in self.bind_ips)
                if has_external:
                    self.bind_ips = [None for _ in self.bind_ips]
                    self.link_configs = [(cfg[0], None) for cfg in self.link_configs]

            self.destination_path = resolve_and_sanitize_destination(
                self.destination_path,
                fallback_filename=probe.filename,
            )
            self.filename = os.path.basename(self.destination_path)

            validate_destination_path(self.destination_path)

            self._file_manager = FileManager(self.destination_path, self.total_bytes)

            # 2. Check for Resume State
            resumed = False
            saved_state = self._file_manager.load_state()
            if saved_state and saved_state.total_bytes == self.total_bytes and self.supports_range:
                if saved_state.url == self.url or (self.etag and saved_state.etag == self.etag):
                    self.completed_chunk_indices = set(saved_state.completed_chunks)
                    for link_k, b in (saved_state.bytes_per_link or {}).items():
                        if link_k in self.link_stats:
                            self.link_stats[link_k].bytes_downloaded = b
                    resumed = True

            # 3. Setup File & Chunks
            if self.supports_range and self.total_bytes and self.total_bytes > 0:
                self._file_manager.preallocate(self.total_bytes)
                self.chunks = calculate_chunks(self.total_bytes, self.chunk_size)
                if resumed:
                    for ch in self.chunks:
                        if ch.index in self.completed_chunk_indices:
                            ch.status = ChunkStatus.COMPLETED
                            ch.bytes_downloaded = ch.size

                self.downloaded_bytes = sum(ch.bytes_downloaded for ch in self.chunks)
            else:
                self.supports_range = False
                self.chunks = []
                self.downloaded_bytes = 0

            self._file_manager.open_for_writing()
            self.status = DownloadStatus.DOWNLOADING

            # Start background health & speed monitoring
            self._monitor_task = asyncio.create_task(self._monitor_loop())
            self._lag_task = asyncio.create_task(self._loop_health_monitor())

            # 4. Dispatch Download Execution
            if self.supports_range and self.total_bytes:
                await self._run_multi_link_range_download()
            else:
                await self._run_single_stream_download()

            # 5. Download Finished Successfully
            if not self._cancel_requested and self.status == DownloadStatus.DOWNLOADING:
                self._file_manager.close()
                self.status = DownloadStatus.COMPLETED
                self.end_time = time.time()
                self._file_manager.remove_state()

                # Verify checksum in threadpool
                if self.expected_checksum:
                    matches, calc_hash = await verify_file_checksum(self.destination_path, self.expected_checksum)
                    self.computed_checksum = calc_hash
                    if not matches:
                        self.status = DownloadStatus.FAILED
                        self.error_message = (
                            f"Integrity check failed: Expected {self.expected_checksum}, got {calc_hash}"
                        )
                else:
                    try:
                        self.computed_checksum = await compute_file_hash(self.destination_path, "sha256")
                    except Exception:
                        pass

        except asyncio.CancelledError:
            self.status = DownloadStatus.CANCELLED
            if self._file_manager:
                self._file_manager.close()
        except Exception as e:
            self.status = DownloadStatus.FAILED
            self.error_message = str(e)
            if self._file_manager:
                self._file_manager.close()
        finally:
            await self._cleanup()

    async def _run_multi_link_range_download(self) -> None:
        """Run parallel workers across all configured interfaces using a shared work queue."""
        self._work_queue = asyncio.Queue()

        pending_chunks = [c for c in self.chunks if c.index not in self.completed_chunk_indices]
        for c in pending_chunks:
            self._work_queue.put_nowait(c)

        client_timeout = aiohttp.ClientTimeout(total=None, sock_connect=12.0, sock_read=25.0)

        for link_key, ip in self.link_configs:
            stats = self.link_stats[link_key]
            connector = create_tcp_connector(bind_ip=ip)
            session = aiohttp.ClientSession(connector=connector, timeout=client_timeout)
            self._sessions.append(session)

            for worker_id in range(self.connections_per_link):
                logger.info(
                    f"[Worker Spawn] Link '{link_key}' (Worker #{worker_id+1}): "
                    f"Bound to interface index {stats.if_index} (Source IP: {ip or 'OS Default'}) via IP_UNICAST_IF"
                )
                task = asyncio.create_task(
                    self._link_worker(session, link_key, ip, worker_id)
                )
                self._worker_tasks.append(task)

        if self._worker_tasks:
            await asyncio.gather(*self._worker_tasks, return_exceptions=True)

    async def _link_worker(self, session: aiohttp.ClientSession, link_key: str, ip: Optional[str], worker_id: int) -> None:
        """Worker attached to a specific network link, pulling chunks from shared queue."""
        stats = self.link_stats[link_key]
        consecutive_errors = 0

        while not self._cancel_requested and self.status == DownloadStatus.DOWNLOADING:
            # Check if dynamic scaling reduced connections
            if worker_id >= self.connections_per_link:
                break

            await self._pause_event.wait()
            if self._cancel_requested:
                break

            # If this link is blocked or down, back off so healthy links can process the queue
            if consecutive_errors >= 2 and stats.bytes_downloaded == 0:
                await asyncio.sleep(2.0)
                if self._cancel_requested or self.status != DownloadStatus.DOWNLOADING:
                    break

            try:
                chunk = await asyncio.wait_for(self._work_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                if len(self.completed_chunk_indices) >= len(self.chunks):
                    break
                continue

            chunk.status = ChunkStatus.DOWNLOADING
            chunk.assigned_link = link_key
            stats.active_connections += 1

            success = False
            try:
                success = await self._download_chunk(session, link_key, ip, chunk)
                if success:
                    consecutive_errors = 0
            except Exception as e:
                formatted_err = format_network_error(e, ip)
                chunk.last_error = formatted_err
                stats.errors_count += 1
                stats.last_error = formatted_err
                consecutive_errors += 1
                logger.warning(
                    f"[Worker Error] Link '{link_key}' (Interface index {stats.if_index}): {formatted_err}"
                )
            finally:
                stats.active_connections = max(0, stats.active_connections - 1)

            if success:
                chunk.status = ChunkStatus.COMPLETED
                self.completed_chunk_indices.add(chunk.index)
                stats.chunks_completed += 1
                self._work_queue.task_done()

                # Non-blocking throttled state persistence
                await self._persist_current_state_async(force=False)

                if len(self.completed_chunk_indices) >= len(self.chunks):
                    break
            else:
                chunk.retries += 1
                if chunk.retries <= self.max_retries and not self._cancel_requested:
                    backoff = min(0.3 * (2 ** (chunk.retries - 1)), 4.0)
                    await asyncio.sleep(backoff)
                    chunk.status = ChunkStatus.PENDING
                    self._work_queue.put_nowait(chunk)
                else:
                    chunk.status = ChunkStatus.FAILED
                    self.error_message = f"Chunk {chunk.index} exceeded maximum retries: {chunk.last_error}"
                    if all(s.bytes_downloaded == 0 for s in self.link_stats.values()):
                        self.status = DownloadStatus.FAILED
                    break

    async def _download_chunk(self, session: aiohttp.ClientSession, link_key: str, ip: Optional[str], chunk: Chunk) -> bool:
        """Stream a single chunk byte range over the specified session."""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Range": chunk.range_header,
            "Accept-Encoding": "identity",
        }
        stats = self.link_stats[link_key]
        target_url = self.final_url or self.url

        try:
            async with session.get(target_url, headers=headers) as resp:
                if resp.status not in (206, 200):
                    raise aiohttp.ClientResponseError(
                        request_info=resp.request_info,
                        history=resp.history,
                        status=resp.status,
                        message=f"HTTP {resp.status} on Range request"
                    )

                chunk_offset = 0
                # Stream chunk data in 64 KB blocks
                async for block in resp.content.iter_chunked(65536):
                    if self._cancel_requested:
                        return False
                    await self._pause_event.wait()

                    block_len = len(block)
                    if block_len == 0:
                        continue

                    # Non-blocking write via AsyncBatchWriter queue
                    await self._file_manager.write_at_offset(chunk.start + chunk_offset, block)

                    chunk_offset += block_len
                    chunk.bytes_downloaded = chunk_offset
                    self.downloaded_bytes += block_len
                    stats.record_bytes(block_len)

                if chunk_offset == chunk.size:
                    return True
                else:
                    raise IOError(f"Truncated chunk: expected {chunk.size} bytes, got {chunk_offset}")

        except Exception as e:
            chunk.last_error = format_network_error(e, ip)
            raise e

    async def _run_single_stream_download(self) -> None:
        """Fallback download routine for servers that do not support HTTP Range."""
        primary_ip = self.bind_ips[0] if self.bind_ips else None
        link_key = primary_ip if primary_ip else "default"
        stats = self.link_stats[link_key]

        connector = create_tcp_connector(bind_ip=primary_ip)
        client_timeout = aiohttp.ClientTimeout(total=None, sock_connect=15.0, sock_read=30.0)

        async with aiohttp.ClientSession(connector=connector, timeout=client_timeout) as session:
            self._sessions.append(session)
            stats.active_connections = 1
            target_url = self.final_url or self.url
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "*/*",
                "Accept-Encoding": "identity",
            }

            try:
                async with session.get(target_url, headers=headers) as resp:
                    if resp.status >= 400:
                        raise aiohttp.ClientResponseError(
                            request_info=resp.request_info,
                            history=resp.history,
                            status=resp.status,
                            message=f"HTTP {resp.status} on GET"
                        )

                    offset = 0
                    async for block in resp.content.iter_chunked(65536):
                        if self._cancel_requested:
                            break
                        await self._pause_event.wait()

                        block_len = len(block)
                        if block_len > 0:
                            await self._file_manager.write_at_offset(offset, block)
                            offset += block_len
                            self.downloaded_bytes = offset
                            stats.record_bytes(block_len)

            except Exception as e:
                formatted_err = format_network_error(e, primary_ip)
                stats.errors_count += 1
                stats.last_error = formatted_err
                raise e
            finally:
                stats.active_connections = 0

    async def _loop_health_monitor(self) -> None:
        """High-resolution event loop lag monitor."""
        while not self._cancel_requested and self.status == DownloadStatus.DOWNLOADING:
            try:
                t0 = time.perf_counter()
                await asyncio.sleep(0.1)
                elapsed = time.perf_counter() - t0
                lag = max(0.0, (elapsed - 0.1) * 1000.0)
                # Exponential moving average
                self.event_loop_lag_ms = 0.8 * self.event_loop_lag_ms + 0.2 * lag
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(0.2)

    async def _monitor_loop(self) -> None:
        """Periodically recalculates speed metrics, logs telemetry per second, and triggers progress callbacks."""
        while not self._cancel_requested and self.status in (DownloadStatus.DOWNLOADING, DownloadStatus.PROBING):
            try:
                now = time.time()
                for stats in self.link_stats.values():
                    stats.update_speed(window_seconds=1.5)

                # Log performance telemetry once per second
                if now - self._last_perf_log_time >= 1.0 and self.status == DownloadStatus.DOWNLOADING:
                    self._last_perf_log_time = now
                    session_total = max(1, sum(s.bytes_downloaded for s in self.link_stats.values()))
                    link_summary = ", ".join(
                        f"{k}: {s.current_speed_bps/(1024*1024):.2f}MB/s ({round((s.bytes_downloaded/session_total)*100, 1)}%)"
                        for k, s in self.link_stats.items()
                    )
                    logger.info(
                        f"[Perf Telemetry] Loop Lag: {self.event_loop_lag_ms:.2f}ms | "
                        f"Disk Latency: {self.disk_write_latency_ms:.2f}ms | "
                        f"Total Speed: {self.total_speed_bps/(1024*1024):.2f} MB/s | "
                        f"Links: [{link_summary}]"
                    )

                if self.on_progress:
                    try:
                        self.on_progress(self)
                    except Exception:
                        pass

                await asyncio.sleep(0.7)
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(1.0)

    async def _persist_current_state_async(self, force: bool = False) -> None:
        """Persist state file non-blockingly."""
        if not self._file_manager or not self.supports_range or not self.total_bytes:
            return
        try:
            state = DownloadState(
                download_id=self.download_id,
                url=self.url,
                final_url=self.final_url or self.url,
                destination_path=self.destination_path,
                total_bytes=self.total_bytes,
                chunk_size=self.chunk_size,
                filename=self.filename,
                supports_range=self.supports_range,
                etag=self.etag,
                last_modified=self.last_modified,
                completed_chunks=list(self.completed_chunk_indices),
                bytes_per_link={k: s.bytes_downloaded for k, s in self.link_stats.items()},
                created_at=self.start_time or time.time(),
                updated_at=time.time(),
            )
            await self._file_manager.save_state_async(state, force=force)
        except Exception:
            pass

    async def pause(self) -> None:
        """Pause active download."""
        if self.status == DownloadStatus.DOWNLOADING:
            self._pause_event.clear()
            self.status = DownloadStatus.PAUSED
            await self._persist_current_state_async(force=True)

    async def resume(self) -> None:
        """Resume paused download."""
        if self.status == DownloadStatus.PAUSED:
            self._pause_event.set()
            self.status = DownloadStatus.DOWNLOADING

    async def cancel(self) -> None:
        """Cancel download and abort all workers."""
        self._cancel_requested = True
        self.status = DownloadStatus.CANCELLED
        self._pause_event.set()

        for task in self._worker_tasks:
            if not task.done():
                task.cancel()

        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
        if self._lag_task and not self._lag_task.done():
            self._lag_task.cancel()

        await self._persist_current_state_async(force=True)
        await self._cleanup()

    async def _cleanup(self) -> None:
        """Close open sessions and flush file descriptors."""
        for session in self._sessions:
            if not session.closed:
                try:
                    await session.close()
                except Exception:
                    pass
        self._sessions.clear()

        if self._file_manager:
            self._file_manager.close()
