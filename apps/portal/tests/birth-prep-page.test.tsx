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

function initialFetch(contractionResponse = Response.json({ events: [] })) {
  return vi.fn()
    .mockResolvedValueOnce(Response.json(preparation))
    .mockResolvedValueOnce(contractionResponse);
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
  });

  it("keeps the local contraction history unchanged when the server cannot save", async () => {
    const fetchMock = initialFetch();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "temporarily_unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirthPrepPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Bắt đầu cơn gò" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu cơn gò" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Chưa lưu được cơn gò"));
    expect(screen.getByRole("button", { name: "Bắt đầu cơn gò" })).toBeInTheDocument();
    expect(screen.queryByText(/00:0\d/)).not.toBeInTheDocument();
  });

  it("confirms a saved plan without clearing the restored information", async () => {
    const fetchMock = initialFetch();
    fetchMock.mockResolvedValueOnce(Response.json({ ...preparation, hospitalName: "Bệnh viện mới" }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BirthPrepPage />);
    const hospital = await screen.findByLabelText("Nơi dự định sinh");
    fireEvent.change(hospital, { target: { value: "Bệnh viện mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu kế hoạch" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Đã lưu kế hoạch sinh"));
    expect(hospital).toHaveValue("Bệnh viện mới");
  });
});
