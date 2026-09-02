"use client";

import { useEffect, useState, type FormEvent } from "react";

import { cachedPrivateGet, clearPrivateGetCache } from "../lib/private-get-cache";

const STAGE_CHANGE_EVENT = "embe:pregnancy-stage-change";
const FAMILY_STAGE_EVENT = "embe:family-stage-change";
const BIRTH_DATE_KEY = "embe:family:birth-occurred-at";

type BirthRecord = {
  birthOccurredAt: string | null;
  birthMethod: string | null;
  babySex: "male" | "female" | null;
  gestationalWeeks: number | null;
  gestationalDays: number | null;
  birthWeightG: number | null;
  birthLengthCm: number | null;
  birthHeadCm: number | null;
  birthFacility: string | null;
  birthClinician: string | null;
  premature: boolean;
  lowBirthWeight: boolean;
  specialMonitoring: boolean;
  specialMonitoringNotes: string | null;
  dischargedAt: string | null;
  dischargeNotes: string | null;
  hasBirthRecord: boolean;
};

const EMPTY_RECORD: BirthRecord = {
  birthOccurredAt: null,
  birthMethod: null,
  babySex: null,
  gestationalWeeks: null,
  gestationalDays: null,
  birthWeightG: null,
  birthLengthCm: null,
  birthHeadCm: null,
  birthFacility: null,
  birthClinician: null,
  premature: false,
  lowBirthWeight: false,
  specialMonitoring: false,
  specialMonitoringNotes: null,
  dischargedAt: null,
  dischargeNotes: null,
  hasBirthRecord: false
};

function localInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function optionalNumber(form: FormData, name: string): number | null {
  const value = String(form.get(name) ?? "").trim();
  return value ? Number(value) : null;
}

