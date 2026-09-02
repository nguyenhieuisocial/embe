import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { clearPrivateGetCache } from "../src/lib/private-get-cache";
import { clearSessionValidationCache } from "../src/lib/session-store";

afterEach(() => {
  cleanup();
  clearPrivateGetCache();
  clearSessionValidationCache();
});
