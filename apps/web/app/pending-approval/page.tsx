import { LogoutButton } from "../../components/logout-button";
import { StatusBadge } from "../../components/status-badge";
import { formatLabel } from "../../lib/format";
import { apiGet } from "../../lib/server-api";

export const dynamic = "force-dynamic";

interface AccessData {
  user: { name: string; email: string };
  activeOrganisation: {
    organisationName: string;
    organisationAccessStatus: string;
    accessStatusReason: string | null;
    productPlan: string | null;
    entitlementStatus: string | null;
  };
}

export default async function PendingApprovalPage() {
  const data = await apiGet<AccessData>("/auth/me");
  const status = data.activeOrganisation.organisationAccessStatus;
  return (
    <main className="auth-shell" id="main-content" tabIndex={-1}>
      <section className="auth-card auth-card-wide">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Controlled customer access</div>
        <h1>{status === "PENDING_APPROVAL" ? "Registration received" : `Access ${formatLabel(status).toLowerCase()}`}</h1>
        <p>
          {status === "PENDING_APPROVAL"
            ? `${data.activeOrganisation.organisationName} is waiting for GridFlow approval. Research, sponsor data and commercial tools remain locked until approval.`
            : data.activeOrganisation.accessStatusReason ?? "Contact GridFlow support before trying to use this organisation."}
        </p>
        <div className="queue section-gap">
          <div className="queue-item"><div><div className="queue-title">Registered owner</div><div className="queue-copy">{data.user.name} · {data.user.email}</div></div></div>
          <div className="queue-item"><div><div className="queue-title">Product</div><div className="queue-copy">GridFlow {formatLabel(data.activeOrganisation.productPlan, "Core")}</div></div><StatusBadge value={data.activeOrganisation.entitlementStatus ?? status}/></div>
          <div className="queue-item"><div><div className="queue-title">What happens next</div><div className="queue-copy">GridFlow verifies the purchase and identity, then unlocks onboarding. Sign in again after approval.</div></div></div>
        </div>
        <div className="section-gap"><LogoutButton /></div>
      </section>
    </main>
  );
}
