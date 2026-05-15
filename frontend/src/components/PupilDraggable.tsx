"use client";

import { useState, useEffect } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Socket } from "socket.io-client";
import { Clock, CheckCircle2, Circle } from "lucide-react";
import { Pupil } from "@/types";


// Stand-Alone High-Performance TimerBadge Sub-Component
function TimerBadge({ startedAtMs, minutes }: { startedAtMs: number; minutes: number }) {
  const [timeLeftStr, setTimeLeftStr] = useState<string>("--");
  const [timeLeft, setTimeLeft] = useState<number>(1);

  useEffect(() => {
    if (!startedAtMs || !minutes) return;
    const startMs = Number(startedAtMs);
    if (Number.isNaN(startMs)) return;
    const durationMs = minutes * 60 * 1000;
    const endMs = startMs + durationMs;

    const tick = () => {
      const remainSec = Math.ceil((endMs - Date.now()) / 1000);
      setTimeLeft(remainSec);

      if (remainSec > 0) {
        const m = Math.floor(remainSec / 60);
        const s = remainSec % 60;
        setTimeLeftStr(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      } else {
        const overSec = Math.abs(remainSec);
        const m = Math.floor(overSec / 60);
        const s = overSec % 60;
        setTimeLeftStr(`+${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
      }
    };

    tick();
    const timerId = setInterval(tick, 1000);
    return () => clearInterval(timerId);
  }, [startedAtMs, minutes]);

  // Farb-Logik (Tailwind v4) exakt nach Vorgabe
  let badgeStyle = "bg-green-100 text-green-700 border-green-200";
  if (timeLeft <= 0) {
    badgeStyle = "bg-red-100 text-red-700 border-red-200 animate-pulse font-extrabold";
  } else if (timeLeft <= 300) {
    badgeStyle = "bg-yellow-100 text-yellow-700 border-yellow-200";
  }

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border whitespace-nowrap shrink-0 shadow-2xs ${badgeStyle}`}>
      <Clock className={`w-2.5 h-2.5 shrink-0 ${timeLeft > 0 ? "animate-spin" : ""}`} />
      <span>{timeLeftStr}</span>
    </span>
  );
}

interface PupilDraggableProps {
  pupil: Pupil;
  masteryTags: string[];
  socket: Socket | null;
  onOpenTimer: () => void;
  onOpenComment: () => void;
}

export default function PupilDraggable({
  pupil,
  masteryTags,
  socket,
  onOpenTimer,
  onOpenComment,
}: PupilDraggableProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: pupil.id,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    touchAction: "none",
    transitionDuration: isDragging ? "0ms" : "150ms",
    transitionTimingFunction: "cubic-bezier(0.18, 0.89, 0.32, 1.28)",
    zIndex: isDragging ? 50 : undefined,
  };

  const handleToggleArrived = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!socket) return;
    socket.emit("toggle_arrived_status", {
      pupilId: pupil.id,
      status: pupil.arrived_status ? "pending" : "arrived",
    });
  };

  const handleTimerTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenTimer();
  };

  const resolvedStartedAtMs =
    typeof pupil.timer_started_at_ms === "number"
      ? pupil.timer_started_at_ms
      : pupil.timer_started_at
      ? new Date(pupil.timer_started_at).getTime()
      : undefined;

  const hasActiveTimer = !!resolvedStartedAtMs && Number(pupil.timer_minutes) > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpenComment}
      className={`group relative flex items-center justify-between p-2.5 rounded-xl border transition-all duration-150 select-none cursor-grab active:cursor-grabbing ${
        isDragging
          ? "opacity-60 scale-95 border-indigo-500 bg-indigo-950/30 shadow-md"
          : pupil.arrived_status
          ? "bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700"
          : "bg-slate-900 border-slate-700/60 text-white hover:border-slate-600 shadow-xs"
      }`}
    >
      {/* Left section: Checkbox + Identifiers */}
      <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
        <button
          type="button"
          onClick={handleToggleArrived}
          className="text-slate-500 hover:text-indigo-400 transition-colors shrink-0 p-0.5 focus:outline-none"
          title={pupil.arrived_status ? "Auf anwesend gesetzt" : "Als wartend/unterwegs markiert"}
        >
          {pupil.arrived_status ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-950" />
          ) : (
            <Circle className="w-4 h-4 text-slate-600" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          {/* Header row inline-flex wrapping student name and standalone timer badge */}
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-bold text-xs truncate max-w-[110px] sm:max-w-[140px]">
              {pupil.name}
            </span>
            <span className="px-1 py-0.2 rounded text-[8px] font-extrabold bg-slate-950 text-slate-400 border border-slate-800 shrink-0">
              {pupil.class_name}
            </span>
            {/* Standalone independent animated badge */}
            {hasActiveTimer && resolvedStartedAtMs && <TimerBadge startedAtMs={resolvedStartedAtMs} minutes={Number(pupil.timer_minutes)} />}
          </div>

          {/* Mastery Tags Row Section 8 */}
          {masteryTags.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {masteryTags.map((tagStr, i) => (
                <span
                  key={i}
                  className="bg-slate-950/80 px-1 py-0.2 rounded text-[9px] font-mono text-slate-300 tracking-tight"
                >
                  {tagStr}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right section: Trigger action icons */}
      <div className="shrink-0 pl-1 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={handleTimerTrigger}
          className={`p-1 rounded transition-colors focus:outline-none ${
            hasActiveTimer ? "text-indigo-400 hover:text-indigo-300" : "text-slate-700 hover:text-slate-400"
          }`}
          title="Countdown-Timer anpassen"
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
