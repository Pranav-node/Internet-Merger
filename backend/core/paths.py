"""Application Paths and Storage Management for Internet Merger.

Manages:
- Resolution of runtime assets (frontend/dist) in both development and PyInstaller frozen modes.
- Storing user settings, history, and partial downloads in %APPDATA%\\InternetMerger (Windows)
  or ~/.internetmerger (Linux/macOS), ensuring no state is written to the read-only install directory.
"""

from __future__ import annotations

import os
import sys
from typing import Optional


def is_frozen() -> bool:
    """Return True if running as a compiled PyInstaller executable."""
    return getattr(sys, "frozen", False)


def get_base_dir() -> str:
    """Return the application base directory."""
    if is_frozen():
        # In PyInstaller onedir mode, sys.executable is in the app directory
        return os.path.dirname(os.path.abspath(sys.executable))
    # In development mode, repo root is two levels up from backend/core/
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def get_frontend_dist_dir() -> str:
    """Locate compiled frontend distribution assets across frozen and development layouts."""
    # 1. Check PyInstaller _MEIPASS (temporary extraction or internal resource dir)
    if hasattr(sys, "_MEIPASS"):
        meipass_dist = os.path.join(sys._MEIPASS, "frontend", "dist")
        if os.path.isdir(meipass_dist):
            return os.path.abspath(meipass_dist)

    # 2. Check PyInstaller onedir layout (next to executable)
    if is_frozen():
        exec_dir = os.path.dirname(os.path.abspath(sys.executable))
        candidate_1 = os.path.join(exec_dir, "frontend", "dist")
        if os.path.isdir(candidate_1):
            return os.path.abspath(candidate_1)
        # PyInstaller 6 _internal directory
        candidate_2 = os.path.join(exec_dir, "_internal", "frontend", "dist")
        if os.path.isdir(candidate_2):
            return os.path.abspath(candidate_2)

    # 3. Development / repository layout
    repo_dist = os.path.abspath(os.path.join(get_base_dir(), "frontend", "dist"))
    return repo_dist


def get_user_data_dir() -> str:
    """Return the user configuration and data directory.

    Windows: %APPDATA%\\InternetMerger (e.g. C:\\Users\\<user>\\AppData\\Roaming\\InternetMerger)
    macOS:   ~/Library/Application Support/InternetMerger
    Linux:   ~/.local/share/InternetMerger or ~/.internetmerger
    Can be overridden via INTERNET_MERGER_DATA_DIR for isolated testing.
    """
    custom_dir = os.environ.get("INTERNET_MERGER_DATA_DIR")
    if custom_dir:
        path = os.path.abspath(custom_dir)
        os.makedirs(path, exist_ok=True)
        return path

    if sys.platform == "win32":
        app_data = os.environ.get("APPDATA")
        if app_data:
            base = os.path.join(app_data, "InternetMerger")
        else:
            base = os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "InternetMerger")
    elif sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support/InternetMerger")
    else:
        xdg_data = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
        base = os.path.join(xdg_data, "InternetMerger")

    os.makedirs(base, exist_ok=True)
    return os.path.abspath(base)


def get_default_downloads_dir() -> str:
    """Return the default downloads directory inside user data or user Downloads folder.

    Ensures partial downloads (.merger.json state files) are stored in writable user space.
    """
    downloads_path = os.path.join(get_user_data_dir(), "downloads")
    os.makedirs(downloads_path, exist_ok=True)
    return downloads_path


def get_settings_file_path() -> str:
    """Return path to settings.json in user data directory."""
    return os.path.join(get_user_data_dir(), "settings.json")


def get_history_file_path() -> str:
    """Return path to history.json in user data directory."""
    return os.path.join(get_user_data_dir(), "history.json")
