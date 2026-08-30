"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = "ackrate_theme";

function applyTheme(preference: ThemePreference) {
  const dark = preference === "dark" || (
    preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = preference;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export default function ThemeToggle({ home = false }: { home?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const initial: ThemePreference = saved === "light" || saved === "dark" ? saved : "system";
    setPreference(initial);
    applyTheme(initial);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      if ((localStorage.getItem(THEME_KEY) ?? "system") === "system") applyTheme("system");
    };
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  const choose = (next: ThemePreference) => {
    setPreference(next);
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  };

  return (
    <label className={`relative inline-flex shrink-0 items-center rounded-full border ${
      home
        ? "border-[#151914]/15 bg-white/45 text-[#151914] dark:border-white/15 dark:bg-white/[0.06] dark:text-[#f4f2ec]"
        : "border-white/10 bg-white/[0.03] text-white/70"
    }`}>
      <span className="sr-only">Color theme</span>
      <span className="pointer-events-none absolute left-2.5" aria-hidden>
        {preference === "light" ? <Sun className="h-3.5 w-3.5" /> : preference === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
      </span>
      <select
        aria-label="Color theme"
        value={preference}
        onChange={(event) => choose(event.target.value as ThemePreference)}
        className="h-8 cursor-pointer appearance-none bg-transparent py-0 pl-8 pr-3 text-[11px] font-bold outline-none"
      >
        <option value="system">Auto</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
