import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PregnancyMemories from "../src/components/pregnancy-memories";
import { pregnancyMemoryGroups } from "../src/lib/pregnancy-memories";
import { validMemberRecord, type MemberRecord } from "../src/lib/family-members";

vi.mock("../src/components/photo-composer", () => ({ default: () => <div>Tải ảnh hiện có</div> }));
const id = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const record: MemberRecord = { id: "33333333-3333-4333-8333-333333333333", memberId: id, kind: "development", title: "Một ngày bên con", notes: "Hôm nay vui", occurredAt: "2026-09-01T17:30:00Z", source: "", nextDueDate: null,
  metric: null, value: null, secondaryValue: null, unit: null, revision: 1, deleted: false, pregnancyMemory: { dueDate: "2027-03-01", week: 13, mediaIds: [imageId] } };
const photo = { id: imageId, eventAt: record.occurredAt, title: "Ảnh thử", caption: "Ảnh thử", mimeType: "image/jpeg", width: 800, height: 1200, reactions: {} };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function mockNetwork(initial: MemberRecord[] = [record], failSave = false) {
  let saved = initial;
  const writes: MemberRecord[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const value = JSON.parse(String(init.body)); writes.push(value);
      if (failSave) { failSave = false; throw new Error("response_lost"); }
      saved = [...saved.filter(r => r.id !== value.id), { ...value, revision: 1 }]; return Response.json({ record: saved.at(-1) });
    }
    if (url === "/api/family/members") return Response.json({ members: [{ id, role: "mother", archived: false }] });
    if (url === "/api/pregnancy/profile") return Response.json({ profile: { dueDate: "2027-03-01" } });
    if (url.startsWith(`/api/family/members/${id}/records`)) return Response.json({ records: saved.filter(r => r.deleted === url.includes("deleted=true")), nextOffset: null });
    return Response.json({ memories: [photo], hasMore: false });
  }));
  return writes;
}
describe("explicit weekly pregnancy memories", () => {
  it("groups the same week into one album but keeps separate pregnancies apart", () => {
    const later = { ...record, id: "44444444-4444-4444-8444-444444444444" };
    const groups = pregnancyMemoryGroups([record, later, { ...record, deleted: true }, { ...later, pregnancyMemory: { ...record.pregnancyMemory!, dueDate: "2028-03-01" } }]);
    expect(groups).toHaveLength(2);
    expect(groups[1].records).toHaveLength(2);
    expect(groups[1].mediaIds).toEqual([imageId]);
  });
  it("validates explicit selections, bounds weeks and rejects external URLs", () => {
    expect(validMemberRecord(record)).toBe(true);
    for (const pregnancyMemory of [{ ...record.pregnancyMemory, week: 50 }, { ...record.pregnancyMemory, mediaIds: ["https://example.org/a.jpg"] }, { ...record.pregnancyMemory, mediaIds: [imageId, imageId] }, { ...record.pregnancyMemory, dueDate: "2026-02-31" }]) expect(validMemberRecord({ ...record, pregnancyMemory })).toBe(false);
    expect(validMemberRecord({ ...record, kind: "medication" })).toBe(false);
  });
  it("shows a single week cover and links the Vietnamese date correctly", async () => {
    mockNetwork(); render(<PregnancyMemories />);
    expect(await screen.findByRole("button", { name: "Xem ảnh tuần 13" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Một ngày bên con · 1 ảnh"));
    expect(screen.getByRole("link", { name: "Xem ngày trên lịch" })).toHaveAttribute("href", "/lich?date=2026-09-02");
  });
  it("soft-deletes and restores only the selection without deleting source media", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const writes = mockNetwork(); render(<PregnancyMemories />);
    fireEvent.click(await screen.findByText("Một ngày bên con · 1 ảnh"));
    fireEvent.click(screen.getByRole("button", { name: "Xóa khỏi tuần" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Xem ảnh tuần 13" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Đã xóa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Khôi phục" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes.map(r => r.deleted)).toEqual([true, false]);
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });
  it("keeps the draft and its id when a save response is lost", async () => {
    const writes = mockNetwork([], true); render(<PregnancyMemories />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Thêm kỷ niệm theo tuần" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Thêm kỷ niệm theo tuần" }));
    fireEvent.click(await screen.findByRole("button", { name: "Chọn Ảnh thử" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu kỷ niệm" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Lưu kỷ niệm" })).toBeEnabled());
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Một tuần bên con");
    fireEvent.click(screen.getByRole("button", { name: "Lưu kỷ niệm" }));
    await waitFor(() => expect(screen.queryByLabelText("Tiêu đề")).not.toBeInTheDocument());
    expect(writes).toHaveLength(2); expect(writes[0]).toEqual(writes[1]);
  });

  it("auto-pages the photo picker without losing the draft or selecting new photos", async () => {
    let approachEnd: (() => void) | undefined;
    const roots: (Element | Document | null | undefined)[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      constructor(private callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { roots.push(options?.root); }
      observe(target: Element) {
        if (target.closest("[data-photo-scroll]")) approachEnd = () => this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      disconnect() {}
    });
    const writes = mockNetwork([]);
    const originalFetch = fetch;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/memories?")) return Response.json(url.includes("offset=1")
        ? { memories: [{ ...photo, id: "44444444-4444-4444-8444-444444444444", title: "Ảnh tiếp" }], hasMore: false }
        : { memories: [photo], hasMore: true });
      return originalFetch(url, init);
    }));
    render(<PregnancyMemories />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Thêm kỷ niệm theo tuần" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Thêm kỷ niệm theo tuần" }));
    fireEvent.click(await screen.findByRole("button", { name: "Chọn Ảnh thử" }));
    fireEvent.change(screen.getByLabelText("Tiêu đề"), { target: { value: "Mẹ muốn giữ ngày này" } });
    act(() => approachEnd?.());
    expect(await screen.findByRole("button", { name: "Chọn Ảnh tiếp" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Chọn Ảnh thử" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Mẹ muốn giữ ngày này");
    expect(roots).toContain(screen.getByRole("region", { name: "Ảnh để chọn vào tuần" }));
    expect(writes).toHaveLength(0);
  });
});
