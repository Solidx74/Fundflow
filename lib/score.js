// Initial product defaults, not validated predictive weights. Configure via env SCORE_WEIGHTS (JSON).
const DEF = { mission: .3, geo: .2, applicant: .2, financial: .15, program: .15 };
export const WEIGHTS = (() => { const w = { ...DEF }; try { const o = JSON.parse(process.env.SCORE_WEIGHTS || "{}"); for (const k of Object.keys(DEF)) if (Number.isFinite(o[k]) && o[k] >= 0) w[k] = o[k]; } catch {} const t = Object.values(w).reduce((x, y) => x + y, 0); return t > 0 ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / t])) : DEF; })();
const n = (s) => String(s ?? "").toLowerCase().trim();
const ALIAS = [["ngo", "nonprofit", "non-profit", "non profit", "non-governmental organization", "non-governmental organisation", "nongovernmental organization", "civil society organization", "civil society organisation", "cso", "charity", "registered charity"], ["community based organization", "community-based organization", "cbo"], ["social enterprise"], ["university", "academic institution"], ["government", "public body"]];
const canon = (t) => { const x = n(t).replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim(); const y = x.replace(/s$/, ""); const i = ALIAS.findIndex((g) => g.includes(x) || g.includes(y)); return i >= 0 ? "g" + i : y; };
const GLOBAL = /^(all|any|global|worldwide|international)/;

export function assess(g, org, thematic) {
  const f = [], ev = g.source_evidence || {}; let hard = false, unknown = 0; const s = {};
  const add = (kind, field, text, evidence) => f.push({ kind, field, text, evidence: evidence || null });
  // geography
  if (g.eligible_countries?.length) {
    const ok = g.eligible_countries.some((c) => GLOBAL.test(n(c)) || n(c) === n(org.country));
    s.geo = ok ? 100 : 0;
    ok ? add("match", "geography", `${org.country} is eligible.`, ev.geography) : (hard = true, add("conflict", "geography", `Funder limits eligibility to ${g.eligible_countries.join(", ")}; the organization is in ${org.country || "an unknown country"}.`, ev.geography));
  } else { unknown++; s.geo = 0; add("unknown", "geography", "Eligible countries not stated."); }
  // applicant type
  if (g.eligible_applicant_types?.length && org.organization_type) {
    const ok = g.eligible_applicant_types.some((t) => canon(t) === canon(org.organization_type));
    s.applicant = ok ? 100 : 0; add(ok ? "match" : "unknown", "applicant", ok ? "Applicant type matches." : "Applicant type could not be matched. Confirm manually.", ev.applicant);
  } else { unknown++; s.applicant = 0; add("unknown", "applicant", "Applicant type or organization type missing."); }
  // financial
  if (g.min_annual_budget != null && org.budget_size != null && +org.budget_size < +g.min_annual_budget) {
    hard = true; s.financial = 0; add("conflict", "budget", `Funder requires an annual budget of at least ${g.min_annual_budget}; the organization reports ${org.budget_size}.`, ev.budget);
  } else if (g.funding_max != null && org.budget_size) {
    s.financial = +g.funding_max <= +org.budget_size * 0.5 ? 100 : 40; add("match", "financial", "Grant size is plausible for the stated budget.", ev.financial);
  } else { unknown++; s.financial = 0; add("unknown", "financial", "Grant size or organization budget unknown."); }
  // mission (AI thematic score, else keyword overlap)
  const a = (org.focus_areas || []).map(n), b = (g.focus_areas || []).map(n);
  s.mission = Number.isFinite(thematic) ? Math.max(0, Math.min(100, thematic)) : a.length && b.length ? Math.round(100 * b.filter((x) => a.some((y) => x.includes(y) || y.includes(x))).length / b.length) : 0;
  if (!a.length || !b.length) { unknown++; add("unknown", "mission", "Focus areas missing, thematic fit is low confidence."); }
  // program requirements
  s.program = g.required_documents?.length || g.eligibility_requirements?.length ? 50 : 0;
  if (!s.program) { unknown++; add("unknown", "program", "No program requirements extracted."); }
  let score = Math.round(Object.entries(WEIGHTS).reduce((t, [k, w]) => t + w * (s[k] || 0), 0));
  const status = hard ? "likely_ineligible" : unknown >= 2 || s.geo === 0 ? "needs_review" : "likely_eligible";
  if (hard) score = Math.min(score, 35); // a hard conflict can never read as a strong match
  const confidence = Math.round(100 * (1 - unknown / 5));
  return { score, eligibility_status: status, findings: f, confidence, explanation: `Weighted score from mission ${s.mission}, geography ${s.geo}, applicant ${s.applicant}, financial ${s.financial}, program ${s.program}. Unknown inputs score 0. Confidence ${confidence}%.` };
}
