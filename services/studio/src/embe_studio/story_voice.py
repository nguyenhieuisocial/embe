# SPDX-License-Identifier: GPL-3.0-or-later
"""48 kHz Southern storytelling presets; pinned CPU inference, no voice cloning."""
from __future__ import annotations
import importlib.metadata
import json
from pathlib import Path
import re
import unicodedata

from .southern_voice import ROOT, digest

MODEL_DIR = ROOT / 'data/studio-voice/turbo'
REVISION = '8b7e9cffb4b41918cb638b9f62f0a751184d14a6'
CODEC_REVISION = 'ceff0d0749bfb3fa2d61149794ec6feef0d1e1ae'
PRESET_SHA = '0e3119d663c50e04855ebbe23b558e31759d3f9cd45c66abbaebfc79dad8984a'
FILES = {
    'onnx_update/vieneu_acoustic_cached.onnx': 'f631e3387c788c3d8b9a5ac5df94952af5bc4c4d1049ff8a751e76a246fff2d4',
    'onnx_update/vieneu_backbone_shared.data': 'c7c072193db33d0542457e2612c7272c44c4279d1cafaf0aa4c379964911db2f',
    'onnx_update/vieneu_decode_step.onnx': 'bedc379cea61ea5d616312750d95ad3924e055856662d19187a889a5edc24ceb',
    'onnx_update/vieneu_prefill.onnx': '27f8b064f6b57b5448e95d095f1959588c005d614678045c2b97ecccf3b7a0f7',
    'onnx_update/vieneu_v3_heads.npz': 'fb22484baa424bbb775133a6e5f0d00d6299b2b256fbe3312a864b85b9aed01e',
    'onnx_update/config.json': '17d89d414ee302a82db7b330bf57b4cdf8541569392119c81f552178cafcb79b',
    'onnx_update/tokenizer.json': '6cc6bcbe380b8c37bd9f2514e37c5dfa3e00e122c6e3125dae5c4afe48e39158',
}
CODEC_FILES = {
    'moss_audio_tokenizer_decode_full.onnx': '0fbbafe3fd4afa2a019af5c5ced204af6e2d1db044fa40f021525d2aee95b4ac',
    'moss_audio_tokenizer_decode_shared.data': 'e69d52e0f4e84ca27850557ee54face46632d3a5a16c89bd246c7c408466dcad',
}
VOICES = {'thuc-doan-south-v1': 'Thục Đoan', 'my-duyen-south-v1': 'Mỹ Duyên',
          'thuc-doan-south-v2': 'Thục Đoan', 'my-duyen-south-v2': 'Mỹ Duyên',
          'kim-thanh-south-v2': 'Kim Thanh'}


def provision():
    """Explicit install only, 521 MB. Missing runtime files fail closed."""
    import shutil
    from huggingface_hub import hf_hub_download
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(MODEL_DIR).free < 1_200_000_000:
        raise ValueError('insufficient_space')
    for repo, revision, directory, files in (
        ('pnnbao-ump/VieNeu-TTS-v3-Turbo', REVISION, MODEL_DIR, FILES),
        ('OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX', CODEC_REVISION, MODEL_DIR/'codec', CODEC_FILES),
    ):
        for name, expected in files.items():
            target = directory / name
            if not target.exists():
                hf_hub_download(repo, name, revision=revision, local_dir=directory)
            if digest(target) != expected: raise ValueError('model_integrity_error')
            print(json.dumps({'verified': name}), flush=True)


def spoken_text(text: str, *, improved=False) -> str:
    """Speech-only typography/brand cleanup; numbers and medical doses untouched.

    The upstream sea-g2p normalizer handles Vietnamese numbers and punctuation.
    Never translate or invent content, and never edit the stored script/subtitles.
    """
    text = unicodedata.normalize('NFC', text)
    text = re.sub(r'\bEmBe\b', 'Em Bé', text)
    if improved:
        # Keep intentional paragraph pauses. Spell only unambiguous acronyms;
        # do not infer a medicine name, dose, unit conversion or clinical meaning.
        for token, pronunciation in {'DHA': 'đê hát a', 'NIPT': 'en ai pi ti',
                                      'AI': 'ây ai', 'PDF': 'pi đi ép'}.items():
            text = re.sub(r'\b'+token+r'\b', pronunciation, text)
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        return re.sub(r'\n{3,}', '\n\n', re.sub(r'[^\S\n]+', ' ', text)).strip()
    return re.sub(r'\s+', ' ', text).strip()


