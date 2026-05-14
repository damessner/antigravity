"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Users, BookOpen, UserPlus, Database, ArrowLeft, RefreshCw, 
  Trash2, Key, Download, Upload, AlertTriangle, CheckCircle2, Building2, Edit2
} from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<"users" | "classes" | "pupils" | "backup" | "rooms">("users");
  
  const [users, setUsers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [pupils, setPupils] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [savedBackups, setSavedBackups] = useState<any[]>([]);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [editingRoomName, setEditingRoomName] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [serverRestoreFile, setServerRestoreFile] = useState<string | null>(null);
  const [serverRestoreConfirm, setServerRestoreConfirm] = useState("");
  
  // Forms states
  const [newUser, setNewUser] = useState({ username: "", full_name: "", role: "teacher" });
  const [newClass, setNewClass] = useState("");
  const [newPupil, setNewPupil] = useState({ full_name: "", class_id: "" });
  
  // Modals/Alerts
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error" | "info"; text: string; details?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);

  const fetchAuth = async (path: string, options: RequestInit = {}) => {
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };

    const res = await fetch(`${apiUrl}${path}`, { ...options, headers });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json() : null;

    if (!res.ok) {
      throw new Error(data?.error || `Fehler bei Anfrage: ${res.statusText}`);
    }
    return { res, data };
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [{ data: uData }, { data: cData }, { data: pData }, { data: rData }] = await Promise.all([
        fetchAuth("/api/users"),
        fetchAuth("/api/classes"),
        fetchAuth("/api/pupils"),
        fetchAuth("/api/setup/rooms"),
      ]);
      setUsers(uData || []);
      setClasses(cData || []);
      setPupils(pData || []);
      setRooms(rData || []);
      if (cData?.length > 0 && !newPupil.class_id) {
        setNewPupil((prev) => ({ ...prev, class_id: String(cData[0].id) }));
      }
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Fehler beim Laden der Admin-Daten", details: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSavedBackups = async () => {
    try {
      const { data } = await fetchAuth("/api/backup/list");
      setSavedBackups(data || []);
    } catch {
      setSavedBackups([]);
    }
  };

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.replace("/login");
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== "admin") {
      router.replace("/");
      return;
    }
    loadData();
  }, [router]);

  // Load backups when backup section is active
  useEffect(() => {
    if (activeSection === "backup") {
      loadSavedBackups();
    }
  }, [activeSection]);

  // --- Users Handlers ---
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await fetchAuth("/api/users", {
        method: "POST",
        body: JSON.stringify(newUser),
      });
      setUsers((prev) => [...prev, data.user]);
      setAlertMsg({
        type: "success",
        text: `Benutzer "${data.user.full_name}" erstellt!`,
        details: `Temporäres Passwort: ${data.tempPassword}`,
      });
      setNewUser({ username: "", full_name: "", role: "teacher" });
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Konnte Benutzer nicht erstellen", details: err.message });
    }
  };

  const handleResetPassword = async (id: number, name: string) => {
    if (!confirm(`Passwort für "${name}" wirklich zurücksetzen?`)) return;
    try {
      const { data } = await fetchAuth(`/api/users/${id}/reset-password`, { method: "POST" });
      setAlertMsg({
        type: "success",
        text: `Passwort für "${name}" zurückgesetzt!`,
        details: `Neues temporäres Passwort: ${data.tempPassword}`,
      });
      loadData();
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Reset fehlgeschlagen", details: err.message });
    }
  };

  const handleDeleteUser = async (id: number, name: string) => {
    if (!confirm(`Konto von "${name}" unwiderruflich löschen?`)) return;
    try {
      await fetchAuth(`/api/users/${id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setAlertMsg({ type: "info", text: `Konto "${name}" gelöscht.` });
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Löschen fehlgeschlagen", details: err.message });
    }
  };

  const handleChangeRole = async (userId: number, newRole: string, userName: string) => {
    try {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, isUpdatingRole: true } : u)));
      const { data } = await fetchAuth(`/api/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: data.user.role, isUpdatingRole: false } : u)));
      setAlertMsg({ type: "success", text: `Rolle für ${userName} auf ${newRole} geändert` });
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Rollenänderung fehlgeschlagen", details: err.message });
      loadData();
    }
  };


  // --- Classes Handlers ---
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await fetchAuth("/api/classes", {
        method: "POST",
        body: JSON.stringify({ name: newClass }),
      });
      setClasses((prev) => [...prev, data]);
      setNewClass("");
      setAlertMsg({ type: "success", text: `Klasse "${data.name}" registriert.` });
      if (!newPupil.class_id) {
        setNewPupil((prev) => ({ ...prev, class_id: String(data.id) }));
      }
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Klassenregistrierung fehlgeschlagen", details: err.message });
    }
  };

  // --- Pupils Handlers ---
  const handleCreatePupil = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await fetchAuth("/api/pupils", {
        method: "POST",
        body: JSON.stringify({
          full_name: newPupil.full_name,
          class_id: Number(newPupil.class_id),
        }),
      });
      setAlertMsg({
        type: "success",
        text: `Schülerkonto für "${data.pupil.name}" erstellt!`,
        details: `Login: ${data.username} | Passwort: ${data.tempPassword}`,
      });
      setNewPupil((prev) => ({ ...prev, full_name: "" }));
      loadData();
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Schüleraufnahme gescheitert", details: err.message });
    }
  };

  const handleDeletePupil = async (id: number, name: string) => {
    if (!confirm(`Schüler "${name}" inklusive aller Noten und Zuordnungen löschen?`)) return;
    try {
      await fetchAuth(`/api/pupils/${id}`, { method: "DELETE" });
      setPupils((prev) => prev.filter((p) => p.id !== id));
      setAlertMsg({ type: "info", text: `Schüler "${name}" abgemeldet.` });
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Löschen gescheitert", details: err.message });
    }
  };

  // --- Rooms Handlers ---
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await fetchAuth("/api/setup/rooms", {
        method: "POST",
        body: JSON.stringify({ name: newRoomName }),
      });
      setRooms((prev) => [...prev, data]);
      setNewRoomName("");
      setAlertMsg({ type: "success", text: `Raum "${data.name}" erstellt.` });
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Raum konnte nicht erstellt werden", details: err.message });
    }
  };

  const handleRenameRoom = async (id: number) => {
    try {
      const { data } = await fetchAuth(`/api/setup/rooms/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editingRoomName }),
      });
      setRooms((prev) => prev.map((r) => (r.id === id ? data : r)));
      setEditingRoomId(null);
      setAlertMsg({ type: "success", text: `Raum umbenannt.` });
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Umbenennen fehlgeschlagen", details: err.message });
    }
  };

  const handleDeleteRoom = async (id: number, name: string) => {
    if (!confirm(`Raum "${name}" wirklich löschen? Alle Belegungshistorie wird entfernt.`)) return;
    try {
      await fetchAuth(`/api/setup/rooms/${id}`, { method: "DELETE" });
      setRooms((prev) => prev.filter((r) => r.id !== id));
      setAlertMsg({ type: "info", text: `Raum "${name}" gelöscht.` });
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Löschen fehlgeschlagen", details: err.message });
    }
  };

  // --- Server Backup Restore ---
  const handleRestoreServerFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (serverRestoreConfirm !== "RESTORE") {
      setAlertMsg({ type: "error", text: "Bitte exakt 'RESTORE' zur Bestätigung eingeben." });
      return;
    }
    if (!serverRestoreFile) {
      setAlertMsg({ type: "error", text: "Keine Backup-Datei ausgewählt." });
      return;
    }
    try {
      setIsLoading(true);
      await fetchAuth("/api/backup/restore-server-file", {
        method: "POST",
        body: JSON.stringify({ filename: serverRestoreFile, confirm: serverRestoreConfirm }),
      });
      setAlertMsg({ type: "success", text: "System wiederhergestellt!", details: "Bitte Seite neu laden." });
      setServerRestoreFile(null);
      setServerRestoreConfirm("");
      loadData();
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Wiederherstellung fehlgeschlagen", details: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Backups Handlers ---
  const handleDownloadBackup = async (type: "full" | "gradebooks" | "notes") => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const url = `${apiUrl}/api/backup/${type}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Fehler beim Erzeugen der Backup-Datei");

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition");
      let filename = `backup_${type}_${new Date().toISOString().split("T")[0]}.json`;
      if (disposition && disposition.includes("filename=")) {
        filename = disposition.split("filename=")[1].replace(/["']/g, "");
      }

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      setAlertMsg({ type: "success", text: "Backup erfolgreich heruntergeladen!" });
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "Backup-Download fehlgeschlagen", details: err.message });
    }
  };

  const handleRestoreBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (restoreConfirmText !== "RESTORE") {
      setAlertMsg({ type: "error", text: "Bitte exakt 'RESTORE' zur Bestätigung eingeben." });
      return;
    }
    if (!selectedRestoreFile) {
      setAlertMsg({ type: "error", text: "Keine JSON Backup-Datei ausgewählt." });
      return;
    }

    try {
      setIsLoading(true);
      const fileText = await selectedRestoreFile.text();
      const parsedJson = JSON.parse(fileText);

      await fetchAuth("/api/backup/restore", {
        method: "POST",
        body: JSON.stringify({
          confirm: restoreConfirmText,
          data: parsedJson,
        }),
      });

      setAlertMsg({
        type: "success",
        text: "System komplett wiederhergestellt!",
        details: "Datenbank synchronisiert. Bitte Seite neu laden.",
      });
      setRestoreConfirmText("");
      setSelectedRestoreFile(null);
      loadData();
    } catch (err: any) {
      setAlertMsg({ type: "error", text: "System-Wiederherstellung fehlgeschlagen", details: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header Navigation */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Zurück zum Dashboard</span>
          </button>
          <div className="h-4 w-px bg-slate-800" />
          <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <span>Administrator-Steuerkonsole</span>
          </h1>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Aktualisieren</span>
        </button>
      </header>

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-slate-900/50 border-r border-slate-800/80 p-4 shrink-0 flex flex-col gap-1.5">
          <button
            onClick={() => setActiveSection("users")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeSection === "users"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Benutzer ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveSection("classes")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeSection === "classes"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Klassen ({classes.length})</span>
          </button>

          <button
            onClick={() => setActiveSection("pupils")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeSection === "pupils"
                ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Schüler ({pupils.length})</span>
          </button>

          <div className="h-px bg-slate-800 my-2" />

          <button
            onClick={() => setActiveSection("backup")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeSection === "backup"
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <Database className="w-4 h-4" />
            <span>System-Sicherung</span>
          </button>

          <button
            onClick={() => setActiveSection("rooms")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeSection === "rooms"
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Raumverwaltung</span>
          </button>
        </aside>

        {/* Content Container */}
        <main className="flex-1 p-6 overflow-y-auto">
          {alertMsg && (
            <div
              className={`mb-6 p-4 rounded-xl border flex items-start gap-3 transition-all ${
                alertMsg.type === "success"
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                  : alertMsg.type === "error"
                  ? "bg-rose-950/40 border-rose-500/30 text-rose-300"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              {alertMsg.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
              {alertMsg.type === "error" && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="text-xs font-semibold">{alertMsg.text}</p>
                {alertMsg.details && <p className="text-[11px] text-slate-400 mt-1 font-mono">{alertMsg.details}</p>}
              </div>
              <button
                onClick={() => setAlertMsg(null)}
                className="text-slate-500 hover:text-slate-300 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* SECTION 1: USERS */}
          {activeSection === "users" && (
            <div className="space-y-6">
              <div className="glass-panel p-5">
                <h2 className="text-sm font-bold text-white mb-3">Neuen Benutzer anlegen</h2>
                <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Anzeigename</label>
                    <input
                      type="text"
                      value={newUser.full_name}
                      onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                      placeholder="z.B. Mag. D. Messner"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Benutzername (Login)</label>
                    <input
                      type="text"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value.toLowerCase().replace(/\s+/g, ".") })}
                      placeholder="z.B. da.messner"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Rolle</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="teacher">Lehrer</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors h-[34px]"
                  >
                    Konto generieren
                  </button>
                </form>
              </div>

              <div className="glass-panel overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/40">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Registrierte Konten</h3>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-500 bg-slate-950/30">
                      <th className="p-3">Name</th>
                      <th className="p-3">Benutzername</th>
                      <th className="p-3">Rolle</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-xs">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-medium text-white">{u.full_name}</td>
                        <td className="p-3 font-mono text-slate-400">{u.username}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <select
                              value={u.role}
                              disabled={u.isUpdatingRole}
                              onChange={(e) => handleChangeRole(u.id, e.target.value, u.full_name)}
                              className={`bg-slate-950 border rounded p-1 text-[11px] font-semibold transition-colors focus:outline-none ${
                                u.role === "admin"
                                  ? "text-amber-400 border-amber-500/30 bg-amber-500/5"
                                  : u.role === "teacher"
                                  ? "text-indigo-400 border-indigo-500/30 bg-indigo-500/5"
                                  : "text-slate-400 border-slate-800"
                              }`}
                            >
                              <option value="admin">admin</option>
                              <option value="teacher">teacher</option>
                              <option value="pupil">pupil</option>
                              <option value="lernwerkstatt">lernwerkstatt</option>
                            </select>
                            {u.isUpdatingRole && (
                              <RefreshCw className="w-3 h-3 text-indigo-400 animate-spin shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          {u.requires_password_change ? (
                            <span className="text-rose-400 text-[11px]">Passwortwechsel nötig</span>
                          ) : (
                            <span className="text-emerald-400 text-[11px]">Aktiv</span>
                          )}
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => handleResetPassword(u.id, u.full_name)}
                            title="Passwort zurücksetzen"
                            className="p-1 text-slate-400 hover:text-amber-400 rounded transition-colors"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id, u.full_name)}
                            title="Benutzer löschen"
                            className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 2: CLASSES */}
          {activeSection === "classes" && (
            <div className="space-y-6 max-w-2xl">
              <div className="glass-panel p-5">
                <h2 className="text-sm font-bold text-white mb-3">Neue Klasse registrieren</h2>
                <form onSubmit={handleCreateClass} className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Klassenbezeichnung</label>
                    <input
                      type="text"
                      value={newClass}
                      onChange={(e) => setNewClass(e.target.value.toUpperCase())}
                      placeholder="z.B. 3G oder 4G"
                      maxLength={5}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors h-[34px]"
                  >
                    Klasse anlegen
                  </button>
                </form>
              </div>

              <div className="glass-panel overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/40">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Stammklassen</h3>
                </div>
                <div className="p-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {classes.map((c) => (
                    <div
                      key={c.id}
                      className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between"
                    >
                      <span className="font-bold text-sm text-indigo-400">{c.name}</span>
                      <span className="text-[10px] text-slate-500">ID: {c.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: PUPILS */}
          {activeSection === "pupils" && (
            <div className="space-y-6">
              <div className="glass-panel p-5">
                <h2 className="text-sm font-bold text-white mb-3">Schüler aufnehmen</h2>
                <form onSubmit={handleCreatePupil} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Vollständiger Name</label>
                    <input
                      type="text"
                      value={newPupil.full_name}
                      onChange={(e) => setNewPupil({ ...newPupil, full_name: e.target.value })}
                      placeholder="z.B. Anna Müller"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Stammklasse</label>
                    <select
                      value={newPupil.class_id}
                      onChange={(e) => setNewPupil({ ...newPupil, class_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      required
                    >
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors h-[34px]"
                  >
                    Einschreiben & Zugangsdaten erzeugen
                  </button>
                </form>
              </div>

              <div className="glass-panel overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/40">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Eingeschriebene Schüler</h3>
                </div>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-500 bg-slate-950/30">
                      <th className="p-3">Klasse</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">System-Login</th>
                      <th className="p-3 text-right">Verwaltung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-xs">
                    {pupils.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                            {p.class_name || "?"}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-white">{p.name}</td>
                        <td className="p-3 font-mono text-slate-500 text-[11px]">{p.username}</td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
                                window.open(`${apiUrl}/api/notes/export/${p.id}`, "_blank");
                              }}
                              title="Verhaltensdokumentation als Word (.doc) exportieren"
                              className="p-1 text-slate-400 hover:text-indigo-400 rounded transition-colors"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePupil(p.id, p.name)}
                              title="Abmelden / Löschen"
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SECTION 4: SYSTEM BACKUP */}
          {activeSection === "backup" && (
            <div className="space-y-6 max-w-3xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Export Column */}
                <div className="glass-panel p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-indigo-400">
                      <Download className="w-4 h-4" />
                      <h3 className="text-sm font-bold text-white">System-Sicherung exportieren</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                      Lädt den gesamten Systemstatus (Benutzer, Belegungen, Fachbeurteilungen, Notizen) als
                      verschlüsselte JSON-Datei herunter. Passwörter bleiben als sichere Hashwerte bestehen.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={() => handleDownloadBackup("full")}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Vollständiges Backup (.json)</span>
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleDownloadBackup("gradebooks")}
                        className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] py-1.5 rounded-lg transition-colors"
                      >
                        Nur Notenbücher
                      </button>
                      <button
                        onClick={() => handleDownloadBackup("notes")}
                        className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] py-1.5 rounded-lg transition-colors"
                      >
                        Nur Verhaltenslogs
                      </button>
                    </div>
                  </div>
                </div>

                {/* Import Column */}
                <div className="glass-panel p-5 border-rose-500/20 bg-gradient-to-b from-slate-900/80 to-rose-950/10 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-rose-400">
                      <Upload className="w-4 h-4" />
                      <h3 className="text-sm font-bold text-white">System-Restore durchführen</h3>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed mb-3">
                      <strong className="text-rose-400 font-semibold">ACHTUNG:</strong> Das Einspielen eines Backups
                      löscht alle bestehenden Tabelleninhalte und überschreibt sie mit den archivierten Daten.
                    </p>
                  </div>

                  <form onSubmit={handleRestoreBackup} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                        JSON Sicherungsdatei
                      </label>
                      <input
                        type="file"
                        accept=".json"
                        onChange={(e) => setSelectedRestoreFile(e.target.files?.[0] || null)}
                        className="w-full text-xs text-slate-400 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 file:cursor-pointer bg-slate-950 p-1.5 rounded-lg border border-slate-800"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                        Bestätigung (tippen Sie &quot;RESTORE&quot;)
                      </label>
                      <input
                        type="text"
                        value={restoreConfirmText}
                        onChange={(e) => setRestoreConfirmText(e.target.value)}
                        placeholder="RESTORE"
                        className="w-full bg-slate-950 border border-rose-500/30 rounded-lg p-2 text-xs text-rose-300 focus:border-rose-500 focus:outline-none placeholder:text-slate-700 font-mono text-center"
                        required
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading || !selectedRestoreFile || restoreConfirmText !== "RESTORE"}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium py-2 rounded-xl transition-all shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {isLoading ? "Wiederherstellung läuft..." : "Gefährliche Wiederherstellung starten"}
                    </button>
                  </form>
                </div>
              </div>

              {/* Gespeicherte Automatik-Backups */}
              <div className="glass-panel p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Gespeicherte Automatik-Backups</h3>
                  <button
                    onClick={loadSavedBackups}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                    title="Aktualisieren"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {savedBackups.length === 0 ? (
                  <p className="text-xs text-slate-500 italic text-center py-4">Keine automatischen Backups verfügbar</p>
                ) : (
                  <div className="space-y-2">
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
            </div>
          )}

          {/* SECTION 5: RAUMVERWALTUNG */}
          {activeSection === "rooms" && (
            <div className="space-y-6 max-w-2xl">
              <div className="glass-panel p-5">
                <h2 className="text-sm font-bold text-white mb-3">Neuen Raum anlegen</h2>
                <form onSubmit={handleCreateRoom} className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Raumbezeichnung</label>
                    <input
                      type="text"
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      placeholder="z.B. Bibliothek"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium py-2 px-4 rounded-lg transition-colors h-[34px]"
                  >
                    Raum erstellen
                  </button>
                </form>
              </div>

              <div className="glass-panel overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/40">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Konfigurierte Räume ({rooms.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-800/50">
                  {rooms.map((room) => (
                    <div key={room.id} className="flex items-center justify-between p-3 hover:bg-slate-800/20 transition-colors">
                      {editingRoomId === room.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingRoomName}
                            onChange={(e) => setEditingRoomName(e.target.value)}
                            className="flex-1 bg-slate-950 border border-cyan-500/50 rounded-lg p-1.5 text-xs text-white focus:outline-none"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameRoom(room.id);
                              if (e.key === "Escape") setEditingRoomId(null);
                            }}
                          />
                          <button
                            onClick={() => handleRenameRoom(room.id)}
                            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold px-2 py-1 border border-cyan-500/30 rounded-lg transition-colors"
                          >
                            Speichern
                          </button>
                          <button
                            onClick={() => setEditingRoomId(null)}
                            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-xs font-medium text-white">{room.name}</span>
                            {room.capacity && (
                              <span className="text-[10px] text-slate-500 ml-2">Max. {room.capacity}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingRoomId(room.id);
                                setEditingRoomName(room.name);
                              }}
                              title="Umbenennen"
                              className="p-1 text-slate-500 hover:text-cyan-400 rounded transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRoom(room.id, room.name)}
                              title="Löschen"
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
