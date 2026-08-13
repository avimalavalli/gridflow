import type { Metadata } from "next";
import { LegalContact, LegalPage } from "../../../components/legal-page";
import { PublicShell } from "../../../components/public-shell";

export const metadata: Metadata = { title: "Cookie Notice | GridFlow", description: "The strictly necessary cookies used by GridFlow." };

export default function CookiePage() {
  return <PublicShell><LegalPage eyebrow="Browser storage" title="Cookie Notice" summary="GridFlow currently uses only the cookies required to keep accounts secure and signed in.">
    <section><h2>No advertising or optional analytics cookies</h2><p>GridFlow does not currently use advertising pixels, cross-site tracking or optional analytics cookies. Because the cookies below are strictly necessary to provide and secure a requested account service, GridFlow does not display a consent banner that would imply they can be disabled while using the signed-in app. If optional cookies are introduced, they will remain off until any required consent is obtained and this notice is updated.</p></section>
    <section><h2>Cookies we use</h2><div className="legal-table"><div><strong>Name</strong><strong>Purpose and duration</strong></div><div><span><code>gridflow_session</code></span><span>Opaque sign-in token. The readable token is not stored in the database; its hash is checked server-side. HttpOnly, Secure in production, SameSite=Lax. Expires after up to 30 days or earlier on logout/revocation.</span></div><div><span><code>gridflow_device</code></span><span>Opaque trusted-device token used for the two-device security boundary. HttpOnly, Secure in production, SameSite=Lax. Expires after up to 365 days or earlier on device revocation.</span></div></div></section>
    <section><h2>Managing cookies</h2><p>You can clear cookies in your browser or sign out/revoke devices in GridFlow Settings. Clearing either cookie signs the device out or requires it to be trusted again. Browser controls that block strictly necessary cookies will prevent signed-in features from working.</p></section>
    <LegalContact/>
  </LegalPage></PublicShell>;
}
