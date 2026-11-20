'use client';

import React, { createContext, useContext } from 'react';
import { SettingsProvider, useSettings } from 'gov-layout';

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeContextType {
  theme: Theme;
  actualTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function ThemeBridge({ children }: { children: React.ReactNode }) {
  const { theme, setTheme: setGovTheme, toggleTheme } = useSettings();

  const setTheme = (next: Theme) => {
    if (next === 'system') {
      const prefersDark =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      setGovTheme(prefersDark ? 'dark' : 'light');
      return;
    }
    setGovTheme(next);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        actualTheme: theme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider themeStorageKey="japjong-theme" fontSizeStorageKey="japjong-font-size">
      <ThemeBridge>{children}</ThemeBridge>
    </SettingsProvider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: 'light' as Theme,
      actualTheme: 'light' as const,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
}
