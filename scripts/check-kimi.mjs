#!/usr/bin/env node
// Step 0: prove your key can reach Kimi K3.1 Pro on Cerebras (one tiny call).
//   npm run check:kimi
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile))
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !line.trim().startsWith("#") && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }

const key = env.CEREBRAS_API_KEY;
const model = env.KIMI_MODEL_ID || "moonshotai-kimi-k3.1-pro-trial";
if (!key) {
  console.error("Set CEREBRAS_API_KEY (run `npm run setup` or export it).");
  process.exit(1);
}

const t0 = Date.now();
const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages: [{ role: "user", content: "Write one short, cheerful sentence about Christmas shopping." }],
    reasoning_effort: "low",
    max_completion_tokens: 200,
  }),
});
const ms = Date.now() - t0;
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`❌ ${res.status} after ${ms} ms:`, JSON.stringify(body).slice(0, 600));
  if (res.status === 404 || /model/i.test(JSON.stringify(body)))
    console.error("   The model isn't enabled for this key. Kimi access needed the capacity form (Org ID) before the deadline.");
  if (res.status === 401) console.error("   Key rejected. Re-copy it from cloud.cerebras.ai.");
  if (res.status === 429) console.error("   Rate limited or queued. Wait 30s and retry.");
  process.exit(1);
}
const u = body.usage || {};
const ti = body.time_info || {};
console.log(`✅ Kimi on Cerebras works (${ms} ms round trip)`);
console.log("   reply:", (body.choices?.[0]?.message?.content || "").trim());
console.log(`   tokens: ${u.prompt_tokens} in / ${u.completion_tokens} out`);
if (ti.completion_time && u.completion_tokens)
  console.log(`   server speed: ${Math.round(u.completion_tokens / ti.completion_time)} tok/s`);
const rl = [...res.headers].filter(([k]) => k.startsWith("x-ratelimit"));
if (rl.length) console.log("   rate limits:", Object.fromEntries(rl));
