"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, ExternalLink, KeyRound, Linkedin, Save, ShieldCheck, Sparkles, UserRoundCheck } from "lucide-react";
import { recommendDiscoveryBriefs, type AthleteProfileInput } from "@gridflow/domain";
import { OnboardingFrame } from "../../components/onboarding-frame";
import { formatLabel } from "../../lib/format";

const split = (value: string): string[] => value.split(",").map((item) => item.trim()).filter(Boolean);
type ApprovalMode = "EVERY_MESSAGE" | "INITIAL_ONLY" | "HIGH_VALUE_ONLY" | "NONE";
type LinkedinReadiness = "EXISTING" | "CREATED_DURING_SETUP";

interface OnboardingForm extends AthleteProfileInput {
  currentSeries: string; currentTeam: string; currentProgramme: string; futureGoals: string;
  personalStory: string; differentiators: string; audienceSummary: string; audienceCountries: string[];
  tone: string; currency: string; approvalMode: ApprovalMode; dailyEmailLimit: number; timezone: string;
  linkedinReadiness: LinkedinReadiness; linkedinProfileUrl: string; linkedinHeadline: string; linkedinAbout: string;
  linkedinChecklist: string[]; linkedinSetupConfirmed: boolean;
}

const initialProfile: OnboardingForm = {
  name: "", sport: "", nationality: "", residenceCountry: "", competitionCountries: [], targetCountries: [], targetSeries: "",
  achievements: "", sponsorshipTargetMin: 10000, sponsorshipTargetMax: 150000, preferredIndustries: [], excludedIndustries: [],
  outreachStrategy: "LINKEDIN_FIRST", emailAutomationMode: "DRAFT_ONLY", currentSeries: "", currentTeam: "", currentProgramme: "",
  futureGoals: "", personalStory: "", differentiators: "", audienceSummary: "", audienceCountries: [],
  tone: "Confident, human and commercially intelligent", currency: "USD", approvalMode: "EVERY_MESSAGE", dailyEmailLimit: 20, timezone: "UTC",
  linkedinReadiness: "EXISTING", linkedinProfileUrl: "", linkedinHeadline: "", linkedinAbout: "", linkedinChecklist: [], linkedinSetupConfirmed: false,
};

const steps = [
  { title: "Athlete", copy: "Your identity and racing programme" },
  { title: "LinkedIn account", copy: "Create or locate your professional profile" },
  { title: "LinkedIn studio", copy: "Build every sponsor-facing section" },
  { title: "Commercial story", copy: "Your value, proof and audience" },
  { title: "Target strategy", copy: "Markets, industries and deal range" },
  { title: "Controls", copy: "Outreach rules and intelligence provider" },
  { title: "Launch review", copy: "Confirm your workspace calibration" },
] as const;

type LinkedinFoundation = { id: string; title: string; instruction: string; tip: string; href?: string };

const linkedinFoundations: readonly LinkedinFoundation[] = [
  { id: "account", title: "Account and public URL", instruction: "Use your real name, a long unique password and an email you control. Verify the email. Then open your profile, copy the public linkedin.com/in/... URL and paste it into GridFlow.", tip: "GridFlow never asks for or stores your LinkedIn password.", href: "https://www.linkedin.com/signup" },
  { id: "photo", title: "Photo, banner and location", instruction: "Add a clear recent headshot, a clean motorsport banner you have permission to use, and the region where you are commercially active. Keep your face recognisable at small size.", tip: "Avoid sponsor logos unless you have permission and the partnership is current." },
  { id: "headline", title: "Sponsor-ready headline", instruction: "Lead with what you do, the championship or ambition, and the commercial themes you can credibly support. Do not write only 'Racing Driver'.", tip: "Use the live headline builder in this step." },
  { id: "about", title: "About section", instruction: "Write in first person. Cover your programme, evidence-backed progress, audience or access, the kind of collaboration you value, and a simple invitation to connect.", tip: "Use short paragraphs so it reads well on mobile." },
  { id: "experience", title: "Experience and results", instruction: "Add your current driver role and team or programme as Experience. Include dates, series, responsibilities, verified results and partnership activity. Never exaggerate results.", tip: "Treat racing as professional experience, not a hobby entry." },
  { id: "featured", title: "Featured proof", instruction: "Add your best race reel, media kit, official result, press coverage, website or sponsor case study. Open every link in a private tab to confirm it works.", tip: "Three excellent proof items are stronger than ten weak ones." },
  { id: "skills", title: "Skills and credibility", instruction: "Add relevant skills such as Motorsport, Brand Partnerships, Content Creation, Public Speaking, Engineering Feedback and Performance Driving. Request honest recommendations where appropriate.", tip: "Put the three most commercially useful skills first." },
  { id: "security", title: "Visibility and account security", instruction: "Review public-profile visibility, create a clean custom URL and enable two-factor authentication with an authenticator app where possible. Add a recovery method you control.", tip: "Never share authentication codes with GridFlow or support.", href: "https://www.linkedin.com/mypreferences/d/two-factor-authentication" },
] as const;

