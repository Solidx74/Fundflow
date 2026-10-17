import Link from "next/link";
export const metadata = { title: "FundFlow: every grant opportunity, organized" };
const steps = [["Capture", "Forward a grant link, text or flyer from a verified WhatsApp number, or add it by hand."], ["Assess", "FundFlow extracts the requirements, keeps the source evidence, and compares them with your profile."], ["Coordinate", "Your team reviews and corrects the facts, assigns tasks and tracks each application."]];
export default function Landing() {
  return (
    <>
      <header><h1>FundFlow</h1><nav aria-label="Account"><Link className="btn" href="/app" style={{ display: "inline-flex", alignItems: "center" }}>Log in</Link><Link className="btn p" href="/app" style={{ display: "inline-flex", alignItems: "center" }}>Get started</Link></nav></header>
      <main>
        <section style={{ maxWidth: 760, margin: "40px auto" }}>
          <h2 style={{ fontSize: 40, lineHeight: 1.15 }}>Every grant opportunity, organized.</h2>
          <p style={{ fontSize: 18 }} className="m">Collect grants from WhatsApp, see where your NGO may be ineligible before you spend hours applying, and keep your team on one pipeline. AI supports your decision. Your team makes it. A fit score shows how well a grant matches your profile. It does not predict whether you will be awarded.</p>
          <Link className="btn p" href="/app" style={{ display: "inline-flex", alignItems: "center" }}>Create your workspace</Link>
        </section>
        <section aria-label="Illustrative preview" className="board" style={{ gridTemplateColumns: "repeat(3,minmax(220px,1fr))" }}>
          {[["New", "Coastal Resilience Grant", "Due in 12 days", "91/100", "Likely eligible", "ok"], ["Evaluating", "Girls STEM Fund", "Due in 25 days", "48/100", "Needs review", "warn"], ["Drafting", "Urban Youth Prize", "Due in 40 days", "22/100", "Likely ineligible", "bad"]].map(([c, t, d, s, e, k]) => (
            <div key={c} className="col"><h3><span>{c}</span></h3><div className="card" style={{ cursor: "default" }}><b>{t}</b><div className="m">{d}</div><div className={k}><b>{s}</b></div><span className={"tag " + k}>{e}</span></div></div>))}
        </section>
        <p className="m" style={{ textAlign: "center" }}>Illustrative preview with sample data.</p>
        <section style={{ maxWidth: 900, margin: "30px auto" }}><h2>How it works</h2><div className="row">{steps.map(([t, d], i) => <div key={t} className="card" style={{ cursor: "default" }}><b>{i + 1}. {t}</b><p className="m">{d}</p></div>)}</div></section>
        <section style={{ maxWidth: 900, margin: "30px auto" }}><div className="row">{[["WhatsApp intake", "Only verified numbers can add opportunities to your organization."], ["AI fit analysis", "Evidence-linked findings. Hard conflicts are never hidden behind a high score."], ["Knowledge Vault", "Keep your mission and profile in one place. Stale analyses are flagged."], ["Grant pipeline", "Kanban, deadlines, tasks, notes and activity for your team."]].map(([t, d]) => <div key={t} className="card" style={{ cursor: "default" }}><b>{t}</b><p className="m">{d}</p></div>)}</div></section>
      </main>
    </>
  );
}
