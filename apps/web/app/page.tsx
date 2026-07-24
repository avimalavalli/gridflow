import { redirect } from "next/navigation";
import { apiGet, ApiError } from "../lib/server-api";

export const dynamic = "force-dynamic";

export default async function Home() {
  let onboardingStatus: string | undefined;

  try {
    await apiGet("/auth/me");
    const data = await apiGet<{ profile: { onboardingStatus: string } | null }>("/onboarding");
    onboardingStatus = data.profile?.onboardingStatus;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    redirect("/login?error=unavailable");
  }

  redirect(onboardingStatus === "COMPLETED" ? "/dashboard" : "/onboarding");
}
