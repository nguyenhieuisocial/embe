"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

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
type ScreenState = "loading" | "ready" | "saving" | "saved" | "error" | "sync-error";

const units = ["cái", "gói", "hộp", "ml", "g"] as const;
const INVENTORY_CACHE_KEY = "embe:inventory:last-snapshot";
const INVENTORY_PENDING_KEY = "embe:inventory:pending-amounts";
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

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

function pendingAmounts(value: string | null, now = Date.now()): Map<number, number> {
  if (!value) return new Map();
  try {
    const parsed = JSON.parse(value) as { savedAt?: string; amounts?: unknown[] };
    const savedAt = typeof parsed.savedAt === "string" ? Date.parse(parsed.savedAt) : Number.NaN;
    if (!Number.isFinite(savedAt) || now - savedAt > PENDING_MAX_AGE_MS || !Array.isArray(parsed.amounts)) return new Map();
    const entries = parsed.amounts.filter((entry): entry is [number, number] => Array.isArray(entry)
      && Number.isInteger(entry[0]) && entry[0] > 0
      && typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0 && entry[1] <= 100_000);
    return new Map(entries.slice(0, 500));
  } catch { return new Map(); }
}

function storePendingAmounts(amounts: Map<number, number>) {
  try {
    if (!amounts.size) localStorage.removeItem(INVENTORY_PENDING_KEY);
    else localStorage.setItem(INVENTORY_PENDING_KEY, JSON.stringify({
      savedAt: new Date().toISOString(), amounts: Array.from(amounts.entries())
    }));
  } catch { /* Pending display state is optional; the server queue remains authoritative. */ }
}

function storeSnapshot(snapshot: Snapshot) {
  try {
    localStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify({ snapshot, savedAt: new Date().toISOString() }));
  } catch { /* Cache is optional. */ }
}

export default function InventoryPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ items: [], pending: 0 });
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [showForm, setShowForm] = useState(false);
  const [cachedAt, setCachedAt] = useState("");
  const loadingRef = useRef(false);
  const optimisticAmountsRef = useRef(new Map<number, number>());

  const load = useCallback(async (preserveMessage = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error("inventory unavailable");
      const next = await response.json() as Snapshot;
      let reconciliationFailed = false;
      if (optimisticAmountsRef.current.size) {
        const remaining = new Map<number, number>();
        for (const [productId, amount] of optimisticAmountsRef.current) {
          const item = next.items.find((candidate) => candidate.productId === productId);
          if (item?.quantity === amount) continue;
          if (next.pending > 0 && item) {
            item.quantity = amount;
            item.needsRestock = amount <= item.minQuantity;
            remaining.set(productId, amount);
          } else {
            reconciliationFailed = true;
          }
        }
        optimisticAmountsRef.current = remaining;
        storePendingAmounts(remaining);
      }
      setSnapshot(next);
      setCachedAt("");
      storeSnapshot(next);
      if (reconciliationFailed) setScreenState("sync-error");
      else if (!preserveMessage) setScreenState("ready");
    } catch {
      setScreenState("error");
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    optimisticAmountsRef.current = pendingAmounts(localStorage.getItem(INVENTORY_PENDING_KEY));
    const cached = cachedSnapshot(localStorage.getItem(INVENTORY_CACHE_KEY));
    if (cached) {
      setSnapshot(cached.snapshot);
      setCachedAt(cached.savedAt);
    }
    void load();
  }, [load]);

  useEffect(() => {
    if (snapshot.pending < 1) return;
    const timer = window.setInterval(() => { void load(true); }, 3000);
    return () => window.clearInterval(timer);
  }, [load, snapshot.pending]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("them") === "1") setShowForm(true);
  }, []);

  async function submitAction(body: Record<string, unknown>) {
    const productId = body.action === "set_amount" && Number.isInteger(body.productId) ? Number(body.productId) : null;
    const amount = productId !== null && typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : null;
    const previousSnapshot = snapshot;
    const previousOptimisticAmounts = new Map(optimisticAmountsRef.current);
    if (productId !== null && amount !== null) {
      optimisticAmountsRef.current.set(productId, amount);
      storePendingAmounts(optimisticAmountsRef.current);
      setSnapshot((current) => ({
        pending: Math.max(1, current.pending),
        items: current.items.map((item) => item.productId === productId
          ? { ...item, quantity: amount, needsRestock: amount <= item.minQuantity }
          : item)
      }));
    }
    setScreenState("saving");
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, idempotencyKey: crypto.randomUUID() })
      });
      if (!response.ok) throw new Error("inventory action unavailable");
      await load(true);
      setScreenState((current) => current === "sync-error" ? current : "saved");
      return true;
    } catch {
      optimisticAmountsRef.current = previousOptimisticAmounts;
      storePendingAmounts(previousOptimisticAmounts);
      setSnapshot(previousSnapshot);
      storeSnapshot(previousSnapshot);
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
      {snapshot.items.length === 0 && snapshot.pending > 0 ? (
        <section className="inventory-empty" role="status">
          <span aria-hidden="true">…</span>
          <h2>Đang thêm đồ dùng</h2>
          <p>EmBe đã ghi nhận và sẽ hiện món mới ngay khi máy nhà xử lý xong.</p>
        </section>
      ) : null}
      {snapshot.items.length === 0 && snapshot.pending === 0 && screenState !== "loading" && screenState !== "error" ? (
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
      {screenState === "sync-error" ? <p className="inventory-status is-error" role="alert">Thay đổi chưa áp dụng được. EmBe đã trở về số lượng được lưu an toàn gần nhất.</p> : null}
      {screenState === "error" && snapshot.items.length > 0 ? <p className="inventory-status is-error" role="alert">
        Đang xem danh sách đã lưu {cachedAt ? <time dateTime={cachedAt}>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(cachedAt))}</time> : "gần nhất"}. Chạm thử lại khi có mạng.
      </p> : null}
      <aside className="inventory-boundary"><strong>EmBe chỉ nhắc, không tự đặt mua.</strong></aside>
      <Link className="inventory-budget-link" href="/ngan-sach">Mở ngân sách khám, sinh và đồ dùng →</Link>
    </main>
  );
}
