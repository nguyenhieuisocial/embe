from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from meal_analysis_worker import Config, MealAnalysisWorker, _load_env, default_transport


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a disposable end-to-end meal pipeline smoke check.")
    parser.add_argument("--env", type=Path, required=True)
    parser.add_argument("--image", type=Path, required=True)
    args = parser.parse_args()
    image = args.image.read_bytes()
    config = Config.from_env(_load_env(args.env))
    headers = {
        "apikey": config.supabase_secret_key,
        "authorization": f"Bearer {config.supabase_secret_key}",
        "content-type": "application/json",
    }

    def rpc(name: str, body: dict):
        response = default_transport("POST", f"{config.supabase_url}/rest/v1/rpc/{name}", headers,
                                     json.dumps(body).encode())
        if not 200 <= response.status < 300:
            raise RuntimeError(f"smoke RPC failed: {name}")
        return json.loads(response.body) if response.body else None

    entry_id = None
    try:
        created = rpc("embe_create_meal_analysis", {
            "p_idempotency_key": str(uuid.uuid4()), "p_author_role": "mother", "p_meal_type": "lunch",
            "p_eaten_at": datetime.now(timezone.utc).isoformat(), "p_note": "smoke-test: cơm, tôm và rau",
            "p_original_filename": "public-smoke.jpg", "p_mime_type": "image/jpeg", "p_byte_size": len(image),
        })
        entry_id = str(created["id"])
        encoded = "/".join(quote(part, safe="") for part in created["storage_path"].split("/"))
        uploaded = default_transport("POST", f"{config.supabase_url}/storage/v1/object/{config.bucket}/{encoded}",
                                     {**headers, "content-type": "image/jpeg", "x-upsert": "false"}, image)
        if not 200 <= uploaded.status < 300:
            raise RuntimeError("smoke upload failed")
        rpc("embe_complete_meal_upload", {"p_id": entry_id})
        worker = MealAnalysisWorker(config)
        deadline = time.monotonic() + 180
        reviewed = None
        while time.monotonic() < deadline:
            worker.run_once()
            reviewed = rpc("embe_get_meal_analysis", {"p_id": entry_id})
            if reviewed.get("status") == "review":
                break
            time.sleep(0.5)
        if not reviewed or reviewed.get("status") != "review":
            raise RuntimeError("smoke vision review failed")
        rpc("embe_confirm_meal_analysis", {
            "p_id": entry_id, "p_confirmed_analysis": reviewed["analysis"], "p_note": "smoke-test",
        })
        deadline = time.monotonic() + 180
        nutrients = None
        confirmed = None
        while time.monotonic() < deadline:
            result = worker.run_once()
            if result.get("entry_id") == entry_id:
                nutrients = result
            confirmed = rpc("embe_get_meal_analysis", {"p_id": entry_id})
            if confirmed.get("status") == "confirmed":
                break
            time.sleep(0.5)
        nutrition = (confirmed.get("confirmed_analysis") or {}).get("nutrition") if confirmed else None
        if not nutrients or nutrients.get("status") != "confirmed" or not confirmed or confirmed.get("status") != "confirmed" or not nutrition or nutrition.get("status") != "estimated":
            state = confirmed.get("status") if confirmed else "missing"
            error = confirmed.get("last_error_code") if confirmed else "missing"
            raise RuntimeError(f"smoke nutrition confirmation failed: state={state}, error={error}")
        print(json.dumps({
            "status": "ok", "vision_foods": len(reviewed["analysis"]["foods"]),
            "nutrition_matches": nutrients.get("matched"), "staging_removed": True,
        }))
        return 0
    finally:
        if entry_id:
            try:
                rpc("embe_delete_meal_analysis", {"p_id": entry_id})
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
