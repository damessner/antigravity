"use client";

import { useState, useEffect, useCallback } from "react";
import { Globe, RefreshCw, CheckCircle, XCircle, Clock, Loader2, FileText, AlertTriangle, Play, FolderOpen } from "lucide-react";
import { fetchAuth } from "@/utils/fetchAuth";
import { toast } from "sonner";

interface SyncResult {
  classes?: number;
  rooms?: number;
  teachers?: number;
  pupils?: number;
  deactivated?: number;
  error?: string;
}

interface SyncStatus {
  status: "never" | "running" | "success" | "error";
  last_sync: string | null;
  result: SyncResult | null;
  in_progress: boolean;
}

interface WebUntisSettingsData {
  webuntis_school: string;
  webuntis_url: string;
  webuntis_username: string;
  webuntis_password: string;
  webuntis_sync_interval?: string;
  webuntis_mission_windows?: boolean;
  webuntis_last_sync: string | null;
  webuntis_sync_status: string;
  webuntis_sync_result: SyncResult | null;
}

export function WebUntisSettings() {
  const [settings, setSettings] = useState<WebUntisSettingsData>({
    webuntis_school: "",
    webuntis_url: "",
    webuntis_username: "",
    webuntis_password: "",
    webuntis_sync_interval: "0",
    webuntis_mission_windows: false,
    webuntis_last_sync: null,
    webuntis_sync_status: "never",
    webuntis_sync_result: null,
  });
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Offline Import States
  const [importStatus, setImportStatus] = useState<{
    exists: boolean;
    allRequiredPresent: boolean;
    checklist: Array<{
      key: string;
      label: string;
      present: boolean;
      fileName: string | null;
      recordCount: number;
      status: "ready" | "missing" | "optional_missing" | "error";
      required: boolean;
      message: string;
    }>;
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [importCounts, setImportCounts] = useState<any | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const { data } = await fetchAuth("/api/webuntis/settings");
      setSettings(data);
    } catch (err: any) {
      toast.error("WebUntis-Einstellungen konnten nicht geladen werden", { description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSyncStatus = useCallback(async () => {
    try {
      const { data } = await fetchAuth("/api/webuntis/sync/status");
      setSyncStatus(data);
      if (data.in_progress) {
        setIsSyncing(true);
      } else {
        setIsSyncing(false);
      }
    } catch {
      /* non-critical */
    }
  }, []);

  const loadImportStatus = useCallback(async () => {
    setIsScanning(true);
    try {
      const { data } = await fetchAuth("/api/untis-import/status");
      setImportStatus(data);
    } catch (err: any) {
      toast.error("Fehler beim Scannen der GP-Untis Exportdateien", { description: err.message });
    } finally {
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadSyncStatus();
    loadImportStatus();
  }, [loadSettings, loadSyncStatus, loadImportStatus]);

  // Poll sync status while syncing
  useEffect(() => {
    if (!isSyncing) return;
    const interval = setInterval(loadSyncStatus, 2500);
    return () => clearInterval(interval);
  }, [isSyncing, loadSyncStatus]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await fetchAuth("/api/webuntis/settings", {
        method: "PUT",
        body: JSON.stringify({
          webuntis_school:   settings.webuntis_school,
          webuntis_url:      settings.webuntis_url,
          webuntis_username: settings.webuntis_username,
          webuntis_password: settings.webuntis_password,
          webuntis_sync_interval: settings.webuntis_sync_interval,
          webuntis_mission_windows: settings.webuntis_mission_windows,
        }),
      });
      toast.success("WebUntis-Einstellungen gespeichert");
      loadSettings();
    } catch (err: any) {
      toast.error("Speichern fehlgeschlagen", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await fetchAuth("/api/webuntis/sync", { method: "POST" });
      toast.success("Synchronisation gestartet", {
        description: "Läuft im Hintergrund. Status wird automatisch aktualisiert.",
      });
      loadSyncStatus();
    } catch (err: any) {
      setIsSyncing(false);
      toast.error("Sync-Start fehlgeschlagen", { description: err.message });
    }
  };

  const handleImport = async () => {
    if (isImporting) return;
    setIsImporting(true);
    setImportLog(["Starte Offline-Import...", "Bitte warten..."]);
    setImportCounts(null);
    try {
      const { data } = await fetchAuth("/api/untis-import/run", { method: "POST" });
      if (data.success) {
        toast.success("Offline-Import erfolgreich abgeschlossen!");
        setImportLog(data.logs || ["Erfolgreich abgeschlossen."]);
        setImportCounts(data.counts);
        loadImportStatus();
      } else {
        toast.error("Offline-Import fehlgeschlagen", { description: data.error });
        setImportLog(prev => [...prev, `❌ FEHLER: ${data.error}`]);
      }
    } catch (err: any) {
      toast.error("Offline-Import fehlgeschlagen", { description: err.message });
      setImportLog(prev => [...prev, `❌ FEHLER: ${err.message || "Unerwarteter Fehler"}`]);
    } finally {
      setIsImporting(false);
    }
  };

  const statusBadge = () => {
    const s = syncStatus?.status || settings.webuntis_sync_status || "never";
    if (s === "running" || syncStatus?.in_progress) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded-full border border-indigo-500/20 animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          SYNCHRONISIERT…
        </span>
      );
    }
    if (s === "success") {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20">
          <CheckCircle className="w-3 h-3" />
          ERFOLGREICH
        </span>
      );
    }
    if (s === "error") {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded-full border border-rose-500/20">
          <XCircle className="w-3 h-3" />
          FEHLER
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-500/10 text-slate-400 text-[10px] font-bold rounded-full border border-slate-500/20">
        <Clock className="w-3 h-3" />
        NIE SYNCHRONISIERT
      </span>
    );
  };

  const lastSyncStr = settings.webuntis_last_sync && settings.webuntis_last_sync !== ""
    ? new Date(settings.webuntis_last_sync).toLocaleString("de-DE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  const resultCounts = syncStatus?.result || settings.webuntis_sync_result;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Lädt…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-xl">
            <Globe className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">WebUntis Integration</h2>
            <p className="text-[11px] text-slate-500">
              Schüler, Lehrer und Klassen automatisch aus WebUntis importieren
            </p>
          </div>
        </div>
        {statusBadge()}
      </div>

      {/* Settings Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          Verbindungseinstellungen
        </h3>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] text-slate-400 font-medium mb-1">
                WebUntis URL *
              </label>
              <input
                type="url"
                value={settings.webuntis_url}
                onChange={(e) => setSettings((p) => ({ ...p, webuntis_url: e.target.value }))}
                placeholder="https://schule.webuntis.com/WebUntis/?school=ident"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-700 transition-colors"
              />
              <p className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-500/50" />
                Tipp: Einfach die vollständige Browser-URL Ihrer Schule kopieren und hier einfügen.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">
                  Benutzername *
                </label>
                <input
                  type="text"
                  value={settings.webuntis_username}
                  onChange={(e) => setSettings((p) => ({ ...p, webuntis_username: e.target.value }))}
                  placeholder="Ihr WebUntis-Nutzername"
                  required
                  autoComplete="off"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-700 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">
                  Passwort
                </label>
                <input
                  type="password"
                  value={settings.webuntis_password}
                  onChange={(e) => setSettings((p) => ({ ...p, webuntis_password: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-slate-700 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Automation Section */}
          <div className="pt-4 border-t border-slate-800/50 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Automatisierung & Sync-Intervalle
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[11px] text-slate-400 font-medium mb-1">
                  Sync-Intervall (Heartbeat)
                </label>
                <select
                  value={settings.webuntis_sync_interval || "0"}
                  onChange={(e) => setSettings((p) => ({ ...p, webuntis_sync_interval: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="0">Deaktiviert (Nur Manuell)</option>
                  <option value="1">Stündlich</option>
                  <option value="4">Alle 4 Stunden</option>
                  <option value="12">Alle 12 Stunden</option>
                  <option value="24">Täglich</option>
                </select>
                <p className="text-[10px] text-slate-600 mt-1.5">
                  Regelmäßige Hintergrund-Aktualisierung der Basisdaten.
                </p>
              </div>

              <div className="flex items-center gap-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/40">
                <div className="flex-1">
                  <p className="text-xs font-bold text-slate-300">Fixe Mission-Windows</p>
                  <p className="text-[10px] text-slate-500">Sync um 07:00, 11:00 und 16:00 Uhr erzwingen.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings(p => ({ ...p, webuntis_mission_windows: !(p as any).webuntis_mission_windows }))}
                  className={`w-10 h-5 rounded-full transition-colors relative ${(settings as any).webuntis_mission_windows ? "bg-indigo-600" : "bg-slate-800"}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${(settings as any).webuntis_mission_windows ? "left-6" : "left-1"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Advanced Toggle */}
          <div className="pt-2 border-t border-slate-800/50">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              {showAdvanced ? "Erweiterte Einstellungen ausblenden" : "Erweiterte Einstellungen anzeigen"}
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-slate-950/50 border border-slate-800/50 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                <label className="block text-[11px] text-slate-400 font-medium mb-1">
                  Technische Schul-ID (Manuell)
                </label>
                <input
                  type="text"
                  value={settings.webuntis_school}
                  onChange={(e) => setSettings((p) => ({ ...p, webuntis_school: e.target.value }))}
                  placeholder="Wird normalerweise automatisch extrahiert"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-slate-700"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold px-5 py-2 rounded-xl transition-all"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Einstellungen speichern
            </button>
          </div>
        </form>
      </div>

      {/* Manual Sync */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Manuelle Synchronisation
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Importiert Klassen, Lehrer und Schüler aus WebUntis (nicht-destruktiv)
            </p>
          </div>
          {lastSyncStr && (
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Zuletzt: {lastSyncStr}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Info */}
          <div className="space-y-2">
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] text-slate-400 font-semibold">Dieser Sync führt aus:</p>
              <ul className="text-[11px] text-slate-500 space-y-0.5 list-none">
                <li>✅ Klassen abrufen & Einträge anlegen/aktualisieren</li>
                <li>✅ Automatische Raumzuordnung (1:1 Klasse → Raum)</li>
                <li>✅ Lehrer anlegen/aktualisieren</li>
                <li>✅ Schüler anlegen/aktualisieren & Klassen verknüpfen</li>
                <li>✅ Gelöschte Nutzer per Soft-Delete deaktivieren</li>
                <li>🚫 Schreibt NIEMALS Daten nach WebUntis zurück</li>
              </ul>
            </div>
            <button
              onClick={handleSync}
              disabled={isSyncing || !settings.webuntis_url}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl transition-all text-sm"
            >
              {isSyncing
                ? <><Loader2 className="w-4 h-4 animate-spin" />Synchronisiert…</>
                : <><RefreshCw className="w-4 h-4" />Jetzt synchronisieren</>
              }
            </button>
          </div>

          {/* Last result */}
          {resultCounts && (
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-3">
                Letztes Sync-Ergebnis
              </p>
              {resultCounts.error ? (
                <div className="flex items-start gap-2 text-rose-400 text-xs">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{resultCounts.error}</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Klassen", value: resultCounts.classes, color: "text-cyan-400" },
                    { label: "Räume",   value: resultCounts.rooms,   color: "text-indigo-400" },
                    { label: "Lehrer",  value: resultCounts.teachers, color: "text-amber-400" },
                    { label: "Schüler", value: resultCounts.pupils,  color: "text-emerald-400" },
                    { label: "Deaktiviert", value: resultCounts.deactivated, color: "text-rose-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-900 rounded-lg p-2 text-center">
                      <div className={`text-lg font-bold font-mono ${color}`}>{value ?? "—"}</div>
                      <div className="text-[10px] text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Offline Datei-Import (GP-Untis) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-xl">
              <FolderOpen className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Offline-Datei-Import (GP-Untis)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Stundenplan und Stammdaten direkt aus dem lokalen Ordner <code className="font-mono bg-slate-950 px-1 py-0.5 rounded text-indigo-400">untis_export/</code> einlesen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadImportStatus}
            disabled={isScanning}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1.5 rounded-lg hover:bg-slate-800/50"
            title="Dateien neu einscannen"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* File Status Checklist */}
          <div className="lg:col-span-2 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Export-Dateien Checkliste
            </h4>
            
            {importStatus && !importStatus.exists ? (
              <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-4 text-center">
                <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-2" />
                <p className="text-xs text-rose-300 font-bold">Verzeichnis `untis_export` fehlt</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Bitte legen Sie einen Ordner namens <code className="font-mono text-slate-400">untis_export</code> im Stammverzeichnis der Anwendung an und platzieren Sie dort die Exportdateien.
                </p>
              </div>
            ) : importStatus ? (
              <div className="divide-y divide-slate-800 bg-slate-950/40 border border-slate-800 rounded-xl overflow-hidden">
                {importStatus.checklist.map((file) => (
                  <div key={file.key} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <FileText className={`w-4 h-4 ${file.present ? "text-indigo-400" : "text-slate-600"}`} />
                      <div>
                        <p className="text-xs font-bold text-slate-300">{file.label}</p>
                        <p className="text-[10px] text-slate-500">
                          {file.present ? `Gefunden: ${file.fileName}` : "Nicht gefunden"}
                        </p>
                      </div>
                    </div>
                    <div>
                      {file.status === "ready" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold rounded-full border border-emerald-500/20">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Bereit ({file.recordCount})
                        </span>
                      )}
                      {file.status === "missing" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-rose-500/10 text-rose-400 text-[10px] font-bold rounded-full border border-rose-500/20">
                          <XCircle className="w-2.5 h-2.5" />
                          Erforderlich
                        </span>
                      )}
                      {file.status === "optional_missing" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded-full border border-amber-500/20">
                          <Clock className="w-2.5 h-2.5" />
                          Optional
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-slate-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Scanne Ordner...
              </div>
            )}

            <button
              type="button"
              onClick={handleImport}
              disabled={isImporting || isScanning || !importStatus?.allRequiredPresent}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-all text-sm shadow-md shadow-emerald-950/20"
            >
              {isImporting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Importiere Daten…</>
              ) : (
                <><Play className="w-4 h-4" /> Offline-Import starten</>
              )}
            </button>
          </div>

          {/* Action Log / Counts */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Import Verlauf
            </h4>

            {importCounts && (
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-2">Importierte Objekte</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "Klassen", value: importCounts.classes, color: "text-cyan-400" },
                    { label: "Räume",   value: importCounts.rooms,   color: "text-indigo-400" },
                    { label: "Lehrer",  value: importCounts.teachers, color: "text-amber-400" },
                    { label: "Fächer Zuw.", value: importCounts.subjects, color: "text-purple-400" },
                    { label: "Wochenplan", value: importCounts.timetable, color: "text-emerald-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-900 rounded p-1.5 text-center border border-slate-800/30">
                      <div className={`text-sm font-bold font-mono ${color}`}>{value ?? 0}</div>
                      <div className="text-[9px] text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 h-44 overflow-y-auto font-mono text-[9px] text-slate-400 space-y-1 scrollbar-thin">
              {importLog.length === 0 ? (
                <span className="text-slate-600 italic">Noch kein Import ausgeführt. Klicken Sie auf "Offline-Import starten", um den Vorgang zu beginnen.</span>
              ) : (
                importLog.map((log, i) => {
                  let isError = log.includes("FEHLER") || log.includes("❌");
                  let isSuccess = log.includes("erfolgreich") || log.includes("COMMIT");
                  let colorClass = "text-slate-400";
                  if (isError) colorClass = "text-rose-400";
                  else if (isSuccess) colorClass = "text-emerald-400";
                  return (
                    <div key={i} className={`${colorClass} leading-tight`}>
                      {log}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <p className="text-[11px] text-blue-300 leading-relaxed">
          <strong>Hinweis:</strong> Bestehende Benutzerkonten, die nicht aus WebUntis stammen (manuelle Accounts),
          werden durch die Synchronisation nicht berührt. Nur Accounts mit einer WebUntis-ID werden
          aktualisiert oder deaktiviert. Passwörter werden niemals überschrieben.
        </p>
      </div>
    </div>
  );
}
