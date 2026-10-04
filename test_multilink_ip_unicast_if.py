import asyncio
import sys
import os
import aiohttp

async def main():
    print("Testing multi-link interface binding, VPN detection, and per-link tests...")
    base_url = "http://127.0.0.1:8000"

    async with aiohttp.ClientSession() as session:
        # 1. Test GET /api/interfaces
        async with session.get(f"{base_url}/api/interfaces") as res:
            assert res.status == 200, f"Expected 200, got {res.status}"
            data = await res.json()
            print("[Test 1] /api/interfaces:")
            print(f"  has_active_vpn: {data.get('has_active_vpn')}")
            print(f"  active_vpns: {data.get('active_vpns')}")
            print(f"  vpn_warning: {data.get('vpn_warning')}")
            print(f"  Found {len(data.get('interfaces', []))} interfaces")
            for iface in data.get('interfaces', []):
                print(f"    - {iface['adapter_name']}: IP={iface['ip']}, IfIndex={iface['if_index']}, VPN={iface['is_vpn']}")
                assert "if_index" in iface, "if_index must be present in interface metadata"
            assert "has_active_vpn" in data
            assert "vpn_warning" in data
            print("  -> PASSED")

        # 2. Test POST /api/interfaces/test-all-links
        print("\n[Test 2] /api/interfaces/test-all-links:")
        async with session.post(f"{base_url}/api/interfaces/test-all-links") as res:
            assert res.status == 200, f"Expected 200, got {res.status}"
            all_res = await res.json()
            results = all_res.get("results", [])
            print(f"  Tested {len(results)} interfaces:")
            for r in results:
                status = "SUCCESS" if r["success"] else "FAILED"
                print(f"    - {r['adapter_name']} ({r['ip']}): status={status}, public_ip={r.get('public_ip')}, if_index={r.get('if_index')}")
                if not r["success"]:
                    print(f"      Diagnostic error: {r.get('error')}")
                if r.get("is_duplicate"):
                    print(f"      Duplicate WAN warning: {r.get('duplicate_warning')}")
            print("  -> PASSED")

        # 3. Test POST /api/interfaces/test-link with specific IP
        if results:
            target_ip = results[0]["ip"]
            print(f"\n[Test 3] /api/interfaces/test-link for {target_ip}:")
            async with session.post(f"{base_url}/api/interfaces/test-link", json={"ip": target_ip}) as res:
                assert res.status == 200
                single_res = await res.json()
                print(f"  Result: success={single_res.get('success')}, if_index={single_res.get('if_index')}, public_ip={single_res.get('public_ip')}")
                if not single_res.get("success"):
                    print(f"  Diagnostic: {single_res.get('error')}")
                print("  -> PASSED")

    print("\n>>> ALL MULTI-LINK & VPN ENDPOINT TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    asyncio.run(main())
