"""Settings and Download History Persistence for Internet Merger.

Stores user preferences and download history in %APPDATA%\\InternetMerger (Windows)
or ~/.internetmerger (Linux/macOS), ensuring no state is written to the install folder.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Any, Dict, List, Optional

from backend.core.paths import (
    get_default_downloads_dir,
    get_history_file_path,
    get_settings_file_path,
    get_user_data_dir,
)

logger = logging.getLogger("internet_merger.settings")

DEFAULT_SETTINGS = {
    "connections_per_link": 8,
    "chunk_size": 4 * 1024 * 1024,
    "auto_verify_checksum": True,
}


def load_settings() -> Dict[str, Any]:
    """Load settings from user data directory or return defaults."""
    settings_path = get_settings_file_path()
    settings = dict(DEFAULT_SETTINGS)
    settings["default_download_dir"] = get_default_downloads_dir()

    if os.path.isfile(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    settings.update(saved)
        except Exception as e:
            logger.warning("Failed to parse settings.json (%s), using defaults", e)

    return settings


def save_settings(new_settings: Dict[str, Any]) -> Dict[str, Any]:
    """Atomically persist updated settings to %APPDATA%\\InternetMerger\\settings.json."""
    current = load_settings()
    current.update(new_settings)

    settings_path = get_settings_file_path()
    os.makedirs(os.path.dirname(settings_path), exist_ok=True)

    tmp_path = f"{settings_path}.tmp.{os.getpid()}"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        os.replace(tmp_path, settings_path)
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        logger.error("Failed to save settings.json: %s", e)
        raise

    return current


def load_history() -> List[Dict[str, Any]]:
    """Load list of completed or historical downloads from user data directory."""
    history_path = get_history_file_path()
    if not os.path.isfile(history_path):
        return []

    try:
        with open(history_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
    except Exception as e:
        logger.warning("Failed to load history.json (%s)", e)

    return []


def record_history_entry(entry: Dict[str, Any]) -> None:
    """Append a completed or cancelled download task to history.json."""
    history = load_history()
    download_id = entry.get("id")

    # Update existing entry if present, else prepend
    updated = False
    for i, item in enumerate(history):
        if item.get("id") == download_id:
            history[i] = entry
            updated = True
            break
    if not updated:
        history.insert(0, entry)

    # Keep latest 250 entries
    history = history[:250]

    history_path = get_history_file_path()
    os.makedirs(os.path.dirname(history_path), exist_ok=True)

    tmp_path = f"{history_path}.tmp.{os.getpid()}"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
        os.replace(tmp_path, history_path)
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        logger.error("Failed to save history.json: %s", e)


def clear_history() -> None:
    """Clear all historical download records."""
    history_path = get_history_file_path()
    if os.path.isfile(history_path):
        try:
            os.remove(history_path)
        except Exception as e:
            logger.error("Failed to remove history.json: %s", e)
