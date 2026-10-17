import { createClient } from "@supabase/supabase-js";
export const asUser = (token) => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: "Bearer " + token } } });
export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
// Resolve org from verified membership. Never trust an org id from the browser.
export async function ctx(req) {
  const db = admin(); const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const { data: u } = await db.auth.getUser(token); if (!u?.user) return null;
  const { data: m } = await db.from("organization_members").select("organization_id,role").eq("user_id", u.user.id).maybeSingle();
  return m ? { db, ud: asUser(token), userId: u.user.id, orgId: m.organization_id, role: m.role } : null;
}
