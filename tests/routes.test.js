// Route handlers run for real; Supabase, rate limiter and ingest are MOCKED. These are mocked-integration tests, not live ones.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
const S = vi.hoisted(() => ({ ctx: null, admin: null }));
vi.mock("@/lib/auth", () => ({ ctx: async () => S.ctx, admin: () => S.admin }));
vi.mock("@/lib/rate", () => ({ limited: vi.fn(async () => false) }));
vi.mock("@/lib/ingest", () => ({ ingest: vi.fn(async () => "reply-ok"), FAIL: "fail" }));
import { limited } from "@/lib/rate";
import { ingest } from "@/lib/ingest";
import { PATCH } from "../app/api/opportunity/route.js";
import { POST as DOC_POST, DELETE as DOC_DEL } from "../app/api/documents/route.js";
import { POST as WA } from "../app/api/whatsapp/route.js";
import { GET as CRON } from "../app/api/cron/route.js";
const chain = (res) => { const c = {}; for (const m of ["select", "insert", "update", "upsert", "delete", "eq", "in", "gt", "lt", "or", "order", "limit", "neq"]) c[m] = () => c; c.single = async () => res; c.maybeSingle = async () => res; c.then = (f, r) => Promise.resolve(res).then(f, r); return c; };
const ID = "11111111-1111-4111-8111-111111111111", UID = "22222222-2222-4222-8222-222222222222";
const OPP = { id: ID, grant_title: "G", funding_min: null, funding_max: 100, opening_date: null, deadline: "2026-12-01", user_corrections: {} };
describe("PATCH /api/opportunity", () => {
  let upd;
  beforeEach(() => { upd = []; S.ctx = { userId: "u1", orgId: "o1", role: "member", db: { from: () => chain({ data: null }) }, ud: { from: () => { const c = chain({ data: OPP }); c.update = (u) => { upd.push(u); return c; }; return c; } } }; });
  const p = (patch, id = ID) => PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ id, patch }) }));
  it("rejects unauthenticated", async () => { S.ctx = null; expect((await p({ grant_title: "x" })).status).toBe(401); });
  it.each([["bad date", { deadline: "2026-13-45" }], ["negative funding", { funding_max: -5 }], ["javascript url", { source_url: "javascript:alert(1)" }], ["org id injection", { organization_id: "x" }], ["bad status", { status: "Hacked" }], ["min above max", { funding_min: 500 }], ["opening after deadline", { opening_date: "2027-01-01" }], ["non-member assignee", { assigned_to: UID }]])("rejects %s", async (_n, patch) => {
    expect((await p(patch)).status).toBe(400); expect(upd.length).toBe(0); });
  it("rejects a malformed id", async () => expect((await p({ grant_title: "x" }, "nope")).status).toBe(400));
  it("accepts a valid edit and records the correction with the previous value", async () => {
    expect((await p({ grant_title: "New title", eligible_countries: ["Kenya"] })).status).toBe(200);
    expect(upd[0].user_corrections.grant_title.previous).toBe("G"); expect(upd[0].user_corrections.grant_title.by).toBe("u1"); expect(upd[0].organization_id).toBeUndefined(); });
});
describe("documents", () => {
  let removed, deleted;
  beforeEach(() => { removed = false; deleted = false; S.ctx = { userId: "u1", orgId: "o1", role: "member", db: { storage: { from: () => ({ upload: async () => ({}), remove: async () => { removed = true; return {}; }, createSignedUrl: async () => ({ data: { signedUrl: "u" } }) }) }, from: () => { const c = chain({ data: { id: "d1", storage_path: "o1/x.pdf" } }); c.delete = () => { deleted = true; return c; }; return c; } } }; });
  const up = (bytes, name, headers = {}) => { const f = new FormData(); f.append("file", new File([bytes], name)); return DOC_POST(new Request("http://x", { method: "POST", body: f, headers })); };
  const zip = (s) => Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from(s)]);
  it("accepts real PDF, DOCX-like zip and UTF-8 text", async () => {
    for (const [b, n] of [[Buffer.from("%PDF-1.4 x"), "a.pdf"], [zip("[Content_Types].xml word/document.xml"), "a.docx"], [Buffer.from("héllo"), "a.txt"]]) expect((await up(b, n)).status).toBe(200); });
  it.each([["exe renamed pdf", Buffer.from("MZ\x90\x00"), "a.pdf"], ["generic zip as docx", zip("hello"), "a.docx"], ["binary as txt", Buffer.from([65, 0, 66]), "a.txt"], ["svg", Buffer.from("<svg onload=alert(1)/>"), "a.svg"], ["pdf name wrong magic", Buffer.from("not a pdf"), "a.pdf"]])("rejects %s", async (_n, b, n) => expect((await up(b, n)).status).toBe(400));
  it("rejects over 4 MB by content and by declared length", async () => {
    expect((await up(Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(4 * 1024 * 1024)]), "a.pdf")).status).toBe(400);
    expect((await up(Buffer.from("%PDF-1"), "a.pdf", { "content-length": "99999999" })).status).toBe(413); });
  it("member cannot delete; failed storage removal keeps the metadata", async () => {
    expect((await DOC_DEL(new Request("http://x?id=d1", { method: "DELETE" }))).status).toBe(403);
    S.ctx.role = "admin"; S.ctx.db.storage.from = () => ({ remove: async () => ({ error: {} }) });
    expect((await DOC_DEL(new Request("http://x?id=d1", { method: "DELETE" }))).status).toBe(500); expect(deleted).toBe(false); });
});
describe("POST /api/whatsapp", () => {
  const TOK = "tok", sig = (p, base = "https://app.example.com") => createHmac("sha1", TOK).update(base + "/api/whatsapp" + Object.keys(p).sort().map((k) => k + p[k]).join("")).digest("base64");
  const wa = (p, s) => WA(new Request("https://app.example.com/api/whatsapp", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(s ? { "x-twilio-signature": s } : {}) }, body: new URLSearchParams(p) }));
  const P = { From: "whatsapp:+8801", Body: "grant", MessageSid: "SM1" };
  let R; beforeEach(() => { process.env.TWILIO_AUTH_TOKEN = TOK; process.env.APP_BASE_URL = "https://app.example.com/"; delete process.env.WHATSAPP_DEMO; R = { inbound_messages: { data: { id: "m1" } }, whatsapp_senders: { data: { organization_id: "o1" } } }; S.admin = { from: (t) => chain(R[t]) }; ingest.mockClear(); limited.mockResolvedValue(false); });
  it("rejects missing, wrong and demo-bypass signatures in production", async () => {
    expect((await wa(P)).status).toBe(403); expect((await wa(P, "bad")).status).toBe(403);
    process.env.WHATSAPP_DEMO = "1"; const n = process.env.NODE_ENV; process.env.NODE_ENV = "production"; expect((await wa(P, "bad")).status).toBe(403); process.env.NODE_ENV = n; expect(ingest).not.toHaveBeenCalled(); });
  it("accepts a valid signature even when APP_BASE_URL has a trailing slash", async () => { const r = await wa(P, sig(P)); expect(r.status).toBe(200); expect(await r.text()).toContain("reply-ok"); });
  it("replayed MessageSid is acknowledged without processing", async () => { R.inbound_messages = { error: { code: "23505" } }; const r = await wa(P, sig(P)); expect(await r.text()).toBe("<Response/>"); expect(ingest).not.toHaveBeenCalled(); });
  it("unknown sender never reaches processing", async () => { R.whatsapp_senders = { data: null }; expect(await (await wa(P, sig(P))).text()).toContain("not verified"); expect(ingest).not.toHaveBeenCalled(); });
  it("rate-limited sender is stopped", async () => { limited.mockResolvedValueOnce(true); expect(await (await wa(P, sig(P))).text()).toContain("Too many"); expect(ingest).not.toHaveBeenCalled(); });
});
describe("GET /api/cron and limiter", () => {
  const cr = (h) => CRON(new Request("http://x", { headers: h })); beforeEach(() => { S.admin = { rpc: async () => ({ data: 3 }) }; });
  it("requires the exact secret", async () => {
    delete process.env.CRON_SECRET; expect((await cr({ authorization: "Bearer x" })).status).toBe(403);
    process.env.CRON_SECRET = "s3cret"; expect((await cr({})).status).toBe(403); expect((await cr({ authorization: "Bearer s3crex" })).status).toBe(403); expect((await cr({ authorization: "Bearer s3cret" })).status).toBe(200); });
  it("limiter fails closed on database error", async () => { const { limited: real } = await vi.importActual("@/lib/rate"); expect(await real({ rpc: async () => ({ error: {} }) }, "k", 1, 1)).toBe(true); expect(await real({ rpc: async () => ({ data: true }) }, "k", 1, 1)).toBe(false); });
});
import { GET as STATUS } from "../app/api/status/route.js";
describe("GET /api/status", () => {
  it("requires login and returns modes only, never secret values", async () => {
    S.ctx = null; expect((await STATUS(new Request("http://x"))).status).toBe(401);
    S.ctx = { userId: "u" }; process.env.OPENAI_API_KEY = "sk-secret-value"; process.env.TWILIO_AUTH_TOKEN = "tw-secret"; process.env.APP_BASE_URL = "https://a.example"; process.env.CRON_SECRET = "cron-secret";
    const t = await (await STATUS(new Request("http://x"))).text(); expect(JSON.parse(t)).toEqual({ ai: "live", whatsapp: "configured", reminders: "configured" });
    for (const v of ["sk-secret-value", "tw-secret", "cron-secret"]) expect(t).not.toContain(v);
    delete process.env.OPENAI_API_KEY; expect((await (await STATUS(new Request("http://x"))).json()).ai).toBe("demo"); });
});
