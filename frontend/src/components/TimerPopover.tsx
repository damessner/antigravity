"use client";

import { useState } from "react";
import { Socket } from "socket.io-client";
import { Clock, RotateCcw, Check } from "lucide-react";
import { Pupil } from "./TeacherDashboard";

interface TimerPopoverProps {
  pupil: Pupil;
  onClose: () => void;
  socket: Socket | null;
}

export default function TimerPopover({ pupil, onClose, socket }: TimerPopoverProps) {
  const [minutes, setMinutes] = useState<number | "">(pupil.timer_minutes || 10);

  const handleSetTimer = (mins: number | null) => {
    if (!socket) return;
    socket.emit("set_pupil_timer", {
      pupilId: pupil.id,
      timer_minutes: mins,
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(minutes);
    if (parsed > 0) {
      handleSetTimer(parsed);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xs glass-modal p-5 relative">
        {/* Header Title */}
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-800">
          <Clock className="w-4 h-4 text-indigo-400" />
          <div>
            <h3 className="text-xs font-bold text-white">Aufenthaltsdauer</h3>
            <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{pupil.name}</p>
          </div>
        </div>

        {/* Presets Grid Section 8 */}
        <div className="mb-4">
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Schnellauswahl:
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[5, 10, 15, 20].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSetTimer(preset)}
                className="bg-slate-950 hover:bg-indigo-950 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-300 text-xs font-bold py-1.5 rounded-lg transition-colors text-center"
              >
                +{preset}m
              </button>
            ))}
          </div>
        </div>

        {/* Custom Submission Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Benutzerdefiniert (Minuten):
            </label>
            <input
              type="number"
              min="1"
              max="180"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="Minuten eingeben"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 text-center font-mono font-bold"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => handleSetTimer(null)}
              className="flex-1 bg-slate-950 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900/50 text-slate-400 hover:text-rose-400 text-xs font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Löschen</span>
            </button>

            <button
              type="submit"
              disabled={minutes === "" || Number(minutes) <= 0}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 rounded-lg transition-colors disabled:opacity-40 flex items-center justify-center gap-1 shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Starten</span>
            </button>
          </div>
        </form>

        {/* Cancel background trigger button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 text-xs font-bold p-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
