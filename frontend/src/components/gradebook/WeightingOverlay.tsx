"use client";

import React from "react";
import { Lock } from "lucide-react";

interface WeightingOverlayProps {
  categories: any[];
  onWeightChange: (id: number, val: number) => void;
  onToggleLock: (id: number) => void;
  onClose: () => void;
}

export function WeightingOverlay({
  categories,
  onWeightChange,
  onToggleLock,
  onClose
}: WeightingOverlayProps) {
  return (
    <div className="mb-4 bg-slate-900/95 border border-amber-500/40 p-4 rounded-xl shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 relative shrink-0">
      <button 
        onClick={onClose}
        className="absolute top-2.5 right-2.5 text-slate-500 hover:text-slate-300 text-xs font-bold px-1.5 py-0.5 rounded bg-slate-950/60 transition-colors"
        title="Panel einklappen"
      >
        ✕
      </button>

      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-400">⚖️ Weight Balancer (Proportional Auto-Sync)</span>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-400 mr-6">
          Summe: <span className="text-emerald-400">100%</span> verriegelt
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div key={c.id} className={`p-2 rounded-lg border transition-all ${c.isLocked ? "bg-slate-950/30 border-slate-800/80 opacity-60" : "bg-slate-950 border-slate-800"}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-medium text-slate-300 truncate flex-1" title={c.name}>
                {c.name}
              </span>
              
              <button
                type="button"
                onClick={() => onToggleLock(c.id)}
                className={`p-0.5 rounded transition-colors ${c.isLocked ? "text-amber-400 bg-amber-500/10" : "text-slate-600 hover:text-slate-400"}`}
                title={c.isLocked ? "Gesperrt (Ausgeschlossen vom Auto-Balancing)" : "Klick zum Sperren der Gewichtung"}
              >
                <Lock className="w-2.5 h-2.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                value={c.weight_percentage}
                disabled={c.isLocked}
                onChange={(e) => onWeightChange(c.id, Number(e.target.value))}
                className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <div className="flex items-center gap-0.5 w-11 justify-end shrink-0">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={c.weight_percentage}
                  disabled={c.isLocked}
                  onChange={(e) => onWeightChange(c.id, Number(e.target.value))}
                  className="w-7 bg-transparent text-right font-mono text-[11px] font-bold text-amber-400 focus:outline-none disabled:opacity-50"
                />
                <span className="text-[9px] text-slate-500 font-mono">%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
