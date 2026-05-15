"use client";

import React from "react";
import { Smile, Meh, Frown, Bot } from "lucide-react";
import { Pupil } from "@/types";

interface NoteFilterProps {
  selectedPupilId: number | "all";
  classPupils: Pupil[];
  sentimentFilter: string;
  setSentimentFilter: (val: any) => void;
}

export function NoteFilter({
  selectedPupilId,
  classPupils,
  sentimentFilter,
  setSentimentFilter,
}: NoteFilterProps) {
  const filters = [
    { id: "all", label: "Alle" },
    { id: "positive", label: "Positiv", icon: Smile, color: "text-emerald-400" },
    { id: "neutral", label: "Neutral", icon: Meh, color: "text-slate-400" },
    { id: "negative", label: "Negativ", icon: Frown, color: "text-rose-400" },
    { id: "auto", label: "System-Auto", icon: Bot, color: "text-cyan-400" },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800 shrink-0">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span>Disziplinäre & Verhaltensdokumentation</span>
          {selectedPupilId !== "all" && (
            <span className="text-amber-400 font-mono text-xs">
              ({classPupils.find((p) => p.id === selectedPupilId)?.name})
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">Filtern und Erfassen von Beobachtungen in Echtzeit</p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
        {filters.map((pill) => {
          const IconComponent = pill.icon;
          const isActive = sentimentFilter === pill.id;

          return (
            <button
              key={pill.id}
              onClick={() => setSentimentFilter(pill.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                isActive
                  ? "bg-slate-800 text-white border-slate-700 shadow-xs"
                  : "bg-slate-950 text-slate-500 border-transparent hover:text-slate-300"
              }`}
            >
              {IconComponent && <IconComponent className={`w-3 h-3 ${pill.color}`} />}
              <span>{pill.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
