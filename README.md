# Internet Merger — Multi-Link Parallel Download Accelerator

[![Release](https://img.shields.io/github/v/release/Pranav-node/internet-merger?style=flat-square)](https://github.com/Pranav-node/internet-merger/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=flat-square&logo=windows)](https://github.com/Pranav-node/internet-merger/releases/latest)
[![Security Hardened](https://img.shields.io/badge/Security-Hardened%20(127.0.0.1%20only)-success?style=flat-square)](SECURITY.md)

Internet Merger is a high-performance download accelerator that merges multiple internet connections (such as Home Wi-Fi + USB 4G/5G mobile tethering + Ethernet) to accelerate large file downloads. It pulls independent byte ranges concurrently across your physical network adapters and reassembles them on disk into a bit-exact file.

Controlled through a clean desktop web UI, powered by a local, security-hardened engine bound exclusively to `127.0.0.1`.

---

## Quick Start (Windows)

### Option 1: Standalone Download (No Python or Node Required)
1. Download **[`InternetMerger-windows.zip`](https://github.com/Pranav-node/internet-merger/releases/latest)** from the latest release.
2. Unzip the folder anywhere (e.g. `Downloads` or `Desktop`). **No administrator privileges required.**
3. Double-click **`InternetMerger.exe`**.
4. Your default browser opens automatically to your private dashboard.

### Option 2: Run from Source
```powershell
# Clone the repository
git clone https://github.com/Pranav-node/internet-merger.git
cd internet-merger

# Run one-click setup & launcher
python run.py
```
*`run.py` automatically checks requirements, installs missing dependencies, builds frontend assets, generates a secure session token, and starts the server.*

---

## Honest Technical Limits

We believe in transparency. Multi-link bonding is governed by network physics:

| Scenario | Bandwidth Behavior | Why? |
| :--- | :--- | :--- |
| **Two Adapters on the Same Router** | **No additive bandwidth** (speeds do not add up) | Both adapters share the same upstream broadband cable or fiber line. Merging only helps if the remote server throttles per-connection speeds. |
| **Genuinely Separate Internet Links** (e.g. Home Fiber + 4G/5G Phone Hotspot) | **True additive bandwidth** (e.g. 50 Mbps + 30 Mbps = ~80 Mbps) | Packets travel through distinct physical gateways and independent carrier infrastructure. |
| **Active VPN Adapters (`WinError 10013`)** | **Packets blocked on physical link** | Corporate VPNs and WFP (Windows Filtering Platform) drivers frequently lock outbound routing to their tunnel adapter, blocking attempts to route packets over secondary adapters. Pause or disconnect VPN to merge links. |
| **Servers Without HTTP Range Support** | **Automatic single-stream fallback** | If a remote server does not support `Range: bytes=X-Y`, files cannot be split across multiple links. Internet Merger detects this automatically and falls back gracefully. |

---

## Key Features

- **Multi-Interface Socket Pinning:**
  - **Windows:** Dual-stack TCP socket binding via `IP_UNICAST_IF` (Winsock option 31) combined with interface IP pinning.
  - **Linux:** Native `SO_BINDTODEVICE` binding.
  - **macOS:** `IP_BOUND_IF` socket binding.
- **Visual Folder Browser:** Built-in **Browse...** button for selecting download folders on any local drive or volume.
- **Security Hardened by Default:**
  - Binds strictly to `127.0.0.1` (never exposed to LAN or WAN).
  - DNS rebinding prevention via strict `Host` header checks (`127.0.0.1` and `localhost`).
  - Origin-first enforcement (`403 Forbidden` on external or cross-site origins).
  - 256-bit cryptographic per-session token (`secrets.token_urlsafe(32)`) passed in URL fragment and removed from address bar.
  - Path traversal and OS system folder protection (`C:\Windows`, `C:\Program Files` shielded).
- **Crash Resilience & Resumption:** Sparse disk allocation with continuous `<filename>.merger.json` state tracking. Interrupted downloads resume without re-downloading finished chunks.
- **Dynamic Chunk Work Queue:** Work items adaptively distribute across connections—faster links automatically claim more chunks.
- **Streaming Checksum Verification:** Automated SHA-256 and MD5 hash verification.

---

## Building from Source

To package the standalone release yourself:
```powershell
.\build.ps1
```
This PowerShell script:
1. Compiles the frontend bundle with Vite (`npm run build`).
2. Runs PyInstaller in `--onedir` mode with Uvicorn hidden imports.
3. Produces `InternetMerger-windows.zip` and writes its SHA-256 hash to `checksums.txt`.

---

## Testing

Run the comprehensive test suite (all 6 verification and security scenarios):
```powershell
python run_all_tests.py
```
Or run the security hardening unit tests:
```powershell
python test_security.py
```

---

## License & Security

- **License:** [MIT License](LICENSE)
- **Security Policy:** [SECURITY.md](SECURITY.md)
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
