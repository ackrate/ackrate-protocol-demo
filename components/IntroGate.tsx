"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";

// Client-only: the WebGL scene must never run during SSR.
const Intro = dynamic(() => import("./Intro"), { ssr: false });

const SEEN_KEY = "ackrate_intro_seen_v1";
const SEEN_COOKIE = "ackrate_intro_seen";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function rememberIntro() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* localStorage unavailable */
  }
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* sessionStorage unavailable */
  }
  document.cookie = `${SEEN_COOKIE}=1; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

function hasSeenIntro() {
  let stored = false;
  try {
    stored = localStorage.getItem(SEEN_KEY) === "1" || sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    /* browser storage unavailable */
  }
  const cookie = document.cookie.split(";").some((value) => value.trim() === `${SEEN_COOKIE}=1`);
  return stored || cookie;
}

export default function IntroGate() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (hasSeenIntro()) {
      // Keep both durable stores in sync if either one survived.
      rememberIntro();
      return;
    }
    setShow(true);
  }, []);

  const finish = () => {
    rememberIntro();
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="ackrate-intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] bg-[#03070a]"
        >
          <Intro onDone={finish} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
