# Speed Bounty: Santa's Speedy Shopper ($1,000, fastest TPS)

Rules recap: OpenClaw + Kimi K3.1 Pro on Cerebras finds 5 real Christmas gifts from real shopping sites. The video must show 5 real products with links and your top TPS, measured with the **official OpenClaw speed patch**. Post the video in Discord `#share-your-demo` with the TPS in the text, e.g. `Speed Bounty entry: 1,234 TPS`. Deadline Sun 22 Nov, 10:00 AM PT (11:30 PM IST).

The patch is linked in the organizers' Hackathon Guide (Google Doc) as "openclaw-speed-patch". **Don't use the patched build for your public X/Reddit demo.**

## Run it with this project

This project already ships a lean agent for it: **`speedy`** (one tool, 5 parallel searches in one call, thinking `low`, temperature 0, plain list output).

1. Install the speed-patched OpenClaw **in a separate folder**, following the patch's instructions, so your normal install stays clean.
2. Point the launcher at it and start the gateway with the same profile:
   ```bash
   OPENCLAW_BIN=/path/to/patched/openclaw npm run gateway
   ```
   (Windows PowerShell: `$env:OPENCLAW_BIN="C:\path\to\openclaw.cmd"; npm run gateway`)
3. Keep `npm start` running (it serves the gift tool).
4. Open the OpenClaw UI for this profile: `openclaw --profile santa dashboard` (use the patched binary if the TPS readout lives in its UI). Pick agent **speedy** and send: `Find 5 Christmas gifts`.
5. Do several runs. Record the best one showing the TPS readout and the 5 products with links. Click one or two links on camera to prove they're real.

## What tends to raise TPS

The patch reports `<mean> tok/s mean · <p90> p90 (server)`. Each model call's rate is `usage.completion_tokens / time_info.completion_time`, from Cerebras's final stream chunk, and **the mean is the plain average of those per-call rates**. Queueing, network and tool time don't count. Enter the **mean** figure.

- **Start a new chat for every attempt.** The session readout averages every call in the session, so warm-ups and slow runs drag it down.
- The short tool-call step counts as one full call in the mean, the same as the long answer. Keep each run to exactly two calls: one tool call, one answer.
- Low thinking (already set). `none`, `minimal` and `xhigh` return HTTP 400.
- **Test temperature both ways.** The `speedy` agent uses 0, but the patch's README suggests `temperature=1.0`. Change it in `setup.mjs`, re-run setup, restart the gateway, and keep whichever measures faster.
- A short, fixed output format (already set). Retry several runs and keep the best.

The patch is built on OpenClaw commit `8b18b55` (Oct 29), not release 2026.11.6. The config keys this project uses exist in both, but the profile has not been run on the patched build yet.
