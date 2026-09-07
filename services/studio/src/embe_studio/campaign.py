from __future__ import annotations

import hashlib
import json
import math
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlparse
from uuid import NAMESPACE_URL, uuid5

from PIL import Image, ImageDraw, ImageOps

from .assets import EditorialAssets
from .contracts import Project, Scene
from .render import caption_lines, font_at
from .repository import Repository
from .worker import output_path, run_once

def load_catalog(path: Path, *, today: date | None = None) -> dict:
    if path.stat().st_size > 1_000_000:
        raise ValueError("catalog_too_large")
    catalog = json.loads(path.read_text(encoding="utf-8"))
    today = today or date.today()
    checked = date.fromisoformat(catalog["sources_checked_at"])
    due = date.fromisoformat(catalog["review_due"])
    if not checked <= today <= due or (due - checked).days > 31:
        raise ValueError("sources_require_recheck")
    if catalog.get("editorial_status") != "draft" or catalog.get("clinical_review") != "not_reviewed":
        raise ValueError("draft_compiler_does_not_issue_approval")
    slugs = set()
    for item in catalog["items"]:
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", item["slug"]) or item["slug"] in slugs:
            raise ValueError("invalid_topic_slug")
        slugs.add(item["slug"])
        if not item.get("sources") or not 3 <= len(item["beats"]) <= 10:
            raise ValueError("missing_evidence_or_scenes")
        if not any(beat["kind"] == "caveat" for beat in item["beats"]) and item["risk"] != "low":
            raise ValueError("missing_safety_context")
        for source_id in item["sources"]:
            source = catalog["sources"][source_id]
            parsed = urlparse(source["url"])
            if parsed.scheme != "https" or parsed.hostname not in {"www.nhs.uk", "www.fda.gov", "www.cdc.gov", "www.who.int"}:
                raise ValueError("unapproved_source_domain")
        for beat in item["beats"]:
            if not 1 <= len(beat["heading"]) <= 80 or not 1 <= len(beat["text"]) <= 240:
                raise ValueError("scene_text_too_long")
    return catalog


def propose(catalog: dict) -> list[dict]:
    """Rotate pillars instead of eight food videos in a row. Scores are editorial, not analytics."""
    pending = sorted(catalog["items"], key=lambda item: -item["priority"])
    selected: list[dict] = []
    while pending:
        previous = selected[-1]["pillar"] if selected else None
        index = next((i for i, item in enumerate(pending) if item["pillar"] != previous), 0)
        selected.append(pending.pop(index))
    return selected


def draw_text(draw, text: str, y: int, size: int, color, *, width: int = 850, max_lines: int = 7) -> int:
    while True:
        font = font_at(size)
        lines = caption_lines(text, draw, font, width)
        if len(lines) <= max_lines:
            break
        size -= 2
        if size < 28:
            raise ValueError("text_does_not_fit")
    height = int(size * 1.4)
    for line in lines:
        draw.text((100, y), line, fill=color, font=font, anchor="lt")
        y += height
    return y


