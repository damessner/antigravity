import { useState } from "react";
import { Building2, Users, FileText, AlertTriangle, RefreshCw, X, Trash2 } from "lucide-react";
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

  const [showAddPupil, setShowAddPupil] = useState(false);
  const [availablePupils, setAvailablePupils] = useState<User[]>([]);
  const [selectedPupilId, setSelectedPupilId] = useState<string>("");

  const [classView, setClassView] = useState<"roster" | "subjects">("roster");
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: "", abbreviation: "", teacher_id: "", second_teacher_id: "" });
 
  const handleShowClassData = async (c: SchoolClass) => {
    setSelectedClass(c);
    setIsRosterLoading(true);
    setShowAddPupil(false);
    setShowAddSubject(false);
    try {
      // Load Roster
      const { data: rosterData } = await fetchAuth(`/api/admin/classes/${c.id}/roster`);
      setRoster(rosterData || []);
      
      // Load Subjects
      const { data: subjectsData } = await fetchAuth(`/api/admin/classes/${c.id}/subjects`);
      setSubjects(subjectsData || []);
 
      // Load Teachers
      const { data: allUsers } = await fetchAuth("/api/users");
      const teachersList = allUsers.filter((u: User) => u.role === "teacher");
      setTeachers(teachersList);
 
      // Load Available Pupils
      const unassigned = allUsers.filter((u: User) => u.role === "pupil");
      setAvailablePupils(unassigned);
    } catch (err) {
      toast.error("Klassendaten konnten nicht geladen werden");
    } finally {
      setIsRosterLoading(false);
    }
  };
 
  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass) return;
    try {
      await fetchAuth("/api/admin/subjects", {
        method: "POST",
        body: JSON.stringify({ ...newSubject, class_id: selectedClass.id })
      });
      toast.success("Fach angelegt");
      setShowAddSubject(false);
      setNewSubject({ name: "", abbreviation: "", teacher_id: "", second_teacher_id: "" });
      handleShowClassData(selectedClass);
    } catch (err) {
      toast.error("Fach konnte nicht erstellt werden");
    }
  };
 
  const handleDeleteSubject = async (id: number) => {
    if (!confirm("Dieses Fach wirklich löschen? Alle zugehörigen Noten gehen verloren!")) return;
    try {
      await fetchAuth(`/api/admin/subjects/${id}`, { method: "DELETE" });
      toast.success("Fach gelöscht");
      if (selectedClass) handleShowClassData(selectedClass);
    } catch (err) {
      toast.error("Löschen fehlgeschlagen");
    }
  };
 
  const handleAssignPupil = async () => {
    if (!selectedClass || !selectedPupilId) return;
    try {
      await fetchAuth(`/api/admin/pupils/${selectedPupilId}/assign`, {
        method: "POST",
        body: JSON.stringify({ class_id: selectedClass.id })
      });
      toast.success("Schüler zugeordnet");
      setSelectedPupilId("");
      setShowAddPupil(false);
      handleShowClassData(selectedClass);
    } catch (err) {
      toast.error("Zuordnung fehlgeschlagen");
    }
  };
 
  const handleUnassignPupil = async (pupilId: number) => {
    if (!confirm("Schüler aus dieser Klasse entfernen?")) return;
    try {
      const { data: pupilRecords } = await fetchAuth("/api/pupils");
      const pupilRecord = pupilRecords.find((p: any) => Number(p.user_id) === Number(pupilId));
      if (!pupilRecord) throw new Error("Pupil record not found");
 
      await fetchAuth(`/api/admin/pupils/${pupilRecord.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ class_id: null })
      });
      toast.success("Schüler entfernt");
      if (selectedClass) handleShowClassData(selectedClass);
    } catch (err) {
      toast.error("Entfernen fehlgeschlagen");
    }
  };
 
  const handleResetTeachers = async () => {
    try {
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
    } catch (err: any) {
      toast.error("Aktion fehlgeschlagen");
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
            onClick={() => handleShowClassData(c)}
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
          <div className="px-6 py-2 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between">
            <div className="flex gap-4">
              <button 
                onClick={() => setClassView("roster")}
                className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${classView === "roster" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
              >
                Klassenliste
              </button>
              <button 
                onClick={() => setClassView("subjects")}
                className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${classView === "subjects" ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
              >
                Fächer & Lehrer
              </button>
            </div>
            <button 
              onClick={() => setSelectedClass(null)}
              className="p-1.5 text-slate-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
 
          {classView === "roster" ? (
            <>
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Klassenliste: {selectedClass.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowAddPupil(!showAddPupil)}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Schüler hinzufügen
                  </button>
                </div>
              </div>
              
              {showAddPupil && (
                <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center gap-4 animate-in slide-in-from-top-2 duration-300">
                  <div className="flex-1">
                    <select
                      value={selectedPupilId}
                      onChange={(e) => setSelectedPupilId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Schüler wählen --</option>
                      {availablePupils
                        .filter(p => !roster.some(r => r.id === p.id))
                        .sort((a, b) => a.full_name.localeCompare(b.full_name))
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.full_name} ({p.username})</option>
                        ))
                      }
                    </select>
                  </div>
                  <button
                    onClick={handleAssignPupil}
                    disabled={!selectedPupilId}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Zuordnen
                  </button>
                </div>
              )}
 
              <div className="p-0">
                {isRosterLoading ? (
                  <div className="p-12 text-center text-slate-500 animate-pulse text-sm">Lade Liste...</div>
                ) : (
                  <table className="w-full text-left">
                    <thead className="bg-slate-950/50">
                      <tr className="text-[10px] font-bold text-slate-500 uppercase">
                        <th className="px-6 py-3">Schüler</th>
                        <th className="px-6 py-3">Benutzername</th>
                        <th className="px-6 py-3 text-right">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {roster.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-800/20 group">
                          <td className="px-6 py-4 text-sm font-bold text-slate-200">{u.full_name}</td>
                          <td className="px-6 py-4 text-xs font-mono text-slate-500">{u.username}</td>
                          <td className="px-6 py-4 text-right flex items-center justify-end gap-3">
                            <button
                              onClick={() => handleUnassignPupil(u.id)}
                              className="p-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                              title="Aus Klasse entfernen"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Fächer & Lehrer: {selectedClass.name}</h3>
                </div>
                <button 
                  onClick={() => setShowAddSubject(!showAddSubject)}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Fach anlegen
                </button>
              </div>
 
              {showAddSubject && (
                <form onSubmit={handleCreateSubject} className="p-6 bg-slate-950 border-b border-slate-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end animate-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Fachname</label>
                    <input
                      type="text"
                      required
                      value={newSubject.name}
                      onChange={e => setNewSubject({...newSubject, name: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                      placeholder="Mathematik"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Kürzel</label>
                    <input
                      type="text"
                      value={newSubject.abbreviation}
                      onChange={e => setNewSubject({...newSubject, abbreviation: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                      placeholder="M"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Hauptlehrer</label>
                    <select
                      required
                      value={newSubject.teacher_id}
                      onChange={e => setNewSubject({...newSubject, teacher_id: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                    >
                      <option value="">-- Lehrer wählen --</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-xs font-bold">Speichern</button>
                    <button type="button" onClick={() => setShowAddSubject(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold">Abbrechen</button>
                  </div>
                </form>
              )}
 
              <div className="p-0">
                <table className="w-full text-left">
                  <thead className="bg-slate-950/50">
                    <tr className="text-[10px] font-bold text-slate-500 uppercase">
                      <th className="px-6 py-3">Fach</th>
                      <th className="px-6 py-3">Kürzel</th>
                      <th className="px-6 py-3">Lehrer</th>
                      <th className="px-6 py-3 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {subjects.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-800/20 group">
                        <td className="px-6 py-4 text-sm font-bold text-slate-200">{s.name}</td>
                        <td className="px-6 py-4 text-xs font-mono text-indigo-400 font-bold">{s.abbreviation}</td>
                        <td className="px-6 py-4 text-sm text-slate-400">{s.teacher_name}</td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteSubject(s.id)}
                            className="p-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
