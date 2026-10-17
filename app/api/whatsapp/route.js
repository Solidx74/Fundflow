import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { admin } from "@/lib/auth";
import { limited } from "@/lib/rate";
import { ingest } from "@/lib/ingest";
export const maxDuration = 30;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const xml = (m) => new Response(m ? `<Response><Message>${esc(m)}</Message></Response>` : "<Response/>", { headers: { "Content-Type": "text/xml" } });
// Canonical URL comes from APP_BASE_URL, never from forwarded headers.
function valid(req, p) {
  if (process.env.WHATSAPP_DEMO === "1" && process.env.NODE_ENV !== "production") return true;
  const sig = req.headers.get("x-twilio-signature") || ""; if (!process.env.TWILIO_AUTH_TOKEN || !process.env.APP_BASE_URL || !sig) return false;
  const want = createHmac("sha1", process.env.TWILIO_AUTH_TOKEN).update(process.env.APP_BASE_URL.replace(/\/+$/, "") + "/api/whatsapp" + Object.keys(p).sort().map((k) => k + p[k]).join("")).digest("base64");
  return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
async function media(u) {
  const h = new URL(u);
  if (h.protocol !== "https:" || !/(^|\.)(twilio\.com|twiliocdn\.com)$/.test(h.hostname)) throw new Error("untrusted media host");
  let r = await fetch(u, { headers: { Authorization: "Basic " + Buffer.from(process.env.TWILIO_ACCOUNT_SID + ":" + process.env.TWILIO_AUTH_TOKEN).toString("base64") }, redirect: "manual", signal: AbortSignal.timeout(8000) });
  if (r.status >= 300 && r.status < 400) { const l = new URL(r.headers.get("location"), u); if (l.protocol !== "https:") throw new Error("bad redirect"); r = await fetch(l, { redirect: "manual", signal: AbortSignal.timeout(8000) }); } // never forward credentials
  const ct = (r.headers.get("content-type") || "").split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(ct) || +(r.headers.get("content-length") || 0) > 4e6) throw new Error("unsupported media");
  const b = Buffer.from(await r.arrayBuffer()); if (b.length > 4e6) throw new Error("media too large");
  return `data:${ct};base64,` + b.toString("base64");
}
export async function POST(req) {
  const p = Object.fromEntries((await req.formData()).entries());
  if (!valid(req, p)) return new Response("forbidden", { status: 403 });
  const db = admin(), from = p.From, body = String(p.Body || "").slice(0, 20000);
  const ins = await db.from("inbound_messages").insert({ provider: "twilio", provider_message_id: p.MessageSid, sender_phone: from, message_type: p.MediaUrl0 ? "image" : "text", message_text: body, media_reference: p.MediaUrl0 || null }).select("id").single();
  if (ins.error) return xml(""); // redelivery of a known MessageSid: no second record, no second reply. Failed ones are retried from the Team/WhatsApp tab.
  const id = ins.data.id, fin = (patch) => db.from("inbound_messages").update({ ...patch, processed_at: new Date().toISOString() }).eq("id", id);
  const v = body.trim().match(/^VERIFY\s+([A-Z0-9]{6})$/i);
  if (v) {
    const h = createHash("sha256").update(v[1].toUpperCase()).digest("hex");
    const { data: s } = await db.from("whatsapp_senders").select("id,organization_id").eq("phone_number", from).eq("code_hash", h).eq("verification_status", "pending").gt("code_expires_at", new Date().toISOString()).maybeSingle();
    if (!s) { await fin({ processing_status: "unmapped", error_message: "bad or expired code", message_text: "VERIFY ******" }); return xml("Verification code not recognised or expired."); }
    await db.from("whatsapp_senders").update({ verification_status: "verified", verified_at: new Date().toISOString(), code_hash: null, code_expires_at: null }).eq("id", s.id);
    await fin({ organization_id: s.organization_id, processing_status: "verified", message_text: "VERIFY ******" }); return xml("Number verified. Forward a grant link, text or flyer photo.");
  }
  const { data: s } = await db.from("whatsapp_senders").select("organization_id").eq("phone_number", from).eq("verification_status", "verified").maybeSingle();
  if (!s) { await fin({ processing_status: "unmapped", error_message: "unverified sender" }); return xml("This number is not verified for any organization. Add it in FundFlow under WhatsApp, then reply VERIFY <code>."); }
  if (await limited(db, "wa:" + from, 20, 60)) { await fin({ organization_id: s.organization_id, processing_status: "failed", error_message: "rate: too many messages" }); return xml("Too many messages. Please wait a minute."); }
  let img = null; if (p.MediaUrl0 && process.env.TWILIO_ACCOUNT_SID) { try { img = await media(p.MediaUrl0); } catch {} }
  return xml(await ingest({ db, msgId: id, orgId: s.organization_id, body, img }));
}
