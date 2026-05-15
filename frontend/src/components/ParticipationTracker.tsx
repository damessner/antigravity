"use client";

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAuth } from "@/utils/fetchAuth";
import { ParticipationLog, Subject, Pupil } from "@/types";
import { toast } from "sonner";

interface ParticipationTrackerProps {
  subjects: Subject[];
  pupils: Pupil[];
  /** Currently viewed class ID */
  classId: number;
}

const RATING_CONFIG = {
  excellent: { icon: "💎", label: "Ausgezeichnet", color: "bg-indigo-600 border-indigo-500 text-white" },
  engaged: { icon: "✅", label: "Aktiv", color: "bg-emerald-700 border-emerald-500 text-white" },
  passive: { icon: "⚠️", label: "Passiv", color: "bg-amber-700 border-amber-500 text-white" },
} as const;

type Rating = keyof typeof RATING_CONFIG;

export default function ParticipationTracker({ subjects, pupils, classId }: ParticipationTrackerProps) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    subjects.length > 0 ? subjects[0].id : null
  );
  const [lessonDate, setLessonDate] = useState(today);
  const [batchWeekStart, setBatchWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  });

  const classPupils = pupils.filter((p) => Number(p.class_id) === Number(classId));

  const { data: logs = [], isLoading } = useQuery<ParticipationLog[]>({
    queryKey: ["participation", selectedSubjectId, lessonDate],
    queryFn: async () => {
      if (!selectedSubjectId) return [];
      const { data } = await fetchAuth(
        `/api/participation?subject_id=${selectedSubjectId}&date=${lessonDate}`
      );
      return data as ParticipationLog[];
    },
    enabled: !!selectedSubjectId,
    staleTime: 5_000,
  });

  const tapMutation = useMutation({
    mutationFn: async ({ pupilId, rating }: { pupilId: number; rating?: Rating }) => {
      const { data } = await fetchAuth("/api/participation", {
        method: "POST",
        body: JSON.stringify({
          pupil_id: pupilId,
          subject_id: selectedSubjectId,
          lesson_date: lessonDate,
          rating: rating ?? undefined,
        }),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["participation", selectedSubjectId, lessonDate] });
    },
    onError: () => toast.error("Eintrag konnte nicht gespeichert werden"),
  });

  const batchMutation = useMutation({
    mutationFn: async () => {
      const { data } = await fetchAuth("/api/participation/batch-apply", {
        method: "POST",
        body: JSON.stringify({ subject_id: selectedSubjectId, week_start: batchWeekStart }),
      });
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Batch angewendet");
      queryClient.invalidateQueries({ queryKey: ["participation"] });
    },
    onError: () => toast.error("Batch-Anwendung fehlgeschlagen"),
  });

  const getRatingForPupil = useCallback(
    (pupilId: number): Rating | null => {
      const log = logs.find((l) => Number(l.pupil_id) === Number(pupilId));
      return (log?.rating as Rating) || null;
    },
    [logs]
  );

  if (subjects.length === 0) {
    return (
      <div className="text-slate-400 text-sm p-4">
        Keine Fächer für diese Klasse gefunden.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedSubjectId ?? ""}
          onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
          className="bg-slate-900 border border-slate-800 text-white text-xs font-bold rounded-lg px-3 py-2 outline-none min-h-[44px]"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={lessonDate}
          onChange={(e) => setLessonDate(e.target.value)}
          className="bg-slate-900 border border-slate-800 text-white text-xs rounded-lg px-3 py-2 outline-none min-h-[44px]"
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {(Object.entries(RATING_CONFIG) as [Rating, (typeof RATING_CONFIG)[Rating]][]).map(
          ([key, cfg]) => (
            <span key={key} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
          )
        )}
        <span className="text-xs text-slate-500 italic">Tipp: Einmal tippen zykliert durch die Stufen</span>
      </div>

      {/* Pupil List */}
      {isLoading ? (
        <div className="text-slate-400 text-sm">Lade Einträge...</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {classPupils.map((pupil) => {
            const rating = getRatingForPupil(pupil.id);
            const cfg = rating ? RATING_CONFIG[rating] : null;

            return (
              <button
                key={pupil.id}
                type="button"
                onClick={() => tapMutation.mutate({ pupilId: pupil.id })}
                disabled={tapMutation.isPending}
                className={`flex flex-col items-center justify-center gap-1 min-h-[72px] rounded-2xl border-2 p-3 text-center transition-all active:scale-95 ${
                  cfg
                    ? cfg.color + " shadow-lg"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-600"
                }`}
                title={`Tippen zum Wechseln: ${pupil.name}`}
              >
                <span className="text-xl leading-none">{cfg?.icon ?? "○"}</span>
                <span className="text-[10px] font-bold leading-tight text-center truncate max-w-full">
                  {pupil.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Batch Apply */}
      <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-300 mb-1">Wochennoten eintragen</p>
          <p className="text-[10px] text-slate-500">
            Konvertiert alle Einträge der Woche in eine Mitarbeitsnote.
          </p>
        </div>
        <input
          type="date"
          value={batchWeekStart}
          onChange={(e) => setBatchWeekStart(e.target.value)}
          className="bg-slate-900 border border-slate-800 text-white text-xs rounded-lg px-3 py-2 outline-none min-h-[44px]"
        />
        <button
          onClick={() => batchMutation.mutate()}
          disabled={batchMutation.isPending || !selectedSubjectId}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold min-h-[44px] transition-all disabled:opacity-50"
        >
          Batch anwenden
        </button>
      </div>
    </div>
  );
}
