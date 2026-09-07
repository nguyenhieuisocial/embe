from __future__ import annotations

import hashlib
import io
import time
import warnings
from fractions import Fraction
from pathlib import Path
from typing import Callable

import av
from PIL import Image, ImageDraw, ImageFont, ImageOps

from .assets import MAX_IMAGE_BYTES, AssetSource
from .contracts import Project, dimensions

FPS = 30
PAPER = (255, 246, 248)
INK = (97, 63, 78)
MAX_PIXELS = 20_000_000
MAX_OUTPUT_BYTES = 100_000_000


class RenderCancelled(RuntimeError):
    pass


def font_at(size: int, font_path: Path | None = None):
    candidates = [str(font_path)] if font_path else ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    raise RuntimeError("vietnamese_font_unavailable")


def decode_image(body: bytes) -> Image.Image:
    if not 0 < len(body) <= MAX_IMAGE_BYTES:
        raise ValueError("invalid_image")
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(body)) as image:
            if image.format not in {"PNG", "JPEG", "WEBP"} or image.width * image.height > MAX_PIXELS or getattr(image, "n_frames", 1) != 1:
                raise ValueError("invalid_image")
            # Rasterization strips EXIF, GPS, original filenames and other metadata.
            return ImageOps.exif_transpose(image).convert("RGB")


def caption_lines(text: str, draw: ImageDraw.ImageDraw, font, width: int) -> list[str]:
    lines: list[str] = []
    for word in text.split():
        candidate = (lines[-1] + " " + word) if lines else word
        if lines and draw.textlength(candidate, font=font) <= width:
            lines[-1] = candidate
        else:
            # Break unusually long tokens rather than clip or overflow the frame.
            part = ""
            for char in word:
                if part and draw.textlength(part + char, font=font) > width:
                    lines.append(part)
                    part = ""
                part += char
            lines.append(part)
    return lines


def scene_canvas(image: Image.Image, caption: str, size: tuple[int, int], font_path: Path | None = None) -> tuple[Image.Image, Image.Image, int]:
    width, height = size
    canvas = Image.new("RGB", size, PAPER)
    draw = ImageDraw.Draw(canvas)
    font_size = max(12, width // 24)
    while True:
        font = font_at(font_size, font_path)
        lines = caption_lines(caption, draw, font, int(width * .86))
        if len(lines) <= 4 or font_size <= 12:
            break
        font_size -= 1
    line_height = int(font_size * 1.45)
    caption_height = max(int(height * .12), (len(lines) + 2) * line_height) if caption else int(height * .06)
    image_area = height - caption_height
    # Every orientation is contained, never center-cropped. The small motion stays inside this box.
    photo = ImageOps.contain(image, (int(width * .94), int(image_area * .94)), Image.Resampling.LANCZOS)
    for index, line in enumerate(lines):
        draw.text((width // 2, image_area + line_height * (index + .5)), line, font=font, fill=INK, anchor="mt")
    return canvas, photo, image_area


def render(project: Project, source: AssetSource, output: Path, progress: Callable[[int], bool], *, font_path: Path | None = None) -> dict:
    started = time.monotonic()
    total_frames = sum(scene.seconds for scene in project.scenes) * FPS
    size = dimensions(project)
    count = 0
    output.parent.mkdir(parents=True, exist_ok=True)
    # Direct FFmpeg library bindings: no command shell, console windows or installer.
    with av.open(str(output), mode="w", format="mp4", options={"movflags": "+faststart"}) as container:
        stream = container.add_stream("libx264", rate=FPS)
        stream.width, stream.height = size
        stream.pix_fmt = "yuv420p"
        stream.codec_context.thread_count = 2
        stream.options = {"preset": "veryfast", "crf": "23"}
        for scene in project.scenes:
            if not progress(count * 100 // total_frames):
                raise RenderCancelled()
            image = decode_image(source.read(scene.asset_id))
            background, photo, image_area = scene_canvas(image, scene.caption, size, font_path)
            image.close()
            length = scene.seconds * FPS
            for index in range(length):
                if count % FPS == 0:
                    if not progress(count * 100 // total_frames):
                        raise RenderCancelled()
                    if time.monotonic() - started > 600 or (output.exists() and output.stat().st_size > MAX_OUTPUT_BYTES):
                        raise RuntimeError("render_budget_exceeded")
                canvas = background.copy()
                scale = .96 + .04 * index / max(1, length - 1) if project.motion else 1
                scaled = photo.resize((max(1, round(photo.width * scale)), max(1, round(photo.height * scale))), Image.Resampling.BILINEAR)
                canvas.paste(scaled, ((size[0] - scaled.width) // 2, (image_area - scaled.height) // 2))
                # No flashing/sliding when reduced motion is requested.
                if project.motion:
                    alpha = min(1., (index + 1) / 10, (length - index) / 10)
                    if alpha < 1:
                        canvas = Image.blend(background, canvas, alpha)
                frame = av.VideoFrame.from_image(canvas)
                frame.pts, frame.time_base = count, Fraction(1, FPS)
                for packet in stream.encode(frame):
                    container.mux(packet)
                count += 1
            photo.close()
            background.close()
        for packet in stream.encode():
            container.mux(packet)
    if output.stat().st_size > MAX_OUTPUT_BYTES:
        raise RuntimeError("render_budget_exceeded")
    # Re-open and verify declared dimensions/duration before publishing the file.
    with av.open(str(output)) as container:
        stream = container.streams.video[0]
        if (stream.width, stream.height) != size or stream.frames != total_frames or stream.codec_context.name != "h264":
            raise RuntimeError("output_verification_failed")
    with output.open("rb") as handle:
        checksum = hashlib.file_digest(handle, "sha256").hexdigest()
    return {"width": size[0], "height": size[1], "fps": FPS, "frames": count,
            "duration_seconds": count / FPS, "byte_size": output.stat().st_size,
            "checksum_sha256": checksum, "render_seconds": round(time.monotonic() - started, 3)}
