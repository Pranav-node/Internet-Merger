"""REST API Endpoints for Internet Merger.

Provides endpoints for managing downloads, querying network interfaces,
probing URLs, dynamic connection scaling & autotuning, and isolated 10-second link benchmarking.
"""

from __future__ import annotations

import asyncio
import os
import platform
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.core.downloader import DownloadStatus
from backend.core.interfaces import (
    detect_active_vpns,
    fetch_public_ip_for_interface,
    get_available_interfaces,
    get_windows_if_index_for_ip,
    run_isolated_link_benchmark,
    test_interface_connectivity,
)
from backend.core.dialog import pick_folder_native
from backend.core.manager import DownloadManager
from backend.core.probing import probe_url
from backend.core.security import is_safe_url, validate_destination_path
from backend.core.settings import clear_history, load_history, load_settings, save_settings

router = APIRouter(prefix="/api")

# Global manager instance (injected by app.py)
download_manager: Optional[DownloadManager] = None


def get_manager() -> DownloadManager:
    if download_manager is None:
        raise RuntimeError("Download manager is not initialized")
    return download_manager


class CreateDownloadRequest(BaseModel):
    url: str = Field(..., description="Target HTTP or HTTPS URL to download")
    destination_path: Optional[str] = Field(None, description="Output directory or exact file path")
    bind_ips: Optional[List[str]] = Field(None, description="Local IP addresses to bind to")
    connections_per_link: int = Field(8, ge=1, le=32, description="Parallel connections per interface")
    chunk_size: int = Field(4 * 1024 * 1024, ge=256 * 1024, le=64 * 1024 * 1024, description="Chunk size in bytes")
    expected_checksum: Optional[str] = Field(None, description="Optional expected SHA-256 or MD5 checksum")


class ProbeRequest(BaseModel):
    url: str = Field(..., description="URL to probe")


class TestLinkRequest(BaseModel):
    ip: str = Field(..., description="Local interface IP to test")


class BenchmarkRequest(BaseModel):
    ip: str = Field(..., description="Interface IP to benchmark")
    test_url: Optional[str] = Field(None, description="Optional download URL to benchmark against")
    duration_seconds: float = Field(10.0, ge=3.0, le=30.0, description="Benchmark duration in seconds")


class BenchmarkAllRequest(BaseModel):
    test_url: Optional[str] = Field(None, description="Optional download URL to benchmark against")
    duration_seconds: float = Field(10.0, ge=3.0, le=30.0, description="Benchmark duration in seconds")


class SetConnectionsRequest(BaseModel):
    connections_per_link: int = Field(..., ge=1, le=32, description="Desired connection count per link")


class BrowseFolderRequest(BaseModel):
    initial_dir: Optional[str] = Field(None, description="Starting directory path for folder dialog")


@router.get("/interfaces")
async def list_interfaces(test_reachability: bool = Query(False, description="Test TCP outbound reachability")):
    """Get detected local network interfaces, IPv4 addresses, and active VPN warning."""
    ifaces = get_available_interfaces()
    active_vpns = detect_active_vpns()
    has_active_vpn = len(active_vpns) > 0

    vpn_warning = None
    if has_active_vpn:
        names = ", ".join(f"'{v.adapter_name}' ({v.ip})" for v in active_vpns)
        vpn_warning = (
            f"Active VPN adapter detected: {names}. "
            f"VPN tunnels and Windows Filtering Platform (WFP) drivers frequently override system routing "
            f"and block outbound packets on physical adapters (WinError 10013: Access Denied). "
            f"If physical links show 0 B/s or connect errors, disconnect or pause the VPN while multi-link merging."
        )

    result = []
    for iface in ifaces:
        if iface.is_loopback:
            continue

        item = {
            "id": iface.id,
            "adapter_name": iface.adapter_name,
            "friendly_label": iface.friendly_label or iface.adapter_name,
            "ip": iface.ip,
            "if_index": iface.if_index,
            "is_up": iface.is_up,
            "is_default": iface.is_default,
            "is_link_local": iface.is_link_local,
            "is_vpn": iface.is_vpn,
            "is_hidden_by_default": iface.is_hidden_by_default,
            "vpn_name": iface.vpn_name,
            "speed_mbps": iface.speed_mbps,
            "description": iface.description,
            "reachable": None,
        }

        if test_reachability and iface.is_up and not iface.is_link_local:
            ok, _ = await test_interface_connectivity(iface.ip)
            item["reachable"] = ok

        result.append(item)

    return {
        "interfaces": result,
        "has_active_vpn": has_active_vpn,
        "active_vpns": [v.adapter_name for v in active_vpns],
        "vpn_warning": vpn_warning,
    }


@router.post("/interfaces/test-link")
async def test_link_endpoint(req: TestLinkRequest):
    """Test a specific interface by attempting to fetch the public IP through it."""
    success, public_ip, error = await fetch_public_ip_for_interface(req.ip, timeout=5.0)
    if_index = get_windows_if_index_for_ip(req.ip)
    return {
        "ip": req.ip,
        "if_index": if_index,
        "success": success,
        "public_ip": public_ip,
        "error": error,
    }


