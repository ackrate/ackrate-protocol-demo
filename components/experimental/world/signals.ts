/**
 * The bridge between the React workflow and the 3D hall.
 *
 * React writes a plain snapshot every render; the render loop reads the
 * latest snapshot each frame. Nothing in here is animated by React itself,
 * which keeps the workflow logic and the world decoupled.
 */
export type WorldStage = 1 | 2 | 3 | 4 | 5 | 6;

export interface WorldSignals {
  /** Active workflow location, 1 = Connect … 6 = Proof. */
  stage: WorldStage;
  /** Freighter returned an address (doors part). */
  connected: boolean;
  /** Ownership verified (you are admitted into the hall). */
  verified: boolean;
  /** Monotonic counter bumped whenever a catalog result set arrives. */
  catalogVersion: number;
  /** A marketplace service is highlighted in the catalog. */
  serviceChosen: boolean;
  /** Index of the listing under consideration, -1 when none. */
  catalogFocus: number;
  /** Share of the configured request fields that hold a value, 0..1. */
  requestFill: number;
  /** Spending limit mapped to 0..1 (drives the aperture). */
  aperture: number;
  /** Expiry window mapped to 0..1 (drives the ring). */
  expiry: number;
  /** Mandate registered on-chain (first approval). */
  limitRegistered: boolean;
  /** USDC allowance approved (second approval, gate armed). */
  limitArmed: boolean;
  /** A paid request is in flight through the protocol. */
  running: boolean;
  /** Settlement complete: both proofs available. */
  settled: boolean;
}

export const initialWorldSignals: WorldSignals = {
  stage: 1,
  connected: false,
  verified: false,
  catalogVersion: 0,
  serviceChosen: false,
  catalogFocus: -1,
  requestFill: 0,
  aperture: 0.35,
  expiry: 0.25,
  limitRegistered: false,
  limitArmed: false,
  running: false,
  settled: false,
};
