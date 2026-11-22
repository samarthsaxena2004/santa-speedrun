# 🎅 Santa Speedrun ⚡

**Describe anyone in one line. Get 5 real gifts from 5 real stores in a few seconds.**

An [OpenClaw](https://openclaw.ai) agent running **Kimi K3.1 Pro on Cerebras**. It reads the vibe, searches 5 real store shelves in parallel (Shopify Catalog), picks the best gift from each, roasts the person a little, and writes a gift tag. Every product is real and links to the store's own product page.

Next to it, the exact same answer is replayed at the median speed of other Kimi K3.1 Pro APIs, so you can see what the speed buys you.

Built for the Cerebras × Kimi K3.1 Pro × OpenClaw hackathon. #KimiOnCerebras

---

## How it works

```
Browser UI ──POST /api/run──▶ web app (server.mjs) ──/v1/chat/completions──▶ OpenClaw gateway
     ▲                              │  hosts MCP tool at /mcp ◀───────────────── agent "santa"
     └──── live SSE: shelves,       │                                              │
           cards, timers            ▼                                              ▼
                              Shopify Catalog (Shop MCP)                 Kimi K3.1 Pro on Cerebras
                              5 searches in parallel
```

1. The **santa** agent (OpenClaw) gets one tool, `find_gifts`, and a short instruction file.
2. Kimi calls `find_gifts` once with 5 short searches. The tool runs them in parallel against Shopify's catalog and returns a compact list (about 1.5K tokens instead of hundreds of KB of raw product JSON).
3. Kimi picks one product per shelf and streams back JSON: a roast, then 5 gifts with `why` and a gift tag. Cards pop in as each gift object completes.
4. Product photos, prices and links in the UI come from the tool results, not from the model, so links can't be made up.

Speed choices: thinking `low` (Kimi on Cerebras rejects `none`), one tool with direct schemas (no tool-search round trip), no bootstrap files besides the agent's instructions, and the tool is served over HTTP by the already-running web app, so OpenClaw doesn't spawn a process per run.

## Run it

Needs **Node 24.16+** (OpenClaw 2026.11 requires it), **OpenClaw** installed (`openclaw --version`), and a **Cerebras API key with Kimi K3.1 Pro preview access**.

```bash
npm install
npm run setup          # paste your csk-... key. Creates an isolated OpenClaw profile "santa"
npm run check:kimi     # 1 tiny call: proves your key can use Kimi K3.1 Pro on Cerebras
npm run check:shop     # proves real-store search works (no key needed)
```

Then two terminals:

```bash
npm start              # terminal 1: web app + gift tool -> http://127.0.0.1:8787
npm run gateway        # terminal 2: OpenClaw gateway (profile "santa", port 18790)
```

Warm everything up once from a third terminal, then open the UI:

```bash
npm run check:gateway -- --run "my dad who says he wants nothing"
```

Open **http://127.0.0.1:8787**, type a person or press **1–5** for presets. `/` focuses the input.

`npm run mock` runs the UI with fake data and no AI, for rehearsing layout only. It shows a red MOCK banner. Never record a submission in mock mode.

### What setup writes

| File | What |
|---|---|
| `~/.openclaw-santa/openclaw.json` | Gateway (loopback, token auth, chat-completions endpoint on), Cerebras provider with `moonshotai-kimi-k3.1-pro-trial`, the `elf` MCP server, agents `santa` and `speedy` |
| `~/.openclaw-santa/workspace-santa/AGENTS.md` | The santa agent's instructions (`agent/santa-agent.md`) |
| `~/.openclaw-santa/workspace-speedy/AGENTS.md` | Speed Bounty agent (`agent/speedy-agent.md`) |
| `./.env` | Your key + a random gateway token. Git-ignored. Never show it on screen. |

Your normal `~/.openclaw` setup is not touched.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `check:kimi` says model not found / 404 | Your key doesn't have the Kimi preview. It required the capacity form (Org ID) before the deadline. |
| `check:kimi` 429 or very slow | Hackathon tier is 100 RPM / 100K tokens per minute, and the endpoint can queue. A run uses roughly 7K tokens. Wait 30 s and retry. |
| `openclaw: command not found` | Add `OPENCLAW_BIN=/full/path/to/openclaw` to `.env`. |
| OpenClaw complains about Node | Install Node 24.16+ (`nvm install 24`). |
| UI says it can't reach the gateway | Is `npm run gateway` running? Port busy? Set `SANTA_GATEWAY_PORT=18791` and re-run `npm run setup`. |
| Error mentioning `reasoning_effort` | In `setup.mjs`, set `supportsReasoningEffort: false`, re-run setup, restart the gateway. |
| Different model id | `KIMI_MODEL_ID=... npm run setup` |
| First run takes much longer | Normal cold start. Do 2 warm-up runs before recording. |
| Tool not found / no shelves appear | Start `npm start` before running, or use `npm run setup -- --stdio` so OpenClaw launches the tool itself. |

## Honest comparison

The right-hand lane is a replay, not a live GPU call. It shows the same answer text at the median output speed of 16 Kimi K3.1 Pro API endpoints (112.2 tok/s, Artificial Analysis data, Nov 17 2026). It is conservative: it gets Cerebras's head start (same search time and first-token time), and only the final answer is replayed. Change it with `GPU_TPS`, `GPU_LABEL`, `GPU_SOURCE` in `.env` (for example `GPU_TPS=258.5` for the fastest endpoint in that dataset).

## Credits

Kimi K3.1 Pro by Moonshot AI · inference by Cerebras · agent harness by OpenClaw · products via Shopify Catalog (Shop MCP). MIT licensed.
