"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, CircleDollarSign, LoaderCircle, LockKeyhole, Power, RefreshCw, Search, TriangleAlert, X } from "lucide-react";
import type { MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import { Alert, Primary, ProofLink, Quiet, Stage, StageHeading, formatUnits } from "./shared";

export const DURATIONS = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "360", label: "6 hours" },
  { value: "1440", label: "24 hours" },
] as const;

export const LIMIT_CEILING = 5;

export interface LimitEvidence {
  registrationTx?: string;
  allowanceTx?: string;
  maxAmount: string;
  decimals: number;
}

interface LimitStageProps {
  service: MarketplaceService;
  assetCode: string;
  configReady: boolean;
  budget: string;
  onBudgetChange: (value: string) => void;
  duration: string;
  onDurationChange: (value: string) => void;
  balances: { usdc: string; xlm: string; hasUsdcTrustline: boolean } | null;
  balancesLoading: boolean;
  onRefreshBalances: () => void;
  budgetValid: boolean;
  hasEnoughUsdc: boolean;
  canApproveLimit: boolean;
  mandateOnline: boolean;
  mandateMatchesConfig: boolean;
  evidence: LimitEvidence | null;
  awaitingAllowance: boolean;
  phase: "idle" | "authenticating" | "adding-asset" | "registering" | "approving" | "active" | "revoking";
  allowancePreparing: boolean;
  usdcReady: boolean;
  explorer: string;
  onActivate: () => void;
  onRetryAllowance: () => void;
  onRevoke: () => void;
  onAddUsdc: () => void;
  onChangeService: () => void;
  onDisconnect: () => void;
}

