"""Download Queue and Life-Cycle Manager.

Coordinates multiple downloads, queues, persistence across app restarts,
and broadcasts progress updates.
"""

from __future__ import annotations

import asyncio
import glob
import os
import urllib.parse
import uuid
from typing import Callable, Dict, List, Optional

from backend.core.downloader import DownloadStatus, DownloadTask
from backend.core.persistence import (
    FileManager,
    resolve_and_sanitize_destination,
    validate_destination_path,
)
from backend.core.probing import probe_url


class DownloadManager:
    """Manages active, queued, and historical downloads."""

    def __init__(self, default_download_dir: str = "downloads", max_active_downloads: int = 3):
        self.default_download_dir = os.path.abspath(default_download_dir)
        os.makedirs(self.default_download_dir, exist_ok=True)
        self.max_active_downloads = max_active_downloads
        self.tasks: Dict[str, DownloadTask] = {}
        self.on_state_change: Optional[Callable[[], None]] = None
        self._queue_lock = asyncio.Lock()
        self._running_task_handles: Dict[str, asyncio.Task] = {}

    def get_all_downloads(self) -> List[dict]:
        """Return serialized state of all managed downloads."""
        return [task.to_dict() for task in self.tasks.values()]

    def get_download(self, download_id: str) -> Optional[DownloadTask]:
        """Retrieve task by ID."""
        return self.tasks.get(download_id)

    async def add_download(
        self,
        url: str,
        destination_path: Optional[str] = None,
        bind_ips: Optional[List[Optional[str]]] = None,
        connections_per_link: int = 8,
        chunk_size: int = 4 * 1024 * 1024,
        expected_checksum: Optional[str] = None,
    ) -> DownloadTask:
        """Create and queue a new download task."""
        # Normalize and validate destination path
        if not destination_path or not destination_path.strip():
            # Will be set to filename in default_download_dir after probe
            destination_path = self.default_download_dir

        # Determine fallback filename from URL
        fallback_name = "download.bin"
        try:
            parsed = urllib.parse.urlparse(url)
            cand = os.path.basename(urllib.parse.unquote(parsed.path))
            if cand and cand.strip():
                fallback_name = cand.strip()
        except Exception:
            pass

        target_path = destination_path or self.default_download_dir
        dest = resolve_and_sanitize_destination(target_path, fallback_filename=fallback_name)

        if os.path.isdir(dest):
            try:
                probe = await probe_url(url)
                dest = os.path.join(dest, probe.filename)
            except Exception:
                dest = os.path.join(dest, fallback_name)

        dest = validate_destination_path(dest, allowed_base_dir=self.default_download_dir)

        download_id = str(uuid.uuid4())[:8]
        task = DownloadTask(
            download_id=download_id,
            url=url,
            destination_path=dest,
            bind_ips=bind_ips,
            connections_per_link=connections_per_link,
            chunk_size=chunk_size,
            expected_checksum=expected_checksum,
        )

        self.tasks[download_id] = task
        self._start_task_if_capacity_allows(task)
        return task

    def _start_task_if_capacity_allows(self, task: DownloadTask) -> None:
        """Start task if currently running count is below max limit."""
        running_count = sum(
            1 for t in self.tasks.values() if t.status in (DownloadStatus.PROBING, DownloadStatus.DOWNLOADING)
        )
        if running_count < self.max_active_downloads:
            handle = asyncio.create_task(self._run_task_wrapper(task))
            self._running_task_handles[task.download_id] = handle

    async def _run_task_wrapper(self, task: DownloadTask) -> None:
        """Run task and process next queued download on completion."""
        try:
            await task.start()
        finally:
            self._running_task_handles.pop(task.download_id, None)
            try:
                from backend.core.settings import record_history_entry
                record_history_entry(task.to_dict())
            except Exception:
                pass
            self._check_queue()

    def _check_queue(self) -> None:
        """Trigger queued downloads when a slot becomes available."""
        running_count = sum(
            1 for t in self.tasks.values() if t.status in (DownloadStatus.PROBING, DownloadStatus.DOWNLOADING)
        )
        available_slots = self.max_active_downloads - running_count
        if available_slots <= 0:
            return

        for task in self.tasks.values():
            if task.status == DownloadStatus.QUEUED:
                handle = asyncio.create_task(self._run_task_wrapper(task))
                self._running_task_handles[task.download_id] = handle
                available_slots -= 1
                if available_slots <= 0:
                    break

    async def pause_download(self, download_id: str) -> bool:
        """Pause a running download."""
        task = self.tasks.get(download_id)
        if not task:
            return False
        if task.status in (DownloadStatus.DOWNLOADING, DownloadStatus.PROBING):
            await task.pause()
            self._check_queue()
            return True
        elif task.status == DownloadStatus.QUEUED:
            task.status = DownloadStatus.PAUSED
            return True
        return False

    async def resume_download(self, download_id: str) -> bool:
        """Resume a paused download."""
        task = self.tasks.get(download_id)
        if not task:
            return False

        if task.status == DownloadStatus.PAUSED:
            # If workers are still in memory and just paused
            if task._file_manager and task.status == DownloadStatus.PAUSED:
                await task.resume()
                return True
            else:
                task.status = DownloadStatus.QUEUED
                self._start_task_if_capacity_allows(task)
                return True
        elif task.status in (DownloadStatus.CANCELLED, DownloadStatus.FAILED):
            task.status = DownloadStatus.QUEUED
            self._start_task_if_capacity_allows(task)
            return True
        return False

    async def cancel_download(self, download_id: str) -> bool:
        """Cancel a download."""
        task = self.tasks.get(download_id)
        if task:
            await task.cancel()
            self._check_queue()
            return True
        return False

    async def delete_download(self, download_id: str, delete_file: bool = False) -> bool:
        """Remove download from manager and optionally delete physical file."""
        task = self.tasks.get(download_id)
        if not task:
            return False

        if task.status in (DownloadStatus.DOWNLOADING, DownloadStatus.PROBING):
            await task.cancel()

        self.tasks.pop(download_id, None)

        if delete_file:
            try:
                if os.path.exists(task.destination_path):
                    os.remove(task.destination_path)
                state_file = f"{task.destination_path}.merger.json"
                if os.path.exists(state_file):
                    os.remove(state_file)
            except Exception:
                pass

        self._check_queue()
        return True

    def scan_for_resumable_downloads(self) -> None:
        """Scan the default download directory for existing .merger.json state files."""
        pattern = os.path.join(self.default_download_dir, "*.merger.json")
        for state_file in glob.glob(pattern):
            try:
                dest_path = state_file[:-12]  # Strip .merger.json
                fm = FileManager(dest_path)
                saved_state = fm.load_state()
                if saved_state and os.path.exists(dest_path):
                    # Check if already in tasks
                    if not any(t.destination_path == dest_path for t in self.tasks.values()):
                        task = DownloadTask(
                            download_id=saved_state.download_id or str(uuid.uuid4())[:8],
                            url=saved_state.url,
                            destination_path=dest_path,
                            chunk_size=saved_state.chunk_size,
                        )
                        task.status = DownloadStatus.PAUSED
                        task.total_bytes = saved_state.total_bytes
                        task.completed_chunk_indices = set(saved_state.completed_chunks)
                        task.downloaded_bytes = len(saved_state.completed_chunks) * saved_state.chunk_size
                        task.filename = saved_state.filename
                        self.tasks[task.download_id] = task
            except Exception:
                pass
