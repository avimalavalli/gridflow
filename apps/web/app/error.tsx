"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("GridFlow route error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="route-error" role="alert">
      <span className="route-error-icon"><AlertTriangle size={24} /></span>
      <div>
        <div className="eyebrow">Workspace error</div>
        <h2>This GridFlow screen could not load</h2>
        <p>The failure has been isolated to this page. Retry first; your commercial records have not been deleted.</p>
        {error.digest ? <small>Reference: {error.digest}</small> : null}
        <div className="channel-actions section-gap">
          <button className="button button-primary" type="button" onClick={reset}><RotateCcw size={14} /> Retry page</button>
          <Link className="button button-secondary" href="/dashboard">Command Centre</Link>
        </div>
      </div>
    </div>
  );
}
