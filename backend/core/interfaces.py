"""Network Interface Detection, VPN Inspection, Friendly Labeling, and Socket Pinning.

Cross-platform support for discovering network adapters, detecting active VPN tunnels,
friendly device labeling (USB Tethering, Wi-Fi, Ethernet), filtering inactive/VPN/APIPA adapters,
isolated 10-second link benchmarking, and forcing outbound TCP traffic through specific physical interfaces.

Supported Interface Pinning:
- Windows: IP_UNICAST_IF (Winsock IPPROTO_IP option 31, index in network byte order) + source IP bind
- Linux: SO_BINDTODEVICE (SOL_SOCKET option 25) + source IP bind
- macOS: IP_BOUND_IF (IPPROTO_IP option 25, index in network byte order) + source IP bind
"""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import socket
import struct
import sys
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import aiohttp
import psutil

logger = logging.getLogger("internet_merger.interfaces")

# Platform-specific socket options
# IP_UNICAST_IF on Windows Winsock is 31
IP_UNICAST_IF_WIN = 31
# SO_BINDTODEVICE on Linux is 25
SO_BINDTODEVICE_LINUX = 25
# IP_BOUND_IF on macOS is 25
IP_BOUND_IF_DARWIN = 25

# Known VPN and tunneling adapter indicators
VPN_KEYWORDS = (
    "warp",
    "cloudflare",
    "wireguard",
    "openvpn",
    "tap",
    "tun",
    "tailscale",
    "zerotier",
    "nordvpn",
    "proton",
    "mullvad",
    "surfshark",
    "expressvpn",
    "speedify",
    "wintun",
    "vpn",
)


@dataclass
class InterfaceInfo:
    """Represents a local network adapter and IPv4 address."""
    id: str  # e.g. "Ethernet 2:10.184.124.167"
    adapter_name: str
    ip: str
    friendly_label: str = ""
    netmask: Optional[str] = None
    broadcast: Optional[str] = None
    is_up: bool = True
    speed_mbps: int = 0
    is_loopback: bool = False
    is_link_local: bool = False
    is_default: bool = False
    is_vpn: bool = False
    is_hidden_by_default: bool = False
    vpn_name: Optional[str] = None
    if_index: Optional[int] = None
    description: str = ""


def _is_vpn_adapter(name: str) -> bool:
    """Check if adapter name matches known VPN or tunnel interfaces."""
    lower_name = name.lower()
    return any(k in lower_name for k in VPN_KEYWORDS)


def get_friendly_adapter_label(adapter_name: str, description: str = "") -> str:
    """Generate clean, friendly label for adapter (e.g. 'USB Tethering', 'Wi-Fi', 'Ethernet')."""
    combined = f"{adapter_name} {description}".lower()

    if _is_vpn_adapter(adapter_name):
        return f"{adapter_name} (VPN Tunnel)"

    if any(k in combined for k in ("rndis", "tether", "android", "remote ndis", "usb ethernet", "gadget")):
        return f"{adapter_name} (USB Tethering)"

    if "wi-fi" in adapter_name.lower() or "wifi" in adapter_name.lower():
        return adapter_name
    if any(k in combined for k in ("wi-fi", "wifi", "wireless", "802.11", "wlan")):
        return f"{adapter_name} (Wi-Fi)"

    if "ethernet" in adapter_name.lower():
        return adapter_name
    if any(k in combined for k in ("ethernet", "gigabit", "realtek", "intel", "lan", "pcie")):
        return f"{adapter_name} (Ethernet)"

    if any(k in combined for k in ("cellular", "lte", "mobile broadband", "5g", "wwan")):
        return f"{adapter_name} (Mobile Data)"

    return adapter_name


