import { ctx } from "@/lib/auth";
import { limited } from "@/lib/rate";
import { ingest, FAIL } from "@/lib/ingest";
export const maxDuration = 30;
// Admin retry of a failed text message. claim_retry is an atomic compare-and-set with a cap of 3, so concurrent retries cannot double-process.
// Images are not stored, so they cannot be retried.
export async function POST(req) {
  const c = await ctx(req); if (!c || c.role === "member") return Response.json({ error: "forbidden" }, { status: 403 });
  if (await limited(c.db, "retry:" + c.userId, 10, 60)) return Response.json({ error: "rate limited" }, { status: 429 });
  const { messageId } = await req.json().catch(() => ({}));
  const { data: m } = await c.db.rpc("claim_retry", { p_id: messageId, p_org: c.orgId });
  if (!m?.id) return Response.json({ error: "Nothing to retry (not failed, already in progress, retry limit reached, or empty)" }, { status: 409 });
  const reply = await ingest({ db: c.db, msgId: m.id, orgId: c.orgId, body: m.message_text, img: null });
  return Response.json({ ok: reply !== FAIL, reply });
}
