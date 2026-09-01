"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { localDateKey } from "../lib/pregnancy";
import {
  estimatedEnergyTarget, PREGNANCY_NUTRIENTS,
  type EnergyProfile, type NutrientKey
} from "../lib/pregnancy-nutrition";

type CarePlan = {
  id: string;
  category: "medicine" | "supplement";
  name: string;
  dose_display: string;
  times_per_day: number;
  instructions: string;
  nutrient_amounts: Partial<Record<NutrientKey, number>>;
  confirmed_by_clinician: boolean;
  active: boolean;
  taken_slots: number[];
};

type IphoneHealth = {
  steps: number | null;
  active_energy_kcal: number | null;
  resting_energy_kcal: number | null;
  sleep_minutes: number | null;
  weight_kg: number | null;
  water_ml: number | null;
  heart_rate_avg: number | null;
  updated_at: string;
};

type Snapshot = {
  profile: null | {
    birth_date: string | null;
    height_cm: number | null;
    pre_pregnancy_weight_kg: number | null;
    activity_level: EnergyProfile["activityLevel"];
    clinician_energy_target_kcal: number | null;
  };
  plans: CarePlan[];
  iphone_health: IphoneHealth | null;
  iphone_devices: { id: string; label: string; active: boolean; last_synced_at: string | null }[];
};

type MealEntry = {
  eatenAt: string;
  analysis: { nutrition?: { totals?: Record<string, number>; calorieRange?: { mid: number } | null } };
};

const EMPTY_SNAPSHOT: Snapshot = { profile: null, plans: [], iphone_health: null, iphone_devices: [] };
const EMPTY_PROFILE: EnergyProfile = {
  birthDate: null, heightCm: null, prePregnancyWeightKg: null,
  activityLevel: null, clinicianEnergyTargetKcal: null
};

function numberValue(value: string): number | null {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function profileFromSnapshot(snapshot: Snapshot): EnergyProfile {
  const profile = snapshot.profile;
  return profile ? {
    birthDate: profile.birth_date,
    heightCm: profile.height_cm,
    prePregnancyWeightKg: profile.pre_pregnancy_weight_kg,
    activityLevel: profile.activity_level,
    clinicianEnergyTargetKcal: profile.clinician_energy_target_kcal
  } : EMPTY_PROFILE;
}

function dailyMealTotals(entries: MealEntry[], day: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of entries) {
    const eatenAt = new Date(entry.eatenAt);
    if (Number.isNaN(eatenAt.getTime()) || localDateKey(eatenAt) !== day) continue;
    for (const [key, value] of Object.entries(entry.analysis.nutrition?.totals ?? {})) {
      if (Number.isFinite(value) && value >= 0) result[key] = (result[key] ?? 0) + value;
    }
  }
  return result;
}

