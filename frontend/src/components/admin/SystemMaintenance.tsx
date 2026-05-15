"use client";

import { Download, Upload, AlertTriangle, RefreshCw } from "lucide-react";

interface SystemMaintenanceProps {
  handleDownloadBackup: (type: "full" | "gradebooks" | "notes") => void;
  selectedRestoreFile: File | null;
  setSelectedRestoreFile: (file: File | null) => void;
  restoreConfirmText: string;
  setRestoreConfirmText: (text: string) => void;
  handleRestoreBackup: (e: React.FormEvent) => void;
  serverRestoreFile: string | null;
  setServerRestoreFile: (file: string | null) => void;
  serverRestoreConfirm: string;
  setServerRestoreConfirm: (text: string) => void;
  handleRestoreServerFile: (e: React.FormEvent) => void;
  isLoading: boolean;
  savedBackups: any[];
  loadSavedBackups: () => void;
  // New System Update Props
  systemStatus: { isPending: boolean; lastLog: string } | null;
  handleTriggerUpdate: () => void;
}


export function SystemMaintenance({
  handleDownloadBackup,
  selectedRestoreFile,
  setSelectedRestoreFile,
  restoreConfirmText,
  setRestoreConfirmText,
  handleRestoreBackup,
  serverRestoreFile,
  setServerRestoreFile,
  serverRestoreConfirm,
  setServerRestoreConfirm,
  handleRestoreServerFile,
  isLoading,
  savedBackups,
  loadSavedBackups,
  systemStatus,
  handleTriggerUpdate
}: SystemMaintenanceProps) {

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <Download className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Datensicherung</h3>
              <p className="text-[11px] text-slate-500">Gesamte Datenbank als JSON herunterladen</p>
            </div>
          </div>
          <div className="space-y-2 mt-auto">
            <button
              onClick={() => handleDownloadBackup("full")}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl transition-all border border-slate-700 text-sm"
            >
              Vollständiges Backup (.json)
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleDownloadBackup("gradebooks")}
                className="bg-slate-950 hover:bg-slate-900 text-slate-400 text-[10px] py-1.5 rounded-lg border border-slate-800 transition-colors"
              >
                Nur Notenbücher
              </button>
              <button
                onClick={() => handleDownloadBackup("notes")}
                className="bg-slate-950 hover:bg-slate-900 text-slate-400 text-[10px] py-1.5 rounded-lg border border-slate-800 transition-colors"
              >
                Nur Verhaltenslogs
              </button>
            </div>
          </div>
        </div>

        {/* Client-Side Restore Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col gap-4 border-rose-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/10 rounded-xl">
              <Upload className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Manuelle Wiederherstellung</h3>
              <p className="text-[11px] text-slate-500">Backup-Datei hochladen & einspielen</p>
            </div>
          </div>
          <form onSubmit={handleRestoreBackup} className="space-y-3">
            <input
              type="file"
              accept=".json"
              onChange={(e) => setSelectedRestoreFile(e.target.files?.[0] || null)}
              className="text-[10px] text-slate-500 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="'RESTORE' zur Bestätigung"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold py-1.5 px-4 rounded-xl transition-all disabled:opacity-50 text-xs"
              >
                Einspielen
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Server-Side Restore Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm border-amber-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Server-Backups (Container-Storage)</h3>
              <p className="text-[11px] text-slate-500 italic">Nutzt die automatischen Snapshots des Servers</p>
            </div>
          </div>
          <button
            onClick={loadSavedBackups}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {savedBackups.length === 0 ? (
          <p className="text-xs text-slate-500 italic text-center py-4">Keine automatischen Backups verfügbar</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
            {savedBackups.map((b) => (
              <div
                key={b.filename}
                className={`flex items-center justify-between bg-slate-950 border rounded-xl px-3 py-2.5 ${
                  serverRestoreFile === b.filename ? "border-amber-500/50 bg-amber-500/5" : "border-slate-800"
                }`}
              >
                <div>
                  <p className="text-xs font-mono text-slate-200">{b.filename}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(b.created_at).toLocaleDateString("de-DE", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit"
                    })}
                    {" · "}
                    {(b.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setServerRestoreFile(b.filename);
                    setServerRestoreConfirm("");
                  }}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg transition-colors shrink-0 ml-3"
                >
                  Wiederherstellen
                </button>
              </div>
            ))}

            {serverRestoreFile && (
              <form onSubmit={handleRestoreServerFile} className="mt-3 bg-rose-950/20 border border-rose-500/30 p-3 rounded-xl space-y-2">
                <p className="text-[11px] text-rose-300 font-semibold">
                  Wiederherstellen aus: <span className="font-mono">{serverRestoreFile}</span>
                </p>
                <input
                  type="text"
                  value={serverRestoreConfirm}
                  onChange={(e) => setServerRestoreConfirm(e.target.value)}
                  placeholder="RESTORE eingeben"
                  className="w-full bg-slate-950 border border-rose-500/30 rounded-lg p-2 text-xs text-rose-300 focus:border-rose-500 focus:outline-none font-mono text-center"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setServerRestoreFile(null); setServerRestoreConfirm(""); }}
                    className="flex-1 bg-slate-900 text-slate-400 text-xs py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || serverRestoreConfirm !== "RESTORE"}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-1.5 rounded-lg disabled:opacity-40 transition-colors"
                  >
                    {isLoading ? "Läuft..." : "Jetzt wiederherstellen"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* System Update & Maintenance Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm border-indigo-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl">
              <RefreshCw className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">System-Aktualisierung</h3>
              <p className="text-[11px] text-slate-500 italic">Code & Datenbank-Struktur aktualisieren</p>
            </div>
          </div>
          
          {systemStatus?.isPending && (
            <div className="flex items-center gap-2 bg-amber-500/10 text-amber-400 px-3 py-1 rounded-full text-[10px] font-bold border border-amber-500/20 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              UPDATE LÄUFT ODER GEPLANT
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Dieser Vorgang erstellt ein Backup, lädt den neuesten Code von GitHub und startet die Container neu. 
              <strong> Das System ist währenddessen für ca. 30-60 Sekunden nicht erreichbar.</strong>
            </p>
            <button
              onClick={() => {
                if(confirm("Bist du sicher? Das System startet neu und ist kurzzeitig offline.")) {
                  handleTriggerUpdate();
                }
              }}
              disabled={isLoading || systemStatus?.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/10 flex items-center justify-center gap-2 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${systemStatus?.isPending ? "animate-spin" : ""}`} />
              {systemStatus?.isPending ? "Update angefordert..." : "Jetzt aktualisieren"}
            </button>
          </div>

          <div className="lg:col-span-2 bg-black/50 border border-slate-800 rounded-xl p-4 font-mono text-[10px] text-slate-400 overflow-hidden flex flex-col h-[180px]">
             <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                <span className="text-slate-500 uppercase tracking-widest text-[9px]">Letzter Update-Log (Host)</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
             </div>
             <pre className="flex-1 overflow-y-auto whitespace-pre-wrap custom-scrollbar">
                {systemStatus?.lastLog || "Keine Logs verfügbar."}
             </pre>
          </div>
        </div>
      </div>
    </div>

  );
}
