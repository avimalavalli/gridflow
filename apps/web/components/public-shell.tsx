import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <header className="public-nav">
        <Link className="public-brand" href="/" aria-label="GridFlow home">
          <span className="public-brand-mark" aria-hidden="true">GF</span>
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
          <div className="public-footer-title"><span className="public-brand-mark" aria-hidden="true">GF</span><strong>GridFlow</strong></div>
          <span>Sponsorship Commercial Operating System for athletes and teams.</span>
        </div>
        <div className="public-footer-control"><ShieldCheck size={15}/><span>Human-controlled by design</span></div>
        <nav aria-label="Footer navigation"><Link href="/product">Product</Link><Link href="/pricing">Pricing</Link><Link href="/support">Support</Link><Link href="/login">Sign in</Link></nav>
      </footer>
    </div>
  );
}
