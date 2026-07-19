import { redirect } from "next/navigation";
import { Shell } from "../../components/shell";
import { PageHead } from "../../components/page-head";
import { apiGet, ApiError } from "../../lib/server-api";
import { TeamClient } from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  let team: Parameters<typeof TeamClient>[0]["team"];
  let auth: Parameters<typeof TeamClient>[0]["auth"];
  try {
    [team, auth] = await Promise.all([
      apiGet<Parameters<typeof TeamClient>[0]["team"]>("/team"),
      apiGet<Parameters<typeof TeamClient>[0]["auth"]>("/auth/me"),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    throw error;
  }

  return (
    <Shell title="Team & Access">
      <PageHead
        eyebrow="Multi-athlete foundation"
        title="People and organisations"
        description="Each athlete, team or agency operates in an isolated workspace. Invite collaborators without exposing another athlete's data."
      />
      <TeamClient team={team} auth={auth} />
    </Shell>
  );
}
