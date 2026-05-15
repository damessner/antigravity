"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users, BookOpen, UserPlus, Database, ArrowLeft, RefreshCw, Building2
} from "lucide-react";
import { getApiUrl } from "@/utils/apiDiscovery";
import { fetchAuth } from "@/utils/fetchAuth";
import { toast } from "sonner";
import { UserManagement } from "@/components/admin/UserManagement";
import { ClassManagement } from "@/components/admin/ClassManagement";
import { PupilManagement } from "@/components/admin/PupilManagement";
import { RoomManagement } from "@/components/admin/RoomManagement";
import { SystemMaintenance } from "@/components/admin/SystemMaintenance";

import { User, SchoolClass, Pupil, Room } from "@/types";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useAdminMutations } from "@/hooks/useAdminMutations";

export default function AdminPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<"users" | "classes" | "pupils" | "backup" | "rooms">("users");
  
  const { users, classes, pupils, rooms, isLoading: dataLoading, refetch } = useDashboardData(typeof window !== "undefined" ? localStorage.getItem("token") : null);
  const mutations = useAdminMutations();

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
  const [isLoading, setIsLoading] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [selectedRestoreFile, setSelectedRestoreFile] = useState<File | null>(null);

  useEffect(() => {
    if (classes.length > 0 && !newPupil.class_id) {
      setNewPupil((prev: any) => ({ ...prev, class_id: String(classes[0].id) }));
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
      toast.success(`Benutzer "${data.user.full_name}" erstellt!`, {
        description: `Temporäres Passwort: ${data.tempPassword}`,
        duration: 10000,
      });
      setNewUser({ username: "", full_name: "", role: "teacher" });
    } catch (err: any) {
      toast.error("Konnte Benutzer nicht erstellen", { description: err.message });
    }
  };

  const handleResetPassword = async (id: number, name: string) => {
    if (!confirm(`Passwort für "${name}" wirklich zurücksetzen?`)) return;
    try {
      const { data } = await fetchAuth(`/api/users/${id}/reset-password`, { method: "POST" });
      toast.success(`Passwort für "${name}" zurückgesetzt!`, {
        description: `Neues temporäres Passwort: ${data.tempPassword}`,
        duration: 10000,
      });
      loadData();
    } catch (err: any) {
      toast.error("Reset fehlgeschlagen", { description: err.message });
    }
  };

  const handleDeleteUser = async (id: number, name: string) => {
    if (!confirm(`Konto von "${name}" unwiderruflich löschen?`)) return;
    try {
      await fetchAuth(`/api/users/${id}`, { method: "DELETE" });
      setUsers((prev: User[]) => prev.filter((u: User) => u.id !== id));
      toast.info(`Konto "${name}" gelöscht.`);
    } catch (err: any) {
      toast.error("Löschen fehlgeschlagen", { description: err.message });
    }
  };

  const handleUpdateRole = async (userId: number, userName: string, newRole: string) => {
    try {
      setUsers((prev: User[]) => prev.map((u: User) => (u.id === userId ? { ...u, isUpdatingRole: true } : u)));
      const { data } = await fetchAuth(`/api/users/${userId}/role`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev: User[]) => prev.map((u: User) => (u.id === userId ? { ...u, role: data.user.role, isUpdatingRole: false } : u)));
      toast.success(`Rolle für ${userName} auf ${newRole} geändert`);
    } catch (err: any) {
      toast.error("Rollenänderung fehlgeschlagen", { description: err.message });
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
      setClasses((prev: SchoolClass[]) => [...prev, data]);
      setNewClass("");
      toast.success(`Klasse "${data.name}" registriert.`);
      if (!newPupil.class_id) {
        setNewPupil((prev: any) => ({ ...prev, class_id: String(data.id) }));
      }
    } catch (err: any) {
      toast.error("Klassenregistrierung fehlgeschlagen", { description: err.message });
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
      toast.success(`Schülerkonto für "${data.pupil.name}" erstellt!`, {
        description: `Login: ${data.username} | Passwort: ${data.tempPassword}`,
        duration: 15000,
      });
      setNewPupil((prev: any) => ({ ...prev, full_name: "" }));
      loadData();
    } catch (err: any) {
      toast.error("Schüleraufnahme gescheitert", { description: err.message });
    }
  };

  const handleDeletePupil = async (id: number, name: string) => {
    if (!confirm(`Schüler "${name}" inklusive aller Noten und Zuordnungen löschen?`)) return;
    try {
      await fetchAuth(`/api/pupils/${id}`, { method: "DELETE" });
      setPupils((prev: Pupil[]) => prev.filter((p: Pupil) => p.id !== id));
      toast.info(`Schüler "${name}" abgemeldet.`);
    } catch (err: any) {
      toast.error("Löschen gescheitert", { description: err.message });
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
      setRooms((prev: Room[]) => [...prev, data]);
      setNewRoomName("");
      toast.success(`Raum "${data.name}" erstellt.`);
    } catch (err: any) {
      toast.error("Raum konnte nicht erstellt werden", { description: err.message });
    }
  };

  const handleRenameRoom = async (id: number) => {
    try {
      const { data } = await fetchAuth(`/api/setup/rooms/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editingRoomName }),
      });
      setRooms((prev: Room[]) => prev.map((r: Room) => (r.id === id ? data : r)));
      setEditingRoomId(null);
      toast.success(`Raum umbenannt.`);
    } catch (err: any) {
      toast.error("Umbenennen fehlgeschlagen", { description: err.message });
    }
  };

  const handleDeleteRoom = async (id: number, name: string) => {
    if (!confirm(`Raum "${name}" wirklich löschen? Alle Belegungshistorie wird entfernt.`)) return;
    try {
      await fetchAuth(`/api/setup/rooms/${id}`, { method: "DELETE" });
      setRooms((prev: Room[]) => prev.filter((r: Room) => r.id !== id));
      toast.info(`Raum "${name}" gelöscht.`);
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
      loadData();
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
      loadData();
    } catch (err: any) {
      toast.error("System-Wiederherstellung fehlgeschlagen", { description: err.message });
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
              isLoading={isLoading}
            />
          )}
        </main>
      </div>
    </div>
  );
}
