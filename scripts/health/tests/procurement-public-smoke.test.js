import assert from "node:assert/strict";
import test from "node:test";

import { createShortSession, validateProcurementResponse } from "../procurement-public-smoke.mjs";

test("validates only aggregate production procurement state", () => {
  assert.deepEqual(validateProcurementResponse(200, { proposals: [], pending: 0 }), {
    status: "ok", proposal_count: 0, pending: 0,
  });
});

test("rejects malformed or failed responses", () => {
  assert.throws(() => validateProcurementResponse(503, { proposals: [], pending: 0 }));
  assert.throws(() => validateProcurementResponse(200, { proposals: "private", pending: -1 }));
});

test("creates a bounded signed session without exposing the secret", () => {
  const session = createShortSession("server-secret", 1000);
  assert.match(session, /^1300\.[0-9a-f]{64}$/);
  assert.equal(session.includes("server-secret"), false);
});
