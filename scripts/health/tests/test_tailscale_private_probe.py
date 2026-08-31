from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class TailscalePrivateProbeTests(unittest.TestCase):
    def test_direct_probe_writes_only_status_codes(self) -> None:
        script = Path(__file__).resolve().parents[1] / "tailscale-private-probe.py"
        spec = importlib.util.spec_from_file_location("tailscale_private_probe", script)
        module = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "health.json"
            fake_status = json.dumps({"BackendState": "Running", "Self": {"DNSName": "private.invalid."}})
            with (
                patch.object(module.subprocess, "run", return_value=SimpleNamespace(stdout=fake_status)),
                patch.object(module, "status_code", return_value=200),
                patch.object(sys, "argv", [str(script), "--tailscale", str(Path(directory) / "tailscale.exe"), "--output", str(output)]),
            ):
                self.assertEqual(module.main(), 0)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["status"], "pass")
            self.assertNotIn("private.invalid", output.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
