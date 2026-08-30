import tempfile
import unittest
from pathlib import Path

from embe_sync.main import parse_args
from embe_sync.main import execute


class MainTests(unittest.TestCase):
    def test_rebuild_mode_is_available_for_index_recovery(self):
        args = parse_args(
            [
                "--env", "runtime.env",
                "--rebuild-ledger",
                "--status", "status.json",
                "--log", "sync.log",
            ]
        )
        self.assertTrue(args.rebuild_ledger)
        self.assertFalse(args.once)

    def test_missing_env_writes_sanitized_status_without_crashing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            env = root / "runtime.env"
            env.write_text("BABYBUDDY_TOKEN=secret-value\n", encoding="utf-8")
            status = root / "status.json"
            log = root / "sync.log"
            self.assertEqual(execute(env, status, log), 40)
            combined = status.read_text(encoding="utf-8") + log.read_text(encoding="utf-8")
            self.assertIn("configuration_or_data_error", combined)
            self.assertNotIn("secret-value", combined)


if __name__ == "__main__":
    unittest.main()
