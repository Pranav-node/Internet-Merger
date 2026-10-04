import asyncio
import json
import urllib.request
import aiohttp

async def main():
    print("Testing Zomato-style enhancements & performance fixes...")
    base_url = "http://127.0.0.1:8000"

    async with aiohttp.ClientSession() as session:
        # 1. Test GET /api/interfaces
        async with session.get(f"{base_url}/api/interfaces") as res:
            assert res.status == 200
            data = await res.json()
            ifaces = data.get("interfaces", [])
            print(f"[Test 1] Found {len(ifaces)} interfaces:")
            for i in ifaces:
                print(f"  - {i['friendly_label']} ({i['ip']}): hidden_by_default={i.get('is_hidden_by_default')}, speed={i.get('speed_mbps')} Mbps")
                assert "is_hidden_by_default" in i
                assert "friendly_label" in i
                assert "speed_mbps" in i
            print("  -> PASSED")

        # 2. Test POST /api/downloads with 8 connections / 4MB chunks
        print("\n[Test 2] Creating test download on local simulator:")
        payload = {
            "url": "http://127.0.0.1:8088/range-file",
            "destination_path": "downloads/zomato_test_file.bin",
            "connections_per_link": 8,
            "chunk_size": 4 * 1024 * 1024,
        }
        async with session.post(f"{base_url}/api/downloads", json=payload) as res:
            assert res.status == 200
            created = await res.json()
            d = created.get("download")
            dl_id = d["id"]
            print(f"  Download started: ID={dl_id}, Status={d['status']}, Conns={d['connections_per_link']}")
            assert d["connections_per_link"] == 8
            assert "event_loop_lag_ms" in d
            assert "disk_write_latency_ms" in d
            print("  -> PASSED")

        # 3. Wait 1.5s and check progress and telemetry
        await asyncio.sleep(1.5)
        async with session.get(f"{base_url}/api/downloads/{dl_id}") as res:
            assert res.status == 200
            d = await res.json()
            print(f"\n[Test 3] Telemetry & Session Share Check:")
            print(f"  Progress: {d['progress_percent']}% | Speed: {d['total_speed_bps']/1024/1024:.2f} MB/s")
            print(f"  Event loop lag: {d.get('event_loop_lag_ms')} ms")
            print(f"  Disk write latency: {d.get('disk_write_latency_ms')} ms")
            for link_k, s in d.get("links", {}).items():
                print(f"  Link '{link_k}': {s['current_speed_bps']/1024/1024:.2f} MB/s | session_share={s.get('session_share_percent')}%")
                assert "session_share_percent" in s
            print("  -> PASSED")

        # 4. Test autotune endpoint on an active download
        print("\n[Test 4] Triggering autotune connections on active download:")
        payload2 = {
            "url": "http://127.0.0.1:8088/range-file",
            "destination_path": "downloads/zomato_test_autotune.bin",
            "connections_per_link": 4,
            "chunk_size": 2 * 1024 * 1024,
        }
        async with session.post(f"{base_url}/api/downloads", json=payload2) as res:
            assert res.status == 200
            d2 = (await res.json())["download"]
            dl_id2 = d2["id"]

        async with session.post(f"{base_url}/api/downloads/{dl_id2}/autotune-connections") as res:
            print(f"  Autotune status code: {res.status}")
            assert res.status in (200, 400)  # 200 if still running, 400 if already finished
            resp_data = await res.json()
            print(f"  Autotune response: {resp_data}")
            print("  -> PASSED")

        # 5. Test set-connections endpoint
        print("\n[Test 5] Setting connections per link to 12:")
        async with session.post(f"{base_url}/api/downloads/{dl_id2}/set-connections", json={"connections_per_link": 12}) as res:
            assert res.status == 200
            resp_data = await res.json()
            print(f"  Set connections response: {resp_data}")
            assert resp_data["connections_per_link"] == 12
            print("  -> PASSED")

        # Cleanup downloads
        for cur_id in (dl_id, dl_id2):
            await session.post(f"{base_url}/api/downloads/{cur_id}/cancel")
            await session.delete(f"{base_url}/api/downloads/{cur_id}?delete_file=true")
        print("\n[Cleanup] Cancelled & deleted test downloads.")

    print("\n>>> ALL ZOMATO ENHANCEMENT TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    asyncio.run(main())
