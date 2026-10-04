"""File Integrity and Checksum Verification.

Calculates cryptographic hashes (SHA-256, MD5) for downloaded files.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
from typing import Optional, Tuple


def _compute_file_hash_sync(filepath: str, algorithm: str = "sha256", chunk_size: int = 1024 * 1024) -> str:
    """Synchronous file hash calculation in chunks."""
    algo = getattr(hashlib, algorithm.lower(), None)
    if algo is None:
        raise ValueError(f"Unsupported hash algorithm: {algorithm}")

    hasher = algo()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            hasher.update(chunk)

    return hasher.hexdigest()


async def compute_file_hash(filepath: str, algorithm: str = "sha256") -> str:
    """Asynchronously compute file hash without blocking the event loop."""
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"File not found: {filepath}")

    return await asyncio.to_thread(_compute_file_hash_sync, filepath, algorithm)


async def verify_file_checksum(
    filepath: str,
    expected_checksum: str,
    algorithm: Optional[str] = None
) -> Tuple[bool, str]:
    """Verify file against expected checksum.

    Auto-detects algorithm based on hex length if algorithm not explicitly given:
    - 32 chars: MD5
    - 64 chars: SHA-256
    """
    cleaned_expected = expected_checksum.strip().lower()
    if not algorithm:
        if len(cleaned_expected) == 32:
            algorithm = "md5"
        elif len(cleaned_expected) == 64:
            algorithm = "sha256"
        else:
            algorithm = "sha256"

    actual_hash = await compute_file_hash(filepath, algorithm)
    matches = actual_hash.lower() == cleaned_expected
    return matches, actual_hash
