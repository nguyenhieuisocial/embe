"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { MealAnalysis } from "../lib/meal-analysis-contract";
import { buildMealDashboard, FOOD_GROUP_LABELS, type MealHistoryEntry } from "../lib/meal-dashboard";
import { createMealDraft, createMealNote, waitForMealDraft, waitForMealNutrition } from "../lib/meal-photo-client";
import { deriveMealSafetyFlags, hasMealSafetyConcern } from "../lib/meal-safety";

const labels: Record<string, string> = { breakfast: "Sáng", lunch: "Trưa", dinner: "Tối", snack: "Bữa phụ" };
const nutrientLabels = [
  ["protein_g", "Đạm", "g"], ["fiber_g", "Chất xơ", "g"],
  ["calcium_mg", "Canxi", "mg"], ["iron_mg", "Sắt", "mg"], ["folate_ug", "Folate", "µg"]
] as const;
const UNCONFIRMED_FOOD_NAME = "món cần mẹ xác nhận";

function hasInvalidFood(analysis: MealAnalysis): boolean {
  return analysis.foods.some((food) => {
    const name = food.nameVi.trim().toLocaleLowerCase("vi");
    return !name || name === UNCONFIRMED_FOOD_NAME;
  });
}

function defaultMealType(): string {
  const hour = new Date().getHours();
  return hour < 10 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : "snack";
}

function mealDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}

type Worker = { status: "online" | "degraded" | "offline" | "unknown"; lastSeenAt?: string };

