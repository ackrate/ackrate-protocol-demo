"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { ArrowUpRight, Check, Copy } from "lucide-react";
import { Drift, Reveal, useMagnetic } from "./motion";

export const short = (value: string | null | undefined, size = 7) =>
  value ? `${value.slice(0, size)}…${value.slice(-size)}` : "Not configured";

export function formatUnits(value: string, decimals: number): string {
  const raw = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = (raw % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Six locations. The number is the stage; the place is what the camera sees. */
export const LOCATIONS = [
  { stage: 1, name: "Connect", place: "The threshold" },
  { stage: 2, name: "Marketplace", place: "The library" },
  { stage: 3, name: "Configure", place: "The console" },
  { stage: 4, name: "Limit", place: "The gate" },
  { stage: 5, name: "Run", place: "The rail" },
  { stage: 6, name: "Proof", place: "The vault" },
] as const;

export const stageEase = [0.22, 1, 0.36, 1] as const;

/** One stage of the journey: enters as the camera settles, leaves as it departs. */
export function Stage({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.section
      key={id}
      className={`stage ${className}`}
      data-stage={id}
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -12, transition: { duration: 0.5, ease: stageEase } }}
      transition={{ duration: reduceMotion ? 0 : 1.1, delay: reduceMotion ? 0 : 0.45, ease: stageEase }}
    >
      {children}
    </motion.section>
  );
}

export function StageHeading({ stage, place, title, children }: { stage: number; place: string; title: string[]; children?: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <header className="stage-heading">
      <Drift depth={2}>
        <motion.p
          className="stage-kicker"
          initial={reduceMotion ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.55, ease: stageEase }}
        >
          <span>STEP {stage} OF 6</span><i /><span>{place.toUpperCase()}</span>
        </motion.p>
      </Drift>
      <Drift depth={4}>
        <h2><Reveal lines={title} delay={0.62} stagger={0.022} /></h2>
      </Drift>
      {children && (
        <Drift depth={3}>
          <motion.p
            className="stage-lede"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.0, ease: stageEase }}
          >{children}</motion.p>
        </Drift>
      )}
    </header>
  );
}

/** Primary action: a light in the dark. Leans toward the pointer. */
export function Primary({ children, disabled, busy, tone = "light", ...rest }: HTMLMotionProps<"button"> & { busy?: boolean; tone?: "light" | "danger" | "outline" }) {
  const reduceMotion = useReducedMotion();
  const inert = disabled || busy;
  const magnet = useMagnetic(inert ? 0 : 0.1, 60);
  return (
    <motion.button
      ref={magnet.ref as React.Ref<HTMLButtonElement>}
      className={`flow-primary tone-${tone} ${busy ? "is-busy" : ""}`}
      type="button"
      disabled={inert}
      style={{ x: magnet.x, y: magnet.y }}
      whileHover={reduceMotion || inert ? undefined : { scale: 1.015 }}
      whileTap={reduceMotion || inert ? undefined : { scale: 0.975 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

export function Quiet({ children, ...rest }: HTMLMotionProps<"button">) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      className="flow-quiet"
      type="button"
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      {...rest}
    >{children}</motion.button>
  );
}

export function Facts({ items }: { items: string[] }) {
  return (
    <ul className="stage-facts" aria-label="Details">
      {items.map((item) => <li key={item}><Check size={12} strokeWidth={2.4} />{item}</li>)}
    </ul>
  );
}

export function Alert({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "info" }) {
  return <div className={`stage-alert tone-${tone}`} role={tone === "warn" ? "alert" : "status"}>{children}</div>;
}

export function ProofLink({ label, hash, explorer }: { label: string; hash: string; explorer: string }) {
  return (
    <a className="proof-link" href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
      <span><Check size={11} strokeWidth={2.6} />{label}</span>
      <code>{short(hash, 6)}</code>
      <ArrowUpRight size={12} />
    </a>
  );
}

export function TransactionEvidence({ label, hash, explorer }: { label: string; hash: string; explorer: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="proof-evidence">
      <span>{label}</span>
      <code>{short(hash, 6)}</code>
      <button type="button" onClick={async () => {
        await navigator.clipboard.writeText(hash);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
      }} aria-label={`Copy ${label.toLowerCase()} transaction hash`} title="Copy transaction hash">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer" aria-label={`Open ${label.toLowerCase()} transaction in Stellar Explorer`} title="Open in Stellar Explorer">
        <ArrowUpRight size={13} /> View transaction
      </a>
    </div>
  );
}
