from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_content(path: Path) -> dict:
    content = json.loads(path.read_text(encoding="utf-8"))
    if content.get("schema_version") != 1:
        raise ValueError("unsupported content schema")
    checklist = content.get("checklist")
    menu = content.get("weekly_menu")
    sources = content.get("sources")
    if not isinstance(checklist, list) or not checklist:
        raise ValueError("checklist is empty")
    ids = [item.get("id") for item in checklist]
    if any(not item for item in ids) or len(ids) != len(set(ids)):
        raise ValueError("checklist ids must be unique")
    if not isinstance(menu, list) or len(menu) != 7:
        raise ValueError("weekly menu must contain seven days")
    for day in menu:
        if any(not str(day.get(meal, "")).strip() for meal in ("day", "breakfast", "lunch", "dinner")):
            raise ValueError("every menu day needs three meals")
    if not isinstance(sources, list) or not sources:
        raise ValueError("sources are required")
    if any(not str(source.get("url", "")).startswith("https://") for source in sources):
        raise ValueError("source links must use HTTPS")
    return content


def render_markdown(content: dict) -> str:
    lines = [
        "---",
        "type: pregnancy-care",
        f"content-reviewed: {content['reviewed_at']}",
        "---",
        "",
        f"# {content['title']}",
        "",
        "> [!important] Ranh giới an toàn",
        f"> {content['safety']}",
        "",
        "## Việc của hôm nay",
        "",
    ]
    for item in content["checklist"]:
        lines.extend((f"- [ ] **{item['title']}**", f"  - {item['detail']}"))
    lines.extend(("", "## Thực đơn 7 ngày tham khảo", "", content["menu_note"], ""))
    lines.extend(("| Ngày | Sáng | Trưa | Tối |", "|---|---|---|---|"))
    for day in content["weekly_menu"]:
        cells = [str(day[key]).replace("|", "\\|") for key in ("day", "breakfast", "lunch", "dinner")]
        lines.append("| " + " | ".join(cells) + " |")
    lines.extend(("", "## Nguồn đã đối chiếu", ""))
    lines.extend(f"- [{source['label']}]({source['url']})" for source in content["sources"])
    lines.append("")
    return "\n".join(lines)


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(path)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export reviewed family care content to Obsidian")
    parser.add_argument("--content", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    content = load_content(args.content)
    write_atomic(args.output, render_markdown(content))
    print(json.dumps({"status": "ok", "checklist_items": len(content["checklist"]), "menu_days": 7}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
