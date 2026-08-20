"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, Fingerprint, Hand, Radar, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { OnboardingFrame } from "../../components/onboarding-frame";

type Slide = {
  eyebrow: string;
  title: string;
  copy: string;
  icon: LucideIcon;
  points: readonly string[];
  visual: "system" | "agents" | "control" | "setup";
};

const slides: readonly Slide[] = [
  {
    eyebrow: "GridFlow // system introduction",
    title: "Your commercial operation, connected.",
    copy: "GridFlow turns scattered sponsor research, contacts, conversations and agreements into one controlled workflow built around your racing programme.",
    icon: Sparkles,
    points: ["One record from first research to renewal", "Next actions stay visible", "Your evidence and history remain connected"],
    visual: "system",
  },
  {
    eyebrow: "Intelligence layer",
    title: "A coordinated team works behind the interface.",
    copy: "Atlas discovers. Sage verifies. Relay identifies decision-makers. Echo prepares outreach. Later tools help with replies, meetings, proposals, contracts and delivery.",
    icon: Bot,
    points: ["Tools run in the correct order", "Unknown facts remain unknown", "Every useful output returns to the workspace"],
    visual: "agents",
  },
  {
    eyebrow: "Human authority",
    title: "Automation prepares. You decide.",
    copy: "GridFlow is designed to remove repetitive coordination without impersonating you or making commercial commitments on your behalf.",
    icon: Hand,
    points: ["LinkedIn actions stay user-performed", "Outbound drafts wait for review", "Pricing, meetings, contracts and payments stay human-controlled"],
    visual: "control",
  },
  {
    eyebrow: "Evidence standard",
    title: "Useful answers, without invented certainty.",
    copy: "Company and contact work is grounded in records and sources. Confidence, verification and missing information are visible so you can act with judgement.",
    icon: ShieldCheck,
    points: ["Research provenance is retained", "Contact details are labelled by verification", "QuickFind answers only from your workspace"],
    visual: "system",
  },
  {
    eyebrow: "Personal calibration",
    title: "Now GridFlow gets to know your programme.",
    copy: "The next guided sequence builds your athlete profile, creates or strengthens your LinkedIn presence, sets commercial targets and confirms your operating controls.",
    icon: Fingerprint,
    points: ["Progress saves automatically", "Every setup choice can be refined later", "You enter the workspace with a usable starting strategy"],
    visual: "setup",
  },
];

const agents = ["ATLAS", "SAGE", "RELAY", "ECHO"] as const;

export default function WelcomePage() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
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
      if (!response.ok) throw new Error("Your introduction progress could not be saved.");
      router.push(profileReady ? "/guide" : "/onboarding");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GridFlow could not continue.");
      setSaving(false);
    }
  }

  const current = slides[slide];
  const Icon = current.icon;

  return (
    <OnboardingFrame step={slide + 1} total={slides.length} status={`System introduction · ${slide + 1} of ${slides.length}`}>
      <section className="intro-stage">
        <div className="intro-copy">
          <span className="intro-icon"><Icon size={23}/></span>
          <div className="eyebrow">{current.eyebrow}</div>
          <h1>{slide === 0 ? `Welcome, ${name}. ` : ""}{current.title}</h1>
          <p className="intro-lead">{current.copy}</p>
          <div className="intro-points">{current.points.map((point) => <div key={point}><CheckCircle2 size={16}/><span>{point}</span></div>)}</div>
          {error ? <div className="notice notice-error" role="alert">{error}</div> : null}
        </div>

        <div className={`intro-visual intro-visual-${current.visual}`} aria-hidden="true">
          <div className="system-orbit orbit-one"/><div className="system-orbit orbit-two"/>
          <div className="system-core"><span>GF</span><small>COMMERCIAL OS</small></div>
          {current.visual === "agents" ? <div className="intro-agent-grid">{agents.map((agent, index) => <div key={agent}><span>{String(index + 1).padStart(2, "0")}</span><strong>{agent}</strong></div>)}</div> : null}
          {current.visual === "control" ? <div className="control-signal"><ShieldCheck size={24}/><strong>HUMAN APPROVAL</strong><span>ACTIVE</span></div> : null}
          {current.visual === "setup" ? <div className="setup-signal"><Fingerprint size={25}/><div><strong>PERSONAL CALIBRATION</strong><span>READY TO BEGIN</span></div></div> : null}
          {current.visual === "system" ? <><div className="system-node node-a"><Radar size={16}/></div><div className="system-node node-b"><Workflow size={16}/></div><div className="system-node node-c"><ShieldCheck size={16}/></div></> : null}
        </div>
      </section>

      <footer className="first-run-actions">
        <div className="first-run-dots" aria-label="Introduction slides">{slides.map((item, index) => <button key={item.title} type="button" aria-label={`Open slide ${index + 1}`} aria-current={index === slide ? "step" : undefined} onClick={() => setSlide(index)}/>)}</div>
        <div>
          {slide === 0 ? <span className="first-run-caption">Five short slides · about two minutes</span> : <button className="button button-ghost" type="button" onClick={() => setSlide((value) => value - 1)}><ArrowLeft size={15}/>Back</button>}
          {slide < slides.length - 1 ? <button className="button button-primary button-large" type="button" onClick={() => setSlide((value) => value + 1)}>Continue<ArrowRight size={15}/></button> : <button className="button button-primary button-large" type="button" disabled={saving} onClick={() => void begin()}>{saving ? "Calibrating workspace…" : "Build my GridFlow"}<ArrowRight size={15}/></button>}
        </div>
      </footer>
    </OnboardingFrame>
  );
}
