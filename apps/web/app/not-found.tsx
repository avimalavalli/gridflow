import Link from "next/link";
import { MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <span><MapPinOff size={28} /></span>
      <div className="eyebrow">404</div>
      <h1>This GridFlow page does not exist</h1>
      <p>The record may have been removed, or the address may be incomplete.</p>
      <Link className="button button-primary" href="/dashboard">Return to Command Centre</Link>
    </main>
  );
}
