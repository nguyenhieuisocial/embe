"""Optional local voice-render verification; no network/model inference in these tests."""
import json
import tempfile
import unittest
from pathlib import Path

import av
import numpy as np
from PIL import Image, ImageDraw

from embe_studio.narrated import FPS, RATE, SIZE, frame_image, layers, render_video, text_block


class NarratedRenderTests(unittest.TestCase):
    def test_all_catalog_boards_fit_and_highlighting_is_visible(self):
        studio = Path(__file__).resolve().parents[1]
        catalog = json.loads((studio / "content/infographic-v2.json").read_text(encoding="utf-8"))
        for item in catalog["items"]:
            frames = []
            for index, beat in enumerate(item["beats"]):
                background, art = layers(beat, item, index, len(item["beats"]), studio / "assets" / item["illustration"])
                frames.append(frame_image(background, art, 12, 120, .2).tobytes())
                self.assertEqual(background.size, SIZE)
                background.close()
                art.close()
            self.assertNotEqual(frames[0], frames[1])
            self.assertNotEqual(frames[1], frames[2])

    def test_overflow_is_rejected_instead_of_clipping_vietnamese(self):
        with Image.new("RGB", SIZE) as image:
            with self.assertRaisesRegex(ValueError, "safe_area"):
                text_block(ImageDraw.Draw(image), "Một đoạn chữ quá dài " * 100, 100, bottom=200)

    def test_real_mp4_contains_decodable_sound_and_complete_frames(self):
        # Synthetic tone, no family audio; tests the actual AAC/H.264 mux path.
        with tempfile.TemporaryDirectory(prefix="embe-voice-check-") as temp:
            path = Path(temp) / "sample.mp4"
            background = Image.new("RGB", SIZE, "white")
            photo = Image.new("RGB", (80, 60), "pink")
            samples = (.1 * np.sin(2 * np.pi * 440 * np.arange(2 * RATE) / RATE)).astype(np.float32)
            result = render_video(path, [(background, photo)], [2], samples)
            self.assertEqual(result["frames"], 2 * FPS)
            self.assertLess(result["byte_size"], 4_000_000)
            with av.open(str(path)) as media:
                decoded = list(media.decode(audio=0))
                self.assertGreater(sum(frame.samples for frame in decoded), RATE)
                self.assertGreater(max(float(np.max(np.abs(frame.to_ndarray()))) for frame in decoded), .01)
            with av.open(str(path)) as media:
                self.assertEqual(len(list(media.decode(video=0))), 2 * FPS)
            background.close()
            photo.close()


if __name__ == "__main__":
    unittest.main()
