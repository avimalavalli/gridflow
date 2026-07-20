import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GridFlow",
  description: "Sponsorship Commercial Operating System for athletes",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to main content</a>{children}</body></html>;
}
