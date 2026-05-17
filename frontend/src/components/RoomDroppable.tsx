"use client";

import { useDroppable } from "@dnd-kit/core";
import { Room, Pupil } from "@/types";
import PupilChip from "./PupilChip";
import LernwerkstattDashboard from "./LernwerkstattDashboard";

interface RoomDroppableProps {
  room: Room;
  totalCount: number;
  classCount: number;
  selectedClass: string;
  /** Pupils in the TimeOut sub-room (only used for the Lernwerkstatt room) */
  timeoutPupils?: Pupil[];
  /** The TimeOut room object (for drop target) */
  timeoutRoom?: Room;
  /** Chip label lookup by pupil id */
  chipLabels?: Record<number, string>;
  /** All pupils currently in this room, used for other-class count */
  roomPupils?: Pupil[];
  children: React.ReactNode;
}

/** Returns Tailwind classes for a capacity badge based on fill percentage. */
function getCapacityStyle(count: number, capacity: number | undefined): string {
  if (!capacity) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  const pct = count / capacity;
  if (pct >= 1) return "bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse";
  if (pct >= 0.75) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
  return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
}

export default function RoomDroppable({
  room,
  totalCount,
  classCount,
  selectedClass,
  timeoutPupils = [],
  timeoutRoom,
  chipLabels = {},
  roomPupils = [],
  children,
}: RoomDroppableProps) {
  const isLernwerkstatt = room.name === "Lernwerkstatt";
  const capacity = room.capacity ?? (isLernwerkstatt ? 24 : undefined);
  const isFull = capacity !== undefined && totalCount >= capacity;

  const { setNodeRef, isOver } = useDroppable({
    id: room.id,
    disabled: isFull,
  });

  // Separate drop target for the TimeOut sub-section inside Lernwerkstatt
  const { setNodeRef: setTimeoutRef, isOver: isOverTimeout } = useDroppable({
    id: timeoutRoom?.id ?? -1,
    disabled: !timeoutRoom,
  });

  const capacityStyle = getCapacityStyle(totalCount, capacity);

  let headerBg = "bg-slate-900/60";
  let borderStyle = "border-slate-800/80";

  if (isLernwerkstatt) {
    headerBg = "bg-cyan-950/20";
    borderStyle = isOver ? "border-cyan-500/60 bg-cyan-950/10" : "border-cyan-900/30";
  } else if (isOver) {
    borderStyle = "border-indigo-500/60 bg-indigo-950/10";
  }

  const otherClassCount = selectedClass === "all"
    ? 0
    : roomPupils.filter((p) => p.class_name !== selectedClass).length;

  return (
    <div
      ref={setNodeRef}
      className={`glass-panel flex flex-col overflow-hidden transition-all duration-200 ${borderStyle}`}
    >
      {/* Room Header */}
      <div className={`px-3 py-2.5 border-b border-slate-800/60 flex items-center justify-between gap-2 shrink-0 ${headerBg}`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-white tracking-wide truncate max-w-[140px] sm:max-w-[180px]">
            {room.name}
          </span>
          {room.is_special && !isLernwerkstatt && (
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">
              Sonder
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedClass !== "all" && classCount > 0 && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/50">
              Meine: {classCount}
            </span>
          )}
          {otherClassCount > 0 && selectedClass !== "all" && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-900 text-slate-500 border border-slate-800">
              +{otherClassCount}
            </span>
          )}
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${capacity ? capacityStyle : "bg-slate-950 text-slate-400 border-slate-800"}`}>
            {capacity ? `${totalCount} / ${capacity}` : `${totalCount}`}
          </span>
        </div>
      </div>

      {/* Main drop area — dynamically sized by content */}
      <div className="p-2.5 flex flex-col gap-2 min-h-[80px]">
        {children}
      </div>

      {/* TimeOut sub-section embedded in Lernwerkstatt */}
      {isLernwerkstatt && timeoutRoom && (
        <div
          ref={setTimeoutRef}
          className={`mx-2.5 mb-2.5 rounded-xl border transition-all duration-200 overflow-hidden ${
            isOverTimeout
              ? "border-rose-400/60 bg-rose-950/20"
              : "border-rose-900/40 bg-rose-950/10"
          }`}
        >
          <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-rose-900/30 bg-rose-950/20">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider">⚠️ TimeOut</span>
              <span className="text-[9px] text-rose-500">Arbeitsauftrag erforderlich</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
              timeoutPupils.length === 0
                ? "bg-slate-950 text-slate-600 border-slate-800"
                : "bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse"
            }`}>
              {timeoutPupils.length}
            </span>
          </div>

          {timeoutPupils.length > 0 ? (
            <div className="p-2 flex flex-wrap gap-1.5 min-h-[36px]">
              {timeoutPupils.map((p) => (
                <PupilChip
                  key={p.id}
                  pupil={p}
                  label={chipLabels[p.id] ?? p.name.split(" ")[0]}
                  roomName="TimeOut"
                  mini
                />
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-[9px] text-rose-900/70 italic min-h-[36px] flex items-center">
              Keine Schüler im TimeOut — hier ablegen zum Zuweisen
            </div>
          )}
        </div>
      )}

      {/* Lernwerkstatt snapshot drawer */}
      {isLernwerkstatt && (
        <div className="mt-auto border-t border-slate-800/80 bg-slate-950/60 p-2 shrink-0">
          <LernwerkstattDashboard />
        </div>
      )}
    </div>
  );
}
