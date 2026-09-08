"""Frame-aligned narration. No time stretching or removal of in-sentence pauses."""
from __future__ import annotations
import math


def paced_scene(pcm, rate=48000, fps=24, *, editorial=False):
    import numpy as np
    if rate != 48000 or fps != 24:
        raise ValueError('invalid_audio_format')
    pcm = np.asarray(pcm, dtype=np.float32).reshape(-1)
    if not rate // 10 <= len(pcm) <= rate * 30 or not np.isfinite(pcm).all():
        raise ValueError('voice_too_long')
    # Only remove quiet outer padding below -54 dBFS. Retain 60 ms before
    # and 100 ms after speech, including soft initial/final consonants.
    window = rate // 100
    envelope = np.max(np.abs(np.pad(pcm, (0, (-len(pcm)) % window))).reshape(-1, window), axis=1)
    active = np.flatnonzero(envelope > 10 ** (-54 / 20))
    if not active.size:
        raise ValueError('voice_unavailable')
    start = max(0, int(active[0]) * window - round(.06 * rate))
    end = min(len(pcm), (int(active[-1]) + 1) * window + round(.10 * rate))
    clip = pcm[start:end].copy()
    # Boundary fade only, never crossfade two words or change pitch.
    fade = min(round(.003 * rate), len(clip) // 2)
    clip[:fade] *= np.linspace(0, 1, fade)
    clip[-fade:] *= np.linspace(1, 0, fade)
    lead = round(.06 * rate)
    # Give the listener one short breath when the subject/card changes. Do not
    # synthesize a fake breath or edit pauses inside a spoken sentence.
    frames = math.ceil((lead + len(clip) + round((.34 if editorial else .18) * rate)) * fps / rate)
    padded = np.zeros(frames * (rate // fps), dtype=np.float32)
    padded[lead:lead + len(clip)] = clip
    return padded, frames / fps
