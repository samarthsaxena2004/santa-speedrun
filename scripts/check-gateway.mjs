#!/usr/bin/env node
// Check the OpenClaw gateway is up and the santa agent is routable.
//   npm run check:gateway            (no tokens spent)
//   npm run check:gateway -- --run   (one full real run, printed in the terminal)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
  if (m && !line.trim().startsWith("#") && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const base = (env.GATEWAY_URL || "http://127.0.0.1:18790").replace(/\/$/, "");
const auth = { Authorization: `Bearer ${env.SANTA_GATEWAY_TOKEN}` };

try {
  const r = await fetch(`${base}/v1/models`, { headers: auth });
  const j = await r.json();
  const ids = (j.data || []).map((m) => m.id);
  if (!ids.includes("openclaw/santa")) throw new Error(`santa agent not listed: ${JSON.stringify(j).slice(0, 300)}`);
  console.log(`✅ Gateway up at ${base}. Agents: ${ids.join(", ")}`);
} catch (e) {
  console.error(`❌ Gateway check failed: ${e.message}\n   Is \`npm run gateway\` running?`);
  process.exit(1);
}

if (process.argv.includes("--run")) {
  const prompt = process.argv.slice(2).filter((a) => a !== "--run").join(" ") || "my dad who says he wants nothing";
  console.log(`\n▶ Running santa agent: "${prompt}"\n`);
  const t0 = Date.now();
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openclaw/santa", stream: false, messages: [{ role: "user", content: prompt }] }),
  });
  const j = await res.json();
  const ms = Date.now() - t0;
  if (!res.ok) {
    console.error(`❌ ${res.status}:`, JSON.stringify(j).slice(0, 800));
    process.exit(1);
  }
  const text = j.choices?.[0]?.message?.content || "";
  console.log(text);
  try {
    const parsed = JSON.parse(text);
    console.log(`\n✅ ${parsed.gifts?.length || 0} gifts in ${ms} ms. usage:`, j.usage);
  } catch {
    console.log(`\n⚠️  Reply wasn't pure JSON (${ms} ms). The UI tolerates this only if it still contains the gifts array.`);
  }
}
