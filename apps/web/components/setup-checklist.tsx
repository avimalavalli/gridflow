"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Circle, X } from "lucide-react";

interface SetupStep { key: string; label: string; description: string; href: string; completed: boolean }
interface Experience { setup: { completed: number; total: number; steps: SetupStep[]; next: SetupStep | null } }

export function SetupChecklist() {
  const [experience, setExperience] = useState<Experience | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    fetch("/backend/experience", { credentials: "include", cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<Experience> : null)
      .then((body) => setExperience(body))
      .catch(() => undefined);
  }, []);

  if (!experience || hidden || experience.setup.completed === experience.setup.total) return null;
  const percent = Math.round((experience.setup.completed / experience.setup.total) * 100);
  return <section className="setup-banner">
    <div className="setup-banner-head"><div><div className="eyebrow">Finish setting up GridFlow</div><h2>{experience.setup.completed} of {experience.setup.total} foundations complete</h2><p>GridFlow checks the real workspace state, so this list updates automatically as you work.</p></div><button className="icon-button" type="button" aria-label="Hide setup checklist" onClick={() => setHidden(true)}><X size={16}/></button></div>
    <div className="setup-banner-progress"><span style={{ width: `${percent}%` }}/></div>
    <div className="setup-banner-steps">{experience.setup.steps.slice(0, 4).map((step) => <Link href={step.href} className={step.completed ? "setup-banner-step complete" : "setup-banner-step"} key={step.key}>{step.completed ? <CheckCircle2 size={16}/> : <Circle size={16}/>}<span>{step.label}</span></Link>)}</div>
    <div className="setup-banner-actions">{experience.setup.next ? <Link className="button button-primary" href={experience.setup.next.href}>{experience.setup.next.label}<ArrowRight size={14}/></Link> : null}<Link className="button button-ghost" href="/guide">View all steps</Link></div>
  </section>;
}
