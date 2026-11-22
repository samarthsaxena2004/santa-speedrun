#!/usr/bin/env node
// Prove the real-store search works (no key needed).
//   npm run check:shop -- "cozy blanket"
import { searchProducts } from "../mcp/shop-client.mjs";

const q = process.argv.slice(2).join(" ") || "christmas gift for dad";
const t0 = Date.now();
const items = await searchProducts(q, { limit: 4 });
console.log(`✅ ${items.length} real products for "${q}" in ${Date.now() - t0} ms`);
for (const p of items) console.log(`   ${p.price.padEnd(9)} ${p.title}  (${p.store})\n             ${p.url}`);
