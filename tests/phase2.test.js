import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const U = Object.fromEntries(["A", "B", "C", "D", "E"].map((k, i) => [k, { id: id(i + 1), email: `${k.toLowerCase()}@x.org` }]));
const mig = (f) => readFileSync(`supabase/migrations/${f}.sql`, "utf8");
const AUTH = `create schema auth; create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
  create role authenticated nologin; grant usage on schema public, auth to authenticated;
  alter default privileges in schema public grant all on tables to authenticated; alter default privileges in schema public grant execute on functions to authenticated;
  ${Object.values(U).map((u) => `insert into auth.users values ('${u.id}','${u.email}');`).join("")}`;
let db, orgA, oppA, oppB;
async function as(u, sql, p = []) {
  await db.exec("begin");
  try { await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${u.id}',true), set_config('request.jwt.claim.email','${u.email}',true)`);
    const r = await db.query(sql, p); await db.exec("commit"); return { rows: r.rows, n: /^\s*(select|insert .* returning)/i.test(sql) ? r.rows.length : r.affectedRows }; }
  catch (e) { await db.exec("rollback"); return { err: e.message }; }
}
const join = async (u, role, tok) => { await db.exec(`insert into organization_invites(organization_id,email,role,token_hash) values ('${orgA}','${u.email}','${role}',encode(digest('${tok}','sha256'),'hex'))`); return as(u, `select accept_invite('${tok}')`); };
describe("migrations", () => {
  it("fresh order and upgrade-over-existing-data both work and keep data", async () => {
    const t = new PGlite({ extensions: { pgcrypto } }); await t.exec(AUTH); await t.exec(mig("0001_init"));
    await t.exec(`insert into organizations(id,name) values ('${id(9)}','Old'); insert into opportunities(organization_id,grant_title,funding_min,funding_max) values ('${id(9)}','Legacy',500,100);`);
    await t.exec(mig("0002_hardening")); await t.exec(mig("0003_phase2")); await t.exec(mig("0004_phase3"));
    expect((await t.query("select grant_title, eligible_countries from opportunities")).rows).toEqual([{ grant_title: "Legacy", eligible_countries: null }]); // bad legacy row survives, not destroyed
    await expect(t.exec(`insert into opportunities(organization_id,grant_title,funding_min,funding_max) values ('${id(9)}','New',500,100)`)).rejects.toThrow(); // but new bad rows are rejected
  }, 60000);
});
describe("phase 2 database rules", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } }); await db.exec(AUTH); for (const f of ["0001_init", "0002_hardening", "0003_phase2", "0004_phase3"]) await db.exec(mig(f));
    orgA = (await as(U.A, "select create_organization('A','BD') o")).rows[0].o; const orgB = (await as(U.B, "select create_organization('B','KE') o")).rows[0].o;
    await join(U.C, "member", "t1"); await join(U.D, "admin", "t2"); await join(U.E, "member", "t3");
    oppA = (await as(U.A, "insert into opportunities(organization_id,grant_title,created_by) values ($1,'G',$2) returning id", [orgA, U.A.id])).rows[0].id;
    oppB = (await as(U.B, "insert into opportunities(organization_id,grant_title) values ($1,'H') returning id", [orgB])).rows[0].id;
  }, 60000);
  it("only the owner changes roles, the owner is immutable, no direct membership writes", async () => {
    for (const [u, t] of [[U.C, U.C], [U.D, U.C], [U.A, U.A]]) expect((await as(u, "select set_member_role($1,'admin')", [t.id])).err).toBeTruthy();
    expect((await as(U.A, "select set_member_role($1,'owner')", [U.C.id])).err).toBeTruthy();
    expect((await as(U.A, "select set_member_role($1,'admin')", [U.C.id])).err).toBeUndefined();
    expect((await as(U.A, "update organization_members set role='owner' where user_id=$1", [U.C.id])).n).toBe(0);
    expect((await as(U.A, "select set_member_role($1,'member')", [U.C.id])).err).toBeUndefined();
  });
  it("removal rules, reassignment and history preserved", async () => {
    expect((await as(U.D, "select remove_member($1)", [U.A.id])).err).toBeTruthy();
    expect((await as(U.A, "select remove_member($1)", [U.A.id])).err).toBeTruthy();
    expect((await as(U.C, "select remove_member($1)", [U.D.id])).err).toBeTruthy();
    expect((await as(U.D, "select set_member_role($1,'admin')", [U.E.id])).err).toBeTruthy();
    await as(U.A, "update opportunities set assigned_to=$1 where id=$2", [U.C.id, oppA]);
    await as(U.A, "insert into opportunity_tasks(organization_id,opportunity_id,title,assigned_to) values ($1,$2,'t',$3)", [orgA, oppA, U.C.id]);
    expect((await as(U.D, "select remove_member($1)", [U.C.id])).err).toBeUndefined();
    expect((await db.query("select assigned_to from opportunities where id=$1", [oppA])).rows[0].assigned_to).toBeNull();
    expect((await db.query("select count(*)::int c from opportunity_tasks where assigned_to is not null")).rows[0].c).toBe(0);
    expect((await db.query("select count(*)::int c from opportunity_activity where opportunity_id=$1", [oppA])).rows[0].c).toBeGreaterThan(0);
    expect((await as(U.C, "select 1 from opportunities")).n).toBe(0);
    expect((await as(U.E, "select remove_member($1)", [U.E.id])).err).toBeUndefined(); // a member may leave
  });
  it("notifications reach only the intended user and only read_at is writable", async () => {
    await as(U.A, "update opportunities set assigned_to=$1 where id=$2", [U.D.id, oppA]);
    const mine = (await as(U.D, "select id,type from notifications")).rows; expect(mine.map((x) => x.type)).toContain("assigned");
    expect((await as(U.A, "select 1 from notifications where type='assigned'")).n).toBe(0);
    expect((await as(U.B, "select 1 from notifications")).n).toBe(0);
    expect((await as(U.A, "update notifications set read_at=now() where id=$1", [mine[0].id])).n).toBe(0);
    expect((await as(U.D, "update notifications set title='x' where id=$1", [mine[0].id])).err).toBeTruthy();
    expect((await as(U.D, "update notifications set read_at=now() where id=$1", [mine[0].id])).n).toBe(1);
    expect((await as(U.D, "insert into notifications(organization_id,user_id,type,title) values ($1,$2,'x','x')", [orgA, U.D.id])).err).toBeTruthy();
  });
  it("rate limiter is atomic, windowed and server-only", async () => {
    const r = []; for (let i = 0; i < 4; i++) r.push((await db.query("select rate_hit('k',2,60) ok")).rows[0].ok);
    expect(r).toEqual([true, true, false, false]);
    await db.exec("update rate_limits set window_start = now() - interval '2 minutes'"); expect((await db.query("select rate_hit('k',2,60) ok")).rows[0].ok).toBe(true);
    expect((await as(U.A, "select rate_hit('z',1,60)")).err).toBeTruthy(); expect((await as(U.A, "select notify_deadlines()")).err).toBeTruthy();
  });
  it("deadline reminders are created once per day", async () => {
    await db.exec(`update opportunities set deadline = current_date + 2, status='New' where id='${oppA}'`);
    expect((await db.query("select notify_deadlines() n")).rows[0].n).toBeGreaterThan(0); expect((await db.query("select notify_deadlines() n")).rows[0].n).toBe(0);
  });
  it("constraints and document access", async () => {
    expect((await as(U.A, "update opportunities set funding_max=-1 where id=$1", [oppA])).err).toBeTruthy();
    expect((await as(U.A, "update opportunities set opening_date='2030-01-01', deadline='2029-01-01' where id=$1", [oppA])).err).toBeTruthy();
    await db.exec(`insert into org_documents(organization_id,filename,storage_path,content_type,size_bytes) values ('${orgA}','a.pdf','${orgA}/x.pdf','application/pdf',10)`);
    expect((await as(U.A, "select 1 from org_documents")).n).toBe(1); expect((await as(U.B, "select 1 from org_documents")).n).toBe(0);
    expect((await as(U.A, "delete from org_documents")).err).toBeTruthy(); expect((await as(U.B, "update org_documents set category='x'")).n).toBe(0);
  });
});
