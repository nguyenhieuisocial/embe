"use client";

import Link from "next/link";
import FoodPortionInput from './food-portion-input';
import {foodPortionLabel} from '../lib/food-portion';
import { useEffect, useMemo, useRef, useState } from "react";

import type { MealAnalysis } from "../lib/meal-analysis-contract";
import { buildMealDashboard, FOOD_GROUP_LABELS, type MealHistoryEntry } from "../lib/meal-dashboard";
import { createMealDraft, createMealNote, waitForMealDraft, waitForMealNutrition } from "../lib/meal-photo-client";
import { deriveMealSafetyFlags, hasMealSafetyConcern, inferMealFoodGroups } from "../lib/meal-safety";
import { announceLinkedDailyAction } from "../lib/linked-daily-actions";
import { cachedPrivateGet, clearPrivateGetCache } from "../lib/private-get-cache";
import { useFamilyDataRefresh } from "../lib/use-family-data-refresh";
import { currentMealType, type MealType } from "../lib/pregnancy-menu";
import PersonalizedMealSuggestions from "./personalized-meal-suggestions";
import { suggestPopularFoods, VIETNAMESE_POPULAR_FOODS } from "../lib/vietnamese-food-catalog";
import { Icon } from "./embe-icon";

const labels: Record<string, string> = { breakfast: "Sáng", lunch: "Trưa", dinner: "Tối", snack: "Bữa phụ" };
const nutrientLabels = [
  ["protein_g", "Đạm", "g"], ["carbs_g", "Tinh bột", "g"],
  ["fat_g", "Chất béo", "g"], ["fiber_g", "Chất xơ", "g"],
  ["calcium_mg", "Canxi", "mg"], ["iron_mg", "Sắt", "mg"], ["folate_ug", "Folate", "µg"]
] as const;
const UNCONFIRMED_FOOD_NAME = "món cần mẹ xác nhận";
const MANUAL_FOOD_PREFIX = "Món thêm ngoài ảnh: ";

function foodKey(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d").toLocaleLowerCase("vi").replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueFoodNames(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    const key = foodKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function mealNoteWithManualFoods(note: string, foods: string[]): string {
  const parts = [note.trim()];
  if (foods.length) parts.push(`${MANUAL_FOOD_PREFIX}${foods.join(", ")}`);
  return parts.filter(Boolean).join(". ");
}

function mergeManualFoods(analysis: MealAnalysis, names: string[]): MealAnalysis {
  const manualNames = uniqueFoodNames(names);
  if (!manualNames.length) return analysis;
  const manualKeys = new Set(manualNames.map(foodKey));
  const detected = analysis.foods.filter((food) => !manualKeys.has(foodKey(food.nameVi)))
    .slice(0, Math.max(0, 8 - manualNames.length));
  const manual = manualNames.map((nameVi) => ({
    nameVi, searchNameEn: nameVi, estimatedGrams: null, confidence: 1,
    foodGroups: inferMealFoodGroups(nameVi), safetyFlags: deriveMealSafetyFlags(nameVi)
  }));
  const portionPrompt = "Thêm khẩu phần cho món Mẹ vừa nhập nếu muốn ước lượng dinh dưỡng sát hơn.";
  return {
    ...analysis,
    entryMode: undefined,
    nutrition: undefined,
    foods: [...detected, ...manual],
    needsUserConfirmation: [...analysis.needsUserConfirmation.filter((item) => item !== portionPrompt), portionPrompt].slice(0, 6)
  };
}

export function looksLikeMedication(value: string): boolean {
  const text = value.trim().toLocaleLowerCase("vi");
  if (!text) return false;
  if (/\b(thuốc|đơn thuốc|vitamin|vi chất|thuốc bổ|thực phẩm bổ sung)\b/u.test(text)) return true;
  const supplement = /\b(sắt|canxi|dha|acid folic|folic acid|omega[ -]?3)\b/u.test(text);
  const intake = /\b(uống|dùng|viên|liều|mg|mcg|µg|iu)\b/u.test(text);
  return supplement && intake;
}

export function medicationCareDestination(value: string): { href: string; label: string; description: string } {
  const text = value.trim().toLocaleLowerCase("vi");
  const isPrescription = /(đơn thuốc|toa thuốc|bác sĩ (kê|dặn)|theo đơn)/u.test(text);
  return isPrescription
    ? { href: "/me-bau/ho-so?quick=prescription#ho-so-kham", label: "Lưu đơn thuốc", description: "Đây có vẻ là đơn hoặc lời dặn của bác sĩ. Hãy lưu cùng hồ sơ khám." }
    : { href: "/me-bau/thuoc?quick=self-purchased", label: "Lưu thuốc / vi chất tự mua", description: "Đây có vẻ là sản phẩm tự mua. Hãy lưu riêng để không bị tính thành món ăn." };
}

function hasInvalidFood(analysis: MealAnalysis): boolean {
  return analysis.foods.some((food) => {
    const name = food.nameVi.trim().toLocaleLowerCase("vi");
    return !name || name === UNCONFIRMED_FOOD_NAME;
  });
}

function mealDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

function formatNutritionValue(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}

