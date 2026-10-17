import { z } from "zod";
import { ctx } from "@/lib/auth";
const real = (d) => !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
const D = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(real, "invalid date").nullable();
const U = z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "http(s) only").nullable();
const L = z.array(z.string().trim().min(1).max(120)).max(60);
const T = z.string().trim().max(5000).nullable();
const Patch = z.object({ grant_title: z.string().trim().min(1).max(300), funder_name: T, summary: T, source_url: U, funding_min: z.number().min(0).max(1e12).nullable(), funding_max: z.number().min(0).max(1e12).nullable(),
  currency: z.string().trim().max(8).nullable(), opening_date: D, deadline: D, eligible_countries: L, eligible_applicant_types: L, focus_areas: L, required_documents: L, eligibility_requirements: L,
  status: z.enum(["New", "Evaluating", "Shortlisted", "Drafting", "Submitted", "Won", "Lost", "Archived"]), assigned_to: z.string().uuid().nullable(), application_url: U, submission_date: D,
  application_reference: z.string().trim().max(200).nullable(), prep_notes: T, document_checklist: z.array(z.object({ t: z.string().trim().min(1).max(200), done: z.boolean() })).max(50) }).partial().strict();
const FACTS = ["grant_title", "funder_name", "summary", "source_url", "funding_min", "funding_max", "currency", "opening_date", "deadline", "eligible_countries", "eligible_applicant_types", "focus_areas", "required_documents", "eligibility_requirements"];
// Uses the caller's own JWT (ctx.ud): RLS applies, triggers log the real actor. The org is never taken from the body.
export async function PATCH(req) {
  const c = await ctx(req); if (!c) return Response.json({ error: "unauthorised" }, { status: 401 });
  const body = await req.json().catch(() => ({})); const id = z.string().uuid().safeParse(body.id), p = Patch.safeParse(body.patch);
  if (!id.success || !p.success) return Response.json({ error: "Invalid input", details: p.error?.issues?.map((i) => i.path.join(".") + ": " + i.message) }, { status: 400 });
  const { data: o } = await c.ud.from("opportunities").select("*").eq("id", id.data).maybeSingle(); if (!o) return Response.json({ error: "Not found" }, { status: 404 });
  const m = { ...o, ...p.data };
  if (m.funding_min != null && m.funding_max != null && m.funding_min > m.funding_max) return Response.json({ error: "Minimum funding exceeds maximum" }, { status: 400 });
  if (m.opening_date && m.deadline && m.opening_date > m.deadline) return Response.json({ error: "Opening date is after the deadline" }, { status: 400 });
  if (p.data.assigned_to) { const { data: mem } = await c.db.from("organization_members").select("id").eq("user_id", p.data.assigned_to).eq("organization_id", c.orgId).maybeSingle(); if (!mem) return Response.json({ error: "Assignee must be a team member" }, { status: 400 }); }
  const corr = { ...(o.user_corrections || {}) };
  for (const k of FACTS) if (k in p.data && JSON.stringify(p.data[k]) !== JSON.stringify(o[k])) corr[k] = { by: c.userId, at: new Date().toISOString(), previous: o[k] ?? null }; // AI evidence kept in source_evidence/extraction
  const { data, error } = await c.ud.from("opportunities").update({ ...p.data, user_corrections: corr }).eq("id", id.data).select().single();
  return error ? Response.json({ error: "Update failed" }, { status: 400 }) : Response.json(data);
}
