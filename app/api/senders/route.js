import { createHash, randomBytes } from "node:crypto";
import { ctx } from "@/lib/auth";
// Owners/admins only. The one-time code is returned to the requesting admin and expires in 15 minutes.
export async function POST(req) {
  const c = await ctx(req); if (!c || c.role === "member") return Response.json({ error: "forbidden" }, { status: 403 });
  const phone = String((await req.json()).phone || "").replace(/[^\d+]/g, ""); if (!/^\+\d{8,15}$/.test(phone)) return Response.json({ error: "Use international format, e.g. +8801XXXXXXXXX" }, { status: 400 });
  const num = "whatsapp:" + phone, code = randomBytes(3).toString("hex").toUpperCase();
  const patch = { code_hash: createHash("sha256").update(code).digest("hex"), code_expires_at: new Date(Date.now() + 15 * 60000).toISOString() };
  const { data: ex } = await c.db.from("whatsapp_senders").select("id,organization_id,verification_status").eq("phone_number", num).maybeSingle();
  if (ex && (ex.organization_id !== c.orgId || ex.verification_status === "verified")) return Response.json({ error: "Number already registered" }, { status: 409 });
  const { error } = ex ? await c.db.from("whatsapp_senders").update(patch).eq("id", ex.id) : await c.db.from("whatsapp_senders").insert({ organization_id: c.orgId, phone_number: num, verification_status: "pending", ...patch });
  return error ? Response.json({ error: "Could not register number" }, { status: 500 }) : Response.json({ code, expires_minutes: 15 });
}
