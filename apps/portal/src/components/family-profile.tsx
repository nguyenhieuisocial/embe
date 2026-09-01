"use client";

import { useEffect, useState, type FormEvent } from "react";

import { EMPTY_FAMILY_PROFILE, parentBirthSummary, type FamilyProfile as Profile } from "../lib/family-profile";
import { dateKey } from "../lib/calendar";

export default function FamilyProfile() {
  const [profile, setProfile] = useState<Profile>(EMPTY_FAMILY_PROFILE);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/family/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return await response.json() as Profile;
      })
      .then((value) => { if (active) { setProfile(value); setStatus("idle"); } })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus("saving");
    try {
      const response = await fetch("/api/family/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          motherBirthDate: data.get("motherBirthDate") || null,
          fatherBirthDate: data.get("fatherBirthDate") || null
        })
      });
      if (!response.ok) throw new Error("unavailable");
      setProfile(await response.json() as Profile);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="section family-profile" aria-labelledby="family-profile-title">
      <div className="section-head">
        <p className="panel-kicker">Hồ sơ gia đình</p>
        <h2 id="family-profile-title">Ngày sinh của Ba &amp; Mẹ</h2>
      </div>
      <form onSubmit={(event) => void save(event)}>
        <label>
          <span><strong>Mẹ Ngân</strong><small>Trần Ngọc Quỳnh Ngân</small></span>
          <input name="motherBirthDate" type="date" min="1940-01-01" max={dateKey(new Date())} defaultValue={profile.motherBirthDate ?? ""} key={`mother-${profile.motherBirthDate}`} disabled={status === "loading"} />
        </label>
        {profile.motherBirthDate ? <p className="family-birth-summary">{parentBirthSummary(profile.motherBirthDate)}</p> : null}
        <label>
          <span><strong>Ba Hiếu</strong><small>Nguyễn Xuân Hiếu</small></span>
          <input name="fatherBirthDate" type="date" min="1940-01-01" max={dateKey(new Date())} defaultValue={profile.fatherBirthDate ?? ""} key={`father-${profile.fatherBirthDate}`} disabled={status === "loading"} />
        </label>
        {profile.fatherBirthDate ? <p className="family-birth-summary">{parentBirthSummary(profile.fatherBirthDate)}</p> : null}
        <button className="btn btn-primary btn-block" type="submit" disabled={status === "loading" || status === "saving"}>
          {status === "saving" ? "Đang lưu…" : "Lưu ngày sinh"}
        </button>
        <p className={`state-note${status === "error" ? " is-wait" : ""}`} role="status">
          {status === "saved" ? "Đã lưu và nối với lịch gia đình." : status === "error" ? "Chưa thể tải hoặc lưu. Hãy thử lại." : "Dùng để tính tuổi, lịch âm, sinh nhật và mốc sức khỏe phù hợp."}
        </p>
      </form>
    </section>
  );
}
