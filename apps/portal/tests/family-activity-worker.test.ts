import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("public/sw.js", "utf8");
const deviceId = "33333333-3333-4333-8333-333333333333";
function worker() {
  const events: Record<string, (event: any) => void> = {};
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  const postMessage = vi.fn(); const showNotification = vi.fn();
  const context = createContext({ fetch: fetchMock, URL, Response, crypto: { randomUUID },
    caches: { open: async () => ({ match: async () => new Response(deviceId) }) },
    self: { location: { origin: "https://embe.hieu.asia" }, addEventListener: (name: string, handler: any) => { events[name] = handler; },
      registration: { pushManager: { getSubscription: async () => null }, showNotification },
      clients: { matchAll: async () => [{ postMessage }] } } });
  runInContext(source, context);
  return { context, events, fetchMock, postMessage, showNotification };
}
describe("family activity service worker", () => {
  it("retains mutation verbs and distinct records without reading private request bodies", async () => {
    const { context, fetchMock } = worker();
    const otherId = "44444444-4444-4444-8444-444444444444";
    await runInContext(`reportFamilyActivity('/api/pregnancy/records/${deviceId}','medical','DELETE',200,null)`, context);
    await runInContext(`reportFamilyActivity('/api/pregnancy/records/${otherId}','medical','DELETE',200,null)`, context);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const report = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(report.method).toBe("DELETE");
    expect(Object.keys(report).sort()).toEqual(["eventId", "sourceDeviceId", "sourceEndpoint", "pathname", "method", "responseStatus", "resourceId"].sort());
  });
  it("does not announce failed mutations or pending OCR", async () => {
    const { context, events, fetchMock } = worker();
    await runInContext(`reportFamilyActivity('/api/pregnancy/documents/${deviceId}/scan','medical','POST',202,null)`, context);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    let done: Promise<unknown> = Promise.resolve(); const respondWith = vi.fn();
    events.fetch({ request: { url: "https://embe.hieu.asia/api/pregnancy/records", method: "POST" },
      respondWith, waitUntil: (promise: Promise<unknown>) => { done = promise; } });
    await done;
    expect(respondWith).toHaveBeenCalledOnce(); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("passes the actual push body and stable event id to the open app", async () => {
    const { events, postMessage, showNotification } = worker();
    let done: Promise<unknown> = Promise.resolve();
    events.push({ data: { json: () => ({ title: "Mẹ Ngân đã cập nhật phiếu thu", body: "Mở EmBe để xem phiếu thu.",
      url: "/me-bau/ho-so", tag: `activity:${deviceId}` }) }, waitUntil: (promise: Promise<unknown>) => { done = promise; } });
    await done;
    expect(showNotification).toHaveBeenCalledWith("Mẹ Ngân đã cập nhật phiếu thu", expect.objectContaining({ body: "Mở EmBe để xem phiếu thu." }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ body: "Mở EmBe để xem phiếu thu.", id: deviceId }));
  });
});
