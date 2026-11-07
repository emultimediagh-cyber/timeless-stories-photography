/**
 * Post-build script: patches .output/server/wrangler.json to add the KV
 * namespace binding that Cloudflare Workers Builds doesn't include automatically.
 *
 * The KV namespace ID is read from the KV_NAMESPACE_ID environment variable
 * (set in Cloudflare Workers Builds → Settings → Environment variables).
 * If the variable is not set, the script is a no-op (the site still works
 * for SSR; only photo uploads/listing need KV).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const wranglerPath = join(process.cwd(), ".output", "server", "wrangler.json");

if (!existsSync(wranglerPath)) {
  console.log("[patch-wrangler] No wrangler.json found, skipping.");
  process.exit(0);
}

const namespaceId = process.env.KV_NAMESPACE_ID;

if (!namespaceId) {
  console.log("[patch-wrangler] KV_NAMESPACE_ID not set — skipping KV binding. Photo uploads will not work until it's configured.");
  process.exit(0);
}

const raw = readFileSync(wranglerPath, "utf-8");
const config = JSON.parse(raw);

// Add the KV namespace binding.
config.kv_namespaces = [
  ...(config.kv_namespaces ?? []),
  { binding: "GALLERY_KV", id: namespaceId },
];

writeFileSync(wranglerPath, JSON.stringify(config, null, 2));
console.log(`[patch-wrangler] Added GALLERY_KV binding (namespace id: ${namespaceId}).`);
