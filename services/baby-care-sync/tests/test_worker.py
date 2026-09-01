import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from embe_baby_care_sync.worker import BabyBuddy, RemoteError, run_once


class Queue:
    def __init__(self):
        self.completed = []
    def claim(self):
        return [{"id": "event-1", "kind": "sleep", "caregiver": "father", "occurred_at": "2026-09-01T01:00:00Z", "ended_at": "2026-09-01T02:00:00Z", "details": {"nap": False}}]
    def complete(self, *args, **kwargs):
        self.completed.append((args, kwargs))


class WorkerTests(unittest.TestCase):
    def test_completes_successful_sync_with_remote_id(self):
        queue = Queue()
        babybuddy = type("Baby", (), {"save": lambda _self, _event: 83})()
        self.assertEqual(run_once(queue, babybuddy), {"synced": 1, "failed": 0})
        self.assertEqual(queue.completed[0][0], ("event-1", True, 83))

    def test_requeues_transient_failure_without_losing_event(self):
        queue = Queue()
        def fail(_event):
            raise RemoteError("network_unavailable")
        babybuddy = type("Baby", (), {"save": staticmethod(fail)})()
        self.assertEqual(run_once(queue, babybuddy), {"synced": 0, "failed": 1})
        self.assertEqual(queue.completed[0][0], ("event-1", False))
        self.assertEqual(queue.completed[0][1], {"error": "network_unavailable"})

    def test_recovers_remote_id_after_post_succeeded_but_queue_completion_failed(self):
        class Http:
            def request(self, method, url, **_kwargs):
                self.method = method
                return {"results": [{"id": 91, "notes": "Mẹ Ngân · embe:event:event-1"}]}
        http = Http()
        babybuddy = BabyBuddy("http://babybuddy:8000", "token", http, child_id=7)
        remote_id = babybuddy.save({"id": "event-1", "kind": "sleep", "caregiver": "mother",
                                    "occurred_at": "2026-09-01T01:00:00Z", "ended_at": "2026-09-01T02:00:00Z",
                                    "details": {"nap": False}, "babybuddy_id": None})
        self.assertEqual(remote_id, 91)
        self.assertEqual(http.method, "GET")


if __name__ == "__main__":
    unittest.main()
