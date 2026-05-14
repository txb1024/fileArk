import { useState, useEffect } from "react";
import type { AccentColor, Language, ThemeMode } from "../types";
import { storage } from "../utils";

/**
 * 主题设置 hook
 */
export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    storage.get("archive.theme", "light" as ThemeMode)
  );
  const [accentColor, setAccentColor] = useState<AccentColor>(() =>
    storage.get("archive.accent", "teal" as AccentColor)
  );

  useEffect(() => {
    storage.set("archive.theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    storage.set("archive.accent", accentColor);
  }, [accentColor]);

  const toggleTheme = () => setThemeMode((prev) => (prev === "light" ? "dark" : "light"));

  return {
    themeMode,
    setThemeMode,
    accentColor,
    setAccentColor,
    toggleTheme
  };
}

/**
 * 语言设置 hook
 */
export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() =>
    storage.get("archive.language", "zh" as Language)
  );

  useEffect(() => {
    storage.set("archive.language", language);
  }, [language]);

  return { language, setLanguage };
}
