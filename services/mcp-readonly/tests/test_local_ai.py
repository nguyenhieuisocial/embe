import sys
import unittest
from io import BytesIO
from pathlib import Path
from urllib.error import URLError
from unittest.mock import patch

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
        with self.assertRaisesRegex(ValueError, "aggregate"):
            assistant.build_request("Tóm tắt", {"sample_count": 1, "mother_name": "private"})

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

    def test_generate_posts_to_loopback_api_with_timeout(self):
        calls = []

        def transport(request, timeout):
            calls.append((request, timeout))
            return BytesIO(b'{"response":"Be ngu kha deu.","done":true}')

        assistant = LocalAggregateAssistant(
            "http://127.0.0.1:11434",
            "qwen3:8b",
            timeout_seconds=12,
            transport=transport,
        )

        answer = assistant.generate("Nhận xét ngắn", {"session_count": 4, "total_minutes": 300})

        self.assertEqual(answer, "Be ngu kha deu.")
        self.assertEqual(calls[0][0].full_url, "http://127.0.0.1:11434/api/generate")
        self.assertEqual(calls[0][0].method, "POST")
        self.assertEqual(calls[0][1], 12)

    def test_default_urlopen_receives_timeout_as_keyword(self):
        calls = []

        def fake_urlopen(request, *, timeout):
            calls.append((request, timeout))
            return BytesIO(b'{"response":"OK","done":true}')

        with patch("embe_mcp.local_ai.urlopen", side_effect=fake_urlopen):
            assistant = LocalAggregateAssistant(
                "http://127.0.0.1:11434", "qwen3:8b", timeout_seconds=7
            )
            self.assertEqual(assistant.generate("Tóm tắt", {"sample_count": 1}), "OK")

        self.assertEqual(calls[0][1], 7)

    def test_generate_retries_one_transient_failure(self):
        attempts = 0

        def transport(_request, _timeout):
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise URLError("temporary")
            return BytesIO(b'{"response":"Da co ket qua.","done":true}')

        assistant = LocalAggregateAssistant(
            "http://localhost:11434",
            "qwen3:8b",
            retries=1,
            transport=transport,
            sleeper=lambda _seconds: None,
        )

        self.assertEqual(assistant.generate("Tóm tắt", {"sample_count": 2}), "Da co ket qua.")
        self.assertEqual(attempts, 2)

    def test_nested_raw_records_are_rejected_before_transport(self):
        called = False

        def transport(_request, _timeout):
            nonlocal called
            called = True
            return BytesIO(b'{"response":"unexpected","done":true}')

        assistant = LocalAggregateAssistant(
            "http://localhost:11434", "qwen3:8b", transport=transport
        )

        with self.assertRaisesRegex(ValueError, "aggregate"):
            assistant.generate(
                "Tóm tắt",
                {"provenance": {"records": [{"note": "private"}]}},
            )
        self.assertFalse(called)

    def test_malformed_ollama_response_is_rejected(self):
        assistant = LocalAggregateAssistant(
            "http://localhost:11434",
            "qwen3:8b",
            transport=lambda _request, _timeout: BytesIO(b'{"done":true}'),
        )

        with self.assertRaisesRegex(RuntimeError, "response"):
            assistant.generate("Tóm tắt", {"sample_count": 2})


if __name__ == "__main__":
    unittest.main()
