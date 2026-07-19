"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface TeamData {
  organisation: { id: string; name: string; slug: string; currentUserRole: string };
  members: Array<{ membershipId: string; userId: string; email: string; name: string; role: string; status: string }>;
  invitations: Array<{ id: string; email: string; role: string; status: string; expiresAt: string }>;
}

interface AuthData {
  activeOrganisation: { organisationId: string; organisationName: string; role: string };
  organisations: Array<{ organisationId: string; organisationName: string; organisationType: string; role: string }>;
}

export function TeamClient({ team, auth }: { team: TeamData; auth: AuthData }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("COMMERCIAL_OPERATOR");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const canInvite = ["OWNER", "ADMIN"].includes(team.organisation.currentUserRole);

  async function invite(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setInvitationUrl("");
    try {
      const response = await fetch("/backend/team/invitations", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = (await response.json()) as { invitationUrl?: string; message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message ?? "Invitation failed.");
      setInvitationUrl(body.invitationUrl ?? "");
      setEmail("");
      setMessage("Invitation created. Copy the secure link and send it to the person directly.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GridFlow could not create the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function switchOrganisation(organisationId: string): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/backend/auth/switch-organisation", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organisationId }),
      });
      if (!response.ok) throw new Error("GridFlow could not switch organisations.");
      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Organisation switch failed.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch(`/backend/team/invitations/${id}/revoke`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("GridFlow could not revoke the invitation.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation revoke failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvitation(): Promise<void> {
    await navigator.clipboard.writeText(invitationUrl);
    setMessage("Invitation link copied.");
  }

  return <>
    <div className="grid-2 balanced">
      <section className="card">
        <div className="card-head"><div><div className="eyebrow">Current organisation</div><h2>{team.organisation.name}</h2></div><span className="badge blue">{team.organisation.currentUserRole.replaceAll("_", " ")}</span></div>
        <div className="queue">{team.members.map((member) => <div className="queue-item" key={member.membershipId}><div><div className="queue-title">{member.name}</div><div className="queue-copy">{member.email}</div></div><span className="badge">{member.role.replaceAll("_", " ")}</span></div>)}</div>
      </section>
      <section className="card">
        <div className="card-head"><div><div className="eyebrow">Organisation switcher</div><h2>Your workspaces</h2></div><span className="badge">{auth.organisations.length}</span></div>
        <div className="queue">{auth.organisations.map((organisation) => <div className="queue-item" key={organisation.organisationId}><div><div className="queue-title">{organisation.organisationName}</div><div className="queue-copy">{organisation.organisationType.replaceAll("_", " ")} · {organisation.role.replaceAll("_", " ")}</div></div>{organisation.organisationId === auth.activeOrganisation.organisationId ? <span className="badge green">Active</span> : <button className="mini-button" type="button" disabled={busy} onClick={() => switchOrganisation(organisation.organisationId)}>Switch</button>}</div>)}</div>
      </section>
    </div>

    <section className="card section-gap">
      <div className="card-head"><div><div className="eyebrow">Access control</div><h2>Invite a team member</h2></div><span className="badge blue">Tenant isolated</span></div>
      {canInvite ? <form className="team-invite-form" onSubmit={invite}><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="ADMIN">Administrator</option><option value="COMMERCIAL_OPERATOR">Commercial operator</option><option value="REVIEWER">Reviewer</option><option value="READ_ONLY">Read only</option></select></label><button className="button button-primary" disabled={busy} type="submit">{busy ? "Working…" : "Create invitation"}</button></form> : <div className="empty">Only owners and administrators can invite people.</div>}
      {invitationUrl ? <div className="invitation-link"><input readOnly value={invitationUrl} /><button className="button" type="button" onClick={copyInvitation}>Copy link</button></div> : null}
      {message ? <div className="notice">{message}</div> : null}
      <div className="table-wrap section-gap"><table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>{team.invitations.map((invitation) => <tr key={invitation.id}><td>{invitation.email}</td><td>{invitation.role.replaceAll("_", " ")}</td><td><span className="badge">{invitation.status}</span></td><td>{new Date(invitation.expiresAt).toLocaleDateString()}</td><td>{invitation.status === "PENDING" && canInvite ? <button className="mini-button danger" type="button" disabled={busy} onClick={() => revoke(invitation.id)}>Revoke</button> : null}</td></tr>)}</tbody></table></div>
    </section>
  </>;
}
