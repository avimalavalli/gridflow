"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, KeyRound, Save } from "lucide-react";
import { recommendDiscoveryBriefs, type AthleteProfileInput, type DiscoveryBriefRecommendation } from "@gridflow/domain";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { formatLabel } from "../../lib/format";

const split = (value: string): string[] => value.split(",").map((item) => item.trim()).filter(Boolean);
type ApprovalMode = "EVERY_MESSAGE" | "INITIAL_ONLY" | "HIGH_VALUE_ONLY" | "NONE";

interface OnboardingForm extends AthleteProfileInput {
  currentSeries: string; currentTeam: string; currentProgramme: string; futureGoals: string;
  personalStory: string; differentiators: string; audienceSummary: string; audienceCountries: string[];
  tone: string; currency: string; approvalMode: ApprovalMode; dailyEmailLimit: number; timezone: string;
}

const initialProfile: OnboardingForm = {
  name: "", sport: "", nationality: "", residenceCountry: "", competitionCountries: [], targetCountries: [], targetSeries: "",
  achievements: "", sponsorshipTargetMin: 10000, sponsorshipTargetMax: 150000, preferredIndustries: [], excludedIndustries: [],
  outreachStrategy: "LINKEDIN_FIRST", emailAutomationMode: "DRAFT_ONLY", currentSeries: "", currentTeam: "", currentProgramme: "",
  futureGoals: "", personalStory: "", differentiators: "", audienceSummary: "", audienceCountries: [],
  tone: "Confident, human and commercially intelligent", currency: "USD", approvalMode: "EVERY_MESSAGE", dailyEmailLimit: 20, timezone: "UTC",
};