function MealNutritionFacts({ entry }: { entry: MealHistoryEntry }) {
  const nutrition = entry.analysis.nutrition;
  const totals = nutrition?.totals ?? {};
  const nutrients = nutrientLabels.filter(([key]) => (totals[key] ?? 0) > 0);
  if (!nutrition || (!nutrition.calorieRange && nutrients.length === 0)) return null;
  const mealLabel = (labels[entry.mealType] ?? "bữa ăn").toLocaleLowerCase("vi");
  return <section className="meal-entry-nutrition" aria-label={`Dinh dưỡng ước lượng của bữa ${mealLabel}`}>
    <div className="meal-entry-nutrition-heading">
      <strong>Dinh dưỡng ước lượng</strong>
      <small>theo khẩu phần đã xác nhận</small>
    </div>
    <div className="meal-entry-nutrients">
      {nutrition.calorieRange ? <span><b>{Math.round(nutrition.calorieRange.low)}–{Math.round(nutrition.calorieRange.high)}</b><small>kcal</small></span> : null}
      {nutrients.map(([key, label, unit]) => <span key={key}>
        <b>{formatNutritionValue(totals[key])} {unit}</b><small>{label}</small>
      </span>)}
    </div>
    {nutrition.source ? <small className="meal-nutrition-source">Nguồn: {nutrition.source}</small> : null}
  </section>;
}

function mealHistoryNutritionSummary(entry: MealHistoryEntry): string {
  if (entry.status === "analyzing") return "Đang nhận diện món";
  if (entry.status === "needs_review") return "Chờ Mẹ kiểm tra";
  if (entry.status === "failed") return "Chưa nhận diện được · ghi chú vẫn còn";
  if (entry.status === "processing") return "Đã lưu · đang bổ sung dinh dưỡng";
  if (entry.analysis.entryMode === "note") return "Chỉ có ghi chú";
  if (entry.analysis.nutrition?.status === "unavailable") return "Chưa tính được dinh dưỡng · chạm để sửa";
  const nutrition = entry.analysis.nutrition;
  if (!nutrition?.calorieRange) return "Đang bổ sung dinh dưỡng";
  const parts = [`${Math.round(nutrition.calorieRange.low)}–${Math.round(nutrition.calorieRange.high)} kcal`];
  for (const [key, label, unit] of nutrientLabels) {
    const value = nutrition.totals?.[key] ?? 0;
    if (value > 0) parts.push(`${label} ${formatNutritionValue(value)} ${unit}`);
    if (parts.length === 3) break;
  }
  return parts.join(" · ");
}

type Worker = { status: "online" | "degraded" | "offline" | "unknown"; lastSeenAt?: string };

function MealHistoryPhoto({ entryId, label }: { entryId: string; label: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!failed) return;
    const retryOnline = () => { setFailed(false); setAttempt(value => value + 1); };
    window.addEventListener('online', retryOnline);
    return () => window.removeEventListener('online', retryOnline);
  }, [failed]);
  if (failed) return <div className="meal-photo-error" role="status">
    <span>Chưa mở được ảnh.</span>
    <button type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Thử lại ảnh</button>
  </div>;
  return <img className="meal-history-photo" key={attempt}
    src={`/api/meals/${entryId}/image${attempt ? `?retry=${attempt}` : ""}`}
    alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => {
      if (attempt === 0 && navigator.onLine) setAttempt(1);
      else setFailed(true);
    }} />;
}

