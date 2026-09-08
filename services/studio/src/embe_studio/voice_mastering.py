"""Bounded local EBU R128 mastering using the FFmpeg already bundled with PyAV.

This checks signal quality, not pronunciation or human listening quality.
No noise gate, pitch shifting, voice cloning, network request or new process.
"""
from __future__ import annotations
from fractions import Fraction
import gc
import json
import math
import threading

_LOG_LOCK = threading.Lock()


def _filter(pcm, args):
    import av
    import numpy as np
    graph = av.filter.Graph()
    source = graph.add_abuffer(sample_rate=48000, format='fltp', layout='mono', time_base=Fraction(1, 48000))
    normalizer = graph.add('loudnorm', args)
    resampler = graph.add('aresample', '48000')
    sink = graph.add('abuffersink')
    source.link_to(normalizer); normalizer.link_to(resampler); resampler.link_to(sink)
    graph.configure()
    frame = av.AudioFrame.from_ndarray(pcm.reshape(1, -1), format='fltp', layout='mono')
    frame.sample_rate, frame.pts, frame.time_base = 48000, 0, Fraction(1, 48000)
    source.push(frame); source.push(None)
    chunks = []
    while True:
        try: chunks.append(sink.pull().to_ndarray().reshape(-1))
        except av.error.EOFError: break
    if not chunks: raise ValueError('voice_unavailable')
    return np.concatenate(chunks).astype(np.float32)


def measure(pcm):
    """FFmpeg logs statistics when its graph is released; never log script text."""
    import av
    with _LOG_LOCK:
        old_level = av.logging.get_level()
        try:
            av.logging.set_level(av.logging.INFO)
            with av.logging.Capture(local=False) as logs:
                _filter(pcm, 'I=-18:TP=-2:LRA=11:print_format=json')
                gc.collect()
            stats = [json.loads(message) for _, name, message in logs
                     if name == 'loudnorm' and '"input_i"' in message]
        finally:
            av.logging.set_level(old_level)
    if len(stats) != 1: raise ValueError('voice_unavailable')
    values = {key: float(stats[0][key]) for key in ('input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset')}
    if not all(math.isfinite(v) for v in values.values()): raise ValueError('voice_unavailable')
    return values


def master_narration(pcm):
    """Two-pass loudness matching of the complete track; exact timeline retained."""
    import numpy as np
    pcm = np.asarray(pcm, dtype=np.float32).reshape(-1)
    if not 48000 <= len(pcm) <= 90*48000 or not np.isfinite(pcm).all():
        raise ValueError('voice_unavailable')
    before = measure(pcm)
    # Never boost a barely audible/model-failed signal into apparently good audio.
    if before['input_i'] < -30 or before['input_i'] > -8:
        raise ValueError('voice_unavailable')
    target = min(-18, before['input_i'] + 6)
    args = (f'I={target}:TP=-2:LRA=11:linear=true:'
            f'measured_I={before["input_i"]}:measured_TP={before["input_tp"]}:'
            f'measured_LRA={before["input_lra"]}:measured_thresh={before["input_thresh"]}:'
            f'offset={before["target_offset"]}')
    result = _filter(pcm, args)
    # A format/filter regression must not silently desynchronize subtitles.
    if len(result) != len(pcm) or not np.isfinite(result).all():
        raise ValueError('audio_timeline_mismatch')
    after = measure(result)
    if after['input_tp'] > -1.5 or abs(after['input_i'] - target) > 1.5:
        raise ValueError('voice_unavailable')
    return result, {'version': 1, 'targetLufs': target, 'beforeLufs': before['input_i'],
                    'afterLufs': after['input_i'], 'truePeakDbtp': after['input_tp'],
                    'timelineSamples': len(result), 'sampleRate': 48000}
