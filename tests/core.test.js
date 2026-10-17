import { describe, it, expect } from "vitest";
import { assess } from "../lib/score.js";
import { isPrivateIp } from "../lib/safeFetch.js";
const org = { country: "Bangladesh", budget_size: 60000, organization_type: "NGO", focus_areas: ["flood", "climate"] };
describe("assess", () => {
  it("hard geography conflict is never a strong match", () => {
    const r = assess({ eligible_countries: ["Kenya"], focus_areas: ["flood", "climate"], funding_max: 10000, eligible_applicant_types: ["NGO"], required_documents: ["x"] }, org, 100);
    expect(r.eligibility_status).toBe("likely_ineligible"); expect(r.score).toBeLessThanOrEqual(35);
  });
  it("budget minimum conflict flagged", () => expect(assess({ eligible_countries: ["Bangladesh"], min_annual_budget: 100000 }, org, 90).eligibility_status).toBe("likely_ineligible"));
  it("unknowns need review and lower confidence", () => { const r = assess({}, org, null); expect(r.eligibility_status).toBe("needs_review"); expect(r.confidence).toBeLessThan(50); });
  it("clean match is likely eligible", () => expect(assess({ eligible_countries: ["Bangladesh"], eligible_applicant_types: ["NGO"], funding_max: 20000, focus_areas: ["flood"], required_documents: ["reg"] }, org, 90).eligibility_status).toBe("likely_eligible"));
});
describe("isPrivateIp", () => {
  it("blocks private and metadata ranges", () => ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"].forEach((ip) => expect(isPrivateIp(ip)).toBe(true)));
  it("allows public", () => expect(isPrivateIp("8.8.8.8")).toBe(false));
});
import { sanitize } from "../lib/extract.js";
describe("hardening", () => {
  it("applicant matching is not substring based", () => {
    const base = { eligible_countries: ["Bangladesh"], funding_max: 1000, focus_areas: ["flood"], required_documents: ["x"] };
    expect(assess({ ...base, eligible_applicant_types: ["Non-governmental organizations"] }, org, 80).findings.find((f) => f.field === "applicant").kind).toBe("match");
    expect(assess({ ...base, eligible_applicant_types: ["Mongolian cooperatives"] }, { ...org, organization_type: "NGO" }, 80).findings.find((f) => f.field === "applicant").kind).toBe("unknown");
  });
  it("sanitize drops invalid and contradictory values", () => {
    const g = sanitize({ grant_title: "x", deadline: "2026-13-45", opening_date: null, funding_min: 500, funding_max: 100, min_annual_budget: -5, missing_information: [] });
    expect(g.deadline).toBeNull(); expect(g.funding_max).toBeNull(); expect(g.min_annual_budget).toBeNull(); expect(g.missing_information.length).toBe(2);
  });
});
