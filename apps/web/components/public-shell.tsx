import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import gridFlowLogo from "./assets/gridflow-logo.png";
import gridFlowMark from "./assets/gridflow-mark.png";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <header className="public-nav">
        <Link className="public-brand" href="/" aria-label="GridFlow home">
          <Image className="public-brand-logo" src={gridFlowMark} alt="" priority/>
          <span className="public-brand-copy"><strong><span>GRID</span>FLOW</strong><small>Commercial OS</small></span>
        </Link>
        <nav aria-label="Public navigation">
          <Link href="/product">Product</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/support">Support</Link>
        </nav>
        <Link className="button button-secondary public-sign-in" href="/login">Sign in<ArrowUpRight size={14}/></Link>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="public-footer">
        <div className="public-footer-brand">
          <div className="public-footer-logo-lockup"><Image src={gridFlowLogo} alt="GridFlow"/></div>
          <span>Sponsorship Commercial Operating System for athletes and teams.</span>
        </div>
        <div className="public-footer-control"><ShieldCheck size={15}/><span>Human-controlled by design</span></div>
        <nav aria-label="Footer navigation"><Link href="/product">Product</Link><Link href="/pricing">Pricing</Link><Link href="/support">Support</Link><Link href="/privacy">Privacy Centre</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/cookies">Cookies</Link><Link href="/login">Sign in</Link></nav>
      </footer>
    </div>
  );
}
