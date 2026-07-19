import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GridFlow",
  description: "Sponsorship Commercial Operating System for athletes",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
