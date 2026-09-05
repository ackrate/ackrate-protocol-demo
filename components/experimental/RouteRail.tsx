"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { LOCATIONS } from "./stages/shared";

interface RouteRailProps {
  stage: number;
  /** Stages the workflow can safely return to from where it is now. */
  reachable: number[];
  onNavigate: (stage: number) => void;
}

/**
 * The route through the hall: six locations on one line. The line fills as
 * the camera travels; earlier locations stay reachable where the workflow
 * allows it.
 */
export function RouteRail({ stage, reachable, onNavigate }: RouteRailProps) {
  const reduceMotion = useReducedMotion();
  const progress = (stage - 1) / (LOCATIONS.length - 1);

  return (
    <nav className="route" aria-label="Journey">
      <div className="route-line" aria-hidden>
        <motion.span
          className="route-line-fill"
          initial={false}
          animate={{ scaleY: progress, scaleX: progress }}
          transition={reduceMotion ? { duration: 0 } : { duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <ol>
        {LOCATIONS.map((location) => {
          const state = location.stage < stage ? "done" : location.stage === stage ? "current" : "ahead";
          const clickable = reachable.includes(location.stage);
          return (
            <li key={location.stage} className={`route-stop is-${state}`}>
              <button
                type="button"
                disabled={!clickable}
                aria-current={state === "current" ? "step" : undefined}
                onClick={() => clickable && onNavigate(location.stage)}
                title={clickable ? `Return to ${location.name}` : location.name}
              >
                <span className="route-dot">
                  {state === "current" && (
                    <motion.i layoutId="route-current" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }} />
                  )}
                  {state === "done" && <Check size={9} strokeWidth={3.2} />}
                </span>
                <span className="route-text">
                  <strong>{String(location.stage).padStart(2, "0")} {location.name}</strong>
                  <small>{location.place}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
