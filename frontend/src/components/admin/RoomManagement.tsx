"use client";

import { useState } from "react";
import { Building2, Edit2, Trash2 } from "lucide-react";
import { fetchAuth } from "@/utils/fetchAuth";
import { toast } from "sonner";
import { Room } from "@/types";

interface RoomManagementProps {
  rooms: Room[];
  newRoomName: string;
  setNewRoomName: (name: string) => void;
  handleCreateRoom: (e: React.FormEvent) => void;
  handleDeleteRoom: (id: number, name: string) => void;
  editingRoomId: number | null;
  setEditingRoomId: (id: number | null) => void;
  editingRoomName: string;
  setEditingRoomName: (name: string) => void;
  refetch: () => void;
  isLoading: boolean;
}

export function RoomManagement({
  rooms,
  newRoomName,
  setNewRoomName,
  handleCreateRoom,
  handleDeleteRoom,
  editingRoomId,
  setEditingRoomId,
  editingRoomName,
  setEditingRoomName,
  refetch,
  isLoading
}: RoomManagementProps) {
  const [editingCapacity, setEditingCapacity] = useState<string>("");

  const handleUpdateRoom = async (id: number) => {
    try {
      await fetchAuth(`/api/admin/rooms/${id}/capacity`, {
        method: "PUT",
        body: JSON.stringify({ 
          name: editingRoomName, 
          capacity: parseInt(editingCapacity) || null 
        }),
      });
      toast.success(`Raum "${editingRoomName}" aktualisiert.`);
      setEditingRoomId(null);
      refetch();
    } catch (err: any) {
      toast.error("Aktualisierung fehlgeschlagen", { description: err.message });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Raumkonfiguration</h2>
        </div>
        <form onSubmit={handleCreateRoom} className="p-6 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Neuer Raumname</label>
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="z.B. IT-Saal 1"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-8 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 text-sm"
          >
            Raum hinzufügen
          </button>
        </form>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">Raumname</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-center">Kapazität</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rooms.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    {editingRoomId === r.id ? (
                      <input
                        type="text"
                        value={editingRoomName}
                        onChange={(e) => setEditingRoomName(e.target.value)}
                        className="bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-sm text-white focus:outline-none w-full max-w-[200px]"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm font-bold text-slate-200">{r.name}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {editingRoomId === r.id ? (
                      <input
                        type="number"
                        value={editingCapacity}
                        onChange={(e) => setEditingCapacity(e.target.value)}
                        className="bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-sm text-white focus:outline-none w-20 text-center"
                        placeholder="∞"
                      />
                    ) : (
                      <span className="text-xs font-mono text-slate-400">{r.capacity || "Unbegrenzt"}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {editingRoomId === r.id ? (
                        <>
                          <button
                            onClick={() => handleUpdateRoom(r.id)}
                            className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded"
                          >
                            Speichern
                          </button>
                          <button
                            onClick={() => setEditingRoomId(null)}
                            className="text-[10px] font-bold text-slate-500 hover:text-slate-300"
                          >
                            Abbrechen
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingRoomId(r.id);
                              setEditingRoomName(r.name);
                              setEditingCapacity(String(r.capacity || ""));
                            }}
                            className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRoom(r.id, r.name)}
                            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
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
