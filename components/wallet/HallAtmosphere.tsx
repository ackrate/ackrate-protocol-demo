"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { hallEase } from "./stages/motion";

/**
 * Cursor: a dot that becomes a ring over anything interactive and a grab
 * glyph while looking around the world. Fine pointers only.
 */
export function HallCursor() {
  const reduceMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"dot" | "ring" | "grab" | "text">("dot");
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 380, damping: 32, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 380, damping: 32, mass: 0.6 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    if (!fine.matches) return;
    setEnabled(true);
    document.documentElement.classList.add("hall-cursor-on");
    let dragging = false;
    const move = (event: PointerEvent) => {
      x.set(event.clientX);
      y.set(event.clientY);
      if (dragging) return;
      const target = event.target as HTMLElement | null;
      const interactive = target?.closest("a, button, [role=option], [role=radio], summary, input[type=range]");
      const text = target?.closest("input:not([type=range]), textarea, select");
      setMode(text ? "text" : interactive ? "ring" : "dot");
    };
    const down = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".protocol-world")) {
        dragging = true;
        setMode("grab");
      }
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      setMode("dot");
    };
    const leave = () => { x.set(-100); y.set(-100); };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    document.documentElement.addEventListener("mouseleave", leave);
    return () => {
      document.documentElement.classList.remove("hall-cursor-on");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.documentElement.removeEventListener("mouseleave", leave);
    };
  }, [x, y]);

  if (!enabled) return null;
  return (
    <div className="hall-cursor" data-mode={mode} aria-hidden>
      <motion.span className="hall-cursor-dot" style={{ x, y }} />
      <motion.span className="hall-cursor-ring" style={reduceMotion ? { x, y } : { x: ringX, y: ringY }}>
        <i /><i />
      </motion.span>
    </div>
  );
}

/** Film grain: a still texture the compositor shifts in steps. */
export function HallGrain() {
  return <div className="hall-grain" aria-hidden />;
}

/**
 * The entry: a black cover carrying the wordmark and a hairline that fills
 * while the world initialises. When the first frame is ready the cover parts
 * like the doors ahead.
 */
export function HallEntry({ ready }: { ready: boolean }) {
  const reduceMotion = useReducedMotion();
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), reduceMotion ? 150 : 1250);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);
  useEffect(() => {
    if (ready && minimumElapsed) setOpen(true);
  }, [ready, minimumElapsed]);
  useEffect(() => {
    /* Never trap a visitor behind the cover if the renderer cannot start. */
    const fallback = window.setTimeout(() => setOpen(true), 9000);
    return () => window.clearTimeout(fallback);
  }, []);

  return (
    <AnimatePresence>
      {!open && (
        <motion.div className="hall-entry" key="entry" aria-hidden exit={{ pointerEvents: "none" }}>
          <motion.div
            className="hall-entry-half is-left"
            initial={false}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0.35 } } : { x: "-100%", transition: { duration: 1.1, ease: hallEase } }}
          />
          <motion.div
            className="hall-entry-half is-right"
            initial={false}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0.35 } } : { x: "100%", transition: { duration: 1.1, ease: hallEase } }}
          />
          <motion.div
            className="hall-entry-mark"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: 0.6, ease: hallEase }}
          >
            <span className="hall-entry-word">ACKRATE</span>
            <span className="hall-entry-line"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: ready ? 1 : 0.72 }} transition={{ duration: ready ? 0.5 : 2.6, ease: hallEase }} /></span>
            <span className="hall-entry-caption">{ready ? "ENTERING" : "PREPARING THE HALL"}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
