"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const publicPaths = ["/", "/product", "/pricing", "/support", "/receipt", "/login", "/signup", "/accept-invitation", "/forgot-password", "/reset-password", "/privacy", "/legal"];

const isPublic = (path: string): boolean => publicPaths.some((entry) => path === entry || path.startsWith(`${entry}/`));

export function ExperienceGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(() => isPublic(pathname) || pathname === "/welcome" || pathname === "/onboarding");

  useEffect(() => {
    if (isPublic(pathname)) { setReady(true); return; }
    let active = true;
    Promise.all([
      fetch("/backend/experience", { credentials: "include", cache: "no-store" }),
      fetch("/backend/onboarding", { credentials: "include", cache: "no-store" }),
    ]).then(async ([experienceResponse, onboardingResponse]) => {
      if (!active) return;
      if (experienceResponse.status === 401 || onboardingResponse.status === 401) { setReady(true); return; }
      if (!experienceResponse.ok || !onboardingResponse.ok) { setReady(true); return; }
      const [experience, onboarding] = await Promise.all([experienceResponse.json(), onboardingResponse.json()]);
      const welcomeComplete = Boolean(experience?.progress?.welcomeCompletedAt);
      const profileComplete = onboarding?.profile?.onboardingStatus === "COMPLETED";
      const destination = !welcomeComplete ? "/welcome" : !profileComplete ? "/onboarding" : null;
      if (destination && pathname !== destination) {
        setReady(false);
        router.replace(destination);
        return;
      }
      setReady(true);
    }).catch(() => setReady(true));
    return () => { active = false; };
  }, [pathname, router]);

  if (!ready) return <main className="experience-loading" aria-live="polite"><span/><strong>Preparing your secure workspace</strong><small>Restoring your setup position…</small></main>;
  return children;
}
