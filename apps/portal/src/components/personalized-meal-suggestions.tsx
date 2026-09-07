"use client";

import { useMemo, useState, type FormEvent } from "react";
import { validFamilyMember, type FamilyMember } from "../lib/family-members";
import { FOOD_ALLERGENS, nutritionContextHash, personalizedMealMenus, recordedFoodAllergens, type NutritionContext } from "../lib/personalized-meal-menu";
import type { MealMenuHistory, MealType } from "../lib/pregnancy-menu";
import "./daily-care-tools.css";

export default function PersonalizedMealSuggestions({ meal, history, choose }: { meal: MealType; history: MealMenuHistory[]; choose: (menu: string) => void }) {
  const [member, setMember] = useState<FamilyMember | null>(null);
  const [context, setContext] = useState<NutritionContext | null>(null);
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  async function load() {
    setLoading(true); setError(""); setHash("");
    try {
      const responses = await Promise.all([fetch("/api/family/members", { cache: "no-store" }), fetch("/api/pregnancy/profile", { cache: "no-store" })]);
      if (responses.some(r => !r.ok)) throw new Error();
      const [people, pregnancy] = await Promise.all(responses.map(r => r.json()));
      const mother = people.members?.find((m: FamilyMember) => m.role === "mother");
      if (!validFamilyMember(mother) || typeof pregnancy.profile?.allergies !== "string" || typeof pregnancy.profile?.medicalNotes !== "string") throw new Error();
      const nextContext = { allergies: pregnancy.profile.allergies, medicalNotes: pregnancy.profile.medicalNotes, dueDate: pregnancy.profile.dueDate ?? null };
      const digest = await nutritionContextHash(mother, nextContext);
      setMember(mother); setContext(nextContext); setHash(digest); setDraft(mother.details);
      setEditing(mother.details.nutritionContextHash !== digest || mother.details.nutritionReviewed !== "Đã đối chiếu");
    } catch { setError("Chưa đọc được hồ sơ để lọc món. Thử lại khi có mạng; không dùng gợi ý chưa đối chiếu."); }
    finally { setLoading(false); }
  }
  const result = useMemo(() => member && context ? personalizedMealMenus(member, context, hash, meal, history) : null, [member, context, hash, meal, history]);
  function change(key: string, value: string) { setDraft(old => ({ ...old, [key]: value })); }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!member || !hash || saving) return;
    setSaving(true); setError("");
    try {
      const next = { ...member, details: { ...draft, nutritionReviewed: "Đã đối chiếu", nutritionContextHash: hash } };
      const response = await fetch("/api/family/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      if (response.status === 409) { setHash(""); throw new Error("Hồ sơ vừa được sửa trên điện thoại khác. Hủy thay đổi để tải lại trước khi lưu."); }
      if (!response.ok) throw new Error("Chưa lưu được bộ lọc. Nội dung vẫn còn để thử lại.");
      const data = await response.json(); if (!validFamilyMember(data.member)) throw new Error("Chưa xác nhận được bản lưu.");
      setMember(data.member); setDraft(data.member.details); setEditing(false);
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }
  return <details className="care-inline" onToggle={e => { if (e.currentTarget.open && !loading && !saving && !editing) void load(); }}>
    <summary>Gợi ý món riêng cho Mẹ</summary>
    {loading ? <p role="status">Đang đối chiếu hồ sơ…</p> : null}
    {error ? <p role="alert">{error} {!editing ? <button type="button" onClick={() => void load()}>Thử lại</button> : null}</p> : null}
    {member && context && !loading ? <>
      {editing ? <form onSubmit={save} className="care-inline-form"><fieldset disabled={saving}>
        <legend>Dị ứng & cách ăn của Mẹ</legend>
        {[context.allergies, member.details.allergies, member.details.diet].filter(Boolean).length ? <p>Đã ghi trong hồ sơ: {[context.allergies, member.details.allergies, member.details.diet].filter(Boolean).join("; ")}. Đối chiếu với các ô bên dưới.</p> : null}
        {recordedFoodAllergens(member, context).length ? <p>Luôn lọc thêm theo hồ sơ: {recordedFoodAllergens(member, context).map(code => FOOD_ALLERGENS[code]).join(", ")}. Nếu ghi sai, sửa thông tin dị ứng trong hồ sơ trước.</p> : null}
        <div className="care-inline-checks">{Object.entries(FOOD_ALLERGENS).map(([code, label]) => <label key={code}><input type="checkbox" checked={(draft.foodAllergenCodes ?? "").split(",").includes(code)} onChange={e => {
          const selected = new Set((draft.foodAllergenCodes ?? "").split(",").filter(Boolean));
          if (e.target.checked) selected.add(code); else selected.delete(code); change("foodAllergenCodes", [...selected].sort().join(","));
        }} />{label}</label>)}</div>
        <label>Món / nguyên liệu khác cần tránh<textarea rows={2} maxLength={1000} value={draft.foodAvoidTerms ?? ""} onChange={e => change("foodAvoidTerms", e.target.value)} placeholder="Mỗi mục một dòng; ví dụ: bí đỏ" /></label>
        <label>Cách ăn<select value={draft.nutritionDietPattern ?? "Ăn đa dạng"} onChange={e => change("nutritionDietPattern", e.target.value)}><option>Ăn đa dạng</option><option>Chay có trứng / sữa</option><option>Thuần chay</option></select></label>
        <label>Có chế độ ăn riêng do bác sĩ chỉ định?<select required value={draft.nutritionSpecialDiet ?? ""} onChange={e => change("nutritionSpecialDiet", e.target.value)}><option value="">Chọn sau khi đối chiếu</option><option>Không</option><option>Có</option></select></label>
        <label>Lời dặn về ăn uống<textarea rows={2} maxLength={1000} value={draft.nutritionClinicianPlan ?? ""} onChange={e => change("nutritionClinicianPlan", e.target.value)} placeholder="Chép lại lời dặn, không dùng ô này để tự đổi thuốc hoặc liều." /></label>
        <label className="care-check"><input type="checkbox" required />Tôi đã đối chiếu dị ứng, món cần tránh và lời dặn đang áp dụng.</label>
      </fieldset><div className="care-inline-actions"><button type="submit" disabled={saving || !hash}>{saving ? "Đang lưu…" : "Lưu bộ lọc"}</button><button type="button" disabled={saving} onClick={() => { setEditing(false); void load(); }}>Hủy thay đổi</button></div></form> : <>
        <div className="care-menu-list">{result?.menus.map(menu => <button type="button" key={menu.title} onClick={() => choose(menu.title)}><strong>{menu.title}</strong><small>{menu.reason}</small></button>)}</div>
        <p>{result?.notice}</p><button type="button" onClick={() => setEditing(true)}>Sửa dị ứng & chế độ ăn</button>
        {member.details.nutritionClinicianPlan ? <p>Lời dặn đã lưu: {member.details.nutritionClinicianPlan}</p> : null}
      </>}
    </> : null}
  </details>;
}