def card(beat: dict, item: dict, index: int, source_label: str, illustration: Path | None) -> Image.Image:
    canvas = Image.new("RGB", (1080, 1920), (255, 248, 247))
    draw = ImageDraw.Draw(canvas)
    # Code-native editorial cards, not copied third-party app UI or family photos.
    draw.rounded_rectangle((90, 108, 520, 182), radius=37, fill=(247, 220, 226))
    draw.text((120, 126), "EmBe Mẹ Bầu", font=font_at(34), fill=(118, 57, 80))
    draw.text((920, 136), f"{index + 1:02d}", font=font_at(32), fill=(118, 57, 80))
    y = draw_text(draw, beat["heading"], 270, 76, (92, 44, 63), max_lines=3)
    if index == 0 and illustration:
        with Image.open(illustration) as original:
            art = ImageOps.contain(original.convert("RGB"), (810, 810), Image.Resampling.LANCZOS)
            canvas.paste(art, ((1080 - art.width) // 2, y + 45))
        y += 910
        y = draw_text(draw, beat["text"], y, 45, (92, 65, 75), max_lines=4)
    else:
        draw.line((100, y + 65, 290, y + 65), fill=(206, 118, 144), width=9)
        y = draw_text(draw, beat["text"], y + 140, 60, (92, 65, 75), max_lines=7)
    if y > 1630:
        raise ValueError("card_overflows_safe_area")
    draw.text((100, 1680), f"Nguồn: {source_label}", font=font_at(27), fill=(104, 90, 96))
    draw.text((100, 1730), "Tham khảo · Không thay tư vấn y tế", font=font_at(27), fill=(104, 90, 96))
    draw.text((100, 1780), "Bản nháp · Chưa duyệt chuyên môn", font=font_at(27), fill=(118, 57, 80))
    return canvas


def timestamp(seconds: int) -> str:
    return f"{seconds // 3600:02d}:{seconds // 60 % 60:02d}:{seconds % 60:02d}.000"


def build_campaign(catalog_path: Path, root: Path, illustration: Path | None, render_count: int = 0, full: bool = False) -> dict:
    catalog = load_catalog(catalog_path)
    if not 0 <= render_count <= len(catalog["items"]):
        raise ValueError("invalid_render_count")
    encoded = json.dumps(catalog, ensure_ascii=False, sort_keys=True).encode()
    artwork_hash = hashlib.sha256(illustration.read_bytes()).hexdigest() if illustration else "none"
    digest = hashlib.sha256(encoded + artwork_hash.encode() + b"editorial-layout-v1").hexdigest()
    root = root.resolve()
    directory = root / f"campaign-{digest[:12]}"
    directory.mkdir(parents=True, exist_ok=True)
    asset_dir = directory / "cards"
    asset_dir.mkdir(exist_ok=True)
    repository = Repository(directory / "queue")
    manifest = {}
    topics = propose(catalog)
    plan = ["# EmBe Mẹ Bầu — xưởng nội dung", "", "Bản nháp biên tập, chưa được chuyên gia y tế duyệt; chưa đăng mạng xã hội.",
            "", "Lịch dưới đây là thứ tự đề xuất, không phải lịch đăng tự động. Không sử dụng dữ liệu gia đình.", ""]
    jobs, requested_projects = [], []
    for topic_index, item in enumerate(topics):
        slug = item["slug"]
        plan += [f"## {topic_index + 1}. {item['title']}", "", f"Tuyến: {item['pillar']} · Giai đoạn: {item['stage']}", "",
                 f"Mở đầu B để thử sau: {item['hook_b']}", ""]
        source_label = ", ".join(dict.fromkeys(catalog["sources"][key]["publisher"] for key in item["sources"]))
        scenes, cues, seconds = [], ["WEBVTT", ""], 0
        for index, beat in enumerate(item["beats"]):
            asset_id = str(uuid5(NAMESPACE_URL, f"embe-editorial:{digest}:{slug}:{index}"))
            path = asset_dir / f"{asset_id}.png"
            card(beat, item, index, source_label, illustration if item["pillar"] == "Ăn uống dễ hiểu" else None).save(path)
            manifest[asset_id] = {"file": path.name, "provenance": "embe_educational_layout", "checksum_sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            duration = max(4, min(8, math.ceil(len(beat["text"].split()) / 3)))
            scenes.append(Scene(asset_id=asset_id, seconds=duration))
            cues += [f"{timestamp(seconds)} --> {timestamp(seconds + duration)}", beat["text"], ""]
            plan += [f"- **{seconds:02d}–{seconds + duration:02d}s · {beat['heading']}:** {beat['text']}"]
            seconds += duration
        project = Project(scenes=scenes, quality="full" if full else "preview", motion=False)
        (directory / f"{slug}.project.json").write_text(project.model_dump_json(indent=2), encoding="utf-8")
        (directory / f"{slug}.vtt").write_text("\n".join(cues), encoding="utf-8")
        (directory / f"{slug}.voiceover.txt").write_text("\n\n".join(beat["text"] for beat in item["beats"]), encoding="utf-8")
        plan += ["", f"Caption: {item['caption']}", "", " ".join("#" + tag for tag in item["hashtags"]), "", "Nguồn đối chiếu:", ""]
        for key in item["sources"]:
            source = catalog["sources"][key]
            plan += [f"- [{source['publisher']} — {source['title']}]({source['url']}) · đọc ngày {catalog['sources_checked_at']}. {source['jurisdiction']}."]
        plan += [""]
        if topic_index < render_count:
            key = str(uuid5(NAMESPACE_URL, f"{digest}:{slug}:{project.quality}"))
            requested_projects.append((slug, key, project))
    plan += ["## Ý tưởng chưa nghiên cứu đủ để xuất bản", "", *[f"- {idea}" for idea in catalog["research_backlog"]]]
    (directory / "Kich-ban-va-lich-de-xuat.md").write_text("\n".join(plan), encoding="utf-8")
    manifest_path = asset_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    # Only a finite run requested by the operator, never an unattended publish loop.
    source = EditorialAssets(manifest_path)
    for slug, key, project in requested_projects:
        job = repository.submit(key, project)
        jobs.append({"slug": slug, "id": job["id"]})
        if job["status"] == "queued":
            run_once(repository, source)
    report = {"brand": catalog["brand"], "status": "draft", "published": False, "clinical_review": "not_reviewed",
              "scripts": len(topics), "research_ideas": len(catalog["research_backlog"]), "directory": str(directory),
              "audio": "voiceover_text_only", "videos": []}
    for job in jobs:
        saved = repository.get(job["id"])
        report["videos"].append({"slug": job["slug"], **saved, "local_path": str(output_path(repository, job["id"])) if saved["status"] == "completed" else None})
    if jobs:
        plan += ["", "## Video nháp đã dựng", "", "Video chưa có giọng đọc; lời đọc và phụ đề nằm cùng thư mục. Chưa duyệt chuyên môn, chưa đăng công khai.", ""]
        for video in report["videos"]:
            if video["status"] == "completed":
                plan += [f"- [{video['slug']}](queue/outputs/{video['id']}.mp4) · {video['result']['duration_seconds']:g} giây"]
            else:
                plan += [f"- {video['slug']}: {video['status']} — chưa có video hoàn chỉnh."]
        (directory / "Kich-ban-va-lich-de-xuat.md").write_text("\n".join(plan), encoding="utf-8")
    (directory / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report
