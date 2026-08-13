"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { RunAgentButton } from "../../components/run-agent-button";
import { StatusBadge } from "../../components/status-badge";
import { EmptyState } from "../../components/empty-state";
import { formatLabel } from "../../lib/format";

export interface CompanyListItem {
  id: string;
  companyName: string;
  country: string | null;
  website: string;
  industries: string | null;
  companySize: string | null;
  commercialScore: number | null;
  priority: string | null;
  currentStage: string;
  researchStatus: string;
  contactDiscoveryStatus: string;
  contactsCount: number;
  outreachCount: number;
  opportunityValueMinor: number;
  nextFollowUpAt: string | null;
}
const money = (minor: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(minor / 100);
export function CompaniesTable({
  companies,
}: {
  companies: CompanyListItem[];
}) {
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("ALL");
  const [stage, setStage] = useState("ALL");
  const filtered = useMemo(
    () =>
      companies.filter((c) => {
        const term = q.toLowerCase();
        return (
          (!term ||
            [c.companyName, c.country, c.industries, c.companySize].some((v) =>
              v?.toLowerCase().includes(term),
            )) &&
          (priority === "ALL" || c.priority === priority) &&
          (stage === "ALL" || c.currentStage === stage)
        );
      }),
    [companies, q, priority, stage],
  );
  return (
    <section className="card flush">
      <div className="toolbar" style={{ padding: "16px 16px 0" }}>
        <div className="toolbar-group">
          <div className="search-input">
            <Search size={14} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search companies, markets or industries"
            />
          </div>
          <select
            className="filter-select"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="ALL">All priorities</option>
            {["HIGH", "MEDIUM", "LOW"].map((value) => (
              <option value={value} key={value}>
                {formatLabel(value)}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="ALL">All stages</option>
            {[
              "DISCOVERED",
              "QUALIFIED",
              "OUTREACH",
              "CONVERSATION",
              "OPPORTUNITY",
              "WON",
              "LOST",
              "PAUSED",
            ].map((value) => (
              <option value={value} key={value}>
                {formatLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <span className="badge neutral">{filtered.length} shown</span>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No matching companies"
          copy="Change the filters or use a Discovery Brief to add new sponsor prospects."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Fit</th>
                <th>Stage</th>
                <th>Research</th>
                <th>Contacts</th>
                <th>Pipeline</th>
                <th>Next action</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((company) => {
                const sageReady = ["UNRESEARCHED", "NEED_REVIEW"].includes(
                  company.researchStatus,
                );
                const relayReady =
                  company.researchStatus === "RESEARCHED" &&
                  ["HIGH", "MEDIUM"].includes(company.priority ?? "") &&
                  company.contactDiscoveryStatus !== "SEARCHING";
                return (
                  <tr key={company.id}>
                    <td>
                      <Link
                        className="table-link"
                        href={`/companies/${company.id}`}
                      >
                        <div className="table-primary">
                          {company.companyName}
                        </div>
                        <div className="table-sub">
                          {[company.country, company.industries]
                            .filter(Boolean)
                            .join(" · ") || company.website}
                        </div>
                      </Link>
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 7,
                          alignItems: "center",
                        }}
                      >
                        {company.commercialScore !== null ? (
                          <span className="score-pill">
                            {company.commercialScore}
                          </span>
                        ) : (
                          <span className="score-pill">—</span>
                        )}
                        <StatusBadge value={company.priority} compact />
                      </div>
                    </td>
                    <td>
                      <StatusBadge value={company.currentStage} />
                    </td>
                    <td>
                      <StatusBadge value={company.researchStatus} />
                      <div className="table-sub">
                        {formatLabel(company.contactDiscoveryStatus)}
                      </div>
                    </td>
                    <td>
                      <strong>{company.contactsCount}</strong>
                      <div className="table-sub">
                        {company.outreachCount} outreach records
                      </div>
                    </td>
                    <td>
                      {company.opportunityValueMinor
                        ? money(company.opportunityValueMinor)
                        : "—"}
                    </td>
                    <td>
                      {sageReady ? (
                        <RunAgentButton
                          agentName="SAGE"
                          companyId={company.id}
                          label="Run Sage"
                        />
                      ) : relayReady ? (
                        <RunAgentButton
                          agentName="RELAY"
                          companyId={company.id}
                          label="Run Relay"
                        />
                      ) : (
                        <span className="table-sub">Open workspace</span>
                      )}
                    </td>
                    <td>
                      <Link
                        className="icon-button"
                        href={`/companies/${company.id}`}
                        aria-label={`Open ${company.companyName}`}
                      >
                        <ArrowUpRight size={14} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
