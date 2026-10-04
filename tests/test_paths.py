"""Unit tests for path validation and Windows path sanitization."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import unittest
from backend.core.persistence import resolve_and_sanitize_destination, validate_destination_path


class TestPathSanitization(unittest.TestCase):
    def test_concatenated_windows_drive_path(self):
        # The exact scenario encountered: user pasted D:\DL after auto-filled rar path
        mangled = r"downloads/Assassin's.Creed.IV.Black.Flag-SteamRIP.com.rarD:\DL"
        resolved = resolve_and_sanitize_destination(mangled)
        self.assertTrue(resolved.startswith("D:\\DL") or resolved.startswith("D:/DL"))
        self.assertTrue(resolved.endswith("Assassin's.Creed.IV.Black.Flag-SteamRIP.com.rar"))
        self.assertNotIn("rarD:", resolved)

    def test_directory_only_path(self):
        # User entered folder only
        folder = r"D:\DL"
        resolved = resolve_and_sanitize_destination(folder, fallback_filename="game.rar")
        self.assertTrue(resolved.startswith("D:\\DL") or resolved.startswith("D:/DL"))
        self.assertTrue(resolved.endswith("game.rar"))

    def test_directory_with_trailing_slash(self):
        folder = "D:\\DL\\"
        resolved = resolve_and_sanitize_destination(folder, fallback_filename="archive.zip")
        self.assertTrue(resolved.startswith("D:\\DL") or resolved.startswith("D:/DL"))
        self.assertTrue(resolved.endswith("archive.zip"))

    def test_relative_path(self):
        rel = "downloads/test_file.iso"
        resolved = resolve_and_sanitize_destination(rel)
        self.assertTrue(os.path.isabs(resolved))
        self.assertTrue(resolved.endswith("test_file.iso"))

    def test_quoted_path(self):
        quoted = '"D:\\Downloads\\my file.bin"'
        resolved = resolve_and_sanitize_destination(quoted)
        self.assertNotIn('"', resolved)
        self.assertTrue(resolved.endswith("my file.bin"))

    def test_validate_destination_path_success(self):
        path = "downloads/test_output/valid_check.bin"
        validated = validate_destination_path(path)
        self.assertTrue(os.path.isabs(validated))


if __name__ == "__main__":
    unittest.main()
