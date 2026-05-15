"use client";

/**
 * OnboardingTip — lightweight per-page help system.
 *
 * Shows a guided tooltip panel the first time each page is visited.
 * After it has been acknowledged once it collapses to a small (ℹ) icon.
 * Clicking the icon reopens the tip panel.
 *
 * Usage:
 *   <OnboardingTip pageKey="dashboard" title="🏫 Live-Raumbelegung" tips={[...]} />
 *
 * Tips are stored in localStorage so they persist across sessions without
 * any server round-trip — zero performance cost on low-powered hardware.
 */

import { useState, useEffect } from "react";
import { Info, X, ChevronRight } from "lucide-react";

interface OnboardingTipProps {
  /** Unique key per page — used for localStorage tracking */
  pageKey: string;
  /** Short headline shown at the top of the panel */
  title: string;
  /** Array of tip strings (emoji-friendly) */
  tips: string[];
}

const STORAGE_PREFIX = "onboarding_seen_";

export function OnboardingTip({ pageKey, title, tips }: OnboardingTipProps) {
  const storageKey = STORAGE_PREFIX + pageKey;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      setOpen(true); // First visit — show automatically
    }
  }, [storageKey]);

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setOpen(false);
  };

  if (!mounted) return null;

  return (
    <div className="relative inline-block">
      {/* (i) trigger icon — always visible */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Hilfe & Tipps"
        className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 text-slate-400 hover:text-indigo-400 transition-all"
        aria-label="Hilfe anzeigen"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {/* Tip panel */}
      {open && (
        <div
          className="absolute right-0 top-8 z-50 w-72 bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-500/10 p-4 animate-in fade-in slide-in-from-top-2 duration-200"
          role="dialog"
          aria-label={title}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm font-bold text-white leading-tight">{title}</p>
            <button
              type="button"
              onClick={dismiss}
              className="text-slate-500 hover:text-white transition-colors ml-2 shrink-0"
              aria-label="Schließen"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tips list */}
          <ul className="space-y-2">
            {tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                <span className="text-[11px] text-slate-300 leading-relaxed">{tip}</span>
              </li>
            ))}
          </ul>

          {/* Dismiss footer */}
          <button
            type="button"
            onClick={dismiss}
            className="mt-4 w-full text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl py-1.5 transition-all"
          >
            Verstanden — nicht mehr anzeigen ✓
          </button>
        </div>
      )}
    </div>
  );
}
