"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { MealAnalysis } from "../lib/meal-analysis-contract";
import { createMealDraft, waitForMealDraft, waitForMealNutrition } from "../lib/meal-photo-client";

const labels: Record<string, string> = { breakfast: "Sáng", lunch: "Trưa", dinner: "Tối", snack: "Bữa phụ" };

function defaultMealType(): string {
  const hour = new Date().getHours();
  return hour < 10 ? "breakfast" : hour < 15 ? "lunch" : hour < 21 ? "dinner" : "snack";
}

export default function MealPhotoTracker() {
  const [mealType, setMealType] = useState("lunch");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [entryId, setEntryId] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [loggedCalories, setLoggedCalories] = useState<{ low: number; high: number } | null>(null);
  const [loggedNutrients, setLoggedNutrients] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "analyzing" | "review" | "saving" | "saved" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMealType(defaultMealType()); void loadHistory(); }, []);

  async function loadHistory() {
    try {
      const response = await fetch("/api/meals?days=7", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { history?: Array<{ analysis?: MealAnalysis }>; suggestions?: string[] };
      setHistoryCount(payload.history?.length ?? 0); setSuggestions(payload.suggestions ?? []);
      const ranges = payload.history?.flatMap((entry) => entry.analysis?.nutrition?.calorieRange ? [entry.analysis.nutrition.calorieRange] : []) ?? [];
      setLoggedCalories(ranges.length ? {
        low: ranges.reduce((sum, range) => sum + range.low, 0),
        high: ranges.reduce((sum, range) => sum + range.high, 0)
      } : null);
      const nutrientTotals: Record<string, number> = {};
      for (const entry of payload.history ?? []) {
        for (const [key, value] of Object.entries(entry.analysis?.nutrition?.totals ?? {})) {
          nutrientTotals[key] = (nutrientTotals[key] ?? 0) + value;
        }
      }
      setLoggedNutrients(nutrientTotals);
    } catch { /* The capture flow remains available without a history summary. */ }
  }

  const risks = useMemo(() => new Set(analysis?.foods.flatMap((food) => food.safetyFlags) ?? []), [analysis]);

  async function analyze() {
    if (!file || status === "sending" || status === "analyzing") return;
    setStatus("sending"); setAnalysis(null);
    try {
      const id = await createMealDraft({ authorRole: "mother", file, mealType, note });
      setEntryId(id); setStatus("analyzing");
      const draft = await waitForMealDraft(id);
      setAnalysis(draft.analysis); setStatus("review");
    } catch { setStatus("error"); }
  }

  function updateFood(index: number, field: "nameVi" | "estimatedGrams", value: string) {
    setAnalysis((current) => current ? {
      ...current, foods: current.foods.map((food, itemIndex) => itemIndex === index
        ? { ...food, [field]: field === "estimatedGrams" ? (value ? Number(value) : null) : value }
        : food)
    } : current);
  }

  async function confirm() {
    if (!entryId || !analysis || status === "saving") return;
    setStatus("saving");
    try {
      const response = await fetch(`/api/meals/${entryId}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ analysis, note })
      });
      if (!response.ok) throw new Error("save_failed");
      setStatus("saved"); setFile(null); setAnalysis(null); setEntryId(""); setNote("");
      if (inputRef.current) inputRef.current.value = "";
      await loadHistory();
      void waitForMealNutrition(entryId).then(loadHistory);
    } catch { setStatus("error"); }
  }

  return (
    <section className="meal-tracker" id="bua-an" aria-labelledby="meal-title">
      <div className="section-heading-row">
        <div><p className="panel-kicker">CHỤP · XÁC NHẬN · LƯU</p><h2 id="meal-title">Nhật ký bữa ăn</h2></div>
        <p>Ảnh được nhận diện trên máy nhà. EmBe chỉ lưu kết quả sau khi Mẹ xác nhận.</p>
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
          <small>Ảnh sẽ được thu nhỏ và bỏ thông tin vị trí trước khi gửi.</small>
        </label>
        <label className="meal-note">Ghi chú giúp nhận diện đúng hơn
          <textarea maxLength={300} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ví dụ: cá hồi, nửa bát cơm, không có nước chấm" />
        </label>
        <button className="health-save" type="button" disabled={!file || status === "sending" || status === "analyzing"} onClick={() => void analyze()}>
          {status === "sending" ? "Đang gửi ảnh…" : status === "analyzing" ? "Đang nhận diện…" : "Nhận diện bữa ăn"}
        </button>
        <p className={`meal-state is-${status}`} aria-live="polite">
          {status === "analyzing" ? "Thường mất khoảng một phút. Có thể tiếp tục xem trang trong lúc chờ."
            : status === "saved" ? "Đã lưu món và khẩu phần. Số dinh dưỡng sẽ được tra từ nguồn chuẩn ở lượt nền tiếp theo."
              : status === "error" ? "Chưa nhận diện được. Ảnh chưa được ghi vào lịch sử; hãy thử lại khi máy nhà đang bật."
                : "Con số là khoảng ước lượng, không phải kết luận y tế."}
        </p>
      </div>

      {analysis ? <div className="meal-review" aria-label="Xác nhận kết quả nhận diện">
        <div><p className="panel-kicker">CẦN MẸ KIỂM TRA</p><h3>Máy nhìn thấy</h3></div>
        {analysis.foods.map((food, index) => <div className="meal-food-row" key={`${food.nameVi}-${index}`}>
          <label>Tên món<input value={food.nameVi} maxLength={80} onChange={(event) => updateFood(index, "nameVi", event.target.value)} /></label>
          <label>Khẩu phần (g)<input inputMode="decimal" type="number" min="1" max="3000" value={food.estimatedGrams ?? ""} onChange={(event) => updateFood(index, "estimatedGrams", event.target.value)} /></label>
          <small>Độ chắc chắn {Math.round(food.confidence * 100)}%</small>
        </div>)}
        {analysis.needsUserConfirmation.length ? <ul className="meal-questions">{analysis.needsUserConfirmation.map((question) => <li key={question}>{question}</li>)}</ul> : null}
        {risks.size ? <p className="meal-risk">Ảnh có điểm cần kiểm tra về độ chín, tiệt trùng hoặc loại cá. Không dùng ảnh để kết luận món đã an toàn.</p> : null}
        <button className="health-save" type="button" disabled={status === "saving"} onClick={() => void confirm()}>{status === "saving" ? "Đang lưu…" : "Đúng rồi, lưu bữa này"}</button>
      </div> : null}

      <aside className="meal-history-summary">
        <div><strong>{historyCount}</strong><span>bữa đã xác nhận trong 7 ngày</span></div>
        {loggedCalories ? <p><b>{Math.round(loggedCalories.low).toLocaleString("vi-VN")}–{Math.round(loggedCalories.high).toLocaleString("vi-VN")} kcal</b> từ riêng những bữa đã ghi, không phải mục tiêu cần đạt.</p> : null}
        {Object.keys(loggedNutrients).length ? <div className="meal-nutrients" aria-label="Dinh dưỡng ước lượng từ các bữa đã ghi">
          {([
            ["protein_g", "Đạm", "g"], ["fiber_g", "Chất xơ", "g"],
            ["calcium_mg", "Canxi", "mg"], ["iron_mg", "Sắt", "mg"], ["folate_ug", "Folate", "µg"]
          ] as const).flatMap(([key, label, unit]) => loggedNutrients[key] > 0
            ? [<span key={key}><b>{Math.round(loggedNutrients[key] * 10) / 10} {unit}</b><small>{label}</small></span>] : [])}
        </div> : null}
        <ul>{suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
        <small>Chỉ nhìn xu hướng của bữa đã ghi; không tự kết luận thiếu chất hoặc tự đề nghị uống thêm vi chất.</small>
      </aside>
    </section>
  );
}