function expiryLabel(minutes: number): string {
  const at = new Date(Date.now() + minutes * 60_000);
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Location 04 — the gate. The aperture in the wall is the spending limit;
 * the ring around it is the permission window. Two Freighter approvals arm
 * the gate: one registers the mandate, one caps the USDC allowance.
 */
export function LimitStage({
  service,
  assetCode,
  configReady,
  budget,
  onBudgetChange,
  duration,
  onDurationChange,
  balances,
  balancesLoading,
  onRefreshBalances,
  budgetValid,
  hasEnoughUsdc,
  canApproveLimit,
  mandateOnline,
  mandateMatchesConfig,
  evidence,
  awaitingAllowance,
  phase,
  allowancePreparing,
  usdcReady,
  explorer,
  onActivate,
  onRetryAllowance,
  onRevoke,
  onAddUsdc,
  onChangeService,
  onDisconnect,
}: LimitStageProps) {
  const reduceMotion = useReducedMotion();
  const minimum = Number(service.price);
  const budgetNumber = Number(budget);
  const locked = mandateOnline || Boolean(evidence?.registrationTx);
  const mandateBusy = phase === "registering" || phase === "approving";
  const staleMandate = mandateOnline && !mandateMatchesConfig;
  const sliderValue = Number.isFinite(budgetNumber) ? Math.min(LIMIT_CEILING, Math.max(minimum, budgetNumber)) : minimum;
  const durationMinutes = Number(duration);
  const registered = Boolean(evidence?.registrationTx);
  const approved = Boolean(evidence?.allowanceTx);

  return (
    <Stage id="limit" className="stage-limit">
      <StageHeading stage={4} place="The gate" title={["Draw the line."]}>
        Who gets paid. How much. Until when. The contract holds it on every payment.
      </StageHeading>

      <div className="limit-service">
        <span><small>WHO GETS PAID</small><strong>Agent402 · {service.name}</strong></span>
        <span className="limit-service-price"><strong>{service.price}</strong><small>{assetCode} / CALL</small></span>
      </div>

      <div className={`limit-controls ${locked ? "is-locked" : ""}`}>
        <label className="limit-amount">
          <span className="limit-label">HOW MUCH</span>
          <span className="limit-amount-field">
            <input
              value={budget}
              onChange={(event) => onBudgetChange(event.target.value)}
              inputMode="decimal"
              aria-label={`Maximum ${assetCode} spend`}
              disabled={locked}
            />
            <b>{assetCode}</b>
          </span>
          <input
            className="limit-slider"
            type="range"
            min={minimum}
            max={LIMIT_CEILING}
            step={0.01}
            value={sliderValue}
            onChange={(event) => onBudgetChange(Number(event.target.value).toFixed(2))}
            aria-label="Adjust maximum spend"
            disabled={locked}
            style={{ "--fill": `${((sliderValue - minimum) / (LIMIT_CEILING - minimum)) * 100}%` } as React.CSSProperties}
          />
          <span className="limit-slider-scale"><small>{minimum.toFixed(2)} min</small><small>{LIMIT_CEILING.toFixed(2)}</small></span>
        </label>

        <div className="limit-duration" role="radiogroup" aria-label="Permission expires after">
          <span className="limit-label">UNTIL WHEN</span>
          <div className="limit-duration-options">
            {DURATIONS.map((option) => {
              const active = option.value === duration;
              return (
                <button
                  type="button"
                  key={option.value}
                  role="radio"
                  aria-checked={active}
                  className={active ? "is-active" : ""}
                  disabled={locked}
                  onClick={() => onDurationChange(option.value)}
                >
                  {active && !reduceMotion && <motion.i layoutId="duration-pill" transition={{ type: "spring", stiffness: 480, damping: 36 }} />}
                  {active && reduceMotion && <i />}
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="limit-rule" aria-live="polite">
        <LockKeyhole size={12} />
        <span>
          The agent may pay <b>Agent402</b> up to <b>{budgetValid ? `${budget} ${assetCode}` : "—"}</b> until <b>{expiryLabel(durationMinutes)}</b>. Your funds stay in your wallet; only a capped allowance goes to the contract.
        </span>
      </p>

      <div className="limit-wallet">
        <span><small>WALLET</small><strong>{balancesLoading ? "Reading…" : balances ? `${balances.usdc} ${assetCode}` : "Unavailable"}</strong><em>{balancesLoading ? "" : balances ? `${balances.xlm} XLM` : ""}</em></span>
        <Quiet onClick={onRefreshBalances} disabled={balancesLoading} aria-label="Refresh balances"><RefreshCw className={balancesLoading ? "spin" : ""} size={12} /> Refresh</Quiet>
      </div>

      <AnimatePresence initial={false}>
        {staleMandate && (
          <motion.div key="stale" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Alert><TriangleAlert size={15} /><span><strong>A previous spending limit is still active.</strong> Turn it off before creating the Agent402 limit so an old payment scope is never mistaken for the new one.</span></Alert>
          </motion.div>
        )}
        {!balances?.hasUsdcTrustline && !balancesLoading && !usdcReady && (
          <motion.div key="trustline" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Primary tone="outline" onClick={onAddUsdc} busy={phase === "adding-asset"}>
              <CircleDollarSign size={15} />
              <span>{phase === "adding-asset" ? "Waiting for Freighter" : usdcReady ? "USDC is ready" : "Add USDC to wallet"}</span>
            </Primary>
          </motion.div>
        )}
        {balances?.hasUsdcTrustline && !hasEnoughUsdc && budgetValid && (
          <motion.div key="funds" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Alert><TriangleAlert size={15} /><span>Your wallet needs at least {budget} {assetCode} for this limit. Lower the limit or add {assetCode}.</span></Alert>
          </motion.div>
        )}
        {!budgetValid && (
          <motion.div key="invalid" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <Alert><TriangleAlert size={15} /><span>Enter at least {service.price} {assetCode}, the exact price of one Agent402 call.</span></Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <ol className="limit-approvals" aria-label="Freighter approvals">
        <li className={registered ? "is-done" : mandateBusy && phase === "registering" ? "is-busy" : ""}>
          <span className="limit-approval-mark">{registered ? <Check size={11} strokeWidth={3} /> : phase === "registering" ? <LoaderCircle className="spin" size={11} /> : "1"}</span>
          <span><strong>Register the limit</strong><small>{registered ? "On-chain mandate saved" : phase === "registering" ? "Saving your limit…" : "One Freighter signature"}</small></span>
          {evidence?.registrationTx && <ProofLink label="Spending limit" hash={evidence.registrationTx} explorer={explorer} />}
        </li>
        <li className={approved ? "is-done" : phase === "approving" || allowancePreparing ? "is-busy" : ""}>
          <span className="limit-approval-mark">{approved ? <Check size={11} strokeWidth={3} /> : phase === "approving" || allowancePreparing ? <LoaderCircle className="spin" size={11} /> : "2"}</span>
          <span><strong>Cap the {assetCode} allowance</strong><small>{approved ? "Contract allowance capped" : allowancePreparing ? "Preparing Freighter" : phase === "approving" ? "Approving USDC…" : "One Freighter transaction"}</small></span>
          {evidence?.allowanceTx && <ProofLink label="USDC approval" hash={evidence.allowanceTx} explorer={explorer} />}
        </li>
      </ol>

      <div className="stage-actions">
        {staleMandate ? (
          <Primary tone="danger" onClick={onRevoke} busy={phase === "revoking"}>
            {phase === "revoking" ? <LoaderCircle className="spin" size={16} /> : <X size={16} />}
            <span>{phase === "revoking" ? "Waiting for Freighter" : "Turn off previous spending limit"}</span>
          </Primary>
        ) : awaitingAllowance && evidence ? (
          <Primary onClick={onRetryAllowance} busy={phase === "approving" || allowancePreparing}>
            {phase === "approving" || allowancePreparing ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}
            <span>{allowancePreparing ? "Preparing secure approval" : phase === "approving" ? "Opening Freighter" : `Open Freighter · Approve ${formatUnits(evidence.maxAmount, evidence.decimals)} USDC`}</span>
          </Primary>
        ) : (
          <Primary onClick={onActivate} disabled={!configReady || !canApproveLimit} busy={mandateBusy}>
            {mandateBusy ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}
            <span>{phase === "registering" ? "Registering limit" : phase === "approving" ? "Approving USDC" : budgetValid ? `Approve ${budget || "0"} USDC limit` : "Approve spending limit"}</span>
            {!mandateBusy && <ArrowRight size={16} className="flow-primary-arrow" />}
          </Primary>
        )}
        <small className="stage-footnote"><LockKeyhole size={11} />Approval 1 registers the mandate. Approval 2 opens Freighter and caps the contract allowance.</small>
        <div className="stage-secondary">
          <Quiet onClick={onChangeService}><Search size={12} /> Change service</Quiet>
          <Quiet onClick={onDisconnect}><Power size={12} /> Disconnect</Quiet>
        </div>
      </div>
    </Stage>
  );
}
