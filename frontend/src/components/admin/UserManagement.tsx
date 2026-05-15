"use client";

import { useState } from "react";
import { UserPlus, Trash2, Key, Edit2 } from "lucide-react";

import { User, UserRole } from "@/types";

interface UserManagementProps {
  users: User[];
  newUser: { username: string; full_name: string; role: string };
  setNewUser: React.Dispatch<React.SetStateAction<{ username: string; full_name: string; role: string }>>;
  handleCreateUser: (e: React.FormEvent) => void;
  handleResetPassword: (id: number, name: string) => void;
  handleDeleteUser: (id: number, name: string) => void;
  handleUpdateRole: (userId: number, userName: string, newRole: string) => void;
  isLoading: boolean;
}

export function UserManagement({
  users,
  newUser,
  setNewUser,
  handleCreateUser,
  handleResetPassword,
  handleDeleteUser,
  handleUpdateRole,
  isLoading
}: UserManagementProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Benutzerkonto erstellen</h2>
        </div>
        <form onSubmit={handleCreateUser} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Benutzername (Login)</label>
            <input
              type="text"
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="z.B. m.mustermann"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Anzeigename (Vollständig)</label>
            <input
              type="text"
              value={newUser.full_name}
              onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Max Mustermann"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Rolle</label>
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="teacher">Lehrperson</option>
              <option value="admin">Administrator</option>
              <option value="lernwerkstatt">Lernwerkstatt-Aufsicht</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 text-sm"
          >
            Benutzer anlegen
          </button>
        </form>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
          <Edit2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Bestehende Konten</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">Benutzer</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-center">Rolle</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-200">{u.full_name}</span>
                      <span className="text-[11px] font-mono text-slate-500">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <select
                      value={u.role}
                      disabled={u.isUpdatingRole}
                      onChange={(e) => handleUpdateRole(u.id, u.full_name, e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-bold text-indigo-400 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value="teacher">Lehrer</option>
                      <option value="admin">Admin</option>
                      <option value="lernwerkstatt">LW-Aufsicht</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleResetPassword(u.id, u.full_name)}
                        className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all"
                        title="Passwort zurücksetzen"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id, u.full_name)}
                        className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"
                        title="Benutzer löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