export default function BirthTransition() {
  const [record, setRecord] = useState<BirthRecord>(EMPTY_RECORD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void cachedPrivateGet("/api/family/lifecycle")
      .then(async (response) => response.ok ? response.json() as Promise<BirthRecord> : null)
      .then((value) => {
        if (!active || !value) return;
        setRecord(value);
        setOpen(value.hasBirthRecord);
        if (value.birthOccurredAt) localStorage.setItem(BIRTH_DATE_KEY, value.birthOccurredAt);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const birthLocal = String(form.get("birthOccurredAt") ?? "");
    const dischargeLocal = String(form.get("dischargedAt") ?? "");
    if (!birthLocal) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/family/lifecycle", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          birthOccurredAt: new Date(birthLocal).toISOString(),
          birthMethod: String(form.get("birthMethod") ?? ""),
          babySex: String(form.get("babySex") ?? ""),
          gestationalWeeks: optionalNumber(form, "gestationalWeeks"),
          gestationalDays: optionalNumber(form, "gestationalDays"),
          birthWeightG: optionalNumber(form, "birthWeightG"),
          birthLengthCm: optionalNumber(form, "birthLengthCm"),
          birthHeadCm: optionalNumber(form, "birthHeadCm"),
          birthFacility: String(form.get("birthFacility") ?? "") || null,
          birthClinician: String(form.get("birthClinician") ?? "") || null,
          premature: form.get("premature") === "on",
          lowBirthWeight: form.get("lowBirthWeight") === "on",
          specialMonitoring: form.get("specialMonitoring") === "on",
          specialMonitoringNotes: String(form.get("specialMonitoringNotes") ?? "") || null,
          dischargedAt: dischargeLocal ? new Date(dischargeLocal).toISOString() : null,
          dischargeNotes: String(form.get("dischargeNotes") ?? "") || null
        })
      });
      if (!response.ok) throw new Error("save failed");
      const saved = await response.json() as BirthRecord;
      clearPrivateGetCache("/api/family/lifecycle");
      setRecord(saved);
      if (saved.birthOccurredAt) localStorage.setItem(BIRTH_DATE_KEY, saved.birthOccurredAt);
      window.dispatchEvent(new Event(STAGE_CHANGE_EVENT));
      window.dispatchEvent(new Event(FAMILY_STAGE_EVENT));
      setMessage("Đã lưu. EmBe sẽ chuyển sang chế độ sau sinh theo ngày này.");
    } catch {
      setMessage("Chưa lưu được. Dữ liệu trên biểu mẫu vẫn còn để thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="birth-transition" id="embe-chao-doi">
      <button className="birth-transition-summary" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>
          <strong>{record.hasBirthRecord ? "Thông tin lúc em bé chào đời" : "Em bé đã chào đời?"}</strong>
          <small>{record.hasBirthRecord ? "Chạm để xem hoặc cập nhật" : "Lưu một lần để EmBe tự chuyển sang sau sinh"}</small>
        </span>
        <i aria-hidden="true">⌄</i>
      </button>
      {open ? <form className="birth-form" onSubmit={save}>
        <fieldset disabled={loading || saving}>
          <legend>Thông tin sinh</legend>
          <label>Ngày và giờ sinh<input name="birthOccurredAt" type="datetime-local" required defaultValue={localInputValue(record.birthOccurredAt)} /></label>
          <label>Hình thức sinh
            <select name="birthMethod" required defaultValue={record.birthMethod ?? ""}>
              <option value="" disabled>Chọn hình thức</option>
              <option value="vaginal">Sinh thường</option>
              <option value="planned_c_section">Sinh mổ chủ động</option>
              <option value="emergency_c_section">Sinh mổ cấp cứu</option>
              <option value="assisted">Sinh có hỗ trợ</option>
              <option value="other">Khác</option>
            </select>
          </label>
          <label htmlFor="baby-sex">Giới tính của Bé</label>
          <select id="baby-sex" name="babySex" required defaultValue={record.babySex ?? ""}>
            <option value="" disabled>Chọn theo hồ sơ sinh</option>
            <option value="female">Bé gái</option>
            <option value="male">Bé trai</option>
          </select>
          <small>Dùng để chọn đúng bảng tăng trưởng WHO sau sinh.</small>
          <div className="birth-form-row">
            <label>Tuần thai<input name="gestationalWeeks" type="number" inputMode="numeric" min="20" max="45" defaultValue={record.gestationalWeeks ?? ""} /></label>
            <label>Ngày lẻ<input name="gestationalDays" type="number" inputMode="numeric" min="0" max="6" defaultValue={record.gestationalDays ?? ""} /></label>
          </div>
          <div className="birth-form-row">
            <label>Cân nặng (g)<input name="birthWeightG" type="number" inputMode="numeric" min="300" max="7000" defaultValue={record.birthWeightG ?? ""} /></label>
            <label>Chiều dài (cm)<input name="birthLengthCm" type="number" inputMode="decimal" min="20" max="70" step="0.1" defaultValue={record.birthLengthCm ?? ""} /></label>
          </div>
          <label>Vòng đầu (cm)<input name="birthHeadCm" type="number" inputMode="decimal" min="20" max="50" step="0.1" defaultValue={record.birthHeadCm ?? ""} /></label>
          <label>Nơi sinh<input name="birthFacility" maxLength={160} defaultValue={record.birthFacility ?? ""} /></label>
          <label>Bác sĩ hoặc người đỡ sinh<input name="birthClinician" maxLength={160} defaultValue={record.birthClinician ?? ""} /></label>
          <div className="birth-flags">
            <label><input name="premature" type="checkbox" defaultChecked={record.premature} /> Sinh non</label>
            <label><input name="lowBirthWeight" type="checkbox" defaultChecked={record.lowBirthWeight} /> Cân nặng sơ sinh thấp</label>
            <label><input name="specialMonitoring" type="checkbox" defaultChecked={record.specialMonitoring} /> Cần theo dõi đặc biệt</label>
          </div>
          <label>Ghi chú theo dõi<textarea name="specialMonitoringNotes" rows={3} maxLength={1000} defaultValue={record.specialMonitoringNotes ?? ""} /></label>
        </fieldset>
        <details className="discharge-fields">
          <summary>Thông tin xuất viện <span aria-hidden="true">⌄</span></summary>
          <fieldset disabled={loading || saving}>
            <label>Ngày và giờ xuất viện<input name="dischargedAt" type="datetime-local" defaultValue={localInputValue(record.dischargedAt)} /></label>
            <label>Dặn dò khi xuất viện<textarea name="dischargeNotes" rows={4} maxLength={2000} defaultValue={record.dischargeNotes ?? ""} /></label>
          </fieldset>
        </details>
        <button className="primary-action" type="submit" disabled={loading || saving}>{saving ? "Đang lưu…" : "Lưu thông tin sinh"}</button>
        {message ? <p className="form-message" role="status">{message}</p> : null}
        {record.hasBirthRecord ? <nav className="birth-next-actions" aria-label="Bắt đầu chăm sóc sau sinh">
          <a href="/me">Ghi hồi phục của Mẹ</a>
          <a href="/be?quick=feeding">Bắt đầu cữ bú đầu tiên</a>
        </nav> : null}
        <p className="form-boundary">Chỉ chép lại thông tin trong hồ sơ bệnh viện; EmBe không tự đánh giá tình trạng của Mẹ hoặc Bé.</p>
      </form> : null}
    </section>
  );
}
