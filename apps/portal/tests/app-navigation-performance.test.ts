import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:tsx|jsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("app-like navigation performance", () => {
  it("uses client navigation for internal destinations", () => {
    const root = join(process.cwd(), "src");
    const exceptions = new Set([join(root, "app", "offline", "page.tsx")]);
    const violations = sourceFiles(root)
      .filter((path) => !exceptions.has(path))
      .filter((path) => /<a[^>]+href="\/(?!\/)/.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));

    expect(violations).toEqual([]);
  });

  it("does not prefetch the already-open bottom navigation route", () => {
    const source = readFileSync(join(process.cwd(), "src", "components", "family-nav.tsx"), "utf8");
    expect(source).toContain('prefetch={active ? false : undefined}');
  });

  it("defers non-critical release and activity checks until after startup", () => {
    const source = readFileSync(join(process.cwd(), "src", "components", "pwa-runtime.tsx"), "utf8");
    expect(source).toContain("STARTUP_IDLE_MS");
    expect(source).toContain("window.setTimeout");
    expect(source).not.toMatch(/\n\s*void checkRelease\(\);\n\s*void checkFamilyActivity\(\);\n\n\s*return \(\) =>/);
  });
});