@router.post("/interfaces/test-all-links")
async def test_all_links_endpoint():
    """Concurrently test all active interfaces, fetch public IPs, and flag non-independent links."""
    ifaces = [i for i in get_available_interfaces() if i.is_up and not i.is_link_local and not i.is_loopback]

    async def _test_one(iface):
        success, public_ip, error = await fetch_public_ip_for_interface(iface.ip, timeout=5.0)
        return {
            "id": iface.id,
            "adapter_name": iface.adapter_name,
            "friendly_label": iface.friendly_label or iface.adapter_name,
            "ip": iface.ip,
            "if_index": iface.if_index,
            "is_vpn": iface.is_vpn,
            "speed_mbps": iface.speed_mbps,
            "success": success,
            "public_ip": public_ip,
            "error": error,
        }

    results = await asyncio.gather(*[_test_one(i) for i in ifaces])

    ip_occurrences = {}
    for r in results:
        if r["success"] and r["public_ip"]:
            ip_occurrences.setdefault(r["public_ip"], []).append(r["adapter_name"])

    for r in results:
        if r["success"] and r["public_ip"]:
            shared = [name for name in ip_occurrences[r["public_ip"]] if name != r["adapter_name"]]
            if shared:
                r["is_duplicate"] = True
                r["duplicate_warning"] = (
                    f"Shares public IP ({r['public_ip']}) with {', '.join(shared)}. "
                    f"These interfaces route through the same ISP line and are not independent."
                )
            else:
                r["is_duplicate"] = False
                r["duplicate_warning"] = None
        else:
            r["is_duplicate"] = False
            r["duplicate_warning"] = None

    return {"results": results}


@router.post("/interfaces/benchmark-single")
async def benchmark_single_endpoint(req: BenchmarkRequest):
    """Benchmark a single network interface alone for ~10 seconds to measure its isolated throughput."""
    res = await run_isolated_link_benchmark(
        bind_ip=req.ip,
        test_url=req.test_url,
        duration_seconds=req.duration_seconds,
    )
    return res


@router.post("/interfaces/benchmark-all")
async def benchmark_all_endpoint(req: BenchmarkAllRequest):
    """Benchmark every enabled physical interface sequentially for ~10 seconds to discover bottlenecks."""
    ifaces = [
        i for i in get_available_interfaces()
        if i.is_up and not i.is_link_local and not i.is_loopback and not i.is_vpn
    ]

    results = []
    # Run sequentially so one interface's test does not consume the common CPU/NIC bandwidth of another
    for iface in ifaces:
        res = await run_isolated_link_benchmark(
            bind_ip=iface.ip,
            test_url=req.test_url,
            duration_seconds=req.duration_seconds,
        )
        res["adapter_name"] = iface.adapter_name
        res["friendly_label"] = iface.friendly_label or iface.adapter_name
        res["speed_mbps_link"] = iface.speed_mbps

        # Bottleneck detection against physical link rate
        if iface.speed_mbps > 0 and res["speed_mbps"] > 0:
            utilization = (res["speed_mbps"] / iface.speed_mbps) * 100.0
            if utilization > 80.0:
                res["bottleneck_warning"] = (
                    f"Measured speed ({res['speed_mbps']} Mbps) is near the adapter's physical {iface.speed_mbps} Mbps link rate. "
                    f"The Wi-Fi/PHY connection itself may be the bottleneck."
                )

        results.append(res)

    return {"results": results}