export default function MealPhotoTracker() {
  const [mealType, setMealType] = useState("lunch");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [entryId, setEntryId] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<MealHistoryEntry[]>([]);
  const [range, setRange] = useState<7 | 28>(7);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [worker, setWorker] = useState<Worker>({ status: "unknown" });
  const [historyEditor, setHistoryEditor] = useState<{ id: string; note: string; analysis: MealAnalysis } | null>(null);
  const [historySaving, setHistorySaving] = useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "analyzing" | "queued" | "review" | "saving" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMealType(defaultMealType()); }, []);
  useEffect(() => { void loadHistory(range); }, [range]);

  async function loadHistory(days = range) {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/meals?days=${days}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { history?: MealHistoryEntry[]; suggestions?: string[]; worker?: Worker };
      setHistory(payload.history ?? []);
      setSuggestions(payload.suggestions ?? []);
      setWorker(payload.worker ?? { status: "unknown" });
    } catch { /* Chụp ảnh vẫn dùng được khi phần lịch sử tạm gián đoạn. */ }
    finally { setHistoryLoading(false); }
  }

  const dashboard = useMemo(() => buildMealDashboard(history, range), [history, range]);
  const risks = useMemo(() => new Set(analysis?.foods.flatMap((food) => [
    ...food.safetyFlags, ...deriveMealSafetyFlags(food.nameVi)
  ]) ?? []), [analysis]);
  const groups = Object.entries(dashboard.groupCounts).sort((a, b) => b[1] - a[1]);
  const maxGroup = Math.max(1, ...groups.map(([, count]) => count));

  async function analyze() {
    if ((!file && !note.trim()) || status === "sending" || status === "analyzing" || status === "saving") return;
    setAnalysis(null); setStatusMessage("");
    if (!file) {
      setStatus("saving");
      try {
        await createMealNote({ authorRole: "mother", mealType, note });
        setNote(""); setStatusMessage("Đã lưu ghi chú bữa ăn."); setStatus("saved");
        await loadHistory();
      } catch {
        setStatusMessage("Chưa lưu được ghi chú. Hãy kiểm tra mạng và thử lại."); setStatus("error");
      }
      return;
    }
    setStatus("sending");
    try {
      const id = await createMealDraft({ authorRole: "mother", file, mealType, note });
      setEntryId(id); setStatus("analyzing");
      const draft = await waitForMealDraft(id);
      setAnalysis(draft.analysis); setStatus("review");
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
          : { ...food, nameVi: value, searchNameEn: value }
        : food)
    } : current);
  }

  function addFood() {
    setAnalysis((current) => current && current.foods.length < 8 ? {
      ...current,
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
      const savedId = entryId;
      setStatus("saved"); setStatusMessage("Đã lưu bữa ăn."); setFile(null); setAnalysis(null); setEntryId(""); setNote("");
      if (inputRef.current) inputRef.current.value = "";
      await loadHistory();
      void waitForMealNutrition(savedId).then(() => loadHistory());
    } catch {
      setStatusMessage("Chưa lưu được bữa ăn. Hãy thử lại.");
      setStatus("error");
    }
  }

  function editSavedMeal(entry: MealHistoryEntry) {
    setHistoryMessage("");
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
            : { ...food, nameVi: value, searchNameEn: value }
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
      const savedId = historyEditor.id;
      setHistoryEditor(null);
      await loadHistory();
      void waitForMealNutrition(savedId).then(() => loadHistory());
    } catch {
      setHistoryMessage("Chưa lưu được thay đổi. Hãy thử lại.");
    } finally { setHistorySaving(false); }
  }

  const workerCopy = worker.status === "online" ? "Nhận diện sẵn sàng"
    : worker.status === "degraded" ? "Nhận diện đang chậm"
      : worker.status === "offline" ? "Máy nhà đang tắt"
        : "Chưa thấy máy nhận diện";

  return (
    <section className="meal-tracker" id="bua-an" aria-labelledby="meal-title">
      <div className="section-heading-row meal-heading">
        <div><p className="panel-kicker">Chụp · xác nhận · lưu</p><h2 id="meal-title">Nhật ký bữa ăn</h2></div>
        <span className={`meal-worker is-${worker.status}`}><i aria-hidden="true" />{workerCopy}</span>
      </div>

      <div className="meal-capture-card">
        <div className="meal-type-picker" role="group" aria-label="Chọn bữa ăn">
          {Object.entries(labels).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={mealType === value} onClick={() => setMealType(value)}>{label}</button>
          ))}
        </div>
        <label className="meal-camera">
          <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <span aria-hidden="true">◎</span><strong>{file ? "Đã chọn ảnh — chạm để đổi" : "Chụp bữa ăn"}</strong>
          <small>Ảnh được thu nhỏ và bỏ vị trí trước khi gửi.</small>
        </label>
        <label className="meal-note">Ghi chú món ăn · có thể lưu không cần ảnh
          <textarea maxLength={300} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: nửa bát cơm, cá hồi, không có nước chấm" />
        </label>
        <button className="health-save" type="button" disabled={(!file && !note.trim()) || status === "sending" || status === "analyzing" || status === "saving"} onClick={() => void analyze()}>
          {status === "sending" ? "Đang gửi ảnh…" : status === "analyzing" ? "Đang nhận diện…"
            : status === "saving" ? "Đang lưu…" : file ? "Nhận diện bữa ăn" : "Lưu ghi chú"}
        </button>
        <p className={`meal-state is-${status}`} aria-live="polite">
          {statusMessage || (status === "analyzing" ? "Đang tự nhận diện tên món. Mẹ có thể tiếp tục xem trang."
            : status === "saved" ? "Đã lưu bữa ăn. Dinh dưỡng sẽ được bổ sung ở lượt nền tiếp theo."
              : status === "queued" ? "Ảnh đã gửi và đang chờ nhận diện."
              : "Kết quả là khoảng ước lượng và luôn cần Mẹ xác nhận.")}
        </p>
      </div>

      {analysis ? <div className="meal-review" aria-label="Xác nhận kết quả nhận diện">
        <div><p className="panel-kicker">Cần Mẹ kiểm tra</p><h3>Máy nhìn thấy</h3></div>
        {analysis.foods.map((food, index) => <div className="meal-food-row" key={index}>
          <label>Tên món<input value={food.nameVi} maxLength={80} onChange={(event) => updateFood(index, "nameVi", event.target.value)} /></label>
          <label>Khẩu phần (g)<input inputMode="decimal" type="number" min="1" max="3000" value={food.estimatedGrams ?? ""} onChange={(event) => updateFood(index, "estimatedGrams", event.target.value)} /></label>
          <small>Độ chắc chắn {Math.round(food.confidence * 100)}%</small>
          {analysis.foods.length > 1 ? <button className="meal-remove-food" type="button" aria-label={`Bỏ ${food.nameVi || `món ${index + 1}`}`} onClick={() => removeFood(index)}>Bỏ món</button> : null}
        </div>)}
        {analysis.foods.length < 8 ? <button className="meal-add-food" type="button" onClick={addFood}>Thêm món còn thiếu</button> : null}
        {analysis.needsUserConfirmation.length ? <ul className="meal-questions">{analysis.needsUserConfirmation.map((question) => <li key={question}>{question}</li>)}</ul> : null}
        {hasMealSafetyConcern(risks) ? <p className="meal-risk">Món này cần kiểm tra độ chín hoặc tiệt trùng, loại cá và thành phần trước khi dùng.</p> : null}
        <button className="health-save" type="button" disabled={status === "saving" || hasInvalidFood(analysis)} onClick={() => void confirm()}>{status === "saving" ? "Đang lưu…" : "Lưu bữa này"}</button>
      </div> : null}

      <details className="meal-dashboard" aria-labelledby="meal-dashboard-title">
        <summary className="meal-dashboard-summary">
          <span><p className="panel-kicker">Từ những bữa đã ghi</p><h3 id="meal-dashboard-title">Nhìn lại dinh dưỡng</h3></span>
          <span><small>{historyLoading ? "Đang tải" : `${history.length} bữa`}</small><i aria-hidden="true">⌄</i></span>
        </summary>
        <div className="meal-dashboard-body">
          <div className="meal-dashboard-head">
            <small>Khoảng thời gian</small>
          <div className="meal-range" role="group" aria-label="Khoảng thời gian">
            {[7, 28].map((days) => <button key={days} type="button" aria-pressed={range === days} onClick={() => setRange(days as 7 | 28)}>{days} ngày</button>)}
          </div>
          </div>

        {historyLoading ? <p className="meal-empty" aria-live="polite">Đang mở sổ bữa ăn…</p>
          : history.length === 0 ? <p className="meal-empty">Chưa có bữa nào trong khoảng này. Chụp món đầu tiên để bắt đầu.</p>
            : <>
              <div className="meal-summary-row">
                <span><b>{history.length}</b><small>bữa đã lưu</small></span>
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

              <div className="meal-history-list">
                <h4>Lịch sử từng bữa</h4>
                {history.map((entry) => <details className="meal-history-card" key={entry.id}>
                  <summary>
                    <span><b>{labels[entry.mealType] ?? "Bữa ăn"}</b><small>{mealDate(entry.eatenAt)}</small></span>
                    <span><b>{entry.analysis.foods.map((food) => food.nameVi).join(", ") || entry.note || "Ghi chú bữa ăn"}</b>
                      <small>{entry.status === "processing" ? "Đã lưu · đang bổ sung dinh dưỡng"
                        : entry.analysis.entryMode === "note" ? "Chỉ có ghi chú"
                        : entry.analysis.nutrition?.calorieRange ? `${Math.round(entry.analysis.nutrition.calorieRange.low)}–${Math.round(entry.analysis.nutrition.calorieRange.high)} kcal`
                          : "Đang bổ sung dinh dưỡng"}</small></span>
                  </summary>
                  <div className="meal-history-detail">
                    {historyEditor?.id === entry.id ? <div className="meal-history-editor">
                      {historyEditor.analysis.foods.map((food, index) => <div className="meal-food-row" key={index}>
                        <label>Sửa tên món<input maxLength={80} value={food.nameVi} onChange={(event) => updateSavedFood(index, "nameVi", event.target.value)} /></label>
                        <label>Sửa khẩu phần (g)<input type="number" inputMode="decimal" min="1" max="3000" value={food.estimatedGrams ?? ""} onChange={(event) => updateSavedFood(index, "estimatedGrams", event.target.value)} /></label>
                        {historyEditor.analysis.foods.length > 1 ? <button className="meal-remove-food" type="button" aria-label={`Bỏ ${food.nameVi || `món ${index + 1}`}`} onClick={() => removeSavedFood(index)}>Bỏ món</button> : null}
                      </div>)}
                      {historyEditor.analysis.foods.length < 8 ? <button className="meal-add-food" type="button" onClick={addSavedFood}>Thêm món vào bữa đã lưu</button> : null}
                      <label className="meal-note">Sửa ghi chú<textarea maxLength={300} rows={2} value={historyEditor.note} onChange={(event) => setHistoryEditor((current) => current ? { ...current, note: event.target.value } : current)} /></label>
                      {historyMessage ? <p className="meal-state is-error" aria-live="polite">{historyMessage}</p> : null}
                      <div className="meal-edit-actions">
                        <button type="button" onClick={() => setHistoryEditor(null)}>Hủy</button>
                        <button className="health-save" type="button" disabled={historySaving || hasInvalidFood(historyEditor.analysis)} onClick={() => void saveHistoryEdit()}>{historySaving ? "Đang lưu…" : "Lưu thay đổi"}</button>
                      </div>
                    </div> : <>
                      {entry.note ? <p>{entry.note}</p> : null}
                      <ul>{entry.analysis.foods.map((food, index) => <li key={`${entry.id}-${index}`}>{food.nameVi}{food.estimatedGrams ? ` · ${food.estimatedGrams} g` : ""}</li>)}</ul>
                      {hasMealSafetyConcern(entry.analysis.foods.flatMap((food) => [
                        ...food.safetyFlags, ...deriveMealSafetyFlags(food.nameVi)
                      ])) ? <p className="meal-risk">Món này cần kiểm tra độ chín hoặc tiệt trùng, loại cá và thành phần trước khi dùng.</p> : null}
                      <small>{entry.analysis.nutrition?.notice ?? entry.analysis.estimateNotice}</small>
                      {entry.status === "ready" && entry.analysis.foods.length ? <button className="meal-edit-saved" type="button" onClick={() => editSavedMeal(entry)}>Sửa bữa này</button> : null}
                    </>}
                  </div>
                </details>)}
              </div>
            </>}
          <small className="meal-safety-note">Không tự kết luận thiếu chất hoặc tự đề nghị uống thêm vi chất.</small>
        </div>
      </details>
    </section>
  );
}
