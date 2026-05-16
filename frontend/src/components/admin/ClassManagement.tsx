import { useState } from "react";
import { Building2, Users, FileText, AlertTriangle, RefreshCw, X } from "lucide-react";
import { fetchAuth } from "@/utils/fetchAuth";
import { toast } from "sonner";
import { SchoolClass, User } from "@/types";

interface ClassManagementProps {
  classes: SchoolClass[];
  newClass: string;
  setNewClass: (name: string) => void;
  handleCreateClass: (e: React.FormEvent) => void;
  isLoading: boolean;
}

export function ClassManagement({
  classes,
  newClass,
  setNewClass,
  handleCreateClass,
  isLoading
}: ClassManagementProps) {
  const [selectedClass, setSelectedClass] = useState<SchoolClass | null>(null);
  const [roster, setRoster] = useState<User[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState(false);

  const handleShowRoster = async (c: SchoolClass) => {
    setSelectedClass(c);
    setIsRosterLoading(true);
    try {
      const { data } = await fetchAuth(`/api/admin/classes/${c.id}/roster`);
      setRoster(data || []);
    } catch (err) {
      toast.error("Roster konnte nicht geladen werden");
    } finally {
      setIsRosterLoading(false);
    }
  };

  const handleResetTeachers = async () => {
    try {
      // 1. Check status
      const { data: status } = await fetchAuth("/api/admin/factsheets/teachers/status");
      
      let confirmMsg = "Möchten Sie Factsheets für alle Lehrer generieren und deren Passwörter zurücksetzen?";
      if (status.has_run_before) {
        confirmMsg = "⚠️ WARNUNG: Factsheets wurden bereits einmal generiert! Ein erneuter Reset macht ALLE bestehenden Lehrer-Logins sofort ungültig. Wirklich fortfahren?";
      }

      if (!confirm(confirmMsg)) return;

      const { data } = await fetchAuth("/api/admin/factsheets/teachers", { 
        method: "POST",
        body: JSON.stringify({ force: true })
      });
      
      toast.success(`${data.count} Lehrer-Konten wurden zurückgesetzt.`);
      console.log("Teacher Factsheets:", data.teachers);
      
      // Trigger a download or display results in a modal here
    } catch (err: any) {
      if (err.status === 409) {
        toast.error("Aktion blockiert", { description: err.message });
      } else {
        toast.error("Mass-Reset fehlgeschlagen", { description: err.message });
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col md:flex-row gap-4 items-stretch">
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Klasse registrieren</h2>
          </div>
          <form onSubmit={handleCreateClass} className="p-6 flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Klassenbezeichnung</label>
              <input
                type="text"
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="z.B. 2a"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-8 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 text-sm"
            >
              Anlegen
            </button>
          </form>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-center items-center gap-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lehrer-Bereich</h3>
          <button 
            onClick={handleResetTeachers}
            className="flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-4 py-2 rounded-xl text-xs font-bold transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Alle Lehrer Factsheets & Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => handleShowRoster(c)}
            className={`bg-slate-900 border p-6 rounded-3xl flex flex-col items-center justify-center gap-1 transition-all group ${
              selectedClass?.id === c.id ? "border-indigo-500 bg-indigo-500/5" : "border-slate-800 hover:border-slate-600"
            }`}
          >
            <span className={`text-2xl font-black transition-colors ${selectedClass?.id === c.id ? "text-indigo-400" : "text-white group-hover:text-indigo-300"}`}>
              {c.name}
            </span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Wählen</span>
          </button>
        ))}
      </div>

      {selectedClass && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden animate-in slide-in-from-top-4 duration-500">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Klassenliste: {selectedClass.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all">
                <FileText className="w-3.5 h-3.5" />
                Factsheets drucken
              </button>
              <button 
                onClick={() => setSelectedClass(null)}
                className="p-1.5 text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-0">
            {isRosterLoading ? (
              <div className="p-12 text-center text-slate-500 animate-pulse text-sm">Lade Liste...</div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-slate-950/50">
                  <tr className="text-[10px] font-bold text-slate-500 uppercase">
                    <th className="px-6 py-3">Schüler</th>
                    <th className="px-6 py-3">Benutzername</th>
                    <th className="px-6 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {roster.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/20">
                      <td className="px-6 py-4 text-sm font-bold text-slate-200">{u.full_name}</td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-500">{u.username}</td>
                      <td className="px-6 py-4 text-right">
                        {u.requires_password_change ? (
                          <span className="text-[9px] bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded font-bold border border-amber-500/20">Initital</span>
                        ) : (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-bold border border-emerald-500/20">Aktiv</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {roster.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-500 italic text-sm">Keine Schüler in dieser Klasse gefunden.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
