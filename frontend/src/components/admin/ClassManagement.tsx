"use client";

import { Building2 } from "lucide-react";

import { SchoolClass } from "@/types";

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
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
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
            Klasse anlegen
          </button>
        </form>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {classes.map((c) => (
          <div
            key={c.id}
            className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-indigo-500/50 transition-all group"
          >
            <span className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors">{c.name}</span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Klasse</span>
          </div>
        ))}
      </div>
    </div>
  );
}
