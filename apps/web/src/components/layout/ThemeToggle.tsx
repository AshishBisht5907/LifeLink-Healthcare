'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'lifelink-theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const enabled = saved ? saved === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', enabled);
    setDark(enabled);
    setReady(true);
  }, []);

  function toggleTheme() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={ready ? (dark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle color theme'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="theme-toggle fixed bottom-4 right-4 z-[70] inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface/90 px-3.5 text-sm font-semibold text-foreground shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-offset-4"
    >
      {dark ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-brand" />}
      <span className="hidden sm:inline">{dark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
