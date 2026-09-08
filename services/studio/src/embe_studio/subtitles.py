"""Readable Vietnamese captions made from the saved script, never ASR guesses.

Scene boundaries follow actual audio. Phrase boundaries are estimated inside
each scene, not word-level forced alignment. No separate TTS calls or new voice.
"""
from __future__ import annotations
import math
import re
import unicodedata
from PIL import Image, ImageDraw
from .render import font_at

FONT_SIZE, LINE_HEIGHT = 38, 50
LEFT, RIGHT, BOTTOM = 48, 600, 980  # Reserve 120 px right / 300 px bottom.
TEXT_WIDTH = RIGHT-LEFT-40


def _atoms(text):
    words = re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text)).strip().split(' ')
    atoms=[]
    for word in words:
        # Keep a quantity and its unit together, including commas/decimal points.
        if atoms and re.search(r'\d$', atoms[-1]) and re.fullmatch(r'(?:mg|mcg|µg|μg|g|kg|ml|mL|l|L|mmHg|kcal|°C|%)[,.;:!?]?',word):
            atoms[-1]+=' '+word
        elif atoms and atoms[-1].lower() in ('không','chưa','đừng') and word:
            # Never leave a negation alone at the end of a line/cue.
            atoms[-1]+=' '+word
        elif word: atoms.append(word)
    return atoms


def wrap(text):
    """At most two measured lines; do not split words, numbers or medical units."""
    font=font_at(FONT_SIZE);lines=[]
    for word in _atoms(text):
        if font.getlength(word)>TEXT_WIDTH: raise ValueError('text_does_not_fit')
        if lines and font.getlength(lines[-1]+' '+word)<=TEXT_WIDTH: lines[-1]+=' '+word
        else: lines.append(word)
    return lines


def phrases(text):
    pieces=[];current=[]
    for atom in _atoms(text):
        candidate=' '.join([*current,atom])
        lines=wrap(candidate)
        if current and (len(lines)>2 or len(candidate.split())>12):
            pieces.append(' '.join(current));current=[]
        current.append(atom)
        # Prefer real punctuation as a boundary, but avoid flashing tiny clauses.
        if re.search(r'[.!?;,:]$',atom) and len(' '.join(current))>=36:
            pieces.append(' '.join(current));current=[]
    if current: pieces.append(' '.join(current))
    if not pieces: raise ValueError('invalid_project')
    if len(pieces)>1 and len(pieces[-1].split())<3 and len(wrap(pieces[-2]+' '+pieces[-1]))<=2:
        pieces[-2:]=[pieces[-2]+' '+pieces[-1]]
    # Rebalance orphan endings ("thuốc.", "nhẹ nhàng.") instead of flashing a
    # final one-word cue. Move whole atoms so quantities keep their units.
    for i in range(1,len(pieces)):
        left,right=_atoms(pieces[i-1]),_atoms(pieces[i])
        while len(' '.join(right).split())<5 and len(left)>5:
            candidate=' '.join([left[-1],*right])
            if len(wrap(candidate))>2: break
            right.insert(0,left.pop())
        pieces[i-1],pieces[i]=' '.join(left),' '.join(right)
    return pieces


def _weight(text):
    # Reuse the installed Vietnamese normalizer: 1.000 mg takes longer than two
    # written tokens. Optional for the original Piper-only compiler environment.
    try:
        from vieneu_utils.phonemize_text import normalize_to_chunks_v3
        text=' '.join(normalize_to_chunks_v3(text))
    except ImportError: pass
    return max(1,len(text.split()))


def scene_cues(text, pcm, rate, offset):
    import numpy as np
    pcm=np.asarray(pcm,dtype=np.float32).reshape(-1)
    window=max(1,rate//100)
    envelope=np.max(np.abs(np.pad(pcm,(0,(-len(pcm))%window))).reshape(-1,window),axis=1)
    active=np.flatnonzero(envelope>10**(-54/20))
    if not active.size: raise ValueError('voice_unavailable')
    # Include soft consonants and a short reading tail; never leak into next scene.
    start=max(0,active[0]*window/rate-.06)
    end=min(len(pcm)/rate,(active[-1]+1)*window/rate+.14)
    parts=phrases(text);weights=[_weight(p) for p in parts];total=sum(weights)
    cues=[];used=0
    for part,weight in zip(parts,weights,strict=True):
        a=offset+start+(end-start)*used/total;used+=weight
        b=offset+start+(end-start)*used/total
        cues.append({'start':round(a,3),'end':round(b,3),'text':'\n'.join(wrap(part))})
    return cues


def caption_overlay(text):
    lines=wrap(text)
    if not 1<=len(lines)<=2: raise ValueError('text_does_not_fit')
    height=len(lines)*LINE_HEIGHT+36
    layer=Image.new('RGBA',(RIGHT-LEFT,height),(0,0,0,0));draw=ImageDraw.Draw(layer)
    draw.rounded_rectangle((0,0,layer.width-1,height-1),radius=18,fill=(48,37,43,242))
    for i,line in enumerate(lines):
        draw.text((layer.width//2,18+i*LINE_HEIGHT),line,font=font_at(FONT_SIZE),fill=(255,250,252),anchor='mt')
    return layer,(LEFT,BOTTOM-height)


def validate_cues(cues, duration):
    if not isinstance(cues,list) or not 1<=len(cues)<=80: raise ValueError('invalid_subtitles')
    previous=0
    for cue in cues:
        a,b=cue['start'],cue['end']
        if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in (a,b)) or not previous<=a<b<=duration+.001:
            raise ValueError('invalid_subtitles')
        if not isinstance(cue['text'],str) or not 1<=len(wrap(cue['text']))<=2: raise ValueError('invalid_subtitles')
        previous=b
