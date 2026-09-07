import pytest
from embe_studio.story_voice import spoken_text


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
