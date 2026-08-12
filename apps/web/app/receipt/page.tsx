import type { Metadata } from "next";
import { PublicShell } from "../../components/public-shell";
import { ReceiptClient } from "./receipt-client";
export const metadata:Metadata={title:"Payment receipt | GridFlow",robots:{index:false,follow:false}};
export default function ReceiptPage(){return <PublicShell><section className="public-section receipt-shell"><ReceiptClient/></section></PublicShell>}
