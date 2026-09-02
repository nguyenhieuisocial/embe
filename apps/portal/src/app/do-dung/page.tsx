"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import AppHeader from "../../components/app-header";

type InventoryItem = {
  productId: number;
  name: string;
  quantity: number;
  unit: string;
  minQuantity: number;
  needsRestock: boolean;
};

type Snapshot = { items: InventoryItem[]; pending: number };
type ScreenState = "loading" | "ready" | "saving" | "saved" | "error";

const units = ["cái", "gói", "hộp", "ml", "g"] as const;
const INVENTORY_CACHE_KEY = "embe:inventory:last-snapshot";

function cachedSnapshot(value: string | null): { snapshot: Snapshot; savedAt: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { snapshot?: Snapshot; savedAt?: string };
    if (!parsed.snapshot || !Array.isArray(parsed.snapshot.items) || typeof parsed.snapshot.pending !== "number"
      || typeof parsed.savedAt !== "string" || Number.isNaN(Date.parse(parsed.savedAt))) return null;
    const validItems = parsed.snapshot.items.every((item) => Number.isInteger(item.productId)
      && typeof item.name === "string" && typeof item.quantity === "number" && typeof item.unit === "string"
      && typeof item.minQuantity === "number" && typeof item.needsRestock === "boolean");
    return validItems ? { snapshot: parsed.snapshot, savedAt: parsed.savedAt } : null;
  } catch { return null; }
}

