import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant_worker import AssistantJob, direct_question_prompt, process_jobs  # noqa: E402


class FakeQueue:
    def __init__(self, jobs):
        self.jobs = jobs
        self.completed = []
        self.failed = []

    def claim(self, _limit=5):
        return self.jobs

    def complete(self, job_id, answer):
        self.completed.append((job_id, answer))

    def fail(self, job_id, code):
        self.failed.append((job_id, code))


class AssistantWorkerTests(unittest.TestCase):
    def test_direct_question_prompt_includes_only_bounded_family_context(self):
        prompt = direct_question_prompt(
            "Tôi nên chuẩn bị gì cho lần khám tới?",
            {"upcoming_appointments": [{"title": "Khám thai", "occurred_at": "2026-09-04T02:00:00Z"}]},
        )

        self.assertIn("Tôi nên chuẩn bị gì", prompt)
        self.assertIn("Khám thai", prompt)
        self.assertIn("không chẩn đoán", prompt.casefold())
        self.assertLessEqual(len(prompt), 6000)

    def test_processes_only_bounded_topic_jobs(self):
        queue = FakeQueue([AssistantJob("job-1", "ngu", 7)])
        calls = []

        result = process_jobs(
            queue,
            lambda topic, start, end, question: calls.append((topic, start, end, question)) or "Bé ngủ đều.",
            today=date(2026, 8, 31),
        )

        self.assertEqual(result, {"claimed": 1, "completed": 1, "failed": 0})
        self.assertEqual(calls, [("ngu", date(2026, 8, 25), date(2026, 8, 31), None)])
        self.assertEqual(queue.completed, [("job-1", "Bé ngủ đều.")])

    def test_invalid_payload_is_dead_lettered_without_calling_ai(self):
        queue = FakeQueue([AssistantJob("job-2", "ghi-chu", 90)])
        called = False

        def answer(*_args):
            nonlocal called
            called = True

        result = process_jobs(queue, answer, today=date(2026, 8, 31))

        self.assertFalse(called)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(queue.failed, [("job-2", "invalid_payload")])

    def test_local_ai_failure_is_requeued_with_safe_error_code(self):
        queue = FakeQueue([AssistantJob("job-3", "bu", 14)])

        result = process_jobs(
            queue,
            lambda *_args: (_ for _ in ()).throw(RuntimeError("private details")),
            today=date(2026, 8, 31),
        )

        self.assertEqual(result["failed"], 1)
        self.assertEqual(queue.failed, [("job-3", "local_ai_unavailable")])

    def test_processes_a_bounded_direct_question(self):
        queue = FakeQueue([AssistantJob("job-4", "hoi-dap", 7, "Tôi nên chuẩn bị gì cho lần khám tới?")])
        calls = []

        result = process_jobs(
            queue,
            lambda topic, start, end, question: calls.append((topic, question)) or "Hãy mang theo kết quả khám cũ.",
            today=date(2026, 8, 31),
        )

        self.assertEqual(result["completed"], 1)
        self.assertEqual(calls, [("hoi-dap", "Tôi nên chuẩn bị gì cho lần khám tới?")])

    def test_rejects_direct_question_without_text(self):
        queue = FakeQueue([AssistantJob("job-5", "hoi-dap", 7, None)])
        result = process_jobs(queue, lambda *_args: "unexpected", today=date(2026, 8, 31))
        self.assertEqual(result["failed"], 1)
        self.assertEqual(queue.failed, [("job-5", "invalid_payload")])


if __name__ == "__main__":
    unittest.main()
