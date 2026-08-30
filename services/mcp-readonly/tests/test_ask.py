import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_mcp.analytics import InMemoryRepository, SleepRecord  # noqa: E402
from embe_mcp.ask import answer_question  # noqa: E402


class RecordingAssistant:
    def __init__(self):
        self.calls = []

    def generate(self, instruction, aggregate):
        self.calls.append((instruction, aggregate))
        return "Trong dữ liệu mẫu, bé có 2 phiên ngủ."


class AskTests(unittest.TestCase):
    def test_sleep_question_sends_only_summary_to_assistant(self):
        repository = InMemoryRepository(
            sleeps=(
                SleepRecord(
                    datetime(2026, 8, 1, 1, tzinfo=timezone.utc),
                    datetime(2026, 8, 1, 2, tzinfo=timezone.utc),
                    "embe",
                ),
                SleepRecord(
                    datetime(2026, 8, 2, 1, tzinfo=timezone.utc),
                    datetime(2026, 8, 2, 2, 30, tzinfo=timezone.utc),
                    "embe",
                ),
            )
        )
        assistant = RecordingAssistant()

        answer = answer_question(
            repository=repository,
            assistant=assistant,
            topic="ngu",
            child_id="embe",
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 7),
            question="Tuần này bé ngủ thế nào?",
        )

        self.assertEqual(answer, "Trong dữ liệu mẫu, bé có 2 phiên ngủ.")
        sent = assistant.calls[0][1]
        self.assertEqual(sent["session_count"], 2)
        self.assertEqual(sent["total_minutes"], 150)
        self.assertNotIn("records", sent)
        self.assertNotIn("started_at", str(sent))

    def test_unknown_topic_is_rejected_without_calling_assistant(self):
        assistant = RecordingAssistant()

        with self.assertRaisesRegex(ValueError, "chủ đề"):
            answer_question(
                repository=InMemoryRepository(),
                assistant=assistant,
                topic="ghi-chu",
                child_id="embe",
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 7),
                question="Đọc ghi chú chi tiết",
            )

        self.assertEqual(assistant.calls, [])


if __name__ == "__main__":
    unittest.main()
