"""Chunking and Queue Management.

Splits files into ranges and manages chunk lifecycle across multiple workers.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import List, Optional


class ChunkStatus(str, enum.Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    DOWNLOADING = "downloading"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Chunk:
    """Represents a byte range chunk of a file."""
    index: int
    start: int
    end: int
    size: int
    status: ChunkStatus = ChunkStatus.PENDING
    assigned_link: Optional[str] = None
    bytes_downloaded: int = 0
    retries: int = 0
    max_retries: int = 5
    last_error: Optional[str] = None

    @property
    def range_header(self) -> str:
        """Formatted Range header string."""
        return f"bytes={self.start}-{self.end}"

    @property
    def is_completed(self) -> bool:
        return self.status == ChunkStatus.COMPLETED


def calculate_chunks(total_bytes: int, chunk_size: int = 4 * 1024 * 1024) -> List[Chunk]:
    """Calculate byte ranges for a file given total bytes and desired chunk size."""
    if total_bytes <= 0:
        return []

    # If chunk size is invalid or larger than total, clamp
    if chunk_size <= 0:
        chunk_size = 4 * 1024 * 1024

    chunks: List[Chunk] = []
    chunk_index = 0
    start = 0

    while start < total_bytes:
        end = min(start + chunk_size - 1, total_bytes - 1)
        size = end - start + 1
        chunks.append(
            Chunk(
                index=chunk_index,
                start=start,
                end=end,
                size=size,
                status=ChunkStatus.PENDING,
            )
        )
        chunk_index += 1
        start = end + 1

    return chunks
