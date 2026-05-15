"use client";

import React from "react";
import { Pupil, SchoolClass } from "@/types";

interface NoteSidebarProps {
  classes: SchoolClass[];
  selectedClassId: number;
  setSelectedClassId: (id: number) => void;
  selectedPupilId: number | "all";
  setSelectedPupilId: (id: number | "all") => void;
  classPupils: Pupil[];
  pupilCounters: Record<number, { pos: number; neu: number; neg: number }>;
}

export function NoteSidebar({
  classes,
  selectedClassId,
  setSelectedClassId,
  selectedPupilId,
  setSelectedPupilId,
  classPupils,
  pupilCounters,
}: NoteSidebarProps) {
  return (
    <aside className="w-64 bg-slate-900/60 border-r border-slate-800 p-4 shrink-0 flex flex-col gap-3 overflow-y-auto">
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
          Klassen-Auswahl
        </label>
        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(Number(e.target.value))}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs font-bold text-amber-400 focus:outline-none focus:border-amber-500"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              Klasse {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="h-px bg-slate-800/80 my-1" />

      <button
        onClick={() => setSelectedPupilId("all")}
        className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between ${
          selectedPupilId === "all"
            ? "bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold"
            : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
        }`}
      >
        <span>👥 Alle Schüler der Klasse</span>
        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-950 text-slate-500 font-mono">
          {classPupils.length}
        </span>
      </button>

      <div className="space-y-1.5 flex-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block px-1 pt-1">
          Schüler-Akte
        </span>
        {classPupils.map((p) => {
          const isSelected = selectedPupilId === p.id;
          const cnts = pupilCounters[p.id] || { pos: 0, neu: 0, neg: 0 };

          return (
            <button
              key={p.id}
              onClick={() => setSelectedPupilId(p.id)}
              className={`w-full p-2.5 rounded-xl text-left transition-all border ${
                isSelected
                  ? "bg-amber-500/15 text-white border-amber-500/40 shadow-xs"
                  : "bg-slate-950/40 border-slate-900 text-slate-300 hover:border-slate-800"
              }`}
            >
              <span className="font-bold text-xs truncate block">{p.name}</span>

              <div className="flex items-center gap-1 mt-1.5">
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                    cnts.pos > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-950 text-slate-600"
                  }`}
                  title="Positive Einträge"
                >
                  +{cnts.pos}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                    cnts.neu > 0 ? "bg-slate-800 text-slate-300 border border-slate-700" : "bg-slate-950 text-slate-600"
                  }`}
                  title="Neutrale Bemerkungen"
                >
                  •{cnts.neu}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                    cnts.neg > 0 ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse" : "bg-slate-950 text-slate-600"
                  }`}
                  title="Negative Disziplinarvermerke"
                >
                  -{cnts.neg}
                </span>
              </div>
            </button>
          );
        })}

        {classPupils.length === 0 && (
          <p className="text-[11px] text-slate-600 italic text-center pt-4">Keine Schüler in der Auswahl</p>
        )}
      </div>
    </aside>
  );
}
