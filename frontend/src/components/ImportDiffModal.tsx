import React from "react";
import { ParsedDeltaItem } from "./excelService";
import { AlertCircle, Check, HelpCircle, X, ArrowRight } from "lucide-react";

interface ImportDiffModalProps {
  isOpen: boolean;
  deltas: ParsedDeltaItem[];
  hasOptimisticLockWarning: boolean;
  exportTimestamp: string | null;
  lastMatrixUpdate: string | null;
  onConfirm: (forceOverwrite: boolean) => void;
  onCancel: () => void;
}

export default function ImportDiffModal({
  isOpen,
  deltas,
  hasOptimisticLockWarning,
  exportTimestamp,
  lastMatrixUpdate,
  onConfirm,
  onCancel,
}: ImportDiffModalProps) {
  if (!isOpen) return null;

  // Filter modified valid records versus pure syntax warnings
  const modifiedDeltas = deltas.filter(d => d.isModified || d.validationWarning);

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 font-bold text-xs">
              📥
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Vorschau des Excel-Notenabgleichs</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Verifikation der geänderten Noteneinträge vor endgültiger Datenbankübernahme
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* OPTIMISTIC LOCKING HAZARD BANNER */}
          {hasOptimisticLockWarning && (
            <div className="bg-rose-500/10 border-2 border-rose-500/80 rounded-xl p-4 text-rose-300 shadow-sm animate-pulse">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-rose-400">
                    ⚠️ ACHTUNG: Optimistic Locking Konflikt verzeichnet!
                  </h4>
                  <p className="text-xs mt-1 leading-relaxed text-rose-200/90">
                    Seit dem Herunterladen dieser Offline-Tabelle (Basis-Zeitstempel:{" "}
                    <span className="font-mono font-bold text-white">
                      {exportTimestamp ? new Date(exportTimestamp).toLocaleTimeString() : "unbekannt"}
                    </span>
                    ) wurden bereits neuere Live-Einträge von Kollegen im System verbucht (Letzte Live-Aktivität:{" "}
                    <span className="font-mono font-bold text-white">
                      {lastMatrixUpdate ? new Date(lastMatrixUpdate).toLocaleTimeString() : "kürzlich"}
                    </span>
                    ). Ein blindes Importieren überschreibt diese simultanen Datenstrukturen.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* DELTAS PREVIEW LISTING TABLE */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">
                Erkannte Leistungsänderungen ({modifiedDeltas.length})
              </span>
            </div>

            {modifiedDeltas.length > 0 ? (
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
                      <th className="p-2.5 pl-3">Schüler</th>
                      <th className="p-2.5">Bewertung / Skala</th>
                      <th className="p-2.5 text-center">Bisher</th>
                      <th className="p-2.5 w-6 text-center"></th>
                      <th className="p-2.5 text-center">Excel Neu</th>
                      <th className="p-2.5">Parser Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {modifiedDeltas.map((d, idx) => {
                      const isWarningOnly = !d.isModified && d.validationWarning;
                      const hasSyntaxAlert = d.validationWarning && d.validationWarning.includes("Ungültig");

                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            hasSyntaxAlert
                              ? "bg-amber-500/5 hover:bg-amber-500/10"
                              : isWarningOnly
                              ? "bg-slate-950 hover:bg-slate-900/40"
                              : "bg-slate-950 hover:bg-slate-900/60"
                          }`}
                        >
                          <td className="p-2.5 pl-3 font-bold text-white">{d.pupilName}</td>
                          <td className="p-2.5">
                            <span className="font-medium text-slate-300">{d.assessmentName}</span>
                            <span className="ml-1.5 px-1 py-0.5 rounded bg-slate-900 text-[9px] font-mono text-slate-500 border border-slate-800">
                              {d.scaleType}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-400 font-bold">
                            {d.oldValue || <span className="text-slate-600 italic">leer</span>}
                          </td>
                          <td className="p-2.5 text-center text-slate-600">
                            <ArrowRight className="w-3.5 h-3.5 inline" />
                          </td>
                          <td className="p-2.5 text-center font-mono font-bold text-cyan-400">
                            {d.newValue || <span className="text-slate-600 italic">gelöscht</span>}
                          </td>
                          <td className="p-2.5">
                            {d.validationWarning ? (
                              <span className={`text-[11px] font-medium flex items-center gap-1 ${
                                hasSyntaxAlert ? "text-amber-400 font-bold" : "text-indigo-400"
                              }`}>
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>{d.validationWarning}</span>
                              </span>
                            ) : (
                              <span className="text-emerald-400 text-[11px] font-medium flex items-center gap-1">
                                <Check className="w-3 h-3 shrink-0" />
                                <span>Änderung verifiziert</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-600 border border-slate-800 rounded-xl bg-slate-950 italic">
                Keine Differenzen oder Noten-Modifikationen in der hochgeladenen Excel-Datei verzeichnet.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-bold transition-colors"
          >
            Abbrechen
          </button>

          <div className="flex items-center gap-2">
            {hasOptimisticLockWarning ? (
              <button
                type="button"
                onClick={() => onConfirm(true)}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span>Trotzdem überschreiben</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={modifiedDeltas.length === 0}
                onClick={() => onConfirm(false)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Änderungen synchronisieren</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
