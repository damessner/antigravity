"use client";

import React from "react";
import { Eye, EyeOff, Trash2, Bot } from "lucide-react";
import { Note, Pupil, User } from "@/types";

const EMOJI_POOLS: Record<string, string[]> = {
  positive: ["😊", "⭐", "👍", "🏆", "🌟", "✅", "💪", "🎉"],
  neutral:  ["📝", "💬", "🔔", "📌", "🗒️", "💡", "📋", "ℹ️"],
  negative: ["⚠️", "🚨", "❌", "🔴", "😔", "📛", "🛑", "👎"],
};

const getSentimentEmoji = (sentiment: string, noteId: number): string => {
  const pool = EMOJI_POOLS[sentiment] ?? EMOJI_POOLS.neutral;
  return pool[noteId % pool.length];
};

interface NoteItemProps {
  note: Note;
  pupilName: string;
  currentUser: User | null;
  handleToggleVisibility: (id: number) => void;
  handleDeleteNote: (id: number) => void;
}

export function NoteItem({
  note,
  pupilName,
  currentUser,
  handleToggleVisibility,
  handleDeleteNote,
}: NoteItemProps) {
  const isAuto = note.auto_source !== null && note.auto_source !== undefined;
  
  let borderStyle = "border-slate-800 bg-slate-900/60";
  let badgeStyle = "bg-slate-800 text-slate-400";

  if (note.sentiment === "positive") {
    borderStyle = "border-emerald-500/30 bg-emerald-950/10";
    badgeStyle = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
  } else if (note.sentiment === "negative") {
    borderStyle = "border-rose-500/30 bg-rose-950/10";
    badgeStyle = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
  }

  const sentimentEmoji = getSentimentEmoji(note.sentiment || "neutral", Number(note.id));

  if (isAuto) {
    borderStyle += " border-l-4 border-l-cyan-500";
  }

  const timestampDe = new Date(note.created_at).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const canEdit = currentUser?.role === "admin" || Number(note.teacher_id) === Number(currentUser?.id);

  return (
    <div className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 ${borderStyle}`}>
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-xs text-white">{pupilName}</span>
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${badgeStyle}`}>
            <span className="text-[11px]">{sentimentEmoji}</span>
            <span className="capitalize">{note.sentiment}</span>
          </span>

          {isAuto && (
            <span
              className="px-2 py-0.5 rounded text-[9px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1"
              title="System-generierter Nachweisvermerk (automatisch synchronisiert)"
            >
              <Bot className="w-2.5 h-2.5" /> Auto-Log
            </span>
          )}
        </div>

        <span className="text-[10px] font-mono text-slate-500 shrink-0">{timestampDe}</span>
      </div>

      <p className="text-xs text-slate-200 leading-relaxed font-normal whitespace-pre-wrap pl-1">
        {note.note_text}
      </p>

      <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-800/40 text-[10px] text-slate-500">
        <div className="flex items-center gap-3">
          <span>Von: {note.teacher_name || "Lehrperson"}</span>
          <span className="flex items-center gap-1">
            {note.is_visible_to_pupil ? (
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <Eye className="w-3 h-3" /> Sichtbar für Schüler
              </span>
            ) : (
              <span className="text-slate-600 flex items-center gap-1">
                <EyeOff className="w-3 h-3" /> Privat (nur Lehrer)
              </span>
            )}
          </span>
        </div>

        {currentUser?.role !== "pupil" && (
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => handleToggleVisibility(note.id)}
                className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Sichtbarkeitsstatus umschalten"
              >
                Sichtbarkeit umschalten
              </button>
            )}

            <button
              onClick={() => handleDeleteNote(note.id)}
              disabled={isAuto || !canEdit}
              className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-slate-950 transition-colors disabled:opacity-30 disabled:hover:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              title={isAuto ? "Automatische Systemaudits können nicht gelöscht werden" : "Eintrag löschen"}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface NoteListProps {
  filteredNotes: Note[];
  classPupils: Pupil[];
  currentUser: User | null;
  handleToggleVisibility: (id: number) => void;
  handleDeleteNote: (id: number) => void;
}

export function NoteList({
  filteredNotes,
  classPupils,
  currentUser,
  handleToggleVisibility,
  handleDeleteNote,
}: NoteListProps) {
  return (
    <div className="space-y-3 flex-1">
      {filteredNotes.map((note) => {
        const targetPupil = classPupils.find((p) => Number(p.id) === Number(note.pupil_id));
        const pupilName = targetPupil?.name || `Schüler-ID #${note.pupil_id}`;

        return (
          <NoteItem
            key={note.id}
            note={note}
            pupilName={pupilName}
            currentUser={currentUser}
            handleToggleVisibility={handleToggleVisibility}
            handleDeleteNote={handleDeleteNote}
          />
        );
      })}

      {filteredNotes.length === 0 && (
        <div className="p-8 text-center text-slate-600 border border-dashed border-slate-800 rounded-xl italic">
          Keine entsprechenden Einträge in dieser Ansichtsfilterung gefunden.
        </div>
      )}
    </div>
  );
}
