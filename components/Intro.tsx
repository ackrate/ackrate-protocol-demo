"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { motion } from "framer-motion";

const DURATION = 4.6; // seconds end to end

/**
 * Cinematic WebGL intro: a field of particles streams in from deep space,
 * converges into a glowing core while the ACKRATE wordmark resolves, then warps
 * forward to reveal the site. Vanilla Three.js (no postprocessing) so it builds
 * clean and runs everywhere; loaded client-only via next/dynamic.
 */
export default function Intro({ onDone }: { onDone: () => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const doneRef = useRef(false);
  const [phase, setPhase] = useState(0); // 0 idle · 1 wordmark · 2 tagline · 3 exit

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      setPhase(3);
      window.setTimeout(onDone, 650); // let the overlay fade before unmount
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    const W = () => mount.clientWidth || window.innerWidth;
    const H = () => mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(62, W() / H(), 0.1, 200);
    camera.position.set(0, 0, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W(), H());
    mount.appendChild(renderer.domElement);

    // procedural soft-glow sprite texture (no external asset)
    const glow = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d")!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.2, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.35)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    // particles: far random shell -> fibonacci sphere -> warp out
    const COUNT = 6500;
    const start = new Float32Array(COUNT * 3);
    const target = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const positions = new Float32Array(COUNT * 3);
    const cA = new THREE.Color("#34d399");
    const cB = new THREE.Color("#5eead4");
    const cC = new THREE.Color("#f0fff9");
    const R = 4.3;
    const golden = Math.PI * (1 + Math.sqrt(5));
    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / COUNT);
      const theta = golden * i;
      target[ix] = R * Math.sin(phi) * Math.cos(theta);
      target[ix + 1] = R * Math.cos(phi);
      target[ix + 2] = R * Math.sin(phi) * Math.sin(theta);
      const sr = 22 + Math.random() * 36;
      const sp = Math.acos(2 * Math.random() - 1);
      const st = Math.random() * Math.PI * 2;
      start[ix] = sr * Math.sin(sp) * Math.cos(st);
      start[ix + 1] = sr * Math.cos(sp);
      start[ix + 2] = sr * Math.sin(sp) * Math.sin(st);
      positions[ix] = start[ix];
      positions[ix + 1] = start[ix + 1];
      positions[ix + 2] = start[ix + 2];
      const roll = Math.random();
      const c = roll < 0.62 ? cA : roll < 0.85 ? cB : cC;
      colors[ix] = c.r;
      colors[ix + 1] = c.g;
      colors[ix + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.14,
      map: glow,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.95,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const coreMat = new THREE.SpriteMaterial({
      map: glow,
      color: new THREE.Color("#5eead4"),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const core = new THREE.Sprite(coreMat);
    core.scale.set(0, 0, 1);
    scene.add(core);

    const clock = new THREE.Clock();
    let raf = 0;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeIn = (t: number) => t * t * t;
    const pos = geo.attributes.position.array as Float32Array;

    const onResize = () => {
      camera.aspect = W() / H();
      camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
    };
    window.addEventListener("resize", onResize);
    const tWord = window.setTimeout(() => setPhase(1), 1450);
    const tTag = window.setTimeout(() => setPhase(2), 2650);

    const render = () => {
      const e = clock.getElapsedTime();
      const conv = easeOut(Math.min(1, e / 2.4));
      const warp = easeIn(e > 3.8 ? Math.min(1, (e - 3.8) / 0.8) : 0);
      for (let i = 0; i < COUNT; i++) {
        const ix = i * 3;
        let x = start[ix] + (target[ix] - start[ix]) * conv;
        let y = start[ix + 1] + (target[ix + 1] - start[ix + 1]) * conv;
        let z = start[ix + 2] + (target[ix + 2] - start[ix + 2]) * conv;
        if (warp > 0) {
          const m = 1 + warp * 7;
          x *= m;
          y *= m;
          z = z * m + warp * 55;
        }
        pos[ix] = x;
        pos[ix + 1] = y;
        pos[ix + 2] = z;
      }
      geo.attributes.position.needsUpdate = true;
      points.rotation.y = e * 0.16;
      points.rotation.x = Math.sin(e * 0.2) * 0.08;

      const pulse = 1 + Math.sin(e * 4) * 0.06;
      const cs = conv * 4.2 * pulse * (1 - warp);
      core.scale.set(cs, cs, 1);
      coreMat.opacity = Math.max(0, conv * 0.85 * (1 - warp));

      camera.position.z = 16 - easeOut(Math.min(1, e / 3)) * 6 - warp * 9;
      mat.opacity = 0.95 * (1 - warp * 0.85);

      renderer.render(scene, camera);
      if (e >= DURATION) return finish();
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tWord);
      window.clearTimeout(tTag);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      geo.dispose();
      mat.dispose();
      coreMat.dispose();
      glow.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [onDone]);

  const wordVisible = phase >= 1 && phase < 3;
  const tagVisible = phase >= 2 && phase < 3;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#03070a]">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
          animate={{
            opacity: wordVisible ? 1 : 0,
            y: wordVisible ? 0 : 14,
            filter: wordVisible ? "blur(0px)" : "blur(8px)",
          }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="text-6xl font-black tracking-tight sm:text-8xl"
        >
          <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(52,211,153,0.5)]">
            ACKRATE
          </span>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: tagVisible ? 1 : 0, y: tagVisible ? 0 : 10 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mt-4 text-[11px] font-medium tracking-[0.34em] text-emerald-100/70 sm:text-sm"
        >
          AGENT PAYMENTS, ENFORCED ON-CHAIN
        </motion.p>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: phase < 3 ? 1 : 0 }}
        transition={{ delay: 1.3, duration: 0.6 }}
        className="pointer-events-none absolute inset-x-0 bottom-7 text-center text-[10px] tracking-[0.25em] text-emerald-100/35"
      >
        CLICK OR PRESS ANY KEY TO SKIP
      </motion.div>
    </div>
  );
}
