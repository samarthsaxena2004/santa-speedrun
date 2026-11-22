#!/usr/bin/env node
// One-time setup. Creates an isolated OpenClaw profile ("santa") so your
// normal ~/.openclaw config is never touched:
//   ~/.openclaw-santa/openclaw.json          gateway + Kimi-on-Cerebras + gift tool + santa agent
//   ~/.openclaw-santa/workspace-santa/AGENTS.md   the agent's instructions
//   ./.env                                   your key + gateway token (git-ignored)
//
// Usage:  npm run setup            (asks for your Cerebras key)
//         npm run setup -- --stdio (tool runs as a stdio process instead of via the web app)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = "santa";
const STATE = path.join(os.homedir(), `.openclaw-${PROFILE}`);
const WORKSPACE = path.join(STATE, "workspace-santa");
const WORKSPACE_SPEEDY = path.join(STATE, "workspace-speedy");
const MODEL_ID = process.env.KIMI_MODEL_ID || "moonshotai-kimi-k3.1-pro-trial";
const GATEWAY_PORT = Number(process.env.SANTA_GATEWAY_PORT || 18790);
const WEB_PORT = Number(process.env.PORT || 8787);
const useStdio = process.argv.includes("--stdio");

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const envPath = path.join(ROOT, ".env");
const existing = readEnvFile(envPath);

let key = process.env.CEREBRAS_API_KEY || existing.CEREBRAS_API_KEY || "";
if (!key) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  key = (await rl.question("Paste your Cerebras API key (csk-...): ")).trim();
  rl.close();
}
if (!key.startsWith("csk-")) {
  console.warn("⚠️  That doesn't look like a Cerebras key (expected csk-...). Continuing anyway.");
}
const token = existing.SANTA_GATEWAY_TOKEN || crypto.randomBytes(24).toString("hex");

// ---------- OpenClaw profile config ----------
const elfServer = useStdio
  ? {
      command: process.execPath,
      args: [path.join(ROOT, "mcp", "gift-shelf-mcp.mjs")],
      env: { SANTA_EVENTS_URL: `http://127.0.0.1:${WEB_PORT}/api/tool-events` },
      connectionTimeoutMs: 15000,
      requestTimeoutMs: 20000,
    }
  : {
      url: `http://127.0.0.1:${WEB_PORT}/mcp`,
      transport: "streamable-http",
      connectionTimeoutMs: 10000,
      requestTimeoutMs: 20000,
    };

const config = {
  gateway: {
    mode: "local",
    port: GATEWAY_PORT,
    bind: "loopback",
    auth: { mode: "token", token: "${SANTA_GATEWAY_TOKEN}" },
    http: { endpoints: { chatCompletions: { enabled: true } } },
  },
  models: {
    mode: "merge",
    providers: {
      cerebras: {
        baseUrl: "https://api.cerebras.ai/v1",
        apiKey: "${CEREBRAS_API_KEY}",
        api: "openai-completions",
        models: [
          {
            id: MODEL_ID,
            name: "Kimi K3.1 Pro (Cerebras hackathon preview)",
            reasoning: true,
            input: ["text"],
            contextWindow: 262144,
            maxTokens: 16384,
            compat: {
              supportsTools: true,
              supportsStrictMode: false, // organizers' config: strict tool schemas are rejected on some accounts
              supportsReasoningEffort: true,
              supportedReasoningEfforts: ["low", "medium", "high"],
              supportsUsageInStreaming: true,
            },
          },
        ],
      },
    },
  },
  // Direct tool schemas (no tool-search round trip) = fewer model turns.
  tools: { toolSearch: false },
  mcp: { servers: { elf: elfServer } },
  agents: {
    ownership: "explicit",
    defaults: { skipBootstrap: true, systemAgent: { agentId: "santa" } },
    entries: {
      santa: {
        name: "Santa Speedrun",
        workspace: WORKSPACE,
        model: `cerebras/${MODEL_ID}`,
        thinkingDefault: "low", // Kimi on Cerebras rejects reasoning_effort "none"; low = ~10 thinking tokens
        params: { maxTokens: 2500 },
        tools: { allow: ["elf__find_gifts"] },
      },
      // Lean twin for the Speed Bounty run. Temperature 1 measured fastest (see docs/SPEED_BOUNTY.md).
      speedy: {
        name: "Santa's Speedy Shopper",
        workspace: WORKSPACE_SPEEDY,
        model: `cerebras/${MODEL_ID}`,
        thinkingDefault: "low",
        params: { maxTokens: 1500, temperature: 1 },
        tools: { allow: ["elf__find_gifts"] },
      },
    },
  },
};

fs.mkdirSync(WORKSPACE, { recursive: true });
fs.mkdirSync(WORKSPACE_SPEEDY, { recursive: true });
fs.copyFileSync(path.join(ROOT, "agent", "speedy-agent.md"), path.join(WORKSPACE_SPEEDY, "AGENTS.md"));
const cfgPath = path.join(STATE, "openclaw.json");
if (fs.existsSync(cfgPath)) {
  const bak = `${cfgPath}.bak-${Date.now()}`;
  fs.copyFileSync(cfgPath, bak);
  console.log(`Backed up existing santa profile config -> ${bak}`);
}
fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
fs.copyFileSync(path.join(ROOT, "agent", "santa-agent.md"), path.join(WORKSPACE, "AGENTS.md"));

// ---------- app .env ----------
const env = {
  ...existing,
  CEREBRAS_API_KEY: key,
  SANTA_GATEWAY_TOKEN: token,
  GATEWAY_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
  PORT: String(WEB_PORT),
};
const envText =
  "# Santa Speedrun local secrets. Never commit or show this file on screen.\n" +
  Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") +
  "\n";
fs.writeFileSync(envPath, envText, { mode: 0o600 });

console.log(`
✅ Setup done.
   OpenClaw profile: ${cfgPath}
   Agent workspace:  ${WORKSPACE}
   Gift tool:        ${useStdio ? "stdio process" : `http://127.0.0.1:${WEB_PORT}/mcp (served by the web app)`}

Next, in two terminals:
   1) npm start            # web app + gift tool   -> http://127.0.0.1:${WEB_PORT}
   2) npm run gateway      # OpenClaw gateway (profile "${PROFILE}", port ${GATEWAY_PORT})

Then: npm run check:gateway -- --run   (one full test run in the terminal)
`);
