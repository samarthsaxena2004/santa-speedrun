#!/usr/bin/env node
// Stdio version of the gift-shelf MCP server (fallback / Speed Bounty runs
// without the web app). The web app serves the same tool over HTTP at /mcp,
// which is faster because OpenClaw doesn't have to spawn a process per run.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGiftTool } from "./gift-tool.mjs";

const EVENTS_URL = process.env.SANTA_EVENTS_URL || "http://127.0.0.1:8787/api/tool-events";

function emit(event) {
  fetch(EVENTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(400),
  }).catch(() => {});
}

const server = new McpServer({ name: "santa-gift-shelf", version: "1.0.0" });
registerGiftTool(server, emit);
await server.connect(new StdioServerTransport());
