# SPDX-License-Identifier: GPL-3.0-or-later
"""Private portal render queue. No social publishing, shell, remote assets or health data."""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import socket
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, build_opener, HTTPRedirectHandler
import wave

ROOT = Path(__file__).resolve().parents[4]
MAX_BYTES = 4_000_000

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None

class ClaimLost(Exception):
    pass

def validate_document(value):
    if not isinstance(value, dict) or set(value) != {'title','stage','caption','scenes','sources'}:
        raise ValueError('invalid_project')
    def text(v, n, required=False):
        if not isinstance(v,str) or len(v)>n or (required and not v.strip()):
            raise ValueError('invalid_project')
    text(value['title'],120,True); text(value['stage'],80); text(value['caption'],1500)
    if not isinstance(value['scenes'],list) or not 1<=len(value['scenes'])<=6:
        raise ValueError('invalid_project')
    for s in value['scenes']:
        if not isinstance(s,dict): raise ValueError('invalid_project')
        text(s.get('heading'),80,True);text(s.get('text'),180,True)
    if sum(len(s['text']) for s in value['scenes'])>900:
        raise ValueError('invalid_project')
    if not isinstance(value['sources'],list) or not 1<=len(value['sources'])<=6:
        raise ValueError('invalid_project')
    for source in value['sources']:
        if not isinstance(source,dict): raise ValueError('invalid_project')
        text(source.get('title'),100,True);text(source.get('url'),700,True)
        if not source['url'].startswith('https://'):raise ValueError('invalid_project')
    return value

def render_document(document, directory: Path, progress):
    # Optional voice dependencies stay in the existing isolated studio-voice environment.
    import numpy as np
    import onnxruntime as ort
    from piper import PiperVoice, SynthesisConfig
    from piper.config import PiperConfig
    from PIL import Image, ImageDraw, ImageOps
    from .narrated import MODEL_SHA256,CONFIG_SHA256,RATE,VOICE_CREDIT,checksum,text_block,render_video,frame_image
    from .render import font_at
    doc=validate_document(document)
    model=ROOT/'data/studio-voice/models/vi_VN-vais1000-medium.onnx'
    config=Path(str(model)+'.json')
    if checksum(model)!=MODEL_SHA256 or checksum(config)!=CONFIG_SHA256:raise ValueError('worker_unavailable')
    opts=ort.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
    voice=PiperVoice(session=ort.InferenceSession(str(model),sess_options=opts,providers=['CPUExecutionProvider']),config=PiperConfig.from_dict(json.loads(config.read_text(encoding='utf-8'))))
    visuals=[];sounds=[];durations=[];beats=[];elapsed=0
    try:
        for i,scene in enumerate(doc['scenes']):
            progress(5+int(i/len(doc['scenes'])*35))
            sound_io=io.BytesIO()
            with wave.open(sound_io,'wb') as wav:voice.synthesize_wav(scene['text'],wav,syn_config=SynthesisConfig(length_scale=1.03,volume=.85))
            sound_io.seek(0)
            with wave.open(sound_io,'rb') as wav:
                if wav.getframerate()!=RATE or wav.getnchannels()!=1 or wav.getsampwidth()!=2:raise ValueError('worker_unavailable')
                if not RATE<=wav.getnframes()<=25*RATE:raise ValueError('voice_too_long')
                pcm=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)/32768
            if np.max(np.abs(pcm))<.01:raise ValueError('worker_unavailable')
            duration=math.ceil(len(pcm)/RATE+.45)
            if elapsed+duration>90:raise ValueError('voice_too_long')
            padded=np.zeros(duration*RATE,dtype=np.float32);start=round(RATE*.15);padded[start:start+len(pcm)]=pcm
            sounds.append(padded);durations.append(duration)
            background=Image.new('RGB',(720,1280),(255,248,246));draw=ImageDraw.Draw(background)
            draw.rounded_rectangle((48,65,300,115),radius=25,fill=(249,224,231))
            draw.text((65,76),'EmBe Mẹ Bầu',font=font_at(28),fill=(96,52,68))
            draw.text((645,83),f'{i+1}/{len(doc["scenes"])}',font=font_at(24),fill=(183,101,127),anchor='rt')
            try:
                text_block(draw,doc['title'],150,size=36,bottom=270)
                text_block(draw,doc['stage'],305,size=26,width=305,bottom=408)
                y=text_block(draw,scene['heading'],452,size=44,bottom=610)
                draw.line((60,y+30,190,y+30),fill=(183,101,127),width=5)
                text_block(draw,scene['text'],y+75,size=36,bottom=990)
            except ValueError as e:
                background.close();raise ValueError('text_does_not_fit') from e
            draw.text((60,1050),'Nguồn đối chiếu trong kịch bản kèm theo',font=font_at(24),fill=(121,102,109))
            draw.text((60,1095),'Minh họa & giọng đọc AI',font=font_at(24),fill=(121,102,109))
            draw.text((60,1140),'Tham khảo · Chưa duyệt chuyên môn',font=font_at(23),fill=(121,102,109))
            draw.text((60,1178),'Không thay tư vấn y tế cá nhân',font=font_at(23),fill=(121,102,109))
            with Image.open(ROOT/'services/studio/assets/me-bau-doc-nhan.png') as original:
                photo=ImageOps.contain(original.convert('RGB'),(240,140))
            visuals.append((background,photo))
            if i==0:
                poster=frame_image(background,photo,1,duration*24,0)
                poster.save(directory/'poster.png',optimize=True);poster.close()
            beats.append({'heading':scene['heading'],'text':scene['text'],'start':elapsed,'end':elapsed+duration});elapsed+=duration
        progress(45)
        result=render_video(directory/'video.mp4',visuals,durations,np.concatenate(sounds),on_progress=progress)
        return {'duration':elapsed,'beats':beats,'voiceCredit':VOICE_CREDIT,'verification':result}
    finally:
        for background,photo in visuals:background.close();photo.close()

