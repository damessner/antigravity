"use client";

import { useState, useEffect } from "react";
import { Camera, Download, ChevronDown, ChevronUp, Clock, Users, RefreshCw } from "lucide-react";

export default function LernwerkstattDashboard() {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  const fetchSnapshots = async () => {
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/lernwerkstatt/snapshots?limit=3`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data || []);
      }
    } catch (e) {
      console.error("Lernwerkstatt snapshots synchronization failed:", e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSnapshots();
    }
  }, [isOpen]);

  const handleTakeSnapshot = async () => {
    setIsLoading(true);
    setAlertMsg(null);
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/lernwerkstatt/snapshot`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        await fetchSnapshots();
        setAlertMsg("Manuelle Anwesenheitssicherung erfolgreich.");
      } else {
        const err = await res.json();
        setAlertMsg(err.error || "Sicherung fehlgeschlagen");
      }
    } catch (e) {
      setAlertMsg("Verbindungsfehler beim Erstellen des Snapshots");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportSnapshot = (id: number) => {
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    window.open(`${apiUrl}/api/lernwerkstatt/snapshot/${id}/export?token=${token}`, "_blank");
  };

  // Ensure notification message auto-hides smoothly
  useEffect(() => {
    if (alertMsg) {
      const t = setTimeout(() => setAlertMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertMsg]);

  return (
    <div className="rounded-xl bg-slate-950 border border-cyan-900/30 overflow-hidden transition-all">
      {/* Collapsible toggle trigger header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-cyan-950/20 transition-colors"
      >
        <div className="flex items-center gap-1.5 text-cyan-400">
          <Camera className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[11px] font-bold tracking-wide">Lernwerkstatt Snapshots</span>
        </div>

        <div className="flex items-center gap-1 text-slate-500 text-[10px]">
          <span>{snapshots.length} archiviert</span>
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </div>
      </button>

      {/* Expanded body section Section 8 */}
      {isOpen && (
        <div className="p-2.5 border-t border-slate-900 bg-slate-950/90 space-y-2.5">
          {alertMsg && (
            <p className="text-[10px] text-cyan-300 bg-cyan-950/40 p-1 px-2 rounded border border-cyan-800 text-center font-semibold">
              {alertMsg}
            </p>
          )}

          {/* Trigger button block Section 8 */}
          <button
            type="button"
            onClick={handleTakeSnapshot}
            disabled={isLoading}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
            <span>Manuellen Snapshot auslösen</span>
          </button>

          {/* Render mapping list of recent snapshots Section 8 */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block px-0.5">
              Letzte Speicherungen:
            </span>

            {snapshots.map((snap) => {
              const timeDe = new Date(snap.snapshot_time).toLocaleTimeString("de-DE", {
                hour: "2-digit",
                minute: "2-digit",
              });
              const dateDe = new Date(snap.snapshot_date).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
              });

              const totalCount = Array.isArray(snap.pupil_ids) ? snap.pupil_ids.length : 0;

              return (
                <div
                  key={snap.id}
                  className="bg-slate-900 border border-slate-800/80 p-2 rounded-lg flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-200">
                        {snap.lesson_number || 1}. Stunde
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" /> {timeDe}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 text-[9px] text-slate-400">
                      <span>{dateDe}</span>
                      <span className="flex items-center gap-0.5 text-cyan-400 font-bold font-mono">
                        <Users className="w-2.5 h-2.5" /> {totalCount} Sch.
                      </span>
                    </div>
                  </div>

                  {/* Print export single trigger Section 8 */}
                  <button
                    onClick={() => handleExportSnapshot(snap.id)}
                    className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 rounded border border-slate-800 transition-colors shrink-0"
                    title="Anwesenheitsliste als Drucktext exportieren"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {snapshots.length === 0 && (
              <p className="text-[10px] text-slate-600 italic text-center py-2">
                Bisher keine Live-Belegungs-Snapshots aufgezeichnet.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
