"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import AppHeader from "../../components/app-header";
import { localDateKey } from "../../lib/pregnancy";

type Recovery = Record<string, number | string | boolean | null> & { day: string };

function numberOrNull(form: FormData, name: string): number | null {
  const value = String(form.get(name) ?? "").trim();
  return value ? Number(value) : null;
}

function stringOrNull(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? "").trim();
  return value || null;
}

export default function MotherPostpartumPage() {
  const [today, setToday] = useState("");
  const [current, setCurrent] = useState<Recovery | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setToday(localDateKey());
  }, []);

  useEffect(() => {
    if (!today) return;
    let active = true;
    void fetch(`/api/postpartum/health?end=${today}&days=42`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ history: Recovery[] }> : null)
      .then((result) => {
        if (!active || !result) return;
        setCurrent(result.history.find((item) => item.day === today) ?? null);
      });
    return () => { active = false; };
  }, [today]);

  const moodScore = useMemo(() => {
    const first = typeof current?.phq2Interest === "number" ? current.phq2Interest : 0;
    const second = typeof current?.phq2Depressed === "number" ? current.phq2Depressed : 0;
    return first + second;
  }, [current]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      day: today,
      lochia: stringOrNull(form, "lochia"),
      pain: numberOrNull(form, "pain"),
      temperatureC: numberOrNull(form, "temperatureC"),
      systolic: numberOrNull(form, "systolic"),
      diastolic: numberOrNull(form, "diastolic"),
      woundStatus: stringOrNull(form, "woundStatus"),
      urination: stringOrNull(form, "urination"),
      digestion: stringOrNull(form, "digestion"),
      pelvicPain: numberOrNull(form, "pelvicPain"),
      breastDiscomfort: numberOrNull(form, "breastDiscomfort"),
      feedingDifficulty: form.get("feedingDifficulty") === "on",
      sleepMinutes: numberOrNull(form, "sleepMinutes"),
      exhaustion: numberOrNull(form, "exhaustion"),
      support: numberOrNull(form, "support"),
      mood: numberOrNull(form, "mood"),
      phq2Interest: numberOrNull(form, "phq2Interest"),
      phq2Depressed: numberOrNull(form, "phq2Depressed"),
      notes: stringOrNull(form, "notes")
    };
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/postpartum/health", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("save failed");
      const result = await response.json() as { health: Recovery };
      setCurrent(result.health);
      setMessage("Đã lưu nhật ký hồi phục hôm nay.");
    } catch {
      setMessage("Chưa lưu được. Nội dung trên màn hình vẫn còn để thử lại.");
    } finally { setSaving(false); }
  }

  return (
    <main className="postpartum-main">
      <AppHeader note="Không gian riêng của Mẹ Ngân" tone="calm" />
      <header className="postpartum-hero">
        <p className="eyebrow">Hồi phục sau sinh · từng ngày</p>
        <h1>Mẹ hôm nay</h1>
        <p>Ghi điều quan trọng trong vài phút để lần tái khám có thông tin rõ ràng hơn.</p>
      </header>

      <aside className="postpartum-urgent">
        <strong>Cảm thấy có điều không ổn?</strong>
        <p>Không chờ EmBe: gọi nơi đã sinh hoặc cấp cứu. Khi đi khám, nói rõ Mẹ mới sinh trong vòng một năm.</p>
        <a href="#dau-hieu-can-goi">Xem dấu hiệu cần gọi ngay</a>
      </aside>

      <form className="postpartum-form" key={current?.day ?? "empty"} onSubmit={save}>
        <section>
          <div className="section-heading-row"><div><p className="panel-kicker">{today || "Hôm nay"}</p><h2>Hồi phục cơ thể</h2></div></div>
          <div className="compact-form-grid">
            <label>Sản dịch<select name="lochia" defaultValue={String(current?.lochia ?? "")}><option value="">Chưa ghi</option><option value="none">Không còn</option><option value="light">Ít</option><option value="moderate">Vừa</option><option value="heavy">Nhiều</option></select></label>
            <label>Mức đau (0–10)<input name="pain" type="number" inputMode="numeric" min="0" max="10" defaultValue={String(current?.pain ?? "")} /></label>
            <label>Nhiệt độ (°C)<input name="temperatureC" type="number" inputMode="decimal" min="34" max="43" step="0.1" defaultValue={String(current?.temperatureC ?? "")} /></label>
            <label>Tình trạng vết mổ/tầng sinh môn<select name="woundStatus" defaultValue={String(current?.woundStatus ?? "")}><option value="">Chưa ghi</option><option value="not_applicable">Không áp dụng</option><option value="comfortable">Ổn</option><option value="tender">Đau/nhạy cảm</option><option value="red_swollen">Đỏ hoặc sưng</option><option value="drainage">Có dịch</option></select></label>
          </div>
        </section>

        <details className="postpartum-detail">
          <summary>Cơ thể chi tiết <span>⌄</span></summary>
          <div className="compact-form-grid">
            <label>Huyết áp tâm thu<input name="systolic" type="number" inputMode="numeric" min="60" max="250" defaultValue={String(current?.systolic ?? "")} /></label>
            <label>Huyết áp tâm trương<input name="diastolic" type="number" inputMode="numeric" min="30" max="160" defaultValue={String(current?.diastolic ?? "")} /></label>
            <label>Tiểu tiện<select name="urination" defaultValue={String(current?.urination ?? "")}><option value="">Chưa ghi</option><option value="comfortable">Bình thường</option><option value="discomfort">Khó chịu</option><option value="difficulty">Khó tiểu</option></select></label>
            <label>Tiêu hóa<select name="digestion" defaultValue={String(current?.digestion ?? "")}><option value="">Chưa ghi</option><option value="usual">Bình thường</option><option value="constipated">Táo bón</option><option value="diarrhea">Tiêu chảy</option><option value="other">Khác</option></select></label>
            <label>Đau vùng chậu (0–10)<input name="pelvicPain" type="number" inputMode="numeric" min="0" max="10" defaultValue={String(current?.pelvicPain ?? "")} /></label>
          </div>
        </details>

        <details className="postpartum-detail" open>
          <summary>Cho bé ăn & nghỉ ngơi <span>⌄</span></summary>
          <div className="compact-form-grid">
            <label>Căng/đau ngực hoặc núm vú (0–10)<input name="breastDiscomfort" type="number" inputMode="numeric" min="0" max="10" defaultValue={String(current?.breastDiscomfort ?? "")} /></label>
            <label>Ngủ được bao nhiêu phút<input name="sleepMinutes" type="number" inputMode="numeric" min="0" max="1440" step="15" defaultValue={String(current?.sleepMinutes ?? "")} /></label>
            <label>Mức kiệt sức (1–5)<input name="exhaustion" type="number" inputMode="numeric" min="1" max="5" defaultValue={String(current?.exhaustion ?? "")} /></label>
            <label>Mức hỗ trợ từ gia đình (1–5)<input name="support" type="number" inputMode="numeric" min="1" max="5" defaultValue={String(current?.support ?? "")} /></label>
          </div>
          <label className="postpartum-check"><input name="feedingDifficulty" type="checkbox" defaultChecked={current?.feedingDifficulty === true} /> Đang gặp khó khăn khi cho bé ăn</label>
        </details>

        <details className="postpartum-detail">
          <summary>Tâm trạng & sàng lọc ngắn <span>⌄</span></summary>
          <div className="compact-form-grid">
            <label>Tâm trạng hôm nay (1–5)<input name="mood" type="number" inputMode="numeric" min="1" max="5" defaultValue={String(current?.mood ?? "")} /></label>
            <label>Ít hứng thú hoặc không còn vui<select name="phq2Interest" defaultValue={String(current?.phq2Interest ?? "")}><option value="">Chưa trả lời</option><option value="0">Không lần nào</option><option value="1">Vài ngày</option><option value="2">Hơn nửa số ngày</option><option value="3">Gần như mỗi ngày</option></select></label>
            <label>Cảm thấy buồn, chán hoặc tuyệt vọng<select name="phq2Depressed" defaultValue={String(current?.phq2Depressed ?? "")}><option value="">Chưa trả lời</option><option value="0">Không lần nào</option><option value="1">Vài ngày</option><option value="2">Hơn nửa số ngày</option><option value="3">Gần như mỗi ngày</option></select></label>
          </div>
          <p className="screening-note">Hai câu hỏi PHQ-2 chỉ là bước sàng lọc, không phải chẩn đoán.{moodScore >= 3 ? " Kết quả cho thấy nên trao đổi sớm với bác sĩ hoặc chuyên gia tâm lý." : ""}</p>
        </details>

        <label className="postpartum-notes">Điều muốn nhớ hoặc hỏi bác sĩ<textarea name="notes" rows={4} maxLength={1000} defaultValue={String(current?.notes ?? "")} /></label>
        <button className="primary-action" type="submit" disabled={!today || saving}>{saving ? "Đang lưu…" : "Lưu sức khỏe hôm nay"}</button>
        {message ? <p role="status" className="form-message">{message}</p> : null}
      </form>

      <section className="postpartum-care-links">
        <h2>Việc chăm sóc tiếp theo</h2>
        <a href="/me-bau#ho-so-kham">Lịch tái khám, đơn thuốc và tài liệu</a>
        <a href="/ke-hoach">Kế hoạch hỗ trợ của Ba Hiếu</a>
      </section>

      <section className="urgent-care" id="dau-hieu-can-goi">
        <p className="panel-kicker">Trong thai kỳ và đến một năm sau sinh</p>
        <h2>Dấu hiệu cần trợ giúp ngay</h2>
        <ul>
          <li>Khó thở, đau ngực, tim đập rất nhanh, ngất hoặc co giật.</li>
          <li>Đau đầu dữ dội không giảm, nhìn mờ hoặc chóng mặt kéo dài.</li>
          <li>Chảy máu nhiều, cục máu lớn, dịch có mùi hôi hoặc sốt.</li>
          <li>Một chân hoặc tay sưng, đỏ, nóng hay đau rõ rệt.</li>
          <li>Có ý nghĩ làm hại bản thân hoặc em bé, hoặc cảm thấy mất kiểm soát.</li>
        </ul>
        <p>Nếu không liên lạc được nơi đang theo dõi, đến cơ sở cấp cứu gần nhất.</p>
      </section>

      <details className="source-section">
        <summary><h2>Nguồn đã đối chiếu</h2><span>⌄</span></summary>
        <ul>
          <li><a href="https://www.who.int/publications/i/item/9789240045989" target="_blank" rel="noreferrer">WHO · Chăm sóc Mẹ và Bé sau sinh</a></li>
          <li><a href="https://www.acog.org/giving/programs/quality-and-safety/resources" target="_blank" rel="noreferrer">ACOG · Dấu hiệu cảnh báo khẩn cấp</a></li>
          <li><a href="https://www.acog.org/programs/perinatal-mental-health/patient-screening" target="_blank" rel="noreferrer">ACOG · Sàng lọc sức khỏe tâm thần chu sinh</a></li>
        </ul>
      </details>
    </main>
  );
}