class WebWorker:
    def __init__(self, env: Path):
        values={}
        for line in env.read_text(encoding='utf-8-sig').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key,value=line.split('=',1);values[key.strip()]=value.strip().strip('"').strip("'")
        self.base=values.get('SUPABASE_URL','').rstrip('/')
        self.secret=values.get('SUPABASE_SECRET_KEY','')
        if self.base!='https://tpqqzowhndbkmkckpbgv.supabase.co' or len(self.secret)<30:raise ValueError('invalid_config')
        self.opener=build_opener(NoRedirect())

    def request(self,path,body=None,mime='application/json'):
        req=Request(self.base+path,data=body,headers={'apikey':self.secret,'authorization':'Bearer '+self.secret,'content-type':mime,'x-upsert':'false'},method='POST' if body is not None else 'GET')
        with self.opener.open(req,timeout=30) as res:
            data=res.read(MAX_BYTES+1)
            if len(data)>MAX_BYTES:raise ValueError('storage_unavailable')
            return data

    def rpc(self,action,job=None,output=None):
        try:
            body=json.dumps({'p_action':action,'p_id':job['id'] if job else None,'p_claim':job['claim'] if job else None,'p_output':output}).encode()
            return json.loads(self.request('/rest/v1/rpc/embe_studio_worker',body))
        except HTTPError as e:
            if e.code==409:raise ClaimLost() from None
            raise RuntimeError('worker_unavailable') from None

    def upload(self,file: Path,mime,ext):
        data=file.read_bytes()
        if not 0<len(data)<=MAX_BYTES:raise ValueError('render_budget_exceeded')
        digest=hashlib.sha256(data).hexdigest();path=f'editorial/{digest}.{ext}'
        try:self.request('/storage/v1/object/embe-studio-drafts/'+path,data,mime)
        except HTTPError as e:
            if e.code not in {400,409}:raise ValueError('storage_unavailable') from None
        check=self.request('/storage/v1/object/authenticated/embe-studio-drafts/'+path)
        if hashlib.sha256(check).hexdigest()!=digest:raise ValueError('storage_unavailable')
        return {'path':path,'mime':mime,'size':len(data),'checksum':digest}

    def run_once(self):
        job=self.rpc('claim')
        if not job:return {'status':'idle'}
        work=ROOT/'data/studio-web-work';work.mkdir(parents=True,exist_ok=True)
        try:
            if shutil.disk_usage(work).free<512*1024*1024:raise ValueError('worker_unavailable')
            # Generated directory exclusively owned by this run; never delete user media.
            with tempfile.TemporaryDirectory(prefix='render-',dir=work) as temp:
                output=render_document(job['snapshot'],Path(temp),lambda n:self.rpc('progress',job,{'progress':n}))
                self.rpc('progress',job,{'progress':95})
                output['video']=self.upload(Path(temp)/'video.mp4','video/mp4','mp4')
                output['poster']=self.upload(Path(temp)/'poster.png','image/png','png')
                self.rpc('finish',job,output)
            return {'status':'completed'}
        except ClaimLost:return {'status':'cancelled'}
        except Exception as e:
            code=str(e) if str(e) in {'text_does_not_fit','voice_too_long','render_budget_exceeded','storage_unavailable','invalid_project'} else 'worker_unavailable'
            try:self.rpc('fail',job,{'error':code})
            except ClaimLost:pass
            return {'status':'failed','error':code}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--env',type=Path,required=True);parser.add_argument('--watch',action='store_true');args=parser.parse_args()
    lock=socket.socket()
    if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):lock.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
    try:lock.bind(('127.0.0.1',28644))
    except OSError:return
    worker=WebWorker(args.env)
    while True:
        try:result=worker.run_once()
        except Exception:result={'status':'unavailable'}
        if not args.watch:print(json.dumps(result));return
        # No busy loop, no restarted apps, no stdout with script text or credentials.
        time.sleep(30 if result['status']!='completed' else 1)

if __name__=='__main__':main()