def finish_audio(pcm, rate=48000, speed=1.0):
    """FFmpeg tempo (pitch preserved) and bounded level matching, no heavy denoise."""
    import av
    import numpy as np
    from fractions import Fraction
    if speed not in (.95, 1, 1.05): raise ValueError('invalid_voice_speed')
    pcm = np.asarray(pcm, dtype=np.float32).reshape(-1)
    if not np.isfinite(pcm).all() or not rate//10 <= len(pcm) <= 30*rate:
        raise ValueError('voice_too_long')
    if float(np.max(np.abs(pcm))) < .01: raise ValueError('voice_unavailable')
    if speed != 1:
        frame = av.AudioFrame.from_ndarray(pcm.reshape(1,-1), format='fltp', layout='mono')
        frame.sample_rate, frame.pts, frame.time_base = rate, 0, Fraction(1,rate)
        graph = av.filter.Graph()
        source = graph.add_abuffer(sample_rate=rate, format='fltp', layout='mono', time_base=Fraction(1,rate))
        tempo = graph.add('atempo', str(speed))
        sink = graph.add('abuffersink')
        source.link_to(tempo); tempo.link_to(sink); graph.configure()
        source.push(frame); source.push(None)
        chunks = []
        while True:
            try: chunks.append(sink.pull().to_ndarray().reshape(-1))
            except av.error.EOFError: break
        if not chunks: raise ValueError('voice_unavailable')
        pcm = np.concatenate(chunks).astype(np.float32)
    # Match voiced RMS only, excluding pauses. Cap gain at 6 dB and peaks at -1 dBFS;
    # unlike aggressive compression/denoising this preserves the preset's dynamics.
    voiced = pcm[np.abs(pcm) > .015]
    rms = float(np.sqrt(np.mean(voiced**2))) if voiced.size else 0
    if rms < .01: raise ValueError('voice_unavailable')
    gain = min(2.0, .13/rms, .89/float(np.max(np.abs(pcm))))
    pcm = (pcm*gain).astype(np.float32)
    fade = min(round(.005*rate), len(pcm)//2)
    pcm[:fade] *= np.linspace(0,1,fade, dtype=np.float32)
    pcm[-fade:] *= np.linspace(1,0,fade, dtype=np.float32)
    return pcm


def automatic_speed(text: str) -> float:
    """Keep one consistent voice; slow number/acronym-heavy scenes, not random voices."""
    return .95 if re.search(r'\d|\b(?:DHA|NIPT|PDF|BMI|WHO)\b', text) else 1.0


class StoryVoice:
    sample_rate = 48000

    def __init__(self, voice_id='thuc-doan-south-v1'):
        if voice_id not in VOICES: raise ValueError('invalid_voice')
        if importlib.metadata.version('vieneu') != '3.6.4': raise ValueError('voice_runtime_version')
        import vieneu
        for directory, files in ((MODEL_DIR, FILES), (MODEL_DIR/'codec', CODEC_FILES)):
            for name, expected in files.items():
                if digest(directory/name) != expected: raise ValueError('model_integrity_error')
        if digest(Path(vieneu.__file__).parent/'assets/voices_v3_turbo.json') != PRESET_SHA:
            raise ValueError('preset_integrity_error')
        from vieneu.base import BaseVieneuTTS
        from vieneu.v3turbo import V3TurboVieNeuTTS
        from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine

        class PresetEngine(OnnxV3LiteEngine):
            def _load_denoiser(self):
                # No reference recordings accepted; avoid the SDK's optional remote fetch.
                return None

        class LocalTurbo(V3TurboVieNeuTTS):
            def __init__(self):
                # SDK 3.6.4 does not forward codec_dir. Inject its own local engine;
                # reuse original chunking, repetition guard, phonemizer and joins.
                BaseVieneuTTS.__init__(self)
                self.sample_rate = 48000
                self.babble_retries = 1
                self.engine = PresetEngine(checkpoint_path=str(MODEL_DIR),
                    onnx_dir=str(MODEL_DIR/'onnx_update'), codec_dir=str(MODEL_DIR/'codec'), threads=2)
                self.engine.babble_retries = self.babble_retries
                self.backend, self.default_style = 'onnx', 'tu_nhien'
                self.backbone_repo = str(MODEL_DIR)
                self._load_v3_voices()
                self.max_batch_size, self._batch_engine = 1, None

        self.engine = LocalTurbo()
        self.name = VOICES[voice_id]
        self.improved = voice_id.endswith('-v2')
        self.credit = {
            'name': f'{self.name} · nữ miền Nam · VieNeu Turbo 48 kHz',
            'attribution': f'Giọng AI {self.name}, nữ miền Nam kể chuyện. VieNeu-TTS v3 Turbo / pnnbao97, preset Apache 2.0; không phải giọng Mẹ Ngân. Nghe lại trước khi đăng.',
            'url': 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo',
            'license': 'https://www.apache.org/licenses/LICENSE-2.0',
            'modelRevision': REVISION, 'codecRevision': CODEC_REVISION,
            'presetChecksum': PRESET_SHA, 'processingVersion': 2 if self.improved else 1,
        }

    def speak(self, text, speed=1.0):
        if speed not in (.95, 1, 1.05): raise ValueError('invalid_voice_speed')
        normalized=spoken_text(text, improved=self.improved)
        for attempt in range(2 if self.improved else 1):
            pcm = self.engine.infer(normalized, voice=self.name,
                temperature=.8, max_chars=256 if self.improved else 130, batch_size=1)
            try: return finish_audio(pcm, self.sample_rate, speed)
            except ValueError as e:
                # One local retry for invalid/silent PCM, never change words or
                # medical quantities to make a failed audio check pass.
                if not self.improved or attempt or str(e) not in {'voice_too_long','voice_unavailable'}: raise

    def close(self):
        self.engine.close()


if __name__ == '__main__': provision()
