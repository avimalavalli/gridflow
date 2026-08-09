"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";

interface SetupResponse { secret: string; otpauthUri: string; expiresAt: string; }
interface EnableResponse { enabled: boolean; recoveryCodes: string[]; }
interface TrustedDevice { id: string; name: string; firstSeenAt: string; lastSeenAt: string; ipAddress: string | null; current: boolean; activeSessions: number; }
interface TrustedDevicesResponse { maximum: number; devices: TrustedDevice[]; }

export function SecurityClient({ mfaEnabled }: { mfaEnabled: boolean }) {
  const [enabled, setEnabled] = useState(mfaEnabled);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [devices, setDevices] = useState<TrustedDevicesResponse | null>(null);
  const [deviceMessage, setDeviceMessage] = useState("");

  async function loadDevices() {
    try { setDevices(await apiGet<TrustedDevicesResponse>("/auth/devices")); }
    catch (error) { setDeviceMessage(error instanceof Error ? error.message : "Could not load trusted devices."); }
  }

  useEffect(() => { void loadDevices(); }, []);

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

  async function revokeDevice(device: TrustedDevice) {
    if (!window.confirm(`Sign out and remove ${device.name}?`)) return;
    setBusy(true); setDeviceMessage("");
    try {
      const result = await apiPost<{ currentDeviceRevoked: boolean }>(`/auth/devices/${device.id}/revoke`);
      if (result.currentDeviceRevoked) { window.location.assign("/login"); return; }
      await loadDevices();
      setDeviceMessage(`${device.name} has been removed and all of its sessions were revoked.`);
    } catch (error) { setDeviceMessage(error instanceof Error ? error.message : "Could not remove the trusted device."); }
    finally { setBusy(false); }
  }

  async function revokeAll() {
    if (!window.confirm("Sign out every trusted device, including this one? You will need to sign in again.")) return;
    setBusy(true); setDeviceMessage("");
    try { await apiPost("/auth/devices/revoke-all"); window.location.assign("/login"); }
    catch (error) { setDeviceMessage(error instanceof Error ? error.message : "Could not sign out all devices."); setBusy(false); }
  }

  return (<>
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
    <section className="card" aria-labelledby="trusted-devices-heading">
      <div className="card-head"><div><h2 id="trusted-devices-heading">Trusted devices</h2><p className="card-subtitle">Each person can use GridFlow on two trusted devices. Extra browser tabs do not consume another slot.</p></div><span className="badge blue">{devices ? `${devices.devices.length} of ${devices.maximum}` : "Loading…"}</span></div>
      {devices ? <div className="trusted-device-list">{devices.devices.map((device) => <div className="trusted-device-row" key={device.id}>
        <div className="trusted-device-copy"><div className="trusted-device-heading"><strong>{device.name}</strong>{device.current ? <span className="badge green">This device</span> : null}</div><small>Last active {new Date(device.lastSeenAt).toLocaleString()} · Trusted since {new Date(device.firstSeenAt).toLocaleDateString()} · {device.activeSessions} active {device.activeSessions === 1 ? "session" : "sessions"}</small></div>
        <div className="trusted-device-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => revokeDevice(device)}>{device.current ? "Remove and sign out" : "Remove device"}</button></div>
      </div>)}</div> : null}
      <div className="section-gap"><button className="button button-danger" type="button" disabled={busy || !devices?.devices.length} onClick={revokeAll}>Sign out all devices</button></div>
      {deviceMessage ? <div className={`notice ${/could not|failed/i.test(deviceMessage) ? "notice-error" : "notice-success"}`} role="status">{deviceMessage}</div> : null}
    </section>
  </>);
}
