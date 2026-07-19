"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  recommendDiscoveryBriefs,
  type AthleteProfileInput,
  type DiscoveryBriefRecommendation,
} from "@gridflow/domain";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";

const split = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

type ApprovalMode = "EVERY_MESSAGE" | "INITIAL_ONLY" | "HIGH_VALUE_ONLY" | "NONE";

interface OnboardingForm extends AthleteProfileInput {
  currentSeries: string;
  currentTeam: string;
  futureGoals: string;
  personalStory: string;
  audienceCountries: string[];
  tone: string;
  currency: string;
  approvalMode: ApprovalMode;
  dailyEmailLimit: number;
  timezone: string;
}

const initialProfile: OnboardingForm = {
  name: "",
  sport: "",
  nationality: "",
  residenceCountry: "",
  competitionCountries: [],
  targetCountries: [],
  targetSeries: "",
  achievements: "",
  sponsorshipTargetMin: 10000,
  sponsorshipTargetMax: 150000,
  preferredIndustries: [],
  excludedIndustries: [],
  outreachStrategy: "LINKEDIN_FIRST",
  emailAutomationMode: "APPROVED_AUTOMATIC",
  currentSeries: "",
  currentTeam: "",
  futureGoals: "",
  personalStory: "",
  audienceCountries: [],
  tone: "Confident, human and commercially intelligent",
  currency: "USD",
  approvalMode: "EVERY_MESSAGE",
  dailyEmailLimit: 20,
  timezone: "UTC",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<OnboardingForm>(initialProfile);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [savedRecommendations, setSavedRecommendations] = useState<DiscoveryBriefRecommendation[]>([]);

  const recommendations = useMemo(
    () => (profile.name.trim() ? recommendDiscoveryBriefs(profile) : []),
    [profile],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/backend/onboarding/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const body = (await response.json()) as {
        message?: string | string[];
        recommendations?: DiscoveryBriefRecommendation[];
      };
      if (!response.ok) {
        const errorMessage = Array.isArray(body.message)
          ? body.message.join(" ")
          : body.message ?? `GridFlow returned ${response.status}.`;
        throw new Error(errorMessage);
      }

      setSavedRecommendations(body.recommendations ?? []);
      setStatus("saved");
      setMessage("Your athlete profile and Discovery Briefs are now saved in the GridFlow database.");
      setTimeout(() => router.push("/dashboard"), 700);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "GridFlow could not save the profile.");
    }
  }

  const displayedRecommendations = savedRecommendations.length
    ? savedRecommendations
    : recommendations;

  return (
    <Shell title="Athlete onboarding">
      <PageHead
        eyebrow="Commercial setup"
        title="Teach GridFlow who you are"
        description="Your profile controls where Atlas searches, how Sage scores fit and how Echo communicates."
      />
      <div className="onboarding-layout">
        <form className="card" onSubmit={submit}>
          <div className="section-title">
            <span>01</span>
            <div><h2>Athlete profile</h2><p>Your programme and commercial direction.</p></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Your name</label><input required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="Jordan Taylor" /></div>
            <div className="field"><label>Sport / racing category</label><input required value={profile.sport} onChange={(e) => setProfile({ ...profile, sport: e.target.value })} /></div>
            <div className="field"><label>Nationality</label><input value={profile.nationality ?? ""} onChange={(e) => setProfile({ ...profile, nationality: e.target.value })} placeholder="Your nationality" /></div>
            <div className="field"><label>Country you are based in</label><input required value={profile.residenceCountry} onChange={(e) => setProfile({ ...profile, residenceCountry: e.target.value })} /></div>
            <div className="field"><label>Current series or programme</label><input value={profile.currentSeries} onChange={(e) => setProfile({ ...profile, currentSeries: e.target.value, targetSeries: e.target.value })} placeholder="Your current championship, tour or programme" /></div>
            <div className="field"><label>Current team</label><input value={profile.currentTeam} onChange={(e) => setProfile({ ...profile, currentTeam: e.target.value })} /></div>
            <div className="field full"><label>Countries you compete in</label><input required value={profile.competitionCountries.join(", ")} onChange={(e) => setProfile({ ...profile, competitionCountries: split(e.target.value) })} placeholder="United States, France, Japan…" /></div>
            <div className="field full"><label>Career goals</label><textarea value={profile.futureGoals} onChange={(e) => setProfile({ ...profile, futureGoals: e.target.value })} placeholder="GT3, WEC and Le Mans..." /></div>
            <div className="field full"><label>Achievements</label><textarea value={profile.achievements ?? ""} onChange={(e) => setProfile({ ...profile, achievements: e.target.value })} /></div>
            <div className="field full"><label>Personal story and differentiators</label><textarea value={profile.personalStory} onChange={(e) => setProfile({ ...profile, personalStory: e.target.value })} placeholder="Why should a company remember you?" /></div>
          </div>

          <div className="section-title section-gap">
            <span>02</span>
            <div><h2>Discovery strategy</h2><p>The markets and businesses Atlas should prioritise.</p></div>
          </div>
          <div className="form-grid">
            <div className="field full"><label>Markets you want sponsors from</label><input required value={profile.targetCountries.join(", ")} onChange={(e) => setProfile({ ...profile, targetCountries: split(e.target.value) })} /></div>
            <div className="field full"><label>Main audience countries</label><input value={profile.audienceCountries.join(", ")} onChange={(e) => setProfile({ ...profile, audienceCountries: split(e.target.value) })} placeholder="Your home and audience markets" /></div>
            <div className="field full"><label>Preferred industries</label><input required value={profile.preferredIndustries.join(", ")} onChange={(e) => setProfile({ ...profile, preferredIndustries: split(e.target.value) })} /></div>
            <div className="field full"><label>Industries to exclude</label><input value={profile.excludedIndustries.join(", ")} onChange={(e) => setProfile({ ...profile, excludedIndustries: split(e.target.value) })} placeholder="Gambling, tobacco..." /></div>
            <div className="field"><label>Minimum useful partnership</label><div className="input-prefix"><span>{profile.currency}</span><input type="number" min={0} value={profile.sponsorshipTargetMin ?? 0} onChange={(e) => setProfile({ ...profile, sponsorshipTargetMin: Number(e.target.value) })} /></div></div>
            <div className="field"><label>Maximum target partnership</label><div className="input-prefix"><span>{profile.currency}</span><input type="number" min={0} value={profile.sponsorshipTargetMax ?? 0} onChange={(e) => setProfile({ ...profile, sponsorshipTargetMax: Number(e.target.value) })} /></div></div>
          </div>

          <div className="section-title section-gap">
            <span>03</span>
            <div><h2>Outreach controls</h2><p>You choose the sequence and automation level.</p></div>
          </div>
          <div className="form-grid">
            <div className="field"><label>Outreach order</label><select value={profile.outreachStrategy} onChange={(e) => setProfile({ ...profile, outreachStrategy: e.target.value as AthleteProfileInput["outreachStrategy"] })}><option value="LINKEDIN_FIRST">LinkedIn first</option><option value="EMAIL_FIRST">Email first</option><option value="PARALLEL">LinkedIn and email together</option><option value="MANUAL">Manual decision</option><option value="CUSTOM">Custom sequence</option></select></div>
            <div className="field"><label>Email automation</label><select value={profile.emailAutomationMode} onChange={(e) => setProfile({ ...profile, emailAutomationMode: e.target.value as AthleteProfileInput["emailAutomationMode"] })}><option value="MANUAL">Manual</option><option value="DRAFT_ONLY">Draft only</option><option value="APPROVED_AUTOMATIC">Approved automatic</option><option value="FULL_AUTOMATION">Full automation</option></select></div>
            <div className="field"><label>Approval policy</label><select value={profile.approvalMode} onChange={(e) => setProfile({ ...profile, approvalMode: e.target.value as ApprovalMode })}><option value="EVERY_MESSAGE">Approve every message</option><option value="INITIAL_ONLY">Approve initial message only</option><option value="HIGH_VALUE_ONLY">Approve high-value targets</option><option value="NONE">No per-message approval</option></select></div>
            <div className="field"><label>Daily email cap</label><input type="number" min={0} value={profile.dailyEmailLimit} onChange={(e) => setProfile({ ...profile, dailyEmailLimit: Number(e.target.value) })} /><small>0 means the user has not set a GridFlow cap.</small></div>
            <div className="field"><label>Timezone</label><input value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} /></div>
            <div className="field"><label>Outreach tone</label><input value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })} /></div>
            <div className="field full action-row"><button disabled={status === "saving"} className="button button-primary button-large" type="submit">{status === "saving" ? "Saving GridFlow profile..." : "Save profile and build my strategy"}</button></div>
            {message ? <div className={`field full notice ${status === "error" ? "notice-error" : "notice-success"}`}>{message}</div> : null}
          </div>
        </form>

        <aside className="card recommendation-panel">
          <div className="card-head"><div><div className="eyebrow">Atlas setup</div><h2>Recommended Discovery Briefs</h2></div><span className="badge blue">Profile-based</span></div>
          <p className="panel-intro">These are generated from your home market, competition programme, target countries and industries. You can activate or edit them after saving.</p>
          {displayedRecommendations.length ? <div className="queue">{displayedRecommendations.map((brief, index) => <div className="brief-preview" key={`${brief.briefName}-${index}`}><div className="brief-number">{String(index + 1).padStart(2, "0")}</div><div><div className="queue-title">{brief.briefName}</div><div className="queue-copy">{brief.rationale}</div><div className="brief-meta"><span>{brief.region}</span><span>{brief.companiesPerRun} companies/run</span></div></div></div>)}</div> : <div className="empty">Enter your name and markets to generate athlete-specific briefs.</div>}
        </aside>
      </div>
    </Shell>
  );
}
