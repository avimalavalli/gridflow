"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { apiPost } from "../../lib/api";

interface SetupResponse { secret: string; otpauthUri: string; expiresAt: string; }
interface EnableResponse { enabled: boolean; recoveryCodes: string[]; }

export function SecurityClient({ mfaEnabled }: { mfaEnabled: boolean }) {
  const [enabled, setEnabled] = useState(mfaEnabled);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!setup) return;
    let active = true;
    QRCode.toDataURL(setup.otpauthUri, { width: 220, margin: 1 })
      .then((value) => { if (active) setQr(value); })
      .catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [setup]);

  async function beginSetup() {
    setBusy(true); setMessage(""); setRecoveryCodes([]);
    try { setQr(""); setSetup(await apiPost<SetupResponse>("/auth/mfa/setup")); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not start MFA setup."); }
    finally { setBusy(false); }
  }

  async function enable() {
    setBusy(true); setMessage("");
    try {
      const result = await apiPost<EnableResponse>("/auth/mfa/enable", { code });
      setEnabled(result.enabled); setRecoveryCodes(result.recoveryCodes); setSetup(null); setQr(""); setCode("");
      setMessage("Multi-factor authentication is now enabled. Save the recovery codes somewhere secure.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not enable MFA."); }
    finally { setBusy(false); }
  }

  async function regenerate() {
    setBusy(true); setMessage("");
    try {
      const result = await apiPost<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { code });
      setRecoveryCodes(result.recoveryCodes); setCode(""); setMessage("New recovery codes generated. Previous codes no longer work.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not regenerate recovery codes."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage("");
    try {
      await apiPost("/auth/mfa/disable", { password, code });
      setEnabled(false); setPassword(""); setCode(""); setRecoveryCodes([]); setMessage("Multi-factor authentication has been disabled.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not disable MFA."); }
    finally { setBusy(false); }
  }

  return (
    <section className="card" aria-labelledby="security-heading">
      <div className="card-head"><div><h2 id="security-heading">Account security</h2><p className="card-subtitle">Protect this account with an authenticator app and recovery codes.</p></div><span className={`badge ${enabled ? "green" : "amber"}`}>{enabled ? "MFA enabled" : "MFA off"}</span></div>
      {!enabled && !setup ? <button className="button button-primary" onClick={beginSetup} disabled={busy}>{busy ? "Preparing…" : "Set up MFA"}</button> : null}
      {setup ? <div className="security-setup">
        <div>{qr ? <Image className="mfa-qr" src={qr} alt="QR code for GridFlow multi-factor authentication" width={220} height={220} unoptimized /> : <div className="empty">Generating QR code…</div>}</div>
        <div className="stack compact"><div><div className="queue-title">Manual setup key</div><code className="secret-code">{setup.secret}</code></div><label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event)=>setCode(event.target.value)} /></label><div className="channel-actions"><button className="button button-primary" onClick={enable} disabled={busy || code.length < 6}>{busy ? "Verifying…" : "Verify and enable"}</button><button className="button button-secondary" onClick={()=>{setSetup(null);setQr("");setCode("");}}>Cancel</button></div></div>
      </div> : null}
      {enabled ? <div className="stack compact"><label>Authenticator or recovery code<input autoComplete="one-time-code" value={code} onChange={(event)=>setCode(event.target.value)} /></label><div className="channel-actions"><button className="button button-secondary" onClick={regenerate} disabled={busy || code.length < 6}>Generate new recovery codes</button></div><div className="divider" /><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event)=>setPassword(event.target.value)} /></label><button className="button button-danger" onClick={disable} disabled={busy || !password || code.length < 6}>Disable MFA</button></div> : null}
      {recoveryCodes.length ? <div className="recovery-panel" role="status"><strong>Recovery codes — shown once</strong><p>Each code works one time. Store them outside GridFlow.</p><div className="recovery-grid">{recoveryCodes.map((item)=><code key={item}>{item}</code>)}</div></div> : null}
      {message ? <div className={`notice ${/could not|incorrect|failed/i.test(message) ? "notice-error" : "notice-success"}`} role="status">{message}</div> : null}
    </section>
  );
}
