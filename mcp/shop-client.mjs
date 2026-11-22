// Minimal client for Shopify's Shop MCP (https://mcp.shop.com).
// Search is anonymous: no API key. Shop speaks MCP protocol 2026-07-28
// (stateless: every request carries _meta + Mcp-Method headers).

const SHOP_URL = process.env.SHOP_MCP_URL || "https://mcp.shop.com";
const PROTOCOL = "2026-07-28";
const META = {
  "io.modelcontextprotocol/protocolVersion": PROTOCOL,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "santa-speedrun", version: "1.0.0" },
};

let nextId = 1;

async function callShopTool(name, args, timeoutMs = 9000) {
  const res = await fetch(SHOP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: { name, arguments: args, _meta: META },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  // Usually JSON; tolerate an SSE-framed reply just in case.
  const body = raw.trim().startsWith("{")
    ? JSON.parse(raw)
    : JSON.parse(
        raw
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .pop() || "{}",
      );
  if (body.error) throw new Error(`Shop ${res.status}: ${body.error.message}`);
  const result = body.result || {};
  if (result.structuredContent) return result.structuredContent;
  const text = (result.content || []).find((c) => c.type === "text")?.text;
  return text ? JSON.parse(text) : {};
}

function money(price) {
  if (!price || typeof price.amount !== "number") return "";
  const cur = price.currency || "USD";
  const minor = cur === "JPY" || cur === "KRW" ? 0 : 2;
  const value = price.amount / 10 ** minor;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(value);
  } catch {
    return `${value.toFixed(minor)} ${cur}`;
  }
}

function clean(s, max) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// Turn one verbose Shop product into a compact, link-safe record.
export function compactProduct(p) {
  const v = (p.variants || []).find((x) => x?.availability?.available !== false) || (p.variants || [])[0] || {};
  const image = v.media?.[0]?.url || p.media?.[0]?.url || p.media?.[0]?.preview?.url || "";
  const url = v.url || p.url || v.seller?.url || "";
  const rating = p.rating?.value ? { value: p.rating.value, count: p.rating.count || 0 } : null;
  return {
    title: clean(p.title || v.title, 90),
    price: money(v.price || p.price_range?.min),
    store: clean(v.seller?.name || "", 40),
    storeUrl: v.seller?.url || "",
    url,
    image,
    rating,
  };
}

export async function searchProducts(query, { country = "US", currency = "USD", maxPriceUsd, limit = 4 } = {}) {
  const catalog = {
    query,
    context: { address_country: country, currency, intent: "christmas gift" },
    pagination: { limit },
  };
  if (maxPriceUsd) catalog.filters = { price: { max: Math.round(maxPriceUsd * 100) } };
  const data = await callShopTool("search_catalog", { catalog });
  return (data.products || []).map(compactProduct).filter((p) => p.url && p.title);
}
