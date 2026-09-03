import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BirthPrepPage from "../src/app/chuan-bi-sinh/page";

const preparation = {
  hospitalName: "Bệnh viện gia đình",
  hospitalAddress: "123 Đường Bình An",
  hospitalPhone: "0909000001",
  supportPhone: "0909000002",
  preferences: "Da kề da nếu phù hợp",
  clinicianNotes: "Mang theo hồ sơ khám"
};

function initialFetch(
  contractionResponse = Response.json({ events: [] }),
  writeResponses: Response[] = []
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") {
      return writeResponses.shift() ?? Response.json({ ok: true });
    }
    const url = String(input);
    if (url === "/api/birth-prep") return Response.json(preparation);
    if (url === "/api/birth-prep/contractions") return contractionResponse;
    if (url === "/api/birth-prep/bag") return Response.json({ completed: [] });
    return Response.json({ error: "not_found" }, { status: 404 });
  });
}

describe("birth preparation page", () => {
  beforeEach(() => vi.stubGlobal("fetch", initialFetch()));
  afterEach(() => vi.unstubAllGlobals());

  it("restores the saved birth plan into every editable field", async () => {
    render(<BirthPrepPage />);

    await waitFor(() => expect(screen.getByLabelText("Nơi dự định sinh")).toHaveValue("Bệnh viện gia đình"));
    expect(screen.getByLabelText("Điện thoại nơi sinh")).toHaveValue("0909000001");
    expect(screen.getByLabelText("Địa chỉ")).toHaveValue("123 Đường Bình An");
    expect(screen.getByLabelText("Người hỗ trợ")).toHaveValue("0909000002");
    expect(screen.getByLabelText("Mong muốn cần trao đổi")).toHaveValue("Da kề da nếu phù hợp");
    expect(screen.getByLabelText("Dặn dò của bác sĩ")).toHaveValue("Mang theo hồ sơ khám");
    expect(screen.getByRole("heading", { name: "Giỏ đi sinh" })).toBeInTheDocument();
  });

  it("keeps the local contraction history unchanged when the server cannot save", async () => {
    const fetchMock = initialFetch(undefined, [Response.json({ error: "temporarily_unavailable" }, { status: 503 })]);
    vi.stubGlobal("fetch", fetchMock);

    render(<BirthPrepPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Bắt đầu cơn gò" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu cơn gò" }));

    await waitFor(() => expect(screen.getByText(/Chưa lưu được cơn gò/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Bắt đầu cơn gò" })).toBeInTheDocument();
    expect(screen.queryByText(/00:0\d/)).not.toBeInTheDocument();
  });

  it("confirms a saved plan without clearing the restored information", async () => {
    const fetchMock = initialFetch(undefined, [Response.json({ ...preparation, hospitalName: "Bệnh viện mới" })]);
    vi.stubGlobal("fetch", fetchMock);

    render(<BirthPrepPage />);
    const hospital = await screen.findByLabelText("Nơi dự định sinh");
    fireEvent.change(hospital, { target: { value: "Bệnh viện mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu kế hoạch" }));

    await waitFor(() => expect(screen.getByText("Đã lưu kế hoạch sinh.")).toBeInTheDocument());
    expect(hospital).toHaveValue("Bệnh viện mới");
  });

  it("summarizes recent contractions and keeps urgent contact guidance visible", async () => {
    vi.stubGlobal("fetch", initialFetch(Response.json({ events: [
      { id: "a", started_at: "2026-09-03T10:12:00.000Z", ended_at: "2026-09-03T10:13:00.000Z" },
      { id: "b", started_at: "2026-09-03T10:06:00.000Z", ended_at: "2026-09-03T10:07:10.000Z" },
      { id: "c", started_at: "2026-09-03T10:00:00.000Z", ended_at: "2026-09-03T10:01:05.000Z" }
    ] })));

    render(<BirthPrepPage />);

    expect(await screen.findByText("Nhịp gần đây")).toBeInTheDocument();
    expect(screen.getByText(/Trung bình 65 giây/)).toBeInTheDocument();
    expect(screen.getByText(/Ra máu nhiều/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gọi nơi sinh" })).toHaveAttribute("href", "tel:0909000001");
  });
});
