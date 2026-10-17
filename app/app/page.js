"use client";
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase";

const COLS = ["New", "Evaluating", "Shortlisted", "Drafting", "Submitted", "Won", "Lost", "Archived"];
const ELIG = { likely_eligible: ["Likely eligible", "ok"], needs_review: ["Needs review", "warn"], likely_ineligible: ["Likely ineligible", "bad"] };
const days = (d) => Math.ceil((new Date(d) - new Date(new Date().toISOString().slice(0, 10))) / 864e5);
const cl = (s) => (s >= 75 ? "ok" : s >= 50 ? "warn" : "bad");
const token = async () => (await sb().auth.getSession()).data.session?.access_token || "";
const post = async (u, b) => { const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) }, body: JSON.stringify(b) }); if (r.status === 401) sb().auth.signOut(); return { ok: r.ok, data: await r.json().catch(() => ({})) }; };
const SAMPLE = "Climate Resilience Fund for Community Organizations. Grants up to $50,000 for flood response projects. Open to registered NGOs in Bangladesh, India and Nepal. Minimum annual budget $20,000. Deadline: December 20, 2026.";

export default function Home() {
  const [ses, setSes] = useState(undefined), [mem, setMem] = useState(undefined), [rec, setRec] = useState(false);
  useEffect(() => {
    sb().auth.getSession().then(({ data }) => setSes(data.session));
    const { data } = sb().auth.onAuthStateChange((e, x) => { if (e === "PASSWORD_RECOVERY") setRec(true); setSes(x); }); return () => data.subscription.unsubscribe();
  }, []);
  const loadMem = () => sb().from("organization_members").select("organization_id,role,user_id").eq("user_id", ses.user.id).maybeSingle().then(({ data }) => setMem(data));
  useEffect(() => { ses ? loadMem() : setMem(undefined); }, [ses]);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return <div className="panel"><h1>FundFlow</h1><p>Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See README.</p></div>;
  if (rec) return <SetPassword done={() => setRec(false)} />;
  if (ses === undefined || (ses && mem === undefined)) return <div className="panel" role="status">Loading…</div>;
  if (!ses) return <Auth />;
  if (!mem) return <><Invite done={loadMem} /><Onboard done={loadMem} /></>;
  return <App ses={ses} mem={mem} />;
}

function Auth() {
  const [mode, setMode] = useState("in"), [email, setEmail] = useState(""), [pw, setPw] = useState(""), [msg, setMsg] = useState("");
  const go = async () => {
    const a = sb().auth;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg("Enter a valid email address.");
    if (mode === "up" && pw.length < 8) return setMsg("Use at least 8 characters for the password.");
    if (mode === "reset") { const { error } = await a.resetPasswordForEmail(email, { redirectTo: location.origin + "/app" }); return setMsg(error ? error.message : "Reset link sent if the account exists."); }
    const { error } = mode === "in" ? await a.signInWithPassword({ email, password: pw }) : await a.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + "/app" } });
    setMsg(error ? (/confirm/i.test(error.message) ? "Confirm your email first. Check your inbox, then sign in." : error.message) : mode === "up" ? "Account created. If email confirmation is enabled for this project, confirm from your inbox, then sign in." : "");
  };
  return (
    <div className="panel">
      <h1>FundFlow</h1><p className="m">Every grant opportunity, organized.</p>
      <label htmlFor="e">Email</label><input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode !== "reset" && <><label htmlFor="p">Password</label><input id="p" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></>}
      <p><button className="btn p" onClick={go}>{mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}</button></p>
      <p className="m"><button className="btn" onClick={() => setMode(mode === "in" ? "up" : "in")}>{mode === "in" ? "Sign up" : "Back to sign in"}</button> <button className="btn" onClick={() => setMode("reset")}>Forgot password</button></p>
      <p className="err" role="alert">{msg}</p>
    </div>
  );
}

function Onboard({ done }) {
  const [n, setN] = useState(""), [c, setC] = useState(""), [err, setErr] = useState("");
  return (
    <div className="panel">
      <h1>Create your organisation</h1><p className="m">Next, complete your Knowledge Vault. Team members join by invitation.</p>
      <label htmlFor="n">Organisation name</label><input id="n" value={n} onChange={(e) => setN(e.target.value)} />
      <label htmlFor="c">Country of operation</label><input id="c" value={c} onChange={(e) => setC(e.target.value)} />
      <p><button className="btn p" disabled={!n || !c} onClick={async () => { const { error } = await sb().rpc("create_organization", { p_name: n, p_country: c }); error ? setErr(error.message) : done(); }}>Create</button></p>
      <p className="err" role="alert">{err}</p>
    </div>
  );
}

