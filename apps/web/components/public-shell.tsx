import Link from "next/link";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <header className="public-nav">
        <Link className="public-brand" href="/"><span>GRID</span>FLOW</Link>
        <nav aria-label="Public navigation">
          <Link href="/product">Product</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/support">Support</Link>
        </nav>
        <Link className="button button-secondary" href="/login">Sign in</Link>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="public-footer">
        <div><strong>GridFlow</strong><span>Sponsorship Commercial Operating System for athletes and teams.</span></div>
        <nav aria-label="Footer navigation"><Link href="/product">Product</Link><Link href="/pricing">Pricing</Link><Link href="/support">Support</Link><Link href="/login">Sign in</Link></nav>
      </footer>
    </div>
  );
}
