"use client";
import { useEffect, useRef, useState } from "react";
import AppHeader from "../../../components/app-header";

const durations = [2, 4, 8];
export default function PregnancyRelaxationPage() {
  const [minutes, setMinutes] = useState(4), [remaining, setRemaining] = useState(240), [running, setRunning] = useState(false), [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null), previousPhase = useRef("");
  const elapsed = minutes * 60 - remaining, inhale = elapsed % 10 < 4, phase = inhale ? "Hít vào thật nhẹ" : "Thở ra chậm rãi";
  useEffect(() => { if (!running) return; const id = window.setInterval(() => setRemaining((value) => { if (value <= 1) { setRunning(false); return 0; } return value - 1; }), 1000); return () => window.clearInterval(id); }, [running]);
  useEffect(() => {
    if (!running || !sound || previousPhase.current === phase || !audio.current) { previousPhase.current = phase; return; }
    previousPhase.current = phase; const context = audio.current, oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = inhale ? 440 : 330; gain.gain.setValueAtTime(.025, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .45); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .45);
  }, [phase, running, sound, inhale]);
  function choose(value: number) { if (running) return; setMinutes(value); setRemaining(value * 60); }
  function start() { if (remaining === 0) setRemaining(minutes * 60); if (sound && !audio.current && "AudioContext" in window) audio.current = new AudioContext(); void audio.current?.resume(); previousPhase.current = ""; setRunning(true); }
  function reset() { setRunning(false); setRemaining(minutes * 60); previousPhase.current = ""; }
  return <main className="pregnancy-main relaxation-page"><AppHeader note="Một góc yên cho Mẹ" tone="calm" />
    <header className="pregnancy-hero compact-page-hero"><div><p className="eyebrow">Không điểm số · không áp lực</p><h1>Một khoảng thở nhẹ</h1><p className="intro">Ngồi hoặc nằm ở tư thế Mẹ thấy dễ chịu, rồi thở chậm theo vòng tròn.</p></div></header>
    <div className="relax-duration" aria-label="Chọn thời lượng">{durations.map((value) => <button aria-pressed={minutes === value} disabled={running} key={value} onClick={() => choose(value)} type="button">{value} phút</button>)}</div>
    <section className={`breathing-card${running ? inhale ? " is-inhale" : " is-exhale" : ""}`} aria-live="polite"><div className="breathing-orb" aria-hidden="true" /><strong>{running ? phase : remaining === 0 ? "Đã xong rồi" : "Sẵn sàng khi Mẹ muốn"}</strong><time>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</time>
      <div>{running ? <button type="button" onClick={() => setRunning(false)}>Tạm dừng</button> : <button type="button" onClick={start}>Bắt đầu</button>}<button type="button" onClick={reset}>Làm lại</button></div>
    </section>
    <label className="relax-sound"><input checked={sound} onChange={(event) => setSound(event.target.checked)} type="checkbox" /><span><strong>Âm báo nhẹ</strong><small>Chỉ đánh dấu lúc đổi nhịp, không dùng “tần số chữa lành”.</small></span></label>
    <aside className="medical-boundary"><strong>Thở thoải mái, không cố.</strong><p>Hãy dừng lại nếu thấy chóng mặt, hụt hơi hoặc khó chịu. Công cụ này giúp thư giãn, không thay thế chăm sóc sức khỏe.</p></aside>
  </main>;
}
