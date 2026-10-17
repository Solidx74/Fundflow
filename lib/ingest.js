import { processGrant } from "./process.js";
import { aiMode } from "./extract.js";
import { limited } from "./rate.js";
export const FAIL = "I received your message but couldn't finish processing it. You can retry or add the opportunity manually in FundFlow.";
export const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(Object.assign(new Error("timeout"), { stage: "timeout" })), ms))]);
export async function ingest({ db, msgId, orgId, body, img }) {
  const fin = (patch) => db.from("inbound_messages").update({ organization_id: orgId, ...patch, processed_at: new Date().toISOString() }).eq("id", msgId);
  const failNotify = async (why) => { const { data } = await db.from("organization_members").select("user_id").eq("organization_id", orgId).in("role", ["owner", "admin"]); if (data?.length) await db.from("notifications").insert(data.map((m) => ({ organization_id: orgId, user_id: m.user_id, type: "whatsapp_failure", title: "WhatsApp message failed: " + why }))); };
  if (await limited(db, "org:" + orgId + ":ai-day", 200, 86400)) { await fin({ processing_status: "failed", error_message: "rate: daily intake limit reached" }); return "Your organization reached today's intake limit. Try again tomorrow or add the grant manually."; }
  await db.from("inbound_messages").update({ processing_status: "processing", organization_id: orgId }).eq("id", msgId);
  const useImg = aiMode() === "live" ? img : null;
  if (!body.trim() && !useImg) { await fin({ processing_status: "unsupported", error_message: img ? "image analysis needs an AI key" : "empty message" }); return img ? "I received an image but image analysis is not enabled. Please send the grant link or text." : "Send a grant link, text or flyer photo."; }
  try {
    const r = await withTimeout(processGrant({ db, orgId, text: body || "(image)", imageUrl: useImg, via: "whatsapp" }), 24000);
    await fin({ processing_status: r.result === "duplicate" ? "duplicate" : "processed", opportunity_id: r.opp.id, error_message: null });
    if (r.result === "duplicate") return "This opportunity appears to be in your pipeline already. Check your FundFlow workspace.";
    const o = r.opp, lab = { likely_eligible: "Likely eligible", needs_review: "Needs review", likely_ineligible: "Likely ineligible" }[o.eligibility_status];
    return r.result === "added" ? `FundFlow added: ${o.grant_title}. Alignment: ${o.alignment_score}/100. Deadline: ${o.deadline || "Unknown"}. Eligibility: ${lab}. Open your workspace to review and assign.` : `I received ${o.grant_title}, but some eligibility information could not be verified (${lab}). It has been added to your pipeline for review.`;
  } catch (e) { await fin({ processing_status: "failed", error_message: `${e.stage || "unknown"}: ${String(e.message || e).slice(0, 200)}` }); await failNotify(e.stage || "unknown").catch(() => {}); return FAIL; }
}
