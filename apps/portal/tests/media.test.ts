import { describe, expect, it } from "vitest";

import { isAllowedMediaUrl } from "../src/lib/media";

describe("private media proxy policy", () => {
  it("allows only configured HTTPS hosts without embedded credentials", () => {
    expect(isAllowedMediaUrl("https://cache.example.test/a.webp", "cache.example.test")).toBe(true);
    expect(isAllowedMediaUrl("http://cache.example.test/a.webp", "cache.example.test")).toBe(false);
    expect(isAllowedMediaUrl("https://other.example.test/a.webp", "cache.example.test")).toBe(false);
    expect(isAllowedMediaUrl("https://user:secret@cache.example.test/a.webp", "cache.example.test")).toBe(false);
  });
});
