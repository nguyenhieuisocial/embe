import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_analytics.provision import provision  # noqa: E402
from embe_analytics.runtime import RuntimeConfigError  # noqa: E402


class FakeDiscoveryClient:
    def __init__(self, identifiers):
        self.identifiers = identifiers

    def discover_ids(self):
        return self.identifiers


class ProvisionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "babybuddy-memos-sync.env"
        self.config = self.root / "config.local.json"
        self.secrets = self.root / "secrets.local.env"

    def tearDown(self):
        self.temp.cleanup()

    def test_exactly_one_child_reuses_token_and_enables_only_babybuddy(self):
        self.source.write_text(
            "BABYBUDDY_BASE_URL=http://127.0.0.1:8000\n"
            "BABYBUDDY_TOKEN=private-token-value\n"
            "MEMOS_SYNC_PAT=unrelated-private-value\n",
            encoding="utf-8",
        )
        output = io.StringIO()
        with redirect_stdout(output):
            result = provision(
                self.source,
                self.config,
                self.secrets,
                client_factory=lambda _url, token: self._client_with_token(token, [73]),
            )

        config = json.loads(self.config.read_text(encoding="utf-8"))
        secret_text = self.secrets.read_text(encoding="utf-8")
        self.assertEqual(result, {"status": "ready", "babybuddy_enabled": True, "babybuddy_child_count": 1, "grocy_enabled": False})
        self.assertEqual(config["babybuddy"]["children"], {"73": "child-primary"})
        self.assertTrue(config["babybuddy"]["enabled"])
        self.assertFalse(config["grocy"]["enabled"])
        self.assertEqual(secret_text, "BABYBUDDY_ANALYTICS_TOKEN=private-token-value\n")
        self.assertNotIn("MEMOS_SYNC_PAT", secret_text)
        visible = output.getvalue()
        for private_value in ("73", "private-token-value", "unrelated-private-value"):
            self.assertNotIn(private_value, visible)

    def test_zero_or_multiple_children_keeps_babybuddy_disabled_and_stores_no_ids(self):
        self.source.write_text(
            "BABYBUDDY_BASE_URL=http://127.0.0.1:8000\nBABYBUDDY_TOKEN=private-token-value\n",
            encoding="utf-8",
        )
        for identifiers in ([], [73, 99]):
            with self.subTest(identifiers=identifiers), redirect_stdout(io.StringIO()):
                result = provision(
                    self.source,
                    self.config,
                    self.secrets,
                    client_factory=lambda _url, _token, ids=identifiers: FakeDiscoveryClient(ids),
                )
                config_text = self.config.read_text(encoding="utf-8")
                config = json.loads(config_text)
                self.assertFalse(result["babybuddy_enabled"])
                self.assertFalse(config["babybuddy"]["enabled"])
                self.assertEqual(config["babybuddy"]["children"], {})
                self.assertFalse(self.secrets.exists())
                for identifier in identifiers:
                    self.assertNotIn(str(identifier), config_text)

    def test_missing_source_token_fails_before_client_or_local_files(self):
        self.source.write_text("BABYBUDDY_BASE_URL=http://127.0.0.1:8000\n", encoding="utf-8")
        built = []
        with self.assertRaises(RuntimeConfigError):
            provision(
                self.source,
                self.config,
                self.secrets,
                client_factory=lambda *_: built.append(True),
            )
        self.assertEqual(built, [])
        self.assertFalse(self.config.exists())
        self.assertFalse(self.secrets.exists())

    def _client_with_token(self, token, identifiers):
        self.assertEqual(token, "private-token-value")
        return FakeDiscoveryClient(identifiers)


if __name__ == "__main__":
    unittest.main()
