#!/usr/bin/env node
// Creates a separate OpenClaw profile ("santa-bounty") for the speed-patched build.
// The patch is based on an older OpenClaw commit that cannot open the release's state
// database, so it gets its own folder and port. The "santa" profile is left untouched.
// Run `npm run setup` first. The config keeps ${ENV} placeholders, never the key itself.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(os.homedir(), ".openclaw-santa", "openclaw.json");
const dir = path.join(os.homedir(), ".openclaw-santa-bounty");
const workspace = path.join(dir, "workspace-speedy");

if (!fs.existsSync(source)) {
  console.error("No santa profile yet. Run: npm run setup");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(source, "utf8"));
config.gateway.port = Number(process.env.SANTA_BOUNTY_PORT || 18791);
config.agents.defaults.systemAgent = { agentId: "speedy" };
config.agents.entries = {
  speedy: { ...config.agents.entries.speedy, workspace, params: { maxTokens: 1500, temperature: 1 } },
};
const model = config.models.providers.cerebras.models[0];
model.compat = {
  ...model.compat,
  supportsTools: true,
  supportsStrictMode: false,
  supportedReasoningEfforts: ["low", "high", "max"],
};

fs.mkdirSync(workspace, { recursive: true });
fs.copyFileSync(path.join(ROOT, "agent", "speedy-agent.md"), path.join(workspace, "AGENTS.md"));
fs.writeFileSync(path.join(dir, "openclaw.json"), JSON.stringify(config, null, 2));
console.log(`Bounty profile ready: ${path.join(dir, "openclaw.json")} (port ${config.gateway.port})`);
