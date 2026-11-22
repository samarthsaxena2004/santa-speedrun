#!/usr/bin/env node
// Starts the OpenClaw gateway for the isolated "santa" profile with your
// .env loaded (CEREBRAS_API_KEY + SANTA_GATEWAY_TOKEN).
//   npm run gateway
// Set OPENCLAW_BIN if `openclaw` isn't on your PATH.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(ROOT, ".env");
if (!fs.existsSync(envFile)) {
  console.error("No .env yet. Run: npm run setup");
  process.exit(1);
}
const env = { ...process.env };
for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// Keep loopback calls (gateway <-> web app) off any corporate proxy.
env.NO_PROXY = [env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");

const bin = env.OPENCLAW_BIN || "openclaw";
const args = ["--profile", "santa", "gateway", ...process.argv.slice(2)];

console.log(`> ${bin} ${args.join(" ")}`);
const child = spawn(bin, args, { env, stdio: "inherit", shell: process.platform === "win32" });
child.on("error", (e) => {
  console.error(`\nCould not start "${bin}": ${e.message}`);
  console.error("Install OpenClaw (https://openclaw.ai/install) or set OPENCLAW_BIN=/path/to/openclaw in .env");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