function App({ ses, mem }) {
  const [skip, setSkip] = useState(false), [tab, setTab] = useState("dash"), [opps, setOpps] = useState(null), [org, setOrg] = useState(null), [members, setMembers] = useState([]), [open, setOpen] = useState(null), [err, setErr] = useState("");
  const load = async () => {
    const [o, g, m] = await Promise.all([sb().from("opportunities").select("*"), sb().from("organizations").select("*").eq("id", mem.organization_id).single(), sb().from("organization_members").select("user_id,display_name,role,email")]);
    if (o.error) return setErr("Could not load opportunities."); setErr(""); setOpps(o.data); setOrg(g.data); setMembers(m.data || []);
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  const upd = async (id, patch) => {
    const prev = opps; setOpps((x) => x.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await sb().from("opportunities").update(patch).eq("id", id);
    if (error) { setOpps(prev); setErr("Update failed: " + error.message); } else setErr("");
  };
  const name = (id) => members.find((m) => m.user_id === id)?.display_name || "";
  const cur = opps?.find((o) => o.id === open), admin = mem.role !== "member";
  if (org && !org.onboarding_completed && admin && !skip) return <Wizard org={org} done={load} skip={() => setSkip(true)} />;
  return (
    <>
      <header>
        <div><h1>{org?.name || "FundFlow"}</h1><div className="m">{ses.user.email} · {mem.role}</div></div>
        <nav aria-label="Sections">
          {[["dash", "Dashboard"], ["add", "Add opportunity"], ["vault", "Organization Vault"], ["tasks", "My tasks"], ["team", "Team"], ["wa", "WhatsApp"]].map(([k, l]) => <button key={k} aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
          <Bell setOpen={setOpen} setTab={setTab} /><button onClick={() => sb().auth.signOut()}>Sign out</button>
        </nav>
      </header>
      <main>
        {err && <p className="err" role="alert">{err}</p>}
        {tab === "dash" && (opps ? <Dash org={org} reload={load} opps={opps} members={members} upd={upd} setOpen={setOpen} name={name} uid={ses.user.id} go={() => setTab("add")} /> : <p role="status">Loading…</p>)}
        {tab === "add" && <Add done={() => { load(); setTab("dash"); }} />}
        {tab === "vault" && org && <><Vault org={org} admin={admin} reload={load} /><Docs admin={admin} /></>}
        {tab === "tasks" && <MyTasks uid={ses.user.id} opps={opps} setOpen={setOpen} />}
        {tab === "team" && <Team members={members} role={mem.role} uid={ses.user.id} opps={opps} reload={load} />}
        {tab === "wa" && <WA admin={admin} />}
      </main>
      {cur && <Detail org={org} reload={load} o={cur} upd={upd} close={() => setOpen(null)} members={members} uid={ses.user.id} orgId={mem.organization_id} admin={admin} del={async () => { await sb().from("opportunities").delete().eq("id", cur.id); setOpen(null); load(); }} />}
    </>
  );
}

function Dash({ org, reload, opps, members, upd, setOpen, name, uid, go }) {
  const [rec, setRec] = useState([]), [rf, setRf] = useState("");
  useEffect(() => { sb().from("opportunity_activity").select("*").order("created_at", { ascending: false }).limit(6).then(({ data }) => setRec(data || [])); }, [opps]);
  const [q, setQ] = useState(""), [el, setEl] = useState(""), [mine, setMine] = useState(false), [over, setOver] = useState(null), [st, setSt] = useState(""), [dl, setDl] = useState(""), [as, setAs] = useState(""), [sort, setSort] = useState("deadline"), [page, setPage] = useState(0), [view, setView] = useState(() => { try { return localStorage.getItem("ffview") || "kanban"; } catch { return "kanban"; } });
  const sv = (v) => { setView(v); try { localStorage.setItem("ffview", v); } catch {} };
  const dlOk = (o) => !dl || (dl === "unknown" ? !o.deadline : dl === "overdue" ? o.deadline && days(o.deadline) < 0 : o.deadline && days(o.deadline) >= 0 && days(o.deadline) <= +dl);
  const clear = () => { setQ(""); setEl(""); setMine(false); setSt(""); setDl(""); setAs(""); setPage(0); };
  const open = opps.filter((o) => !["Won", "Lost", "Archived", "Submitted"].includes(o.status));
  const soon = open.filter((o) => o.deadline && days(o.deadline) >= 0 && days(o.deadline) <= 7).length;
  const f = opps.filter((o) => (!q || (o.grant_title + " " + (o.funder_name || "") + " " + (o.summary || "") + " " + (o.focus_areas || []).join(" ")).toLowerCase().includes(q.toLowerCase())) && (!el || o.eligibility_status === el) && (!mine || o.assigned_to === uid) && (!st || o.status === st) && (!as || o.assigned_to === as) && dlOk(o));
  const sorted = [...f].sort(KEY[sort]);
  const cards = [["Total", opps.length], ["New", opps.filter((o) => o.status === "New").length], ["Evaluating", opps.filter((o) => o.status === "Evaluating").length], ["Drafting", opps.filter((o) => o.status === "Drafting").length], ["Submitted", opps.filter((o) => o.status === "Submitted").length], ["Closing in 7 days", soon], ["Eligibility concerns", opps.filter((o) => o.eligibility_status !== "likely_eligible" && o.status !== "Archived").length]];
  if (!opps.length) return <div className="panel"><h2>No opportunities yet</h2><p className="m">Forward a grant to your WhatsApp number or add one manually.</p><button className="btn p" onClick={go}>Add opportunity</button></div>;
  return (
    <>
      {org && opps.filter((o) => o.status !== "Archived" && (o.vault_version_at_analysis ?? 0) < org.vault_version).length > 0 && <div className="card" style={{ cursor: "default", marginBottom: 14 }}><b className="warn">{opps.filter((o) => o.status !== "Archived" && (o.vault_version_at_analysis ?? 0) < org.vault_version).length} analyses are stale.</b> Your profile changed since they were generated. <button className="btn p" onClick={async () => { setRf("Refreshing…"); const r = await post("/api/reanalyse", {}); setRf(r.ok ? `Refreshed ${r.data.refreshed}, failed ${r.data.failed}.` : "Refresh failed."); reload(); }}>Refresh analyses</button> <span className="m" role="status">{rf}</span></div>}
      <div className="row" style={{ marginBottom: 14 }}>{cards.map(([l, v]) => <div key={l} className="card" style={{ cursor: "default", minWidth: 110 }}><div className="m">{l}</div><b style={{ fontSize: 22 }}>{v}</b></div>)}</div>
      <div className="row" style={{ marginBottom: 14, alignItems: "center" }}>
        <input aria-label="Search" placeholder="Search title or funder" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Eligibility filter" value={el} onChange={(e) => setEl(e.target.value)}><option value="">All eligibility</option>{Object.entries(ELIG).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <label className="task" style={{ flex: "0 0 auto" }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Assigned to me</label>
        <select aria-label="Status filter" value={st} onChange={(e) => { setSt(e.target.value); setPage(0); }}><option value="">All statuses</option>{COLS.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label="Deadline filter" value={dl} onChange={(e) => { setDl(e.target.value); setPage(0); }}><option value="">Any deadline</option><option value="overdue">Overdue</option><option value="7">Next 7 days</option><option value="30">Next 30 days</option><option value="unknown">Unknown deadline</option></select>
        <select aria-label="Assignee filter" value={as} onChange={(e) => { setAs(e.target.value); setPage(0); }}><option value="">Anyone</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="deadline">Nearest deadline</option><option value="received">Recently received</option><option value="score">Highest alignment</option><option value="status">Status</option></select>
        <button className="btn" style={{ flex: "0 0 auto" }} onClick={clear}>Clear filters</button>
        <span role="group" aria-label="View" style={{ display: "flex", gap: 4, flex: "0 0 auto" }}><button className={"btn" + (view === "kanban" ? " p" : "")} aria-pressed={view === "kanban"} onClick={() => sv("kanban")}>Kanban</button><button className={"btn" + (view === "list" ? " p" : "")} aria-pressed={view === "list"} onClick={() => sv("list")}>List</button></span>
      </div>
      {view === "list" ? <ListView rows={sorted} page={page} setPage={setPage} name={name} setOpen={setOpen} /> : <div className="board" style={{ gridTemplateColumns: "repeat(8,minmax(250px,1fr))" }}>
        {COLS.map((c) => {
          const it = f.filter((o) => o.status === c);
          if (c === "New" || c === "Evaluating") it.sort((a, b) => (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || new Date(a.deadline) - new Date(b.deadline));
          return (
            <div key={c} className={"col" + (over === c ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(c); }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); upd(e.dataTransfer.getData("id"), { status: c }); }}>
              <h3><span>{c}</span><span>{it.length}</span></h3>
              {it.map((o) => {
                const n = o.deadline ? days(o.deadline) : null, s = o.alignment_score ?? 0, e = ELIG[o.eligibility_status];
                return (
                  <button key={o.id} className="card" draggable onDragStart={(ev) => ev.dataTransfer.setData("id", o.id)} onClick={() => setOpen(o.id)}>
                    <b>{o.grant_title}</b>
                    <div className={"m " + (n !== null && n < 0 ? "bad" : n !== null && n <= 3 ? "bad" : n !== null && n <= 7 ? "warn" : "")}>{o.deadline ? `Due ${o.deadline} (${n < 0 ? "overdue" : n + "d left"})` : "Deadline unknown"}</div>
                    <div className={cl(s)}><b>{s}/100</b><div className="bar" aria-hidden="true"><i style={{ width: s + "%" }} /></div></div>
                    {e && <span className={"tag " + e[1]}>{e[0]}</span>}{o.assigned_to && <div className="m">{name(o.assigned_to)}</div>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>}
      <h3>Recent activity</h3>{rec.length ? rec.map((a) => <div key={a.id} className="m">{a.created_at.slice(0, 16).replace("T", " ")} · {name(a.actor_id) || "System"} · {a.action_type.replace(/_/g, " ")}</div>) : <p className="m">No activity yet.</p>}
      <p className="m">Scores are alignment indicators, not win probabilities. New and Evaluating sort by nearest deadline, unknown deadlines last.</p>
    </>
  );
}

function Detail({ o, upd, close, members, uid, orgId, admin, del, org, reload }) {
  const [notes, setNotes] = useState([]), [tasks, setTasks] = useState([]), [act, setAct] = useState([]), [nt, setNt] = useState(""), [tt, setTt] = useState(""), [tp, setTp] = useState("medium"), [td, setTd] = useState(""), [ta, setTa] = useState(uid), [rm, setRm] = useState("");
  const load = async () => {
    const [a, b, c] = await Promise.all([sb().from("opportunity_notes").select("*").eq("opportunity_id", o.id).order("created_at", { ascending: false }), sb().from("opportunity_tasks").select("*").eq("opportunity_id", o.id).order("created_at"), sb().from("opportunity_activity").select("*").eq("opportunity_id", o.id).order("created_at", { ascending: false }).limit(15)]);
    setNotes(a.data || []); setTasks(b.data || []); setAct(c.data || []);
  };
  useEffect(() => { load(); }, [o.id, o.status, o.assigned_to]);
  const ref = useRef(null);
  useEffect(() => { const prev = document.activeElement; ref.current?.focus(); const k = (e) => e.key === "Escape" && close(); document.addEventListener("keydown", k); return () => { document.removeEventListener("keydown", k); prev?.focus?.(); }; }, []);
  const who = (id) => members.find((m) => m.user_id === id)?.display_name || "Someone";
  const fnd = o.eligibility_findings || [], ev = o.source_evidence || {};
  const e = ELIG[o.eligibility_status];
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Opportunity details" ref={ref} tabIndex={-1} style={{ outline: "none" }}>
      <div className="panel" style={{ maxWidth: 820 }}>
        <h2>{o.grant_title}</h2>
        <p className="m">{o.funder_name || "Funder unknown"} · {o.funding_max ? `up to ${o.currency || ""} ${o.funding_max}` : "Amount unknown"} · Due {o.deadline || "Unknown"} · via {o.received_via}</p>
        <p>{o.summary || "No summary."}</p>
        {o.source_url && <p><a href={o.source_url} target="_blank" rel="noreferrer">Official source</a></p>}
        <EditForm key={o.id + (o.updated_at || "")} o={o} reload={reload} />
        <p className="m"><b>How to read this page.</b> Source facts come from the funder text and can be corrected in the edit form (your corrections are marked, and the original AI value is shown). The fit assessment is computed from those facts and your profile. Items labelled AI suggestion are not verified. Your team makes the decision.</p>
        <h3>AI fit analysis</h3>
        {org && (o.vault_version_at_analysis ?? 0) < org.vault_version && <p className="warn"><b>Stale:</b> your profile changed after this analysis. Edits to fields above also need a refresh.</p>}
        <p><button className="btn" onClick={async () => { setRm("Refreshing…"); const r = await post("/api/reanalyse", { id: o.id }); setRm(r.ok && r.data.refreshed ? "Refreshed." : "Refresh failed."); reload(); }}>Refresh analysis</button> <span className="m" role="status">{rm}</span></p>
        <p><b className={cl(o.alignment_score || 0)}>{o.alignment_score ?? "?"}/100</b> {e && <span className={"tag " + e[1]}>{e[0]}</span>} <span className="m">Confidence {ev.confidence ?? "?"}%</span></p>
        <p className="m">{o.alignment_explanation} Analysed {o.last_analyzed_at?.slice(0, 10)} against vault v{o.vault_version_at_analysis}. Alignment shows how well the funder's stated requirements match your profile. It is not a prediction that the grant will be awarded. Review the evidence and decide.</p>
        {fnd.map((x, i) => <p key={i} className={x.kind === "conflict" ? "bad" : x.kind === "unknown" ? "warn" : "ok"} style={{ margin: "4px 0" }}><b>{x.kind === "conflict" ? "Conflict" : x.kind === "unknown" ? "Unknown" : "Match"}:</b> {x.text}{x.evidence && <span className="m"> Source text: "{x.evidence}"</span>}</p>)}
        {o.ai_strategy_notes ? <><p><b>Suggested angle (AI suggestion, not verified fact)</b></p><p style={{ whiteSpace: "pre-wrap" }}>{o.ai_strategy_notes}</p></> : o.analysis_status === "failed" && <p className="warn">AI strategy failed for this item. Facts above are still valid.</p>}
        <div className="row">
          <div><label htmlFor="st">Status</label><select id="st" value={o.status} onChange={(x) => upd(o.id, { status: x.target.value })}>{COLS.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label htmlFor="as">Assignee</label><select id="as" value={o.assigned_to || ""} onChange={(x) => upd(o.id, { assigned_to: x.target.value || null })}><option value="">Unassigned</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select></div>
        </div>
        <label htmlFor="au">Application document or portal link</label><input id="au" defaultValue={o.application_url || ""} onBlur={async (x) => { if (x.target.value === (o.application_url || "")) return; const r = await api("PATCH", "/api/opportunity", { id: o.id, patch: { application_url: x.target.value.trim() || null } }); setRm(r.ok ? "Link saved." : r.data.error || "Invalid link. Use http or https."); r.ok && reload(); }} />
        <h3>Tasks</h3>
        {tasks.map((k) => <label key={k.id} className="task"><input type="checkbox" checked={k.status === "done"} onChange={async () => { await sb().from("opportunity_tasks").update({ status: k.status === "done" ? "open" : "done" }).eq("id", k.id); load(); }} />{k.title} <span className="m">{k.priority}{k.due_date ? " · due " + k.due_date : ""}</span></label>)}
        <div className="row"><input aria-label="Task title" placeholder="New task" value={tt} onChange={(x) => setTt(x.target.value)} /><input aria-label="Due date" type="date" value={td} onChange={(x) => setTd(x.target.value)} style={{ flex: "0 0 150px" }} />
          <select aria-label="Task assignee" value={ta} onChange={(x) => setTa(x.target.value)} style={{ flex: "0 0 130px" }}>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name}</option>)}</select><select aria-label="Priority" value={tp} onChange={(x) => setTp(x.target.value)} style={{ flex: "0 0 110px" }}><option>low</option><option>medium</option><option>high</option></select>
          <button className="btn" style={{ flex: "0 0 auto" }} onClick={async () => { if (!tt.trim()) return; await sb().from("opportunity_tasks").insert({ organization_id: orgId, opportunity_id: o.id, title: tt.trim(), priority: tp, due_date: td || null, assigned_to: ta || null, created_by: uid }); setTt(""); setTd(""); load(); }}>Add</button></div>
        <h3>Notes</h3>
        {notes.map((n) => <p key={n.id} style={{ margin: "6px 0" }}>{n.content} <span className="m">{who(n.author_id)} · {n.created_at.slice(0, 10)}</span></p>)}
        <div className="row"><input aria-label="New note" placeholder="Add an internal note" value={nt} onChange={(x) => setNt(x.target.value)} /><button className="btn" style={{ flex: "0 0 auto" }} onClick={async () => { if (!nt.trim()) return; await sb().from("opportunity_notes").insert({ organization_id: orgId, opportunity_id: o.id, author_id: uid, content: nt.trim() }); setNt(""); load(); }}>Add</button></div>
        <h3>Activity</h3>
        {act.map((a) => <div key={a.id} className="m">{a.created_at.slice(0, 16).replace("T", " ")} · {who(a.actor_id)} · {a.action_type.replace("_", " ")} {a.metadata?.to ? "→ " + (a.metadata.to.length > 20 ? who(a.metadata.to) : a.metadata.to) : ""}</div>)}
        <p><button className="btn p" onClick={close}>Close</button> {admin && <button className="btn" onClick={() => confirm("Delete this opportunity permanently?") && del()}>Delete</button>}</p>
      </div>
    </div>
  );
}

function Add({ done }) {
  const [t, setT] = useState(""), [st, setSt] = useState(""), [mode, setMode] = useState(null), [stt, setStt] = useState(null);
  useEffect(() => { api("GET", "/api/status").then((r) => r.ok && setStt(r.data)); }, []);
  const go = async () => {
    setSt("Analysing…"); const r = await post("/api/intake", { text: t }); if (!r.ok) return setSt(r.data.error || "Failed. Nothing was saved.");
    setMode(r.data.mode); setSt(r.data.result === "duplicate" ? "Already in your pipeline." : r.data.result === "review" ? "Added for review." : "Added."); setTimeout(done, 900);
  };
  return (
    <div className="panel">
      <h2>Add opportunity</h2>
      <p className="m">Paste a public grant link, text or notes. Without an AI key this runs a deterministic <b>demo extractor</b>, not live AI. WhatsApp intake is configured under WhatsApp.</p>
      {stt && <p className={stt.ai === "live" ? "ok" : "warn"}><b>{stt.ai === "live" ? "AI extraction: live." : "AI extraction: DEMO mode. Simple rules, not AI. Results are labelled demo."}</b></p>}
      <label htmlFor="g">Grant link or text</label><textarea id="g" rows={7} value={t} onChange={(e) => setT(e.target.value)} />
      <p><button className="btn p" disabled={!t.trim()} onClick={go}>Analyse and add</button> <button className="btn" onClick={() => setT(SAMPLE)}>Use sample</button> <span className="m" role="status">{st}{mode === "mock" && " (demo mode)"}</span></p>
    </div>
  );
}

function Vault({ org, admin, reload }) {
  const [f, setF] = useState({ name: org.name || "", mission_statement: org.mission_statement || "", country: org.country || "", website: org.website || "", organization_type: org.organization_type || "", registration_status: org.registration_status || "", budget_size: org.budget_size ?? "", budget_currency: org.budget_currency || "USD", focus: (org.focus_areas || []).join(", "), reach: (org.geographic_reach || []).join(", "), beneficiary_groups: org.beneficiary_groups || "", impact_summary: org.impact_summary || "", typical_grant_size: org.typical_grant_size ?? "" }), [st, setSt] = useState("");
  const S = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    const { focus, reach, ...r } = f;
    if (!r.name.trim()) return setSt("Name is required."); if (r.budget_size !== "" && !(+r.budget_size >= 0)) return setSt("Budget must be a positive number."); if (r.website && !/^https?:\/\/\S+\.\S+/.test(r.website)) return setSt("Website must start with http:// or https://");
    const { error } = await sb().from("organizations").update({ ...r, budget_size: r.budget_size === "" ? null : +r.budget_size, typical_grant_size: r.typical_grant_size === "" ? null : +r.typical_grant_size, focus_areas: list(focus), geographic_reach: list(reach), onboarding_completed: true }).eq("id", org.id);
    setSt(error ? "Could not save: " + error.message : "Saved. Existing analyses are now stale until re-run."); reload();
  };
  const T = ([k, l, area]) => <div key={k}><label htmlFor={k}>{l}</label>{area ? <textarea id={k} rows={3} value={f[k]} onChange={S(k)} disabled={!admin} /> : <input id={k} value={f[k]} onChange={S(k)} disabled={!admin} />}</div>;
  return (
    <div className="panel">
      <h2>Organization Knowledge Vault</h2>{!admin && <p className="m">Only owners and admins can edit.</p>}
      {[["name", "Name"], ["mission_statement", "Mission statement", 1], ["country", "Country"], ["website", "Website"], ["organization_type", "Organization type (e.g. NGO, charity)"], ["registration_status", "Registration status"]].map(T)}
      <div className="row">{T(["budget_size", "Annual budget"])}{T(["budget_currency", "Currency"])}</div>
      {T(["typical_grant_size", "Typical grant size"])}
      {[["focus", "Focus areas (comma separated)"], ["reach", "Geographic reach (comma separated)"], ["beneficiary_groups", "Beneficiary groups", 1], ["impact_summary", "Previous projects and measurable impact", 1]].map(T)}
      {(() => { const m = [["mission_statement", "mission"], ["organization_type", "organization type"], ["registration_status", "registration status"], ["budget_size", "annual budget"], ["beneficiary_groups", "beneficiaries"], ["impact_summary", "impact"]].filter(([k]) => f[k] === "" || f[k] == null).map(([, l]) => l); if (!f.focus.trim()) m.push("focus areas"); return m.length ? <p className="warn">Missing information lowers analysis confidence: {m.join(", ")}.</p> : null; })()}
      <p>{admin && <button className="btn p" onClick={save}>Save vault</button>} <span className="m" role="status">{st}</span></p>
    </div>
  );
}

function WA({ admin }) {
  const [stt, setStt] = useState(null), [s, setS] = useState([]), [msgs, setMsgs] = useState([]), [ph, setPh] = useState(""), [code, setCode] = useState(""), [err, setErr] = useState("");
  const load = async () => { setS((await sb().from("whatsapp_senders").select("*")).data || []); if (admin) setMsgs((await sb().from("inbound_messages").select("id,processing_status,error_message,received_at,message_type,retry_count").order("received_at", { ascending: false }).limit(8)).data || []); };
  useEffect(() => { load(); api("GET", "/api/status").then((r) => r.ok && setStt(r.data)); }, []);
  return (
    <div className="panel">
      <h2>WhatsApp integration</h2>
      <p className="m">Add your number, then send <b>VERIFY &lt;code&gt;</b> to the FundFlow WhatsApp number from that phone. Only verified numbers can add opportunities to this organization.</p>
      {stt && <p className="m">Server status: WhatsApp {stt.whatsapp}, AI {stt.ai === "live" ? "live" : "demo mode"}, deadline reminder job {stt.reminders}. Reminders are in-app notifications only. Nothing is sent by email or WhatsApp.</p>}
      {s.map((x) => <p key={x.id}>{x.phone_number.replace("whatsapp:", "")} · <span className={x.verification_status === "verified" ? "ok" : "warn"}>{x.verification_status}</span></p>)}
      {admin && <div className="row"><input aria-label="Phone number" placeholder="+8801XXXXXXXXX" value={ph} onChange={(e) => setPh(e.target.value)} /><button className="btn p" style={{ flex: "0 0 auto" }} onClick={async () => { const r = await post("/api/senders", { phone: ph }); r.ok ? (setCode(r.data.code), setErr(""), load()) : setErr(r.data.error); }}>Add number</button></div>}
      {code && <p>Your one-time code: <b>{code}</b>. Send "VERIFY {code}" now. It is not shown again.</p>}
      <p className="err" role="alert">{err}</p>
      {admin && <><h3>Recent processing</h3>{msgs.length ? msgs.map((m, i) => <div key={i} className="m">{m.received_at.slice(0, 16).replace("T", " ")} · {m.processing_status}{m.error_message ? " · " + m.error_message : ""}{["failed", "received", "processing"].includes(m.processing_status) && m.message_type === "text" && <button className="btn" style={{ minHeight: 32, marginLeft: 8 }} onClick={async () => { await post("/api/retry", { messageId: m.id }); load(); }} disabled={(m.retry_count || 0) >= 3}>Retry ({m.retry_count || 0}/3)</button>}</div>) : <p className="m">No messages yet.</p>}</>}
    </div>
  );
}

function Invite({ done }) {
  const tok = typeof location !== "undefined" ? new URLSearchParams(location.search).get("invite") : null; const [err, setErr] = useState("");
  if (!tok) return null;
  return <div className="panel"><h2>You have an invitation</h2><p className="m">Sign in with the invited email address, then accept.</p><button className="btn p" onClick={async () => { const { error } = await sb().rpc("accept_invite", { p_token: tok }); error ? setErr("This invitation link is invalid, expired, already used, or was issued to a different email address. Sign in with the invited email, or ask for a new link.") : (history.replaceState(null, "", "/app"), done()); }}>Accept invitation</button><p className="err" role="alert">{err}</p></div>;
}

function Wizard({ org, done, skip }) {
  const STEPS = [["Organization", [["organization_type", "Organization type (e.g. NGO)"], ["registration_status", "Registration status"], ["website", "Website"]]], ["Mission and impact", [["mission_statement", "Mission statement", 1], ["beneficiary_groups", "Beneficiary groups", 1], ["impact_summary", "Previous projects and measurable impact", 1]]], ["Funding profile", [["budget_size", "Annual budget (number)"], ["budget_currency", "Currency"], ["typical_grant_size", "Typical grant size (number)"], ["focus", "Focus areas (comma separated)"], ["reach", "Geographic reach (comma separated)"]]], ["Invite teammates", []]];
  const [i, setI] = useState(Math.min(org.onboarding_step || 0, 3)), [err, setErr] = useState(""), [em, setEm] = useState(""), [rl, setRl] = useState("member"), [lk, setLk] = useState("");
  const [f, setF] = useState({ organization_type: org.organization_type || "", registration_status: org.registration_status || "", website: org.website || "", mission_statement: org.mission_statement || "", beneficiary_groups: org.beneficiary_groups || "", impact_summary: org.impact_summary || "", budget_size: org.budget_size ?? "", budget_currency: org.budget_currency || "USD", typical_grant_size: org.typical_grant_size ?? "", focus: (org.focus_areas || []).join(", "), reach: (org.geographic_reach || []).join(", ") });
  const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean), num = (v) => (v === "" ? null : +v);
  const next = async () => {
    if (i === 3) { const { error } = await sb().from("organizations").update({ onboarding_completed: true, onboarding_step: 4 }).eq("id", org.id); return error ? setErr("Could not save: " + error.message) : done(); }
    if (i === 0 && f.website && !/^https?:\/\/\S+\.\S+/.test(f.website)) return setErr("Website must start with http:// or https://");
    if (i === 2 && ((f.budget_size !== "" && !(+f.budget_size >= 0)) || (f.typical_grant_size !== "" && !(+f.typical_grant_size >= 0)))) return setErr("Amounts must be positive numbers.");
    const p = i === 0 ? { organization_type: f.organization_type, registration_status: f.registration_status, website: f.website, onboarding_step: 1 } : i === 1 ? { mission_statement: f.mission_statement, beneficiary_groups: f.beneficiary_groups, impact_summary: f.impact_summary, onboarding_step: 2 } : { budget_size: num(f.budget_size), budget_currency: f.budget_currency, typical_grant_size: num(f.typical_grant_size), focus_areas: list(f.focus), geographic_reach: list(f.reach), onboarding_step: 3 };
    const { error } = await sb().from("organizations").update(p).eq("id", org.id); if (error) return setErr("Could not save: " + error.message); setErr(""); setI(i + 1);
  };
  return (
    <div className="panel">
      <h1>Set up {org.name}</h1><p className="m">Step {i + 1} of 4: {STEPS[i][0]}. Progress is saved, you can leave and return. Your profile is what grant fit is measured against, so more detail means a more useful assessment.</p>
      {STEPS[i][1].map(([k, l, a]) => <div key={k}><label htmlFor={"w" + k}>{l}</label>{a ? <textarea id={"w" + k} rows={3} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /> : <input id={"w" + k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</div>)}
      {i === 3 && <><p className="m">Optional. Invitations are development mode: no email is sent. Copy the link and share it privately. It works once, for that email address, for 7 days.</p>
        <div className="row"><input aria-label="Teammate email" type="email" placeholder="name@example.org" value={em} onChange={(e) => setEm(e.target.value)} /><select aria-label="Role" value={rl} onChange={(e) => setRl(e.target.value)} style={{ flex: "0 0 120px" }}><option>member</option><option>admin</option></select>
          <button className="btn" style={{ flex: "0 0 auto" }} onClick={async () => { const r = await post("/api/invites", { email: em, role: rl }); r.ok ? (setLk(r.data.link), setEm(""), setErr("")) : setErr(r.data.error || "Could not create invite"); }}>Create invite</button></div>
        {lk && <p>Invite link (shown once): <input readOnly aria-label="Invite link" value={lk} onFocus={(e) => e.target.select()} /></p>}</>}
      <p>{i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Back</button>} <button className="btn p" onClick={next}>{i < 3 ? "Save and continue" : "Finish"}</button> <button className="btn" onClick={skip}>Skip for now</button></p>
      <p className="err" role="alert">{err}</p>
    </div>
  );
}

function SetPassword({ done }) {
  const [a, setA] = useState(""), [b, setB] = useState(""), [msg, setMsg] = useState("");
  return (
    <div className="panel"><h1>Set a new password</h1>
      <label htmlFor="np">New password</label><input id="np" type="password" value={a} onChange={(e) => setA(e.target.value)} />
      <label htmlFor="np2">Confirm new password</label><input id="np2" type="password" value={b} onChange={(e) => setB(e.target.value)} />
      <p><button className="btn p" onClick={async () => { if (a.length < 8) return setMsg("Use at least 8 characters."); if (a !== b) return setMsg("Passwords do not match."); const { error } = await sb().auth.updateUser({ password: a }); error ? setMsg(error.message) : (history.replaceState(null, "", "/app"), done()); }}>Save password</button></p>
      <p className="err" role="alert">{msg}</p></div>
  );
}

function MyTasks({ uid, opps, setOpen }) {
  const [t, setT] = useState(null), [all, setAll] = useState(false);
  const load = async () => { let q = sb().from("opportunity_tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }); if (!all) q = q.eq("assigned_to", uid); setT((await q).data || []); };
  useEffect(() => { load(); }, [all]);
  const today = new Date().toISOString().slice(0, 10);
  if (!t) return <p role="status">Loading…</p>;
  return (
    <div className="panel" style={{ maxWidth: 820 }}>
      <h2>Tasks</h2><label className="task"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Show all team tasks</label>
      {t.length === 0 && <p className="m">No tasks. Add tasks from an opportunity.</p>}
      {t.map((k) => { const o = opps.find((x) => x.id === k.opportunity_id), late = k.status === "open" && k.due_date && k.due_date < today; return (
        <label key={k.id} className="task"><input type="checkbox" checked={k.status === "done"} onChange={async () => { await sb().from("opportunity_tasks").update({ status: k.status === "done" ? "open" : "done" }).eq("id", k.id); load(); }} /><span>{k.title} <span className={"m " + (late ? "bad" : "")}>{k.priority}{k.due_date ? " · due " + k.due_date : ""}{late ? " · overdue" : ""}</span> {o && <button className="btn" style={{ minHeight: 32, padding: "0 10px" }} onClick={(e) => { e.preventDefault(); setOpen(o.id); }}>{o.grant_title}</button>}</span></label>); })}
    </div>
  );
}

const KEY = { deadline: (a, b) => (a.deadline ? 0 : 1) - (b.deadline ? 0 : 1) || new Date(a.deadline) - new Date(b.deadline), received: (a, b) => new Date(b.created_at) - new Date(a.created_at), score: (a, b) => (b.alignment_score ?? -1) - (a.alignment_score ?? -1), status: (a, b) => COLS.indexOf(a.status) - COLS.indexOf(b.status) };
const api = async (method, url, body) => { const r = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) }, body: body ? JSON.stringify(body) : undefined }); if (r.status === 401) sb().auth.signOut(); return { ok: r.ok, data: await r.json().catch(() => ({})) }; };

function ListView({ rows, page, setPage, name, setOpen }) {
  const PS = 15, pages = Math.max(1, Math.ceil(rows.length / PS)), p = Math.min(page, pages - 1), td = { padding: 8, borderBottom: "1px solid var(--line)", verticalAlign: "top" };
  if (!rows.length) return <p className="m">No opportunities match these filters.</p>;
  return (
    <>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
        <caption className="m" style={{ textAlign: "left" }}>{rows.length} opportunities</caption>
        <thead><tr>{["Grant", "Funder", "Funding", "Deadline", "Score", "Eligibility", "Status", "Assignee", "Received", "Source"].map((h) => <th key={h} scope="col" style={{ ...td, textAlign: "left" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.slice(p * PS, p * PS + PS).map((o) => { const n = o.deadline ? days(o.deadline) : null, e = ELIG[o.eligibility_status]; return (
          <tr key={o.id}>
            <td style={td}><button className="btn" style={{ minHeight: 32, textAlign: "left" }} onClick={() => setOpen(o.id)}>{o.grant_title}</button></td>
            <td style={td}>{o.funder_name || "Unknown"}</td>
            <td style={td}>{o.funding_max != null ? `${o.currency || ""} ${o.funding_min != null ? o.funding_min + " to " : "up to "}${o.funding_max}` : "Unknown"}</td>
            <td style={td} className={n !== null && n < 0 ? "bad" : n !== null && n <= 7 ? "warn" : ""}>{o.deadline ? `${o.deadline}${n < 0 ? " (overdue)" : ` (${n}d)`}` : "Unknown"}</td>
            <td style={td}><b className={cl(o.alignment_score || 0)}>{o.alignment_score ?? "?"}</b></td>
            <td style={td}>{e ? <span className={"tag " + e[1]}>{e[0]}</span> : "Unknown"}</td>
            <td style={td}>{o.status}</td><td style={td}>{name(o.assigned_to) || "Unassigned"}</td>
            <td style={td}>{o.created_at?.slice(0, 10)}</td><td style={td}>{o.received_via}</td>
          </tr>); })}</tbody></table></div>
      <p><button className="btn" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</button> <span className="m" role="status">Page {p + 1} of {pages}</span> <button className="btn" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</button></p>
    </>
  );
}

function EditForm({ o, reload }) {
  const L = (a) => (a || []).join(", "), list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean), nul = (v) => (String(v).trim() === "" ? null : String(v).trim());
  const [f, setF] = useState({ grant_title: o.grant_title, funder_name: o.funder_name || "", summary: o.summary || "", source_url: o.source_url || "", currency: o.currency || "", funding_min: o.funding_min ?? "", funding_max: o.funding_max ?? "", opening_date: o.opening_date || "", deadline: o.deadline || "", eligible_countries: L(o.eligible_countries ?? o.extraction?.eligible_countries), eligible_applicant_types: L(o.eligible_applicant_types ?? o.extraction?.eligible_applicant_types), eligibility_requirements: L(o.eligibility_requirements ?? o.extraction?.eligibility_requirements), focus_areas: L(o.focus_areas), required_documents: L(o.required_documents), submission_date: o.submission_date || "", application_reference: o.application_reference || "", prep_notes: o.prep_notes || "" });
  const [cl2, setCl] = useState(o.document_checklist || []), [ni, setNi] = useState(""), [msg, setMsg] = useState("");
  const S = (k) => (e) => setF({ ...f, [k]: e.target.value }), C = (k) => (o.user_corrections?.[k] ? <><span className="tag ok">corrected by you</span><span className="m"> AI extracted: {(() => { const v = o.user_corrections[k].previous; return Array.isArray(v) ? v.join(", ") || "none" : v ?? "unknown"; })()}</span></> : null);
  const save = async () => {
    setMsg("Saving…");
    const patch = { grant_title: f.grant_title, funder_name: nul(f.funder_name), summary: nul(f.summary), source_url: nul(f.source_url), currency: nul(f.currency), funding_min: nul(f.funding_min) === null ? null : +f.funding_min, funding_max: nul(f.funding_max) === null ? null : +f.funding_max, opening_date: nul(f.opening_date), deadline: nul(f.deadline), eligible_countries: list(f.eligible_countries), eligible_applicant_types: list(f.eligible_applicant_types), eligibility_requirements: list(f.eligibility_requirements), focus_areas: list(f.focus_areas), required_documents: list(f.required_documents), submission_date: nul(f.submission_date), application_reference: nul(f.application_reference), prep_notes: nul(f.prep_notes), document_checklist: cl2 };
    const r = await api("PATCH", "/api/opportunity", { id: o.id, patch });
    setMsg(r.ok ? "Saved. Refresh the analysis to apply your corrections." : (r.data.error || "Failed") + (r.data.details ? ": " + r.data.details.join("; ") : "")); if (r.ok) reload();
  };
  const T = ([k, l, type, area]) => <div key={k}><label htmlFor={"e" + k}>{l} {C(k)}</label>{area ? <textarea id={"e" + k} rows={3} value={f[k]} onChange={S(k)} /> : <input id={"e" + k} type={type || "text"} value={f[k]} onChange={S(k)} />}</div>;
  return (
    <details><summary><b>Edit details and application tracking</b></summary>
      <p className="m">Values come from AI extraction until you change them. Your edits are marked, and the original AI evidence is kept. Blank lists mean unknown, not "open to all".</p>
      {[["grant_title", "Title"], ["funder_name", "Funder"], ["source_url", "Source URL"], ["summary", "Summary", "", 1]].map(T)}
      <div className="row">{[["currency", "Currency"], ["funding_min", "Minimum funding", "number"], ["funding_max", "Maximum funding", "number"]].map(T)}</div>
      <div className="row">{[["opening_date", "Opening date", "date"], ["deadline", "Deadline", "date"]].map(T)}</div>
      {[["eligible_countries", "Eligible countries (comma separated)"], ["eligible_applicant_types", "Eligible applicant types"], ["eligibility_requirements", "Eligibility requirements"], ["focus_areas", "Focus areas"], ["required_documents", "Required documents"]].map(T)}
      <h3>Application tracking</h3>
      <div className="row">{[["submission_date", "Submission date", "date"], ["application_reference", "External application reference"]].map(T)}</div>
      {T(["prep_notes", "Internal preparation notes", "", 1])}
      <label>Document checklist</label>
      {cl2.map((x, i) => <label key={i} className="task"><input type="checkbox" checked={x.done} onChange={() => setCl(cl2.map((y, j) => (j === i ? { ...y, done: !y.done } : y)))} />{x.t} <button className="btn" style={{ minHeight: 32, marginLeft: "auto" }} onClick={(e) => { e.preventDefault(); setCl(cl2.filter((_, j) => j !== i)); }}>Remove</button></label>)}
      <div className="row"><input aria-label="New checklist item" placeholder="Add checklist item" value={ni} onChange={(e) => setNi(e.target.value)} /><button className="btn" style={{ flex: "0 0 auto" }} onClick={() => { if (ni.trim()) { setCl([...cl2, { t: ni.trim(), done: false }]); setNi(""); } }}>Add</button></div>
      <p><button className="btn p" onClick={save}>Save changes</button> <span className="m" role="status">{msg}</span></p>
    </details>
  );
}

function Team({ members, role, uid, opps, reload }) {
  const [q, setQ] = useState(""), [email, setEmail] = useState(""), [r, setR] = useState("member"), [link, setLink] = useState(""), [err, setErr] = useState(""), [pend, setPend] = useState([]);
  const loadP = async () => role !== "member" && setPend((await sb().from("organization_invites").select("email,role,expires_at,accepted_at")).data?.filter((x) => !x.accepted_at && new Date(x.expires_at) > new Date()) || []);
  useEffect(() => { loadP(); }, []);
  const run = async (fn) => { const { error } = await fn(); setErr(error ? error.message : ""); reload(); };
  const can = (m) => m.role !== "owner" && (m.user_id === uid || role === "owner" || (role === "admin" && m.role === "member"));
  return (
    <div className="panel" style={{ maxWidth: 820 }}>
      <h2>Team</h2><input aria-label="Search members" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}><thead><tr>{["Name", "Email", "Role", "Open assigned", ""].map((h) => <th key={h} scope="col" style={{ textAlign: "left", padding: 6 }}>{h}</th>)}</tr></thead>
        <tbody>{members.filter((m) => (m.display_name + (m.email || "")).toLowerCase().includes(q.toLowerCase())).map((m) => (
          <tr key={m.user_id}><td style={{ padding: 6 }}>{m.display_name}{m.user_id === uid && " (you)"}</td><td style={{ padding: 6 }}>{m.email}</td>
            <td style={{ padding: 6 }}>{role === "owner" && m.role !== "owner" ? <select aria-label={"Role for " + m.display_name} value={m.role} onChange={(e) => confirm(`Change ${m.display_name} to ${e.target.value}?`) && run(() => sb().rpc("set_member_role", { p_user: m.user_id, p_role: e.target.value }))}><option>member</option><option>admin</option></select> : m.role}</td>
            <td style={{ padding: 6 }}>{opps.filter((o) => o.assigned_to === m.user_id && !["Won", "Lost", "Archived", "Submitted"].includes(o.status)).length}</td>
            <td style={{ padding: 6 }}>{can(m) && <button className="btn" style={{ minHeight: 32 }} onClick={() => confirm(m.user_id === uid ? "Leave this organization?" : `Remove ${m.display_name}? Their assignments become unassigned. Grant history is kept.`) && run(() => sb().rpc("remove_member", { p_user: m.user_id }))}>{m.user_id === uid ? "Leave" : "Remove"}</button>}</td></tr>))}</tbody></table></div>
      {role !== "member" && <>
        <h3>Invite a teammate</h3><p className="m">Development mode: no email is sent. Copy the link and share it privately. It works once, for that email address, for 7 days.</p>
        <div className="row"><input aria-label="Email" type="email" placeholder="name@example.org" value={email} onChange={(e) => setEmail(e.target.value)} /><select aria-label="Role" value={r} onChange={(e) => setR(e.target.value)} style={{ flex: "0 0 120px" }}><option>member</option>{role === "owner" && <option>admin</option>}</select>
          <button className="btn p" style={{ flex: "0 0 auto" }} onClick={async () => { const x = await post("/api/invites", { email, role: r }); x.ok ? (setLink(x.data.link), setErr(""), setEmail(""), loadP()) : setErr(x.data.error); }}>Create invite</button></div>
        {link && <p>Invite link (shown once): <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} /></p>}
        {pend.map((p, i) => <div key={i} className="m">Pending: {p.email} ({p.role})</div>)}</>}
      <p className="err" role="alert">{err}</p>
    </div>
  );
}

function Docs({ admin }) {
  const [d, setD] = useState([]), [cat, setCat] = useState("other"), [pr, setPr] = useState(0), [msg, setMsg] = useState(""), CATS = ["registration", "profile", "annual_report", "impact_report", "bio", "project_summary", "template", "other"];
  const load = async () => setD((await sb().from("org_documents").select("*").order("created_at", { ascending: false })).data || []);
  useEffect(() => { load(); }, []);
  const up = async (file) => {
    if (!file) return; if (file.size > 4194304) return setMsg("File exceeds 4 MB."); setMsg("Uploading…");
    const fd = new FormData(); fd.append("file", file); fd.append("category", cat);
    const x = new XMLHttpRequest(); x.open("POST", "/api/documents"); x.setRequestHeader("Authorization", "Bearer " + (await token()));
    x.upload.onprogress = (e) => e.lengthComputable && setPr(Math.round((100 * e.loaded) / e.total));
    x.onload = () => { setPr(0); setMsg(x.status === 200 ? "Uploaded." : JSON.parse(x.responseText || "{}").error || "Upload failed."); load(); }; x.onerror = () => { setPr(0); setMsg("Upload failed."); }; x.send(fd);
  };
  return (
    <div className="panel">
      <h2>Documents</h2><p className="m">Private storage, visible to your team only. PDF, DOCX or TXT, up to 4 MB. A document in the library does not prove that a grant requirement is met.</p>
      <div className="row"><select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</select><input aria-label="Choose file" type="file" accept=".pdf,.docx,.txt" onChange={(e) => { up(e.target.files[0]); e.target.value = ""; }} /></div>
      {pr > 0 && <progress value={pr} max="100" aria-label="Upload progress" />}<p className="m" role="status">{msg}</p>
      {d.length === 0 && <p className="m">No documents yet.</p>}
      {d.map((x) => <div key={x.id} className="task"><span style={{ flex: 1 }}>{x.filename} <span className="m">{x.category?.replace("_", " ")} · {Math.round(x.size_bytes / 1024)} KB · {x.created_at.slice(0, 10)}</span></span>
        <button className="btn" style={{ minHeight: 32 }} onClick={async () => { const r = await api("GET", "/api/documents?id=" + x.id); r.ok ? window.open(r.data.url, "_blank", "noopener") : setMsg("Could not open file."); }}>Download</button>
        {admin && <button className="btn" style={{ minHeight: 32 }} onClick={async () => { if (!confirm("Delete " + x.filename + "?")) return; const r = await api("DELETE", "/api/documents?id=" + x.id); setMsg(r.ok ? "Deleted." : r.data.error); load(); }}>Delete</button>}</div>)}
    </div>
  );
}

function Bell({ setOpen, setTab }) {
  const [n, setN] = useState([]), [on, setOn] = useState(false);
  const load = async () => setN((await sb().from("notifications").select("*").order("created_at", { ascending: false }).limit(30)).data || []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const unread = n.filter((x) => !x.read_at).length, mark = async (ids) => { await sb().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids); load(); };
  return (
    <span style={{ position: "relative" }}>
      <button aria-expanded={on} aria-label={`Notifications, ${unread} unread`} onClick={() => setOn(!on)}>Notifications{unread ? ` (${unread})` : ""}</button>
      {on && <div className="panel" role="region" aria-label="Notifications" style={{ position: "fixed", top: 70, right: 12, width: "min(380px,94vw)", maxHeight: "70vh", overflow: "auto", margin: 0, zIndex: 5 }}>
        <p><button className="btn" disabled={!unread} onClick={() => mark(n.filter((x) => !x.read_at).map((x) => x.id))}>Mark all read</button> <button className="btn" onClick={() => setOn(false)}>Close</button></p>
        {n.length === 0 && <p className="m">No notifications yet.</p>}
        {n.map((x) => <button key={x.id} className="card" style={{ cursor: "pointer", opacity: x.read_at ? 0.6 : 1 }} onClick={() => { !x.read_at && mark([x.id]); setOn(false); x.opportunity_id ? setOpen(x.opportunity_id) : setTab("team"); }}><b>{x.title}</b><div className="m">{x.type.replace(/_/g, " ")} · {x.created_at.slice(0, 16).replace("T", " ")}</div></button>)}
      </div>}
    </span>
  );
}
