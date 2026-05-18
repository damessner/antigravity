"use client";

import React, { useState } from "react";
import { X, Calendar, FileText, Check, Trash2 } from "lucide-react";
import { getApiUrl } from "@/utils/apiDiscovery";

const REPORT_PERIODS = [
  { value: "", label: "— Kein Berichtszeitraum —" },
  { value: "elternsprechtag1", label: "1. Elternsprechtag" },
  { value: "semesternachricht", label: "Semesternachricht" },
  { value: "elternsprechtag2", label: "2. Elternsprechtag" },
  { value: "jahreszeugnis", label: "Jahreszeugnis" },
];

interface EditAssessmentModalProps {
  assessmentId?: number;
  categoryId: number;
  oldName: string;
  initialName?: string;
  initialInfoText?: string;
  initialDeadline?: string | null;
  initialReportPeriod?: string | null;
  onClose: () => void;
  onSaved: (updatedMeta: { id?: number; name: string; info_text: string; deadline: string | null; report_period: string | null }) => void;
}

export default function EditAssessmentModal({
  assessmentId,
  categoryId,
  oldName,
  initialName,
  initialInfoText,
  initialDeadline,
  initialReportPeriod,
  onClose,
  onSaved
}: EditAssessmentModalProps) {
  const [name, setName] = useState(initialName || oldName || "");
  const [infoText, setInfoText] = useState(initialInfoText || "");
  const [reportPeriod, setReportPeriod] = useState<string>(initialReportPeriod || "");
  const [deadline, setDeadline] = useState<string>(() => {
    if (!initialDeadline) return "";
    try {
      const d = new Date(initialDeadline);
      if (isNaN(d.getTime())) return "";
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return "";
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Der Name der Bewertung darf nicht leer sein.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const token = localStorage.getItem("token") || "";
      
      // Use numeric id if available, fallback to 0 to trigger composite upsert logic
      const targetId = assessmentId && assessmentId > 0 ? assessmentId : 0;
      
      const payload = {
        category_id: categoryId,
        old_name: oldName,
        name: name.trim(),
        info_text: infoText.trim() || null,
        report_period: reportPeriod || null,
        deadline: deadline
          ? (() => {
              const [year, month, day] = deadline.split("-").map(Number);
              return new Date(year, month - 1, day, 23, 59, 0).toISOString();
            })()
          : null
      };

      const res = await fetch(`${apiUrl}/api/assessments/${targetId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fehler beim Speichern der Spalten-Metadaten");
      }

      const savedData = await res.json();
      onSaved({
        id: savedData.id,
        name: savedData.name,
        info_text: savedData.info_text || "",
        deadline: savedData.deadline || null,
        report_period: savedData.report_period || null
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Netzwerkfehler beim Aktualisieren.");
      setLoading(false);
    }
  };

  const handleClearDeadline = () => {
    setDeadline("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/70 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Spalte bearbeiten</h3>
              <p className="text-xs text-slate-400">Eigenschaften &amp; Fristen anpassen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} className="p-6 flex-1 flex flex-col gap-4.5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Name Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Bezeichnung der Bewertung *</span>
              <span className="text-slate-500 font-normal">Wird im Matrix-Header angezeigt</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Vokabeltest 1"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-hidden focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Report Period Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Berichtszeitraum
            </label>
            <select
              value={reportPeriod}
              onChange={(e) => setReportPeriod(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-hidden focus:border-amber-500 transition-colors"
            >
              {REPORT_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              Berichtszeitraum-Zuordnung ermöglicht die Filterung in der Notenmatrix.
            </p>
          </div>

          {/* Description Textarea */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Zusätzliche Informationen / Instruktionen</span>
              <span className="text-slate-500 font-normal">Optional</span>
            </label>
            <textarea
              value={infoText}
              onChange={(e) => setInfoText(e.target.value)}
              placeholder="z.B. Lese Buch Seiten 12-15; Vorbereitung auf Schularbeit..."
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-hidden focus:border-amber-500 transition-colors resize-none"
            />
          </div>

          {/* Deadline Date Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Abgabefrist (Deadline)</span>
              {deadline && (
                <button
                  type="button"
                  onClick={handleClearDeadline}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Frist entfernen
                </button>
              )}
            </label>
            <div className="relative flex items-center">
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white focus:outline-hidden focus:border-amber-500 transition-colors cursor-pointer style-scheme-dark"
              />
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500">
              Fristen werden automatisch auf 23:59 gesetzt und im Lernplaner der Schüler angezeigt.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-3 mt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/10 flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  Speichere...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[2.5]" /> Änderungen speichern
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
