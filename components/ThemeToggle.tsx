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

  const next: ThemePreference = preference === "system" ? "light" : preference === "light" ? "dark" : "system";
  const names = { system: "Auto", light: "Light", dark: "Dark" };
  const label = `Theme: ${names[preference]}. Switch to ${names[next]}`;
  const Icon = preference === "system" ? Monitor : preference === "light" ? Sun : Moon;
  return (
    <button type="button" aria-label={label} title={label} onClick={() => choose(next)}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
        home
          ? "border-[#151914]/15 bg-white/45 text-[#151914] dark:border-white/15 dark:bg-white/[0.06] dark:text-[#f4f2ec]"
          : "border-white/10 bg-white/[0.03] text-white/70"
      }`}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
