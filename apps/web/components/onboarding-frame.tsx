import Image from "next/image";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import gridFlowLogo from "./assets/gridflow-logo.png";

export function OnboardingFrame({ children, step, total, status = "Private workspace setup" }: { children: ReactNode; step: number; total: number; status?: string }) {
  const progress = Math.max(0, Math.min(100, Math.round((step / total) * 100)));
  return (
    <main className="first-run-shell" id="main-content" tabIndex={-1}>
      <header className="first-run-header">
        <Image className="first-run-logo" src={gridFlowLogo} alt="GridFlow" priority />
        <div className="first-run-status"><ShieldCheck size={14}/><span>{status}</span></div>
      </header>
      <div
        className="first-run-progress"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${progress}% complete`}
      ><span style={{ width: `${progress}%` }}/></div>
      {children}
    </main>
  );
}
