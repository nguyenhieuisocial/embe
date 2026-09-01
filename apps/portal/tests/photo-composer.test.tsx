import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendFamilyPhoto, refresh } = vi.hoisted(() => ({
  sendFamilyPhoto: vi.fn(),
  refresh: vi.fn()
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../src/lib/photo-upload-client", () => ({ sendFamilyPhoto }));

import PhotoComposer from "../src/components/photo-composer";

describe("family photo batch composer", () => {
  beforeEach(() => {
    sendFamilyPhoto.mockReset().mockImplementation(async ({ onProgress }) => {
      onProgress?.(15);
      onProgress?.(82);
      onProgress?.(100);
      return { uploadId: crypto.randomUUID() };
    });
    refresh.mockReset();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
      revokeObjectURL: vi.fn()
    });
    window.localStorage.clear();
  });

  it("accepts a batch from the iPhone library and shows one compact review queue", async () => {
    const { container } = render(<PhotoComposer />);
    const library = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
    expect(library).toHaveAttribute("multiple");

    fireEvent.change(library, { target: { files: [
      new File(["first"], "IMG_1.JPG", { type: "image/jpeg", lastModified: 1 }),
      new File(["second"], "IMG_2.JPG", { type: "image/jpeg", lastModified: 2 })
    ] } });

    expect(await screen.findByText("2 ảnh đã chọn")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /Ảnh .* sắp gửi/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Gửi 2 ảnh" })).toBeInTheDocument();
  });

  it("uploads sequentially, reports progress and keeps the author choice", async () => {
    const { container } = render(<PhotoComposer />);
    const library = container.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
    fireEvent.change(library, { target: { files: [
      new File(["first"], "IMG_1.JPG", { type: "image/jpeg", lastModified: 1 }),
      new File(["second"], "IMG_2.JPG", { type: "image/jpeg", lastModified: 2 })
    ] } });

    fireEvent.click(await screen.findByRole("button", { name: "Gửi 2 ảnh" }));

    expect(await screen.findByRole("heading", { name: "Đã gửi 2 ảnh" })).toBeInTheDocument();
    expect(sendFamilyPhoto).toHaveBeenCalledTimes(2);
    expect(sendFamilyPhoto.mock.calls[0][0]).toEqual(expect.objectContaining({ authorRole: "mother" }));
    expect(refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ảnh đang được cất"));
  });
});
