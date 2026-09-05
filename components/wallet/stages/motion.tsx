"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { motion, motionValue, useMotionValue, useReducedMotion, useSpring, useTransform, type HTMLMotionProps } from "framer-motion";

export const hallEase = [0.22, 1, 0.36, 1] as const;

/* One shared pointer for every drifting layer, normalised to -1..1. */
const pointerX = motionValue(0);
const pointerY = motionValue(0);
let pointerBound = false;
function bindPointer() {
  if (pointerBound || typeof window === "undefined") return;
  pointerBound = true;
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    pointerX.set((event.clientX / window.innerWidth - 0.5) * 2);
    pointerY.set((event.clientY / window.innerHeight - 0.5) * 2);
  }, { passive: true });
}

/**
 * Drift: the layer follows the pointer by `depth` pixels, sprung. Deeper
 * layers move more, so the sheet reads as planes in the same room as the
 * world instead of a flat overlay.
 */
export function Drift({ depth = 8, children, className, style, ...rest }: HTMLMotionProps<"div"> & { depth?: number; children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  useEffect(bindPointer, []);
  const amount = reduceMotion ? 0 : depth;
  const x = useSpring(useTransform(pointerX, (value) => value * amount), { stiffness: 42, damping: 20, mass: 1 });
  const y = useSpring(useTransform(pointerY, (value) => value * amount * 0.7), { stiffness: 42, damping: 20, mass: 1 });
  return (
    <motion.div className={className} style={{ ...(style as CSSProperties), x, y }} {...rest}>
      {children}
    </motion.div>
  );
}

/** Magnetic: the element leans toward a nearby pointer and snaps back. */
export function useMagnetic(strength = 0.28, radius = 90) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 22, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 260, damping: 22, mass: 0.5 });
  useEffect(() => {
    if (reduceMotion) return;
    const element = ref.current;
    if (!element || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance > radius + Math.max(rect.width, rect.height) / 2) {
        x.set(0);
        y.set(0);
        return;
      }
      x.set(dx * strength);
      y.set(dy * strength);
    };
    const leave = () => { x.set(0); y.set(0); };
    window.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
    };
  }, [radius, reduceMotion, strength, x, y]);
  return { ref, x: sx, y: sy };
}

/**
 * Reveal: a display line split into characters that rise out of a mask,
 * staggered. Lines are separate so headings can break where they should.
 */
export function Reveal({ lines, delay = 0.12, stagger = 0.018, as: Tag = "span", accentLast = false }: {
  lines: string[];
  delay?: number;
  stagger?: number;
  as?: "span" | "h1" | "h2";
  accentLast?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  let index = 0;
  return (
    <Tag className="reveal" aria-label={lines.join(" ")}>
      {lines.map((line, lineIndex) => (
        <span className={`reveal-line ${accentLast && lineIndex === lines.length - 1 ? "is-accent" : ""}`} key={`${lineIndex}:${line}`} aria-hidden>
          {line.split(" ").map((word, wordIndex) => (
            <span className="reveal-word" key={`${wordIndex}:${word}`}>
              {Array.from(word).map((char, charIndex) => {
                const order = index;
                index += 1;
                return (
                  <span className="reveal-mask" key={`${charIndex}:${char}`}>
                    <motion.span
                      className="reveal-char"
                      initial={reduceMotion ? false : { y: "110%", rotate: 4, opacity: 0 }}
                      animate={{ y: "0%", rotate: 0, opacity: 1 }}
                      transition={{ duration: reduceMotion ? 0 : 1.15, delay: reduceMotion ? 0 : delay + order * stagger, ease: hallEase }}
                    >{char}</motion.span>
                  </span>
                );
              })}
              {wordIndex < line.split(" ").length - 1 && <span className="reveal-space"> </span>}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}
