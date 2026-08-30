import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_mcp.local_ai import LocalAggregateAssistant  # noqa: E402


class LocalAggregateAssistantTests(unittest.TestCase):
    def test_only_loopback_ollama_endpoint_is_allowed(self):
        with self.assertRaisesRegex(ValueError, "loopback"):
            LocalAggregateAssistant("https://api.example.com", "qwen3:8b")

    def test_rejects_raw_records_and_secret_shaped_fields(self):
        assistant = LocalAggregateAssistant("http://127.0.0.1:11434", "qwen3:8b")
        with self.assertRaisesRegex(ValueError, "aggregate"):
            assistant.build_request("Tóm tắt", {"records": [{"note": "private"}]})
        with self.assertRaisesRegex(ValueError, "sensitive"):
            assistant.build_request("Tóm tắt", {"token": "secret", "total_minutes": 10})

    def test_request_disables_cloud_tools_and_uses_aggregate_json_only(self):
        assistant = LocalAggregateAssistant("http://localhost:11434", "qwen3:8b")
        request = assistant.build_request(
            "Tóm tắt bằng tiếng Việt, không chẩn đoán.",
            {"sample_count": 4, "total_minutes": 300, "missingness_percent": 0},
        )
        self.assertEqual(request["model"], "qwen3:8b")
        self.assertFalse(request["stream"])
        self.assertNotIn("tools", request)
        self.assertIn('"total_minutes":300', request["prompt"])


if __name__ == "__main__":
    unittest.main()
