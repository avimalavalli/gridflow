import { redirect } from "next/navigation";
import { apiGet, ApiError } from "../lib/server-api";

export const dynamic = "force-dynamic";

export default async function Home() {
  let onboardingStatus: string | undefined;
  let welcomeCompleted = false;

  try {
    await apiGet("/auth/me");
    const [data, experience] = await Promise.all([
      apiGet<{ profile: { onboardingStatus: string } | null }>("/onboarding"),
      apiGet<{ progress: { welcomeCompletedAt: string | null } }>("/experience"),
    ]);
    onboardingStatus = data.profile?.onboardingStatus;
    welcomeCompleted = Boolean(experience.progress.welcomeCompletedAt);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    redirect("/login?error=unavailable");
  }

  if (!welcomeCompleted) redirect("/welcome");
  redirect(onboardingStatus === "COMPLETED" ? "/dashboard" : "/onboarding");
}
