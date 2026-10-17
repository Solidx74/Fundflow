export const dynamic = "force-dynamic"; // never run at build time
import { timingSafeEqual } from "node:crypto";
import { admin } from "@/lib/auth";
const ok = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Scheduled daily by vercel.json. Requires CRON_SECRET (Vercel sends it as a Bearer token).
export async function GET(req) {
  if (!process.env.CRON_SECRET || !ok(req.headers.get("authorization") || "", "Bearer " + process.env.CRON_SECRET)) return new Response("forbidden", { status: 403 });
  const { data, error } = await admin().rpc("notify_deadlines"); return error ? Response.json({ error: "failed" }, { status: 500 }) : Response.json({ created: data });
}
