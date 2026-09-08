"""Finite original narration preview. No changes to existing voices or projects."""
import argparse
import json
import socket
from unittest.mock import patch
from embe_studio.story_voice import ROOT
from embe_studio.web_worker import render_document, WebWorker

TEXT = 'Chào bạn, mình là giọng đọc của EmBe. Mỗi ngày một điều nhỏ, cùng mẹ chăm sóc bản thân thật nhẹ nhàng.'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--upload', action='store_true')
    args = parser.parse_args()
    directory = ROOT / 'data/studio-voice/maternal-preview'
    directory.mkdir(parents=True, exist_ok=True)
    # Same words as the existing sample; the paragraph boundary requests an
    # intentional pause using the engine's native paragraph segmentation.
    speech = TEXT.replace('EmBe. ', 'EmBe.\n\n')
    doc = dict(title='Thục Đoan · nhịp nhẹ', stage='Mẫu so sánh',
        caption='Mẫu tự viết, không phải nội dung y tế.',
        scenes=[dict(heading='Cùng mẹ, thật nhẹ nhàng', text=TEXT, speechText=speech)],
        sources=[dict(title='VieNeu Turbo', url='https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo')],
        voice=dict(id='thuc-doan-south-v3', speed=.95))
    with patch.object(socket.socket, 'connect', side_effect=AssertionError('unexpected_network')):
        result = render_document(doc, directory, lambda n: print(json.dumps({'progress': n}), flush=True))
    if args.upload:
        worker = WebWorker(ROOT / 'secrets/runtime/portal-sync.env')
        result['asset'] = worker.upload(directory/'video.mp4', 'video/mp4', 'mp4')
    print(json.dumps(result, ensure_ascii=True), flush=True)

if __name__ == '__main__':
    main()
