import { redirect } from "next/navigation";
import { apiGet, ApiError } from "../lib/server-api";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    await apiGet("/auth/me");
    const data = await apiGet<{ profile: { onboardingStatus: string } | null }>("/onboarding");
    redirect(data.profile?.onboardingStatus === "COMPLETED" ? "/dashboard" : "/onboarding");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    redirect("/login?error=unavailable");
  }
}
