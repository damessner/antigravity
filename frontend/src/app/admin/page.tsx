"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users, BookOpen, UserPlus, Database, ArrowLeft, RefreshCw, Building2, Bug, Globe
} from "lucide-react";
import { getApiUrl } from "@/utils/apiDiscovery";
import { fetchAuth } from "@/utils/fetchAuth";
import { toast } from "sonner";
import { UserManagement } from "@/components/admin/UserManagement";
import { ClassManagement } from "@/components/admin/ClassManagement";
import { PupilManagement } from "@/components/admin/PupilManagement";
import { RoomManagement } from "@/components/admin/RoomManagement";
import { SystemMaintenance } from "@/components/admin/SystemMaintenance";
import { AdminDebugConsole } from "@/components/admin/AdminDebugConsole";
import { WebUntisSettings } from "@/components/admin/WebUntisSettings";
import { OnboardingTip } from "@/components/OnboardingTip";

import { User, SchoolClass, Pupil, Room } from "@/types";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useAdminMutations } from "@/hooks/useAdminMutations";

interface SavedBackupFile {
  filename: string;
  created_at?: string;
  size?: number;
}

export default function AdminPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<"users" | "classes" | "pupils" | "backup" | "rooms" | "debugging" | "integrations">("users");
  
  const { users, classes, pupils, rooms, isLoading: dataLoading, refetch } = useDashboardData(typeof window !== "undefined" ? localStorage.getItem("token") : null);
  const mutations = useAdminMutations();

  const [savedBackups, setSavedBackups] = useState<SavedBackupFile[]>([]);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [editingRoomName, setEditingRoomName] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [serverRestoreFile, setServerRestoreFile] = useState<string | null>(null);
  const [serverRestoreConfirm, setServerRestoreConfirm] = useState("");
  const [systemStatus, setSystemStatus] = useState<{ isPending: boolean; lastLog: string } | null>(null);

  
  // Forms states
  const [newUser, setNewUser] = useState({ username: "", full_name: "", role: "teacher" });
  const [newClass, setNewClass] = useState("");
  const [newPupil, setNewPupil] = useState({ full_name: "", class_id: "" });
  
  // Modals/Alerts
  const [isLoading, setIsLoading] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);

  useEffect(() => {
    if (classes.length > 0 && !newPupil.class_id) {
      setNewPupil((prev) => ({ ...prev, class_id: String(classes[0].id) }));
    }
  }, [classes]);

  const loadSavedBackups = async () => {
    try {
      const { data } = await fetchAuth("/api/backup/list");
      setSavedBackups(data || []);
    } catch {
      setSavedBackups([]);
    }
  };

  const loadSystemStatus = async () => {
    try {
      const { data } = await fetchAuth("/api/admin/system/status");
      setSystemStatus(data);
    } catch (err) {
      console.error("Failed to load system status", err);
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
    refetch();
  }, [router]);

  // Load backups when backup section is active
  useEffect(() => {
    if (activeSection === "backup") {
      loadSavedBackups();
      loadSystemStatus();
      const interval = setInterval(loadSystemStatus, 30000); // Poll every 30s
      return () => clearInterval(interval);
    }
  }, [activeSection]);


  const handleUpdateRole = async (userId: number, userName: string, newRole: string) => {
    try {
      await fetchAuth(`/api/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      toast.success(`Rolle für ${userName} auf ${newRole} geändert`);
      refetch();
    } catch (err: any) {
      toast.error("Rollenänderung fehlgeschlagen", { description: err.message });
    }
  };


  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    mutations.createUser.mutate(newUser, {
      onSuccess: () => setNewUser({ username: "", full_name: "", role: "teacher" })
    });
  };

  const handleResetPassword = async (id: number, name: string) => {
    if (!confirm(`Passwort für "${name}" wirklich zurücksetzen?`)) return;
    try {
      const { data } = await fetchAuth(`/api/users/${id}/reset-password`, { method: "POST" });
      toast.success(`Passwort für "${name}" zurückgesetzt!`, {
        description: `Neues temporäres Passwort: ${data.tempPassword}`,
        duration: 10000,
      });
      refetch();
    } catch (err: any) {
      toast.error("Reset fehlgeschlagen", { description: err.message });
    }
  };

  const handleDeleteUser = (id: number, name: string) => {
    if (!confirm(`Konto von "${name}" unwiderruflich löschen?`)) return;
    mutations.deleteUser.mutate(id);
  };

  // --- Classes Handlers ---
  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    mutations.createClass.mutate(newClass, {
      onSuccess: () => setNewClass("")
    });
  };

  // --- Pupils Handlers ---
  const handleCreatePupil = (e: React.FormEvent) => {
    e.preventDefault();
    mutations.createPupil.mutate({
      full_name: newPupil.full_name,
      class_id: Number(newPupil.class_id),
    }, {
      onSuccess: () => setNewPupil((prev) => ({ ...prev, full_name: "" }))
    });
  };

  const handleDeletePupil = (id: number, name: string) => {
    if (!confirm(`Schüler "${name}" inklusive aller Noten und Zuordnungen löschen?`)) return;
    mutations.deletePupil.mutate(id);
  };

  // --- Rooms Handlers ---
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    mutations.createRoom.mutate(newRoomName, {
      onSuccess: () => setNewRoomName("")
    });
  };

  const handleRenameRoom = async (id: number) => {
    try {
      const { data } = await fetchAuth(`/api/setup/rooms/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editingRoomName }),
      });
      toast.success(`Raum umbenannt.`);
      setEditingRoomId(null);
      refetch();
    } catch (err: any) {
      toast.error("Umbenennen fehlgeschlagen", { description: err.message });
    }
  };

  const handleDeleteRoom = async (id: number, name: string) => {
    if (!confirm(`Raum "${name}" wirklich löschen? Alle Belegungshistorie wird entfernt.`)) return;
    try {
      await fetchAuth(`/api/setup/rooms/${id}`, { method: "DELETE" });
      toast.info(`Raum "${name}" gelöscht.`);
      refetch();
    } catch (err: any) {
      toast.error("Löschen fehlgeschlagen", { description: err.message });
    }
  };

  // --- Server Backup Restore ---
  const handleRestoreServerFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (serverRestoreConfirm !== "RESTORE") {
      toast.error("Bitte exakt 'RESTORE' zur Bestätigung eingeben.");
      return;
    }
    if (!serverRestoreFile) {
      toast.error("Keine Backup-Datei ausgewählt.");
      return;
    }
    try {
      setIsLoading(true);
      await fetchAuth("/api/backup/restore-server-file", {
        method: "POST",
        body: JSON.stringify({ filename: serverRestoreFile, confirm: serverRestoreConfirm }),
      });
      toast.success("System wiederhergestellt!", { description: "Bitte Seite neu laden." });
      setServerRestoreFile(null);
      setServerRestoreConfirm("");
      refetch();
    } catch (err: any) {
      toast.error("Wiederherstellung fehlgeschlagen", { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Backups Handlers ---
  const handleDownloadBackup = async (type: "full" | "gradebooks" | "notes") => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
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

      toast.success("Backup erfolgreich heruntergeladen!");
    } catch (err: any) {
      toast.error("Backup-Download fehlgeschlagen", { description: err.message });
    }
  };

  const handleRestoreBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (restoreConfirmText !== "RESTORE") {
      toast.error("Bitte exakt 'RESTORE' zur Bestätigung eingeben.");
      return;
    }
    if (!selectedRestoreFile) {
      toast.error("Keine JSON Backup-Datei ausgewählt.");
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

      toast.success("System komplett wiederhergestellt!", {
        description: "Datenbank synchronisiert. Bitte Seite neu laden.",
      });
      setRestoreConfirmText("");
      setSelectedRestoreFile(null);
      refetch();
    } catch (err: any) {
      toast.error("System-Wiederherstellung fehlgeschlagen", { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerUpdate = async () => {
    try {
      setIsLoading(true);
      await fetchAuth("/api/admin/system/update", { method: "POST" });
      toast.success("Update angefordert!", { description: "Das System wird in Kürze gesichert und aktualisiert." });
      loadSystemStatus();
    } catch (err: any) {
      toast.error("Update konnte nicht ausgelöst werden", { description: err.message });
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

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Aktualisieren</span>
          </button>
          <OnboardingTip
            pageKey="admin"
            title="⚙️ Administrator-Steuerkonsole"
            tips={[
              "👥 Unter 'Benutzer' legst du Lehrer- und Schülerkonten an.",
              "📚 Klassen und Schüler werden getrennt verwaltet.",
              "💾 Im Bereich 'System-Sicherung' kannst du Backups herunterladen und wiederherstellen.",
              "🔑 Passwörter können jederzeit zurückgesetzt werden — der Nutzer wird beim nächsten Login zur Änderung aufgefordert.",
              "🏠 Räume lassen sich im Bereich 'Räume' hinzufügen, umbenennen oder löschen.",
            ]}
          />
        </div>
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

          <button
            onClick={() => setActiveSection("debugging")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeSection === "debugging"
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <Bug className="w-4 h-4" />
            <span>Debugging</span>
          </button>

          <div className="h-px bg-slate-800 my-2" />

          <button
            onClick={() => setActiveSection("integrations")}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
              activeSection === "integrations"
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Externe Integrationen</span>
          </button>
        </aside>

        {/* Content Container */}
        <main className="flex-1 p-6 overflow-y-auto">

          {/* SECTION 1: USERS */}
          {activeSection === "users" && (
            <UserManagement
              users={users}
              newUser={newUser}
              setNewUser={setNewUser}
              handleCreateUser={handleCreateUser}
              handleResetPassword={handleResetPassword}
              handleDeleteUser={handleDeleteUser}
              handleUpdateRole={handleUpdateRole}
              isLoading={isLoading}
            />
          )}

          {/* SECTION 2: CLASSES */}
          {activeSection === "classes" && (
            <ClassManagement
              classes={classes}
              newClass={newClass}
              setNewClass={setNewClass}
              handleCreateClass={handleCreateClass}
              isLoading={isLoading}
            />
          )}

          {/* SECTION 3: PUPILS */}
          {activeSection === "pupils" && (
            <PupilManagement
              pupils={pupils}
              classes={classes}
              newPupil={newPupil}
              setNewPupil={setNewPupil}
              handleCreatePupil={handleCreatePupil}
              handleDeletePupil={handleDeletePupil}
              isLoading={isLoading}
              refetch={refetch}
            />
          )}

          {/* SECTION 4: SYSTEM BACKUP */}
          {activeSection === "backup" && (
            <SystemMaintenance
              handleDownloadBackup={handleDownloadBackup}
              selectedRestoreFile={selectedRestoreFile}
              setSelectedRestoreFile={setSelectedRestoreFile}
              restoreConfirmText={restoreConfirmText}
              setRestoreConfirmText={setRestoreConfirmText}
              handleRestoreBackup={handleRestoreBackup}
              serverRestoreFile={serverRestoreFile}
              setServerRestoreFile={setServerRestoreFile}
              serverRestoreConfirm={serverRestoreConfirm}
              setServerRestoreConfirm={setServerRestoreConfirm}
              handleRestoreServerFile={handleRestoreServerFile}
              isLoading={isLoading}
              savedBackups={savedBackups}
              loadSavedBackups={loadSavedBackups}
              systemStatus={systemStatus}
              handleTriggerUpdate={handleTriggerUpdate}
            />

          )}

          {/* SECTION 5: RAUMVERWALTUNG */}
          {activeSection === "rooms" && (
            <RoomManagement
              rooms={rooms}
              newRoomName={newRoomName}
              setNewRoomName={setNewRoomName}
              handleCreateRoom={handleCreateRoom}
              handleDeleteRoom={handleDeleteRoom}
              editingRoomId={editingRoomId}
              setEditingRoomId={setEditingRoomId}
              editingRoomName={editingRoomName}
              setEditingRoomName={setEditingRoomName}
              handleRenameRoom={handleRenameRoom}
              refetch={refetch}
              isLoading={isLoading}
            />
          )}

          {/* SECTION 6: DEBUGGING */}
          {activeSection === "debugging" && (
            <AdminDebugConsole />
          )}

          {/* SECTION 7: EXTERNE INTEGRATIONEN (WebUntis) */}
          {activeSection === "integrations" && (
            <WebUntisSettings />
          )}
        </main>
      </div>
    </div>
  );
}
