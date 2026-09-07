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
