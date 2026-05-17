"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Pupil } from "@/types";

interface PupilChipProps {
  pupil: Pupil;
  /** Display label — first name only, or "First L." if duplicates exist */
  label: string;
  /** Current room name for tooltip context */
  roomName?: string;
  mini?: boolean;
}

export default function PupilChip({ pupil, label, roomName, mini }: PupilChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pupil.id,
  });

  const style: React.CSSProperties = {
    transform: transform ? CSS.Translate.toString(transform) : undefined,
    touchAction: "none",
    zIndex: isDragging ? 50 : undefined,
  };

  const arrived = pupil.arrived_status;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      title={`${pupil.name}${roomName ? ` · ${roomName}` : ""}`}
      className={`inline-flex items-center select-none cursor-grab active:cursor-grabbing transition-all duration-100 ${
        mini
          ? "px-1.5 py-0.5 rounded text-[9px] font-semibold"
          : "px-2 py-1 rounded-lg text-[10px] font-bold"
      } border ${
        isDragging
          ? "opacity-50 scale-90 border-indigo-400 bg-indigo-950/50 text-indigo-200"
          : arrived
          ? "bg-emerald-950/40 border-emerald-800/50 text-emerald-300"
          : "bg-slate-800/80 border-slate-700/60 text-slate-300 hover:border-slate-500 hover:text-white"
      }`}
    >
      {label}
    </div>
  );
}
