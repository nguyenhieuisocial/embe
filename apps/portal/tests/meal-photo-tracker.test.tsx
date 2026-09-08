import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { nutritionContextHash } from "../src/lib/personalized-meal-menu";
import type { FamilyMember } from "../src/lib/family-members";

import MealPhotoTracker, { looksLikeMedication } from "../src/components/meal-photo-tracker";

const mealClient = vi.hoisted(() => ({
  createMealDraft: vi.fn(), createMealNote: vi.fn(),
  waitForMealDraft: vi.fn(), waitForMealNutrition: vi.fn()
}));

vi.mock("../src/lib/meal-photo-client", () => ({
  ...mealClient
}));

const history = [{
  id: "11111111-1111-4111-8111-111111111111", mealType: "lunch", eatenAt: "2026-09-01T05:00:00Z", note: "ít cơm",
  hasImage: true,
  status: "processing" as const,
  analysis: {
    foods: [{ nameVi: "Cơm và rau", searchNameEn: "rice vegetables", estimatedGrams: 200,
      confidence: 0.8, foodGroups: ["starch", "vegetables"], safetyFlags: [] }],
    needsUserConfirmation: [], estimateNotice: "Ước lượng",
    nutrition: { status: "estimated", source: "USDA FoodData Central", totals: {
      calories: 260, protein_g: 12.4, carbs_g: 46.2, fat_g: 5.1, fiber_g: 4,
      calcium_mg: 88, iron_mg: 2.3, folate_ug: 74
    },
      calorieRange: { low: 210, mid: 260, high: 310 }, notice: "Ước lượng" }
  }
}];

async function reviewedMenu() {
  vi.stubGlobal("crypto", webcrypto);
  const member: FamilyMember = { id: "11111111-1111-4111-8111-111111111111", role: "mother", fullName: "Mẹ thử nghiệm", preferredName: "Mẹ",
    birthDate: null, sexAtBirth: "female", archived: false, revision: 1, details: { nutritionReviewed: "Đã đối chiếu", nutritionSpecialDiet: "Không" } };
  const profile = { allergies: "", medicalNotes: "", dueDate: null };
  member.details.nutritionContextHash = await nutritionContextHash(member, profile);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url === "/api/family/members" ? { members: [member] }
    : url === "/api/pregnancy/profile" ? { profile } : { history: [], suggestions: [], worker: { status: "online" } })));
}

