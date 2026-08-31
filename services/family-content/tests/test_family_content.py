from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from export_content import load_content, main as export_main, render_markdown
from grocy_seed import apply_master_data, load_master_data, main as grocy_main


ROOT = Path(__file__).resolve().parents[1]
PORTAL_CONTENT = ROOT.parents[1] / "apps" / "portal" / "src" / "lib" / "pregnancy-content.ts"


class FakeGrocy:
    def __init__(self):
        self.values = {
            "locations": [{"name": "Vật tư em bé"}],
            "quantity_units": [],
            "product_groups": [],
        }
        self.created = []

    def list(self, entity):
        return list(self.values[entity])

    def create(self, entity, item):
        self.created.append((entity, item["name"]))
        self.values[entity].append(item)


class FamilyContentTests(unittest.TestCase):
    def test_reviewed_content_exports_obisidian_checklist_and_menu(self):
        content_path = ROOT / "content" / "pregnancy-care.vi.json"
        content = load_content(content_path)
        markdown = render_markdown(content)
        self.assertEqual(len(content["checklist"]), 13)
        self.assertEqual(len(content["weekly_menu"]), 7)
        self.assertGreaterEqual(len(content["guidance"]), 12)
        self.assertEqual({item["level"] for item in content["guidance"]}, {"do", "limit", "avoid"})
        self.assertEqual(markdown.count("- [ ] **"), 13)
        self.assertIn("Ranh giới an toàn", markdown)
        self.assertIn("## Nên ưu tiên", markdown)
        self.assertIn("## Nên hạn chế", markdown)
        self.assertIn("## Nên tránh", markdown)
        self.assertIn("Caffeine không quá 200 mg mỗi ngày", markdown)
        self.assertIn("Viện Dinh dưỡng Quốc gia", markdown)

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "care.md"
            self.assertEqual(export_main(["--content", str(content_path), "--output", str(output)]), 0)
            self.assertEqual(output.read_text(encoding="utf-8"), markdown)

    def test_reviewed_content_stays_aligned_with_the_mobile_portal(self):
        content = load_content(ROOT / "content" / "pregnancy-care.vi.json")
        portal = PORTAL_CONTENT.read_text(encoding="utf-8")
        for item in content["checklist"]:
            self.assertIn(f'id: "{item["id"]}"', portal)
            self.assertIn(item["title"], portal)
        for day in content["weekly_menu"]:
            self.assertIn(day["breakfast"], portal)
            self.assertIn(day["lunch"], portal)
            self.assertIn(day["dinner"], portal)
        for item in content["guidance"]:
            self.assertIn(f'id: "{item["id"]}"', portal)
            self.assertIn(item["title"], portal)

    def test_grocy_master_data_is_idempotent_and_has_no_stock(self):
        path = ROOT / "content" / "grocy-master-data.vi.json"
        data = load_master_data(path)
        self.assertNotIn("products", data)
        self.assertNotIn("stock", json.dumps(data, ensure_ascii=False).lower())
        client = FakeGrocy()
        first = apply_master_data(client, data)
        second = apply_master_data(client, data)
        self.assertEqual(first["created"], 9)
        self.assertEqual(first["unchanged"], 1)
        self.assertEqual(second, {"created": 0, "unchanged": 10})

    def test_grocy_defaults_to_non_mutating_dry_run(self):
        path = ROOT / "content" / "grocy-master-data.vi.json"
        self.assertEqual(grocy_main(["--data", str(path)]), 0)


if __name__ == "__main__":
    unittest.main()
