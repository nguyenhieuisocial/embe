import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PregnancyCareTracker from "../src/components/pregnancy-care-tracker";

describe("iPhone health connection state", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not claim Health permission is enough when the iPhone has never sent data", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/pregnancy/care")) return new Response(JSON.stringify({ snapshot: {
        profile: null, plans: [], iphone_health: null,
        iphone_devices: [{ id: "device-1", label: "iPhone của Mẹ Ngân", active: true, last_synced_at: null }]
      } }), { status: 200 });
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    }));

    render(<PregnancyCareTracker pregnancyWeek={8} />);

    await waitFor(() => expect(screen.getByText("Đã tạo điểm nhận, iPhone chưa gửi dữ liệu")).toBeInTheDocument());
    expect(screen.queryByText("Cần cấp quyền một lần trên iPhone")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo kết nối mới" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở Phím tắt" })).toHaveAttribute("href", "shortcuts://");
  });

  it("shows all available iPhone health groups with per-metric sync time", async () => {
    const latest = { day: "2026-09-01", height_cm: 160, steps: 5200, distance_m: 4100,
      resting_heart_rate_bpm: 68, respiratory_rate: 15.2, oxygen_saturation_percent: 98,
      body_temperature_c: 36.7, wrist_temperature_c: 36.4, hrv_ms: 42, exercise_minutes: 28,
      mindfulness_minutes: 10, active_energy_kcal: 320, resting_energy_kcal: 1350,
      sleep_minutes: 450, weight_kg: 53.2, water_ml: 1800, systolic: 112, diastolic: 72,
      metric_synced_at: { heightCm: "2026-09-01T08:00:00Z", steps: "2026-09-01T08:00:00Z" }, updated_at: "2026-09-01T08:00:00Z" };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/pregnancy/care")) return Response.json({ snapshot: {
        profile: null, plans: [], iphone_health: latest, iphone_devices: [{ id: "device-1", label: "iPhone", active: true, last_synced_at: "2026-09-01T08:00:00Z" }],
        iphone_health_history: url.includes("days=0") ? [] : [latest]
      } });
      return Response.json({ history: [] });
    }));

    render(<PregnancyCareTracker pregnancyWeek={8} />);

    await waitFor(() => expect(screen.getByText("160 cm")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Xem đầy đủ và lịch sử"));
    await waitFor(() => expect(screen.getByText("4,1 km")).toBeInTheDocument());
    expect(screen.getByText("4,1 km")).toBeInTheDocument();
    expect(screen.getByText("112/72")).toBeInTheDocument();
    expect(screen.getAllByText(/đồng bộ/iu).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Lịch sử" })).toBeInTheDocument();
  });

  it("switches the private aggregate history between 7 and 30 days", async () => {
    const history = Array.from({ length: 8 }, (_, index) => ({
      day: `2026-08-${String(24 + index).padStart(2, "0")}`,
      steps: index === 0 ? 1111 : 5000 + index,
      sleep_minutes: 420,
      weight_kg: 53,
      updated_at: "2026-09-01T08:00:00Z"
    }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/pregnancy/care")) return Response.json({ snapshot: {
        profile: null, plans: [], iphone_health: history.at(-1), iphone_devices: [],
        iphone_health_history: url.includes("days=0") ? [] : history
      } });
      return Response.json({ history: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PregnancyCareTracker pregnancyWeek={8} />);

    await waitFor(() => expect(screen.getByText("5.007")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Xem đầy đủ và lịch sử"));
    await waitFor(() => expect(screen.getByText("5.007 bước")).toBeInTheDocument());
    expect(screen.queryByText("1.111 bước")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "30 ngày" }));
    expect(screen.getByText("1.111 bước")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("days=30"), { cache: "no-store" });
  });

  it("captures one reminder time for every planned daily dose", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/pregnancy/care") && init?.method === "PATCH") {
        return Response.json({ snapshot: { profile: null, plans: [], iphone_health: null, iphone_health_history: [], iphone_devices: [] } });
      }
      if (String(input).startsWith("/api/pregnancy/care")) {
        return Response.json({ snapshot: { profile: null, plans: [], iphone_health: null, iphone_health_history: [], iphone_devices: [] } });
      }
      return Response.json({ history: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PregnancyCareTracker pregnancyWeek={8} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Thêm thuốc hoặc vi chất" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ Thêm thuốc hoặc vi chất" }));
    fireEvent.change(screen.getByLabelText("Tên"), { target: { value: "Viên theo đơn" } });
    fireEvent.change(screen.getByLabelText("Liều ghi trên nhãn/đơn"), { target: { value: "1 viên" } });
    fireEvent.change(screen.getByLabelText("Số lần mỗi ngày"), { target: { value: "2" } });
    const times = screen.getAllByLabelText(/Giờ nhắc lần/);
    expect(times).toHaveLength(2);
    fireEvent.change(times[0], { target: { value: "08:00" } });
    fireEvent.change(times[1], { target: { value: "20:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu kế hoạch" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/pregnancy/care", expect.objectContaining({
      method: "PATCH",
      body: expect.stringContaining('"reminderTimes":["08:00","20:00"]')
    })));
  });

  it("shows daily progress and saved adherence history without suggesting a dose", async () => {
    const careSnapshot = {
      profile: null, iphone_health: null, iphone_health_history: [], iphone_devices: [],
      plans: [{ id: "11111111-1111-4111-8111-111111111111", category: "supplement", name: "Prenatal theo đơn",
        dose_display: "1 viên", times_per_day: 1, reminder_times: ["08:00:00"], instructions: "Sau ăn",
        nutrient_amounts: {}, confirmed_by_clinician: true, active: true, taken_slots: [],
        dose_states: [{ slot: 1, status: "deferred", reason: "Đợi sau ăn", recorded_at: "2026-09-01T01:00:00Z" }] },
        { id: "22222222-2222-4222-8222-222222222222", category: "medicine", name: "Thuốc A",
          dose_display: "Theo đơn", times_per_day: 1, reminder_times: ["20:00:00"], instructions: "",
          nutrient_amounts: {}, confirmed_by_clinician: true, active: false, taken_slots: [], dose_states: [] }],
      adherence_history: [{ plan_id: "11111111-1111-4111-8111-111111111111", plan_name: "Prenatal theo đơn",
        day: "2026-08-31", slot: 1, status: "skipped", reason: "Buồn nôn", recorded_at: "2026-08-31T01:00:00Z" }]
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/pregnancy/care")) return Response.json({ snapshot: careSnapshot });
      return Response.json({ history: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PregnancyCareTracker pregnancyWeek={8} />);
    await waitFor(() => expect(screen.getByText(/0\/1 đã uống · 0 bỏ qua · 1 hoãn/i)).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Lịch sử tuân thủ" })).toBeInTheDocument();
    expect(screen.getByText(/Bỏ qua · Buồn nôn/i)).toBeInTheDocument();
    expect(screen.queryByText(/liều khuyến nghị|nên uống/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Trạng thái Prenatal theo đơn lần 1"), { target: { value: "taken" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu lần 1" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/pregnancy/care", expect.objectContaining({
      method: "PATCH", body: expect.stringContaining('"status":"taken"')
    })));
    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng Prenatal theo đơn" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/pregnancy/care", expect.objectContaining({
      body: expect.stringContaining('"action":"planState"')
    })));
    fireEvent.click(screen.getByRole("button", { name: "Kích hoạt Thuốc A" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/pregnancy/care", expect.objectContaining({
      body: expect.stringContaining('"active":true')
    })));
  });
});
