# SPDX-License-Identifier: GPL-3.0-or-later
"""Pinned, local-only Southern Vietnamese preset. No cloning or cloud speech calls."""
from __future__ import annotations
import hashlib
import importlib.metadata
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
MODEL_DIR = ROOT / 'data/studio-voice/nano'
REVISION = 'aba295eb96a6fa6003ebe417cc1f2802a7adc1dc'
FILES = {
    'codec_decoder.onnx': 'b0ab15e7828a39d53679e25b1ba4ba415a61311307202a6323130b9e1cc3029d',
    'duration_predictor.onnx': '20fd7fa60006d0a48ee82e0451b3f920d2052588c083c756cce669f3947c0a68',
    'text_encoder.onnx': '204f02cccae1f16ccb2d3840f05721a37fe250b82cbd456337a0ccb49615e4bf',
    'vector_estimator.onnx': 'c6c1d4398ca35d3ad1bd3f0459413d1b975d09e7f2f3a2b4493a7b92bbf6ce93',
    'constants.npz': '7c011938effe41687a9af85107a31a040dfcf0fb3d0f048ec10f4fb65c1a8829',
    'config.json': '3762f1716fd8d7a1451ddf2e051c03b0a341e8adda4f1dbd0db0ae9777514e56',
}
PRESET_SHA = '2ca4cbf475409e61fda662fbd3fb3a3ac3e980bbc3925fedb4d1199c4ccac3e7'
CREDIT = {
    'name': 'Ái Hân · nữ miền Nam · VieNeu Nano',
    'attribution': 'Giọng AI Ái Hân (nữ miền Nam), VieNeu-TTS v3 Nano / pnnbao97. Mô hình và preset Apache 2.0, không phải giọng của Mẹ Ngân. Bản Nano thử nghiệm; cần nghe lại trước khi đăng.',
    'url': 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano',
    'license': 'https://www.apache.org/licenses/LICENSE-2.0',
    'modelRevision': REVISION,
}

def digest(path):
    with Path(path).open('rb') as f: return hashlib.file_digest(f, 'sha256').hexdigest()

def provision():
    """Explicit installer only. Runtime never downloads models or arbitrary URLs."""
    import shutil
    from huggingface_hub import hf_hub_download
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(MODEL_DIR).free < 1_000_000_000: raise ValueError('insufficient_space')
    for name, expected in FILES.items():
        target = MODEL_DIR / name
        if not target.exists():
            hf_hub_download('pnnbao-ump/VieNeu-TTS-v3-Nano', name, revision=REVISION, local_dir=MODEL_DIR)
        if digest(target) != expected: raise ValueError('model_integrity_error')
        print(json.dumps({'verified': name}), flush=True)

class SouthernVoice:
    def __init__(self):
        if importlib.metadata.version('vieneu') != '3.6.4': raise ValueError('voice_runtime_version')
        import vieneu
        for name, expected in FILES.items():
            if digest(MODEL_DIR / name) != expected: raise ValueError('model_integrity_error')
        preset = Path(vieneu.__file__).parent / 'assets/voices_v3_nano.json'
        if digest(preset) != PRESET_SHA: raise ValueError('preset_integrity_error')
        self.engine = vieneu.Vieneu(mode='v3nano', onnx_dir=str(MODEL_DIR), threads=2, steps=16, cfg=3.0)

    def speak(self, text, speed=1.0):
        import numpy as np
        import soxr
        if speed not in (0.95, 1.0, 1.05): raise ValueError('invalid_voice_speed')
        pcm = self.engine.infer(text, voice='Ái Hân', speed=speed, seed=42, max_chars=180)
        pcm = np.asarray(pcm, dtype=np.float32).reshape(-1)
        if not np.isfinite(pcm).all() or not 2400 <= len(pcm) <= 30 * 24000: raise ValueError('voice_too_long')
        pcm = soxr.resample(pcm, self.engine.sample_rate, 22050)
        peak = float(np.max(np.abs(pcm)))
        if peak < .01: raise ValueError('voice_unavailable')
        return np.clip(pcm * min(1.0, .92 / peak), -1, 1).astype(np.float32)

    def close(self):
        self.engine.close()

if __name__ == '__main__': provision()
