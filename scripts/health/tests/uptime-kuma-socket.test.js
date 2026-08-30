"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  bootstrapAndReconcile,
  buildMonitor,
  desiredMonitors,
} = require("../uptime-kuma-socket.js");

class MockSocket extends EventEmitter {
  constructor({ needsSetup, existing = [] }) {
    super();
    this.needsSetup = needsSetup;
    this.monitors = Object.fromEntries(existing.map((monitor, index) => [index + 1, monitor]));
    this.calls = [];
    this.connected = true;
  }

  emit(event, ...args) {
    const callback = args.pop();
    this.calls.push({ event, args });
    if (event === "needSetup") return callback(this.needsSetup);
    if (event === "setup") {
      this.needsSetup = false;
      return callback({ ok: true });
    }
    if (event === "login") {
      EventEmitter.prototype.emit.call(this, "monitorList", this.monitors);
      return callback({ ok: true, token: "must-never-leak" });
    }
    if (event === "add") {
      const monitor = args[0];
      this.monitors[Object.keys(this.monitors).length + 1] = monitor;
      return callback({ ok: true, monitorID: Object.keys(this.monitors).length });
    }
    throw new Error(`Unexpected event: ${event}`);
  }

  disconnect() {
    this.connected = false;
  }
}

test("sets up once and adds only missing monitors", async () => {
  const desired = desiredMonitors();
  const socket = new MockSocket({ needsSetup: true, existing: [desired[0]] });
  const result = await bootstrapAndReconcile(socket, {
    username: "monitor-admin",
    password: "a-strong-test-password",
    allowInitialSetup: true,
  });

  assert.equal(socket.calls.filter((call) => call.event === "setup").length, 1);
  assert.equal(socket.calls.filter((call) => call.event === "add").length, desired.length - 1);
  assert.deepEqual(result, {
    status: "ok",
    createdCount: desired.length - 1,
    existingCount: 1,
    monitorCount: desired.length,
  });
  assert.doesNotMatch(JSON.stringify(result), /password|token|family_content|response_body/i);
});

test("monitor payload matches the 2.5.3 server handler contract", () => {
  const payload = buildMonitor({ name: "Example", url: "http://example.invalid/", interval: 60 });

  assert.equal(payload.type, "http");
  assert.deepEqual(payload.accepted_statuscodes, ["200-299"]);
  assert.deepEqual(payload.notificationIDList, {});
  assert.deepEqual(payload.kafkaProducerBrokers, []);
  assert.deepEqual(payload.conditions, []);
  assert.deepEqual(payload.rabbitmqNodes, []);
  assert.equal(payload.maxredirects, 10);
  assert.equal(payload.active, true);
});

test("refuses initial account creation without explicit permission", async () => {
  const socket = new MockSocket({ needsSetup: true });
  await assert.rejects(
    bootstrapAndReconcile(socket, {
      username: "monitor-admin",
      password: "a-strong-test-password",
      allowInitialSetup: false,
    }),
    /initial setup is required/i,
  );
  assert.equal(socket.calls.some((call) => call.event === "setup"), false);
});