@router.post("/probe")
async def probe_endpoint(req: ProbeRequest):
    """Probe a URL to determine Range support, file size, and filename."""
    if not is_safe_url(req.url):
        raise HTTPException(status_code=400, detail="Invalid URL scheme: only http and https are allowed")
    try:
        res = await probe_url(req.url)
        return {
            "url": res.url,
            "final_url": res.final_url,
            "filename": res.filename,
            "total_bytes": res.total_bytes,
            "supports_range": res.supports_range,
            "etag": res.etag,
            "last_modified": res.last_modified,
            "content_type": res.content_type,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to probe URL: {str(e)}")


@router.get("/downloads")
async def list_downloads():
    """Retrieve list of all active, paused, completed, and failed downloads."""
    mgr = get_manager()
    return {"downloads": mgr.get_all_downloads()}


@router.get("/downloads/{download_id}")
async def get_download(download_id: str):
    """Retrieve details for a single download."""
    mgr = get_manager()
    task = mgr.get_download(download_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download not found")
    return task.to_dict()


@router.post("/downloads")
async def create_download(req: CreateDownloadRequest):
    """Add a new download task to the manager queue."""
    mgr = get_manager()
    try:
        # Validate URL scheme (must be http or https)
        if not is_safe_url(req.url):
            raise HTTPException(status_code=400, detail="Invalid URL scheme: only http and https are allowed")

        # Validate destination path if provided
        if req.destination_path:
            norm_parts = req.destination_path.replace("\\", "/").split("/")
            if ".." in norm_parts:
                raise HTTPException(status_code=400, detail="Invalid destination path: directory traversal not allowed")
            try:
                validate_destination_path(req.destination_path, allowed_base_dir=mgr.default_download_dir)
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

        bind_ips = [ip.strip() for ip in req.bind_ips] if req.bind_ips else None
        if bind_ips and len(bind_ips) == 0:
            bind_ips = None

        task = await mgr.add_download(
            url=req.url,
            destination_path=req.destination_path,
            bind_ips=bind_ips,
            connections_per_link=req.connections_per_link,
            chunk_size=req.chunk_size,
            expected_checksum=req.expected_checksum,
        )
        return {"success": True, "download": task.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/downloads/{download_id}/autotune-connections")
async def autotune_connections_endpoint(download_id: str):
    """Start automated connection tuning to find optimal connection count."""
    mgr = get_manager()
    task = mgr.get_download(download_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download not found")
    if task.status != DownloadStatus.DOWNLOADING:
        raise HTTPException(status_code=400, detail="Download must be actively running to tune connections")

    asyncio.create_task(task.autotune_connections())
    return {"success": True, "message": "Autotune optimization initiated"}


@router.post("/downloads/{download_id}/set-connections")
async def set_connections_endpoint(download_id: str, req: SetConnectionsRequest):
    """Dynamically adjust connections per link on an active download."""
    mgr = get_manager()
    task = mgr.get_download(download_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download not found")

    await task.set_connections_per_link(req.connections_per_link)
    return {"success": True, "connections_per_link": task.connections_per_link}


@router.post("/downloads/{download_id}/pause")
async def pause_download(download_id: str):
    """Pause an active download."""
    mgr = get_manager()
    success = await mgr.pause_download(download_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot pause download")
    return {"success": True}


@router.post("/downloads/{download_id}/resume")
async def resume_download(download_id: str):
    """Resume a paused download."""
    mgr = get_manager()
    success = await mgr.resume_download(download_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot resume download")
    return {"success": True}


@router.post("/downloads/{download_id}/cancel")
async def cancel_download(download_id: str):
    """Cancel a download."""
    mgr = get_manager()
    success = await mgr.cancel_download(download_id)
    if not success:
        raise HTTPException(status_code=404, detail="Download not found")
    return {"success": True}


@router.delete("/downloads/{download_id}")
async def delete_download(download_id: str, delete_file: bool = False):
    """Remove download and optionally remove the file from disk."""
    mgr = get_manager()
    success = await mgr.delete_download(download_id, delete_file=delete_file)
    if not success:
        raise HTTPException(status_code=404, detail="Download not found")
    return {"success": True}


from backend.core.paths import get_user_data_dir
from backend.core.settings import clear_history, load_history, load_settings, save_settings


@router.get("/system/info")
async def system_info():
    """Retrieve system metadata, platform info, user data dir, and default download directory."""
    mgr = get_manager()
    return {
        "os": platform.system(),
        "os_release": platform.release(),
        "python_version": platform.python_version(),
        "user_data_dir": get_user_data_dir(),
        "default_download_dir": mgr.default_download_dir,
        "max_active_downloads": mgr.max_active_downloads,
        "active_downloads": sum(
            1 for t in mgr.tasks.values() if t.status in (DownloadStatus.PROBING, DownloadStatus.DOWNLOADING)
        ),
    }


@router.get("/settings")
async def get_settings_endpoint():
    """Retrieve saved settings from %APPDATA%\\InternetMerger\\settings.json."""
    return {"settings": load_settings()}


@router.post("/settings")
async def update_settings_endpoint(req: Dict[str, Any]):
    """Update settings in %APPDATA%\\InternetMerger\\settings.json."""
    try:
        updated = save_settings(req)
        # Update download manager default dir if changed
        if "default_download_dir" in req and download_manager:
            download_manager.default_download_dir = os.path.abspath(req["default_download_dir"])
            os.makedirs(download_manager.default_download_dir, exist_ok=True)
        return {"success": True, "settings": updated}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update settings: {str(e)}")


@router.get("/history")
async def get_history_endpoint():
    """Retrieve download history from %APPDATA%\\InternetMerger\\history.json."""
    return {"history": load_history()}


@router.delete("/history")
async def clear_history_endpoint():
    """Clear download history in %APPDATA%\\InternetMerger\\history.json."""
    clear_history()
    return {"success": True, "message": "History cleared"}


@router.post("/browse-folder")
async def browse_folder_endpoint(req: BrowseFolderRequest = BrowseFolderRequest()):
    """Open native OS folder selection dialog and return the chosen path."""
    mgr = get_manager()
    initial_dir = req.initial_dir or mgr.default_download_dir
    try:
        selected_path = await asyncio.to_thread(pick_folder_native, initial_dir)
        if selected_path:
            return {"success": True, "path": selected_path, "cancelled": False}
        return {"success": True, "path": None, "cancelled": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open folder picker: {str(e)}")

