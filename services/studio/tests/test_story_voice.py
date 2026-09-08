import pytest
from embe_studio.story_voice import spoken_text


def test_auto_pacing_slows_numbers_without_rewriting_them():
    from embe_studio.story_voice import automatic_speed
    for text in ['DHA và NIPT.', '0,5 mg; 120/80 mmHg', 'Tuần 12']:
        assert automatic_speed(text)==.95
    assert automatic_speed('Cùng mẹ, thật nhẹ nhàng.')==1


def test_invalid_audio_retries_once_with_identical_text():
    from types import SimpleNamespace
    from unittest.mock import Mock
    from embe_studio.story_voice import StoryVoice
    np=pytest.importorskip('numpy')
    voice=object.__new__(StoryVoice);voice.name='Thục Đoan';voice.improved=True
    tone=(.2*np.sin(2*np.pi*440*np.arange(48000)/48000)).astype(np.float32)
    voice.engine=SimpleNamespace(infer=Mock(side_effect=[np.zeros(48000),tone]))
    assert len(voice.speak('EmBe 0,5 mg.'))==48000
    calls=voice.engine.infer.call_args_list
    assert len(calls)==2 and calls[0]==calls[1] and calls[0].args==('Em Bé 0,5 mg.',)
    voice.engine.infer=Mock(return_value=np.zeros(48000))
    with pytest.raises(ValueError,match='voice_unavailable'):voice.speak('Giữ nguyên.')
    assert voice.engine.infer.call_count==2


def test_speech_only_cleanup_never_rewrites_medical_quantities():
    assert spoken_text('EmBe: 0,5 mg; 120/80 mmHg; 37,5°C. DHA và NIPT.') == 'Em Bé: 0,5 mg; 120/80 mmHg; 37,5°C. DHA và NIPT.'
    assert spoken_text('Mỹ Duyên\n  cùng Thục Đoan.') == 'Mỹ Duyên cùng Thục Đoan.'


def test_tempo_keeps_pitch_and_bounds_peaks():
    np=pytest.importorskip('numpy')
    from embe_studio.story_voice import finish_audio
    rate=48000
    pcm=(.4*np.sin(2*np.pi*440*np.arange(rate*3)/rate)).astype(np.float32)
    for speed in (.95,1,1.05):
        audio=finish_audio(pcm,rate,speed)
        assert abs(len(audio)-len(pcm)/speed)<rate*.1
        assert np.isfinite(audio).all() and np.max(np.abs(audio))<=.89001
        spectrum=np.abs(np.fft.rfft(audio)); frequency=np.argmax(spectrum)*rate/len(audio)
        assert abs(frequency-440)<2
        assert audio[0]==audio[-1]==0
    for bad in (np.zeros(rate),np.full(rate,np.nan),np.ones(1),np.ones(rate*31)):
        with pytest.raises(ValueError):finish_audio(bad)
    with pytest.raises(ValueError):finish_audio(pcm,speed=2)


def test_v2_keeps_paragraphs_and_spells_acronyms_without_changing_doses():
    source = 'EmBe: 0,5 mg; 120/80 mmHg; 37,5°C. DHA và NIPT.\n\n  Mẹ cùng AI xem PDF.'
    assert spoken_text(source, improved=True) == 'Em Bé: 0,5 mg; 120/80 mmHg; 37,5°C. đê hát a và en ai pi ti.\n\n Mẹ cùng ây ai xem pi đi ép.'
    assert spoken_text('DHALab và aipdf', improved=True) == 'DHALab và aipdf'


def test_v2_scene_timing_preserves_speech_and_internal_pause():
    np=pytest.importorskip('numpy')
    from embe_studio.voice_timing import paced_scene
    rate=48000
    tone=(.2*np.sin(2*np.pi*440*np.arange(rate//2)/rate)).astype(np.float32)
    middle=np.concatenate([tone,np.zeros(rate//3),tone])
    source=np.concatenate([np.zeros(rate),middle,np.zeros(rate)])
    result,seconds=paced_scene(source)
    assert len(result)==round(seconds*rate) and abs(seconds*24-round(seconds*24))<1e-6
    # Whole words and the intentional internal pause remain bit-identical.
    start=round(.12*rate)
    np.testing.assert_array_equal(result[start:start+len(middle)],middle)
    assert seconds < 2 and np.max(np.abs(result))==np.max(np.abs(source))
    for bad in [np.zeros(rate),np.full(rate,np.nan),np.ones(rate*31)]:
        with pytest.raises(ValueError):paced_scene(bad)


def test_editorial_pronunciation_only_changes_known_initialisms():
    original='BMI; WHO; NHS; FDA. 0,5 mg; 120/80 mmHg; 2–3 lần; DHALab.\n• Mẹ cùng EmBe.'
    spoken=spoken_text(original, improved=True, editorial=True)
    assert spoken=='bi em ai; tổ chức y tế thế giới; en hát ét; ép đi ây. 0,5 mg; 120/80 mmHg; 2–3 lần; DHALab.\nMẹ cùng Em Bé.'
    assert original.startswith('BMI; WHO')
    # Old profiles and arbitrary names remain unchanged.
    assert spoken_text('BMILab WHOever', improved=True, editorial=True)=='BMILab WHOever'


def test_editorial_pause_only_extends_scene_tail():
    np=pytest.importorskip('numpy')
    from embe_studio.voice_timing import paced_scene
    x=(.1*np.sin(2*np.pi*440*np.arange(48000)/48000)).astype(np.float32)
    old,old_time=paced_scene(x)
    new,new_time=paced_scene(x,editorial=True)
    np.testing.assert_array_equal(new[:len(old)],old)
    assert .12 < new_time-old_time < .21


def test_mastering_measures_loudness_and_preserves_pitch_and_timeline():
    np=pytest.importorskip('numpy')
    from embe_studio.voice_mastering import master_narration
    rate=48000
    for volume in [.06,.14,.28]:
        x=(volume*np.sin(2*np.pi*440*np.arange(rate*4)/rate)).astype(np.float32)
        result,stats=master_narration(x)
        assert len(result)==len(x) and np.isfinite(result).all()
        assert abs(stats['afterLufs']-stats['targetLufs'])<1.5 and stats['truePeakDbtp']<=-1.5
        assert stats['targetLufs']-stats['beforeLufs']<=6
        frequency=np.argmax(np.abs(np.fft.rfft(result)))*rate/len(result)
        assert abs(frequency-440)<2
    for bad in [np.zeros(rate),np.full(rate,np.nan),np.ones(rate*91),np.full(rate*4,.00001)]:
        with pytest.raises(ValueError):master_narration(bad)
