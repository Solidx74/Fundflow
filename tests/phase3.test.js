import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
const id = (n) => `00000000-0000-0000-0000-00000000000${n}`, A = { id: id(1), email: "a@x.org" };
let db, org, opp;
const as = async (u, sql) => { await db.exec("begin"); try { await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub','${u.id}',true), set_config('request.jwt.claim.email','${u.email}',true)`); const r = await db.query(sql); await db.exec("commit"); return r.rows; } catch (e) { await db.exec("rollback"); return { err: e.message }; } };
const claim = async (m) => (await db.query("select (claim_retry($1,$2)).id as id", [m, org])).rows[0].id;
beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`create schema auth; create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email',current_setting('request.jwt.claim.email',true)) $$;
    create role authenticated nologin; grant usage on schema public, auth to authenticated;
    alter default privileges in schema public grant all on tables to authenticated; alter default privileges in schema public grant execute on functions to authenticated;
    insert into auth.users values ('${A.id}','${A.email}');`);
  for (const f of ["0001_init", "0002_hardening", "0003_phase2", "0004_phase3"]) await db.exec(readFileSync(`supabase/migrations/${f}.sql`, "utf8"));
  org = (await as(A, "select create_organization('A','BD') o"))[0].o;
  opp = (await as(A, `insert into opportunities(organization_id,grant_title,status,deadline) values ('${org}','G','New',current_date + 2) returning id`))[0].id;
});
describe("retry claim (atomic compare-and-set)", () => {
  const msg = async (status, extra = "") => (await db.query(`insert into inbound_messages(organization_id,provider,provider_message_id,message_text,processing_status${extra ? "," + extra.split("=")[0] : ""}) values ($1,'t',gen_random_uuid()::text,'hi',$2${extra ? "," + extra.split("=")[1] : ""}) returning id`, [org, status])).rows[0].id;
  it("failed message is claimed once, a second claim is refused", async () => { const m = await msg("failed"); expect(await claim(m)).toBe(m); expect(await claim(m)).toBeNull(); expect((await db.query("select retry_count, processing_status from inbound_messages where id=$1", [m])).rows[0]).toEqual({ retry_count: 1, processing_status: "processing" }); });
  it("fresh received or processing messages are protected, stale ones are recoverable", async () => {
    expect(await claim(await msg("received"))).toBeNull(); expect(await claim(await msg("processing"))).toBeNull();
    const old = await msg("processing", "received_at=now() - interval '10 minutes'"); expect(await claim(old)).toBe(old); expect(await claim(old)).toBeNull(); });
  it("retry cap of 3 is enforced", async () => { const m = await msg("failed"); for (let i = 0; i < 3; i++) { expect(await claim(m)).toBe(m); await db.exec(`update inbound_messages set processing_status='failed' where id='${m}'`); } expect(await claim(m)).toBeNull(); });
  it("wrong organization and empty text cannot be claimed; browsers cannot call it", async () => {
    const m = await msg("failed"); expect((await db.query("select (claim_retry($1,$2)).id as id", [m, id(9)])).rows[0].id).toBeNull();
    await db.exec(`update inbound_messages set message_text=null where id='${m}'`); expect(await claim(m)).toBeNull();
    expect((await as(A, `select claim_retry('${m}','${org}')`)).err).toBeTruthy(); });
});
describe("reminder dedupe and date boundaries", () => {
  it("second and simulated concurrent runs create nothing and do not error", async () => {
    expect((await db.query("select notify_deadlines() n")).rows[0].n).toBe(1); expect((await db.query("select notify_deadlines() n")).rows[0].n).toBe(0);
    await db.exec("delete from notifications"); await db.exec(`insert into notifications(organization_id,user_id,type,title,opportunity_id,dedupe_key) values ('${org}','${A.id}','deadline_approaching','x','${opp}','dl:${opp}:' || current_date)`);
    expect((await db.query("select notify_deadlines() n")).rows[0].n).toBe(0); });
  it("deadline today is included, yesterday and day 4 are not", async () => {
    await db.exec("delete from notifications");
    for (const [d, n] of [[0, 1], [-1, 0], [4, 0]]) { await db.exec(`update opportunities set deadline = current_date + ${d} where id='${opp}'`); await db.exec("delete from notifications"); expect((await db.query("select notify_deadlines() n")).rows[0].n).toBe(n); } });
  it("unique index rejects duplicate keys for the same user", async () => {
    await db.exec(`insert into notifications(organization_id,user_id,type,title,dedupe_key) values ('${org}','${A.id}','x','x','k1')`);
    await expect(db.exec(`insert into notifications(organization_id,user_id,type,title,dedupe_key) values ('${org}','${A.id}','x','x','k1')`)).rejects.toThrow(); });
});