describe("mobile meal journal", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("keeps a written draft when changing views and appends a suggested menu", async () => {
    await reviewedMenu();
    render(<MealPhotoTracker />);
    const note = screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh");
    fireEvent.change(note, { target: { value: "Một ly sữa" } });
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    expect(note).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ghi bữa" }));
    expect(note).toBeVisible();
    expect(note).toHaveValue("Một ly sữa");
    fireEvent.click(screen.getByText("Gợi ý món riêng cho Mẹ"));
    const choice = (await screen.findAllByText(/Phù hợp bộ lọc đã xác nhận/))[0].closest("button")!;
    const title = choice.querySelector("strong")!.textContent;
    fireEvent.click(choice);
    expect(note).toHaveValue(`Một ly sữa, ${title}`);
  });

  it("keeps added foods after removing the photo and can recognize them without a photo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ history: [], suggestions: [] })));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:preview"), revokeObjectURL: vi.fn() });
    mealClient.createMealNote.mockResolvedValue(history[0].id);
    mealClient.waitForMealDraft.mockResolvedValue({ analysis: { foods: [], needsUserConfirmation: [], estimateNotice: "Ước lượng" } });
    render(<MealPhotoTracker />);
    expect(screen.getByLabelText("Chụp bữa ăn")).toHaveAttribute("capture", "environment");
    expect(screen.getByLabelText("Chọn ảnh bữa ăn")).not.toHaveAttribute("capture");
    fireEvent.change(screen.getByLabelText("Chọn ảnh bữa ăn"), { target: { files: [new File(["image"], "meal.jpg", { type: "image/jpeg" })] } });
    fireEvent.change(screen.getByLabelText("Món thêm cùng ảnh"), { target: { value: "Canh bí đỏ" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm món cùng ảnh" }));
    fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh bữa ăn" }));
    expect(screen.getByRole("button", { name: "Bỏ món thêm Canh bí đỏ" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện từ ghi chú" }));
    expect(await screen.findByDisplayValue("Canh bí đỏ")).toBeVisible();
    expect(mealClient.createMealNote).toHaveBeenCalledWith(expect.objectContaining({ note: "Món thêm ngoài ảnh: Canh bí đỏ" }));
  });

  it("shows a retry instead of an empty history when the connection fails", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async () => fail ? new Response("", { status: 503 }) : Response.json({ history, suggestions: [] })));
    render(<MealPhotoTracker />);
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Chưa tải được lịch sử");
    expect(screen.queryByText("Chưa có bữa nào trong khoảng này.")).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    expect(await screen.findByText("Cơm và rau")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("routes medicine-like notes away from meals until the mother explicitly continues", async () => {
    expect(looksLikeMedication("Uống vitamin D 1 viên")).toBe(true);
    expect(looksLikeMedication("Rau giàu sắt và thịt bò")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));
    mealClient.createMealNote.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({ note: "Uống vitamin D 1 viên", analysis: {
      entryMode: "note", foods: [], needsUserConfirmation: [], estimateNotice: "Cần Mẹ kiểm tra."
    } });

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh"), {
      target: { value: "Uống vitamin D 1 viên" }
    });

    expect(screen.getByRole("link", { name: "Lưu thuốc / vi chất tự mua" })).toHaveAttribute(
      "href", "/me-bau/suc-khoe-iphone?quick=self-purchased#vi-chat-thuoc"
    );
    const recognize = screen.getByRole("button", { name: "Nhận diện từ ghi chú" });
    expect(recognize).toBeDisabled();
    expect(mealClient.createMealNote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Vẫn ghi là bữa ăn" }));
    expect(recognize).toBeEnabled();
    fireEvent.click(recognize);
    await waitFor(() => expect(mealClient.createMealNote).toHaveBeenCalledOnce());
  });

  it("keeps an explicit prescription in the medical-record flow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ history: [], suggestions: [], worker: { status: "online" } })));
    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh"), {
      target: { value: "Đơn thuốc bác sĩ kê hôm nay" }
    });
    expect(screen.getByRole("link", { name: "Lưu đơn thuốc" })).toHaveAttribute(
      "href", "/me-bau/ho-so?quick=prescription#ho-so-kham"
    );
  });

  it("shows worker availability, charts and full meal details for 7 or 28 days", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      history: history.map(entry => ({ ...entry, eatenAt: new Date().toISOString() })),
      suggestions: ["Các bữa đã ghi có rau."], worker: { status: "offline" }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    render(<MealPhotoTracker />);
    expect(await screen.findByText("Máy nhà đang tắt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ghi bữa" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Năng lượng theo ngày" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dinh dưỡng" }));
    expect(screen.getByRole("heading", { name: "Năng lượng theo ngày" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Nhóm thực phẩm xuất hiện" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "28 ngày" }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(
      "/api/meals?days=28",
      expect.objectContaining({ cache: "no-store", credentials: "same-origin" })
    ));
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    expect(screen.getByRole("heading", { name: "Lịch sử từng bữa" })).toBeVisible();
    fireEvent.click(screen.getByText("Cơm và rau"));
    expect(screen.getByRole("img", { name: "Ảnh bữa trưa" })).toHaveAttribute(
      "src", "/api/meals/11111111-1111-4111-8111-111111111111/image"
    );
    expect(screen.getByText("ít cơm")).toBeInTheDocument();
    expect(screen.getByText("Đã lưu · đang bổ sung dinh dưỡng")).toBeInTheDocument();
    const mealNutrition = screen.getByLabelText("Dinh dưỡng ước lượng của bữa trưa");
    expect(within(mealNutrition).getByText("Đạm")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("12,4 g")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("Tinh bột")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("46,2 g")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("Chất béo")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("5,1 g")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("Chất xơ")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("Canxi")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("Sắt")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("Folate")).toBeInTheDocument();
    expect(within(mealNutrition).getByText("Nguồn: USDA FoodData Central")).toBeInTheDocument();
  });

  it("shows useful macros beside calories before the saved meal is opened", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [{ ...history[0], status: "ready" }], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));

    render(<MealPhotoTracker />);

    expect(await screen.findByText("210–310 kcal · Đạm 12,4 g · Tinh bột 46,2 g")).toBeInTheDocument();
  });

  it("recognizes a written meal and asks the mother to review it when no photo is selected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));
    mealClient.createMealNote.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({ note: "Một ly sữa và một quả chuối", analysis: {
      foods: [
        { nameVi: "Sữa", searchNameEn: "milk", estimatedGrams: 240, confidence: 0.8, foodGroups: ["dairy"], safetyFlags: [] },
        { nameVi: "Chuối", searchNameEn: "banana", estimatedGrams: 100, confidence: 0.8, foodGroups: ["fruit"], safetyFlags: [] }
      ], needsUserConfirmation: [], estimateNotice: "Ước lượng từ ghi chú"
    } });

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh"), {
      target: { value: "Một ly sữa và một quả chuối" }
    });
    const save = screen.getByRole("button", { name: "Nhận diện từ ghi chú" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(mealClient.createMealNote).toHaveBeenCalledWith(expect.objectContaining({
      note: "Một ly sữa và một quả chuối", mealType: expect.any(String)
    })));
    expect(await screen.findByDisplayValue("Sữa")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Chuối")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu bữa này" })).toBeEnabled();
  });

  it("offers fast Vietnamese dish suggestions even when the mother types without accents", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh"), {
      target: { value: "bun rieu" }
    });

    expect(screen.getByRole("button", { name: "Bún riêu cua" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Bún riêu cua" }));
    expect(screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh")).toHaveValue("Bún riêu cua");
  });

  it("loads a reviewed personal menu on demand and fills the note with one tap", async () => {
    await reviewedMenu();

    render(<MealPhotoTracker />);

    const menu = screen.getByText("Gợi ý món riêng cho Mẹ").closest("details")!;
    expect(menu).not.toHaveAttribute("open");
    fireEvent.click(within(menu).getByText("Gợi ý món riêng cho Mẹ"));
    const choice = (await screen.findAllByText(/Phù hợp bộ lọc đã xác nhận/))[0].closest("button")!;
    const title = choice.querySelector("strong")!.textContent;
    expect(choice).toBeEnabled();
    fireEvent.click(choice);
    expect(screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh")).toHaveValue(title);
  });

  it("lets the mother save or add a missing food when a written note is ambiguous", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));
    mealClient.createMealNote.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({ note: "Hôm nay ăn ngon", analysis: {
      entryMode: "note", foods: [], needsUserConfirmation: [],
      estimateNotice: "Không thấy món cụ thể nên EmBe không tự đoán."
    } });

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText("Ghi chú món ăn · có thể lưu không cần ảnh"), {
      target: { value: "Hôm nay ăn ngon" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện từ ghi chú" }));

    expect(await screen.findByText(/không thấy món cụ thể/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thêm món còn thiếu" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Lưu bữa này" })).toBeEnabled();
  });

  it("lets the mother correct recognition and add a missing food before saving", async () => {
    const linked = vi.fn();
    window.addEventListener("embe:daily-action-completed", linked);
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/meals/") && init?.method === "PATCH") {
        return new Response(JSON.stringify({
          status: "nutrition_pending", checklistCompletion: { taskId: "lunch", day: "2026-09-01" }
        }), { status: 202 });
      }
      return new Response(JSON.stringify({ history: [], suggestions: [], worker: { status: "online" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    mealClient.createMealDraft.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({
      note: "",
      analysis: {
        foods: [{ nameVi: "Fried rice", searchNameEn: "fried rice", estimatedGrams: 200,
          confidence: 0.65, foodGroups: ["starch"], safetyFlags: [] }],
        needsUserConfirmation: [], estimateNotice: "Ước lượng"
      }
    });
    mealClient.waitForMealNutrition.mockResolvedValue(undefined);

    render(<MealPhotoTracker />);
    const image = new File(["photo"], "meal.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/Chụp bữa ăn/), { target: { files: [image] } });
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện bữa ăn" }));

    const detected = await screen.findByDisplayValue("Fried rice");
    expect(detected).toHaveAttribute("list", "vietnamese-popular-foods");
    expect(document.querySelector('option[value="Bún riêu cua"]')).toBeInTheDocument();
    fireEvent.change(detected, { target: { value: "Cơm chiên" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm món còn thiếu" }));
    fireEvent.change(screen.getAllByLabelText("Tên món")[1], { target: { value: "Trứng chiên" } });
    fireEvent.change(screen.getAllByLabelText("Khẩu phần (g)")[1], { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu bữa này" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/meals/11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ method: "PATCH" })
    ));
    const patchCall = fetch.mock.calls.find((call) => call[1]?.method === "PATCH");
    const body = JSON.parse(String(patchCall?.[1]?.body));
    expect(body.analysis.foods).toEqual(expect.arrayContaining([
      expect.objectContaining({ nameVi: "Cơm chiên" }),
      expect.objectContaining({ nameVi: "Trứng chiên", estimatedGrams: 60 })
    ]));
    expect(linked).toHaveBeenCalledWith(expect.objectContaining({
      detail: { taskId: "lunch", day: "2026-09-01" }
    }));
    expect(screen.getByText("Đã lưu bữa ăn · việc hôm nay đã tự tích.")).toBeInTheDocument();
    window.removeEventListener("embe:daily-action-completed", linked);
  });

  it("keeps foods added by the mother alongside a meal photo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ history: [], suggestions: [], worker: { status: "online" } })));
    mealClient.createMealDraft.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({ note: "", analysis: {
      foods: [
        { nameVi: "Cơm", searchNameEn: "rice", estimatedGrams: 180,
          confidence: 0.88, foodGroups: ["starch"], safetyFlags: [] },
        { nameVi: "Canh bi do", searchNameEn: "pumpkin soup", estimatedGrams: 150,
          confidence: 0.64, foodGroups: ["vegetables"], safetyFlags: [] }
      ],
      needsUserConfirmation: [], estimateNotice: "Ước lượng"
    } });

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText(/Chụp bữa ăn/), {
      target: { files: [new File(["photo"], "meal.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.change(screen.getByLabelText("Món thêm cùng ảnh"), { target: { value: "Canh bí đỏ" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm món cùng ảnh" }));
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện bữa ăn" }));

    await waitFor(() => expect(mealClient.createMealDraft).toHaveBeenCalledWith(expect.objectContaining({
      note: expect.stringContaining("Canh bí đỏ")
    })));
    expect(await screen.findByDisplayValue("Cơm")).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Canh bí đỏ")).toHaveLength(1);
  });

  it("lets the mother correct a saved meal without reusing the stale nutrition query", async () => {
    const savedHistory = [{ ...history[0], status: "ready" as const }];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/meals/") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ status: "nutrition_pending" }), { status: 202 });
      }
      return new Response(JSON.stringify({ history: savedHistory, suggestions: [], worker: { status: "online" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    mealClient.waitForMealNutrition.mockResolvedValue(undefined);

    render(<MealPhotoTracker />);
    const summary = await screen.findByText("Cơm và rau");
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    fireEvent.click(summary);
    fireEvent.click(screen.getByRole("button", { name: "Sửa bữa này" }));
    fireEvent.change(screen.getByLabelText("Sửa tên món"), { target: { value: "Đậu hũ" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm món vào bữa đã lưu" }));
    fireEvent.change(screen.getAllByLabelText("Sửa tên món")[1], { target: { value: "Rau luộc" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/meals/11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ method: "PATCH" })
    ));
    const patchCall = fetch.mock.calls.find((call) => call[1]?.method === "PATCH");
    const body = JSON.parse(String(patchCall?.[1]?.body));
    expect(body.analysis.foods).toEqual(expect.arrayContaining([
      expect.objectContaining({ nameVi: "Đậu hũ", searchNameEn: "Đậu hũ" }),
      expect.objectContaining({ nameVi: "Rau luộc", searchNameEn: "Rau luộc" })
    ]));
  });

  it("lets the mother repair a failed recognition instead of trapping the meal", async () => {
    const failedHistory = [{
      ...history[0], status: "failed" as const, note: "bữa trưa",
      analysis: {
        entryMode: "note" as const, foods: [], needsUserConfirmation: [],
        estimateNotice: "Chưa nhận diện được; ghi chú vẫn được giữ lại."
      }
    }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: failedHistory, suggestions: [], worker: { status: "online" }
    }), { status: 200 })));

    render(<MealPhotoTracker />);
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    fireEvent.click(await screen.findByText("Chưa nhận diện được · ghi chú vẫn còn"));
    fireEvent.click(screen.getByRole("button", { name: "Sửa bữa này" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm món vào bữa đã lưu" }));

    expect(screen.getByLabelText("Sửa tên món")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
  });

  it("moves a broken meal to trash after an explicit inline confirmation", async () => {
    const failedHistory = [{ ...history[0], status: "failed" as const }];
    let deleted = false;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/meals/") && init?.method === "DELETE") {
        deleted = true;
        return new Response(JSON.stringify({ status: "deleted" }), { status: 200 });
      }
      return new Response(JSON.stringify({
        history: deleted ? [] : failedHistory, suggestions: [], worker: { status: "online" }
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);

    render(<MealPhotoTracker />);
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    fireEvent.click(await screen.findByText("Chưa nhận diện được · ghi chú vẫn còn"));
    fireEvent.click(screen.getByRole("button", { name: "Xóa bữa này" }));

    expect(screen.getByText("Đưa bữa này vào Thùng rác?")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/api/meals/"), expect.objectContaining({ method: "DELETE" }));

    fireEvent.click(screen.getByRole("button", { name: "Đưa vào Thùng rác" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/meals/11111111-1111-4111-8111-111111111111",
      expect.objectContaining({ method: "DELETE" })
    ));
    expect(await screen.findByText("Đã chuyển bữa ăn vào Thùng rác.")).toBeInTheDocument();
  });

  it("lets the mother resume and confirm a recognized written meal after reopening the app", async () => {
    const pendingHistory = [{
      ...history[0], note: "Hôm nay ăn ngon", status: "needs_review" as const,
      analysis: {
        entryMode: "note" as const, foods: [], needsUserConfirmation: ["Mẹ đã ăn món gì?"],
        estimateNotice: "Không thấy món cụ thể nên EmBe không tự đoán."
      }
    }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: pendingHistory, suggestions: [], worker: { status: "online" }
    }), { status: 200 })));

    render(<MealPhotoTracker />);
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    fireEvent.click(await screen.findByText("Chờ Mẹ kiểm tra"));
    expect(screen.getByRole("button", { name: "Kiểm tra và lưu" })).toBeEnabled();
  });

  it("shows a clear retry message when correcting a saved meal fails", async () => {
    const savedHistory = [{ ...history[0], status: "ready" as const }];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "PATCH"
      ? new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 })
      : new Response(JSON.stringify({ history: savedHistory, suggestions: [], worker: { status: "online" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    render(<MealPhotoTracker />);
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    fireEvent.click(await screen.findByText("Cơm và rau"));
    fireEvent.click(screen.getByRole("button", { name: "Sửa bữa này" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    expect(await screen.findByText("Chưa lưu được thay đổi. Hãy thử lại.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();
  });

  it("shows a clear retry message when saving a newly recognized meal fails", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => init?.method === "PATCH"
      ? new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 })
      : new Response(JSON.stringify({ history: [], suggestions: [], worker: { status: "online" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    mealClient.createMealDraft.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({ note: "", analysis: history[0].analysis });

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText(/Chụp bữa ăn/), {
      target: { files: [new File(["photo"], "meal.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện bữa ăn" }));
    fireEvent.click(await screen.findByRole("button", { name: "Lưu bữa này" }));

    expect(await screen.findByText("Chưa lưu được bữa ăn. Hãy thử lại.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu bữa này" })).toBeEnabled();
  });

  it("previews the selected meal photo before upload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));
    const createObjectURL = vi.fn(() => "blob:meal-preview");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const { unmount } = render(<MealPhotoTracker />);
    const image = new File(["photo"], "meal.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/Chụp bữa ăn/), { target: { files: [image] } });

    expect(screen.getByRole("img", { name: "Ảnh bữa ăn vừa chọn" })).toHaveAttribute("src", "blob:meal-preview");
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:meal-preview");
  });

  it("does not claim unavailable nutrition is still processing", async () => {
    const unavailableHistory = [{
      ...history[0], status: "ready" as const,
      analysis: {
        ...history[0].analysis,
        nutrition: { status: "unavailable" as const, notice: "Chưa ghép được nguồn dinh dưỡng." }
      }
    }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: unavailableHistory, suggestions: [], worker: { status: "online" }
    }), { status: 200 })));

    render(<MealPhotoTracker />);
    expect(await screen.findByText("Chưa tính được dinh dưỡng · chạm để sửa")).toBeInTheDocument();
    expect(screen.queryByText("Đang bổ sung dinh dưỡng")).not.toBeInTheDocument();
  });

  it("shows a retry action instead of hiding a meal photo that failed to load", async () => {
    const savedHistory = [{ ...history[0], status: "ready" as const }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: savedHistory, suggestions: [], worker: { status: "online" }
    }), { status: 200 })));

    render(<MealPhotoTracker />);
    fireEvent.click(screen.getByRole("button", { name: /^Đã ăn/ }));
    fireEvent.click(await screen.findByText("Cơm và rau"));
    fireEvent.error(screen.getByRole("img", { name: "Ảnh bữa trưa" }));

    expect(screen.getByText("Chưa mở được ảnh.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại ảnh" })).toBeEnabled();
  });

  it("shows a pregnancy safety warning immediately when the corrected name needs it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: [], suggestions: [], worker: { status: "online" }
    }), { status: 200 })));
    mealClient.createMealDraft.mockResolvedValue("11111111-1111-4111-8111-111111111111");
    mealClient.waitForMealDraft.mockResolvedValue({ note: "", analysis: history[0].analysis });

    render(<MealPhotoTracker />);
    fireEvent.change(screen.getByLabelText(/Chụp bữa ăn/), {
      target: { files: [new File(["photo"], "meal.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhận diện bữa ăn" }));
    fireEvent.change(await screen.findByLabelText("Tên món"), { target: { value: "Trứng lòng đào" } });

    expect(screen.getByText(/cần kiểm tra độ chín hoặc tiệt trùng/i)).toBeInTheDocument();
  });

  it("keeps the pregnancy safety warning visible in saved meal history", async () => {
    const riskyHistory = [{
      ...history[0], status: "ready" as const,
      analysis: { ...history[0].analysis, foods: [{
        ...history[0].analysis.foods[0], nameVi: "Trứng lòng đào", safetyFlags: ["raw_or_undercooked"]
      }] }
    }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      history: riskyHistory, suggestions: [], worker: { status: "online" }
    }), { status: 200 })));

    render(<MealPhotoTracker />);
    fireEvent.click(await screen.findByText("Trứng lòng đào"));
    expect(screen.getByText(/cần kiểm tra độ chín hoặc tiệt trùng/i)).toBeInTheDocument();
  });
});
