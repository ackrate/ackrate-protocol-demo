"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

// Client-only: the WebGL scene must never run during SSR.
const Intro = dynamic(() => import("./Intro"), { ssr: false });

const SEEN_KEY = "reapp_intro_seen_v1";

export default function IntroGate() {
  const path = usePathname();
  // Default true so the overlay covers the page from first paint (no flash on
  // the first visit). On repeat visits this session, the effect hides it fast.
  const [show, setShow] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) setShow(false);
      else sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* sessionStorage unavailable: just play it */
    }
  }, []);

  if (path.startsWith("/wallet")) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="reapp-intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] bg-[#03070a]"
        >
          <Intro onDone={() => setShow(false)} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
