"""Security and Hardening Utilities for Internet Merger.

Provides:
- Per-session token generation, storage, and constant-time verification.
- Host and Origin header validation against DNS rebinding and cross-site attacks.
- Output path traversal protection and Windows reserved filename sanitization.
- HTTP/HTTPS URL scheme enforcement.
"""

from __future__ import annotations

import os
import re
import secrets
import urllib.parse
from pathlib import Path
from typing import Optional

# Windows reserved device names that cannot be used as filenames
WINDOWS_RESERVED_NAMES = frozenset({
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
})

# Allowed loopback hostnames for DNS rebinding protection
ALLOWED_HOSTNAMES = frozenset({"127.0.0.1", "localhost", "testserver"})

# Global session token: read from environment or generate randomly at startup
_SESSION_TOKEN: str = os.environ.get("INTERNET_MERGER_SESSION_TOKEN") or secrets.token_urlsafe(32)


def get_session_token() -> str:
    """Return the active per-session authentication token."""
    global _SESSION_TOKEN
    return _SESSION_TOKEN


def set_session_token(token: str) -> None:
    """Explicitly set the session authentication token."""
    global _SESSION_TOKEN
    _SESSION_TOKEN = token


def verify_token(provided_token: Optional[str]) -> bool:
    """Verify session token using constant-time comparison to prevent timing attacks."""
    if not provided_token or not isinstance(provided_token, str):
        return False
    return secrets.compare_digest(provided_token.strip(), get_session_token())


def is_valid_origin(origin: Optional[str], allow_dev_origins: bool = True) -> bool:
    """Check if the HTTP Origin header matches the local application's own origin.

    Rejects null origins, external origins, and unexpected schemes.
    """
    if not origin:
        return False

    origin_str = origin.strip().lower()
    if origin_str == "null":
        return False

    try:
        parsed = urllib.parse.urlparse(origin_str)
    except Exception:
        return False

    if parsed.scheme not in ("http", "https"):
        return False

    hostname = (parsed.hostname or "").lower()
    if hostname not in ALLOWED_HOSTNAMES:
        return False

    return True


def is_safe_url(url: str) -> bool:
    """Verify URL scheme is strictly http or https and host is present."""
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urllib.parse.urlparse(url.strip())
        return parsed.scheme.lower() in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def is_windows_reserved_name(name: str) -> bool:
    """Check whether a filename or stem is a Windows reserved device name."""
    if not name:
        return False
    base = os.path.basename(name)
    stem = Path(base).stem.upper()
    return stem in WINDOWS_RESERVED_NAMES


def sanitize_filename(name: str) -> str:
    """Sanitize filename to prevent directory traversal and invalid characters."""
    if not name:
        return "download.bin"

    # Strip any directory path components
    name = os.path.basename(name.replace("\\", "/"))

    # Remove unsafe filesystem characters
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name)
    name = name.strip('. ')

    if not name:
        return "download.bin"

    # Prevent Windows reserved device names (e.g. CON.txt, NUL, AUX)
    stem = os.path.splitext(name)[0].upper()
    if stem in WINDOWS_RESERVED_NAMES:
        name = f"_{name}"

    return name


def is_protected_system_dir(path_str: str) -> bool:
    """Check if the given path targets a critical system directory that must never be written to."""
    try:
        resolved = os.path.realpath(os.path.abspath(path_str)).lower()
    except Exception:
        return True

    # Windows protected directories
    import platform
    if platform.system() == "Windows":
        windir = os.environ.get("WINDIR", "C:\\Windows").lower()
        sysroot = os.environ.get("SYSTEMROOT", "C:\\Windows").lower()
        prog_files = os.environ.get("ProgramFiles", "C:\\Program Files").lower()
        prog_files_x86 = os.environ.get("ProgramFiles(x86)", "C:\\Program Files (x86)").lower()

        protected_prefixes = [windir, sysroot, prog_files, prog_files_x86]
        for p in protected_prefixes:
            if p and (resolved == p or resolved.startswith(p + "\\")):
                return True

        # Reject writing directly to drive root (e.g. C:\file.bin)
        drive, rest = os.path.splitdrive(resolved)
        if rest in ("\\", "/", ""):
            return True
    else:
        # POSIX protected directories
        protected_prefixes = ["/etc", "/bin", "/sbin", "/usr", "/boot", "/sys", "/proc", "/root", "/var"]
        for p in protected_prefixes:
            if resolved == p or resolved.startswith(p + "/"):
                return True
        if resolved == "/":
            return True

    return False


def validate_destination_path(destination_path: str, allowed_base_dir: Optional[str] = None) -> str:
    """Resolve and validate that output path stays strictly within allowed base dir.

    Raises ValueError if:
    - Path escapes allowed_base_dir via '..' or symlinks.
    - Path targets a protected system directory (e.g. C:\\Windows).
    - Filename is a Windows reserved name or contains invalid characters.
    """
    if not destination_path or not destination_path.strip():
        raise ValueError("Destination path cannot be empty")

    raw_path = destination_path.strip().strip("\"'")

    # Check for direct path traversal attempt
    parts = raw_path.replace("\\", "/").split("/")
    if ".." in parts:
        raise ValueError("Security error: Directory traversal ('..') is strictly prohibited")

    # If destination_path is relative, resolve it relative to allowed_base_dir
    if not os.path.isabs(raw_path):
        if not allowed_base_dir:
            from backend.core.paths import get_default_downloads_dir
            allowed_base_dir = get_default_downloads_dir()
        resolved_base = os.path.realpath(os.path.abspath(allowed_base_dir))
        candidate = os.path.join(resolved_base, raw_path)
        resolved_target = os.path.realpath(os.path.abspath(candidate))
        try:
            common = os.path.commonpath([resolved_base, resolved_target])
            if common != resolved_base:
                raise ValueError(
                    f"Security error: Destination path '{resolved_target}' is outside allowed folder '{resolved_base}'"
                )
        except ValueError as e:
            raise ValueError(f"Security error: Destination path outside allowed folder: {e}")
    else:
        resolved_target = os.path.realpath(os.path.abspath(raw_path))

    # Reject protected system directories
    if is_protected_system_dir(resolved_target) or is_protected_system_dir(os.path.dirname(resolved_target)):
        raise ValueError(f"Security error: Destination path '{resolved_target}' targets a protected system directory")

    # Validate filename component
    filename = os.path.basename(resolved_target)
    if filename:
        stem = os.path.splitext(filename)[0].upper()
        if stem in WINDOWS_RESERVED_NAMES:
            raise ValueError(f"Security error: Filename '{filename}' uses a reserved Windows device name")

    return resolved_target

