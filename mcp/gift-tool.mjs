// The one tool the Santa agent gets: find_gifts.
// Shared by the HTTP MCP endpoint (inside server.mjs) and the stdio server.

import { z } from "zod";
import { searchProducts } from "./shop-client.mjs";

export function registerGiftTool(server, emit = () => {}) {
  server.registerTool(
    "find_gifts",
    {
      title: "Find gifts",
      description:
        "Search real online stores (Shopify catalog) for gift ideas. Pass 3-6 short product searches; all run in parallel in ONE call. Returns real products with id, title, price, store and exact product URL.",
      inputSchema: {
        queries: z
          .array(z.string().min(2).max(60))
          .min(1)
          .max(6)
          .describe("Short, concrete product searches, e.g. 'cricket bat grip', 'heated neck massager'"),
        max_price_usd: z.number().positive().optional().describe("Optional budget cap per gift in USD"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ queries, max_price_usd }) => {
      const started = Date.now();
      emit({ type: "search_start", queries, at: started });

      const settled = await Promise.all(
        queries.map(async (q, qi) => {
          const t0 = Date.now();
          try {
            // Stable short ids by shelf: 1a, 1b, ... 2a, 2b ...
            const items = (await searchProducts(q, { maxPriceUsd: max_price_usd, limit: 4 })).map((p, j) => ({
              id: `${qi + 1}${"abcdefgh"[j]}`,
              ...p,
            }));
            emit({ type: "search_done", query: q, index: qi, items, ms: Date.now() - t0 });
            return { q, items };
          } catch (err) {
            const error = String(err?.message || err);
            emit({ type: "search_error", query: q, index: qi, error });
            return { q, items: [], error };
          }
        }),
      );

      // Compact, token-cheap text for the model. Images stay out of the prompt.
      const seen = new Set();
      const lines = [];
      for (const { q, items, error } of settled) {
        lines.push(`## ${q}`);
        if (error) lines.push(`(search failed: ${error})`);
        for (const it of items) {
          if (seen.has(it.url)) continue;
          seen.add(it.url);
          const stars = it.rating ? ` | ★${it.rating.value}(${it.rating.count})` : "";
          lines.push(`${it.id} | ${it.title} | ${it.price} | ${it.store}${stars} | ${it.url}`);
        }
        if (!items.length && !error) lines.push("(no results)");
      }
      const ms = Date.now() - started;
      lines.push(`\n${seen.size} real products in ${ms} ms. Copy id/title/price/store/url exactly.`);
      emit({ type: "search_all_done", ms, count: seen.size });

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
