"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUpRight, Check, Power, Search } from "lucide-react";
import type { MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import type { PurchaseResult } from "../AssistantThread";
import { Primary, Quiet, Stage, StageHeading, short, stageEase } from "./shared";

interface ProofStageProps {
  service: MarketplaceService;
  guided: boolean;
  purchase: PurchaseResult;
  externalSettlement: { transaction: string; amount: string } | null;
  explorer: string;
  onAskAnother: () => void;
  onTurnOff: () => void;
}

/**
 * Location 06 — the vault. Two settlement records light up on the wall: the
 * contract payment and the marketplace's own x402 settlement.
 */
export function ProofStage({ service, guided, purchase, externalSettlement, explorer, onAskAnother, onTurnOff }: ProofStageProps) {
  const reduceMotion = useReducedMotion();
  const records = [
    {
      key: "contract",
      label: "01 · ACKRATE CONTRACT",
      amount: `${purchase.payment.amount} ${purchase.payment.asset}`,
      hash: purchase.payment.txHash,
      href: `${explorer}/tx/${purchase.payment.txHash}`,
    },
    externalSettlement
      ? {
        key: "marketplace",
        label: "02 · AGENT402 x402",
        amount: `${externalSettlement.amount} USDC`,
        hash: externalSettlement.transaction,
        href: `${explorer}/tx/${externalSettlement.transaction}`,
      }
      : null,
  ];

  return (
    <Stage id="proof" className="stage-proof">
      <StageHeading stage={6} place="The vault" title={["Settled.", "Proven."]}>
        {guided ? "Research delivered." : `${service.name} delivered.`} Two independent records on Stellar Mainnet: the contract payment and the seller's x402 settlement.
      </StageHeading>

      <div className="proof-records flow-settlement-grid">
        {records.map((record, index) => record ? (
          <motion.a
            key={record.key}
            className="proof-record"
            href={record.href}
            target="_blank"
            rel="noreferrer"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 + index * 0.18, ease: stageEase }}
            whileHover={reduceMotion ? undefined : { y: -2 }}
          >
            <small>{record.label}</small>
            <strong>{record.amount}</strong>
            <code>{short(record.hash, 8)}</code>
            <span><Check size={11} strokeWidth={3} /> Verified on Stellar <ArrowUpRight size={12} /></span>
          </motion.a>
        ) : (
          <div className="proof-record is-missing" key="missing">
            <small>02 · AGENT402 x402</small>
            <strong>Proof unavailable</strong>
            <span>Do not treat this run as complete.</span>
          </div>
        ))}
      </div>

      <div className="stage-actions">
        <Primary onClick={() => document.getElementById("paid-service-output")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })}>
          <span>{guided ? "Read the cited report" : "Open service output"}</span><ArrowDown size={16} className="flow-primary-arrow" />
        </Primary>
        <div className="stage-secondary">
          <Quiet onClick={onAskAnother}><Search size={12} /> Ask another question</Quiet>
          <Quiet onClick={onTurnOff}><Power size={12} /> Turn off spending</Quiet>
        </div>
      </div>
    </Stage>
  );
}
