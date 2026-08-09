"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Bot, CheckCircle2, Hand, ShieldCheck, Sparkles } from "lucide-react";
import { Shell } from "../../components/shell";

const agents = [
  { name: "Atlas", job: "finds realistic sponsor companies" },
  { name: "Sage", job: "scores fit and commercial evidence" },
  { name: "Relay", job: "finds the right decision-makers" },
  { name: "Echo", job: "prepares personal outreach drafts" },
] as const;

export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState("there");
  const [profileReady, setProfileReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/backend/auth/me", { credentials: "include", cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/backend/experience", { credentials: "include", cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    ]).then(([auth, experience]) => {
      if (auth?.user?.name) setName(String(auth.user.name).split(/\s+/)[0]);
      setProfileReady(Boolean(experience?.setup?.steps?.find((step: { key: string }) => step.key === "profile")?.completed));
    }).catch(() => setError("GridFlow could not load your starting point. Refresh and try again."));
  }, []);

  async function begin(): Promise<void> {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/backend/experience", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ welcomeCompleted: true, tutorialStep: 0 }),
      });
      if (!response.ok) throw new Error("Your progress could not be saved.");
      router.push(profileReady ? "/guide" : "/onboarding");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GridFlow could not continue.");
      setSaving(false);
    }
  }

  return (
    <Shell title="Welcome">
      <section className="welcome-hero">
        <div className="welcome-copy">
          <span className="welcome-kicker"><Sparkles size={14}/> Your commercial operating system</span>
          <h1>Welcome to GridFlow, {name}.</h1>
          <p>GridFlow turns sponsor discovery, research, outreach, replies, meetings and proposals into one guided workflow. The repetitive work is automated; important commercial decisions stay yours.</p>
          <div className="welcome-actions">
            <button className="button button-primary button-large" type="button" disabled={saving} onClick={begin}>{saving ? "Preparing your workspace…" : "Set up my GridFlow"}<ArrowRight size={16}/></button>
            <Link className="button button-secondary button-large" href="/help">Read the user manual</Link>
          </div>
          {error ? <div className="notice notice-error">{error}</div> : null}
        </div>
        <div className="welcome-promise card">
          <div className="welcome-promise-icon"><ShieldCheck size={22}/></div>
          <h2>Automation without losing control</h2>
          <ul>
            <li><CheckCircle2 size={15}/>Evidence is attached to research.</li>
            <li><CheckCircle2 size={15}/>LinkedIn-first is the safe default.</li>
            <li><CheckCircle2 size={15}/>Messages wait for your approval.</li>
            <li><CheckCircle2 size={15}/>Replies stop follow-ups automatically.</li>
            <li><CheckCircle2 size={15}/>The cockpit handles safe work within your budgets.</li>
          </ul>
        </div>
      </section>

      <section className="welcome-section">
        <div className="welcome-section-head"><span>01</span><div><h2>Your first automated pipeline</h2><p>One start button coordinates the core agents in order. You do not need to open each agent manually.</p></div></div>
        <div className="agent-flow">
          {agents.map((agent, index) => <div className="agent-flow-card" key={agent.name}><span>{index + 1}</span><Bot size={18}/><strong>{agent.name}</strong><p>{agent.job}</p></div>)}
        </div>
      </section>

      <section className="welcome-grid">
        <article className="card welcome-detail"><span className="welcome-detail-icon auto"><Bot size={19}/></span><h3>GridFlow handles</h3><p>Research orchestration, scoring, contact discovery, first drafts, follow-up timing, reply classification, meeting preparation, proposal preparation and safe internal automation.</p></article>
        <article className="card welcome-detail"><span className="welcome-detail-icon human"><Hand size={19}/></span><h3>You decide</h3><p>Which markets to pursue, which companies are worth contacting, whether a message is right, when a deal becomes real and what proposal leaves the business.</p></article>
      </section>
    </Shell>
  );
}
