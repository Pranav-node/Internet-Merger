# Security Policy

## Threat Model

Internet Merger runs an accelerated parallel download engine on the user's local workstation. To provide a modern web-based monitoring dashboard, the application hosts a lightweight local web server on the user's machine.

Because local HTTP servers can be targeted by malicious external websites via cross-origin requests, DNS rebinding, or local port scanning, Internet Merger implements **defense-in-depth security hardening** designed to strictly isolate the application.

---

## Security Hardening Controls

| Security Threat | Mitigation Mechanism | Implementation |
| :--- | :--- | :--- |
| **Remote Access / LAN Scanning** | Loopback Interface Only | Binds exclusively to `127.0.0.1` (never `0.0.0.0`). Requests from other machines on LAN are dropped by OS networking. |
| **DNS Rebinding Attacks** | Loopback Host Enforcement | Rejects any HTTP request whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>` with `400 Bad Request`. |
| **Cross-Site Request Forgery (CSRF)** | Origin-First Validation | State-changing HTTP methods (`POST`, `PUT`, `DELETE`) and WebSocket handshakes require the `Origin` header to match the app's own loopback origin. Untrusted or external origins receive `403 Forbidden`. |
| **Cross-Site Unauthorized REST Calls** | Per-Session Cryptographic Auth Token | A 256-bit token (`secrets.token_urlsafe(32)`) is generated randomly at startup. The token is passed to the browser in the URL fragment (`#token=...`), immediately stripped from the address bar, and required as `X-Auth-Token` on all REST calls. |
| **Timing Attacks on Token Verification** | Constant-Time String Comparison | Authentication tokens are validated using `secrets.compare_digest` to prevent side-channel timing analysis. |
| **Directory Traversal** | Path Canonicalization & Confinement | Relative path components (`..`), symlinks, and drive escaping are strictly prohibited (`400 Bad Request`). |
| **Operating System Overwrite** | Protected System Directory Shield | Writing to protected system folders (e.g. `C:\Windows`, `C:\Program Files`, root system directories) is blocked. |
| **Windows Device Name Exploits** | Reserved Name Sanitization | Requests attempting to create Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) are rejected. |
| **Protocol Smuggling** | Strict Scheme Enforcement | Target URLs must strictly use `http://` or `https://`. File schemes (`file://`), FTP, or gopher are rejected. |

---

## Supported Versions

Only the latest release of Internet Merger receives security updates.

| Version | Supported |
| :--- | :--- |
| `>= 0.1.0` | :white_check_mark: Yes |
| `< 0.1.0` | :x: No |

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in Internet Merger, please do **not** open a public issue.

Please report security issues via GitHub Private Vulnerability Reporting on the repository:
- Go to the **Security** tab of the repository on GitHub.
- Click **Report a vulnerability**.
- Provide a detailed explanation of the vulnerability, including reproduction steps or proof-of-concept scripts.

We acknowledge receipt of security reports within 48 hours and work to provide a patch promptly before public disclosure.
