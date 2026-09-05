"use client";

import type { MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import { ServiceConfigurator, type ServiceInputValues } from "../ServiceConfigurator";
import { Stage, StageHeading } from "./shared";

interface ConfigureStageProps {
  service: MarketplaceService;
  values: ServiceInputValues;
  executable: boolean;
  guided: boolean;
  onChange: (values: ServiceInputValues) => void;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Location 03 — the console. The request is written on the slab under the
 * beam; each filled field lights a line on it.
 */
export function ConfigureStage({ service, values, executable, guided, onChange, onBack, onContinue }: ConfigureStageProps) {
  return (
    <Stage id="configure" className="stage-configure">
      <StageHeading
        stage={3}
        place="The console"
        title={guided ? ["Ask the question.", "Set the terms."] : ["Write the", "exact order."]}
      >
        Fields come straight from the live Agent402 schema. The agent pays for this request and nothing else.
      </StageHeading>
      <ServiceConfigurator
        service={service}
        values={values}
        executable={executable}
        onChange={onChange}
        onBack={onBack}
        onContinue={onContinue}
      />
    </Stage>
  );
}
