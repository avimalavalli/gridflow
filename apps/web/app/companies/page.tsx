import { DataUnavailable } from "../../components/data-unavailable";
import { PageHead } from "../../components/page-head";
import { Shell } from "../../components/shell";
import { apiGet, ApiError } from "../../lib/server-api";
import { RunAgentButton } from "../../components/run-agent-button";

export const dynamic = "force-dynamic";

interface Company {
  id: string;
  companyName: string;
  country: string | null;
  website: string;
  companyDomain: string;
  commercialScore: number | null;
  priority: string | null;
  researchStatus: string;
  contactDiscoveryStatus: string;
}

export default async function CompaniesPage() {
  let companies: Company[] = [];
  let error = "";
  try {
    const response = await apiGet<{ companies: Company[] }>("/companies");
    companies = response.companies;
  } catch (cause) {
    error = cause instanceof ApiError ? cause.message : "Unknown company-data error.";
  }

  return (
    <Shell title="Companies">
      <PageHead title="Sponsor companies" description="Verified prospects, score breakdowns and workflow states stored in GridFlow." />
      {error ? <DataUnavailable message={error} /> : (
        <section className="card">
          {companies.length === 0 ? (
            <div className="empty"><strong>No companies have been imported or discovered yet.</strong><br />Activate a Discovery Brief after the Atlas pipeline is connected.</div>
          ) : (
            <div className="table-wrap"><table><thead><tr><th>Company</th><th>Country</th><th>Score</th><th>Priority</th><th>Research</th><th>Contact search</th><th>Next agent</th></tr></thead><tbody>{companies.map((company) => {
              const sageReady = ["UNRESEARCHED", "NEED_REVIEW"].includes(company.researchStatus);
              const relayReady = company.researchStatus === "RESEARCHED" && ["HIGH", "MEDIUM"].includes(company.priority ?? "") && company.contactDiscoveryStatus !== "SEARCHING";
              return <tr key={company.id}><td><a href={company.website} target="_blank" rel="noreferrer"><strong>{company.companyName}</strong><div className="table-sub">{company.companyDomain}</div></a></td><td>{company.country ?? "Unknown"}</td><td>{company.commercialScore ?? "—"}</td><td>{company.priority ? <span className={`badge ${company.priority === "HIGH" ? "green" : company.priority === "MEDIUM" ? "amber" : ""}`}>{company.priority}</span> : "—"}</td><td>{company.researchStatus.replaceAll("_", " ")}</td><td>{company.contactDiscoveryStatus.replaceAll("_", " ")}</td><td>{sageReady ? <RunAgentButton agentName="SAGE" companyId={company.id} label="Run Sage" /> : relayReady ? <RunAgentButton agentName="RELAY" companyId={company.id} label="Run Relay" /> : <span className="table-sub">Waiting on dependency</span>}</td></tr>;
            })}</tbody></table></div>
          )}
        </section>
      )}
    </Shell>
  );
}
