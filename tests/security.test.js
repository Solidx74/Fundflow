// Static regression checks (read source files). They do not replace live security testing.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
const read = (f) => readFileSync(f, "utf8");
describe("secrets and server-only code stay out of the browser", () => {
  it("client files reference no server secrets or server-only modules", () => {
    for (const f of ["app/page.js", "app/app/page.js", "app/layout.js", "lib/supabase.js"]) for (const bad of ["SERVICE_ROLE", "OPENAI_API_KEY", "TWILIO_AUTH_TOKEN", "CRON_SECRET", "@/lib/auth", "@/lib/grant", "@/lib/process", "@/lib/ingest", "@/lib/extract", "@/lib/rate"]) expect(read(f).includes(bad), `${f} references ${bad}`).toBe(false);
  });
  it(".env.example: only the URL and anon key are public, no real-looking values", () => {
    const lines = read(".env.example").split("\n").filter((l) => /^[A-Z_]+=/.test(l));
    for (const l of lines) { const [k, ...v] = l.split("="); const val = v.join("=").split("#")[0].trim(); if (k.startsWith("NEXT_PUBLIC_")) expect(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]).toContain(k); expect(/sk-|eyJ|AC[0-9a-f]{20}/.test(val), k).toBe(false); }
  });
  it("every API route authenticates the caller or verifies a secret or signature", () => {
    for (const d of readdirSync("app/api")) { const s = read(`app/api/${d}/route.js`); expect(/ctx\(req\)|valid\(req|CRON_SECRET/.test(s), `route ${d}`).toBe(true); }
  });
  it("the demo signature bypass is disabled in production", () => expect(read("app/api/whatsapp/route.js")).toMatch(/WHATSAPP_DEMO === "1" && process\.env\.NODE_ENV !== "production"/));
  it("package pins a Node version for deployment", () => { expect(JSON.parse(read("package.json")).engines.node).toBeTruthy(); });
});
describe("deployment safety", () => {
  it("every GET route handler is forced dynamic so it never executes at build time", () => {
    for (const d of readdirSync("app/api")) { const s = read(`app/api/${d}/route.js`); if (/export async function GET/.test(s)) expect(s, `route ${d}`).toMatch(/export const dynamic = "force-dynamic"/); }
  });
});
