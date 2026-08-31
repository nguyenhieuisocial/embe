from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .babybuddy import BabyBuddyApiClient, BabyBuddyNormalizer
from .grocy import GrocyApiClient, GrocyNormalizer
from .ingest import ingest_babybuddy, ingest_grocy
from .warehouse import Warehouse


class RuntimeConfigError(ValueError):
    pass


DEFAULT_FACTORIES = {
    "babybuddy": BabyBuddyApiClient,
    "grocy": GrocyApiClient,
}


def run(config_path: Path, secrets_path: Path, status_path: Path, *, client_factories=None) -> dict:
    config_path = Path(config_path)
    if not config_path.is_file():
        result = _status("skipped", reason="configuration_missing")
        _write_json(status_path, result)
        _print_summary(result)
        return result

    config = _load_config(config_path)
    enabled = [name for name in ("babybuddy", "grocy") if _enabled(config, name)]
    database_path = _resolve_database_path(config_path, config)
    if not enabled:
        Warehouse(database_path).close()
        result = _status("skipped", reason="all_sources_disabled")
        _write_json(status_path, result)
        _print_summary(result)
        return result

    secrets = _load_secrets(Path(secrets_path))
    factories = {**DEFAULT_FACTORIES, **(client_factories or {})}
    warehouse = Warehouse(database_path)
    try:
        result = _status("ok")
        if "babybuddy" in enabled:
            source = _source_config(config, "babybuddy")
            children = _child_allowlist(source)
            client = factories["babybuddy"](
                _required_text(source, "base_url"),
                _required_secret(source, "token_env", secrets),
            )
            result["babybuddy"] = ingest_babybuddy(
                client,
                BabyBuddyNormalizer(children, source.get("source_units")),
                warehouse,
            )
        if "grocy" in enabled:
            source = _source_config(config, "grocy")
            products = _product_allowlist(source)
            client = factories["grocy"](
                _required_text(source, "base_url"),
                _required_secret(source, "api_key_env", secrets),
            )
            result["grocy"] = ingest_grocy(client, GrocyNormalizer(products), warehouse)
    finally:
        warehouse.close()

    _write_json(status_path, result)
    _print_summary(result)
    return result


def discover(config_path: Path, secrets_path: Path, output_path: Path, *, client_factories=None) -> dict:
    config_path = Path(config_path)
    if not config_path.is_file():
        raise RuntimeConfigError("configuration file is missing")
    config = _load_config(config_path)
    secrets = _load_secrets(Path(secrets_path))
    factories = {**DEFAULT_FACTORIES, **(client_factories or {})}
    private_result = {}
    summary = {}

    if _enabled(config, "babybuddy"):
        source = _source_config(config, "babybuddy")
        client = factories["babybuddy"](
            _required_text(source, "base_url"),
            _required_secret(source, "token_env", secrets),
        )
        identifiers = client.discover_ids()
        private_result["babybuddy"] = {"child_ids": identifiers}
        summary["babybuddy_child_count"] = len(identifiers)
    if _enabled(config, "grocy"):
        source = _source_config(config, "grocy")
        client = factories["grocy"](
            _required_text(source, "base_url"),
            _required_secret(source, "api_key_env", secrets),
        )
        identifiers = client.discover_ids()
        private_result["grocy"] = {"product_ids": identifiers}
        summary["grocy_product_count"] = len(identifiers)

    _write_json(output_path, private_result)
    print(json.dumps(summary, separators=(",", ":"), sort_keys=True))
    return summary


