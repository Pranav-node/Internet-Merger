"""Persistence, File Allocation, and High-Throughput Async Batch Writer.

Handles preallocating files on disk, non-blocking batched disk writes via a dedicated
worker thread with a thread-safe queue, periodic flushing, disk write latency profiling,
and atomic persistence of chunk completion state without event loop stalling.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import queue
import re
import tempfile
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger("internet_merger.persistence")


@dataclass
class DownloadState:
    """Serializable state of a download."""
    download_id: str
    url: str
    final_url: str
    destination_path: str
    total_bytes: int
    chunk_size: int
    filename: str
    supports_range: bool
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    completed_chunks: List[int] = None  # List of chunk indices
    bytes_per_link: Dict[str, int] = None
    created_at: float = 0.0
    updated_at: float = 0.0

    def __post_init__(self):
        if self.completed_chunks is None:
            self.completed_chunks = []
        if self.bytes_per_link is None:
            self.bytes_per_link = {}


def get_state_file_path(destination_path: str) -> str:
    """Return the companion state file path for a destination download file."""
    return f"{destination_path}.merger.json"


def resolve_and_sanitize_destination(
    destination_path: Optional[str],
    fallback_filename: Optional[str] = None,
) -> str:
    """Intelligently normalize, extract, and sanitize destination path on Windows / POSIX.

    Handles:
    - Trailing and leading whitespace and quotes (e.g. pasted strings like '"D:\\DL"').
    - Accidental concatenation where a user typed or pasted a drive letter into an existing path,
      e.g. 'downloads/Assassin's.Creed.rarD:\\DL' -> extracts folder 'D:\\DL' and filename 'Assassin's.Creed.rar'.
    - Directory targets (e.g. 'D:\\DL' or 'downloads/' or paths without file extensions)
      automatically combined with fallback_filename.
    - Prohibited Windows characters (< > " | ? *) and stray colons outside drive specifier.
    """
    if not destination_path or not str(destination_path).strip():
        dest = fallback_filename or "download.bin"
        return os.path.abspath(dest)

    path_str = str(destination_path).strip().strip("\"'")

    # Check for embedded secondary drive letter, e.g. 'downloads/file.rarD:\DL'
    m = re.search(r'^(.*?)(?<!^)([a-zA-Z]:[\\/].*)$', path_str)
    if m:
        prefix = m.group(1).rstrip('/\\')
        suffix = m.group(2).strip()
        prefix_base = os.path.basename(prefix)
        suffix_ext = os.path.splitext(os.path.basename(suffix))[1]
        # If suffix doesn't have an extension, but prefix had a filename, combine them
        if not suffix_ext and prefix_base:
            path_str = os.path.join(suffix, prefix_base)
        else:
            path_str = suffix

    # Normalize slashes
    path_str = os.path.normpath(path_str)

    # Windows sanitization: ensure colons only appear at drive letter index 1
    drive, rest = os.path.splitdrive(path_str)
    if ":" in rest:
        rest = rest.replace(":", "_")
    for c in '<>"|?*':
        rest = rest.replace(c, '')
    path_str = drive + rest

    resolved = os.path.abspath(path_str)

    # If the resolved destination is a directory or has no extension, attach fallback_filename
    if fallback_filename:
        is_dir_target = (
            destination_path.endswith(("/", "\\"))
            or os.path.isdir(resolved)
            or (not os.path.splitext(os.path.basename(resolved))[1] and not os.path.isfile(resolved))
        )
        if is_dir_target:
            resolved = os.path.join(resolved, fallback_filename)

    return resolved


def validate_destination_path(destination_path: str, allowed_base_dir: Optional[str] = None) -> str:
    """Validate and sanitize destination path to prevent directory traversal and unsafe paths."""
    resolved = resolve_and_sanitize_destination(destination_path)

    # Check parent directory exists or can be created
    parent = os.path.dirname(resolved)
    if not parent:
        raise ValueError(f"Invalid path: {destination_path}")

    # Check for remaining invalid Windows characters or colons
    drive, rest = os.path.splitdrive(resolved)
    if ":" in rest or any(c in rest for c in '<>"|?*'):
        raise ValueError(f"Invalid characters in path: '{resolved}'")

    if allowed_base_dir:
        resolved_base = os.path.abspath(allowed_base_dir)
        try:
            common = os.path.commonpath([resolved_base, resolved])
            if common != resolved_base:
                raise ValueError(f"Security error: Destination path '{resolved}' is outside allowed folder '{resolved_base}'")
        except ValueError as e:
            raise ValueError(f"Security error: Destination path '{resolved}' is outside allowed folder: {e}")

    return resolved


class AsyncBatchWriter:
    """Dedicated background writer thread that batches disk writes and tracks latency.

    Prevents disk write stalls and fsync calls from ever blocking the asyncio event loop.
    """

    def __init__(self, file_path: str, flush_interval: float = 2.0, max_queue_size: int = 4096):
        self.file_path = file_path
        self.flush_interval = flush_interval
        self._queue: queue.Queue[Optional[Tuple[int, bytes]]] = queue.Queue(maxsize=max_queue_size)
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._file_handle = None
        self.disk_write_latency_ms: float = 0.0
        self._latency_samples: List[float] = []

    def start(self) -> None:
        """Start the background writer thread."""
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._writer_loop, name=f"Writer-{os.path.basename(self.file_path)}", daemon=True)
        self._thread.start()

    def _writer_loop(self) -> None:
        """Background thread loop consuming writes, batching, and periodic flushing."""
        try:
            self._file_handle = open(self.file_path, "r+b")
        except Exception as e:
            logger.error(f"AsyncBatchWriter failed to open {self.file_path}: {e}")
            return

        last_flush_time = time.time()

        while not self._stop_event.is_set() or not self._queue.empty():
            try:
                # Wait up to 0.25s for next write task
                item = self._queue.get(timeout=0.25)
            except queue.Empty:
                # Periodically flush if idle
                now = time.time()
                if now - last_flush_time >= self.flush_interval:
                    self._do_flush()
                    last_flush_time = now
                continue

            if item is None:
                # Sentinel to shutdown
                break

            offset, data = item
            t0 = time.perf_counter()
            try:
                self._file_handle.seek(offset)
                self._file_handle.write(data)
                self._queue.task_done()
            except Exception as e:
                logger.error(f"Error writing to disk at offset {offset}: {e}")
                self._queue.task_done()

            # Record write latency
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            self._record_latency(elapsed_ms)

            # Check if we should flush
            now = time.time()
            if now - last_flush_time >= self.flush_interval or self._queue.empty():
                self._do_flush()
                last_flush_time = now

        # Final flush on exit
        self._do_flush()
        if self._file_handle and not self._file_handle.closed:
            try:
                self._file_handle.close()
            except Exception:
                pass
            self._file_handle = None

    def _do_flush(self) -> None:
        if self._file_handle and not self._file_handle.closed:
            t0 = time.perf_counter()
            try:
                self._file_handle.flush()
            except Exception:
                pass
            flush_ms = (time.perf_counter() - t0) * 1000.0
            self._record_latency(flush_ms)

    def _record_latency(self, latency_ms: float) -> None:
        self._latency_samples.append(latency_ms)
        if len(self._latency_samples) > 50:
            self._latency_samples.pop(0)
        # Exponential moving average / rolling mean
        if self._latency_samples:
            self.disk_write_latency_ms = round(sum(self._latency_samples) / len(self._latency_samples), 2)

    async def write(self, offset: int, data: bytes) -> None:
        """Asynchronously push write to queue without blocking event loop."""
        while True:
            try:
                self._queue.put_nowait((offset, data))
                return
            except queue.Full:
                # Yield to the event loop if disk queue is backlogged
                await asyncio.sleep(0.005)

    def close(self) -> None:
        """Signal writer thread to finish remaining writes, flush, and close."""
        self._stop_event.set()
        try:
            self._queue.put_nowait(None)
        except Exception:
            pass
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)


class FileManager:
    """Manages file preallocation, offset writing, batch writer lifecycle, and state persistence."""

    def __init__(self, destination_path: str, total_bytes: Optional[int] = None):
        self.destination_path = os.path.abspath(destination_path)
        self.state_path = get_state_file_path(self.destination_path)
        self.total_bytes = total_bytes
        self._batch_writer: Optional[AsyncBatchWriter] = None
        self._state_lock = asyncio.Lock()
        self._last_state_save_time: float = 0.0

    @property
    def disk_write_latency_ms(self) -> float:
        """Current average disk write and flush latency in milliseconds."""
        if self._batch_writer:
            return self._batch_writer.disk_write_latency_ms
        return 0.0

    def preallocate(self, total_bytes: int) -> None:
        """Preallocate the destination file on disk to the required size."""
        self.total_bytes = total_bytes
        os.makedirs(os.path.dirname(self.destination_path), exist_ok=True)

        # If file already exists and is the right size, keep it (e.g. for resume)
        if os.path.exists(self.destination_path):
            current_size = os.path.getsize(self.destination_path)
            if current_size == total_bytes:
                return

        # Preallocate by seeking to the last byte and writing a null byte
        with open(self.destination_path, "wb") as f:
            if total_bytes > 0:
                f.seek(total_bytes - 1)
                f.write(b"\0")
            f.flush()

    def open_for_writing(self) -> None:
        """Start the dedicated asynchronous batch writer for non-blocking file I/O."""
        if not os.path.exists(self.destination_path):
            if self.total_bytes is not None:
                self.preallocate(self.total_bytes)
            else:
                os.makedirs(os.path.dirname(self.destination_path), exist_ok=True)
                open(self.destination_path, "wb").close()

        if self._batch_writer is None:
            self._batch_writer = AsyncBatchWriter(self.destination_path, flush_interval=2.0)
            self._batch_writer.start()

    def close(self) -> None:
        """Flush and close the open writer thread."""
        if self._batch_writer:
            self._batch_writer.close()
            self._batch_writer = None

    async def write_at_offset(self, offset: int, data: bytes) -> None:
        """Write binary data at a specific byte offset in the file without blocking event loop."""
        if self._batch_writer is None:
            self.open_for_writing()
        await self._batch_writer.write(offset, data)

    async def save_state_async(self, state: DownloadState, force: bool = False) -> None:
        """Atomically persist download state in a thread without freezing the event loop.

        Throttled to avoid disk stalls on rapid chunk completions.
        """
        now = time.time()
        if not force and (now - self._last_state_save_time < 3.0):
            return

        async with self._state_lock:
            self._last_state_save_time = now
            data = asdict(state)
            state_path = self.state_path

            def _write_state():
                tmp_file = f"{state_path}.tmp"
                try:
                    with open(tmp_file, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2)
                        f.flush()
                    os.replace(tmp_file, state_path)
                except Exception as e:
                    if os.path.exists(tmp_file):
                        try:
                            os.remove(tmp_file)
                        except Exception:
                            pass
                    logger.debug(f"Failed to save state asynchronously: {e}")

            await asyncio.to_thread(_write_state)

    def save_state(self, state: DownloadState) -> None:
        """Synchronous state save fallback (used on process shutdown)."""
        tmp_file = f"{self.state_path}.tmp"
        try:
            data = asdict(state)
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                f.flush()
            os.replace(tmp_file, self.state_path)
        except Exception:
            if os.path.exists(tmp_file):
                try:
                    os.remove(tmp_file)
                except Exception:
                    pass

    def load_state(self) -> Optional[DownloadState]:
        """Load persisted download state if available."""
        if not os.path.exists(self.state_path):
            return None

        try:
            with open(self.state_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return DownloadState(**data)
        except Exception:
            return None

    def remove_state(self) -> None:
        """Remove state file upon successful download completion."""
        if os.path.exists(self.state_path):
            try:
                os.remove(self.state_path)
            except Exception:
                pass
