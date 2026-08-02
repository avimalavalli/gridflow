import { LogoutButton } from "../../components/logout-button";
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
    <main className="auth-shell" id="main-content">
      <section className="auth-card auth-card-wide">
        <div className="auth-brand"><span>GRID</span>FLOW</div>
        <div className="eyebrow">Controlled customer access</div>
        <h1>{status === "PENDING_APPROVAL" ? "Registration received" : `Access ${status.toLowerCase().replaceAll("_", " ")}`}</h1>
        <p>
          {status === "PENDING_APPROVAL"
            ? `${data.activeOrganisation.organisationName} is waiting for GridFlow approval. No agents, sponsor data or commercial tools can run before approval.`
            : data.activeOrganisation.accessStatusReason ?? "Contact GridFlow support before trying to use this organisation."}
        </p>
        <div className="queue section-gap">
          <div className="queue-item"><div><div className="queue-title">Registered owner</div><div className="queue-copy">{data.user.name} · {data.user.email}</div></div></div>
          <div className="queue-item"><div><div className="queue-title">Product</div><div className="queue-copy">GridFlow {data.activeOrganisation.productPlan ?? "Core"}</div></div><span className="badge amber">{data.activeOrganisation.entitlementStatus ?? status}</span></div>
          <div className="queue-item"><div><div className="queue-title">What happens next</div><div className="queue-copy">GridFlow verifies the purchase and identity, then unlocks onboarding. Sign in again after approval.</div></div></div>
        </div>
        <div className="section-gap"><LogoutButton /></div>
      </section>
    </main>
  );
}
