import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { isMainModule, validatePortalResponse } from "../portal-public-smoke.mjs";

const safeHeaders = new Headers({
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-robots-tag": "noindex, nofollow",
});

test("accepts the public login shell without exposing response content", () => {
  const result = validatePortalResponse({
    status: 200,
    headers: safeHeaders,
    body: '<html><script src="https://www.googletagmanager.com/gtag/js?id=G-PTX99GX5F9"></script></html>',
  });

  assert.deepEqual(result, {
    status: "ok",
    reachable: true,
    analytics_present: true,
    privacy_headers_present: true,
  });
});

test("fails closed when analytics or privacy headers disappear", () => {
  assert.throws(
    () => validatePortalResponse({ status: 200, headers: new Headers(), body: "<html></html>" }),
    /public portal smoke check failed/,
  );
});

test("fails closed for non-successful HTTP status", () => {
  assert.throws(
    () => validatePortalResponse({ status: 503, headers: safeHeaders, body: "" }),
    /public portal smoke check failed/,
  );
});

test("recognizes the current platform entrypoint path", () => {
  const entrypoint = resolve("scripts/health/portal-public-smoke.mjs");
  assert.equal(isMainModule(pathToFileURL(entrypoint).href, entrypoint), true);
});

test("recognizes a Windows entrypoint path", { skip: process.platform !== "win32" }, () => {
  assert.equal(
    isMainModule("file:///C:/EmBe/scripts/health/portal-public-smoke.mjs", "C:\\EmBe\\scripts\\health\\portal-public-smoke.mjs"),
    true,
  );
});
