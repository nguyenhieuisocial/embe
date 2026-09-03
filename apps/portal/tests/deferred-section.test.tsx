import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DeferredSection from "../src/components/deferred-section";

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

describe("DeferredSection", () => {
  let callback: ObserverCallback | undefined;

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.unstubAllGlobals();
  });

  function installObserver() {
    class Observer {
      constructor(next: ObserverCallback) { callback = next; }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", Observer);
  }

  it("waits until the grouped tools are near the viewport", () => {
    installObserver();
    render(<DeferredSection label="công cụ chăm sóc" targetIds="bua-an suc-khoe">
      <p>Đã mở công cụ</p>
    </DeferredSection>);

    expect(screen.queryByText("Đã mở công cụ")).not.toBeInTheDocument();
    expect(screen.getByText("Công cụ chăm sóc sẽ mở khi Mẹ cuộn tới.")).toBeInTheDocument();

    act(() => callback?.([{ isIntersecting: true }]));
    expect(screen.getByText("Đã mở công cụ")).toBeInTheDocument();
  });

  it("opens immediately for a direct link to a tool", async () => {
    installObserver();
    window.history.replaceState(null, "", "/me-bau#bua-an");

    render(<DeferredSection label="công cụ chăm sóc" targetIds="bua-an suc-khoe">
      <p id="bua-an">Đã mở từ đường tắt</p>
    </DeferredSection>);

    expect(await screen.findByText("Đã mở từ đường tắt")).toBeInTheDocument();
  });

  it("opens when a same-page shortcut changes the hash", () => {
    installObserver();
    render(<DeferredSection label="công cụ chăm sóc" targetIds="bua-an suc-khoe">
      <p id="suc-khoe">Đã mở sức khỏe</p>
    </DeferredSection>);

    expect(screen.queryByText("Đã mở sức khỏe")).not.toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", "/me-bau#suc-khoe");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(screen.getByText("Đã mở sức khỏe")).toBeInTheDocument();
  });
});
