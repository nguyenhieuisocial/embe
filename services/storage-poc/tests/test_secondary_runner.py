from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path


def test_secondary_runner_loads_env_without_shell_expansion():
    script = Path(__file__).resolve().parents[1] / "scripts" / "run_secondary_once.py"
    spec = importlib.util.spec_from_file_location("secondary_runner", script)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory() as directory:
        env_file = Path(directory) / "runtime.env"
        env_file.write_text("# ignored\nSAFE_VALUE=literal-$HOME\n", encoding="utf-8")
        environment = {}
        module.load_env(env_file, environment)
        assert environment == {"SAFE_VALUE": "literal-$HOME"}
