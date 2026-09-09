"use client";

import Link from "next/link";
import MedicationUseGuide, {MedicationPurpose} from './medication-use-guide';
import SavedPrescriptionPicker, { type SavedPrescriptionMedicine } from './saved-prescription-picker';
import { explicitDailyFrequency } from '../lib/prescription-frequency';
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { localDateKey } from "../lib/pregnancy";
import { cachedPrivateGet, clearPrivateGetCache } from "../lib/private-get-cache";
import { notifyFamilyDataChanged } from '../lib/family-data-refresh';
import { useFamilyDataRefresh } from "../lib/use-family-data-refresh";
import { announceLinkedDailyAction } from "../lib/linked-daily-actions";
import { readDeviceRole, type DeviceRole } from "../lib/device-preferences";
import {
  estimatedEnergyTarget, PREGNANCY_NUTRIENTS,
  type EnergyProfile, type NutrientKey
} from "../lib/pregnancy-nutrition";
import { supplementTimingConflicts } from "../lib/supplement-spacing";
import {
  searchMedicationCatalog, type MedicationCatalogItem
} from "../lib/medication-catalog";

type CarePlan = {
  id: string;
  category: "medicine" | "supplement";
  entry_source?: "clinician_plan" | "self_purchased";
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

type CareSource = "clinician_plan" | "self_purchased";
type CareCategory = CarePlan["category"];

const SELF_PURCHASED_SUGGESTIONS: Array<{ name: string; category: CareCategory }> = [
  { name: "Vitamin tổng hợp thai kỳ", category: "supplement" },
  { name: "Acid folic", category: "supplement" },
  { name: "Sắt", category: "supplement" },
  { name: "Canxi", category: "supplement" },
  { name: "DHA / Omega-3", category: "supplement" },
  { name: "Vitamin D", category: "supplement" }
];

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

export default function PregnancyCareTracker({ pregnancyWeek, activePanel }: { pregnancyWeek: number | null; activePanel?: "iphone" | "medication" }) {
  const [day, setDay] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [careFeedback, setCareFeedback] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [showSavedPrescriptions, setShowSavedPrescriptions] = useState(false);
  const [savedMedicine, setSavedMedicine] = useState<SavedPrescriptionMedicine | null>(null);
  const [planTimesPerDay, setPlanTimesPerDay] = useState(1);
  const [planSource, setPlanSource] = useState<CareSource>("clinician_plan");
  const [planCategory, setPlanCategory] = useState<CareCategory>("supplement");
  const [planName, setPlanName] = useState("");
  const [selectedMedication, setSelectedMedication] = useState<MedicationCatalogItem | null>(null);
  const [syncSecret, setSyncSecret] = useState<{ token: string; ingestUrl: string } | null>(null);
  const [copied, setCopied] = useState<"token" | "url" | null>(null);
  const [iphoneHistoryDays, setIphoneHistoryDays] = useState<IphoneHealthHistoryDays>(7);
  const [iphoneHistoryOpen, setIphoneHistoryOpen] = useState(false);
  const [iphoneRefreshStatus, setIphoneRefreshStatus] = useState<"idle" | "checking" | "updated" | "error">("idle");
  const [deviceRole, setDeviceRole] = useState<DeviceRole | null>(null);
  const lastIphoneRefreshRef = useRef(0);

  async function load(currentDay: string, background = false, canApply = () => true) {
    try {
      const [careResponse, mealsResponse] = await Promise.all([
        cachedPrivateGet(`/api/pregnancy/care?day=${currentDay}&days=0`),
        cachedPrivateGet("/api/meals?days=7")
      ]);
      if (!careResponse.ok) throw new Error("care unavailable");
      const care = await careResponse.json() as { snapshot?: Snapshot };
      const mealPayload = mealsResponse.ok ? await mealsResponse.json() as { history?: MealEntry[] } : {};
      if (!canApply()) return;
      setSnapshot(current => background ? { ...(care.snapshot ?? EMPTY_SNAPSHOT), iphone_health_history: current.iphone_health_history } : care.snapshot ?? EMPTY_SNAPSHOT);
      if (Array.isArray(mealPayload.history)) setMeals(mealPayload.history);
      lastIphoneRefreshRef.current = Date.now();
      if (!background) setStatus("idle");
      else setStatus(current => current === "error" ? "idle" : current);
    } catch { if (!background) setStatus("error"); }
  }
  useFamilyDataRefresh(canApply => load(day, true, canApply), Boolean(day) && status !== "loading" && status !== "saving" && !showPlan);

  useEffect(() => {
    const currentDay = localDateKey();
    if (new URLSearchParams(window.location.search).get("quick") === "self-purchased") {
      setPlanSource("self_purchased");
      setShowPlan(true);
    }
    setDeviceRole(readDeviceRole(window.localStorage));
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

  async function mutate(body: Record<string, unknown>, successMessage = "Đã lưu thay đổi."): Promise<boolean> {
    if (!day) return false;
    setCareFeedback("");
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
      notifyFamilyDataChanged();
      const nextSnapshot = payload.snapshot;
      setSnapshot((current) => ({
        ...nextSnapshot,
        iphone_health_history: nextSnapshot.iphone_health_history ?? current.iphone_health_history
      }));
      setStatus("idle");
      setCareFeedback(successMessage);
      return true;
    } catch {
      setStatus("error");
      setCareFeedback("Chưa lưu được. Thông tin vẫn được giữ để Mẹ thử lại.");
      return false;
    }
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
    const saved = await mutate({ action: "plan", plan: {
      id: null, category: data.get("category"), careSource: planSource, name: data.get("name"),
      doseDisplay: data.get("doseDisplay"), timesPerDay: planTimesPerDay, reminderTimes,
      instructions: data.get("instructions") ?? "", nutrientAmounts,
      confirmedByClinician: data.get("confirmedByClinician") === "on", active: true
    } }, "Đã thêm vào lịch dùng hằng ngày.");
    if (!saved) return;
    form.reset();
    setPlanTimesPerDay(1);
    setPlanSource("clinician_plan");
    setPlanCategory("supplement");
    setPlanName("");
    setSelectedMedication(null);
    setShowPlan(false);
    setSavedMedicine(null);
  }

  async function saveDose(event: FormEvent<HTMLFormElement>, planId: string, slot: number) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const doseStatus = data.get("doseStatus");
    await mutate({ action: "intake", planId, slot, status: doseStatus,
      reason: doseStatus === "taken" ? "" : data.get("reason") ?? "" }, "Đã cập nhật lần dùng này.");
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
    if (deviceRole === "father") return;
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

  async function revokeIphoneConnection(deviceId: string) {
    if (deviceRole === "father") return;
    setStatus("saving");
    try {
      const response = await fetch("/api/pregnancy/iphone-health", {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId })
      });
      if (!response.ok) throw new Error("revoke unavailable");
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
  const medicationSuggestions = useMemo(() => planName.trim().length >= 2 && !selectedMedication
    ? searchMedicationCatalog(planName) : [], [planName, selectedMedication]);
  const timingConflicts = supplementTimingConflicts(activePlans);
  const pausedPlans = snapshot.plans.filter((plan) => !plan.active);
  // A reported intake is not a clinician's approval of this plan.
  const trackablePlans = activePlans;
  const doseCount = trackablePlans.reduce((sum, plan) => sum + plan.times_per_day, 0);
  const takenCount = trackablePlans.reduce((sum, plan) => sum + (plan.dose_states ?? []).filter((dose) => dose.status === "taken").length, 0);
  const skippedCount = trackablePlans.reduce((sum, plan) => sum + (plan.dose_states ?? []).filter((dose) => dose.status === "skipped").length, 0);
  const deferredCount = trackablePlans.reduce((sum, plan) => sum + (plan.dose_states ?? []).filter((dose) => dose.status === "deferred").length, 0);
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
    <section className="iphone-health-hub care-tab-panel" hidden={activePanel === "medication"} id="suc-khoe-iphone" aria-labelledby="iphone-health-title">
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
          <span><small>Ngủ</small><strong>{typeof latestIphoneHealth.sleep_minutes === "number" ? `${(latestIphoneHealth.sleep_minutes / 60).toFixed(1)}h` : "—"}</strong></span>
          <span><small>Bước chân</small><strong>{latestIphoneHealth.steps?.toLocaleString("vi-VN") ?? "—"}</strong></span>
          <span><small>Cân nặng</small><strong>{typeof latestIphoneHealth.weight_kg === "number" ? `${latestIphoneHealth.weight_kg} kg` : "—"}</strong></span>
          <span><small>Chiều cao</small><strong>{typeof latestIphoneHealth.height_cm === "number" ? `${latestIphoneHealth.height_cm} cm` : "—"}</strong></span>
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
              <span><strong>{typeof latestIphoneHealth.distance_m === "number" ? `${(latestIphoneHealth.distance_m / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km` : "—"}</strong>quãng đường<small>{metricSyncLabel(latestIphoneHealth, "distanceM")}</small></span>
              <span><strong>{latestIphoneHealth.active_energy_kcal ?? "—"}</strong>kcal vận động<small>{metricSyncLabel(latestIphoneHealth, "activeEnergyKcal")}</small></span>
              <span><strong>{latestIphoneHealth.resting_energy_kcal ?? "—"}</strong>kcal nghỉ<small>{metricSyncLabel(latestIphoneHealth, "restingEnergyKcal")}</small></span>
              <span><strong>{latestIphoneHealth.systolic && latestIphoneHealth.diastolic ? `${latestIphoneHealth.systolic}/${latestIphoneHealth.diastolic}` : "—"}</strong>huyết áp<small>{metricSyncLabel(latestIphoneHealth, "systolic")}</small></span>
              <span><strong>{latestIphoneHealth.respiratory_rate ?? "—"}</strong>nhịp thở<small>{metricSyncLabel(latestIphoneHealth, "respiratoryRate")}</small></span>
              <span><strong>{typeof latestIphoneHealth.oxygen_saturation_percent === "number" ? `${latestIphoneHealth.oxygen_saturation_percent}%` : "—"}</strong>SpO₂<small>{metricSyncLabel(latestIphoneHealth, "oxygenSaturationPercent")}</small></span>
              <span><strong>{latestIphoneHealth.body_temperature_c ?? latestIphoneHealth.wrist_temperature_c ?? "—"}</strong>°C<small>{metricSyncLabel(latestIphoneHealth, typeof latestIphoneHealth.body_temperature_c === "number" ? "bodyTemperatureC" : "wristTemperatureC")}</small></span>
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
                <span>{typeof item.sleep_minutes === "number" ? `${(item.sleep_minutes / 60).toFixed(1)}h ngủ` : "—"}</span>
                <span>{typeof item.weight_kg === "number" ? `${item.weight_kg} kg` : "—"}</span>
              </article>)}</div>
            </div>
          </> : null}
        </details>
        {deviceRole !== "father" && activeIphoneDevices.length ? <div className="iphone-device-list" aria-label="Kết nối sức khỏe iPhone">
          {activeIphoneDevices.map((device) => <div key={device.id}><span><strong>{device.label}</strong><small>{device.last_synced_at ? `Lần cuối ${new Date(device.last_synced_at).toLocaleDateString("vi-VN")}` : "Chưa gửi dữ liệu"}</small></span><button type="button" onClick={() => void revokeIphoneConnection(device.id)}>Ngắt kết nối</button></div>)}
        </div> : null}
      </> : <div className="iphone-health-empty">
        <strong>{activeIphoneDevices.length ? "Còn một bước trên iPhone" : "Kết nối một lần"}</strong>
        <p>{activeIphoneDevices.length
          ? "Đã tạo mã kết nối nhưng chưa nhận dữ liệu. Mẫu Phím tắt hiện tại vẫn cần cấu hình theo hướng dẫn bên dưới."
          : "Apple không cho Safari tự đọc Sức khỏe. Có thể nhập nhanh ngay hoặc kết nối Phím tắt để gửi những chỉ số đã chọn."}</p>
        <div className="iphone-health-actions">
          <Link href="/me-bau/suc-khoe">Nhập nhanh hôm nay</Link>
          {activeIphoneDevices.length ? <a href="shortcuts://">Mở Phím tắt</a> : null}
          {!syncSecret && deviceRole !== "father" ? <button type="button" onClick={() => void createIphoneConnection()}>
            {activeIphoneDevices.length ? "Tạo kết nối mới" : "Kết nối iPhone"}
          </button> : null}
        </div>
        {deviceRole === "father" ? <small>Kết nối Sức khỏe được thực hiện trên iPhone của Mẹ Ngân.</small> : null}
      </div>}

      {syncSecret ? <div className="sync-secret" role="status">
        <strong>Đã tạo mã · chưa đồng bộ</strong>
        <a className="care-add-button iphone-shortcut-link" href="https://www.icloud.com/shortcuts/1617296a8c8546b49be47740be2550b3" target="_blank" rel="noreferrer">Cài mẫu Export Daily Health Data</a>
        <div className="iphone-setup-value"><small>1. Dán vào tác vụ URL gần cuối Phím tắt</small><code>{syncSecret.ingestUrl}</code><button type="button" aria-label="Chép địa chỉ nhận dữ liệu" onClick={() => void copySetupValue("url", syncSecret.ingestUrl)}>{copied === "url" ? "Đã chép" : "Chép"}</button></div>
        <div className="iphone-setup-value"><small>2. Dán vào giá trị của tiêu đề Authorization</small><code>Bearer {syncSecret.token}</code><button type="button" aria-label="Chép mã Authorization" onClick={() => void copySetupValue("token", `Bearer ${syncSecret.token}`)}>{copied === "token" ? "Đã chép" : "Chép"}</button></div>
      </div> : null}

      <details className="care-inline iphone-shortcut-help">
        <summary>Nhập địa chỉ và mã ở đâu trong Phím tắt?</summary>
        <p>Mẫu hiện tại chưa tự cấu hình và chỉ lấy bước chân, năng lượng vận động. Chưa đồng bộ toàn bộ Sức khỏe iPhone.</p>
        <ol className="iphone-setup-steps">
          <li><span>1</span><div><strong>Mở trình sửa, không bấm chạy</strong><small>Trong ứng dụng Phím tắt → Tất cả phím tắt → bấm dấu … trên ô “Export Daily Health Data”.</small></div></li>
          <li><span>2</span><div><strong>Điền địa chỉ nhận</strong><small>Cuộn gần cuối, tìm tác vụ “URL” có ô trống, ngay trước “Lấy nội dung của URL” (Get Contents of URL). Dán địa chỉ nhận vào ô trống đó.</small></div></li>
          <li><span>3</span><div><strong>Thêm Authorization</strong><small>Mở rộng “Lấy nội dung của URL” → Tiêu đề (Headers). Giữ Content-Type: application/json. Thêm một trường mới: khóa là Authorization, giá trị là toàn bộ mã đã chép, bắt đầu bằng Bearer và một dấu cách. Giữ phương thức POST và phần nội dung yêu cầu hiện có.</small></div></li>
          <li><span>4</span><div><strong>Lưu và chạy thử</strong><small>Bấm Xong, chạy phím tắt, cho phép đọc các chỉ số muốn chia sẻ và gửi đến embe.hieu.asia. Quay lại đây để kiểm tra lần đồng bộ; có mã kết nối chưa có nghĩa đã nhận dữ liệu.</small></div></li>
        </ol>
        <p>Nếu không còn hai giá trị để chép, chọn “Tạo kết nối mới” ở trên. Không gửi mã Authorization cho người khác.</p>
      </details>

      <p className={`iphone-health-feedback is-${iphoneRefreshStatus}`} aria-live="polite">
        {iphoneRefreshStatus === "checking" ? "Đang kiểm tra dữ liệu mới…"
          : iphoneRefreshStatus === "updated" ? "Đã kiểm tra xong."
            : iphoneRefreshStatus === "error" ? "Chưa kiểm tra được. Chạm Làm mới khi có mạng."
              : "Dữ liệu tổng hợp được giữ riêng cho gia đình."}
      </p>
    </section>

    <section className="care-tracker care-tab-panel" hidden={activePanel === "iphone"} id="vi-chat-thuoc" aria-labelledby="care-tracker-title">
      <header className={activePanel === "medication" ? "sr-only" : "care-tracker-heading"}>
        <div>
          <span className="care-heading-mark" aria-hidden="true">✦</span>
          <div><h2 id="care-tracker-title">Thuốc &amp; vi chất</h2><p>Theo đúng đơn, nhãn và giờ Mẹ đang dùng</p></div>
        </div>
      </header>

      <div className="care-today-grid">
        <article className="adherence-card" data-state={status === "error" ? "error" : doseCount > 0 && takenCount === doseCount ? "complete" : "pending"}>
          <div className="adherence-ring" style={{ "--progress": `${adherence * 3.6}deg` } as React.CSSProperties}>
            <strong>{doseCount ? `${adherence}%` : "—"}</strong><span>đã dùng</span>
          </div>
          <div><small>Hôm nay</small><h3>{status === "loading" ? "Đang tải lịch…" : status === "error" ? "Chưa cập nhật được lịch" : doseCount ? `${Math.max(0, doseCount - takenCount - skippedCount)} lần còn lại` : activePlans.length ? `${activePlans.length} thuốc đã lưu` : "Chưa có lịch dùng"}</h3>
            <p>{status === "loading" ? "" : status === "error" ? "Thông tin đã lưu vẫn được giữ. Thử tải lại lịch." : doseCount ? `${takenCount}/${doseCount} đã dùng · ${skippedCount} bỏ qua · ${deferredCount} hoãn` : "Thêm thuốc đang dùng hoặc lấy từ hồ sơ."}</p></div>
        </article>
      </div>

      <details className="care-medication-manage" open={showPlan || showSavedPrescriptions || undefined}>
      <summary>Thêm thuốc &amp; lấy từ hồ sơ</summary>
      <div className="care-primary-actions">
        <button className="care-add-button is-primary" type="button" onClick={() => setShowPlan((value) => !value)}>
          {showPlan ? "Đóng" : "+ Thêm thuốc hoặc vi chất"}
        </button>
        <button className="care-add-button" type="button" aria-expanded={showSavedPrescriptions} onClick={()=>setShowSavedPrescriptions(value=>!value)}>Lấy từ hồ sơ đã lưu</button>
        <Link className="care-prescription-link" href="/me-bau/ho-so?quick=prescription#ho-so-kham">Thêm đơn mới</Link>
      </div>

      {showSavedPrescriptions ? <SavedPrescriptionPicker onSelect={medicine=>{
        setSavedMedicine(medicine); setPlanName(medicine.name); setPlanSource('clinician_plan'); setPlanCategory('medicine');
        setSelectedMedication(null); setPlanTimesPerDay(explicitDailyFrequency(medicine.frequency) ?? 0); setShowPlan(true); setShowSavedPrescriptions(false);
        requestAnimationFrame(()=>document.querySelector('.care-plan-form')?.scrollIntoView({block:'start'}));
      }} /> : null}

      {showPlan && <form key={savedMedicine ? `${savedMedicine.href}:${savedMedicine.name}` : 'manual'} className="care-plan-form" onSubmit={(event) => void addPlan(event)}>
        <header className="care-plan-form-heading">
          <div><h3>Thêm thuốc hoặc vi chất</h3><p>Chép đúng thông tin trên đơn hoặc vỏ hộp.</p></div>
          <button type="button" aria-label="Đóng form thêm thuốc" onClick={() => setShowPlan(false)}>×</button>
        </header>
        {savedMedicine ? <aside role="status"><p>Đã lấy thông tin từ <Link href={savedMedicine.href}>{savedMedicine.source}</Link>.</p>
          <p>{[savedMedicine.dose,savedMedicine.frequency,savedMedicine.instructions].filter(Boolean).join(' · ')}</p>
          <small>Chọn số lần và giờ nhắc cho thuốc đang dùng. Không tự bật lại đơn cũ.{savedMedicine.uncertain ? ' Bản đọc chưa chắc chắn: kiểm tra trước khi lưu.' : ''}</small>
        </aside> : null}
        <fieldset className="care-source-picker">
          <legend>Thuốc này từ đâu?</legend>
          <label><input type="radio" name="careSource" value="clinician_plan" checked={planSource === "clinician_plan"} onChange={() => setPlanSource("clinician_plan")} /> Theo đơn / bác sĩ dặn</label>
          <label><input type="radio" name="careSource" value="self_purchased" checked={planSource === "self_purchased"} onChange={() => setPlanSource("self_purchased")} /> Tự mua / không có đơn</label>
        </fieldset>
        {planSource === "self_purchased" ? <div className="care-quick-suggestions" aria-label="Gợi ý chọn nhanh">
          <span>Chọn nhanh</span>
          <div>{SELF_PURCHASED_SUGGESTIONS.map((item) => <button key={item.name} type="button" onClick={() => {
            setPlanName(item.name);
            setPlanCategory(item.category);
            setSelectedMedication(null);
          }}>{item.name}</button>)}</div>
          <small>Chỉ điền tên. Liều dùng phải chép từ nhãn hoặc lời dặn chuyên môn.</small>
        </div> : null}
        <div className="care-form-grid">
          <label>Loại<select name="category" value={planCategory} onChange={(event) => {
            setPlanCategory(event.target.value as CareCategory);
            setSelectedMedication(null);
          }}><option value="supplement">Vitamin / khoáng chất</option><option value="medicine">Thuốc</option></select></label>
          <div className="care-name-picker">
            <label>Tên<input name="name" required maxLength={80} value={planName} onChange={(event) => {
              setPlanName(event.target.value);
              setSelectedMedication(null);
            }} placeholder="Tên trên vỏ hộp hoặc đơn" autoComplete="off" spellCheck={false}
              role="combobox" aria-autocomplete="list" aria-expanded={medicationSuggestions.length > 0}
              aria-controls={medicationSuggestions.length ? "medication-suggestions" : undefined} /></label>
            {medicationSuggestions.length ? <ul id="medication-suggestions" className="medication-suggestions" role="listbox" aria-label="Tên thuốc và vi chất phù hợp">
              {medicationSuggestions.map((item) => <li key={item.name}><button type="button" role="option" aria-selected="false" onClick={() => {
                setPlanName(item.name);
                setPlanCategory(item.category);
                setSelectedMedication(item);
              }}><span><strong>{item.name}</strong><small>{item.detail}</small></span><i>{item.category === "medicine" ? "Thuốc" : "Vi chất"}</i></button></li>)}
            </ul> : null}
            {selectedMedication ? <small className="medication-selection">Đã chọn đúng nhóm {selectedMedication.category === "medicine" ? "Thuốc" : "Vitamin / khoáng chất"}</small>
              : planName.trim().length >= 2 ? <small className="medication-custom-name">Không thấy đúng tên? Mẹ vẫn có thể giữ nguyên tên trên nhãn.</small> : null}
          </div>
          <label className="care-wide">Liều ghi trên nhãn/đơn<input name="doseDisplay" defaultValue={savedMedicine?.dose ?? ''} required maxLength={80} placeholder="Ví dụ: 1 viên sau ăn" /></label>
          <label>Số lần mỗi ngày<select name="timesPerDay" required value={planTimesPerDay || ''}
            onChange={(event) => setPlanTimesPerDay(Number(event.target.value))}>
            <option value="" disabled>Chọn theo cách dùng trên đơn</option>
            {[1, 2, 3, 4, 5, 6].map((value) => <option key={value}>{value}</option>)}</select></label>
          {Array.from({ length: planTimesPerDay }, (_, index) => <label key={index}>
            Giờ nhắc lần {index + 1}<input name={`reminderTime${index + 1}`} type="time" required
              defaultValue={savedMedicine ? '' : index === 0 ? "08:00" : ""} />
          </label>)}
          <label className="care-wide">Ghi chú <small>không bắt buộc</small><input name="instructions" defaultValue={savedMedicine ? [savedMedicine.frequency,savedMedicine.instructions].filter(Boolean).join(' · ') : ''} maxLength={240} placeholder="Ví dụ: dùng sau ăn" /></label>
        </div>
        <label className="clinician-check"><input name="confirmedByClinician" type="checkbox" /> <span>Đã hỏi bác sĩ/dược sĩ về sản phẩm và cách dùng này</span></label>
        <details className="nutrient-entry">
          <summary>Lượng vi chất trên nhãn <small>không bắt buộc</small><span>⌄</span></summary>
          <p>Lượng cho mỗi lần dùng. Chép đúng đơn vị; EmBe sẽ cộng với bữa ăn đã xác nhận.</p>
          <div>{PREGNANCY_NUTRIENTS.map((item) => <label key={item.key}>{item.label}<span>{item.unit}</span><input name={item.key} type="number" min="0" max="100000" step="0.1" inputMode="decimal" /></label>)}</div>
        </details>
        <button className="health-save care-plan-save" type="submit" disabled={status === "saving"}>{status === "saving" ? "Đang lưu…" : "Lưu kế hoạch"}</button>
      </form>}
      </details>

      {timingConflicts.length ? <aside className="supplement-timing-alert">
        <strong>Giờ sắt và canxi đang trùng nhau</strong>
        <p>{[...new Set(timingConflicts.map((item) => item.time))].join(", ")}. WHO khuyên dùng hai loại ở thời điểm khác nhau trong ngày. Hãy chỉnh theo đúng lời dặn của bác sĩ hoặc dược sĩ.</p>
        <a href="https://www.who.int/news-room/fact-sheets/detail/anaemia" target="_blank" rel="noreferrer">Nguồn WHO ↗</a>
      </aside> : null}

      {status === "loading" ? <div className="care-loading" role="status"><span /><span /><span /></div>
        : activePlans.length ? <div className="dose-list">
        <div className="dose-list-heading"><h3>Thuốc đang theo dõi</h3><small>{activePlans.length} loại</small></div>
        {activePlans.map((plan) => <article key={plan.id}>
          <div className="dose-copy">
            <span className="dose-source">{plan.category === "medicine" ? "Thuốc" : "Vi chất"} · {plan.entry_source === "self_purchased" ? "tự mua" : "bác sĩ dặn"}{plan.confirmed_by_clinician ? " · đã hỏi chuyên môn" : ""}</span>
            <strong>{plan.name}</strong><small>{plan.dose_display}</small>
            {plan.instructions ? <small className="dose-instructions">{plan.instructions}</small> : null}
            <MedicationPurpose name={plan.name} />
          </div>
          <div className="dose-slots" aria-label={`Ghi nhận ${plan.name}`}>
            {Array.from({ length: plan.times_per_day }, (_, index) => index + 1).map((slot) => {
              const dose = (plan.dose_states ?? []).find((item) => item.slot === slot);
              const reminderTime = plan.reminder_times?.[slot - 1]?.slice(0, 5);
              const doseLabel = dose?.status === "taken" ? "Đã dùng" : dose?.status === "skipped" ? "Đã bỏ qua" : dose?.status === "deferred" ? "Đang hoãn" : "Chưa ghi";
              return <div className={`dose-slot-row is-${dose?.status ?? "pending"}`} key={`${slot}-${dose?.status ?? "pending"}-${dose?.recorded_at ?? ""}`}>
                <div><time>{reminderTime ?? `Lần ${slot}`}</time><small>{reminderTime ? `Lần ${slot} · ${doseLabel}` : doseLabel}</small></div>
                {dose?.status === "taken" ? <span className="dose-done">✓ Đã dùng</span>
                  : <button className="dose-taken-button" type="button" disabled={status === "saving"}
                    aria-label={`Đánh dấu đã dùng ${plan.name} lần ${slot}`}
                    onClick={() => void mutate({ action: "intake", planId: plan.id, slot, status: "taken", reason: "" }, "Đã ghi nhận lần đã dùng.")}>{status === "saving" ? "Đang lưu…" : "Đánh dấu đã dùng"}</button>}
                <details className="dose-adjust">
                  <summary>{dose ? "Sửa trạng thái" : "Bỏ qua hoặc hoãn"}<span>⌄</span></summary>
                  <form onSubmit={(event) => void saveDose(event, plan.id, slot)}>
                    <label>Trạng thái<span className="sr-only"> {plan.name} lần {slot}</span><select name="doseStatus" required defaultValue={dose?.status ?? ""} aria-label={`Trạng thái ${plan.name} lần ${slot}`}>
                      <option value="">Chọn</option><option value="taken">Đã dùng</option><option value="skipped">Bỏ qua</option><option value="deferred">Hoãn</option>
                    </select></label>
                    <label>Lý do ngắn (nếu bỏ qua/hoãn)<input name="reason" maxLength={120} defaultValue={dose?.reason ?? ""} /></label>
                    <button className="health-save" type="submit" disabled={status === "saving"}>Lưu lần {slot}</button>
                  </form>
                </details>
              </div>;
            })}
          </div>
          <MedicationUseGuide name={plan.name} dose={plan.dose_display} instructions={plan.instructions} times={plan.reminder_times ?? []}>
          {!plan.confirmed_by_clinician && plan.entry_source !== "self_purchased" ? <p>Chưa ghi nhận xác nhận chuyên môn. Chỉ tích lần đã dùng thực tế; không tự đổi liều hoặc cách dùng.</p> : null}
          <div className="medication-management">
          <p className="formula-note">Tạm dừng theo dõi không phải chỉ định ngừng thuốc.</p>
          <button className="dose-pause-button" type="button" disabled={status === "saving"}
            onClick={() => void mutate({ action: "planState", planId: plan.id, active: false }, `Đã tạm dừng ${plan.name}.`)}>Tạm dừng {plan.name}</button>
          </div>
          </MedicationUseGuide>
        </article>)}
      </div> : status === "error" ? <div className="care-empty" role="alert"><strong>Chưa tải được thuốc</strong><button className="care-add-button" type="button" onClick={() => { setStatus("loading"); void load(day); }}>Thử lại</button></div>
        : <div className="care-empty"><span aria-hidden="true">♡</span><strong>Chưa có lịch dùng hằng ngày</strong><p>Thêm đúng tên và liều Mẹ đang dùng. EmBe sẽ xếp giờ gọn ở đây.</p></div>}

      {pausedPlans.length ? <details className="energy-profile">
        <summary><span><strong>Kế hoạch đang tạm dừng</strong><small>{pausedPlans.length} kế hoạch</small></span><i>⌄</i></summary>
        <div className="dose-list">{pausedPlans.map((plan) => <article key={plan.id}><div className="dose-copy"><strong>{plan.name}</strong><small>{plan.dose_display}</small></div>
          <button className="care-add-button" type="button" disabled={status === "saving"} onClick={() => void mutate({ action: "planState", planId: plan.id, active: true })}>Kích hoạt {plan.name}</button>
        </article>)}</div>
      </details> : null}

      {(snapshot.adherence_history ?? []).length ? <details className="care-secondary-section">
        <summary><span><h3 id="adherence-history-title">Lịch sử đã ghi</h3><small>{snapshot.adherence_history?.length} lần gần đây</small></span><i>⌄</i></summary>
        <section className="dose-list care-history-list" aria-labelledby="adherence-history-title">
          {(snapshot.adherence_history ?? []).map((item) => <article key={`${item.plan_id}-${item.day}-${item.slot}`}>
            <div className="dose-copy"><span>{new Date(`${item.day}T00:00:00+07:00`).toLocaleDateString("vi-VN")} · Lần {item.slot}</span><strong>{item.plan_name}</strong>
              <small>{item.status === "taken" ? "Đã dùng" : item.status === "skipped" ? "Bỏ qua" : "Hoãn"}{item.reason ? ` · ${item.reason}` : ""}</small></div>
          </article>)}
        </section>
      </details> : null}

      <details className="care-secondary-section care-nutrition-section">
        <summary><span><h3>Dinh dưỡng tham khảo</h3><small>{calories ? `${calories} kcal từ bữa đã ghi` : "Mở khi cần xem vi chất và năng lượng"}</small></span><i>⌄</i></summary>
        <div className="care-nutrition-body">
          <article className="energy-card">
            <span>Ước lượng từ bữa đã ghi</span>
            <strong>{calories ? `${calories} kcal` : "Chưa đủ dữ liệu"}</strong>
            <p>{energyTarget ? `Mốc cá nhân tham khảo khoảng ${energyTarget} kcal/ngày.` : "Thêm hồ sơ cơ bản để có mốc năng lượng cá nhân."}</p>
          </article>
          <div className="nutrient-heading"><div><h3>Mức tham khảo hằng ngày</h3><p>Thức ăn đã xác nhận + liều đã đánh dấu</p></div><span>NIH · thai kỳ 19–50 tuổi</span></div>
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
        </div>
      </details>

      <p className={`care-status is-${status}`} aria-live="polite">{status === "saving" ? "Đang lưu…" : careFeedback || (status === "error" ? "Chưa kết nối được. Thông tin chưa lưu vẫn được giữ." : "Chỉ Hiếu và Ngân xem được dữ liệu này.")}</p>
    </section>
  </>);
}
