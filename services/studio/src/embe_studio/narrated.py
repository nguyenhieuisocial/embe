# SPDX-License-Identifier: GPL-3.0-or-later
"""Finite, local editorial-video compiler. Optional Piper runtime is GPL-3.0.

Never reads family media, starts background services, or publishes social posts.
The existing portal publisher handles private, checksum-verified distribution.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
import wave
from fractions import Fraction
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import av
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageOps
from piper import PiperVoice, SynthesisConfig
from piper.config import PiperConfig

from .campaign import load_catalog
from .render import caption_lines, font_at

MODEL_SHA256 = "ec7c89e2c85f4d1edc24b6120c18aaf1bda614f06b511567eb9c7c0de15e2dab"
CONFIG_SHA256 = "fafb9da1354ed4b77c31af228ed41fb41cd825c14cffa105454b25e6ae751ee0"
SIZE, FPS, RATE = (720, 1280), 24, 22050
MAX_BYTES = 4_000_000
PAPER, INK, ROSE = (255, 248, 246), (96, 52, 68), (183, 101, 127)
VOICE_CREDIT = {
    "name": "Piper · vi_VN-vais1000-medium",
    "attribution": "Dữ liệu VAIS1000: CC BY 4.0. Mô hình vais1000 từ rhasspy/piper-voices. Giọng đọc tổng hợp, không phải giọng người trong minh họa.",
    "url": "https://huggingface.co/rhasspy/piper-voices/blob/1162a9173d0ce503555aed757976b7a9912eae4c/vi/vi_VN/vais1000/medium/MODEL_CARD",
    "license": "https://creativecommons.org/licenses/by/4.0/",
}


def checksum(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def text_block(draw, text: str, y: int, *, size=38, width=600, bottom=1060, color=INK, x=60) -> int:
    font = font_at(size)
    lines = caption_lines(text, draw, font, width)
    line_height = math.ceil(size * 1.38)
    if y + len(lines) * line_height > bottom:
        raise ValueError("card_text_exceeds_safe_area")
    for line in lines:
        draw.text((x, y), line, font=font, fill=color, anchor="lt")
        y += line_height
    return y


def layers(beat: dict, item: dict, index: int, total: int, art_path: Path):
    background = Image.new("RGB", SIZE, PAPER)
    draw = ImageDraw.Draw(background)
    draw.rounded_rectangle((48, 70, 295, 118), radius=24, fill=(249, 224, 231))
    draw.text((67, 81), "EmBe Mẹ Bầu", font=font_at(28), fill=INK)
    draw.text((635, 83), f"{index + 1}/{total}", font=font_at(24), fill=ROSE, anchor="rt")
    board = item["board"]
    if len(board["rows"]) != 3 or len(board["columns"]) != 2:
        raise ValueError("invalid_knowledge_board")
    text_block(draw, board["title"], 149, size=49, bottom=235)
    text_block(draw, board["subtitle"], 224, size=31, bottom=310, color=ROSE)
    with Image.open(art_path) as original:
        # Contain the complete original illustration; never crop faces or label it as real.
        photo = ImageOps.contain(original.convert("RGB"), (240, 140), Image.Resampling.LANCZOS)
    text_block(draw, "Một bảng nhỏ\nđể mẹ dễ nhớ".replace("\n", " "), 304, size=30, width=310, bottom=400)
    colors = [(231, 242, 235), (251, 226, 231)]
    for column, label in enumerate(board["columns"]):
        x = 48 + column * 316
        draw.rounded_rectangle((x, 425, x + 308, 480), radius=15, fill=colors[column])
        draw.text((x + 20, 438), label, font=font_at(30), fill=INK)
    for row_index, row in enumerate(board["rows"]):
        y = 492 + row_index * 172
        active = index == row_index + 1
        # Same grid throughout the video. The spoken row is emphasized without shifting text.
        draw.rounded_rectangle((48, y, 672, y + 160), radius=18, fill=(255, 255, 255),
                               outline=ROSE if active else (234, 222, 226), width=3 if active else 1)
        draw.text((65, y + 14), row["label"], font=font_at(27), fill=ROSE)
        draw.line((355, y + 53, 355, y + 143), fill=(238, 228, 230), width=2)
        text_block(draw, row["left"], y + 48, size=25, width=264, bottom=y + 154, x=67)
        text_block(draw, row["right"], y + 48, size=25, width=264, bottom=y + 154, x=376)
    draw.rounded_rectangle((48, 1023, 672, 1120), radius=20, fill=(248, 231, 235))
    text_block(draw, board["caveat"], 1037, size=25, width=582, bottom=1110, x=67)
    draw.text((60, 1140), "Nguồn: NHS · Minh họa & giọng đọc AI", font=font_at(21), fill=(121, 102, 109))
    draw.text((60, 1173), "Tham khảo · Chưa duyệt chuyên môn", font=font_at(21), fill=(121, 102, 109))
    draw.rounded_rectangle((60, 1205, 660, 1211), radius=3, fill=(240, 223, 228))
    return background, photo


def frame_image(background, photo, local_frame: int, scene_frames: int, overall: float):
    image = background.copy()
    # Low-amplitude movement only; no flashes or rapidly changing backgrounds.
    scale = .975 + .025 * min(1, local_frame / max(1, scene_frames - 1))
    resized = photo.resize((round(photo.width * scale), round(photo.height * scale)), Image.Resampling.BILINEAR)
    image.paste(resized, (408 + (255 - resized.width) // 2, 277 + (140 - resized.height) // 2))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((60, 1205, max(66, 60 + round(600 * overall)), 1211), radius=3, fill=ROSE)
    return image


def render_video(path: Path, visuals: list, seconds: list[int], samples: np.ndarray) -> dict:
    started = time.monotonic()
    total_frames = sum(seconds) * FPS
    frame_count, audio_cursor = 0, 0
    with av.open(str(path), "w", format="mp4", options={"movflags": "+faststart"}) as container:
        video = container.add_stream("libx264", rate=FPS)
        video.width, video.height = SIZE
        video.pix_fmt = "yuv420p"
        video.codec_context.thread_count = 2
        video.options = {"preset": "veryfast", "crf": "27", "maxrate": "500k", "bufsize": "1000k"}
        audio = container.add_stream("aac", rate=RATE)
        audio.layout = "mono"
        audio.bit_rate = 48000
        for (background, photo), duration in zip(visuals, seconds, strict=True):
            for index in range(duration * FPS):
                if frame_count % FPS == 0 and (time.monotonic() - started > 480 or (path.exists() and path.stat().st_size > MAX_BYTES)):
                    raise RuntimeError("render_budget_exceeded")
                image = frame_image(background, photo, index, duration * FPS, (frame_count + 1) / total_frames)
                frame = av.VideoFrame.from_image(image)
                frame.pts, frame.time_base = frame_count, Fraction(1, FPS)
                for packet in video.encode(frame):
                    container.mux(packet)
                end = round((frame_count + 1) * RATE / FPS)
                sound = av.AudioFrame.from_ndarray(samples[audio_cursor:end].reshape(1, -1), format="fltp", layout="mono")
                sound.sample_rate, sound.pts, sound.time_base = RATE, audio_cursor, Fraction(1, RATE)
                for packet in audio.encode(sound):
                    container.mux(packet)
                audio_cursor, frame_count = end, frame_count + 1
        for stream in (video, audio):
            for packet in stream.encode():
                container.mux(packet)
    if path.stat().st_size > MAX_BYTES:
        raise RuntimeError("portal_size_budget_exceeded")
    with av.open(str(path)) as container:
        video, audio = container.streams.video[0], container.streams.audio[0]
        duration = float(container.duration / av.time_base)
        if video.codec_context.name != "h264" or audio.codec_context.name != "aac" or video.frames != total_frames:
            raise RuntimeError("av_verification_failed")
        if abs(duration - sum(seconds)) > .15 or (video.width, video.height) != SIZE:
            raise RuntimeError("av_timeline_mismatch")
    return {"width": SIZE[0], "height": SIZE[1], "fps": FPS, "frames": frame_count,
            "duration_seconds": sum(seconds), "byte_size": path.stat().st_size, "audio_codec": "aac",
            "checksum_sha256": checksum(path), "render_seconds": round(time.monotonic() - started, 2)}


def build(catalog_path: Path, model: Path, root: Path, artwork: Path) -> dict:
    catalog = load_catalog(catalog_path)
    if checksum(model) != MODEL_SHA256:
        raise ValueError("voice_model_checksum_mismatch")
    config_path = Path(str(model) + ".json")
    if checksum(config_path) != CONFIG_SHA256:
        raise ValueError("voice_config_checksum_mismatch")
    opts = ort.SessionOptions()
    opts.intra_op_num_threads, opts.inter_op_num_threads = 2, 1
    voice = PiperVoice(session=ort.InferenceSession(str(model), sess_options=opts, providers=["CPUExecutionProvider"]),
                       config=PiperConfig.from_dict(json.loads(config_path.read_text(encoding="utf-8"))))
    if voice.config.sample_rate != RATE:
        raise ValueError("unexpected_voice_sample_rate")
    root = root.resolve()
    root.mkdir(parents=True, exist_ok=True)
    cards = root / "cards"
    cards.mkdir(exist_ok=True)
    synthesis = SynthesisConfig(length_scale=1.03, volume=.85)
    manifest, videos = {}, []
    digest = hashlib.sha256(catalog_path.read_bytes() + Path(__file__).read_bytes()).hexdigest()
    for item in catalog["items"]:
        slug = item["slug"]
        illustration = (artwork / item["illustration"]).resolve()
        if illustration.parent != artwork.resolve():
            raise ValueError("artwork_outside_directory")
        scenes, visuals, durations, sounds = [], [], [], []
        for index, beat in enumerate(item["beats"]):
            wav_path = root / f"{slug}-{index + 1}.wav"
            with wave.open(str(wav_path), "wb") as output:
                voice.synthesize_wav(beat["text"], output, syn_config=synthesis)
            with wave.open(str(wav_path), "rb") as sound:
                if sound.getnchannels() != 1 or sound.getsampwidth() != 2 or sound.getframerate() != RATE:
                    raise ValueError("invalid_voice_output")
                pcm = np.frombuffer(sound.readframes(sound.getnframes()), dtype="<i2").astype(np.float32) / 32768
            if len(pcm) < RATE or len(pcm) > RATE * 25 or np.max(np.abs(pcm)) < .01:
                raise ValueError("empty_or_unbounded_narration")
            duration = math.ceil(len(pcm) / RATE + .45)
            # Small breath at each scene boundary; no narration cut off by scene timing.
            padded = np.zeros(duration * RATE, dtype=np.float32)
            padded[round(RATE * .15):round(RATE * .15) + len(pcm)] = pcm
            sounds.append(padded)
            durations.append(duration)
            background, photo = layers(beat, item, index, len(item["beats"]), illustration)
            visuals.append((background, photo))
            asset_id = str(uuid5(NAMESPACE_URL, f"narrated:{digest}:{checksum(illustration)}:{slug}:{index}"))
            card_path = cards / f"{asset_id}.png"
            frame_image(background, photo, 1, duration * FPS, 0).save(card_path, optimize=True)
            manifest[asset_id] = {"file": card_path.name, "provenance": "embe_educational_layout", "checksum_sha256": checksum(card_path)}
            scenes.append({"asset_id": asset_id, "seconds": duration})
            print(f"Voice ready: {slug} {index + 1}/{len(item['beats'])} ({duration}s)", flush=True)
        timeline = {"format": "infographic-voice-v1", "scenes": scenes, "audio": True, "voiceCredit": VOICE_CREDIT}
        (root / f"{slug}.timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")
        video_path = root / f"{slug}.mp4"
        result = render_video(video_path, visuals, durations, np.concatenate(sounds))
        videos.append({"slug": slug, "status": "completed", "local_path": str(video_path), "audio": True, "result": result})
        print(f"Video ready: {slug} ({result['duration_seconds']}s, {result['byte_size']} bytes)", flush=True)
        for background, photo in visuals:
            background.close()
            photo.close()
    (cards / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {"format": "infographic-voice-v1", "status": "draft", "published": False, "clinical_review": "not_reviewed", "catalog_sha256": checksum(catalog_path),
              "voice_model_sha256": checksum(model), "voice_config_sha256": checksum(config_path), "videos": videos}
    (root / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--artwork", type=Path, required=True)
    args = parser.parse_args()
    build(args.catalog, args.model, args.output, args.artwork)
