"""Finite synthetic demo: benchmark both presets offline; publish only with --upload."""
import argparse
import json
from pathlib import Path
import socket
import time
from unittest.mock import patch

from embe_studio.story_voice import ROOT, VOICES
from embe_studio.web_worker import render_document, WebWorker

TEXT = 'Chào bạn, mình là giọng đọc của EmBe. Mỗi ngày một điều nhỏ, cùng mẹ chăm sóc bản thân thật nhẹ nhàng.'


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--upload',action='store_true');args=parser.parse_args()
    root=ROOT/'data/studio-voice/comparison-v1';root.mkdir(exist_ok=True)
    result={}
    for voice in VOICES:
        out=root/voice;out.mkdir(exist_ok=True)
        started=time.monotonic()
        doc=dict(title='Nghe giọng kể chuyện',stage='EmBe',caption='Mẫu giọng AI, không phải dữ liệu sức khỏe.',
            scenes=[dict(heading='Cùng mẹ, thật nhẹ nhàng',text=TEXT)],
            sources=[dict(title='VieNeu Turbo',url='https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo')],
            voice=dict(id=voice,speed=1))
        # Assert synthesis makes no network requests, even during model initialization.
        with patch.object(socket.socket,'connect',side_effect=AssertionError('unexpected_network')):
            rendered=render_document(doc,out,lambda n:print(json.dumps({'voice':voice,'progress':n}),flush=True))
        rendered['elapsed_seconds']=round(time.monotonic()-started,2)
        if args.upload:
            worker=WebWorker(ROOT/'secrets/runtime/portal-sync.env')
            rendered['asset']=worker.upload(out/'video.mp4','video/mp4','mp4')
        result[voice]=rendered
        print(json.dumps({'voice':voice,**rendered},ensure_ascii=True),flush=True)
    (root/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
