"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { localDateKey } from "../lib/pregnancy";
import { cachedPrivateGet, clearPrivateGetCache } from "../lib/private-get-cache";
import { announceLinkedDailyAction } from "../lib/linked-daily-actions";
import {
  estimatedEnergyTarget, PREGNANCY_NUTRIENTS,
  type EnergyProfile, type NutrientKey
} from "../lib/pregnancy-nutrition";
import { supplementTimingConflicts } from "../lib/supplement-spacing";

type CarePlan = {
  id: string;
  category: "medicine" | "supplement";
  name: string;
  dose_display: string;
  times_per_day: number;
  reminder_times: string[];
  instructions: string;
  nutrient_amounts: Partial<Record<NutrientKey, number>>;
  confirmed_by_clinician: boolean;
  active: boolean;
  taken_slots: number[];
  dose_states?: DoseState[];
};

type DoseState = { slot: number; status: "taken" | "skipped" | "deferred"; reason: string; recorded_at: string };
type AdherenceHistory = DoseState & { plan_id: string; plan_name: string; day: string };

type IphoneHealth = {
  day?: string;
  steps: number | null;
  active_energy_kcal: number | null;
  resting_energy_kcal: number | null;
  sleep_minutes: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  distance_m: number | null;
  water_ml: number | null;
  heart_rate_avg: number | null;
  resting_heart_rate_bpm: number | null;
  respiratory_rate: number | null;
  oxygen_saturation_percent: number | null;
  body_temperature_c: number | null;
  wrist_temperature_c: number | null;
  hrv_ms: number | null;
  exercise_minutes: number | null;
  mindfulness_minutes: number | null;
  systolic: number | null;
  diastolic: number | null;
  metric_synced_at?: Record<string, string>;
  updated_at: string;
};

type IphoneHealthHistoryDays = 7 | 30;

type Snapshot = {
  profile: null | {
    birth_date: string | null;
    height_cm: number | null;
    pre_pregnancy_weight_kg: number | null;
    activity_level: EnergyProfile["activityLevel"];
    clinician_energy_target_kcal: number | null;
    clinician_weight_gain_min_kg: number | null;
    clinician_weight_gain_max_kg: number | null;
  };
  plans: CarePlan[];
  iphone_health: IphoneHealth | null;
  iphone_health_history: IphoneHealth[];
  iphone_devices: { id: string; label: string; active: boolean; last_synced_at: string | null }[];
  adherence_history?: AdherenceHistory[];
};

type MealEntry = {
  eatenAt: string;
  analysis: { nutrition?: { totals?: Record<string, number>; calorieRange?: { mid: number } | null } };
};

const EMPTY_SNAPSHOT: Snapshot = { profile: null, plans: [], iphone_health: null, iphone_health_history: [], iphone_devices: [] };
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

