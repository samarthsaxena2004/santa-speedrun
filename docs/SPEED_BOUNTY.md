# Speed Bounty: Santa's Speedy Shopper ($1,000, fastest TPS)

Rules recap: OpenClaw + Kimi K3.1 Pro on Cerebras finds 5 real Christmas gifts from real shopping sites. The video must show 5 real products with links and your top TPS, measured with the **official OpenClaw speed patch**. Post the video in Discord `#share-your-demo` with the TPS in the text, e.g. `Speed Bounty entry: 1,234 TPS`. Deadline Sun 22 Nov, 10:00 AM PT (11:30 PM IST).

The patch is linked in the organizers' Hackathon Guide (Google Doc) as "openclaw-speed-patch". **Don't use the patched build for your public X/Reddit demo.**

## Run it with this project

This project already ships a lean agent for it: **`speedy`** (one tool, 5 parallel searches in one call, thinking `low`, temperature 0, plain list output).

1. Build the speed-patched OpenClaw **in a separate folder**, following the patch's instructions. It needs Node 24.22+ and pnpm 12.15.
2. Create its own profile. The patched build is older than the release and can't open the release's state database:
   ```bash
   npm run setup
   node scripts/bounty-profile.mjs
   ```
3. Keep `npm start` running (it serves the gift tool).
4. Start the patched gateway on port 18791:
   ```bash
   node --env-file=.env /path/to/patched/openclaw.mjs --profile santa-bounty gateway
   ```
5. Open its web chat, where the TPS readout lives:
   ```bash
   node --env-file=.env /path/to/patched/openclaw.mjs --profile santa-bounty dashboard
   ```
6. Start a **new chat**, pick agent **speedy**, and send: `Find 5 Christmas gifts`.
7. Repeat in new chats. Record the best one showing the TPS readout and the 5 products with links. Click one or two links on camera to prove they're real.

## What tends to raise TPS

The patch reports `<mean> tok/s mean · <p90> p90 (server)`. Each model call's rate is `usage.completion_tokens / time_info.completion_time`, from Cerebras's final stream chunk, and **the mean is the plain average of those per-call rates**. Queueing, network and tool time don't count. Enter the **mean** figure.

- **Start a new chat for every attempt.** The session readout averages every call in the session, so warm-ups and slow runs drag it down.
- The short tool-call step counts as one full call in the mean, the same as the long answer. Keep each run to exactly two calls: one tool call, one answer.
- Low thinking (already set). `none`, `minimal` and `xhigh` return HTTP 400.
- Temperature 1, the patch's suggested value (already set). It beat temperature 0 in our runs.
- Five specific search phrases, the first product per search, and a `title | url` answer (already set). Each call has a fixed startup cost, so slightly longer, highly predictable output scores better than very short output.
- Server load moves the score a lot from run to run, so retry several runs and keep the best.

The patch is built on OpenClaw commit `8b18b55` (Oct 29), not release 2026.11.6, which is why it uses its own profile.
