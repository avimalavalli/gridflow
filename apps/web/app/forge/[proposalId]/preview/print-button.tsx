"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return <button className="button button-primary" type="button" onClick={() => window.print()}><Printer size={14}/> Print / Save PDF</button>;
}
