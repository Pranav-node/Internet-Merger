# Changelog

All notable changes to Internet Merger will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-10-04

### Added
- **Multi-Link WAN Bonding**: Concurrent chunked downloading utilizing multiple physical network adapters (e.g. Wi-Fi + USB 4G/5G tethering + Ethernet) using dual-stack socket binding (`IP_UNICAST_IF` on Windows, `SO_BINDTODEVICE` on Linux).
- **Automated Security Hardening**:
  - Exclusively loopback interface binding (`127.0.0.1`).
  - DNS rebinding defense via strict `Host` header filtering (`127.0.0.1` and `localhost`).
  - Origin-first enforcement for all mutating REST endpoints and WebSocket handshakes (`403 Forbidden` on external or null origins).
  - Cryptographic per-session token generation (`secrets.token_urlsafe(32)`) passed via URL fragment (`#token=...`), immediately stripped from the address bar, and authenticated via `secrets.compare_digest`.
  - Directory traversal prevention (`..`), protected system folder shields, and Windows reserved device name validation (`CON`, `PRN`, `AUX`, `NUL`).
- **Interactive Folder Browser**:
  - Native OS directory picker dialog integration via `POST /api/browse-folder`.
  - Visual **Browse...** button in both the New Download modal and Settings tab for effortless directory selection on any drive.
- **Standalone Windows Distribution**:
  - Automated `build.ps1` packaging into `InternetMerger-windows.zip` with PyInstaller `--onedir`.
  - Zero administrator privileges required: user data, checkpoint files, and settings persist safely in `%APPDATA%\InternetMerger`.
  - Automated port conflict resolution (auto-allocating the next available port).
- **Release Automation**:
  - GitHub Actions workflow (`.github/workflows/release.yml`) triggered on `v*` tags to compile standalone binaries, generate SHA-256 checksums, and publish GitHub releases.
- **Documentation & Open Source**:
  - MIT License (`LICENSE`).
  - Security threat model and vulnerability disclosure policy (`SECURITY.md`).
  - Comprehensive guide with honest technical limitations and troubleshooting (`README.md`).
