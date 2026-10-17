import { ctx } from "@/lib/auth";
import { limited } from "@/lib/rate";
import { reassess } from "@/lib/process";
import { withTimeout } from "@/lib/ingest";
export const maxDuration = 60;
export async function POST(req) {
  const c = await ctx(req); if (!c) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (await limited(c.db, "reanalyse:" + c.userId, 5, 60)) return Response.json({ error: "rate limited" }, { status: 429 });
  const { id } = await req.json().catch(() => ({}));
  const { data: org } = await c.db.from("organizations").select("*").eq("id", c.orgId).single();
  let q = c.db.from("opportunities").select("*").eq("organization_id", c.orgId).neq("status", "Archived");
  q = id ? q.eq("id", id) : q.lt("vault_version_at_analysis", org.vault_version).limit(25);
  const { data: opps } = await q; let done = 0, failed = 0;
  for (const opp of opps || []) { try { await withTimeout(reassess({ db: c.db, opp, org, actor: c.userId }), 20000); done++; } catch { failed++; } }
  return Response.json({ refreshed: done, failed });
}
