"use client";

import { useState } from "react";
import { MessageSquare, Save } from "lucide-react";

interface PupilCommentModalProps {
  pupilName: string;
  initialComment: string;
  onClose: () => void;
  onSave: (comment: string) => void;
}

export default function PupilCommentModal({
  pupilName,
  initialComment,
  onClose,
  onSave,
}: PupilCommentModalProps) {
  const [comment, setComment] = useState(initialComment);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md glass-modal p-5 relative">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800">
          <MessageSquare className="w-4 h-4 text-indigo-400" />
          <div>
            <h3 className="text-xs font-bold text-white">Schüler-Kommentar</h3>
            <p className="text-[10px] text-slate-400 truncate max-w-[260px]">{pupilName}</p>
          </div>
        </div>

        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Notiz / Aufgabe:
        </label>
        <textarea
          rows={5}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Kommentar oder Aufgabe hier eintragen..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
          autoFocus
        />

        <div className="flex items-center gap-2 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium py-2 rounded-lg transition-colors"
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={() => onSave(comment)}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Speichern</span>
          </button>
        </div>
      </div>
    </div>
  );
}