def get_windows_if_index_for_ip(ip_address: str) -> Optional[int]:
    """Retrieve the Windows interface index for a local IPv4 address."""
    if platform.system() != "Windows":
        return None
    try:
        import ctypes
        from ctypes import wintypes

        iphlpapi = ctypes.windll.iphlpapi
        dest_ip = socket.inet_aton(ip_address)
        ip_ulong = ctypes.c_ulong.from_buffer_copy(dest_ip).value
        if_index = wintypes.DWORD()
        res = iphlpapi.GetBestInterface(ip_ulong, ctypes.byref(if_index))
        if res == 0:
            return if_index.value
    except Exception as e:
        logger.debug(f"Failed to query GetBestInterface for {ip_address}: {e}")
    return None


def get_available_interfaces() -> List[InterfaceInfo]:
    """Scan the system for available network interfaces and their IPv4 addresses."""
    interfaces: List[InterfaceInfo] = []
    stats_map = psutil.net_if_stats()
    addrs_map = psutil.net_if_addrs()

    # Determine default gateway/route if possible
    default_ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        default_ips.add(s.getsockname()[0])
        s.close()
    except Exception:
        pass

    for adapter_name, addrs in addrs_map.items():
        stats = stats_map.get(adapter_name)
        is_up = stats.isup if stats else True
        speed = stats.speed if stats else 0
        is_vpn = _is_vpn_adapter(adapter_name)

        for addr in addrs:
            if addr.family != socket.AF_INET:
                continue

            ip = addr.address
            is_loopback = ip.startswith("127.") or adapter_name.lower().startswith("loopback")
            is_link_local = ip.startswith("169.254.")
            is_default = ip in default_ips

            if_index = None
            if platform.system() == "Windows":
                if_index = get_windows_if_index_for_ip(ip)

            friendly = get_friendly_adapter_label(adapter_name)
            desc = f"{friendly} ({ip})"
            if is_vpn:
                desc += " [VPN Tunnel]"
            elif is_default:
                desc += " [Default Gateway]"

            # In the panel, hide interfaces that are DOWN, APIPA (169.254.x.x), or VPN tunnels by default
            is_hidden_by_default = (not is_up) or is_link_local or is_vpn or is_loopback

            info = InterfaceInfo(
                id=f"{adapter_name}:{ip}",
                adapter_name=adapter_name,
                ip=ip,
                friendly_label=friendly,
                netmask=addr.netmask,
                broadcast=addr.broadcast,
                is_up=is_up,
                speed_mbps=speed,
                is_loopback=is_loopback,
                is_link_local=is_link_local,
                is_default=is_default,
                is_vpn=is_vpn,
                is_hidden_by_default=is_hidden_by_default,
                vpn_name=adapter_name if is_vpn else None,
                if_index=if_index,
                description=desc,
            )
            interfaces.append(info)

    # Sort: default first, then healthy active physical links, then VPNs, then down/link-local
    interfaces.sort(
        key=lambda x: (
            not x.is_default,
            not (x.is_up and not x.is_hidden_by_default),
            x.is_vpn,
            x.is_link_local,
            x.adapter_name,
        )
    )
    return interfaces


def detect_active_vpns() -> List[InterfaceInfo]:
    """Return all active VPN adapters on the system."""
    return [i for i in get_available_interfaces() if i.is_vpn and i.is_up and not i.is_loopback]