export default function InventoryPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ items: [], pending: 0 });
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [showForm, setShowForm] = useState(false);
  const [cachedAt, setCachedAt] = useState("");

  const load = useCallback(async (preserveMessage = false) => {
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error("inventory unavailable");
      const next = await response.json() as Snapshot;
      setSnapshot(next);
      setCachedAt("");
      try { localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify({ snapshot: next, savedAt: new Date().toISOString() })); } catch { /* Cache is optional. */ }
      if (!preserveMessage) setScreenState("ready");
    } catch {
      setScreenState("error");
    }
  }, []);

  useEffect(() => {
    const cached = cachedSnapshot(localStorage.getItem(INVENTORY_CACHE_KEY));
    if (cached) {
      setSnapshot(cached.snapshot);
      setCachedAt(cached.savedAt);
    }
    void load();
  }, [load]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("them") === "1") setShowForm(true);
  }, []);

  async function submitAction(body: Record<string, unknown>) {
    setScreenState("saving");
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() })
      });
      if (!response.ok) throw new Error("inventory action unavailable");
      setScreenState("saved");
      await load(true);
      return true;
    } catch {
      setScreenState("error");
      return false;
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const accepted = await submitAction({
      action: "create",
      name: String(form.get("name") ?? "").trim(),
      category: String(form.get("category") ?? "other"),
      unit: String(form.get("unit") ?? "cái"),
      amount: Number(form.get("amount")),
      minAmount: Number(form.get("minAmount"))
    });
    if (accepted) setShowForm(false);
  }

  const busy = screenState === "saving";
  return (
    <main className="inventory-main">
      <AppHeader note="Tồn kho riêng của gia đình" />

      <section className="inventory-hero">
        <div>
          <p className="eyebrow">Bỉm · sữa · vật tư</p>
          <h1>Đồ dùng trong nhà</h1>
          <p className="intro">Xem món sắp hết và cập nhật số lượng bằng một chạm.</p>
        </div>
        {snapshot.items.length > 0 || showForm ? (
          <button className="inventory-add" type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Đóng" : "Thêm đồ dùng"}
          </button>
        ) : null}
      </section>

      {showForm ? (
        <form className="inventory-form" id="them-do-dung" onSubmit={createItem}>
          <label>Tên đồ dùng<input name="name" maxLength={80} required placeholder="Ví dụ: Bỉm sơ sinh" /></label>
          <div className="inventory-form-row">
            <label>Nhóm<select name="category" defaultValue="baby"><option value="baby">Bỉm & vệ sinh</option><option value="nutrition">Sữa & dinh dưỡng</option><option value="mother">Đồ của mẹ</option><option value="other">Khác</option></select></label>
            <label>Đơn vị<select name="unit" defaultValue="cái">{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          </div>
          <div className="inventory-form-row">
            <label>Đang có<input name="amount" type="number" inputMode="decimal" min="0" max="100000" step="0.01" defaultValue="0" required /></label>
            <label>Nhắc khi còn<input name="minAmount" type="number" inputMode="decimal" min="0" max="100000" step="0.01" defaultValue="1" required /></label>
          </div>
          <button type="submit" disabled={busy}>{busy ? "Đang lưu…" : "Lưu đồ dùng"}</button>
        </form>
      ) : null}

      {screenState === "loading" ? <div className="inventory-loading" role="status">Đang xem lại đồ dùng…</div> : null}
      {snapshot.items.length === 0 && screenState === "error" ? (
        <section className="inventory-error" role="alert">
          <span aria-hidden="true">↺</span>
          <h2>Chưa cập nhật được đồ dùng</h2>
          <p>Có thể điện thoại đang mất mạng. Danh sách của gia đình vẫn an toàn.</p>
          <button type="button" onClick={() => { setScreenState("loading"); void load(); }}>Thử lại</button>
        </section>
      ) : null}
      {snapshot.items.length === 0 && screenState !== "loading" && screenState !== "error" ? (
        <section className="inventory-empty">
          <span aria-hidden="true">◌</span>
          <h2>Chưa có đồ dùng nào</h2>
          <p>Thêm món đầu tiên để EmBe bắt đầu nhắc khi sắp hết.</p>
          <button type="button" onClick={() => setShowForm(true)}>Thêm đồ dùng đầu tiên</button>
        </section>
      ) : null}
      {snapshot.items.length > 0 ? (
        <section className="inventory-list" aria-label="Danh sách đồ dùng">
          {snapshot.items.map((item) => (
            <article className={`inventory-card${item.needsRestock ? " is-low" : ""}`} key={item.productId}>
              <div className="inventory-card-top">
                <div><p>{item.needsRestock ? "Sắp hết" : "Đang đủ"}</p><h2>{item.name}</h2></div>
                <strong>{item.quantity.toLocaleString("vi-VN")} <small>{item.unit}</small></strong>
              </div>
              <p className="inventory-threshold">Nhắc khi còn {item.minQuantity.toLocaleString("vi-VN")} {item.unit}</p>
              <div className="inventory-actions">
                <button disabled={busy || item.quantity < 1} type="button" aria-label={`Đã dùng 1 ${item.name}`} onClick={() => submitAction({ action: "set_amount", productId: item.productId, amount: Math.max(0, item.quantity - 1) })}>− Đã dùng 1</button>
                <button disabled={busy} type="button" aria-label={`Mua thêm 1 ${item.name}`} onClick={() => submitAction({ action: "set_amount", productId: item.productId, amount: item.quantity + 1 })}>+ Mua thêm 1</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {screenState === "saved" ? <p className="inventory-status is-success" role="status">Đã cập nhật</p> : null}
      {snapshot.pending > 0 ? <p className="inventory-status" role="status">Có {snapshot.pending} thay đổi đang được xử lý.</p> : null}
      {screenState === "error" && snapshot.items.length > 0 ? <p className="inventory-status is-error" role="alert">
        Đang xem danh sách đã lưu {cachedAt ? <time dateTime={cachedAt}>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(cachedAt))}</time> : "gần nhất"}. Chạm thử lại khi có mạng.
      </p> : null}
      <aside className="inventory-boundary"><strong>EmBe chỉ nhắc, không tự đặt mua.</strong></aside>
      <a className="inventory-budget-link" href="/ngan-sach">Mở ngân sách khám, sinh và đồ dùng →</a>
    </main>
  );
}
