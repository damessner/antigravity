"use client";

import React from "react";
import { 
  Plus, RefreshCw, FileSpreadsheet, Eye, EyeOff, Settings2 
} from "lucide-react";
import { SchoolClass, Subject } from "@/types";

interface GradebookHeaderProps {
  classes: SchoolClass[];
  selectedClassId: number;
  setSelectedClassId: (id: number) => void;
  subjects: Subject[];
  selectedSubject: Subject | null;
  onSubjectSelect: (subject: Subject) => void;
  onAddSubject: () => void;
  onAddCategory: () => void;
  onToggleProjection: () => void;
  onToggleWeighting: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenRankConfig?: () => void;
  onOpenWizard?: () => void;
  isLoading: boolean;
  refetch: () => void;
  isOwner: boolean;
}

export function GradebookHeader({
  classes,
  selectedClassId,
  setSelectedClassId,
  subjects,
  selectedSubject,
  onSubjectSelect,
  onAddSubject,
  onAddCategory,
  onToggleProjection,
  onToggleWeighting,
  onExport,
  onImport,
  onOpenRankConfig,
  onOpenWizard,
  isLoading,
  refetch,
  isOwner
}: GradebookHeaderProps) {
  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 text-white text-xs font-bold rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all cursor-pointer"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>Klasse {c.name}</option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/50 rounded-xl border border-slate-800/50">
            {subjects.map((s) => (
              <button
                key={s.id}
                onClick={() => onSubjectSelect(s)}
                className={`px-3 py-2 rounded-lg text-[11px] font-bold transition-all touch-manipulation ${
                  selectedSubject?.id === s.id
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                {s.abbreviation}
              </button>
            ))}
            <button
              onClick={onAddSubject}
              className="p-2 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition-all touch-manipulation"
              title="Neues Fach registrieren"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedSubject && isOwner && (
            <>
              <button
                onClick={onToggleWeighting}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-2 rounded-xl text-xs font-medium transition-all"
              >
                <Settings2 className="w-4 h-4 text-amber-500" />
                <span>Gewichtung</span>
              </button>

              <button
                onClick={onToggleProjection}
                className={`flex items-center gap-2 border px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  selectedSubject.projection_visible
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {selectedSubject.projection_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                <span>Projektion: {selectedSubject.projection_visible ? "An" : "Aus"}</span>
              </button>

              {onOpenRankConfig && (
                <button
                  onClick={onOpenRankConfig}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                  title="Rang-Namen und -Symbole anpassen"
                >
                  <span>🏆</span>
                  <span>Ränge</span>
                </button>
              )}

              {onOpenWizard && (
                <button
                  onClick={onOpenWizard}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 px-3 py-2 rounded-xl text-xs font-medium transition-all"
                  title="Bewertungs-Wizard öffnen"
                >
                  <span>🪄</span>
                  <span>Wizard</span>
                </button>
              )}

              <button
                onClick={onAddCategory}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Bereich</span>
              </button>
            </>
          )}

          <div className="w-px h-6 bg-slate-800 mx-1" />

          <button
            onClick={refetch}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="Matrix synchronisieren"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={onExport}
            className="flex items-center gap-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            title="Offizielles Notenblatt generieren 🎓"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Offizielles Notenblatt generieren 🎓</span>
          </button>

          <button
            onClick={onImport}
            className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
            title="Excel Import"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

        </div>
      </div>
    </div>
  );
}