export default function MealPhotoTracker() {
  const [view, setView] = useState<"capture" | "history" | "nutrition">("capture");
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [manualFoodInput, setManualFoodInput] = useState("");
  const [manualFoods, setManualFoods] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [entryId, setEntryId] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<MealHistoryEntry[]>([]);
  const [range, setRange] = useState<7 | 28>(7);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadError, setHistoryLoadError] = useState(false);
  const [worker, setWorker] = useState<Worker>({ status: "unknown" });
  const [historyEditor, setHistoryEditor] = useState<{ id: string; note: string; analysis: MealAnalysis } | null>(null);
  const [historySaving, setHistorySaving] = useState(false);
  const [historyDeletingId, setHistoryDeletingId] = useState("");
  const [historyDeleteConfirmId, setHistoryDeleteConfirmId] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [historyMessageKind, setHistoryMessageKind] = useState<"success" | "error">("success");
  const [status, setStatus] = useState<"idle" | "sending" | "analyzing" | "queued" | "review" | "saving" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmedMedicationText, setConfirmedMedicationText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const historyRequestRef = useRef(0);

  useEffect(() => {
    if (status === "review" && view === "capture") {
      reviewRef.current?.focus({ preventScroll: true });
      reviewRef.current?.scrollIntoView?.({ block: "start" });
    }
  }, [status, view]);

  useEffect(() => { setMealType(currentMealType()); }, []);
  useEffect(() => { void loadHistory(range); }, [range]);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function loadHistory(days = range, fresh = false, background = false, canApply = () => true) {
    const requestId = ++historyRequestRef.current;
    if (!background) { setHistoryLoading(true); setHistoryLoadError(false); }
    try {
      if (fresh) clearPrivateGetCache("/api/meals?");
      const response = await cachedPrivateGet(`/api/meals?days=${days}`);
      if (!response.ok) throw new Error("history_unavailable");
      const payload = await response.json() as { history?: MealHistoryEntry[]; suggestions?: string[]; worker?: Worker };
      if (requestId !== historyRequestRef.current || !canApply()) return;
      setHistory(payload.history ?? []);
      setHistoryLoadError(false);
      setSuggestions(payload.suggestions ?? []);
      setWorker(payload.worker ?? { status: "unknown" });
    } catch { if (!background && requestId === historyRequestRef.current) setHistoryLoadError(true); }
    finally { if (!background && requestId === historyRequestRef.current) setHistoryLoading(false); }
  }

  const completedHistory = useMemo(
    () => history.filter((entry) => entry.status === "ready" || entry.status === "processing"),
    [history]
  );
  const dashboard = useMemo(() => buildMealDashboard(completedHistory, range), [completedHistory, range]);
  // Recompute on renders as well as history changes, so refresh after midnight
  // cannot retain yesterday's totals. Missing nutrients are not zero intake.
  const todayDashboard = buildMealDashboard(completedHistory, 1);
  const risks = useMemo(() => new Set(analysis?.foods.flatMap((food) => [
    ...food.safetyFlags, ...deriveMealSafetyFlags(food.nameVi)
  ]) ?? []), [analysis]);
  const groups = Object.entries(dashboard.groupCounts).sort((a, b) => b[1] - a[1]);
  const maxGroup = Math.max(1, ...groups.map(([, count]) => count));
  const medicationLike = looksLikeMedication(note);
  const hasMealInput = Boolean(file || note.trim() || manualFoods.length || manualFoodInput.trim());
  const captureBusy = status === "sending" || status === "analyzing" || status === "saving";
  useFamilyDataRefresh(canApply => loadHistory(range, false, true, canApply),
    !historyLoading && !historySaving && !historyDeletingId && !historyEditor && !captureBusy);
  const medicationRouteOpen = medicationLike && confirmedMedicationText !== note.trim();
  const medicationDestination = medicationCareDestination(note);
  const popularSuggestions = useMemo(() => suggestPopularFoods(note), [note]);
  const menuHistory = useMemo(() => completedHistory.map((entry) => ({
    mealType: entry.mealType, eatenAt: entry.eatenAt, note: entry.note,
    foods: entry.analysis.foods.map((food) => ({ nameVi: food.nameVi, foodGroups: food.foodGroups })),
    nutritionTotals: entry.analysis.nutrition?.totals
  })), [completedHistory]);

  function addManualFood() {
    const next = uniqueFoodNames([...manualFoods, manualFoodInput]);
    if (next.length === manualFoods.length) {
      if (manualFoodInput.trim()) setStatusMessage("Món này đã có trong danh sách.");
      return;
    }
    if (mealNoteWithManualFoods(note, next).length > 300) {
      setStatusMessage("Ghi chú và danh sách món đang quá dài. Hãy rút gọn một chút.");
      return;
    }
    setManualFoods(next);
    setManualFoodInput("");
    setStatusMessage("");
  }

  function removeManualFood(index: number) {
    setManualFoods((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setStatusMessage("");
  }

  function chooseSuggestion(value: string) {
    const next = note.trim() ? `${note.trim()}, ${value}` : value;
    if (next.length > 300) {
      setStatusMessage("Ghi chú đã dài. Mẹ rút gọn một chút để thêm món nhé.");
      return;
    }
    setNote(next);
    setConfirmedMedicationText("");
  }

  async function analyze() {
    if (!hasMealInput || captureBusy) return;
    if (medicationRouteOpen) {
      setStatusMessage("Nội dung này giống thuốc hoặc vitamin. Chọn nơi lưu phù hợp trước khi tiếp tục.");
      return;
    }
    const additions = uniqueFoodNames([...manualFoods, manualFoodInput]);
    const submissionNote = mealNoteWithManualFoods(note, additions);
    if (submissionNote.length > 300) {
      setStatusMessage("Ghi chú và danh sách món đang quá dài. Hãy rút gọn một chút.");
      return;
    }
    if (additions.length !== manualFoods.length || manualFoodInput.trim()) {
      setManualFoods(additions);
      setManualFoodInput("");
    }
    setAnalysis(null); setStatusMessage("");
    if (!file) {
      setStatus("analyzing");
      try {
        const id = await createMealNote({ authorRole: "mother", mealType, note: submissionNote });
        setEntryId(id);
        const draft = await waitForMealDraft(id);
        setAnalysis(mergeManualFoods(draft.analysis, additions));
        setStatus("review");
      } catch (error) {
        const code = error instanceof Error ? error.message : "unknown";
        setStatusMessage(code === "analysis_timeout"
          ? "Ghi chú đã gửi. Máy nhà đang nhận diện và sẽ giữ kết quả trong nhật ký."
          : "Chưa nhận diện được ghi chú. Hãy kiểm tra mạng và thử lại.");
        setStatus(code === "analysis_timeout" ? "queued" : "error");
      }
      return;
    }
    setStatus("sending");
    try {
      const id = await createMealDraft({ authorRole: "mother", file, mealType, note: submissionNote });
      setEntryId(id); setStatus("analyzing");
      const draft = await waitForMealDraft(id);
      setAnalysis(mergeManualFoods(draft.analysis, additions)); setStatus("review");
    } catch (error) {
      const code = error instanceof Error ? error.message : "unknown";
      if (code === "analysis_timeout") {
        setStatusMessage("Ảnh đã gửi an toàn. Máy nhà đang nhận diện; EmBe sẽ giữ kết quả trong nhật ký.");
        setStatus("queued");
      } else {
        setStatusMessage(code === "invalid_image"
          ? "iPhone chưa đọc được ảnh này. Hãy chụp lại hoặc chọn một ảnh khác."
          : code === "image_too_large"
            ? "Ảnh quá lớn để xử lý. Hãy chụp lại ở chế độ thường."
            : code === "analysis_failed"
              ? "Ảnh đã gửi, nhưng chưa đọc được kết quả nhận diện. Xem trạng thái trong lịch sử bữa ăn; không cần tải lại ảnh ngay."
            : code === "complete_failed"
              ? "Chưa xác minh được ảnh đã tải xong. Giữ ảnh đang chọn và thử lại khi mạng ổn định."
            : code === "upload_failed"
              ? "Mạng bị ngắt khi gửi ảnh. Ảnh chưa được lưu; hãy thử lại."
              : "Chưa gửi được ảnh. Hãy kiểm tra mạng rồi thử lại.");
        setStatus("error");
      }
    }
  }

  function updateFood(index: number, field: "nameVi" | "estimatedGrams", value: string) {
    setAnalysis((current) => current ? {
      ...current, foods: current.foods.map((food, itemIndex) => itemIndex === index
        ? field === "estimatedGrams"
          ? { ...food, estimatedGrams: value ? Number(value) : null }
          : { ...food, nameVi: value, searchNameEn: value,
              foodGroups: inferMealFoodGroups(value), safetyFlags: deriveMealSafetyFlags(value) }
        : food)
    } : current);
  }

  function addFood() {
    setAnalysis((current) => current && current.foods.length < 8 ? {
      ...current,
      entryMode: undefined,
      foods: [...current.foods, {
        nameVi: "", searchNameEn: "food", estimatedGrams: null,
        confidence: 1, foodGroups: ["other"], safetyFlags: []
      }]
    } : current);
  }

  function removeFood(index: number) {
    setAnalysis((current) => current && current.foods.length > 1
      ? { ...current, foods: current.foods.filter((_, itemIndex) => itemIndex !== index) }
      : current);
  }

  async function confirm() {
    if (!entryId || !analysis || status === "saving") return;
    setStatusMessage("");
    setStatus("saving");
    try {
      const response = await fetch(`/api/meals/${entryId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ analysis, note })
      });
      if (!response.ok) throw new Error("save_failed");
      const payload = await response.json() as { checklistCompletion?: unknown };
      announceLinkedDailyAction(payload.checklistCompletion);
      const savedId = entryId;
      setStatus("saved");
      setStatusMessage(payload.checklistCompletion
        ? "Đã lưu bữa ăn · việc hôm nay đã tự tích."
        : "Đã lưu bữa ăn.");
      setFile(null); setAnalysis(null); setEntryId(""); setNote("");
      setManualFoods([]); setManualFoodInput("");
      if (inputRef.current) inputRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
      setView("history");
      await loadHistory(range, true);
      void waitForMealNutrition(savedId).then(() => loadHistory(range, true));
    } catch {
      setStatusMessage("Chưa lưu được bữa ăn. Hãy thử lại.");
      setStatus("error");
    }
  }

  function editSavedMeal(entry: MealHistoryEntry) {
    setHistoryMessage("");
    setHistoryDeleteConfirmId("");
    setHistoryEditor({
      id: entry.id, note: entry.note,
      analysis: { ...entry.analysis, nutrition: undefined, foods: entry.analysis.foods.map((food) => ({ ...food })) }
    });
  }

  function addSavedFood() {
    setHistoryEditor((current) => current && current.analysis.foods.length < 8 ? {
      ...current,
      analysis: {
        ...current.analysis,
        entryMode: undefined,
        foods: [...current.analysis.foods, {
          nameVi: "", searchNameEn: "food", estimatedGrams: null,
          confidence: 1, foodGroups: ["other"], safetyFlags: []
        }]
      }
    } : current);
  }

  function removeSavedFood(index: number) {
    setHistoryEditor((current) => current && current.analysis.foods.length > 1 ? {
      ...current,
      analysis: { ...current.analysis, foods: current.analysis.foods.filter((_, itemIndex) => itemIndex !== index) }
    } : current);
  }

  function updateSavedFood(index: number, field: "nameVi" | "estimatedGrams", value: string) {
    setHistoryEditor((current) => current ? {
      ...current,
      analysis: {
        ...current.analysis,
        foods: current.analysis.foods.map((food, itemIndex) => itemIndex === index
          ? field === "estimatedGrams"
            ? { ...food, estimatedGrams: value ? Number(value) : null }
            : { ...food, nameVi: value, searchNameEn: value,
                foodGroups: inferMealFoodGroups(value), safetyFlags: deriveMealSafetyFlags(value) }
          : food)
      }
    } : current);
  }

  async function saveHistoryEdit() {
    if (!historyEditor || historySaving || hasInvalidFood(historyEditor.analysis)) return;
    setHistoryMessage("");
    setHistorySaving(true);
    try {
      const response = await fetch(`/api/meals/${historyEditor.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysis: historyEditor.analysis, note: historyEditor.note })
      });
      if (!response.ok) throw new Error("save_failed");
      const payload = await response.json() as { checklistCompletion?: unknown };
      announceLinkedDailyAction(payload.checklistCompletion);
      const savedId = historyEditor.id;
      setHistoryEditor(null);
      setHistoryMessageKind("success");
      setHistoryMessage("Đã lưu thay đổi.");
      await loadHistory(range, true);
      void waitForMealNutrition(savedId).then(() => loadHistory(range, true));
    } catch {
      setHistoryMessageKind("error");
      setHistoryMessage("Chưa lưu được thay đổi. Hãy thử lại.");
    } finally { setHistorySaving(false); }
  }

  async function deleteSavedMeal(id: string) {
    if (historyDeletingId) return;
    setHistoryMessage("");
    setHistoryDeletingId(id);
    try {
      const response = await fetch(`/api/meals/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("delete_failed");
      setHistory((current) => current.filter((entry) => entry.id !== id));
      setHistoryEditor((current) => current?.id === id ? null : current);
      setHistoryDeleteConfirmId("");
      setHistoryMessageKind("success");
      setHistoryMessage("Đã chuyển bữa ăn vào Thùng rác.");
      await loadHistory(range, true);
    } catch {
      setHistoryMessageKind("error");
      setHistoryMessage("Chưa xóa được bữa ăn. Hãy thử lại.");
    } finally { setHistoryDeletingId(""); }
  }

  const workerCopy = worker.status === "online" ? "Nhận diện sẵn sàng"
    : worker.status === "degraded" ? "Nhận diện đang chậm"
      : worker.status === "offline" ? "Máy nhà đang tắt"
        : "Chưa thấy máy nhận diện";

  return (
    <section className="meal-tracker" id="bua-an" aria-labelledby="meal-title">
      <div className="section-heading-row meal-heading">
        <h2 id="meal-title" className="sr-only">Nhật ký bữa ăn</h2>
        <span className={`meal-worker is-${worker.status}`}><i aria-hidden="true" />{workerCopy}</span>
      </div>
      <div className="meal-view-switch" role="group" aria-label="Xem bữa ăn">
        <button type="button" aria-pressed={view === "capture"} onClick={() => setView("capture")}><Icon name="meal" />Ghi bữa</button>
        <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}><Icon name="calendar" />Đã ăn{history.length ? <span>{history.length}</span> : null}</button>
        <button type="button" aria-pressed={view === "nutrition"} onClick={() => setView("nutrition")}><Icon name="care" />Dinh dưỡng</button>
      </div>
      {view !== "capture" && (statusMessage || captureBusy || analysis) ? <div className={`meal-progress is-${status}`} role="status">
        <p className="meal-state">{statusMessage || (analysis ? "Đã nhận diện. Mẹ kiểm tra lại trước khi lưu nhé." : "Đang nhận diện bữa ăn…")}</p>
        {analysis ? <button className="btn btn-quiet" type="button" onClick={() => setView("capture")}>Kiểm tra bữa này</button> : null}
      </div> : null}

      <div className="meal-workspace" hidden={view !== "capture"}>
      <fieldset className="meal-capture-card" disabled={captureBusy} hidden={Boolean(analysis)}>
        <legend className="sr-only">Ghi bữa ăn</legend>
        <div className="meal-type-picker" role="group" aria-label="Chọn bữa ăn">
          {Object.entries(labels).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mealType === value} onClick={() => setMealType(value as MealType)}>{label}</button>
          ))}
        </div>
        <div className="meal-photo-actions">
          <label className="meal-camera">
            <input ref={inputRef} type="file" accept="image/*" capture="environment" aria-label="Chụp bữa ăn"
              onChange={(event) => { if (event.target.files?.[0]) setFile(event.target.files[0]); }} />
            <Icon name="meal" /><strong>Chụp bữa ăn</strong>
          </label>
          <label className="meal-library">
            <input ref={libraryRef} type="file" accept="image/*" aria-label="Chọn ảnh bữa ăn"
              onChange={(event) => { if (event.target.files?.[0]) setFile(event.target.files[0]); }} />
            <Icon name="memory" /><strong>Chọn ảnh</strong>
          </label>
        </div>
        {previewUrl ? <div className="meal-selected-photo">
          <img className="meal-photo-preview" src={previewUrl} alt="Ảnh bữa ăn vừa chọn" />
          <span><strong>Ảnh đã chọn</strong><small>Có thể thêm món bên dưới.</small></span>
          <button type="button" aria-label="Bỏ ảnh bữa ăn" onClick={() => {
            setFile(null);
            if (inputRef.current) inputRef.current.value = "";
            if (libraryRef.current) libraryRef.current.value = "";
          }}><Icon name="close" /></button>
        </div> : null}
        {file || manualFoods.length || manualFoodInput ? <div className="meal-photo-additions">
          <label htmlFor="meal-manual-food">{file ? "Món thêm cùng ảnh" : "Món thêm"}</label>
          <div className="meal-photo-add-row">
            <input id="meal-manual-food" list="vietnamese-popular-foods" maxLength={80} value={manualFoodInput}
              onChange={(event) => setManualFoodInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualFood(); } }}
              placeholder="Ví dụ: canh bí đỏ" />
            <button type="button" aria-label={file ? "Thêm món cùng ảnh" : "Thêm món"} onClick={addManualFood} disabled={!manualFoodInput.trim()}>Thêm</button>
          </div>
          {manualFoods.length ? <div className="meal-added-foods" aria-label="Các món thêm cùng ảnh">
            {manualFoods.map((food, index) => <button key={`${food}-${index}`} type="button"
              aria-label={`Bỏ món thêm ${food}`} onClick={() => removeManualFood(index)}>{food}<span aria-hidden="true">×</span></button>)}
          </div> : <small>Thêm món bị khuất, đồ uống hoặc món ăn kèm trước khi nhận diện.</small>}
        </div> : null}
        <label className="meal-note">{file ? "Bổ sung món & khẩu phần" : "Mẹ vừa ăn gì?"}
          <textarea aria-label="Ghi chú món ăn · có thể lưu không cần ảnh" aria-describedby="meal-note-help" maxLength={300} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="150 g cơm, cá hồi, một bát canh…" />
        </label>
        <small className="meal-input-hint" id="meal-note-help">{file ? "Ghi thêm món bị khuất hoặc lượng đã ăn." : "Không cần ảnh. Ghi tên món và lượng ăn nếu biết."}</small>
        {popularSuggestions.length ? <div className="meal-food-suggestions" aria-label="Món Việt gợi ý">
          {popularSuggestions.map((name) => <button key={name} type="button" onClick={() => {
            const next = note.replace(/[^,;\n]*$/, name);
            if (next.length <= 300) setNote(next);
          }}>{name}</button>)}
        </div> : null}
        {medicationRouteOpen ? <aside className="meal-medication-route" aria-live="polite">
          <strong>Có vẻ đây là thuốc hoặc vitamin</strong>
          <p>{medicationDestination.description}</p>
          <div>
            <Link href={medicationDestination.href}>{medicationDestination.label}</Link>
            <button type="button" onClick={() => setConfirmedMedicationText(note.trim())}>Vẫn ghi là bữa ăn</button>
          </div>
        </aside> : null}
        <button className="health-save" type="button" disabled={!hasMealInput || medicationRouteOpen || captureBusy} onClick={() => void analyze()}>
          {status === "sending" ? "Đang gửi ảnh…" : status === "analyzing" ? "Đang nhận diện…"
            : status === "saving" ? "Đang lưu…" : file ? "Nhận diện bữa ăn" : "Nhận diện từ ghi chú"}
        </button>
        {view === "capture" && !analysis ? <p className={`meal-state is-${status}`} aria-live="polite">
          {statusMessage || (status === "analyzing" ? "Đang tự nhận diện tên món. Mẹ có thể tiếp tục xem trang."
            : status === "saved" ? "Đã lưu bữa ăn. Dinh dưỡng sẽ được bổ sung ở lượt nền tiếp theo."
              : status === "queued" ? "Ảnh đã gửi và đang chờ nhận diện."
              : "Kết quả là khoảng ước lượng và luôn cần Mẹ xác nhận.")}
        </p> : null}
        <PersonalizedMealSuggestions meal={mealType} history={menuHistory} choose={chooseSuggestion} />
      </fieldset>

      {analysis ? <div ref={reviewRef} tabIndex={-1} className="meal-review" role="group" aria-label="Xác nhận kết quả nhận diện">
        <div><h3>Kiểm tra bữa này</h3><p>Sửa tên món hoặc khẩu phần trước khi lưu.</p></div>
        {analysis.foods.length === 0 ? <p className="meal-empty">{analysis.estimateNotice}</p> : null}
        {analysis.foods.map((food, index) => <div className="meal-food-row" key={index}>
          <label>Tên món<input list="vietnamese-popular-foods" value={food.nameVi} maxLength={80} onChange={(event) => updateFood(index, "nameVi", event.target.value)} /></label>
          <FoodPortionInput name={food.nameVi} grams={food.estimatedGrams ?? null} onChange={value=>updateFood(index, "estimatedGrams", value)}/>
          {food.confidence < .65 ? <small>Cần kiểm tra lại tên món.</small> : null}
          {analysis.foods.length > 1 ? <button className="meal-remove-food" type="button" aria-label={`Bỏ ${food.nameVi || `món ${index + 1}`}`} onClick={() => removeFood(index)}>Bỏ món</button> : null}
        </div>)}
        {analysis.foods.length < 8 ? <button className="meal-add-food" type="button" onClick={addFood}>Thêm món còn thiếu</button> : null}
        {analysis.needsUserConfirmation.length ? <ul className="meal-questions">{analysis.needsUserConfirmation.map((question) => <li key={question}>{question}</li>)}</ul> : null}
        {hasMealSafetyConcern(risks) ? <p className="meal-risk">Món này cần kiểm tra độ chín hoặc tiệt trùng, loại cá và thành phần trước khi dùng.</p> : null}
        <button className="health-save" type="button" disabled={status === "saving" || hasInvalidFood(analysis)} onClick={() => void confirm()}>{status === "saving" ? "Đang lưu…" : "Lưu bữa này"}</button>
        {view === "capture" && statusMessage ? <p className={`meal-state is-${status}`} role="status">{statusMessage}</p> : null}
        <button className="meal-add-food" type="button" disabled={status === "saving"} onClick={() => { setAnalysis(null); setStatus("idle"); setStatusMessage(""); }}>Chọn lại ảnh hoặc ghi chú</button>
      </div> : null}
      <Link className="meal-medicine-shortcut" href="/me-bau/thuoc?quick=self-purchased">Thuốc & vi chất tự mua<Icon name="arrow" /></Link>
      </div>

      {!historyLoading && !historyLoadError ? <details className="care-inline" aria-label="Dinh dưỡng hôm nay">
        <summary>Hôm nay · {todayDashboard.daily[0].meals} bữa đã ghi</summary>
        {todayDashboard.daily[0].meals ? <>
          <p>Ước lượng từ bữa đã lưu; tự cập nhật sau khi lưu, sửa hoặc xóa. Chưa gồm thuốc và viên bổ sung.</p>
          <div className="meal-nutrients">
            {nutrientLabels.map(([key, label, unit]) => <span key={key}>
              <b>{todayDashboard.nutrientCoverage[key] ? `${Math.round(todayDashboard.nutrientTotals[key] * 10) / 10} ${unit}` : "Chưa có dữ liệu"}</b>
              <small>{label}{todayDashboard.nutrientCoverage[key] ? ` · ${todayDashboard.nutrientCoverage[key]}/${todayDashboard.daily[0].meals} bữa` : ""}</small>
            </span>)}
          </div>
          <p>Chưa có mục tiêu dinh dưỡng cá nhân đã đối chiếu, nên chưa kết luận thiếu chất hoặc cần ăn thêm bao nhiêu.</p>
        </> : <p>Chưa có bữa đã lưu hôm nay. Chụp ảnh hoặc nhập món để bắt đầu.</p>}
      </details> : null}

      <section className="meal-dashboard meal-workspace" hidden={view === "capture"} aria-labelledby="meal-dashboard-title">
        <h3 id="meal-dashboard-title">{view === "history" ? "Lịch sử từng bữa" : "Nhìn lại dinh dưỡng"}</h3>
        <div className="meal-dashboard-body">
          <div className="meal-dashboard-head">
            <small>Khoảng thời gian</small>
          <div className="meal-range" role="group" aria-label="Khoảng thời gian">
            {[7, 28].map((days) => <button key={days} type="button" aria-pressed={range === days} onClick={() => setRange(days as 7 | 28)}>{days} ngày</button>)}
          </div>
          </div>
          {historyMessage ? <p className={`meal-state is-${historyMessageKind}`} role="status">{historyMessage}</p> : null}
          {historyLoadError ? <div className="meal-history-error" role="alert">
            <span>Chưa tải được lịch sử. Bữa đã lưu vẫn được giữ lại.</span>
            <button type="button" onClick={() => void loadHistory(range, true)}>Tải lại</button>
          </div> : null}

        {historyLoading ? <p className="meal-empty" aria-live="polite">Đang mở sổ bữa ăn…</p>
          : history.length === 0 ? !historyLoadError && <div className="meal-empty"><p>Chưa có bữa nào trong khoảng này.</p><button className="btn btn-quiet" type="button" onClick={() => setView("capture")}>Ghi bữa đầu tiên</button></div>
            : <>
              <div className="meal-workspace meal-insights" hidden={view !== "nutrition"}>
              <div className="meal-summary-row">
                <span><b>{completedHistory.length}</b><small>bữa đã lưu</small></span>
                {dashboard.calorieRange ? <span><b>{Math.round(dashboard.calorieRange.low).toLocaleString("vi-VN")}–{Math.round(dashboard.calorieRange.high).toLocaleString("vi-VN")}</b><small>kcal đã ghi</small></span> : null}
              </div>

              <div className="meal-chart-block">
                <h4>Năng lượng theo ngày</h4>
                <div className="meal-daily-scroll">
                  <div className="meal-daily-chart" style={{
                    gridTemplateColumns: `repeat(${range}, minmax(20px, 1fr))`,
                    minWidth: `${Math.max(320, range * 26)}px`
                  }}>
                    {dashboard.daily.map((day) => <span className="meal-day" key={day.key} title={`${day.label}: ${Math.round(day.calories)} kcal`}>
                      <i style={{ height: `${Math.max(day.calories ? 8 : 2, day.calories / dashboard.maxDailyCalories * 100)}%` }} />
                      <small>{range === 7 || day.key.endsWith("-01") ? day.label : day.label.split("/")[0]}</small>
                    </span>)}
                  </div>
                </div>
                <p>Chỉ cộng các bữa đã ghi, không phải mục tiêu mỗi ngày.</p>
              </div>

              {groups.length ? <div className="meal-chart-block meal-group-chart">
                <h4>Nhóm thực phẩm xuất hiện</h4>
                {groups.map(([group, count]) => <div className="meal-group-row" key={group}>
                  <span>{FOOD_GROUP_LABELS[group] ?? group}</span>
                  <i><b style={{ width: `${count / maxGroup * 100}%` }} /></i><small>{count} bữa</small>
                </div>)}
              </div> : null}

              {Object.keys(dashboard.nutrientTotals).length ? <div className="meal-nutrients" aria-label="Dinh dưỡng ước lượng từ các bữa đã ghi">
                {nutrientLabels.flatMap(([key, label, unit]) => dashboard.nutrientTotals[key] > 0
                  ? [<span key={key}><b>{Math.round(dashboard.nutrientTotals[key] * 10) / 10} {unit}</b><small>{label}</small></span>] : [])}
              </div> : null}

              <ul className="meal-suggestions">{suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
              </div>

              <div className="meal-history-list meal-workspace" hidden={view !== "history"}>
                {history.map((entry) => <details className="meal-history-card" key={entry.id}>
                  <summary>
                    <span><b>{labels[entry.mealType] ?? "Bữa ăn"}</b><small>{mealDate(entry.eatenAt)}</small></span>
                    <span><b>{entry.analysis.foods.map((food) => food.nameVi).join(", ") || entry.note || "Ghi chú bữa ăn"}</b>
                      <small>{mealHistoryNutritionSummary(entry)}</small></span>
                  </summary>
                  <div className="meal-history-detail">
                    {entry.hasImage ? <MealHistoryPhoto entryId={entry.id}
                      label={`Ảnh bữa ${(labels[entry.mealType] ?? "ăn").toLocaleLowerCase("vi")}`} /> : null}
                    {historyEditor?.id === entry.id ? <div className="meal-history-editor">
                      {historyEditor.analysis.foods.map((food, index) => <div className="meal-food-row" key={index}>
                        <label>Sửa tên món<input list="vietnamese-popular-foods" maxLength={80} value={food.nameVi} onChange={(event) => updateSavedFood(index, "nameVi", event.target.value)} /></label>
                        <FoodPortionInput editing name={food.nameVi} grams={food.estimatedGrams ?? null} onChange={value=>updateSavedFood(index, "estimatedGrams", value)}/>
                        {historyEditor.analysis.foods.length > 1 ? <button className="meal-remove-food" type="button" aria-label={`Bỏ ${food.nameVi || `món ${index + 1}`}`} onClick={() => removeSavedFood(index)}>Bỏ món</button> : null}
                      </div>)}
                      {historyEditor.analysis.foods.length < 8 ? <button className="meal-add-food" type="button" onClick={addSavedFood}>Thêm món vào bữa đã lưu</button> : null}
                      <label className="meal-note">Sửa ghi chú<textarea maxLength={300} rows={2} value={historyEditor.note} onChange={(event) => setHistoryEditor((current) => current ? { ...current, note: event.target.value } : current)} /></label>
                      <div className="meal-edit-actions">
                        <button type="button" onClick={() => setHistoryEditor(null)}>Hủy</button>
                        <button className="health-save" type="button" disabled={historySaving || hasInvalidFood(historyEditor.analysis)} onClick={() => void saveHistoryEdit()}>{historySaving ? "Đang lưu…" : "Lưu thay đổi"}</button>
                      </div>
                    </div> : <>
                      {entry.note ? <p>{entry.note}</p> : null}
                      <ul>{entry.analysis.foods.map((food, index) => <li key={`${entry.id}-${index}`}>{food.nameVi}{food.estimatedGrams ? ` · ${foodPortionLabel(food.nameVi,food.estimatedGrams)}` : ""}</li>)}</ul>
                      <MealNutritionFacts entry={entry} />
                      {hasMealSafetyConcern(entry.analysis.foods.flatMap((food) => [
                        ...food.safetyFlags, ...deriveMealSafetyFlags(food.nameVi)
                      ])) ? <p className="meal-risk">Món này cần kiểm tra độ chín hoặc tiệt trùng, loại cá và thành phần trước khi dùng.</p> : null}
                      <small>{entry.analysis.nutrition?.notice ?? entry.analysis.estimateNotice}</small>
                      {historyDeleteConfirmId === entry.id ? <div className="meal-delete-confirm" role="group" aria-label="Xác nhận xóa bữa ăn">
                        <span>Đưa bữa này vào Thùng rác?</span>
                        <button type="button" onClick={() => setHistoryDeleteConfirmId("")}>Giữ lại</button>
                        <button type="button" disabled={historyDeletingId === entry.id} onClick={() => void deleteSavedMeal(entry.id)}>
                          {historyDeletingId === entry.id ? "Đang xóa…" : "Đưa vào Thùng rác"}
                        </button>
                      </div> : <div className="meal-history-actions">
                        {entry.status !== "analyzing" ? <button className="meal-edit-saved" type="button" onClick={() => editSavedMeal(entry)}>
                          {entry.status === "needs_review" ? "Kiểm tra và lưu" : "Sửa bữa này"}
                        </button> : null}
                        <button className="meal-delete-saved" type="button" onClick={() => { setHistoryEditor(null); setHistoryMessage(""); setHistoryDeleteConfirmId(entry.id); }}>Xóa bữa này</button>
                      </div>}
                    </>}
                  </div>
                </details>)}
              </div>
            </>}
          <small className="meal-safety-note">Không tự kết luận thiếu chất hoặc tự đề nghị uống thêm vi chất.</small>
        </div>
      </section>
      <datalist id="vietnamese-popular-foods">
        {VIETNAMESE_POPULAR_FOODS.map((food) => <option key={food.name} value={food.name} />)}
      </datalist>
    </section>
  );
}
