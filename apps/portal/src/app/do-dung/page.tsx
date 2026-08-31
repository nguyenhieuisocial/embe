"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

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

export default function InventoryPage() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ items: [], pending: 0 });
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async (preserveMessage = false) => {
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
      if (!response.ok) throw new Error("inventory unavailable");
      setSnapshot(await response.json() as Snapshot);
      if (!preserveMessage) setScreenState("ready");
    } catch {
      setScreenState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="EmBe — về trang gia đình">EmBe</a>
        <p className="privacy-note"><span aria-hidden="true">●</span> Tồn kho riêng của gia đình</p>
      </header>

      <section className="inventory-hero">
        <div>
          <p className="eyebrow">BỈM · SỮA · VẬT TƯ</p>
          <h1>Đồ dùng trong nhà</h1>
          <p className="intro">Nhìn một lần là biết món nào sắp hết. Mỗi lần mua hoặc dùng chỉ cần chạm một nút.</p>
        </div>
        <button className="inventory-add" type="button" onClick={() => setShowForm((value) => !value)}>
          {showForm ? "Đóng" : "Thêm đồ dùng"}
        </button>
      </section>

      {showForm ? (
        <form className="inventory-form" onSubmit={createItem}>
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
      {snapshot.items.length === 0 && screenState !== "loading" ? (
        <section className="inventory-empty">
          <span aria-hidden="true">◌</span>
          <h2>Chưa có đồ dùng nào</h2>
          <p>Thêm món đầu tiên để EmBe bắt đầu nhắc khi sắp hết.</p>
          <button type="button" onClick={() => setShowForm(true)}>Thêm đồ dùng đầu tiên</button>
        </section>
      ) : (
        <section className="inventory-list" aria-label="Danh sách đồ dùng">
          {snapshot.items.map((item) => (
            <article className={`inventory-card${item.needsRestock ? " is-low" : ""}`} key={item.productId}>
              <div className="inventory-card-top">
                <div><p>{item.needsRestock ? "SẮP HẾT" : "ĐANG ĐỦ"}</p><h2>{item.name}</h2></div>
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
      )}

      {screenState === "saved" ? <p className="inventory-status is-success" role="status">Đã ghi nhận · hệ thống đang cập nhật</p> : null}
      {snapshot.pending > 0 ? <p className="inventory-status" role="status">Có {snapshot.pending} thay đổi đang được xử lý.</p> : null}
      {screenState === "error" ? <p className="inventory-status is-error" role="alert">Chưa cập nhật được. Hãy chạm thử lại khi có mạng.</p> : null}
      <aside className="inventory-boundary"><strong>EmBe chỉ nhắc, không tự mua</strong><p>Mọi quyết định mua hàng vẫn do gia đình xác nhận.</p></aside>
    </main>
  );
}
