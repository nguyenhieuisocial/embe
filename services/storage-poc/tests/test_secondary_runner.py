import importlib.util
import tempfile
from pathlib import Path


RUNNER_PATH = Path(__file__).parents[1] / "scripts" / "run_secondary_once.py"
SPEC = importlib.util.spec_from_file_location("telegram_secondary_runner", RUNNER_PATH)
assert SPEC and SPEC.loader
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


def test_secondary_runner_loads_env_without_shell_expansion():
    with tempfile.TemporaryDirectory() as directory:
        env_file = Path(directory) / "runtime.env"
        env_file.write_text("# ignored\nSAFE_VALUE=literal-$HOME\n", encoding="utf-8")
        environment = {}
        RUNNER.load_env(env_file, environment)
        assert environment == {"SAFE_VALUE": "literal-$HOME"}


def test_secondary_runner_lock_prevents_overlapping_processes(tmp_path: Path) -> None:
    path = tmp_path / "telegram-secondary.lock"
    first = RUNNER.acquire_run_lock(path)
    assert first is not None
    try:
        assert RUNNER.acquire_run_lock(path) is None
    finally:
        RUNNER.release_run_lock(first)
    third = RUNNER.acquire_run_lock(path)
    assert third is not None
    RUNNER.release_run_lock(third)
