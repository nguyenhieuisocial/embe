"use strict";

const ACK_TIMEOUT_MS = 12_000;

class KumaAdapterError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function desiredMonitors() {
  return [
    { name: "EmBe Portal", url: "https://embe.hieu.asia/", interval: 60 },
    { name: "BabyBuddy", url: "http://babybuddy:8000/", interval: 60 },
    { name: "Memos", url: "http://memos:5230/", interval: 60 },
    { name: "Grocy", url: "http://grocy/", interval: 60 },
    { name: "Node-RED", url: "http://node-red:1880/", interval: 60 },
    { name: "Home Assistant", url: "http://home-assistant:8123/", interval: 60 },
    { name: "Ollama local AI", url: "http://host.docker.internal:11434/api/tags", interval: 120 },
  ];
}

function buildMonitor({ name, url, interval }) {
  return {
    active: true,
    type: "http",
    name,
    parent: null,
    url,
    method: "GET",
    interval,
    retryInterval: 60,
    resendInterval: 0,
    maxretries: 1,
    retryOnlyOnStatusCodeFailure: false,
    timeout: 10,
    notificationIDList: {},
    ignoreTls: false,
    upsideDown: false,
    expiryNotification: false,
    domainExpiryNotification: true,
    maxredirects: 10,
    accepted_statuscodes: ["200-299"],
    saveResponse: false,
    saveErrorResponse: false,
    responseMaxLength: 0,
    kafkaProducerBrokers: [],
    kafkaProducerSaslOptions: { mechanism: "None" },
    conditions: [],
    rabbitmqNodes: [],
  };
}

function request(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new KumaAdapterError("KUMA_ACK_TIMEOUT")), ACK_TIMEOUT_MS);
    socket.emit(event, ...args, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function requireOk(response) {
  if (!response || response.ok !== true) throw new KumaAdapterError("KUMA_REJECTED");
  return response;
}

async function bootstrapAndReconcile(socket, { username, password, allowInitialSetup }) {
  if (!username || !password) throw new KumaAdapterError("KUMA_CREDENTIAL_REQUIRED");

  let monitorList = {};
  socket.on("monitorList", (value) => {
    monitorList = value || {};
  });

  const needsSetup = await request(socket, "needSetup");
  if (needsSetup) {
    if (!allowInitialSetup) throw new KumaAdapterError("Initial setup is required");
    requireOk(await request(socket, "setup", username, password));
  }

  requireOk(await request(socket, "login", { username, password }));
  const existingNames = new Set(Object.values(monitorList).map((monitor) => String(monitor.name)));
  let createdCount = 0;
  let existingCount = 0;

  for (const definition of desiredMonitors()) {
    if (existingNames.has(definition.name)) {
      existingCount += 1;
      continue;
    }
    requireOk(await request(socket, "add", buildMonitor(definition)));
    createdCount += 1;
  }

  return {
    status: "ok",
    createdCount,
    existingCount,
    monitorCount: createdCount + existingCount,
  };
}

async function connectSocket(io, url) {
  const socket = io(url, { transports: ["websocket", "polling"], timeout: 10_000 });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new KumaAdapterError("KUMA_CONNECT_TIMEOUT")), 12_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", () => {
      clearTimeout(timer);
      reject(new KumaAdapterError("KUMA_CONNECT_FAILED"));
    });
  });
  return socket;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16_384) throw new KumaAdapterError("KUMA_INPUT_TOO_LARGE");
  }
  let credentials;
  try {
    const decoded = Buffer.from(input.trim(), "base64").toString("utf8");
    credentials = JSON.parse(decoded);
  } catch {
    throw new KumaAdapterError("KUMA_INPUT_INVALID");
  }
  const username = typeof credentials.username === "string" ? credentials.username : "";
  const password = typeof credentials.password === "string" ? credentials.password : "";
  const allowInitialSetup = credentials.allowInitialSetup === true;
  const { io } = require("socket.io-client");
  let socket;
  try {
    socket = await connectSocket(io, process.env.EMBE_KUMA_URL || "http://127.0.0.1:3001");
    const result = await bootstrapAndReconcile(socket, { username, password, allowInitialSetup });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof KumaAdapterError ? error.code : "KUMA_UNEXPECTED_ERROR";
    process.stderr.write(`${JSON.stringify({ status: "error", code })}\n`);
    process.exitCode = 1;
  } finally {
    if (socket) socket.disconnect();
  }
}

module.exports = { bootstrapAndReconcile, buildMonitor, desiredMonitors };

if (require.main === module) main();
