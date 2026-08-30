from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from pypdf import PdfReader


def outline_count(items) -> int:
    total = 0
    for item in items:
        if isinstance(item, list):
            total += outline_count(item)
        else:
            total += 1
    return total


def inspect(pdf_path: Path) -> dict:
    reader = PdfReader(pdf_path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    sizes = []
    for page in reader.pages:
        width = round(float(page.mediabox.width), 1)
        height = round(float(page.mediabox.height), 1)
        sizes.append((width, height))
    a5 = all(abs(width - 419.5) < 2 and abs(height - 595.3) < 2 for width, height in sizes)
    problems = []
    if len(reader.pages) < 3:
        problems.append("too_few_pages")
    if "Mục lục" not in text:
        problems.append("missing_table_of_contents")
    if "�" in text or "\x00" in text:
        problems.append("broken_text_glyph")
    if not a5:
        problems.append("unexpected_page_size")
    outlines = outline_count(reader.outline)
    if outlines < 2:
        problems.append("missing_pdf_outline")
    return {
        "schema_version": 1,
        "passed": not problems,
        "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
        "pages": len(reader.pages),
        "page_size": "A5" if a5 else "unexpected",
        "outline_entries": outlines,
        "has_table_of_contents": "Mục lục" in text,
        "problems": problems,
    }


def write_atomic(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Preflight an EmBe monthly PDF without exposing family content")
    parser.add_argument("--pdf", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    result = inspect(args.pdf)
    write_atomic(args.output, result)
    print(json.dumps({key: result[key] for key in ("passed", "pages", "page_size", "outline_entries")}))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
