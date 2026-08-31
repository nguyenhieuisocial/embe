import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from assistant_worker import AssistantJob, process_jobs  # noqa: E402


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
    def test_processes_only_bounded_topic_jobs(self):
        queue = FakeQueue([AssistantJob("job-1", "ngu", 7)])
        calls = []

        result = process_jobs(
            queue,
            lambda topic, start, end: calls.append((topic, start, end)) or "Bé ngủ đều.",
            today=date(2026, 8, 31),
        )

        self.assertEqual(result, {"claimed": 1, "completed": 1, "failed": 0})
        self.assertEqual(calls, [("ngu", date(2026, 8, 25), date(2026, 8, 31))])
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


if __name__ == "__main__":
    unittest.main()
