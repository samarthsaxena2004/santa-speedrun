#!/usr/bin/env node
// Santa Speedrun web app.
//  - Serves the UI (public/index.html)
//  - Hosts the find_gifts MCP tool over HTTP at /mcp (OpenClaw connects here)
//  - POST /api/run  -> streams a run from the OpenClaw gateway (agent "santa",
//                      Kimi K3.1 Pro on Cerebras) to the browser as SSE
//  - --mock          -> fake, offline run for rehearsing the UI (NOT for the demo)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerGiftTool } from "./mcp/gift-tool.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// ---------- tiny .env loader (no dependency) ----------
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.join(ROOT, ".env"));

const CFG = {
  port: Number(process.env.PORT || 8787),
  gatewayUrl: (process.env.GATEWAY_URL || "http://127.0.0.1:18790").replace(/\/$/, ""),
  gatewayToken: process.env.SANTA_GATEWAY_TOKEN || process.env.GATEWAY_TOKEN || "",
  agent: process.env.SANTA_AGENT || "santa",
  mock: process.argv.includes("--mock") || process.env.MODE === "mock",
  gpu: {
    tps: Number(process.env.GPU_TPS || 112.2),
    label: process.env.GPU_LABEL || "Median Kimi K3.1 Pro API",
    source:
      process.env.GPU_SOURCE ||
      "Median output speed of 16 Kimi K3.1 Pro endpoints, Artificial Analysis (Nov 17, 2026)",
  },
};

// ---------- active run + live tool events ----------
let active = null; // { send(event, data), abort() }

function emitToActive(ev) {
  if (active) active.send("tool", ev);
}

// ---------- HTTP helpers ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function startSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  const t0 = performance.now();
  let closed = false;
  res.on("close", () => (closed = true));
  return {
    t0,
    send(event, data = {}) {
      if (closed) return;
      const t = Math.round(performance.now() - t0);
      res.write(`event: ${event}\ndata: ${JSON.stringify({ ...data, t })}\n\n`);
    },
    end() {
      if (!closed) res.end();
    },
    get closed() {
      return closed;
    },
  };
}

// ---------- live run through the OpenClaw gateway ----------
async function liveRun(prompt, sse, signal) {
  sse.send("start", { mode: "live", agent: CFG.agent });
  const res = await fetch(`${CFG.gatewayUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(CFG.gatewayToken ? { Authorization: `Bearer ${CFG.gatewayToken}` } : {}),
    },
    body: JSON.stringify({
      model: `openclaw/${CFG.agent}`,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "user", content: prompt }],
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gateway ${res.status}: ${text.slice(0, 400) || res.statusText}`);
  }

  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      let j;
      try {
        j = JSON.parse(payload);
      } catch {
        continue;
      }
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      const delta = j.choices?.[0]?.delta;
      if (delta?.content) sse.send("delta", { text: delta.content });
      if (j.usage) sse.send("usage", { usage: j.usage });
    }
  }
}

// ---------- mock run (offline rehearsal; clearly labelled in the UI) ----------
const MOCK = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "mock-data.json"), "utf8"));
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(id), reject(new Error("aborted"))), { once: true });
  });

async function mockRun(prompt, sse, signal) {
  sse.send("start", { mode: "mock", agent: CFG.agent });
  await sleep(450, signal);
  const queries = MOCK.shelves.map((s) => s.query);
  emitToActive({ type: "search_start", queries });
  await Promise.all(
    MOCK.shelves.map(async (s, i) => {
      await sleep(350 + i * 90, signal);
      emitToActive({ type: "search_done", query: s.query, index: i, items: s.items, ms: 350 + i * 90 });
    }),
  );
  emitToActive({ type: "search_all_done", ms: 760, count: MOCK.shelves.length * 2 });
  await sleep(380, signal);
  const out = JSON.stringify(MOCK.answer);
  const charsPerTick = Math.ceil((1500 * 4) / 60); // ~1500 tok/s at 60fps
  for (let i = 0; i < out.length; i += charsPerTick) {
    sse.send("delta", { text: out.slice(i, i + charsPerTick) });
    await sleep(16, signal);
  }
  sse.send("usage", { usage: { completion_tokens: Math.round(out.length / 4) + 60, prompt_tokens: 3400 } });
}

// ---------- MCP over HTTP (stateless) ----------
async function handleMcp(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST" }).end();
    return;
  }
  const body = await readBody(req);
  const server = new McpServer({ name: "santa-gift-shelf", version: "1.0.0" });
  registerGiftTool(server, emitToActive);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

// ---------- router ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(fs.readFileSync(path.join(ROOT, "public", "index.html")));
      return;
    }
    if (url.pathname === "/api/config") {
      return json(res, 200, { mock: CFG.mock, gpu: CFG.gpu, agent: CFG.agent });
    }
    if (url.pathname === "/mcp") return await handleMcp(req, res);

    if (url.pathname === "/api/tool-events" && req.method === "POST") {
      emitToActive(await readBody(req));
      return json(res, 200, { ok: true });
    }

    if (url.pathname === "/api/run" && req.method === "POST") {
      const { prompt } = await readBody(req);
      if (!prompt || typeof prompt !== "string") return json(res, 400, { error: "prompt required" });
      active?.abort(); // one run at a time
      const sse = startSse(res);
      const aborter = new AbortController();
      const me = { send: sse.send, abort: () => aborter.abort() };
      active = me;
      res.on("close", () => aborter.abort());
      try {
        await (CFG.mock ? mockRun : liveRun)(prompt.slice(0, 400), sse, aborter.signal);
        sse.send("done", {});
      } catch (err) {
        if (!aborter.signal.aborted) {
          console.error("[run] error:", err.message);
          sse.send("fail", { message: hint(err) });
        }
      } finally {
        if (active === me) active = null;
        sse.end();
      }
      return;
    }

    res.writeHead(404).end("not found");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { error: String(err.message || err) });
    else res.end();
  }
});

function hint(err) {
  const m = String(err?.message || err);
  if (/ECONNREFUSED|fetch failed/i.test(m))
    return `Can't reach the OpenClaw gateway at ${CFG.gatewayUrl}. Start it with: npm run gateway`;
  if (/401|unauthor/i.test(m)) return `Auth failed (${m.slice(0, 160)}). Check SANTA_GATEWAY_TOKEN / CEREBRAS_API_KEY in .env, then restart the gateway.`;
  if (/429|rate/i.test(m)) return `Rate limited (100K tokens/min on the hackathon tier). Wait ~30s and retry. ${m.slice(0, 160)}`;
  return m.slice(0, 500);
}

server.listen(CFG.port, "127.0.0.1", () => {
  console.log(`\n🎅 Santa Speedrun ${CFG.mock ? "(MOCK MODE - offline rehearsal, not real AI)" : "(live)"}`);
  console.log(`   UI:       http://127.0.0.1:${CFG.port}`);
  console.log(`   MCP tool: http://127.0.0.1:${CFG.port}/mcp  (OpenClaw connects here)`);
  if (!CFG.mock) console.log(`   Gateway:  ${CFG.gatewayUrl}  agent=openclaw/${CFG.agent}`);
  console.log("");
});
