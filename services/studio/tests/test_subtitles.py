import pytest
from embe_studio.subtitles import phrases,wrap,caption_overlay,validate_cues,LEFT,RIGHT,BOTTOM,TEXT_WIDTH,FONT_SIZE
from embe_studio.render import font_at


def test_vietnamese_captions_preserve_every_word_and_keep_units_together():
    text='Đọc nhãn: 0,5 mg, 400 µg và 1.000 mg. Đây là ví dụ cách đọc, không phải hướng dẫn dùng thuốc.'
    chunks=phrases(text)
    assert ' '.join(chunks)==text
    assert len(chunks)>1
    lines=[line for chunk in chunks for line in wrap(chunk)]
    for quantity in ('0,5 mg,','400 µg','1.000 mg.'):
        assert any(quantity in line for line in lines)
    assert all(len(wrap(chunk))<=2 for chunk in chunks)
    assert any('không phải' in line for line in lines)
    assert len(chunks[-1].split())>=4
    assert all(font_at(FONT_SIZE).getlength(line)<=TEXT_WIDTH for line in lines)
    with pytest.raises(ValueError,match='text_does_not_fit'):phrases('a'*180)


def test_negative_phrases_are_not_split_between_lines_or_cues():
    text='Ví dụ nhãn ghi 0,5 mg hoặc 400 µg. Đây chỉ là mẫu kiểm tra chữ và số, không phải hướng dẫn dùng thuốc.'
    chunks=phrases(text)
    assert ' '.join(chunks)==text
    assert any('không phải' in line for chunk in chunks for line in wrap(chunk))
    for term in ('Không nên','Chưa được','Đừng tự'):
        assert any(term in line for chunk in phrases(f'{term} thay đổi chỉ định đã có, hãy trao đổi với bác sĩ.') for line in wrap(chunk))


def test_overlay_is_inside_reserved_social_safe_area():
    overlay,(x,y)=caption_overlay('Mỗi ngày một điều nhỏ,\ncùng mẹ thật nhẹ nhàng.')
    assert x==LEFT and x+overlay.width==RIGHT<=600
    assert y>=800 and y+overlay.height==BOTTOM<=980
    assert overlay.mode=='RGBA'
    overlay.close()


def test_phrase_timing_uses_actual_audio_but_is_not_word_alignment():
    np=pytest.importorskip('numpy')
    from embe_studio.subtitles import scene_cues
    rate=48000
    tone=(.1*np.sin(2*np.pi*440*np.arange(rate*6)/rate)).astype(np.float32)
    audio=np.concatenate([np.zeros(rate//2),tone,np.zeros(rate//2)])
    text='Chào bạn, mình là giọng đọc của EmBe. Mỗi ngày một điều nhỏ, cùng mẹ chăm sóc bản thân thật nhẹ nhàng.'
    cues=scene_cues(text,audio,rate,10)
    validate_cues(cues,17)
    assert 10.4<=cues[0]['start']<10.6 and 16.5<cues[-1]['end']<=16.7
    assert ' '.join(c['text'].replace('\n',' ') for c in cues)==text
    assert all(c['end']-c['start']>.5 for c in cues)
    for bad in [[{'start':float('nan'),'end':3,'text':'Mẹ'}],[{'start':2,'end':1,'text':'Mẹ'}],[]]:
        with pytest.raises(ValueError):validate_cues(bad,17)
