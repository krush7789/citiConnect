import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "citiconnect_theme";
const DARK_THEME = "dark";
const LIGHT_THEME = "light";

const readStoredTheme = () => {
  if (typeof window === "undefined") return LIGHT_THEME;
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === DARK_THEME || storedTheme === LIGHT_THEME) return storedTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? DARK_THEME : LIGHT_THEME;
};

const applyThemeToDocument = (theme) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark = theme === DARK_THEME;
  root.classList.toggle(DARK_THEME, isDark);
  root.style.colorScheme = isDark ? DARK_THEME : LIGHT_THEME;
};

const initialTheme = readStoredTheme();
applyThemeToDocument(initialTheme);

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(initialTheme);

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  const setDarkMode = useCallback((enabled) => {
    setTheme(enabled ? DARK_THEME : LIGHT_THEME);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME));
  }, []);

  const contextValue = useMemo(
    () => ({
      theme,
      isDarkMode: theme === DARK_THEME,
      setTheme,
      setDarkMode,
      toggleDarkMode,
    }),
    [theme, setDarkMode, toggleDarkMode]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

