import { createHash, randomBytes } from "node:crypto";
import { ctx } from "@/lib/auth";
// Dev-mode delivery: link returned once to the inviter, no email sent. Only the owner may mint admins.
export async function POST(req) {
  const c = await ctx(req); if (!c || c.role === "member") return Response.json({ error: "forbidden" }, { status: 403 });
  const { email, role } = await req.json();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "") || !["admin", "member"].includes(role)) return Response.json({ error: "invalid input" }, { status: 400 });
  if (role === "admin" && c.role !== "owner") return Response.json({ error: "Only the owner can invite admins" }, { status: 403 });
  const token = randomBytes(24).toString("hex");
  const { error } = await c.db.from("organization_invites").insert({ organization_id: c.orgId, email: email.toLowerCase(), role, token_hash: createHash("sha256").update(token).digest("hex"), created_by: c.userId });
  return error ? Response.json({ error: "Could not create invite" }, { status: 500 }) : Response.json({ link: `${process.env.APP_BASE_URL || ""}/app?invite=${token}`, expires_days: 7 });
}
