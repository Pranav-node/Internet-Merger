"""Native OS Folder Browser Dialog for Internet Merger.

Supports Windows, macOS, and Linux native folder selection dialogs
without external GUI framework dependencies.
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
from typing import Optional

logger = logging.getLogger("internet_merger.dialog")


def pick_folder_native(initial_dir: Optional[str] = None) -> Optional[str]:
    """Open a native OS directory picker dialog and return selected path, or None if cancelled."""
    system = platform.system()
    init_dir = os.path.normpath(initial_dir) if initial_dir and os.path.isdir(initial_dir) else ""

    # Windows: Strategy 1 - Tkinter (built into standard Python / PyInstaller)
    # Strategy 2 - PowerShell System.Windows.Forms.FolderBrowserDialog
    if system == "Windows":
        # First attempt: Tkinter askdirectory
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.wm_attributes("-topmost", 1)
            root.focus_force()

            selected = filedialog.askdirectory(
                parent=root,
                title="Select Download Folder",
                initialdir=init_dir or None,
                mustexist=True,
            )
            root.destroy()
            if selected:
                return os.path.normpath(selected)
            return None
        except Exception as e:
            logger.debug("Tkinter askdirectory failed, trying PowerShell: %s", e)

        # Fallback for Windows: PowerShell with FolderBrowserDialog
        try:
            ps_code = [
                "Add-Type -AssemblyName System.Windows.Forms;",
                "$f = New-Object System.Windows.Forms.FolderBrowserDialog;",
                "$f.Description = 'Select Download Folder';",
                "$f.AutoUpgradeEnabled = $true;",
            ]
            if init_dir:
                ps_code.append(f"$f.SelectedPath = '{init_dir}';")
            ps_code.append("if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath }")

            res = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", " ".join(ps_code)],
                capture_output=True,
                text=True,
                timeout=180,
            )
            out = res.stdout.strip()
            if out and os.path.isdir(out):
                return os.path.normpath(out)
            return None
        except Exception as e:
            logger.error("PowerShell folder picker failed: %s", e)
            return None

    # macOS: Strategy 1 - osascript (native AppleScript dialog)
    elif system == "Darwin":
        try:
            default_loc = f'default location POSIX file "{init_dir}"' if init_dir else ""
            script = f'POSIX path of (choose folder with prompt "Select Download Folder" {default_loc})'
            res = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=120)
            if res.returncode == 0 and res.stdout.strip():
                return os.path.normpath(res.stdout.strip())
            return None
        except Exception as e:
            logger.debug("osascript failed: %s", e)

    # Linux: Strategy 1 - zenity, Strategy 2 - kdialog, Strategy 3 - Tkinter
    elif system == "Linux":
        for cmd in [
            ["zenity", "--file-selection", "--directory", "--title=Select Download Folder"],
            ["kdialog", "--getexistingdirectory", init_dir or os.path.expanduser("~")],
        ]:
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                if res.returncode == 0 and res.stdout.strip():
                    return os.path.normpath(res.stdout.strip())
            except Exception:
                continue

    # Universal Tkinter fallback for POSIX
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        selected = filedialog.askdirectory(title="Select Download Folder", initialdir=init_dir or None)
        root.destroy()
        if selected:
            return os.path.normpath(selected)
    except Exception:
        pass

    return None
