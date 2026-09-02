"use client";

import { useEffect, useState, type FormEvent } from "react";

type ContactKind = "doctor" | "midwife" | "clinic" | "hospital" | "emergency" | "support";
type Contact = { id: string; kind: ContactKind; name: string; organization: string; phone: string; note: string; primary: boolean };
type Profile = {
  dueDate: string | null;
  dueDateSource: "estimated_lmp" | "ultrasound" | "clinician" | null;
  lmpDate: string | null;
  gestationType: "singleton" | "twins" | "multiples" | null;
  bloodGroup: "A" | "B" | "AB" | "O" | null;
  rhFactor: "positive" | "negative" | null;
  allergies: string;
  medicalNotes: string;
  contacts: Contact[];
};

const EMPTY: Profile = {
  dueDate: null, dueDateSource: null, lmpDate: null, gestationType: null,
  bloodGroup: null, rhFactor: null, allergies: "", medicalNotes: "", contacts: []
};

const CONTACT_LABELS: Record<ContactKind, string> = {
  doctor: "Bác sĩ sản", midwife: "Nữ hộ sinh", clinic: "Cơ sở khám",
  hospital: "Bệnh viện", emergency: "Liên hệ khẩn", support: "Người hỗ trợ"
};

function formText(data: FormData, key: string): string {
  return String(data.get(key) ?? "").trim();
}
export default function PregnancyProfileEditor() {
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [addingContact, setAddingContact] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/pregnancy/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return await response.json() as { profile: Profile };
      })
      .then(({ profile: value }) => { if (active) { setProfile(value); setStatus("idle"); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, []);

  async function mutate(body: Record<string, unknown>): Promise<void> {
    setStatus("saving");
    try {
      const response = await fetch("/api/pregnancy/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { profile: Profile };
      setProfile(payload.profile);
      setStatus("saved");
    } catch { setStatus("error"); }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate({
      action: "profile",
      profile: {
        dueDate: formText(data, "dueDate") || null,
        dueDateSource: formText(data, "dueDateSource") || null,
        lmpDate: formText(data, "lmpDate") || null,
        gestationType: formText(data, "gestationType") || null,
        bloodGroup: formText(data, "bloodGroup") || null,
        rhFactor: formText(data, "rhFactor") || null,
        allergies: formText(data, "allergies"),
        medicalNotes: formText(data, "medicalNotes")
      }
    });
  }

  function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate({
      action: "contact",
      contact: {
        id: null, kind: formText(data, "kind"), name: formText(data, "name"),
        organization: formText(data, "organization"), phone: formText(data, "phone"),
        note: formText(data, "note"), primary: data.get("primary") === "on"
      }
    }).then(() => setAddingContact(false));
  }

  return (
    <div className="pregnancy-profile-editor" aria-busy={status === "loading" || status === "saving"}>
      <form className="pregnancy-profile-form" onSubmit={saveProfile}>
        <section aria-labelledby="pregnancy-profile-facts">
          <div className="section-head">
            <p className="panel-kicker">Dùng chung cho lịch và hồ sơ khám</p>
            <h2 id="pregnancy-profile-facts">Thông tin thai kỳ</h2>
          </div>
          <div className="pregnancy-profile-grid">
            <label><span>Ngày dự sinh</span><input name="dueDate" type="date" defaultValue={profile.dueDate ?? ""} key={`due-${profile.dueDate}`} /></label>
            <label><span>Nguồn ngày dự sinh</span><select name="dueDateSource" defaultValue={profile.dueDateSource ?? ""} key={`source-${profile.dueDateSource}`}><option value="">Chưa chọn</option><option value="estimated_lmp">Tính từ kỳ kinh cuối</option><option value="ultrasound">Siêu âm</option><option value="clinician">Bác sĩ xác nhận</option></select></label>
            <label><span>Ngày đầu kỳ kinh cuối</span><input name="lmpDate" type="date" defaultValue={profile.lmpDate ?? ""} key={`lmp-${profile.lmpDate}`} /></label>
            <label><span>Thai đơn hay đa thai</span><select name="gestationType" defaultValue={profile.gestationType ?? ""} key={`gestation-${profile.gestationType}`}><option value="">Chưa biết</option><option value="singleton">Thai đơn</option><option value="twins">Thai đôi</option><option value="multiples">Đa thai</option></select></label>
            <label><span>Nhóm máu</span><select name="bloodGroup" defaultValue={profile.bloodGroup ?? ""} key={`blood-${profile.bloodGroup}`}><option value="">Chưa biết</option><option>A</option><option>B</option><option>AB</option><option>O</option></select></label>
            <label><span>Rh</span><select name="rhFactor" defaultValue={profile.rhFactor ?? ""} key={`rh-${profile.rhFactor}`}><option value="">Chưa biết</option><option value="positive">Dương (+)</option><option value="negative">Âm (−)</option></select></label>
          </div>
          <label><span>Dị ứng cần nhắc</span><textarea name="allergies" rows={2} maxLength={500} defaultValue={profile.allergies} key={`allergies-${profile.allergies}`} placeholder="Chỉ ghi điều đã biết" /></label>
          <label><span>Tiền sử hoặc điều bác sĩ cần biết</span><textarea name="medicalNotes" rows={3} maxLength={1000} defaultValue={profile.medicalNotes} key={`notes-${profile.medicalNotes}`} /></label>
          <button className="btn btn-primary btn-block" type="submit" disabled={status === "loading" || status === "saving"}>Lưu hồ sơ</button>
        </section>
      </form>

      <section className="pregnancy-care-team" aria-labelledby="care-team-title">
        <div className="section-heading-row">
          <div><p className="panel-kicker">Gọi nhanh khi cần</p><h2 id="care-team-title">Bác sĩ &amp; nơi khám</h2></div>
          <button className="btn btn-quiet" type="button" onClick={() => setAddingContact((value) => !value)}>{addingContact ? "Đóng" : "+ Thêm"}</button>
        </div>
        {profile.contacts.length ? <ul>
          {profile.contacts.map((contact) => <li key={contact.id}>
            <span><small>{CONTACT_LABELS[contact.kind]}{contact.primary ? " · Chính" : ""}</small><strong>{contact.name}</strong>{contact.organization ? <em>{contact.organization}</em> : null}</span>
            <a href={`tel:${contact.phone}`} aria-label={`Gọi ${contact.name}`}>Gọi</a>
          </li>)}
        </ul> : status !== "loading" ? <p className="today-priority-empty">Chưa có bác sĩ hoặc liên hệ khẩn.</p> : null}

        {addingContact ? <form className="pregnancy-contact-form" onSubmit={saveContact}>
          <label><span>Vai trò</span><select name="kind" defaultValue="doctor">{Object.entries(CONTACT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Tên</span><input name="name" required maxLength={80} autoComplete="name" /></label>
          <label><span>Cơ sở</span><input name="organization" maxLength={120} /></label>
          <label><span>Số điện thoại</span><input name="phone" required inputMode="tel" autoComplete="tel" pattern="\+?[0-9][0-9 ()-]{5,24}" /></label>
          <label><span>Ghi chú</span><textarea name="note" rows={2} maxLength={300} /></label>
          <label className="check-line"><input name="primary" type="checkbox" /> <span>Liên hệ chính</span></label>
          <button className="btn btn-primary btn-block" type="submit" disabled={status === "saving"}>Lưu liên hệ</button>
        </form> : null}
      </section>

      <p className={`state-note${status === "error" ? " is-wait" : ""}`} role="status">
        {status === "loading" ? "Đang mở hồ sơ…" : status === "saving" ? "Đang lưu…" : status === "saved" ? "Đã lưu" : status === "error" ? "Chưa lưu được. Thử lại." : "Chỉ Ngân và Hiếu xem được."}
      </p>
    </div>
  );
}
