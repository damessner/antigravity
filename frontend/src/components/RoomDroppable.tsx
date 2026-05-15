"use client";

import { useDroppable } from "@dnd-kit/core";
import { Room } from "@/types";

import LernwerkstattDashboard from "./LernwerkstattDashboard";

interface RoomDroppableProps {
  room: Room;
  totalCount: number;
  classCount: number;
  selectedClass: string;
  children: React.ReactNode;
}

export default function RoomDroppable({
  room,
  totalCount,
  classCount,
  selectedClass,
  children,
}: RoomDroppableProps) {
  const isLernwerkstatt = room.name === "Lernwerkstatt";
  const isFull = isLernwerkstatt && totalCount >= 24;

  const { setNodeRef, isOver } = useDroppable({
    id: room.id,
    disabled: isFull, // disable dropping dynamically if cap reached Section 8
  });

  // Calculate capacity color indicators Section 8
  let lwBadgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (isLernwerkstatt) {
    if (totalCount >= 24) {
      lwBadgeStyle = "bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse";
    } else if (totalCount >= 20) {
      lwBadgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/30";
    }
  }

  // Determine container styling depending on room type
  let headerBg = "bg-slate-900/60";
  let borderStyle = "border-slate-800/80";

  if (room.name === "TimeOut") {
    headerBg = "bg-rose-950/20";
    borderStyle = isOver ? "border-rose-500/60 bg-rose-950/10" : "border-rose-900/30";
  } else if (isLernwerkstatt) {
    headerBg = "bg-cyan-950/20";
    borderStyle = isOver ? "border-cyan-500/60 bg-cyan-950/10" : "border-cyan-900/30";
  } else if (isOver) {
    borderStyle = "border-indigo-500/60 bg-indigo-950/10";
  }

  return (
    <div
      ref={setNodeRef}
      className={`glass-panel flex flex-col h-full overflow-hidden transition-all duration-200 ${borderStyle}`}
    >
      {/* Room Header Banner */}
      <div className={`px-4 py-3 border-b border-slate-800/60 flex items-center justify-between gap-2 shrink-0 ${headerBg}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white tracking-wide truncate max-w-[140px] sm:max-w-[180px]">
            {room.name}
          </span>
          {room.name === "TimeOut" && <span className="text-[10px] text-rose-400 font-bold">⚠️ Begründung</span>}
        </div>

        {/* Dynamic Capacity / Count Badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          {selectedClass !== "all" && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/50">
              Meine: {classCount}
            </span>
          )}

          {isLernwerkstatt ? (
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${lwBadgeStyle}`}>
              {totalCount} / 24
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-950 text-slate-400 border border-slate-800">
              Gesamt: {totalCount}
            </span>
          )}
        </div>
      </div>

      {/* Main Pupil Draggable Items Target Container */}
      <div className="p-3 flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Embedded Snapshot Drawer Panel for Lernwerkstatt Section 8 */}
      {isLernwerkstatt && (
        <div className="mt-auto border-t border-slate-800/80 bg-slate-950/60 p-2 shrink-0">
          <LernwerkstattDashboard />
        </div>
      )}
    </div>
  );
}
