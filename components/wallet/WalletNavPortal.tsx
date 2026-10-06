"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const WALLET_NAV_SLOT_ID = "site-nav-wallet-slot";

// Renders wallet-owned controls into the slot the shared Nav reserves on /wallet
// routes. State stays with the caller; unmounting removes the controls.
export default function WalletNavPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => setTarget(document.getElementById(WALLET_NAV_SLOT_ID)), []);
  return target ? createPortal(children, target) : null;
}
