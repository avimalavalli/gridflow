"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await fetch("/backend/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <button className="sidebar-logout" type="button" disabled={busy} onClick={logout}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
