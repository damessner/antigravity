"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, RefreshCw, ShieldCheck } from "lucide-react";
import { fetchAuth } from "@/utils/fetchAuth";
import { toast } from "sonner";

interface BackupSettings {
  backup_provider: "local" | "onedrive" | "s3" | "google_drive";
  backup_enabled: string;
  backup_retention_days: string;
  backup_admin_hourly_enabled: string;
  backup_teacher_sync_enabled: string;
  backup_teacher_sync_delay_minutes: string;
  backup_admin_root_template: string;
  backup_teacher_root: string;
  backup_onedrive_client_id: string;
  backup_onedrive_tenant_id: string;
  backup_onedrive_redirect_uri: string;
  backup_onedrive_client_secret: string;
}

interface BackupStatus {
  provider: string;
  backup_last_admin_sync: string | null;
  backup_last_admin_status: string;
  backup_last_admin_error: string;
  backup_last_teacher_sync: string | null;
  backup_last_teacher_status: string;
  backup_last_teacher_error: string;
  backup_next_run_at: string | null;
  queued_teacher_jobs: number;
}

const DEFAULT_SETTINGS: BackupSettings = {
  backup_provider: "local",
  backup_enabled: "true",
  backup_retention_days: "14",
  backup_admin_hourly_enabled: "true",
  backup_teacher_sync_enabled: "true",
  backup_teacher_sync_delay_minutes: "5",
  backup_admin_root_template: "Antigravity{school_name}Backup",
  backup_teacher_root: "AntigravityGradebooks",
  backup_onedrive_client_id: "",
  backup_onedrive_tenant_id: "common",
  backup_onedrive_redirect_uri: "",
  backup_onedrive_client_secret: "",
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

export function BackupCloudSettings() {
  const [settings, setSettings] = useState<BackupSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sRes, stRes] = await Promise.all([
        fetchAuth("/api/backup/cloud/settings"),
        fetchAuth("/api/backup/cloud/status"),
      ]);
      setSettings({ ...DEFAULT_SETTINGS, ...(sRes.data || {}) });
      setStatus(stRes.data || null);
    } catch (err: any) {
      toast.error("Backup-Einstellungen konnten nicht geladen werden", { description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await fetchAuth("/api/backup/cloud/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      toast.success("Backup-Einstellungen gespeichert");
      await load();
    } catch (err: any) {
      toast.error("Speichern fehlgeschlagen", { description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    try {
      const { data } = await fetchAuth("/api/backup/cloud/test", {
        method: "POST",
        body: JSON.stringify({ provider: settings.backup_provider }),
      });
      if (data?.success) toast.success("Verbindung erfolgreich getestet");
      else toast.message(data?.message || "Provider derzeit nicht aktiviert");
      await load();
    } catch (err: any) {
      toast.error("Verbindungstest fehlgeschlagen", { description: err.message });
    }
  };

  const runNow = async () => {
    try {
      await fetchAuth("/api/backup/cloud/run-now", { method: "POST" });
      toast.success("Backup gestartet");
      await load();
    } catch (err: any) {
      toast.error("Backup-Start fehlgeschlagen", { description: err.message });
    }
  };

  const openOneDriveAuth = async () => {
    try {
      const { data } = await fetchAuth("/api/backup/cloud/onedrive/auth-url");
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error("OAuth-URL konnte nicht geladen werden", { description: err.message });
    }
  };

  const exchangeCode = async () => {
    if (!oauthCode.trim()) return;
    try {
      await fetchAuth("/api/backup/cloud/onedrive/exchange", {
        method: "POST",
        body: JSON.stringify({ code: oauthCode.trim() }),
      });
      toast.success("OneDrive OAuth verbunden");
      setOauthCode("");
      await load();
    } catch (err: any) {
      toast.error("OAuth-Code konnte nicht verarbeitet werden", { description: err.message });
    }
  };

  if (isLoading) {
    return <div className="text-sm text-slate-500">Lädt Backup-Integration…</div>;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl">
            <Cloud className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Backup-Cloud Integration</h3>
            <p className="text-[11px] text-slate-500">OneDrive + Provider-Auswahl für automatische Sicherungen</p>
          </div>
        </div>
        <button onClick={load} className="text-slate-400 hover:text-white transition-colors" title="Neu laden">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-slate-400">
            Provider
            <select
              value={settings.backup_provider}
              onChange={(e) => setSettings((p) => ({ ...p, backup_provider: e.target.value as BackupSettings["backup_provider"] }))}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="local">Local</option>
              <option value="onedrive">OneDrive</option>
              <option value="s3">S3 (Feature-Flag)</option>
              <option value="google_drive">Google Drive (Feature-Flag)</option>
            </select>
          </label>

          <label className="text-xs text-slate-400">
            Retention (Tage)
            <input
              type="number"
              min={1}
              value={settings.backup_retention_days}
              onChange={(e) => setSettings((p) => ({ ...p, backup_retention_days: e.target.value }))}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="text-xs text-slate-400">
            Teacher Delay (Min)
            <input
              type="number"
              min={1}
              value={settings.backup_teacher_sync_delay_minutes}
              onChange={(e) => setSettings((p) => ({ ...p, backup_teacher_sync_delay_minutes: e.target.value }))}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-slate-400">
            Admin Root Template
            <input
              type="text"
              value={settings.backup_admin_root_template}
              onChange={(e) => setSettings((p) => ({ ...p, backup_admin_root_template: e.target.value }))}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-slate-400">
            Teacher Root
            <input
              type="text"
              value={settings.backup_teacher_root}
              onChange={(e) => setSettings((p) => ({ ...p, backup_teacher_root: e.target.value }))}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={settings.backup_enabled === "true"} onChange={(e) => setSettings((p) => ({ ...p, backup_enabled: String(e.target.checked) }))} /> Backup aktiv</label>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={settings.backup_admin_hourly_enabled === "true"} onChange={(e) => setSettings((p) => ({ ...p, backup_admin_hourly_enabled: String(e.target.checked) }))} /> Admin stündlich</label>
          <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={settings.backup_teacher_sync_enabled === "true"} onChange={(e) => setSettings((p) => ({ ...p, backup_teacher_sync_enabled: String(e.target.checked) }))} /> Teacher Sync</label>
        </div>

        <div className="pt-2 border-t border-slate-800/60 space-y-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-500">OneDrive OAuth (Microsoft Graph)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400">Client ID
              <input type="text" value={settings.backup_onedrive_client_id} onChange={(e) => setSettings((p) => ({ ...p, backup_onedrive_client_id: e.target.value }))} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">Tenant ID
              <input type="text" value={settings.backup_onedrive_tenant_id} onChange={(e) => setSettings((p) => ({ ...p, backup_onedrive_tenant_id: e.target.value }))} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">Redirect URI
              <input type="text" value={settings.backup_onedrive_redirect_uri} onChange={(e) => setSettings((p) => ({ ...p, backup_onedrive_redirect_uri: e.target.value }))} className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-slate-400">Client Secret
              <input type="password" value={settings.backup_onedrive_client_secret} onChange={(e) => setSettings((p) => ({ ...p, backup_onedrive_client_secret: e.target.value }))} placeholder="••••••••" className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openOneDriveAuth} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">OAuth öffnen</button>
            <input type="text" value={oauthCode} onChange={(e) => setOauthCode(e.target.value)} placeholder="Authorization Code" className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white min-w-64" />
            <button type="button" onClick={exchangeCode} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">Code speichern</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button type="submit" disabled={isSaving} className="text-xs px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">{isSaving ? "Speichert…" : "Einstellungen speichern"}</button>
          <button type="button" onClick={testConnection} className="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100">Verbindung testen</button>
          <button type="button" onClick={runNow} className="text-xs px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white">Backup jetzt ausführen</button>
        </div>
      </form>

      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 space-y-1">
        <div className="flex items-center gap-2 text-emerald-400"><ShieldCheck className="w-3.5 h-3.5" /> Status</div>
        <p>Provider: <span className="font-mono">{status?.provider || "-"}</span></p>
        <p>Admin letzter Lauf: {fmt(status?.backup_last_admin_sync || null)} ({status?.backup_last_admin_status || "-"})</p>
        <p>Teacher letzter Lauf: {fmt(status?.backup_last_teacher_sync || null)} ({status?.backup_last_teacher_status || "-"})</p>
        <p>Nächster geplanter Lauf: {fmt(status?.backup_next_run_at || null)}</p>
        <p>Queue: {status?.queued_teacher_jobs ?? 0}</p>
        {status?.backup_last_admin_error ? <p className="text-rose-400">Admin Fehler: {status.backup_last_admin_error}</p> : null}
        {status?.backup_last_teacher_error ? <p className="text-rose-400">Teacher Fehler: {status.backup_last_teacher_error}</p> : null}
      </div>
    </div>
  );
}