function suggestedHeadline(profile: OnboardingForm): string {
  const role = [profile.currentSeries || profile.sport || "Racing Driver", profile.currentTeam].filter(Boolean).join(" · ");
  return `${profile.name || "Racing Driver"} | ${role} | Performance, partnerships and brand collaboration`;
}

function suggestedAbout(profile: OnboardingForm): string {
  const programme = profile.currentProgramme.trim() || `I compete in ${profile.currentSeries || profile.sport || "motorsport"}`;
  const proof = profile.achievements?.trim() || "I am building my programme through disciplined preparation, measurable progress and trusted relationships";
  const ambition = profile.futureGoals.trim() || "My focus is sustainable progression on and off the track";
  return `${programme}.\n\n${proof}. ${ambition}.\n\nI work best with partners whose goals genuinely align with my programme, audience and values. I am interested in collaborations where we can create credible stories, useful content and measurable commercial value.\n\nConnect with me to discuss motorsport, performance and a partnership built around shared objectives.`;
}

function linkedinFromProfile(source: Record<string, unknown> | null | undefined): Partial<OnboardingForm> {
  const linkedin = source?.linkedin;
  if (!linkedin || typeof linkedin !== "object") return {};
  const value = linkedin as Record<string, unknown>;
  return {
    linkedinReadiness: value.readiness === "CREATED_DURING_SETUP" ? "CREATED_DURING_SETUP" : "EXISTING",
    linkedinProfileUrl: typeof value.url === "string" ? value.url : "",
    linkedinHeadline: typeof value.headline === "string" ? value.headline : "",
    linkedinAbout: typeof value.about === "string" ? value.about : "",
    linkedinChecklist: Array.isArray(value.checklist) ? value.checklist.filter((item): item is string => typeof item === "string") : [],
    linkedinSetupConfirmed: Boolean(value.confirmedAt),
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<OnboardingForm>(initialProfile);
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<"headline" | "about" | null>(null);
  const [aiSetup, setAiSetup] = useState<"loading" | "required" | "connected" | "managed" | "error">("loading");
  const [geminiKey, setGeminiKey] = useState("");
  const [acceptedGeminiTerms, setAcceptedGeminiTerms] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/backend/experience", { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? response.json() : null),
      fetch("/backend/onboarding", { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? response.json() : null),
      fetch("/backend/ai-settings", { credentials: "include", cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message ?? "AI setup could not be loaded."); return body; }),
    ]).then(([experience, onboarding, ai]) => {
      if (!active) return;
      const draft = experience?.progress?.onboardingDraft;
      if (draft && typeof draft === "object") setProfile({ ...initialProfile, ...draft });
      else if (onboarding?.profile) {
        const source = onboarding.profile;
        const markets = Array.isArray(onboarding.targetMarkets) ? onboarding.targetMarkets : [];
        setProfile({
          ...initialProfile,
          ...linkedinFromProfile(source.socialProfiles),
          name: source.athleteName ?? "", sport: source.sport ?? "", nationality: source.nationality ?? "",
          residenceCountry: source.countryOfResidence ?? "", currentSeries: source.currentSeries ?? "", targetSeries: source.currentSeries ?? "",
          currentTeam: source.currentTeam ?? "", currentProgramme: source.currentProgramme ?? "", futureGoals: source.futureGoals ?? "",
          achievements: source.achievements ?? "", personalStory: source.personalStory ?? "", differentiators: source.differentiators ?? "",
          sponsorshipTargetMin: source.minimumDealMinor == null ? initialProfile.sponsorshipTargetMin : source.minimumDealMinor / 100,
          sponsorshipTargetMax: source.maximumDealMinor == null ? initialProfile.sponsorshipTargetMax : source.maximumDealMinor / 100,
          currency: source.currency ?? initialProfile.currency, audienceSummary: source.audienceSummary ?? "",
          audienceCountries: Array.isArray(source.audienceGeography) ? source.audienceGeography : [], tone: source.tone ?? initialProfile.tone,
          competitionCountries: markets.filter((market: { type: string }) => market.type === "COMPETITION").map((market: { country: string }) => market.country),
          targetCountries: markets.filter((market: { type: string }) => market.type === "SPONSOR_TARGET").map((market: { country: string }) => market.country),
          preferredIndustries: Array.isArray(onboarding.discoveryPreference?.preferredIndustries) ? onboarding.discoveryPreference.preferredIndustries : [],
          excludedIndustries: Array.isArray(onboarding.discoveryPreference?.excludedIndustries) ? onboarding.discoveryPreference.excludedIndustries : [],
          outreachStrategy: onboarding.policy?.strategy ?? initialProfile.outreachStrategy,
          emailAutomationMode: onboarding.policy?.emailAutomationMode ?? initialProfile.emailAutomationMode,
          approvalMode: onboarding.policy?.approvalMode ?? initialProfile.approvalMode,
          dailyEmailLimit: onboarding.policy?.dailyEmailLimit ?? initialProfile.dailyEmailLimit,
          timezone: onboarding.policy?.timezone ?? initialProfile.timezone,
        });
      }
      setStep(Math.min(Math.max(Number(experience?.progress?.onboardingStep ?? 0), 0), steps.length - 1));
      setAiSetup(ai?.gemini?.connected ? "connected" : ai?.entitlement?.requiresGemini ? "required" : "managed");
      setHydrated(true);
    }).catch(() => { if (active) { setAiSetup("error"); setHydrated(true); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setDraftStatus("saving");
    const timer = window.setTimeout(() => {
      fetch("/backend/experience", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ onboardingStep: step, onboardingDraft: profile }) })
        .then((response) => { if (!response.ok) throw new Error(); setDraftStatus("saved"); })
        .catch(() => setDraftStatus("error"));
    }, 550);
    return () => window.clearTimeout(timer);
  }, [hydrated, profile, step]);

  const recommendations = useMemo(() => profile.name.trim() ? recommendDiscoveryBriefs(profile) : [], [profile]);
  const linkedinProgress = Math.round((profile.linkedinChecklist.length / linkedinFoundations.length) * 100);

  function validateCurrent(): string {
    if (step === 0 && (!profile.name.trim() || !profile.sport.trim() || !profile.residenceCountry.trim() || !profile.competitionCountries.length)) return "Add your name, sport, base country and at least one competition country.";
    if (step === 1 && !/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[a-z0-9_-]+/i.test(profile.linkedinProfileUrl.trim())) return "Create or open your personal LinkedIn profile, then paste its public linkedin.com/in/... URL.";
    if (step === 2 && profile.linkedinChecklist.length < linkedinFoundations.length) return "Review and complete every LinkedIn foundation before continuing.";
    if (step === 2 && (profile.linkedinHeadline.trim().length < 20 || profile.linkedinAbout.trim().length < 80)) return "Finish the sponsor-ready LinkedIn headline and About section.";
    if (step === 4 && (!profile.targetCountries.length || !profile.preferredIndustries.length)) return "Choose at least one target country and one preferred industry.";
    return "";
  }

  function next(): void {
    const issue = validateCurrent();
    if (issue) { setMessage(issue); return; }
    setMessage("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleLinkedin(id: string): void {
    setProfile((value) => ({ ...value, linkedinChecklist: value.linkedinChecklist.includes(id) ? value.linkedinChecklist.filter((item) => item !== id) : [...value.linkedinChecklist, id] }));
  }

  async function copy(value: string, kind: "headline" | "about"): Promise<void> {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1500);
  }

  async function finish(): Promise<void> {
    setStatus("saving"); setMessage("");
    try {
      if (!profile.linkedinSetupConfirmed) throw new Error("Confirm that the LinkedIn profile is accurate and ready before entering GridFlow.");
      if (aiSetup === "loading" || aiSetup === "error") throw new Error("GridFlow could not confirm your AI setup. Refresh the page and try again.");
      if (aiSetup === "required") {
        if (geminiKey.trim().length < 20 || !acceptedGeminiTerms) throw new Error("Connect your Gemini key and accept the free-tier data notice before finishing.");
        const aiResponse = await fetch("/backend/ai-settings/gemini", { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: geminiKey, acceptFreeTierDataTerms: acceptedGeminiTerms }) });
        const aiBody = await aiResponse.json() as { message?: string | string[] };
        if (!aiResponse.ok) throw new Error(Array.isArray(aiBody.message) ? aiBody.message.join(" ") : aiBody.message ?? "GridFlow could not verify the Gemini key.");
        setGeminiKey(""); setAcceptedGeminiTerms(false); setAiSetup("connected");
      }
      const response = await fetch("/backend/onboarding/complete", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(profile) });
      const body = await response.json() as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? `GridFlow returned ${response.status}.`);
      await fetch("/backend/experience", { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ tutorialStep: 0, clearOnboardingDraft: true }) });
      router.push("/guide");
    } catch (cause) { setStatus("error"); setMessage(cause instanceof Error ? cause.message : "GridFlow could not finish setup."); }
  }

  const draftHeadline = suggestedHeadline(profile);
  const draftAbout = suggestedAbout(profile);

  return (
    <OnboardingFrame step={step + 1} total={steps.length} status={`Personal calibration · ${step + 1} of ${steps.length}`}>
      <div className="calibration-head">
        <div><div className="eyebrow">Mandatory first-run calibration</div><h1>Build your GridFlow foundation</h1><p>Complete each section once. Your progress saves automatically and sensitive provider keys are handled separately.</p></div>
        <span className={`draft-status ${draftStatus}`}><Save size={13}/>{draftStatus === "saving" ? "Saving…" : draftStatus === "saved" ? "Progress saved" : draftStatus === "error" ? "Save interrupted" : "Ready"}</span>
      </div>

      <div className="calibration-layout">
        <aside className="calibration-rail" aria-label="Setup steps">{steps.map((item, index) => <button type="button" className={index === step ? "calibration-step active" : index < step ? "calibration-step complete" : "calibration-step"} key={item.title} onClick={() => { if (index <= step) setStep(index); }}><span>{index < step ? <Check size={13}/> : index + 1}</span><div><strong>{item.title}</strong><small>{item.copy}</small></div></button>)}</aside>

        <section className="calibration-card">
          <div className="calibration-card-head"><span>{String(step + 1).padStart(2, "0")}</span><div><div className="eyebrow">{steps[step].title}</div><h2>{steps[step].copy}</h2></div></div>

          {step === 0 ? <div className="form-grid">
            <div className="field"><label htmlFor="athlete-name">Your name</label><input id="athlete-name" required value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Jordan Taylor"/></div>
            <div className="field"><label htmlFor="athlete-sport">Sport / racing category</label><input id="athlete-sport" required value={profile.sport} onChange={(event) => setProfile({ ...profile, sport: event.target.value })} placeholder="GT racing"/></div>
            <div className="field"><label htmlFor="athlete-nationality">Nationality</label><input id="athlete-nationality" value={profile.nationality ?? ""} onChange={(event) => setProfile({ ...profile, nationality: event.target.value })}/></div>
            <div className="field"><label htmlFor="athlete-residence">Country you are based in</label><input id="athlete-residence" required value={profile.residenceCountry} onChange={(event) => setProfile({ ...profile, residenceCountry: event.target.value })}/></div>
            <div className="field"><label htmlFor="athlete-series">Current series</label><input id="athlete-series" value={profile.currentSeries} onChange={(event) => setProfile({ ...profile, currentSeries: event.target.value, targetSeries: event.target.value })}/></div>
            <div className="field"><label htmlFor="athlete-team">Current team</label><input id="athlete-team" value={profile.currentTeam} onChange={(event) => setProfile({ ...profile, currentTeam: event.target.value })}/></div>
            <div className="field full"><label htmlFor="athlete-programme">Current programme</label><textarea id="athlete-programme" value={profile.currentProgramme} onChange={(event) => setProfile({ ...profile, currentProgramme: event.target.value })} placeholder="Season, events, test programme and immediate priorities"/></div>
            <div className="field full"><label htmlFor="athlete-competition-countries">Countries you compete in</label><input id="athlete-competition-countries" required value={profile.competitionCountries.join(", ")} onChange={(event) => setProfile({ ...profile, competitionCountries: split(event.target.value) })} placeholder="United Kingdom, France, Germany"/><small>Separate countries with commas.</small></div>
          </div> : null}

          {step === 1 ? <div className="linkedin-account-stage">
            <div className="linkedin-choice-grid">
              <button type="button" className={profile.linkedinReadiness === "EXISTING" ? "linkedin-choice active" : "linkedin-choice"} onClick={() => setProfile({ ...profile, linkedinReadiness: "EXISTING" })}><UserRoundCheck size={20}/><strong>I already have LinkedIn</strong><span>Find the public URL, audit the profile and improve it in the next step.</span></button>
              <button type="button" className={profile.linkedinReadiness === "CREATED_DURING_SETUP" ? "linkedin-choice active" : "linkedin-choice"} onClick={() => setProfile({ ...profile, linkedinReadiness: "CREATED_DURING_SETUP" })}><Linkedin size={20}/><strong>I need to create it</strong><span>Open LinkedIn, create the account safely, then return here. GridFlow never handles your login.</span></button>
            </div>
            {profile.linkedinReadiness === "CREATED_DURING_SETUP" ? <div className="linkedin-instruction">
              <div><span>01</span><p>Open the official LinkedIn sign-up page. Enter your real first and last name, an email you control and a unique password.</p></div>
              <div><span>02</span><p>Complete LinkedIn’s email or phone verification. Do not paste any password or verification code into GridFlow.</p></div>
              <div><span>03</span><p>Choose a professional location and role. You can use “Racing Driver” as the role and add your current team or programme where accurate.</p></div>
              <a className="button button-primary" href="https://www.linkedin.com/signup" target="_blank" rel="noreferrer">Open official LinkedIn sign-up<ExternalLink size={14}/></a>
            </div> : <div className="linkedin-instruction compact"><div><span>01</span><p>On LinkedIn choose <strong>Me → View Profile</strong>. On desktop, find <strong>Public profile &amp; URL</strong>. On mobile, open <strong>Contact info</strong>.</p></div><div><span>02</span><p>Copy the address beginning with <strong>linkedin.com/in/</strong> and paste it below.</p></div></div>}
            <div className="field"><label htmlFor="linkedin-profile-url">Your public LinkedIn profile URL</label><input id="linkedin-profile-url" type="url" value={profile.linkedinProfileUrl} onChange={(event) => setProfile({ ...profile, linkedinProfileUrl: event.target.value })} placeholder="https://www.linkedin.com/in/your-name"/><small>This is a public profile link, never a password or private token.</small></div>
          </div> : null}

          {step === 2 ? <div className="linkedin-studio">
            <div className="linkedin-studio-banner"><div><Linkedin size={22}/><span><strong>LinkedIn build studio</strong><small>{profile.linkedinChecklist.length} of {linkedinFoundations.length} foundations confirmed</small></span></div><strong>{linkedinProgress}%</strong></div>
            <div className="linkedin-template-grid">
              <div className="field"><div className="field-heading"><label htmlFor="linkedin-headline">Sponsor-ready headline</label><button type="button" onClick={() => setProfile({ ...profile, linkedinHeadline: draftHeadline })}><Sparkles size={13}/>Use tailored draft</button></div><textarea id="linkedin-headline" className="linkedin-headline-input" maxLength={220} value={profile.linkedinHeadline} onChange={(event) => setProfile({ ...profile, linkedinHeadline: event.target.value })} placeholder={draftHeadline}/><small>{profile.linkedinHeadline.length}/220 characters · Keep every claim accurate.</small><button className="inline-copy" type="button" onClick={() => void copy(profile.linkedinHeadline || draftHeadline, "headline")}><Copy size={13}/>{copied === "headline" ? "Copied" : "Copy for LinkedIn"}</button></div>
              <div className="field"><div className="field-heading"><label htmlFor="linkedin-about">About section</label><button type="button" onClick={() => setProfile({ ...profile, linkedinAbout: draftAbout })}><Sparkles size={13}/>Use tailored draft</button></div><textarea id="linkedin-about" className="linkedin-about-input" value={profile.linkedinAbout} onChange={(event) => setProfile({ ...profile, linkedinAbout: event.target.value })} placeholder={draftAbout}/><small>First person, evidence-led and easy to scan. Edit the draft until it sounds like you.</small><button className="inline-copy" type="button" onClick={() => void copy(profile.linkedinAbout || draftAbout, "about")}><Copy size={13}/>{copied === "about" ? "Copied" : "Copy for LinkedIn"}</button></div>
            </div>
            <div className="linkedin-checklist">{linkedinFoundations.map((item, index) => {
              const complete = profile.linkedinChecklist.includes(item.id);
              return <article className={complete ? "linkedin-foundation complete" : "linkedin-foundation"} key={item.id}><button type="button" onClick={() => toggleLinkedin(item.id)} aria-pressed={complete}><span>{complete ? <Check size={14}/> : String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{item.instruction}</p><small>{item.tip}</small></div></button>{item.href ? <a href={item.href} target="_blank" rel="noreferrer" aria-label={`Open ${item.title} on LinkedIn`}><ExternalLink size={14}/></a> : null}</article>;
            })}</div>
          </div> : null}

          {step === 3 ? <div className="form-grid">
            <div className="field full"><label htmlFor="career-goals">Career goals</label><textarea id="career-goals" value={profile.futureGoals} onChange={(event) => setProfile({ ...profile, futureGoals: event.target.value })} placeholder="Where are you going over the next two to three years?"/></div>
            <div className="field full"><label htmlFor="athlete-achievements">Achievements</label><textarea id="athlete-achievements" value={profile.achievements ?? ""} onChange={(event) => setProfile({ ...profile, achievements: event.target.value })} placeholder="Results, milestones, awards and credible proof"/></div>
            <div className="field full"><label htmlFor="personal-story">Your story</label><textarea id="personal-story" value={profile.personalStory} onChange={(event) => setProfile({ ...profile, personalStory: event.target.value })} placeholder="What shaped your journey and makes it commercially memorable?"/></div>
            <div className="field full"><label htmlFor="commercial-differentiators">Commercial differentiators</label><textarea id="commercial-differentiators" value={profile.differentiators} onChange={(event) => setProfile({ ...profile, differentiators: event.target.value })} placeholder="Audience, access, geography, content, engineering insight, community…"/></div>
            <div className="field full"><label htmlFor="audience-summary">Audience summary</label><textarea id="audience-summary" value={profile.audienceSummary} onChange={(event) => setProfile({ ...profile, audienceSummary: event.target.value })} placeholder="Who follows you, where they are and how you engage them"/></div>
            <div className="field full"><label htmlFor="voice-tone">Voice and tone</label><input id="voice-tone" value={profile.tone} onChange={(event) => setProfile({ ...profile, tone: event.target.value })}/></div>
          </div> : null}

          {step === 4 ? <div className="form-grid">
            <div className="field full"><label htmlFor="target-countries">Target sponsor countries</label><input id="target-countries" required value={profile.targetCountries.join(", ")} onChange={(event) => setProfile({ ...profile, targetCountries: split(event.target.value) })}/></div>
            <div className="field full"><label htmlFor="audience-countries">Main audience countries</label><input id="audience-countries" value={profile.audienceCountries.join(", ")} onChange={(event) => setProfile({ ...profile, audienceCountries: split(event.target.value) })}/></div>
            <div className="field full"><label htmlFor="preferred-industries">Preferred industries</label><input id="preferred-industries" required value={profile.preferredIndustries.join(", ")} onChange={(event) => setProfile({ ...profile, preferredIndustries: split(event.target.value) })} placeholder="Technology, engineering, finance"/></div>
            <div className="field full"><label htmlFor="excluded-industries">Industries to exclude</label><input id="excluded-industries" value={profile.excludedIndustries.join(", ")} onChange={(event) => setProfile({ ...profile, excludedIndustries: split(event.target.value) })} placeholder="Gambling, tobacco"/></div>
            <div className="field"><label htmlFor="partnership-minimum">Minimum useful partnership</label><div className="input-prefix"><span>{profile.currency}</span><input id="partnership-minimum" type="number" min={0} value={profile.sponsorshipTargetMin ?? 0} onChange={(event) => setProfile({ ...profile, sponsorshipTargetMin: Number(event.target.value) })}/></div></div>
            <div className="field"><label htmlFor="partnership-maximum">Maximum target partnership</label><div className="input-prefix"><span>{profile.currency}</span><input id="partnership-maximum" type="number" min={0} value={profile.sponsorshipTargetMax ?? 0} onChange={(event) => setProfile({ ...profile, sponsorshipTargetMax: Number(event.target.value) })}/></div></div>
            <div className="field"><label htmlFor="commercial-currency">Currency</label><select id="commercial-currency" value={profile.currency} onChange={(event) => setProfile({ ...profile, currency: event.target.value })}><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>INR</option></select></div>
            <aside className="strategy-preview field full"><span><Sparkles size={16}/></span><div><strong>{recommendations.length || "No"} discovery strategies prepared</strong><p>{recommendations[0]?.rationale ?? "Add markets and industries to preview the first Atlas strategy."}</p></div></aside>
          </div> : null}

          {step === 5 ? <div className="stack">
            <div className="safety-default"><CheckCircle2 size={18}/><div><strong>Professional default</strong><p>LinkedIn first, draft-only email and approval for every message. GridFlow prepares the work without impersonating you.</p></div></div>
            <div className="form-grid">
              <div className="field"><label htmlFor="outreach-strategy">Outreach order</label><select id="outreach-strategy" value={profile.outreachStrategy} onChange={(event) => setProfile({ ...profile, outreachStrategy: event.target.value as AthleteProfileInput["outreachStrategy"] })}><option value="LINKEDIN_FIRST">LinkedIn first</option><option value="EMAIL_FIRST">Email first</option><option value="PARALLEL">LinkedIn and email together</option><option value="MANUAL">Manual decision</option></select></div>
              <div className="field"><label htmlFor="email-automation-mode">Email automation</label><select id="email-automation-mode" value={profile.emailAutomationMode} onChange={(event) => setProfile({ ...profile, emailAutomationMode: event.target.value as AthleteProfileInput["emailAutomationMode"] })}><option value="MANUAL">Manual</option><option value="DRAFT_ONLY">Draft only</option><option value="APPROVED_AUTOMATIC">Approved automatic</option><option value="FULL_AUTOMATION">Full automation</option></select></div>
              <div className="field"><label htmlFor="approval-policy">Approval policy</label><select id="approval-policy" value={profile.approvalMode} onChange={(event) => setProfile({ ...profile, approvalMode: event.target.value as ApprovalMode })}><option value="EVERY_MESSAGE">Approve every message</option><option value="INITIAL_ONLY">Approve initial message only</option><option value="HIGH_VALUE_ONLY">Approve high-value targets</option><option value="NONE">No per-message approval</option></select></div>
              <div className="field"><label htmlFor="daily-email-limit">Daily email cap</label><input id="daily-email-limit" type="number" min={0} value={profile.dailyEmailLimit} onChange={(event) => setProfile({ ...profile, dailyEmailLimit: Number(event.target.value) })}/></div>
              <div className="field"><label htmlFor="athlete-timezone">Timezone</label><input id="athlete-timezone" value={profile.timezone} onChange={(event) => setProfile({ ...profile, timezone: event.target.value })} placeholder="Europe/London"/></div>
            </div>
            <div className="ai-review-card"><div><KeyRound size={19}/><div><strong>Intelligence provider</strong><p>Gemini supports non-web drafting. Evidence research remains managed by GridFlow.</p></div></div>
              {aiSetup === "loading" ? <div className="notice">Checking your plan and provider connection…</div> : null}
              {aiSetup === "error" ? <div className="notice notice-error">Provider setup could not be loaded. Refresh before finishing.</div> : null}
              {aiSetup === "managed" ? <div className="notice notice-success"><CheckCircle2 size={15}/>A managed provider is included. No key is required.</div> : null}
              {aiSetup === "connected" ? <div className="notice notice-success"><CheckCircle2 size={15}/>Gemini is connected and encrypted.</div> : null}
              {aiSetup === "required" ? <div className="form-grid"><div className="field full"><a className="button button-secondary" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Create a free Gemini key<ExternalLink size={13}/></a></div><div className="field full"><label htmlFor="gemini-api-key">Gemini API key</label><input id="gemini-api-key" type="password" autoComplete="off" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} placeholder="Paste the key from Google AI Studio"/><small>Verified server-side, encrypted and never displayed again.</small></div><label className="field full checkbox-row"><input type="checkbox" checked={acceptedGeminiTerms} onChange={(event) => setAcceptedGeminiTerms(event.target.checked)}/><span>I understand Google’s free-tier data terms and will not put confidential contracts or payment information into prompts.</span></label></div> : null}
            </div>
          </div> : null}

          {step === 6 ? <div className="launch-review">
            <div className="launch-identity"><span><UserRoundCheck size={22}/></span><div><strong>{profile.name || "Athlete profile"}</strong><p>{profile.currentSeries || profile.sport} · {profile.residenceCountry}</p></div><CheckCircle2 size={18}/></div>
            <div className="review-summary"><div><span>LinkedIn</span><strong>{profile.linkedinProfileUrl.replace(/^https?:\/\/(?:www\.)?/, "") || "Not connected"}</strong></div><div><span>Profile foundations</span><strong>{profile.linkedinChecklist.length} of {linkedinFoundations.length} complete</strong></div><div><span>Target markets</span><strong>{profile.targetCountries.join(", ") || "Not set"}</strong></div><div><span>Outreach control</span><strong>{formatLabel(profile.outreachStrategy)} · {formatLabel(profile.approvalMode)}</strong></div><div><span>Starting strategies</span><strong>{recommendations.length} prepared</strong></div><div><span>AI provider</span><strong>{aiSetup === "managed" ? "Managed" : aiSetup === "connected" ? "Connected" : aiSetup === "required" ? "Ready after key verification" : "Checking"}</strong></div></div>
            <label className="launch-confirm"><input type="checkbox" checked={profile.linkedinSetupConfirmed} onChange={(event) => setProfile({ ...profile, linkedinSetupConfirmed: event.target.checked })}/><span><strong>I confirm this LinkedIn profile is mine, accurate and ready for professional use.</strong><small>GridFlow will use the public URL and approved profile context to guide manual LinkedIn outreach. It will never log in or act as me.</small></span></label>
            <div className="launch-ready"><ShieldCheck size={19}/><div><strong>What happens next</strong><p>Your profile creates editable Discovery Brief recommendations. The guided tutorial then shows the exact path from Atlas research to human-approved outreach.</p></div></div>
          </div> : null}

          {message ? <div className={`notice ${status === "error" ? "notice-error" : "notice-warning"}`} role="alert">{message}</div> : null}
          <div className="wizard-actions"><button className="button button-ghost" type="button" disabled={step === 0 || status === "saving"} onClick={() => setStep((current) => current - 1)}><ArrowLeft size={15}/>Back</button>{step < steps.length - 1 ? <button className="button button-primary button-large" type="button" onClick={next}>Save and continue<ArrowRight size={15}/></button> : <button className="button button-primary button-large" type="button" disabled={status === "saving" || !profile.linkedinSetupConfirmed} onClick={() => void finish()}>{status === "saving" ? "Building your workspace…" : "Enter GridFlow"}<ArrowRight size={15}/></button>}</div>
        </section>
      </div>
    </OnboardingFrame>
  );
}
