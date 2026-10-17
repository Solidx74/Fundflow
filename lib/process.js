import { createHash } from "node:crypto";
import { extract, strategise, aiMode } from "./extract.js";
import { assess } from "./score.js";
import { safeFetchText } from "./safeFetch.js";

async function run(g, org) {
  let st = { thematic_alignment: null, strategy: "", next_steps: [] }, aiFail = false;
  try { st = await strategise(g, org); } catch { aiFail = true; }
  const a = assess(g, org, st.thematic_alignment);
  return { a, aiFail, fields: { eligibility_status: a.eligibility_status, eligibility_findings: a.findings, alignment_score: a.score, alignment_explanation: a.explanation,
    ai_strategy_notes: aiFail ? null : [st.strategy, ...st.next_steps.map((s) => "- " + s)].join("\n"), analysis_status: aiFail ? "failed" : "done", last_analyzed_at: new Date().toISOString(), vault_version_at_analysis: org.vault_version } };
}
const history = (db, opp, a, org) => db.from("opportunity_analyses").insert({ organization_id: opp.organization_id, opportunity_id: opp.id, score: a.score, eligibility_status: a.eligibility_status, findings: a.findings, vault_version: org.vault_version, ai_mode: aiMode() });

export async function processGrant({ db, orgId, userId = null, text, imageUrl = null, via = "manual" }) {
  const { data: org } = await db.from("organizations").select("*").eq("id", orgId).single();
  const url = (text.match(/https?:\/\/[^\s)]+/) || [null])[0];
  let body = text, page = false, fetchError = null;
  if (url) { try { body += "\n\nPAGE CONTENT:\n" + (await safeFetchText(url)).slice(0, 8000); page = true; } catch (e) { fetchError = String(e.message || e).slice(0, 120); } }
  let g; try { g = await extract(body, imageUrl); } catch (e) { throw Object.assign(e, { stage: "extraction" }); }
  const hash = createHash("sha256").update([url || "", g.grant_title.toLowerCase(), g.deadline || ""].join("|")).digest("hex");
  const dup = await db.from("opportunities").select("id,grant_title").eq("organization_id", orgId).eq("source_hash", hash).maybeSingle();
  if (dup.data) return { result: "duplicate", opp: dup.data };
  const { a, aiFail, fields } = await run(g, org);
  const row = { organization_id: orgId, grant_title: g.grant_title, funder_name: g.funder_name, summary: g.summary, source_url: url, funding_min: g.funding_min, funding_max: g.funding_max, currency: g.currency,
    deadline: g.deadline, opening_date: g.opening_date, ...fields, source_evidence: { ...g.source_evidence, page_fetched: page, fetch_error: fetchError, confidence: a.confidence, missing: g.missing_information, ai_mode: aiMode() },
    focus_areas: g.focus_areas, required_documents: g.required_documents, eligible_countries: g.eligible_countries, eligible_applicant_types: g.eligible_applicant_types, eligibility_requirements: g.eligibility_requirements, received_via: via, created_by: userId, source_hash: hash, extraction: g, source_text: text.slice(0, 8000) };
  const { data, error } = await db.from("opportunities").insert(row).select().single();
  if (error) { if (error.code === "23505") return { result: "duplicate", opp: { id: null, grant_title: g.grant_title } }; throw Object.assign(new Error(error.message), { stage: "database" }); }
  await history(db, data, a, org);
  return { result: a.eligibility_status === "likely_eligible" && !aiFail ? "added" : "review", opp: data };
}

// Re-run assessment with the CURRENT vault. Human edits to columns override stored extraction. History is kept.
export async function reassess({ db, opp, org, actor }) {
  const g = { ...(opp.extraction || {}), grant_title: opp.grant_title, deadline: opp.deadline, funding_min: opp.funding_min, funding_max: opp.funding_max, focus_areas: opp.focus_areas || [], required_documents: opp.required_documents || [], ...(opp.eligible_countries ? { eligible_countries: opp.eligible_countries } : {}), ...(opp.eligible_applicant_types ? { eligible_applicant_types: opp.eligible_applicant_types } : {}), ...(opp.eligibility_requirements ? { eligibility_requirements: opp.eligibility_requirements } : {}), source_evidence: opp.source_evidence || {} };
  const { a, fields } = await run(g, org);
  const { error } = await db.from("opportunities").update({ ...fields, source_evidence: { ...opp.source_evidence, confidence: a.confidence } }).eq("id", opp.id).eq("organization_id", org.id);
  if (error) throw error;
  await history(db, opp, a, org);
  await db.from("opportunity_activity").insert({ organization_id: org.id, opportunity_id: opp.id, actor_id: actor, action_type: "analysis_refreshed", metadata: { vault_version: org.vault_version } });
  return a;
}
