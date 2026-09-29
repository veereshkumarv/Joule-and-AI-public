import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 3100;
const MCP_URL = `http://localhost:${PORT}/mcp`;

let server;

before(async () => {
  server = spawn("node", ["src/index.js"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "pipe",
  });

  await waitForServer();
});

after(() => {
  server.kill();
});

async function waitForServer(retries = 20, delayMs = 250) {
  for (let i = 0; i < retries; i++) {
    try {
      await callMcp("tools/list", {});
      return;
    } catch {
      await sleep(delayMs);
    }
  }
  throw new Error(`Server did not start listening on port ${PORT} in time`);
}

async function callMcp(method, params) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

  const text = await response.text();
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data:"));
  const raw = dataLine ? dataLine.slice("data:".length).trim() : text;

  return JSON.parse(raw);
}

test("tools/list exposes convert_currency and get_weather", async () => {
  const { result } = await callMcp("tools/list", {});
  const names = result.tools.map((tool) => tool.name).sort();

  assert.deepEqual(names, ["convert_currency", "get_weather"]);
});

test("convert_currency converts an amount between two currencies", async () => {
  const { result } = await callMcp("tools/call", {
    name: "convert_currency",
    arguments: { amount: 100, from: "USD", to: "EUR" },
  });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /^100 USD = [\d.]+ EUR \(rate: 1 USD = [\d.]+ EUR\)$/);
});

test("convert_currency reports an MCP tool error for an invalid currency code", async () => {
  const { result } = await callMcp("tools/call", {
    name: "convert_currency",
    arguments: { amount: 100, from: "USD", to: "XXX" },
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Currency conversion failed/);
});

test("get_weather returns current conditions for a known location", async () => {
  const { result } = await callMcp("tools/call", {
    name: "get_weather",
    arguments: { location: "London" },
  });

  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /^Weather in London.*°C, humidity \d+%, wind [\d.]+ km\/h$/);
});
