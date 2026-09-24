"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

function updateBrowserColor(dark: boolean) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101010" : "#ffffff");
}

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next = document.documentElement.dataset.theme === "dark";
      updateBrowserColor(next);
      setDark(next);
    };
    const followSystem = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem("reapp-theme"); } catch { /* Storage is optional. */ }
      if (saved !== "dark" && saved !== "light") {
        document.documentElement.dataset.theme = media.matches ? "dark" : "light";
      }
      sync();
    };
    const followStorage = (event: StorageEvent) => {
      if (event.key !== "reapp-theme") return;
      document.documentElement.dataset.theme = event.newValue === "dark" || event.newValue === "light"
        ? event.newValue : media.matches ? "dark" : "light";
      sync();
    };
    sync();
    media.addEventListener("change", followSystem);
    window.addEventListener("storage", followStorage);
    return () => {
      media.removeEventListener("change", followSystem);
      window.removeEventListener("storage", followStorage);
    };
  }, []);

  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return <button className="theme-toggle" type="button" aria-label={label} title={label} onClick={() => {
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("reapp-theme", theme); } catch { /* Keep the theme usable without storage. */ }
    updateBrowserColor(!dark);
    setDark(!dark);
  }}><Sun className="theme-sun" size={18} aria-hidden="true" /><Moon className="theme-moon" size={18} aria-hidden="true" /></button>;
}