const steps = [
  { title: "Profile", copy: "Your programme and competition footprint" },
  { title: "Commercial context", copy: "Your story, audience and differentiators" },
  { title: "Target criteria", copy: "Markets, industries and deal range" },
  { title: "Outreach controls", copy: "Approval, timing and channel rules" },
  { title: "Review", copy: "Confirm the profile and provider connection" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<OnboardingForm>(initialProfile);
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [aiSetup, setAiSetup] = useState<"loading" | "required" | "connected" | "managed" | "error">("loading");
  const [geminiKey, setGeminiKey] = useState("");
  const [acceptedGeminiTerms, setAcceptedGeminiTerms] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/backend/experience", { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? response.json() : null),
      fetch("/backend/onboarding", { credentials: "include", cache: "no-store" }).then(async (response) => response.ok ? response.json() : null),
      fetch("/backend/ai-settings", { credentials: "include", cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "AI setup could not be loaded.");
        return body;
      }),
    ]).then(([experience, onboarding, ai]) => {
      if (!active) return;
      const draft = experience?.progress?.onboardingDraft;
      if (draft && typeof draft === "object") setProfile({ ...initialProfile, ...draft });
      else if (onboarding?.profile) {
        const source = onboarding.profile;
        const markets = Array.isArray(onboarding.targetMarkets) ? onboarding.targetMarkets : [];
        setProfile({
          ...initialProfile,
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

  function validateCurrent(): string {
    if (step === 0 && (!profile.name.trim() || !profile.sport.trim() || !profile.residenceCountry.trim() || !profile.competitionCountries.length)) return "Add your name, sport, base country and at least one competition country.";
    if (step === 2 && (!profile.targetCountries.length || !profile.preferredIndustries.length)) return "Choose at least one target country and one preferred industry.";
    return "";
  }

  function next(): void {
    const issue = validateCurrent();
    if (issue) { setMessage(issue); return; }
    setMessage("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finish(): Promise<void> {
    setStatus("saving"); setMessage("");
    try {
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

  return (
    <Shell title="Guided setup">
      <PageHead eyebrow="Workspace setup" title="Set up your commercial profile" description="Complete the five short sections once. Progress saves automatically across your two approved devices." action={<span className={`draft-status ${draftStatus}`}><Save size={13}/>{draftStatus === "saving" ? "Saving…" : draftStatus === "saved" ? "Progress saved" : draftStatus === "error" ? "Save interrupted" : "Ready"}</span>} />
      <div className="onboarding-wizard">
        <aside className="card onboarding-steps" aria-label="Setup steps">{steps.map((item, index) => <button type="button" className={index === step ? "onboarding-step active" : index < step ? "onboarding-step complete" : "onboarding-step"} key={item.title} onClick={() => { if (index <= step) setStep(index); }}><span>{index < step ? <Check size={13}/> : index + 1}</span><div><strong>{item.title}</strong><small>{item.copy}</small></div></button>)}</aside>
        <section className="card onboarding-stage">
          <div className="onboarding-stage-head"><span>{String(step + 1).padStart(2, "0")}</span><div><div className="eyebrow">{steps[step].title}</div><h2>{steps[step].copy}</h2></div></div>

          {step === 0 ? <div className="form-grid">
            <div className="field"><label>Your name</label><input aria-label="Your name" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Jordan Taylor"/></div>
            <div className="field"><label>Sport / racing category</label><input aria-label="Sport or racing category" required value={profile.sport} onChange={(e) => setProfile({ ...profile, sport: e.target.value })} placeholder="GT racing"/></div>
            <div className="field"><label>Nationality</label><input aria-label="Nationality" value={profile.nationality ?? ""} onChange={(e) => setProfile({ ...profile, nationality: e.target.value })}/></div>
            <div className="field"><label>Country you are based in</label><input aria-label="Country you are based in" required value={profile.residenceCountry} onChange={(e) => setProfile({ ...profile, residenceCountry: e.target.value })}/></div>
            <div className="field"><label>Current series</label><input aria-label="Current series" value={profile.currentSeries} onChange={(e) => setProfile({ ...profile, currentSeries: e.target.value, targetSeries: e.target.value })}/></div>
            <div className="field"><label>Current team</label><input aria-label="Current team" value={profile.currentTeam} onChange={(e) => setProfile({ ...profile, currentTeam: e.target.value })}/></div>
            <div className="field full"><label>Current programme</label><textarea aria-label="Current programme" value={profile.currentProgramme} onChange={(e) => setProfile({ ...profile, currentProgramme: e.target.value })} placeholder="Your current season, events and programme priorities"/></div>
            <div className="field full"><label>Countries you compete in</label><input aria-label="Countries you compete in" required value={profile.competitionCountries.join(", ")} onChange={(e) => setProfile({ ...profile, competitionCountries: split(e.target.value) })} placeholder="United Kingdom, France, Germany"/><small>Separate countries with commas.</small></div>
          </div> : null}

          {step === 1 ? <div className="form-grid">
            <div className="field full"><label>Career goals</label><textarea aria-label="Career goals" value={profile.futureGoals} onChange={(e) => setProfile({ ...profile, futureGoals: e.target.value })} placeholder="Where are you going over the next two to three years?"/></div>
            <div className="field full"><label>Achievements</label><textarea aria-label="Achievements" value={profile.achievements ?? ""} onChange={(e) => setProfile({ ...profile, achievements: e.target.value })} placeholder="Results, milestones, awards and credible proof"/></div>
            <div className="field full"><label>Your story</label><textarea aria-label="Your story" value={profile.personalStory} onChange={(e) => setProfile({ ...profile, personalStory: e.target.value })} placeholder="What shaped your journey and makes it commercially memorable?"/></div>
            <div className="field full"><label>Commercial differentiators</label><textarea aria-label="Commercial differentiators" value={profile.differentiators} onChange={(e) => setProfile({ ...profile, differentiators: e.target.value })} placeholder="Audience, access, geography, content, engineering insight, community…"/></div>
            <div className="field full"><label>Audience summary</label><textarea aria-label="Audience summary" value={profile.audienceSummary} onChange={(e) => setProfile({ ...profile, audienceSummary: e.target.value })}/></div>
            <div className="field full"><label>Voice and tone</label><input aria-label="Voice and tone" value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })}/></div>
          </div> : null}

          {step === 2 ? <div className="form-grid">
            <div className="field full"><label>Target sponsor countries</label><input aria-label="Target sponsor countries" required value={profile.targetCountries.join(", ")} onChange={(e) => setProfile({ ...profile, targetCountries: split(e.target.value) })}/></div>
            <div className="field full"><label>Main audience countries</label><input aria-label="Main audience countries" value={profile.audienceCountries.join(", ")} onChange={(e) => setProfile({ ...profile, audienceCountries: split(e.target.value) })}/></div>
            <div className="field full"><label>Preferred industries</label><input aria-label="Preferred industries" required value={profile.preferredIndustries.join(", ")} onChange={(e) => setProfile({ ...profile, preferredIndustries: split(e.target.value) })} placeholder="Technology, engineering, finance"/></div>
            <div className="field full"><label>Industries to exclude</label><input aria-label="Industries to exclude" value={profile.excludedIndustries.join(", ")} onChange={(e) => setProfile({ ...profile, excludedIndustries: split(e.target.value) })} placeholder="Gambling, tobacco"/></div>
            <div className="field"><label>Minimum useful partnership</label><div className="input-prefix"><span>{profile.currency}</span><input aria-label="Minimum useful partnership" type="number" min={0} value={profile.sponsorshipTargetMin ?? 0} onChange={(e) => setProfile({ ...profile, sponsorshipTargetMin: Number(e.target.value) })}/></div></div>
            <div className="field"><label>Maximum target partnership</label><div className="input-prefix"><span>{profile.currency}</span><input aria-label="Maximum target partnership" type="number" min={0} value={profile.sponsorshipTargetMax ?? 0} onChange={(e) => setProfile({ ...profile, sponsorshipTargetMax: Number(e.target.value) })}/></div></div>
            <div className="field"><label>Currency</label><select aria-label="Currency" value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })}><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>INR</option></select></div>
          </div> : null}

          {step === 3 ? <div className="form-grid">
            <div className="field full safety-default"><CheckCircle2 size={18}/><div><strong>Recommended safe default</strong><p>LinkedIn first, draft-only email and approval for every message. GridFlow prepares the work without sending on your behalf.</p></div></div>
            <div className="field"><label>Outreach order</label><select aria-label="Outreach order" value={profile.outreachStrategy} onChange={(e) => setProfile({ ...profile, outreachStrategy: e.target.value as AthleteProfileInput["outreachStrategy"] })}><option value="LINKEDIN_FIRST">LinkedIn first</option><option value="EMAIL_FIRST">Email first</option><option value="PARALLEL">LinkedIn and email together</option><option value="MANUAL">Manual decision</option></select></div>
            <div className="field"><label>Email automation</label><select aria-label="Email automation" value={profile.emailAutomationMode} onChange={(e) => setProfile({ ...profile, emailAutomationMode: e.target.value as AthleteProfileInput["emailAutomationMode"] })}><option value="MANUAL">Manual</option><option value="DRAFT_ONLY">Draft only</option><option value="APPROVED_AUTOMATIC">Approved automatic</option><option value="FULL_AUTOMATION">Full automation</option></select></div>
            <div className="field"><label>Approval policy</label><select aria-label="Approval policy" value={profile.approvalMode} onChange={(e) => setProfile({ ...profile, approvalMode: e.target.value as ApprovalMode })}><option value="EVERY_MESSAGE">Approve every message</option><option value="INITIAL_ONLY">Approve initial message only</option><option value="HIGH_VALUE_ONLY">Approve high-value targets</option><option value="NONE">No per-message approval</option></select></div>
            <div className="field"><label>Daily email cap</label><input aria-label="Daily email cap" type="number" min={0} value={profile.dailyEmailLimit} onChange={(e) => setProfile({ ...profile, dailyEmailLimit: Number(e.target.value) })}/></div>
            <div className="field"><label>Timezone</label><input aria-label="Timezone" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} placeholder="Europe/London"/></div>
          </div> : null}

          {step === 4 ? <div className="stack">
            <div className="review-summary"><div><span>Programme</span><strong>{profile.name || "Not set"} · {profile.sport || "Sport not set"}</strong></div><div><span>Markets</span><strong>{profile.targetCountries.join(", ") || "Not set"}</strong></div><div><span>Automation</span><strong>{formatLabel(profile.outreachStrategy)} · {formatLabel(profile.approvalMode)}</strong></div><div><span>Strategy briefs</span><strong>{recommendations.length} prepared</strong></div></div>
            <div className="ai-review-card">
              <div><KeyRound size={19}/><div><strong>Intelligence provider</strong><p>Gemini supports non-web drafting. Evidence research remains managed by GridFlow.</p></div></div>
              {aiSetup === "loading" ? <div className="notice">Checking your plan and provider connection…</div> : null}
              {aiSetup === "error" ? <div className="notice notice-error">Provider setup could not be loaded. Refresh before finishing.</div> : null}
              {aiSetup === "managed" ? <div className="notice notice-success"><CheckCircle2 size={15}/>A managed provider is included. No key is required.</div> : null}
              {aiSetup === "connected" ? <div className="notice notice-success"><CheckCircle2 size={15}/>Gemini is connected and encrypted.</div> : null}
              {aiSetup === "required" ? <div className="form-grid"><div className="field full"><a className="button button-secondary" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Create a free Gemini key<ExternalLink size={13}/></a></div><div className="field full"><label>Gemini API key</label><input aria-label="Gemini API key" type="password" autoComplete="off" value={geminiKey} onChange={(event) => setGeminiKey(event.target.value)} placeholder="Paste the key from Google AI Studio"/><small>Verified server-side, encrypted with AES-256-GCM and never displayed again.</small></div><label className="field full checkbox-row"><input type="checkbox" checked={acceptedGeminiTerms} onChange={(event) => setAcceptedGeminiTerms(event.target.checked)}/><span>I understand Google’s free-tier data terms and will not put confidential contracts or payment information into prompts.</span></label></div> : null}
            </div>
          </div> : null}

          {message ? <div className={`notice ${status === "error" ? "notice-error" : "notice-warning"}`}>{message}</div> : null}
          <div className="wizard-actions"><button className="button button-ghost" type="button" disabled={step === 0 || status === "saving"} onClick={() => setStep((current) => current - 1)}><ArrowLeft size={15}/>Back</button>{step < steps.length - 1 ? <button className="button button-primary" type="button" onClick={next}>Save and continue<ArrowRight size={15}/></button> : <button className="button button-primary button-large" type="button" disabled={status === "saving"} onClick={() => void finish()}>{status === "saving" ? "Building your workspace…" : "Finish setup and start tutorial"}<ArrowRight size={15}/></button>}</div>
        </section>

        <aside className="card recommendation-panel"><div className="card-head"><div><div className="eyebrow">Live strategy preview</div><h2>Discovery Briefs</h2></div><span className="badge blue">Automatic</span></div><p className="panel-intro">These strategies update from your markets and industries. You can edit and activate them after setup.</p>{recommendations.length ? <div className="queue">{recommendations.slice(0, 4).map((brief: DiscoveryBriefRecommendation, index) => <div className="brief-preview" key={`${brief.briefName}-${index}`}><div className="brief-number">{String(index + 1).padStart(2, "0")}</div><div><div className="queue-title">{brief.briefName}</div><div className="queue-copy">{brief.rationale}</div></div></div>)}</div> : <div className="empty">Add your name, target markets and industries to preview the strategy GridFlow will build.</div>}</aside>
      </div>
    </Shell>
  );
}
