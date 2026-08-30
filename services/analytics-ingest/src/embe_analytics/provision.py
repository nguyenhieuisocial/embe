from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .babybuddy import BabyBuddyApiClient
from .runtime import RuntimeConfigError, _load_secrets, _write_json


def provision(
    source_env_path: Path,
    config_path: Path,
    secrets_path: Path,
    *,
    client_factory=BabyBuddyApiClient,
) -> dict:
    source_env_path = Path(source_env_path)
    source = _load_secrets(source_env_path)
    base_url = source.get("BABYBUDDY_BASE_URL")
    token = source.get("BABYBUDDY_TOKEN")
    if not base_url or not token:
        raise RuntimeConfigError("BabyBuddy source credential is incomplete")

    identifiers = client_factory(base_url, token).discover_ids()
    identifiers = sorted({int(identifier) for identifier in identifiers if int(identifier) > 0})
    enabled = len(identifiers) == 1
    children = {str(identifiers[0]): "child-primary"} if enabled else {}
    config = {
        "database_path": "../../data/analytics/family.sqlite3",
        "babybuddy": {
            "enabled": enabled,
            "base_url": base_url,
            "token_env": "BABYBUDDY_ANALYTICS_TOKEN",
            "children": children,
            "source_units": {"feeding": "mL", "weight": "kg", "height": "cm"},
        },
        "grocy": {
            "enabled": False,
            "base_url": "http://127.0.0.1:9283",
            "api_key_env": "GROCY_ANALYTICS_KEY",
            "products": {},
        },
    }

    if enabled:
        secrets_path = Path(secrets_path)
        secrets_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = secrets_path.with_suffix(secrets_path.suffix + ".tmp")
        temporary.write_text(f"BABYBUDDY_ANALYTICS_TOKEN={token}\n", encoding="utf-8")
        os.chmod(temporary, 0o600)
        os.replace(temporary, secrets_path)
    _write_json(config_path, config)

    result = {
        "status": "ready" if enabled else "needs_child_selection",
        "babybuddy_enabled": enabled,
        "babybuddy_child_count": len(identifiers),
        "grocy_enabled": False,
    }
    print(json.dumps(result, separators=(",", ":"), sort_keys=True))
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Provision local EmBe analytics without exposing identities")
    parser.add_argument("--source-env", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--secrets", type=Path, required=True)
    arguments = parser.parse_args(argv)
    try:
        provision(arguments.source_env, arguments.config, arguments.secrets)
    except RuntimeConfigError:
        print('{"status":"configuration_error"}')
        return 2
    except Exception:
        print('{"status":"discovery_error"}')
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