def _load_config(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeConfigError("configuration is unreadable or invalid JSON") from error
    if not isinstance(payload, dict):
        raise RuntimeConfigError("configuration root must be an object")
    _reject_inline_secrets(payload)
    return payload


def _reject_inline_secrets(value):
    forbidden = {"token", "api_key", "secret", "password", "authorization"}
    if isinstance(value, dict):
        for key, child in value.items():
            if str(key).lower() in forbidden:
                raise RuntimeConfigError("configuration contains an inline secret")
            _reject_inline_secrets(child)
    elif isinstance(value, list):
        for child in value:
            _reject_inline_secrets(child)


def _load_secrets(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise RuntimeConfigError("local secrets file is missing")
    result = {}
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError as error:
        raise RuntimeConfigError("local secrets file is unreadable") from error
    for number, raw_line in enumerate(lines, start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        key = key.strip()
        if not separator or not key.replace("_", "").isalnum() or not value:
            raise RuntimeConfigError(f"invalid secrets file entry at line {number}")
        if key in result:
            raise RuntimeConfigError(f"duplicate secrets file entry at line {number}")
        result[key] = value
    return result


def _required_secret(source: dict, key: str, secrets: dict[str, str]) -> str:
    environment_name = _required_text(source, key)
    secret = secrets.get(environment_name)
    if not secret:
        raise RuntimeConfigError(f"required credential {environment_name} is missing")
    return secret


def _source_config(config: dict, name: str) -> dict:
    source = config.get(name)
    if not isinstance(source, dict):
        raise RuntimeConfigError(f"{name} configuration must be an object")
    return source


def _enabled(config: dict, name: str) -> bool:
    source = config.get(name, {})
    if not isinstance(source, dict):
        raise RuntimeConfigError(f"{name} configuration must be an object")
    enabled = source.get("enabled", False)
    if not isinstance(enabled, bool):
        raise RuntimeConfigError(f"{name}.enabled must be boolean")
    return enabled


def _child_allowlist(source: dict) -> dict[int, str]:
    raw = source.get("children")
    if not isinstance(raw, dict) or not raw:
        raise RuntimeConfigError("BabyBuddy children allowlist is empty")
    try:
        return {int(identifier): str(alias).strip() for identifier, alias in raw.items() if str(alias).strip()}
    except (TypeError, ValueError) as error:
        raise RuntimeConfigError("BabyBuddy children allowlist is invalid") from error


def _product_allowlist(source: dict) -> dict[int, tuple[str, str]]:
    raw = source.get("products")
    if not isinstance(raw, dict) or not raw:
        raise RuntimeConfigError("Grocy products allowlist is empty")
    try:
        result = {
            int(identifier): (str(details["alias"]).strip(), str(details["unit"]).strip())
            for identifier, details in raw.items()
            if isinstance(details, dict) and str(details.get("alias", "")).strip() and str(details.get("unit", "")).strip()
        }
    except (TypeError, ValueError) as error:
        raise RuntimeConfigError("Grocy products allowlist is invalid") from error
    if not result:
        raise RuntimeConfigError("Grocy products allowlist is empty")
    return result


def _required_text(value: dict, key: str) -> str:
    text = value.get(key)
    if not isinstance(text, str) or not text.strip():
        raise RuntimeConfigError(f"required configuration field {key} is missing")
    return text.strip()


def _resolve_database_path(config_path: Path, config: dict) -> Path:
    raw = _required_text(config, "database_path")
    path = Path(raw)
    if not path.is_absolute():
        path = config_path.parent / path
    if path.suffix.lower() not in {".db", ".sqlite", ".sqlite3"}:
        raise RuntimeConfigError("database_path must be a SQLite file")
    return path.resolve()


def _status(status: str, **values) -> dict:
    return {
        "status": status,
        **values,
        "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def _write_json(path: Path, payload: dict):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _print_summary(result: dict):
    safe = {"status": result["status"]}
    if "reason" in result:
        safe["reason"] = result["reason"]
    for source in ("babybuddy", "grocy"):
        if source in result:
            safe[source] = result[source]
    print(json.dumps(safe, separators=(",", ":"), sort_keys=True))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Run local EmBe analytics ingestion")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--secrets", type=Path, required=True)
    parser.add_argument("--status", type=Path)
    parser.add_argument("--discover", type=Path)
    arguments = parser.parse_args(argv)
    try:
        if arguments.discover:
            discover(arguments.config, arguments.secrets, arguments.discover)
        else:
            if not arguments.status:
                parser.error("--status is required unless --discover is used")
            run(arguments.config, arguments.secrets, arguments.status)
    except RuntimeConfigError:
        print('{"status":"configuration_error"}')
        return 2
    except Exception:
        print('{"status":"runtime_error"}')
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
