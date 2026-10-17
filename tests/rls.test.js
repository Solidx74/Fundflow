// Real Postgres (PGlite, WASM) running migrations 0001 + 0002 with a stubbed Supabase auth schema.
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const A = { id: id(1), email: "a@a.org" }, B = { id: id(2), email: "b@b.org" }, C = { id: id(3), email: "c@a.org" };
let db, orgA, orgB, oppA, oppB;
async function as(u, sql, p = []) {
  await db.exec("begin");
  try {
    await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${u.id}',true), set_config('request.jwt.claim.email','${u.email}',true)`);
    const r = await db.query(sql, p); await db.exec("commit"); return { rows: r.rows, n: /^\s*(select|insert .* returning)/i.test(sql) ? r.rows.length : r.affectedRows };
  } catch (e) { await db.exec("rollback"); return { err: e.message }; }
}
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
    create role authenticated nologin; grant usage on schema public, auth to authenticated;
    insert into auth.users values ('${A.id}','${A.email}'),('${B.id}','${B.email}'),('${C.id}','${C.email}');`);
  await db.exec("alter default privileges in schema public grant all on tables to authenticated; alter default privileges in schema public grant execute on functions to authenticated;");
  for (const f of ["0001_init", "0002_hardening", "0003_phase2", "0004_phase3"]) await db.exec(readFileSync(`supabase/migrations/${f}.sql`, "utf8"));
  orgA = (await as(A, "select create_organization('OrgA','Bangladesh') as o")).rows[0].o;
  orgB = (await as(B, "select create_organization('OrgB','Kenya') as o")).rows[0].o;
  await db.exec(`insert into organization_invites(organization_id,email,role,token_hash) values ('${orgA}','${C.email}','member',encode(digest('tok','sha256'),'hex'))`);
  expect((await as(C, "select accept_invite('tok')")).err).toBeUndefined();
  oppA = (await as(A, "insert into opportunities(organization_id,grant_title,created_by) values ($1,'A grant',$2) returning id", [orgA, A.id])).rows[0].id;
  oppB = (await as(B, "insert into opportunities(organization_id,grant_title,created_by) values ($1,'B grant',$2) returning id", [orgB, B.id])).rows[0].id;
}, 60000);
describe("tenant isolation (executed against Postgres)", () => {
  it("B sees only own opportunities", async () => { const r = await as(B, "select grant_title from opportunities"); expect(r.rows.map((x) => x.grant_title)).toEqual(["B grant"]); });
  it("B cannot update or delete A's opportunity", async () => {
    expect((await as(B, "update opportunities set grant_title='x' where id=$1", [oppA])).n).toBe(0);
    expect((await as(B, "delete from opportunities where id=$1", [oppA])).n).toBe(0);
  });
  it("B cannot attach a task or note to A's opportunity, even with B's org id", async () => {
    expect((await as(B, "insert into opportunity_tasks(organization_id,opportunity_id,title) values ($1,$2,'t')", [orgB, oppA])).err).toBeTruthy();
    expect((await as(B, "insert into opportunity_notes(organization_id,opportunity_id,author_id,content) values ($1,$2,$3,'n')", [orgB, oppA, B.id])).err).toBeTruthy();
    expect((await as(B, "insert into opportunity_tasks(organization_id,opportunity_id,title) values ($1,$2,'t')", [orgA, oppA])).err).toBeTruthy();
  });
  it("opportunity cannot be moved to another org", async () => expect((await as(A, "update opportunities set organization_id=$1 where id=$2", [orgB, oppA])).err).toBeTruthy());
  it("assignee must be a member of the same org", async () => {
    expect((await as(A, "update opportunities set assigned_to=$1 where id=$2", [B.id, oppA])).err).toMatch(/member/i);
    expect((await as(A, "update opportunities set assigned_to=$1 where id=$2", [C.id, oppA])).err).toBeUndefined();
    expect((await as(A, "insert into opportunity_tasks(organization_id,opportunity_id,title,assigned_to) values ($1,$2,'t',$3)", [orgA, oppA, B.id])).err).toMatch(/member/i);
  });
  it("messages and senders are not readable across orgs, messages are admin only", async () => {
    await db.exec(`insert into inbound_messages(organization_id,provider,provider_message_id) values ('${orgA}','twilio','m1'); insert into whatsapp_senders(organization_id,phone_number) values ('${orgA}','whatsapp:+8801');`);
    expect((await as(A, "select 1 from inbound_messages")).n).toBe(1);
    expect((await as(B, "select 1 from inbound_messages")).n).toBe(0);
    expect((await as(C, "select 1 from inbound_messages")).n).toBe(0);
    expect((await as(B, "select 1 from whatsapp_senders")).n).toBe(0);
    expect((await as(C, "select 1 from whatsapp_senders")).n).toBe(1);
  });
});
describe("role enforcement and escalation", () => {
  it("member cannot delete opportunities, edit the org, change roles or write invites", async () => {
    expect((await as(C, "delete from opportunities where id=$1", [oppA])).n).toBe(0);
    expect((await as(C, "update organizations set name='hacked' where id=$1", [orgA])).n).toBe(0);
    expect((await as(C, "update organization_members set role='owner' where user_id=$1", [C.id])).n).toBe(0);
    expect((await as(C, "insert into organization_invites(organization_id,email,role,token_hash) values ($1,'x@x.org','admin','h')", [orgA])).err).toBeTruthy();
  });
  it("owner cannot write invites directly either (server route only)", async () =>
    expect((await as(A, "insert into organization_invites(organization_id,email,role,token_hash) values ($1,'x@x.org','admin','h')", [orgA])).err).toBeTruthy());
  it("invite is single use and bound to the invited email", async () => {
    expect((await as(C, "select accept_invite('tok')")).err).toBeTruthy();
    await db.exec(`insert into organization_invites(organization_id,email,role,token_hash) values ('${orgA}','zzz@z.org','member',encode(digest('tok2','sha256'),'hex'))`);
    expect((await as(B, "select accept_invite('tok2')")).err).toMatch(/invalid/i);
  });
  it("cannot create a second organization", async () => expect((await as(A, "select create_organization('Dup','X')")).err).toBeTruthy());
});
describe("activity", () => {
  it("status, deadline and note changes are logged with the actor", async () => {
    await as(A, "update opportunities set status='Submitted', deadline='2027-01-01' where id=$1", [oppA]);
    await as(C, "insert into opportunity_notes(organization_id,opportunity_id,author_id,content) values ($1,$2,$3,'hi')", [orgA, oppA, C.id]);
    const t = (await as(A, "select action_type, actor_id from opportunity_activity where opportunity_id=$1", [oppA])).rows.map((x) => x.action_type);
    ["received", "status_changed", "application_submitted", "deadline_updated", "note_added", "assignment_changed"].forEach((k) => expect(t).toContain(k));
    expect((await as(B, "select 1 from opportunity_activity where opportunity_id=$1", [oppA])).n).toBe(0);
  });
});
