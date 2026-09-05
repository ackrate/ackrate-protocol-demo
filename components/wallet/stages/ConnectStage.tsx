"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, LoaderCircle, LockKeyhole, TriangleAlert } from "lucide-react";
import type { SafeAppConfig } from "@/lib/wallet/types";
import { Drift, Reveal } from "./motion";
import { Alert, Facts, Primary, Stage, stageEase } from "./shared";

interface ConnectStageProps {
  config: SafeAppConfig | null;
  walletAddress: string | null;
  authenticating: boolean;
  governanceWalletConnected: boolean;
  onConnect: () => void;
  onVerify: () => void;
}

/**
 * Location 01 — the threshold. The hero lives here: the doors are closed
 * until a wallet answers, and verifying ownership is what admits you.
 */
export function ConnectStage({ config, walletAddress, authenticating, governanceWalletConnected, onConnect, onVerify }: ConnectStageProps) {
  const reduceMotion = useReducedMotion();
  const ready = Boolean(config) && !authenticating;

  return (
    <Stage id="connect" className="stage-connect">
      <Drift depth={2}>
        <motion.p
          className="hero-kicker"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >THE ENFORCEMENT LAYER FOR AGENT PAYMENTS</motion.p>
      </Drift>

      <Drift depth={5}>
        <h1 className="hero-title">
          <Reveal lines={["Purchasing power.", "Not a blank check."]} delay={0.55} stagger={0.026} accentLast />
        </h1>
      </Drift>

      <Drift depth={4}>
        <motion.p
          className="hero-lede"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.5, ease: stageEase }}
        >
          Agents discover live services on the x402 marketplace. You set who gets paid,
          how much, and for how long. ACKRATE enforces it on-chain, on every payment.
        </motion.p>
      </Drift>

      <Drift depth={6}>
        <motion.div
          className="hero-actions"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.75, ease: stageEase }}
        >
          {governanceWalletConnected && (
            <Alert>
              <TriangleAlert size={15} />
              <span><strong>Contract account detected.</strong> This 2-of-3 account protects the contract. Connect a separate personal Mainnet wallet.</span>
            </Alert>
          )}
          <Primary onClick={walletAddress ? onVerify : onConnect} disabled={!ready || governanceWalletConnected} busy={authenticating}>
            {authenticating ? <LoaderCircle className="spin" size={16} /> : null}
            <span>{authenticating ? "Waiting for Freighter" : walletAddress ? "Verify wallet" : "Enter with Freighter"}</span>
            {!authenticating && <ArrowRight size={16} className="flow-primary-arrow" />}
          </Primary>
          <Facts items={["Stellar Mainnet", "Circle USDC", "No charge to connect"]} />
          <small className="stage-footnote">
            <LockKeyhole size={11} />
            {walletAddress
              ? "Verification is one signature. It is never sent to Mainnet."
              : "Connecting does not create, sign, or send a Mainnet transaction."}
          </small>
        </motion.div>
      </Drift>
    </Stage>
  );
}
