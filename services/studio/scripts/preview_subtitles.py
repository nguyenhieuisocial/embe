"""Finite original preview; no health data, cloud jobs or social publishing."""
import json
from pathlib import Path
import socket
from unittest.mock import patch
import av
from embe_studio.web_worker import ROOT,render_document

DOCUMENT={
    'title':'Một điều nhỏ, cùng EmBe','stage':'Nghe và xem phụ đề','caption':'',
    'voice':{'id':'auto-south','speed':1},'autoRender':True,
    'scenes':[
        {'heading':'Cùng mẹ, thật nhẹ nhàng',
         'text':'Chào bạn, mình là giọng đọc của EmBe. Mỗi ngày một điều nhỏ, cùng mẹ chăm sóc bản thân thật nhẹ nhàng.'},
        {'heading':'Giữ đúng chữ và số',
         'text':'Ví dụ nhãn ghi 0,5 mg hoặc 400 µg. Đây chỉ là mẫu kiểm tra chữ và số, không phải hướng dẫn dùng thuốc.'}],
    'sources':[{'title':'VieNeu — công nghệ giọng đọc','url':'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo'}],
}

if __name__=='__main__':
    target=ROOT/'data/studio-subtitles-preview';target.mkdir(exist_ok=True)
    with patch.object(socket.socket,'connect',side_effect=AssertionError('unexpected_network')):
        output=render_document(DOCUMENT,target,lambda n:print(json.dumps({'progress':n}),flush=True))
    (target/'result.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    with av.open(str(target/'video.mp4')) as video:
        wanted={round((cue['start']+cue['end'])/2*24) for cue in output['captions']['cues']}
        for i,frame in enumerate(video.decode(video=0)):
            if i in wanted:frame.to_image().save(target/f'frame-{i}.png')
    print(json.dumps({'duration':output['duration'],'cues':output['captions']['cues'],
                      'verification':output['verification']},ensure_ascii=True))
