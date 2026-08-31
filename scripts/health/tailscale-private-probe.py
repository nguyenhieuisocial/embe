from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def status_code(url: str) -> int:
    try:
        with urlopen(Request(url, headers={"User-Agent": "EmBe-Health/1.0"}), timeout=8) as response:
            return int(response.status)
    except HTTPError as error:
        return int(error.code)
    except (URLError, TimeoutError, OSError):
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Write privacy-safe Tailscale route health without PowerShell.")
    parser.add_argument("--tailscale", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    codes = {"immich_status_code": 0, "memos_status_code": 0, "babybuddy_status_code": 0}
    try:
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        result = subprocess.run([str(args.tailscale), "status", "--json"], check=True, capture_output=True, text=True, timeout=10, creationflags=flags)
        status = json.loads(result.stdout)
        dns = str(status.get("Self", {}).get("DNSName", "")).rstrip(".")
        if status.get("BackendState") == "Running" and dns:
            codes = {
                "immich_status_code": status_code(f"https://{dns}/"),
                "memos_status_code": status_code(f"https://{dns}:8443/"),
                "babybuddy_status_code": status_code(f"https://{dns}:10000/"),
            }
    except (subprocess.SubprocessError, OSError, ValueError, json.JSONDecodeError):
        pass
    passed = all(value == 200 for value in codes.values())
    report = {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "pass" if passed else "critical", **codes,
        "privacy": "No private URL, device name, token, response body, or family content is included.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(report, separators=(",", ":")), encoding="utf-8")
    temporary.replace(args.output)
    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
