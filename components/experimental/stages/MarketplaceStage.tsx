"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Check, LoaderCircle, LockKeyhole, Power, Search, TriangleAlert } from "lucide-react";
import type { MarketplaceService } from "@/lib/wallet/marketplace-catalog";
import { Alert, Primary, Quiet, Stage, StageHeading, short } from "./shared";

export const MARKETPLACE_URL = "https://agent402.tools/stellar";

interface MarketplaceStageProps {
  sessionAddress: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  services: MarketplaceService[];
  catalog: { source: string; size: number; matches: number };
  draft: MarketplaceService;
  onDraftChange: (service: MarketplaceService) => void;
  isRunnable: (service: MarketplaceService) => boolean;
  onChoose: () => void;
  onDisconnect: () => void;
}

/**
 * Location 02 — the catalog. Every shelf on the walls is a live x402 listing;
 * the one you pick is what the agent is allowed to buy.
 */
export function MarketplaceStage({
  sessionAddress,
  query,
  onQueryChange,
  loading,
  services,
  catalog,
  draft,
  onDraftChange,
  isRunnable,
  onChoose,
  onDisconnect,
}: MarketplaceStageProps) {
  const reduceMotion = useReducedMotion();
  const runnable = isRunnable(draft);

  return (
    <Stage id="marketplace" className="stage-marketplace">
      <StageHeading stage={2} place="The library" title={["Pick what your", "agent can buy."]}>
        Every volume on these shelves is a live x402 service, priced per call. Nothing moves until you say so.
      </StageHeading>

      {sessionAddress && (
        <div className="stage-session" aria-label="Connected wallet">
          <span><i />Connected as <code>{short(sessionAddress, 5)}</code></span>
          <Quiet onClick={onDisconnect}><Power size={11} /> Not you? Disconnect</Quiet>
        </div>
      )}

      <div className="catalog-source">
        <span className="catalog-source-name"><b>Agent402</b><small>STELLAR x402 MARKETPLACE</small></span>
        <span className="catalog-source-meta">{catalog.source === "live" ? `${catalog.size} live tools` : "verified catalog"}</span>
        <a href={MARKETPLACE_URL} target="_blank" rel="noreferrer">Open <ArrowUpRight size={12} /></a>
      </div>

      <label className="catalog-search">
        <Search size={15} strokeWidth={2.2} />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search web, research, scraper, PDF…"
          maxLength={80}
          aria-label="Search Agent402 services"
          autoComplete="off"
        />
        <AnimatePresence>{loading && <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><LoaderCircle className="spin" size={14} /></motion.span>}</AnimatePresence>
      </label>

      <div className="catalog-chips" aria-label="Suggested searches">
        {["Web search", "Research", "Scraper", "PDF"].map((suggestion) => (
          <button type="button" key={suggestion} className={query === suggestion ? "is-active" : ""} onClick={() => onQueryChange(suggestion)}>{suggestion}</button>
        ))}
      </div>

      <div className="catalog-label">
        <span>{query ? "SHELF · MATCHING VOLUMES" : "SHELF · RECOMMENDED FOR RESEARCH"}</span>
        <small>{catalog.matches || services.length} {(catalog.matches || services.length) === 1 ? "volume" : "volumes"}</small>
      </div>

      <div className="shelf" role="listbox" aria-label="Marketplace services" aria-busy={loading}>
        <AnimatePresence initial={false} mode="popLayout">
          {services.length ? services.map((service, index) => {
            const selected = draft.id === service.id;
            const live = isRunnable(service);
            return (
              <motion.button
                layout={!reduceMotion}
                key={service.id}
                role="option"
                aria-selected={selected}
                className={`volume ${selected ? "is-selected" : ""} ${live ? "is-live" : "is-preview"}`}
                type="button"
                onClick={() => onDraftChange(service)}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0, x: selected && !reduceMotion ? 10 : 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.36, delay: reduceMotion ? 0 : Math.min(index, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }}
                whileHover={reduceMotion || selected ? undefined : { x: 4 }}
                whileTap={reduceMotion ? undefined : { scale: 0.992 }}
              >
                <span className="volume-spine" aria-hidden>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <i />
                </span>
                <span className="volume-body">
                  <strong>{service.name}</strong>
                  <small>{service.description}</small>
                  <em>{service.method} · {service.categoryLabel} · {live ? "LIVE PAYMENT READY" : "SCHEMA PREVIEW"}</em>
                  <span className="service-inputs">{service.inputs.length ? service.inputs.map((field) => <b key={field.name}>{field.name}{field.required ? " *" : ""}</b>) : <b>Schema unavailable</b>}</span>
                </span>
                <span className="volume-tag"><b>{service.price}</b><small>USDC / CALL</small></span>
              </motion.button>
            );
          }) : (
            <motion.div key="empty" className="catalog-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Search size={16} /><strong>No volume matches</strong><span>Try web, research, scraper, PDF, news, or data.</span>
            </motion.div>
          )}
        </AnimatePresence>
        <span className="shelf-ledge" aria-hidden />
      </div>

      {!runnable && (
        <Alert tone="info">
          <TriangleAlert size={15} />
          <span><strong>{draft.name} is visible from the live catalog.</strong> Its schema can be inspected, but this release executes Web Search, PDF to Text, and PDF Info.</span>
        </Alert>
      )}

      <div className="stage-actions">
        <Primary onClick={onChoose} disabled={!runnable}>
          <span>Configure {draft.name}</span><ArrowRight size={16} className="flow-primary-arrow" />
        </Primary>
        <small className="stage-footnote"><LockKeyhole size={11} />Payment happens only when the request runs.<Check size={11} className="stage-footnote-check" />Stellar Mainnet · x402 · no marketplace account</small>
      </div>
    </Stage>
  );
}