function metricSyncLabel(health: IphoneHealth, key: string): string {
  const value = health.metric_synced_at?.[key];
  return value ? `Đồng bộ ${new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
    : "Chưa đồng bộ riêng";
}

export default function PregnancyCareTracker({ pregnancyWeek }: { pregnancyWeek: number | null }) {
  const [day, setDay] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [showPlan, setShowPlan] = useState(false);
  const [planTimesPerDay, setPlanTimesPerDay] = useState(1);
  const [syncSecret, setSyncSecret] = useState<{ token: string; ingestUrl: string } | null>(null);
  const [copied, setCopied] = useState<"token" | "url" | null>(null);
  const [iphoneHistoryDays, setIphoneHistoryDays] = useState<IphoneHealthHistoryDays>(7);
  const [iphoneHistoryOpen, setIphoneHistoryOpen] = useState(false);
  const [iphoneRefreshStatus, setIphoneRefreshStatus] = useState<"idle" | "checking" | "updated" | "error">("idle");
  const lastIphoneRefreshRef = useRef(0);

  async function load(currentDay: string) {
    try {
      const [careResponse, mealsResponse] = await Promise.all([
        cachedPrivateGet(`/api/pregnancy/care?day=${currentDay}&days=0`),
        cachedPrivateGet("/api/meals?days=7")
      ]);
      if (!careResponse.ok) throw new Error("care unavailable");
      const care = await careResponse.json() as { snapshot?: Snapshot };
      const mealPayload = mealsResponse.ok ? await mealsResponse.json() as { history?: MealEntry[] } : {};
      setSnapshot(care.snapshot ?? EMPTY_SNAPSHOT);
      setMeals(Array.isArray(mealPayload.history) ? mealPayload.history : []);
      lastIphoneRefreshRef.current = Date.now();
      setStatus("idle");
    } catch { setStatus("error"); }
  }

  useEffect(() => {
    const currentDay = localDateKey();
    setDay(currentDay);
    void load(currentDay);
  }, []);

  async function refreshIphoneHealth(historyDays: 0 | IphoneHealthHistoryDays = 0, silent = false) {
    if (!day) return;
    if (!silent) setIphoneRefreshStatus("checking");
    try {
      const response = await fetch(`/api/pregnancy/care?day=${day}&days=${historyDays}`, { cache: "no-store" });
      if (!response.ok) throw new Error("health unavailable");
      const payload = await response.json() as { snapshot?: Snapshot };
      if (!payload.snapshot) throw new Error("malformed snapshot");
      const nextSnapshot = payload.snapshot;
      setSnapshot((current) => ({
        ...nextSnapshot,
        iphone_health_history: historyDays
          ? nextSnapshot.iphone_health_history ?? []
          : current.iphone_health_history
      }));
      lastIphoneRefreshRef.current = Date.now();
      setIphoneRefreshStatus("updated");
    } catch {
      if (!silent) setIphoneRefreshStatus("error");
    }
  }

  useEffect(() => {
    if (!day || !snapshot.iphone_devices.some((device) => device.active)) return;
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastIphoneRefreshRef.current < 15_000) return;
      void refreshIphoneHealth(0, true);
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
    };
  }, [day, snapshot.iphone_devices]);

  async function showIphoneHistory(days: IphoneHealthHistoryDays) {
    setIphoneHistoryDays(days);
    setIphoneHistoryOpen(true);
    await refreshIphoneHealth(days);
  }

  async function mutate(body: Record<string, unknown>) {
    if (!day) return;
    setStatus("saving");
    try {
      const response = await fetch("/api/pregnancy/care", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, day })
      });
      if (!response.ok) throw new Error("save unavailable");
      const payload = await response.json() as { snapshot?: Snapshot; checklistCompletion?: unknown };
      if (!payload.snapshot) throw new Error("malformed snapshot");
      announceLinkedDailyAction(payload.checklistCompletion);
      clearPrivateGetCache("/api/pregnancy/care?");
      const nextSnapshot = payload.snapshot;
      setSnapshot((current) => ({
        ...nextSnapshot,
        iphone_health_history: nextSnapshot.iphone_health_history ?? current.iphone_health_history
      }));
      setStatus("idle");
    } catch { setStatus("error"); }
  }

  async function addPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const nutrientAmounts = Object.fromEntries(PREGNANCY_NUTRIENTS.flatMap((nutrient) => {
      const value = numberValue(String(data.get(nutrient.key) ?? ""));
      return value === null ? [] : [[nutrient.key, value]];
    }));
    const reminderTimes = Array.from({ length: planTimesPerDay }, (_, index) =>
      String(data.get(`reminderTime${index + 1}`) ?? "")
    ).sort();
    await mutate({ action: "plan", plan: {
      id: null, category: data.get("category"), name: data.get("name"),
      doseDisplay: data.get("doseDisplay"), timesPerDay: planTimesPerDay, reminderTimes,
      instructions: data.get("instructions") ?? "", nutrientAmounts,
      confirmedByClinician: data.get("confirmedByClinician") === "on", active: true
    } });
    form.reset();
    setPlanTimesPerDay(1);
    setShowPlan(false);
  }

  async function saveDose(event: FormEvent<HTMLFormElement>, planId: string, slot: number) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const doseStatus = data.get("doseStatus");
    await mutate({ action: "intake", planId, slot, status: doseStatus,
      reason: doseStatus === "taken" ? "" : data.get("reason") ?? "" });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await mutate({ action: "profile", profile: {
      birthDate: data.get("birthDate") || null,
      heightCm: numberValue(String(data.get("heightCm") ?? "")),
      prePregnancyWeightKg: numberValue(String(data.get("prePregnancyWeightKg") ?? "")),
      activityLevel: data.get("activityLevel") || null,
      clinicianEnergyTargetKcal: numberValue(String(data.get("clinicianEnergyTargetKcal") ?? "")),
      clinicianWeightGainMinKg: numberValue(String(data.get("clinicianWeightGainMinKg") ?? "")),
      clinicianWeightGainMaxKg: numberValue(String(data.get("clinicianWeightGainMaxKg") ?? ""))
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
      clearPrivateGetCache("/api/pregnancy/care?");
      await load(day);
    } catch { setStatus("error"); }
  }

  async function copySetupValue(kind: "token" | "url", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch { setStatus("error"); }
  }

  const activePlans = snapshot.plans.filter((plan) => plan.active);
  const timingConflicts = supplementTimingConflicts(activePlans);
  const pausedPlans = snapshot.plans.filter((plan) => !plan.active);
  const confirmedPlans = activePlans.filter((plan) => plan.confirmed_by_clinician);
  const doseCount = confirmedPlans.reduce((sum, plan) => sum + plan.times_per_day, 0);
  const takenCount = confirmedPlans.reduce((sum, plan) => sum + (plan.dose_states ?? []).filter((dose) => dose.status === "taken").length, 0);
  const skippedCount = confirmedPlans.reduce((sum, plan) => sum + (plan.dose_states ?? []).filter((dose) => dose.status === "skipped").length, 0);
  const deferredCount = confirmedPlans.reduce((sum, plan) => sum + (plan.dose_states ?? []).filter((dose) => dose.status === "deferred").length, 0);
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
  const activeIphoneDevices = snapshot.iphone_devices.filter((device) => device.active);
  const lastIphoneSync = activeIphoneDevices
    .map((device) => device.last_synced_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const iphoneHistory = snapshot.iphone_health_history ?? [];
  const latestIphoneHealth = iphoneHistory.at(-1) ?? snapshot.iphone_health;
  const iphoneConnectionLabel = latestIphoneHealth?.day === day
    ? "Đã nhận dữ liệu hôm nay"
    : latestIphoneHealth?.day
      ? `Dữ liệu gần nhất ngày ${new Date(`${latestIphoneHealth.day}T00:00:00+07:00`).toLocaleDateString("vi-VN")}`
      : latestIphoneHealth
        ? "Đã nhận dữ liệu gần nhất"
        : lastIphoneSync
          ? `Chưa có dữ liệu hôm nay · lần cuối ${new Date(lastIphoneSync).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}`
          : activeIphoneDevices.length
            ? "Đã tạo điểm nhận, iPhone chưa gửi dữ liệu"
            : "Chưa kết nối Apple Health";

  return (<>
    <section className="iphone-health-hub" id="suc-khoe-iphone" aria-labelledby="iphone-health-title">
      <header className="iphone-health-hub-heading">
        <div>
          <h2 id="iphone-health-title">Sức khỏe từ iPhone</h2>
          <p className={latestIphoneHealth ? "is-connected" : ""}><span aria-hidden="true" />{iphoneConnectionLabel}</p>
        </div>
        <button type="button" disabled={iphoneRefreshStatus === "checking"} onClick={() => void refreshIphoneHealth(0)}>
          {iphoneRefreshStatus === "checking" ? "Đang kiểm tra…" : "Làm mới"}
        </button>
      </header>

      {latestIphoneHealth ? <>
        <div className="iphone-health-glance" aria-label="Chỉ số gần nhất từ iPhone">
          <span><small>Ngủ</small><strong>{latestIphoneHealth.sleep_minutes ? `${(latestIphoneHealth.sleep_minutes / 60).toFixed(1)}h` : "—"}</strong></span>
          <span><small>Bước chân</small><strong>{latestIphoneHealth.steps?.toLocaleString("vi-VN") ?? "—"}</strong></span>
          <span><small>Cân nặng</small><strong>{latestIphoneHealth.weight_kg ? `${latestIphoneHealth.weight_kg} kg` : "—"}</strong></span>
          <span><small>Chiều cao</small><strong>{latestIphoneHealth.height_cm ? `${latestIphoneHealth.height_cm} cm` : "—"}</strong></span>
        </div>
        <div className="iphone-health-actions">
          <a href="shortcuts://">Mở Phím tắt</a>
          <button type="button" onClick={() => void refreshIphoneHealth(0)}>Kiểm tra dữ liệu mới</button>
        </div>
        <details className="iphone-health-more" onToggle={(event) => {
          const open = event.currentTarget.open;
          setIphoneHistoryOpen(open);
          if (open && !iphoneHistory.length) void showIphoneHistory(7);
        }}>
          <summary>Xem đầy đủ và lịch sử <span>⌄</span></summary>
          {iphoneHistoryOpen ? <>
            <div className="iphone-metrics iphone-metrics-complete">
              <span><strong>{latestIphoneHealth.resting_heart_rate_bpm ?? "—"}</strong>nhịp tim nghỉ<small>{metricSyncLabel(latestIphoneHealth, "restingHeartRateBpm")}</small></span>
              <span><strong>{latestIphoneHealth.distance_m ? `${(latestIphoneHealth.distance_m / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km` : "—"}</strong>quãng đường<small>{metricSyncLabel(latestIphoneHealth, "distanceM")}</small></span>
              <span><strong>{latestIphoneHealth.active_energy_kcal ?? "—"}</strong>kcal vận động<small>{metricSyncLabel(latestIphoneHealth, "activeEnergyKcal")}</small></span>
              <span><strong>{latestIphoneHealth.resting_energy_kcal ?? "—"}</strong>kcal nghỉ<small>{metricSyncLabel(latestIphoneHealth, "restingEnergyKcal")}</small></span>
              <span><strong>{latestIphoneHealth.systolic && latestIphoneHealth.diastolic ? `${latestIphoneHealth.systolic}/${latestIphoneHealth.diastolic}` : "—"}</strong>huyết áp<small>{metricSyncLabel(latestIphoneHealth, "systolic")}</small></span>
              <span><strong>{latestIphoneHealth.respiratory_rate ?? "—"}</strong>nhịp thở<small>{metricSyncLabel(latestIphoneHealth, "respiratoryRate")}</small></span>
              <span><strong>{latestIphoneHealth.oxygen_saturation_percent ? `${latestIphoneHealth.oxygen_saturation_percent}%` : "—"}</strong>SpO₂<small>{metricSyncLabel(latestIphoneHealth, "oxygenSaturationPercent")}</small></span>
              <span><strong>{latestIphoneHealth.body_temperature_c ?? latestIphoneHealth.wrist_temperature_c ?? "—"}</strong>°C<small>{metricSyncLabel(latestIphoneHealth, latestIphoneHealth.body_temperature_c ? "bodyTemperatureC" : "wristTemperatureC")}</small></span>
              <span><strong>{latestIphoneHealth.hrv_ms ?? "—"}</strong>HRV ms<small>{metricSyncLabel(latestIphoneHealth, "hrvMs")}</small></span>
              <span><strong>{latestIphoneHealth.exercise_minutes ?? "—"}</strong>phút tập<small>{metricSyncLabel(latestIphoneHealth, "exerciseMinutes")}</small></span>
              <span><strong>{latestIphoneHealth.mindfulness_minutes ?? "—"}</strong>phút thư giãn<small>{metricSyncLabel(latestIphoneHealth, "mindfulnessMinutes")}</small></span>
              <span><strong>{latestIphoneHealth.water_ml ?? "—"}</strong>ml nước<small>{metricSyncLabel(latestIphoneHealth, "waterMl")}</small></span>
            </div>
            <p className="iphone-metric-sync">Cập nhật gần nhất {new Date(latestIphoneHealth.updated_at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}</p>
            <div className="iphone-health-history">
              <div className="iphone-health-history-heading">
                <h3>Lịch sử</h3>
                <span role="group" aria-label="Khoảng lịch sử sức khỏe">
                  <button type="button" aria-pressed={iphoneHistoryDays === 7} onClick={() => void showIphoneHistory(7)}>7 ngày</button>
                  <button type="button" aria-pressed={iphoneHistoryDays === 30} onClick={() => void showIphoneHistory(30)}>30 ngày</button>
                </span>
              </div>
              {iphoneRefreshStatus === "checking" && !iphoneHistory.length ? <p>Đang lấy lịch sử…</p> : null}
              <div>{iphoneHistory.slice(-iphoneHistoryDays).reverse().map((item) => <article key={item.day}>
                <time>{item.day ? new Date(`${item.day}T00:00:00+07:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : "—"}</time>
                <span>{item.steps?.toLocaleString("vi-VN") ?? "—"} bước</span>
                <span>{item.sleep_minutes ? `${(item.sleep_minutes / 60).toFixed(1)}h ngủ` : "—"}</span>
                <span>{item.weight_kg ? `${item.weight_kg} kg` : "—"}</span>
              </article>)}</div>
            </div>
          </> : null}
        </details>
      </> : <div className="iphone-health-empty">
        <strong>{activeIphoneDevices.length ? "Còn một bước trên iPhone" : "Kết nối một lần"}</strong>
        <p>{activeIphoneDevices.length
          ? "Mở Phím tắt, chạy EmBe rồi quay lại. Trang sẽ tự kiểm tra dữ liệu mới."
          : "Apple không cho Safari tự đọc Sức khỏe. Có thể nhập nhanh ngay hoặc kết nối Phím tắt để gửi những chỉ số đã chọn."}</p>
        <div className="iphone-health-actions">
          <a href="#suc-khoe">Nhập nhanh hôm nay</a>
          {activeIphoneDevices.length ? <a href="shortcuts://">Mở Phím tắt</a> : null}
          {!syncSecret ? <button type="button" onClick={() => void createIphoneConnection()}>
            {activeIphoneDevices.length ? "Tạo kết nối mới" : "Kết nối iPhone"}
          </button> : null}
        </div>
      </div>}

      {syncSecret ? <div className="sync-secret" role="status">
        <strong>Kết nối đã sẵn sàng</strong>
        <ol className="iphone-setup-steps">
          <li><span>1</span><div><strong>Cài mẫu Phím tắt</strong><small>Mở liên kết và chọn Thêm phím tắt.</small></div></li>
          <li><span>2</span><div><strong>Mở sửa Phím tắt</strong><small>Dán Điểm nhận vào ô URL và Authorization vào header của yêu cầu mạng.</small></div></li>
          <li><span>3</span><div><strong>Chạy thử</strong><small>Cho phép chỉ số muốn chia sẻ rồi quay lại EmBe.</small></div></li>
        </ol>
        <a className="care-add-button iphone-shortcut-link" href="https://www.icloud.com/shortcuts/1617296a8c8546b49be47740be2550b3" target="_blank" rel="noreferrer">Cài Phím tắt</a>
        <div className="iphone-setup-value"><small>Điểm nhận</small><code>{syncSecret.ingestUrl}</code><button type="button" onClick={() => void copySetupValue("url", syncSecret.ingestUrl)}>{copied === "url" ? "Đã chép" : "Chép"}</button></div>
        <div className="iphone-setup-value"><small>Authorization</small><code>Bearer {syncSecret.token}</code><button type="button" onClick={() => void copySetupValue("token", `Bearer ${syncSecret.token}`)}>{copied === "token" ? "Đã chép" : "Chép"}</button></div>
      </div> : null}

      <p className={`iphone-health-feedback is-${iphoneRefreshStatus}`} aria-live="polite">
        {iphoneRefreshStatus === "checking" ? "Đang kiểm tra dữ liệu mới…"
          : iphoneRefreshStatus === "updated" ? "Đã kiểm tra xong."
            : iphoneRefreshStatus === "error" ? "Chưa kiểm tra được. Chạm Làm mới khi có mạng."
              : "Dữ liệu tổng hợp được giữ riêng cho gia đình."}
      </p>
    </section>

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
          <div><h3>Hôm nay</h3><p>{doseCount ? `${takenCount}/${doseCount} đã uống · ${skippedCount} bỏ qua · ${deferredCount} hoãn` : "Chưa có kế hoạch đã được bác sĩ xác nhận"}</p></div>
        </article>
        <article className="energy-card">
          <span>Ước lượng từ bữa đã ghi</span>
          <strong>{calories ? `${calories} kcal` : "Chưa đủ dữ liệu"}</strong>
          <p>{energyTarget ? `Mốc cá nhân tham khảo khoảng ${energyTarget} kcal/ngày.` : "Thêm hồ sơ cơ bản để có mốc năng lượng cá nhân."}</p>
        </article>
      </div>

      {timingConflicts.length ? <aside className="supplement-timing-alert">
        <strong>Giờ sắt và canxi đang trùng nhau</strong>
        <p>{[...new Set(timingConflicts.map((item) => item.time))].join(", ")}. WHO khuyên dùng hai loại ở thời điểm khác nhau trong ngày. Hãy chỉnh theo đúng lời dặn của bác sĩ hoặc dược sĩ.</p>
        <a href="https://www.who.int/news-room/fact-sheets/detail/anaemia" target="_blank" rel="noreferrer">Nguồn WHO ↗</a>
      </aside> : null}

      {activePlans.length ? <div className="dose-list">
        {activePlans.map((plan) => <article key={plan.id}>
          <div className="dose-copy">
            <span>{plan.category === "medicine" ? "Thuốc" : "Vi chất"}{plan.confirmed_by_clinician ? " · đã xác nhận với bác sĩ" : " · cần xác nhận"}</span>
            <strong>{plan.name}</strong><small>{plan.dose_display}{plan.instructions ? ` · ${plan.instructions}` : ""}</small>
            <button className="care-add-button" type="button" disabled={status === "saving"} onClick={() => void mutate({ action: "planState", planId: plan.id, active: false })}>Tạm dừng {plan.name}</button>
          </div>
          {plan.confirmed_by_clinician ? <div className="dose-slots" aria-label={`Ghi nhận ${plan.name}`}>
            {Array.from({ length: plan.times_per_day }, (_, index) => index + 1).map((slot) => {
              const dose = (plan.dose_states ?? []).find((item) => item.slot === slot);
              const reminderTime = plan.reminder_times?.[slot - 1]?.slice(0, 5);
              return <form className="care-plan-form" key={`${slot}-${dose?.status ?? "pending"}-${dose?.recorded_at ?? ""}`} onSubmit={(event) => void saveDose(event, plan.id, slot)}>
                <strong>Lần {slot}{reminderTime ? ` · ${reminderTime}` : ""}</strong>
                <label>Trạng thái<span className="sr-only"> {plan.name} lần {slot}</span><select name="doseStatus" required defaultValue={dose?.status ?? ""} aria-label={`Trạng thái ${plan.name} lần ${slot}`}>
                  <option value="">Chọn</option><option value="taken">Đã uống</option><option value="skipped">Bỏ qua</option><option value="deferred">Hoãn</option>
                </select></label>
                <label>Lý do ngắn (nếu bỏ qua/hoãn)<input name="reason" maxLength={120} defaultValue={dose?.reason ?? ""} /></label>
                <button className="health-save" type="submit" disabled={status === "saving"}>Lưu lần {slot}</button>
              </form>;
            })}
          </div> : <p className="formula-note">Xác nhận kế hoạch với bác sĩ/dược sĩ trước khi ghi tuân thủ.</p>}
        </article>)}
      </div> : <div className="care-empty"><strong>Chưa có kế hoạch dùng hằng ngày</strong><p>Chỉ thêm đúng tên và liều đang dùng hoặc đã được bác sĩ dặn.</p></div>}

      {pausedPlans.length ? <details className="energy-profile">
        <summary><span><strong>Kế hoạch đang tạm dừng</strong><small>{pausedPlans.length} kế hoạch</small></span><i>⌄</i></summary>
        <div className="dose-list">{pausedPlans.map((plan) => <article key={plan.id}><div className="dose-copy"><strong>{plan.name}</strong><small>{plan.dose_display}</small></div>
          <button className="care-add-button" type="button" disabled={status === "saving"} onClick={() => void mutate({ action: "planState", planId: plan.id, active: true })}>Kích hoạt {plan.name}</button>
        </article>)}</div>
      </details> : null}

      {(snapshot.adherence_history ?? []).length ? <section className="dose-list" aria-labelledby="adherence-history-title">
        <h3 id="adherence-history-title">Lịch sử tuân thủ</h3>
        {(snapshot.adherence_history ?? []).map((item) => <article key={`${item.plan_id}-${item.day}-${item.slot}`}>
          <div className="dose-copy"><span>{new Date(`${item.day}T00:00:00+07:00`).toLocaleDateString("vi-VN")} · Lần {item.slot}</span><strong>{item.plan_name}</strong>
            <small>{item.status === "taken" ? "Đã uống" : item.status === "skipped" ? "Bỏ qua" : "Hoãn"}{item.reason ? ` · ${item.reason}` : ""}</small></div>
        </article>)}
      </section> : null}

      <button className="care-add-button" type="button" onClick={() => setShowPlan((value) => !value)}>
        {showPlan ? "Đóng" : "+ Thêm thuốc hoặc vi chất"}
      </button>
      {showPlan && <form className="care-plan-form" onSubmit={(event) => void addPlan(event)}>
        <div className="care-form-grid">
          <label>Loại<select name="category" defaultValue="supplement"><option value="supplement">Vitamin / khoáng chất</option><option value="medicine">Thuốc bác sĩ dặn</option></select></label>
          <label>Tên<input name="name" required maxLength={80} placeholder="Ví dụ: viên bổ sung đang dùng" /></label>
          <label>Liều ghi trên nhãn/đơn<input name="doseDisplay" required maxLength={80} placeholder="Ví dụ: 1 viên sau ăn" /></label>
          <label>Số lần mỗi ngày<select name="timesPerDay" value={planTimesPerDay}
            onChange={(event) => setPlanTimesPerDay(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((value) => <option key={value}>{value}</option>)}</select></label>
          {Array.from({ length: planTimesPerDay }, (_, index) => <label key={index}>
            Giờ nhắc lần {index + 1}<input name={`reminderTime${index + 1}`} type="time" required
              defaultValue={index === 0 ? "08:00" : ""} />
          </label>)}
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
          <label>Mức tăng cân tối thiểu bác sĩ dặn (kg)<input name="clinicianWeightGainMinKg" type="number" min="0" max="50" step="0.1" defaultValue={snapshot.profile?.clinician_weight_gain_min_kg ?? ""} /></label>
          <label>Mức tăng cân tối đa bác sĩ dặn (kg)<input name="clinicianWeightGainMaxKg" type="number" min="0" max="50" step="0.1" defaultValue={snapshot.profile?.clinician_weight_gain_max_kg ?? ""} /></label>
          <button className="health-save" type="submit">Lưu &amp; tính lại</button>
        </form>
        <p className="formula-note">Mốc tự tính dùng phương trình DRI 2023 theo hồ sơ và cộng khoảng 340 kcal ở ba tháng giữa, 450 kcal ở ba tháng cuối. Đây là điểm bắt đầu để theo dõi, không phải chỉ định giảm/tăng cân; mốc chuyên môn đã nhập luôn được ưu tiên.</p>
      </details>

      <p className={`care-status is-${status}`} aria-live="polite">{status === "saving" ? "Đang lưu riêng tư…" : status === "error" ? "Chưa đồng bộ được; hãy thử lại khi có mạng." : "Dữ liệu sức khỏe được giữ riêng cho gia đình."}</p>
    </section>
  </>);
}
