"use client";

import { ArrowRight, LockKeyhole, Power } from "lucide-react";
import type { MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import type { MandateView, SafeAppConfig } from "@/lib/wallet/types";
import { AssistantThread, type PurchaseResult, type ThreadState } from "../AssistantThread";
import type { ServiceInputValues } from "../ServiceConfigurator";
import { Primary, ProofLink, Quiet, Stage, StageHeading } from "./shared";

interface RunStageProps {
  service: MarketplaceService;
  mandate: MandateView;
  config: SafeAppConfig;
  parameters: ServiceInputValues;
  remaining: string;
  limit: string;
  expires: number | undefined;
  registrationTx?: string;
  allowanceTx?: string;
  explorer: string;
  onEditConfiguration: () => void;
  onPurchaseComplete: (result: PurchaseResult) => void;
  onThreadState: (state: ThreadState) => void;
  onTurnOff: () => void;
  spentOut: boolean;
  onNewLimit: () => void;
}

/**
 * Location 05 — the rail. The payment travels from the gate to the vault;
 * every checkpoint it passes is a contract check.
 */
export function RunStage({
  service,
  mandate,
  config,
  parameters,
  remaining,
  limit,
  expires,
  registrationTx,
  allowanceTx,
  explorer,
  onEditConfiguration,
  onPurchaseComplete,
  onThreadState,
  onTurnOff,
  spentOut,
  onNewLimit,
}: RunStageProps) {
  return (
    <Stage id="run" className="stage-run">
      <StageHeading stage={5} place="The rail" title={["Let it spend."]}>
        No wallet popup. No blank check. Every payment clears the gate first.
      </StageHeading>

      <div className="run-budget" aria-label="Spending status">
        <span><small>REMAINING</small><strong>{remaining} <em>{config.asset.code}</em></strong></span>
        <span><small>LIMIT</small><strong>{limit} <em>{config.asset.code}</em></strong></span>
        <span><small>EXPIRES</small><strong>{expires ? new Date(expires * 1_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "soon"}</strong></span>
      </div>

      <AssistantThread
        mandateId={mandate.id}
        asset={config.asset.code}
        service={service}
        parameters={parameters}
        price={service.price}
        explorerNetwork={config.explorerNetwork}
        marketplaceUrl={service.docs}
        onEditConfiguration={onEditConfiguration}
        onPurchaseComplete={onPurchaseComplete}
        onStateChange={onThreadState}
        spentOut={spentOut}
      />

      {spentOut && (
        <div className="stage-actions">
          <Primary onClick={onNewLimit}><LockKeyhole size={16} /><span>Set a new limit</span><ArrowRight size={16} className="flow-primary-arrow" /></Primary>
        </div>
      )}

      <details className="stage-evidence">
        <summary><span>Why the agent is allowed to pay</span><ArrowRight size={12} /></summary>
        <div>
          {registrationTx && <ProofLink label="Limit registered" hash={registrationTx} explorer={explorer} />}
          {allowanceTx && <ProofLink label="Contract allowance" hash={allowanceTx} explorer={explorer} />}
        </div>
      </details>

      <div className="stage-secondary">
        <Quiet onClick={onTurnOff}><Power size={12} /> Turn off spending</Quiet>
      </div>
    </Stage>
  );
}
