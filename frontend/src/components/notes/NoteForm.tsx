"use client";

import React from "react";
import { MessageSquarePlus, Smile, Meh, Frown } from "lucide-react";
import { Pupil } from "@/types";

interface NoteFormProps {
  selectedPupilId: number | "all";
  setSelectedPupilId: (id: number | "all") => void;
  classPupils: Pupil[];
  newNoteText: string;
  setNewNoteText: (val: string) => void;
  newSentiment: "positive" | "neutral" | "negative";
  setNewSentiment: (val: "positive" | "neutral" | "negative") => void;
  newNoteVisible: boolean;
  setNewNoteVisible: (val: boolean) => void;
  handleCreateNote: (e: React.FormEvent) => void;
}

export function NoteForm({
  selectedPupilId,
  setSelectedPupilId,
  classPupils,
  newNoteText,
  setNewNoteText,
  newSentiment,
  setNewSentiment,
  newNoteVisible,
  setNewNoteVisible,
  handleCreateNote,
}: NoteFormProps) {
  return (
    <form onSubmit={handleCreateNote} className="glass-panel p-4 mb-6 shrink-0 border-amber-500/20 bg-gradient-to-b from-slate-900/90 to-amber-950/10">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-bold text-white flex items-center gap-1.5">
          <MessageSquarePlus className="w-4 h-4 text-amber-400" />
          <span>Neuen Vermerk hinterlegen</span>
        </label>

        {selectedPupilId === "all" ? (
          <select
            defaultValue=""
            onChange={(e) => setSelectedPupilId(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 rounded p-1 text-[11px] font-bold text-amber-400 focus:outline-none"
          >
            <option value="" disabled>
              Zielschüler wählen...
            </option>
            {classPupils.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-bold text-amber-300">
            Ziel: {classPupils.find((p) => p.id === selectedPupilId)?.name}
          </span>
        )}
      </div>

      <textarea
        rows={2}
        value={newNoteText}
        onChange={(e) => setNewNoteText(e.target.value)}
        placeholder="Beobachtung oder Vorfall schildern..."
        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
        required
      />

      <div className="flex items-center justify-between gap-3 mt-3 pt-2 border-t border-slate-800/60">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">Einstufung:</span>
            <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => setNewSentiment("positive")}
                className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                  newSentiment === "positive" ? "bg-emerald-500/15 text-emerald-400" : "text-slate-600 hover:text-slate-400"
                }`}
              >
                <Smile className="w-3 h-3" /> Positiv
              </button>
              <button
                type="button"
                onClick={() => setNewSentiment("neutral")}
                className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                  newSentiment === "neutral" ? "bg-slate-800 text-slate-200" : "text-slate-600 hover:text-slate-400"
                }`}
              >
                <Meh className="w-3 h-3" /> Neutral
              </button>
              <button
                type="button"
                onClick={() => setNewSentiment("negative")}
                className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                  newSentiment === "negative" ? "bg-rose-500/15 text-rose-400" : "text-slate-600 hover:text-slate-400"
                }`}
              >
                <Frown className="w-3 h-3" /> Negativ
              </button>
            </div>
          </div>

          <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newNoteVisible}
              onChange={(e) => setNewNoteVisible(e.target.checked)}
              className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <span>Für Schüler sichtbar</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!newNoteText.trim() || (selectedPupilId === "all" && classPupils.length === 0)}
          className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-all shadow-xs disabled:opacity-40"
        >
          Eintragen
        </button>
      </div>
    </form>
  );
}
