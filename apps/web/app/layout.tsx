import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import "./product-finish.css";
import "./public-finish.css";
import { ExperienceGate } from "../components/experience-gate";

export const metadata: Metadata = {
  title: "GridFlow",
  description: "Sponsorship Commercial Operating System for athletes",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to main content</a><ExperienceGate>{children}</ExperienceGate></body></html>;
}
