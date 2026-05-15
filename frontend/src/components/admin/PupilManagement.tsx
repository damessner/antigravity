"use client";

import { GraduationCap, Trash2 } from "lucide-react";

import { Pupil, SchoolClass } from "@/types";

interface PupilManagementProps {
  pupils: Pupil[];
  classes: SchoolClass[];
  newPupil: { full_name: string; class_id: string };
  setNewPupil: React.Dispatch<React.SetStateAction<{ full_name: string; class_id: string }>>;
  handleCreatePupil: (e: React.FormEvent) => void;
  handleDeletePupil: (id: number, name: string) => void;
  isLoading: boolean;
}

export function PupilManagement({
  pupils,
  classes,
  newPupil,
  setNewPupil,
  handleCreatePupil,
  handleDeletePupil,
  isLoading
}: PupilManagementProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Schüleraufnahme</h2>
        </div>
        <form onSubmit={handleCreatePupil} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Name des Schülers</label>
            <input
              type="text"
              value={newPupil.full_name}
              onChange={(e) => setNewPupil({ ...newPupil, full_name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Vorname Nachname"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Stammklasse</label>
            <select
              value={newPupil.class_id}
              onChange={(e) => setNewPupil({ ...newPupil, class_id: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              required
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Klasse {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 text-sm"
          >
            Schüler registrieren
          </button>
        </form>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Registrierte Schüler</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">Name</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-center">Klasse</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-center">Login (ID)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {pupils.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-bold text-slate-200">{p.name}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-black uppercase">
                      {p.class_name}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-[11px] font-mono text-slate-500">{p.username}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeletePupil(p.id, p.name)}
                      className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"
                      title="Schüler abmelden"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