export default function PregnancyCareTracker({ pregnancyWeek }: { pregnancyWeek: number | null }) {
  const [day, setDay] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [showPlan, setShowPlan] = useState(false);
  const [syncSecret, setSyncSecret] = useState<{ token: string; ingestUrl: string } | null>(null);

  async function load(currentDay: string) {
    try {
      const [careResponse, mealsResponse] = await Promise.all([
        fetch(`/api/pregnancy/care?day=${currentDay}`, { cache: "no-store" }),
        fetch("/api/meals?days=7", { cache: "no-store" })
      ]);
      if (!careResponse.ok) throw new Error("care unavailable");
      const care = await careResponse.json() as { snapshot?: Snapshot };
      const mealPayload = mealsResponse.ok ? await mealsResponse.json() as { history?: MealEntry[] } : {};
      setSnapshot(care.snapshot ?? EMPTY_SNAPSHOT);
      setMeals(Array.isArray(mealPayload.history) ? mealPayload.history : []);
      setStatus("idle");
    } catch { setStatus("error"); }
  }

  useEffect(() => {
    const currentDay = localDateKey();
    setDay(currentDay);
    void load(currentDay);
  }, []);

  async function mutate(body: Record<string, unknown>) {
    if (!day) return;
    setStatus("saving");
    try {
      const response = await fetch("/api/pregnancy/care", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, day })
      });
      if (!response.ok) throw new Error("save unavailable");
      const payload = await response.json() as { snapshot?: Snapshot };
      if (!payload.snapshot) throw new Error("malformed snapshot");
      setSnapshot(payload.snapshot);
      setStatus("idle");
    } catch { setStatus("error"); }
  }

  async function addPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nutrientAmounts = Object.fromEntries(PREGNANCY_NUTRIENTS.flatMap((nutrient) => {
      const value = numberValue(String(data.get(nutrient.key) ?? ""));
      return value === null ? [] : [[nutrient.key, value]];
    }));
    await mutate({ action: "plan", plan: {
      id: null, category: data.get("category"), name: data.get("name"),
      doseDisplay: data.get("doseDisplay"), timesPerDay: Number(data.get("timesPerDay")),
      instructions: data.get("instructions") ?? "", nutrientAmounts,
      confirmedByClinician: data.get("confirmedByClinician") === "on", active: true
    } });
    event.currentTarget.reset();
    setShowPlan(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate({ action: "profile", profile: {
      birthDate: data.get("birthDate") || null,
      heightCm: numberValue(String(data.get("heightCm") ?? "")),
      prePregnancyWeightKg: numberValue(String(data.get("prePregnancyWeightKg") ?? "")),
      activityLevel: data.get("activityLevel") || null,
      clinicianEnergyTargetKcal: numberValue(String(data.get("clinicianEnergyTargetKcal") ?? ""))
    } });
  }

  async function createIphoneConnection() {
    setStatus("saving");
    try {
      const response = await fetch("/api/pregnancy/iphone-health", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "iPhone của Mẹ Ngân" })
      });
      if (!response.ok) throw new Error("connection unavailable");
      const value = await response.json() as { token: string; ingestUrl: string };
      setSyncSecret(value);
      await load(day);
    } catch { setStatus("error"); }
  }

  const activePlans = snapshot.plans.filter((plan) => plan.active);
  const doseCount = activePlans.reduce((sum, plan) => sum + plan.times_per_day, 0);
  const takenCount = activePlans.reduce((sum, plan) => sum + plan.taken_slots.length, 0);
  const adherence = doseCount ? Math.round(takenCount * 100 / doseCount) : 0;
  const mealTotals = useMemo(() => dailyMealTotals(meals, day), [meals, day]);
  const nutrientTotals = useMemo(() => {
    const result = { ...mealTotals };
    for (const plan of activePlans) {
      for (const [key, value] of Object.entries(plan.nutrient_amounts)) {
        result[key] = (result[key] ?? 0) + Number(value) * plan.taken_slots.length;
      }
    }
    return result;
  }, [activePlans, mealTotals]);
  const profile = profileFromSnapshot(snapshot);
  const energyTarget = estimatedEnergyTarget(profile, pregnancyWeek);
  const calories = Math.round(mealTotals.calories ?? 0);

  return (
    <section className="care-tracker" id="vi-chat-thuoc" aria-labelledby="care-tracker-title">
      <div className="section-heading-row">
        <div>
          <p className="panel-kicker">Theo đúng điều đã được dặn</p>
          <h2 id="care-tracker-title">Thuốc, vi chất &amp; dinh dưỡng</h2>
        </div>
        <p>EmBe chỉ ghi lại kế hoạch của bác sĩ và lượng từ các bữa đã xác nhận; không tự kê thuốc hay kết luận thiếu chất.</p>
      </div>

      <div className="care-today-grid">
        <article className="adherence-card">
          <div className="adherence-ring" style={{ "--progress": `${adherence * 3.6}deg` } as React.CSSProperties}>
            <strong>{doseCount ? `${adherence}%` : "—"}</strong><span>đã dùng</span>
          </div>
          <div><h3>Hôm nay</h3><p>{doseCount ? `${takenCount}/${doseCount} lần theo kế hoạch` : "Chưa thêm thuốc hoặc vi chất"}</p></div>
        </article>
        <article className="energy-card">
          <span>Ước lượng từ bữa đã ghi</span>
          <strong>{calories ? `${calories} kcal` : "Chưa đủ dữ liệu"}</strong>
          <p>{energyTarget ? `Mốc cá nhân tham khảo khoảng ${energyTarget} kcal/ngày.` : "Thêm hồ sơ cơ bản để có mốc năng lượng cá nhân."}</p>
        </article>
      </div>

      {activePlans.length ? <div className="dose-list">
        {activePlans.map((plan) => <article key={plan.id}>
          <div className="dose-copy">
            <span>{plan.category === "medicine" ? "Thuốc" : "Vi chất"}{plan.confirmed_by_clinician ? " · đã xác nhận với bác sĩ" : " · cần xác nhận"}</span>
            <strong>{plan.name}</strong><small>{plan.dose_display}{plan.instructions ? ` · ${plan.instructions}` : ""}</small>
          </div>
          <div className="dose-slots" aria-label={`Đánh dấu ${plan.name}`}>
            {Array.from({ length: plan.times_per_day }, (_, index) => index + 1).map((slot) => {
              const taken = plan.taken_slots.includes(slot);
              return <button key={slot} type="button" className={taken ? "is-taken" : ""} aria-pressed={taken}
                onClick={() => void mutate({ action: "intake", planId: plan.id, slot, taken: !taken })}>
                {taken ? "✓" : slot}<span className="sr-only">Lần {slot}</span>
              </button>;
            })}
          </div>
        </article>)}
      </div> : <div className="care-empty"><strong>Chưa có kế hoạch dùng hằng ngày</strong><p>Chỉ thêm đúng tên và liều đang dùng hoặc đã được bác sĩ dặn.</p></div>}

      <button className="care-add-button" type="button" onClick={() => setShowPlan((value) => !value)}>
        {showPlan ? "Đóng" : "+ Thêm thuốc hoặc vi chất"}
      </button>
      {showPlan && <form className="care-plan-form" onSubmit={(event) => void addPlan(event)}>
        <div className="care-form-grid">
          <label>Loại<select name="category" defaultValue="supplement"><option value="supplement">Vitamin / khoáng chất</option><option value="medicine">Thuốc bác sĩ dặn</option></select></label>
          <label>Tên<input name="name" required maxLength={80} placeholder="Ví dụ: viên bổ sung đang dùng" /></label>
          <label>Liều ghi trên nhãn/đơn<input name="doseDisplay" required maxLength={80} placeholder="Ví dụ: 1 viên sau ăn" /></label>
          <label>Số lần mỗi ngày<select name="timesPerDay" defaultValue="1">{[1, 2, 3, 4, 5, 6].map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="care-wide">Ghi chú<input name="instructions" maxLength={240} placeholder="Giờ dùng, dùng cùng thức ăn…" /></label>
        </div>
        <label className="clinician-check"><input name="confirmedByClinician" type="checkbox" /> Kế hoạch này đã được bác sĩ/dược sĩ xác nhận</label>
        <details className="nutrient-entry">
          <summary>Nhập lượng vi chất trên nhãn (không bắt buộc) <span>⌄</span></summary>
          <p>Lượng cho mỗi lần dùng. Chép đúng đơn vị; EmBe sẽ cộng với bữa ăn đã xác nhận.</p>
          <div>{PREGNANCY_NUTRIENTS.map((item) => <label key={item.key}>{item.label}<span>{item.unit}</span><input name={item.key} type="number" min="0" max="100000" step="0.1" inputMode="decimal" /></label>)}</div>
        </details>
        <button className="health-save" type="submit">Lưu kế hoạch</button>
      </form>}

      <div className="nutrient-heading"><div><p className="panel-kicker">Thức ăn đã xác nhận + liều đã đánh dấu</p><h3>Mức tham khảo hằng ngày</h3></div><span>NIH · thai kỳ 19–50 tuổi</span></div>
      <div className="nutrient-list">
        {PREGNANCY_NUTRIENTS.map((item) => {
          const value = nutrientTotals[item.key] ?? 0;
          const percent = Math.min(100, Math.round(value * 100 / item.target));
          return <details key={item.key} className="nutrient-row">
            <summary><span><strong>{item.label}</strong><small>{value ? `${Number(value.toFixed(1))} / ${item.target} ${item.unit}` : `Mốc ${item.target} ${item.unit}`}</small></span><i>{value ? `${percent}%` : "chưa ghi"}</i></summary>
            <div className="nutrient-progress"><span style={{ width: `${percent}%` }} /></div>
            <p>Nguồn thực phẩm: {item.foodExamples}. {item.upper ? `Mức tối đa tham khảo: ${item.upper} ${item.unit}. ` : ""}{item.upperNote ?? ""}</p>
          </details>;
        })}
      </div>

      <details className="energy-profile">
        <summary><span><strong>Tính mốc năng lượng cá nhân</strong><small>Dựa trên tuổi, chiều cao, cân nặng trước thai kỳ và mức vận động</small></span><i>⌄</i></summary>
        <form onSubmit={(event) => void saveProfile(event)}>
          <label>Ngày sinh<input name="birthDate" type="date" defaultValue={profile.birthDate ?? ""} /></label>
          <label>Chiều cao (cm)<input name="heightCm" type="number" min="120" max="220" step="0.1" defaultValue={profile.heightCm ?? ""} /></label>
          <label>Cân nặng trước thai kỳ (kg)<input name="prePregnancyWeightKg" type="number" min="25" max="300" step="0.1" defaultValue={profile.prePregnancyWeightKg ?? ""} /></label>
          <label>Mức vận động<select name="activityLevel" defaultValue={profile.activityLevel ?? ""}><option value="">Chọn mức gần nhất</option><option value="sedentary">Ít vận động</option><option value="low_active">Vận động nhẹ</option><option value="active">Khá năng động</option><option value="very_active">Rất năng động</option></select></label>
          <label className="care-wide">Mốc kcal bác sĩ/dinh dưỡng viên dặn (nếu có)<input name="clinicianEnergyTargetKcal" type="number" min="1000" max="5000" defaultValue={profile.clinicianEnergyTargetKcal ?? ""} /></label>
          <button className="health-save" type="submit">Lưu &amp; tính lại</button>
        </form>
        <p className="formula-note">Mốc tự tính dùng phương trình DRI 2023 theo hồ sơ và cộng khoảng 340 kcal ở ba tháng giữa, 450 kcal ở ba tháng cuối. Đây là điểm bắt đầu để theo dõi, không phải chỉ định giảm/tăng cân; mốc chuyên môn đã nhập luôn được ưu tiên.</p>
      </details>

      <details className="iphone-health-card" open={snapshot.iphone_devices.length === 0}>
        <summary><span><strong>Sức khỏe từ iPhone</strong><small>{snapshot.iphone_health ? "Đã nhận dữ liệu hôm nay" : "Cần cấp quyền một lần trên iPhone"}</small></span><i>⌄</i></summary>
        {snapshot.iphone_health && <div className="iphone-metrics">
          <span><strong>{snapshot.iphone_health.steps ?? "—"}</strong>bước</span>
          <span><strong>{snapshot.iphone_health.sleep_minutes ? `${(snapshot.iphone_health.sleep_minutes / 60).toFixed(1)}h` : "—"}</strong>ngủ</span>
          <span><strong>{snapshot.iphone_health.active_energy_kcal ?? "—"}</strong>kcal vận động</span>
          <span><strong>{snapshot.iphone_health.weight_kg ?? "—"}</strong>kg</span>
        </div>}
        <p>Safari không được Apple cho đọc HealthKit trực tiếp. Cầu nối chỉ nhận tổng số Mẹ Ngân chọn (bước chân, ngủ, năng lượng, cân nặng, nước, nhịp tim trung bình), không lấy vị trí hay dữ liệu thô.</p>
        {!syncSecret && <button className="care-add-button" type="button" onClick={() => void createIphoneConnection()}>Tạo kết nối iPhone riêng tư</button>}
        {syncSecret && <div className="sync-secret" role="status"><strong>Khóa kết nối đã tạo</strong><p>Khóa chỉ hiện lần này. EmBe sẽ dùng nó trong Phím tắt iPhone; không gửi cho người khác.</p><code>{syncSecret.token}</code><small>Điểm nhận: {syncSecret.ingestUrl}</small></div>}
        <p className="formula-note">iOS bắt buộc chính Mẹ Ngân chấp thuận quyền HealthKit trên điện thoại. Không website nào có thể bỏ qua bước bảo mật này.</p>
      </details>

      <p className={`care-status is-${status}`} aria-live="polite">{status === "saving" ? "Đang lưu riêng tư…" : status === "error" ? "Chưa đồng bộ được; hãy thử lại khi có mạng." : "Dữ liệu sức khỏe được giữ riêng cho gia đình."}</p>
    </section>
  );
}