def make_socket_factory(bind_ip: Optional[str] = None):
    """Create a custom socket factory callback for aiohttp TCPConnector.

    This ensures the socket is manually created and pinned with IP_UNICAST_IF / SO_BINDTODEVICE
    and bound to bind_ip before aiohappyeyeballs or asyncio establishes connection.
    """
    if not bind_ip or bind_ip == "0.0.0.0":
        return None

    if_index = None
    if platform.system() == "Windows":
        if_index = get_windows_if_index_for_ip(bind_ip)

    def socket_factory(addr_info):
        family, type_, proto, _, _ = addr_info
        sock = socket.socket(family=family, type=type_, proto=proto)
        sock.setblocking(False)

        # Apply OS-level interface pinning
        current_os = platform.system()
        if current_os == "Windows" and if_index:
            try:
                # Network byte order via htonl
                sock.setsockopt(socket.IPPROTO_IP, IP_UNICAST_IF_WIN, socket.htonl(if_index))
                logger.debug(f"[Worker Socket] Set IP_UNICAST_IF={if_index} for IP={bind_ip}")
            except Exception as e:
                logger.warning(f"Could not setsockopt IP_UNICAST_IF={if_index}: {e}")
        elif current_os == "Linux":
            for iface, addrs in psutil.net_if_addrs().items():
                for a in addrs:
                    if a.family == socket.AF_INET and a.address == bind_ip:
                        try:
                            sock.setsockopt(socket.SOL_SOCKET, SO_BINDTODEVICE_LINUX, iface.encode())
                        except Exception:
                            pass
                        break
        elif current_os == "Darwin" and hasattr(socket, "if_nametoindex"):
            for iface, addrs in psutil.net_if_addrs().items():
                for a in addrs:
                    if a.family == socket.AF_INET and a.address == bind_ip:
                        try:
                            idx = socket.if_nametoindex(iface)
                            sock.setsockopt(socket.IPPROTO_IP, IP_BOUND_IF_DARWIN, struct.pack("I", idx))
                        except Exception:
                            pass
                        break

        # Bind source IP
        try:
            sock.bind((bind_ip, 0))
        except Exception as e:
            logger.error(f"[Worker Socket] Failed to bind ({bind_ip}, 0): {e}")
            sock.close()
            raise e

        return sock

    return socket_factory


def create_tcp_connector(bind_ip: Optional[str] = None, limit: int = 100, ssl: Any = False) -> aiohttp.TCPConnector:
    """Create an aiohttp TCPConnector configured with low-level socket pinning and SSL tolerance."""
    if bind_ip and bind_ip != "0.0.0.0":
        factory = make_socket_factory(bind_ip)
        return aiohttp.TCPConnector(
            socket_factory=factory,
            family=socket.AddressFamily.AF_INET,
            limit=limit,
            limit_per_host=0,
            ttl_dns_cache=300,
            keepalive_timeout=30.0,
            enable_cleanup_closed=True,
            ssl=ssl,
        )
    else:
        return aiohttp.TCPConnector(
            limit=limit,
            limit_per_host=0,
            ttl_dns_cache=300,
            keepalive_timeout=30.0,
            enable_cleanup_closed=True,
            ssl=ssl,
        )


def format_network_error(exc: Exception, bind_ip: Optional[str] = None) -> str:
    """Format raw network exceptions into clear, plain-language diagnosis messages."""
    err_str = str(exc)
    err_type = type(exc).__name__

    if "10013" in err_str or "Access is denied" in err_str:
        return (
            f"Blocked by Windows Security/VPN (WinError 10013). "
            f"An active VPN (WARP/WireGuard) or firewall is blocking outbound traffic from {bind_ip}."
        )

    if "10065" in err_str or "no route to host" in err_str.lower() or "network is unreachable" in err_str.lower():
        return f"No route to host. Interface {bind_ip} has no active gateway or is disconnected."

    if "timeout" in err_str.lower() or "TimeoutError" in err_type:
        return f"Connection timed out on interface {bind_ip}."

    if "10061" in err_str or "connection refused" in err_str.lower():
        return f"Connection refused on interface {bind_ip}."

    if "certificate" in err_str.lower() or "ssl" in err_str.lower():
        return f"SSL/TLS Certificate issue on {bind_ip or 'connection'}: {err_str}"

    return f"{err_type}: {err_str}"


