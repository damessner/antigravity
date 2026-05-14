"use client";

import { useState } from "react";
import { AlertTriangle, Send } from "lucide-react";

interface TimeOutModalProps {
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}

export default function TimeOutModal({ onConfirm, onCancel }: TimeOutModalProps) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) {
      setError(true);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md glass-modal border-rose-500/30 p-6 relative bg-gradient-to-b from-slate-900 to-rose-950/20 shadow-2xl">
        {/* Header Alert section */}
        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0 text-rose-400 mt-0.5 animate-pulse">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">TimeOut Zuweisung</h3>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Für die Verweisung in den TimeOut-Raum ist eine Begründung zwingend erforderlich. Es wird automatisch ein
              negativer Verhaltenseintrag im Systemdokumentationslog hinterlegt.
            </p>
          </div>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Begründung des Vorfalls <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (error) setError(false);
              }}
              placeholder="Schildern Sie kurz das störende Verhalten..."
              className={`w-full bg-slate-950 border rounded-xl p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none transition-colors ${
                error ? "border-rose-500 focus:ring-1 focus:ring-rose-500" : "border-slate-800 focus:border-rose-500"
              }`}
              autoFocus
            />
            {error && (
              <p className="text-[11px] text-rose-400 mt-1 font-medium">Bitte geben Sie eine gültige Begründung ein.</p>
            )}
          </div>

          {/* Action Row Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium py-2.5 rounded-xl transition-colors text-center"
            >
              Abbrechen
            </button>

            <button
              type="submit"
              className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium py-2.5 rounded-xl transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Verweisen & Eintragen</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
