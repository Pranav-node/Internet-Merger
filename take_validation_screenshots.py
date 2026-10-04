import asyncio
import base64
import json
import os
import subprocess
import time
import urllib.request
import websockets

ARTIFACTS_DIR = r"C:\Users\GURU\.gemini\antigravity-ide\brain\56a57e17-97ab-4854-88a4-a924dd2051c1"
USER_DATA = r"d:\Internet Merger\.chrome_temp"
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

async def cdp_command(ws, req_id, method, params=None):
    payload = {"id": req_id, "method": method}
    if params:
        payload["params"] = params
    await ws.send(json.dumps(payload))
    while True:
        resp = await ws.recv()
        data = json.loads(resp)
        if data.get("id") == req_id:
            return data.get("result")

async def take_screenshot(ws, req_id, filename):
    res = await cdp_command(ws, req_id, "Page.captureScreenshot", {"format": "png"})
    if res and "data" in res:
        img_bytes = base64.b64decode(res["data"])
        out_path = os.path.join(ARTIFACTS_DIR, filename)
        with open(out_path, "wb") as f:
            f.write(img_bytes)
        print(f"Saved screenshot: {filename} ({len(img_bytes)} bytes)")
        return out_path
    else:
        print(f"Failed to capture: {filename}")
        return None

async def main():
    os.makedirs(USER_DATA, exist_ok=True)
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    proc = subprocess.Popen([
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        "--remote-debugging-port=9222",
        f"--user-data-dir={USER_DATA}",
        "about:blank"
    ])

    await asyncio.sleep(2)
    req_id = 1

    try:
        req = urllib.request.urlopen("http://127.0.0.1:9222/json")
        targets = json.loads(req.read().decode())
        page_target = next((t for t in targets if t.get("type") == "page"), None)
        if not page_target:
            print("No page target found")
            return

        ws_url = page_target["webSocketDebuggerUrl"]
        print(f"Connecting to CDP: {ws_url}")

        async with websockets.connect(ws_url, max_size=20*1024*1024) as ws:
            req_id += 1
            await cdp_command(ws, req_id, "Page.enable")
            req_id += 1
            await cdp_command(ws, req_id, "DOM.enable")

            # ------------------------------------------------------------------
            # 1. Desktop 1440px - Light Mode: Downloads View
            # ------------------------------------------------------------------
            req_id += 1
            await cdp_command(ws, req_id, "Emulation.setDeviceMetricsOverride", {
                "width": 1440,
                "height": 900,
                "deviceScaleFactor": 1,
                "mobile": False
            })

            req_id += 1
            await cdp_command(ws, req_id, "Page.navigate", {"url": "http://localhost:5173/"})
            await asyncio.sleep(2.5)

            await take_screenshot(ws, req_id, "desktop_1440_light_downloads.png")

            # ------------------------------------------------------------------
            # 2. Desktop 1440px - Light Mode: Expanded Download Details
            # ------------------------------------------------------------------
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "document.querySelector('.download-card button[aria-label=\"Show details\"], .download-card button:last-child, .download-main-row')?.click();"
            })
            await asyncio.sleep(1.5)
            await take_screenshot(ws, req_id, "desktop_1440_light_expanded.png")

            # ------------------------------------------------------------------
            # 3. Desktop 1440px - Light Mode: Network Links View
            # ------------------------------------------------------------------
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "document.querySelectorAll('.sidebar-nav .nav-item')[1]?.click();"
            })
            await asyncio.sleep(1.5)
            await take_screenshot(ws, req_id, "desktop_1440_light_links.png")

            # ------------------------------------------------------------------
            # 4. Desktop 1440px - Dark Mode: Downloads View
            # ------------------------------------------------------------------
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "document.querySelectorAll('.sidebar-nav .nav-item')[0]?.click(); document.querySelector('[aria-label=\"Toggle theme\"]')?.click();"
            })
            await asyncio.sleep(1.5)
            await take_screenshot(ws, req_id, "desktop_1440_dark_downloads.png")

            # ------------------------------------------------------------------
            # 5. Desktop 1440px - Dark Mode: New Download Modal
            # ------------------------------------------------------------------
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "document.querySelector('.header-right .btn-primary')?.click();"
            })
            await asyncio.sleep(1)
            # Enter sample URL to trigger probe
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "const inp = document.querySelector('.modal-dialog input[type=\"url\"]'); if (inp) { inp.value = 'http://127.0.0.1:8088/range-file'; inp.dispatchEvent(new Event('input', { bubbles: true })); }"
            })
            await asyncio.sleep(1.5)
            await take_screenshot(ws, req_id, "desktop_1440_dark_modal.png")

            # Close modal
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "document.querySelector('.modal-header button')?.click();"
            })
            await asyncio.sleep(0.5)

            # ------------------------------------------------------------------
            # 6. Mobile 390px - Light Mode: Downloads View
            # ------------------------------------------------------------------
            req_id += 1
            await cdp_command(ws, req_id, "Emulation.setDeviceMetricsOverride", {
                "width": 390,
                "height": 844,
                "deviceScaleFactor": 2,
                "mobile": True
            })
            # Switch back to light theme via UI button
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "document.querySelector('.mobile-top-header [aria-label=\"Toggle theme\"]')?.click();"
            })
            await asyncio.sleep(1)
            await take_screenshot(ws, req_id, "mobile_390_light_downloads.png")

            # ------------------------------------------------------------------
            # 7. Mobile 390px - Dark Mode: Downloads View
            # ------------------------------------------------------------------
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "document.querySelector('.mobile-top-header [aria-label=\"Toggle theme\"]')?.click();"
            })
            await asyncio.sleep(1)
            await take_screenshot(ws, req_id, "mobile_390_dark_downloads.png")

            # ------------------------------------------------------------------
            # 8. Mobile 390px - Dark Mode: Network Links View
            # ------------------------------------------------------------------
            req_id += 1
            await cdp_command(ws, req_id, "Runtime.evaluate", {
                "expression": "document.querySelectorAll('.mobile-bottom-nav .mobile-nav-btn')[1]?.click();"
            })
            await asyncio.sleep(1)
            await take_screenshot(ws, req_id, "mobile_390_dark_links.png")

    finally:
        proc.terminate()
        print("Chrome process terminated. All screenshots saved.")

if __name__ == "__main__":
    asyncio.run(main())
