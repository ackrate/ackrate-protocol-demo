"use client";

import { useEffect, useRef, useState } from "react";

type ThemePreference = "auto" | "light" | "dark";
const storageKey = "reapp-theme";
const normalize = (value: string | null): ThemePreference => value === "light" || value === "dark" ? value : "auto";

function applyTheme(preference: ThemePreference) {
  const theme = preference === "auto"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
    : preference;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101010" : "#ffffff");
}

export default function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("auto");

  const current = useRef<ThemePreference>("auto");

  useEffect(() => {
    try { current.current = normalize(localStorage.getItem(storageKey)); } catch { /* Storage is optional. */ }
    setPreference(current.current);
    applyTheme(current.current);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => { if (current.current === "auto") applyTheme(current.current); };
    const followStorage = (event: StorageEvent) => {
      if (event.key !== storageKey && event.key !== null) return;
      current.current = normalize(event.newValue);
      setPreference(current.current);
      applyTheme(current.current);
    };
    media.addEventListener("change", followSystem);
    window.addEventListener("storage", followStorage);
    return () => {
      media.removeEventListener("change", followSystem);
      window.removeEventListener("storage", followStorage);
    };
  }, []);

  return <select className="theme-toggle" aria-label="Color theme" value={preference} onChange={(event) => {
    const next = normalize(event.target.value);
    current.current = next;
    setPreference(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the theme usable without storage. */ }
    applyTheme(next);
  }}>
    <option value="auto">Auto</option>
    <option value="light">Light</option>
    <option value="dark">Dark</option>
  </select>;
}
