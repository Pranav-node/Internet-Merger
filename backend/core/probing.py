"""URL Probing Module.

Inspects remote URLs for file metadata, redirect chains, Range header support,
Content-Length, and suggested filenames.
"""

from __future__ import annotations

import os
import re
import urllib.parse
from dataclasses import dataclass
from typing import Optional

import aiohttp


@dataclass
class ProbeResult:
    """Summary of probed URL characteristics."""
    url: str
    final_url: str
    total_bytes: Optional[int]
    supports_range: bool
    filename: str
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    content_type: Optional[str] = None


from backend.core.security import sanitize_filename


def extract_filename_from_headers(content_disposition: Optional[str], url: str) -> str:
    """Extract and decode filename from Content-Disposition header or URL path."""
    if content_disposition:
        # Check for RFC 5987 filename* (e.g. filename*=UTF-8''encoded_name.ext)
        match_star = re.search(r"filename\*\s*=\s*([^;]+)", content_disposition, re.IGNORECASE)
        if match_star:
            raw = match_star.group(1).strip().strip('"\'')
            if "''" in raw:
                encoding, _, encoded_val = raw.partition("''")
                try:
                    return sanitize_filename(urllib.parse.unquote(encoded_val, encoding=encoding or "utf-8"))
                except Exception:
                    return sanitize_filename(urllib.parse.unquote(encoded_val))
            else:
                return sanitize_filename(urllib.parse.unquote(raw))

        # Check for standard filename="name.ext"
        match = re.search(r'filename\s*=\s*(?:"([^"]+)"|([^;]+))', content_disposition, re.IGNORECASE)
        if match:
            candidate = match.group(1) or match.group(2)
            if candidate:
                return sanitize_filename(candidate.strip().strip('"\''))

    # Fallback to URL path
    parsed = urllib.parse.urlparse(url)
    path_name = os.path.basename(urllib.parse.unquote(parsed.path))
    if path_name:
        return sanitize_filename(path_name)

    return "download.bin"


async def probe_url(url: str, timeout_seconds: float = 15.0) -> ProbeResult:
    """Probe a URL using GET with Range: bytes=0-0 to check range support, size, and metadata.

    Security: Only http:// and https:// URLs are allowed.
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme.lower() not in ("http", "https"):
        raise ValueError(f"Security error: unsupported scheme '{parsed.scheme}'. Only http and https URLs are allowed.")

    if not parsed.netloc:
        raise ValueError("Invalid URL: missing host.")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Range": "bytes=0-0",
        "Accept-Encoding": "identity",  # Request uncompressed to get true byte counts
    }

    client_timeout = aiohttp.ClientTimeout(total=timeout_seconds, connect=10.0)
    connector = aiohttp.TCPConnector(ssl=False)

    async with aiohttp.ClientSession(connector=connector, timeout=client_timeout) as session:
        async with session.get(url, headers=headers, allow_redirects=True) as resp:
            final_url = str(resp.url)
            status = resp.status
            content_type = resp.headers.get("Content-Type")
            etag = resp.headers.get("ETag")
            last_modified = resp.headers.get("Last-Modified")
            disposition = resp.headers.get("Content-Disposition")
            filename = extract_filename_from_headers(disposition, final_url)

            if status >= 400:
                # If server rejects Range: bytes=0-0, retry with a standard GET
                if status in (400, 403, 405, 416):
                    try:
                        no_range = {k: v for k, v in headers.items() if k != "Range"}
                        async with session.get(url, headers=no_range, allow_redirects=True) as fb_resp:
                            if fb_resp.status < 400:
                                fb_url = str(fb_resp.url)
                                cl = fb_resp.headers.get("Content-Length")
                                t_bytes = int(cl) if cl and cl.isdigit() else None
                                s_range = "bytes" in fb_resp.headers.get("Accept-Ranges", "").lower()
                                return ProbeResult(
                                    url=url,
                                    final_url=fb_url,
                                    total_bytes=t_bytes,
                                    supports_range=s_range,
                                    filename=extract_filename_from_headers(fb_resp.headers.get("Content-Disposition"), fb_url),
                                    etag=fb_resp.headers.get("ETag"),
                                    last_modified=fb_resp.headers.get("Last-Modified"),
                                    content_type=fb_resp.headers.get("Content-Type"),
                                )
                    except aiohttp.ClientResponseError:
                        raise
                    except Exception:
                        pass

                # Inspect for Cloudflare or anti-bot challenge
                is_cf = (
                    resp.headers.get("Server", "").lower() == "cloudflare"
                    or "cf-mitigated" in resp.headers
                )
                if not is_cf:
                    try:
                        body_snip = await resp.text(errors="ignore")
                        if "challenges.cloudflare.com" in body_snip or "just a moment" in body_snip.lower():
                            is_cf = True
                    except Exception:
                        pass

                if is_cf:
                    raise aiohttp.ClientResponseError(
                        request_info=resp.request_info,
                        history=resp.history,
                        status=status,
                        message="HTTP 403: Protected by Cloudflare bot verification. If using a file host (e.g. Buzzheavier/bzzhr.to), visit the link in your browser and copy the direct download link after clicking Download."
                    )

                raise aiohttp.ClientResponseError(
                    request_info=resp.request_info,
                    history=resp.history,
                    status=status,
                    message=f"Server returned HTTP error {status} ({resp.reason})"
                )

            supports_range = False
            total_bytes: Optional[int] = None

            if status == 206:
                # 206 Partial Content: Server supports range!
                supports_range = True
                content_range = resp.headers.get("Content-Range", "")
                # Format: bytes 0-0/1234567 or bytes 0-0/*
                match = re.search(r"bytes\s+\d+-\d+/(\d+)", content_range, re.IGNORECASE)
                if match:
                    total_bytes = int(match.group(1))
                else:
                    # Content-Range did not specify total, try Content-Length or HEAD
                    cl = resp.headers.get("Content-Length")
                    if cl and cl.isdigit() and int(cl) > 1:
                        # Sometimes servers return total in Content-Length even with 206
                        total_bytes = int(cl)

            elif status == 200:
                # 200 OK: Range header was ignored or server doesn't support ranges
                supports_range = False
                cl = resp.headers.get("Content-Length")
                if cl and cl.isdigit():
                    total_bytes = int(cl)
                # Some servers support range but ignore bytes=0-0 and say Accept-Ranges: bytes
                accept_ranges = resp.headers.get("Accept-Ranges", "").lower()
                if "bytes" in accept_ranges and total_bytes:
                    # Let's verify by checking if accept-ranges explicitly advertised bytes
                    supports_range = True

            # If range was not supported or total_bytes not found, check if a HEAD gives Content-Length
            if total_bytes is None:
                try:
                    async with session.head(final_url, allow_redirects=True) as head_resp:
                        if head_resp.status == 200:
                            cl = head_resp.headers.get("Content-Length")
                            if cl and cl.isdigit():
                                total_bytes = int(cl)
                            if "bytes" in head_resp.headers.get("Accept-Ranges", "").lower():
                                supports_range = True
                except Exception:
                    pass

            return ProbeResult(
                url=url,
                final_url=final_url,
                total_bytes=total_bytes,
                supports_range=supports_range,
                filename=filename,
                etag=etag,
                last_modified=last_modified,
                content_type=content_type,
            )
