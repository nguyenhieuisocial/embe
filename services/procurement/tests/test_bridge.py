import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from embe_procurement.bridge import ProcurementAction, process_actions, write_status
from embe_procurement.domain import StaleProposalError


class ProcurementBridgeTests(unittest.TestCase):
    def test_processes_hash_locked_actions_and_publishes_the_latest_projection(self):
        queue = Mock()
        queue.claim.return_value = [
            ProcurementAction("action-1", "proposal-1", "REVIEWED", "a" * 64)
        ]
        runtime = Mock()
        runtime.projection.return_value = [{"id": "proposal-1", "state": "REVIEWED"}]

        result = process_actions(queue, runtime)

        runtime.transition.assert_called_once_with(
            "proposal-1", "REVIEWED", actor_ref="family", expected_hash="a" * 64
        )
        queue.complete.assert_called_once_with("action-1")
        queue.sync.assert_called_once_with(runtime.projection.return_value)
        self.assertEqual(result["completed"], 1)

    def test_stale_hash_is_dead_lettered_without_mutating_other_actions(self):
        queue = Mock()
        queue.claim.return_value = [
            ProcurementAction("action-1", "proposal-1", "APPROVED", "b" * 64)
        ]
        runtime = Mock()
        runtime.transition.side_effect = StaleProposalError("Dữ liệu đề xuất đã thay đổi")
        runtime.projection.return_value = []

        result = process_actions(queue, runtime)

        queue.fail.assert_called_once_with("action-1", "stale_proposal")
        queue.sync.assert_called_once_with([])
        self.assertEqual(result["failed"], 1)

    def test_status_file_is_atomic_and_contains_no_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status.json"
            write_status(path, {"status": "ok", "pending": 0})
            content = path.read_text(encoding="utf-8")

        self.assertIn('"status": "ok"', content)
        self.assertNotIn("token", content.casefold())
        self.assertNotIn("secret", content.casefold())


if __name__ == "__main__":
    unittest.main()