async def fetch_public_ip_for_interface(
    bind_ip: Optional[str] = None,
    timeout: float = 6.0
) -> Tuple[bool, Optional[str], Optional[str]]:
    """Fetch external public IP through a specific local network interface."""
    endpoints = [
        "http://api.ipify.org",
        "http://icanhazip.com",
        "http://ifconfig.me/ip",
    ]

    connector = create_tcp_connector(bind_ip=bind_ip)
    client_timeout = aiohttp.ClientTimeout(total=timeout, sock_connect=timeout, sock_read=timeout)
    last_error: Optional[Exception] = None

    async with aiohttp.ClientSession(connector=connector, timeout=client_timeout) as session:
        for url in endpoints:
            try:
                headers = {"User-Agent": "curl/7.68.0"}
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        ip_text = (await resp.text()).strip()
                        ip_candidate = ip_text.split("\n")[0].strip()
                        return True, ip_candidate, None
            except Exception as e:
                last_error = e

    diagnosis = format_network_error(last_error or Exception("All IP test endpoints failed"), bind_ip)
    return False, None, diagnosis


async def test_interface_connectivity(
    bind_ip: Optional[str] = None,
    timeout: float = 4.0
) -> Tuple[bool, str]:
    """Test outbound TCP connectivity through a specific interface."""
    success, public_ip, err = await fetch_public_ip_for_interface(bind_ip, timeout=timeout)
    return success, err or "Connected successfully"


async def run_isolated_link_benchmark(
    bind_ip: str,
    test_url: Optional[str] = None,
    duration_seconds: float = 10.0,
) -> Dict[str, ]:
    """Benchmark a single network interface alone for ~10 seconds to measure maximum raw throughput.

    Streams data without disk write overhead to measure pure network capacity.
    """
    default_test_urls = [
        "https://releases.ubuntu.com/24.04/ubuntu-24.04.1-desktop-amd64.iso",
        "https://speed.hetzner.de/100MB.bin",
        "http://127.0.0.1:8088/range-file",
    ]

    urls_to_try = [test_url] if test_url else default_test_urls
    connector = create_tcp_connector(bind_ip=bind_ip)
    client_timeout = aiohttp.ClientTimeout(total=duration_seconds + 5.0, sock_connect=6.0, sock_read=8.0)

    total_bytes = 0
    t_start = 0.0
    actual_duration = 0.0
    last_error = None

    async with aiohttp.ClientSession(connector=connector, timeout=client_timeout) as session:
        for target_url in urls_to_try:
            if not target_url:
                continue
            try:
                headers = {"User-Agent": "curl/7.68.0", "Range": "bytes=0-1048576000"}
                async with session.get(target_url, headers=headers) as resp:
                    if resp.status not in (200, 206):
                        continue

                    t_start = time.perf_counter()
                    t_end = t_start + duration_seconds

                    # Read stream in 64KB blocks without writing to disk
                    async for chunk in resp.content.iter_chunked(65536):
                        total_bytes += len(chunk)
                        now = time.perf_counter()
                        if now >= t_end:
                            actual_duration = now - t_start
                            break

                    if actual_duration == 0:
                        actual_duration = max(time.perf_counter() - t_start, 0.1)

                    speed_bps = total_bytes / actual_duration
                    speed_mbps = round(speed_bps * 8 / 1e6, 2)
                    speed_mb_s = round(speed_bps / (1024 * 1024), 2)

                    return {
                        "ip": bind_ip,
                        "success": True,
                        "bytes_transferred": total_bytes,
                        "duration_s": round(actual_duration, 2),
                        "speed_bps": round(speed_bps, 2),
                        "speed_mbps": speed_mbps,
                        "speed_mb_s": speed_mb_s,
                        "error": None,
                    }
            except Exception as e:
                last_error = e

    diagnosis = format_network_error(last_error or Exception("Benchmark failed to connect"), bind_ip)
    return {
        "ip": bind_ip,
        "success": False,
        "bytes_transferred": total_bytes,
        "duration_s": round(actual_duration, 2),
        "speed_bps": 0.0,
        "speed_mbps": 0.0,
        "speed_mb_s": 0.0,
        "error": diagnosis,
    }
