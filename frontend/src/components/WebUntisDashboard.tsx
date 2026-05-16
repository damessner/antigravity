"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, CalendarDays, AlertTriangle, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { fetchAuth } from "@/utils/fetchAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimetableEntry {
  id: number;
  date: number;          // YYYYMMDD
  startTime: number;     // HHMM (e.g. 755)
  endTime: number;
  su: { id: number; name: string; longname?: string }[];   // subjects
  te: { id: number; name: string; longname?: string }[];   // teachers
  ro: { id: number; name: string; longname?: string }[];   // rooms
  kl: { id: number; name: string; longname?: string }[];   // classes
  code?: string;         // "cancelled" | "irregular" | undefined
}

interface Substitution {
  id: number;
  date: number;
  startTime: number;
  endTime: number;
  type: string;          // "cancel" | "subst" | "add" | ...
  subject?: { id: number; name: string; longname?: string };
  classes?: { id: number; name: string }[];
  teachers?: { id: number; name: string }[];
  text?: string;
}

interface SchoolClass {
  id: number;
  name: string;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

const formatTime = (t: number): string => {
  const s = String(t).padStart(4, "0");
  return `${s.slice(0, 2)}:${s.slice(2)}`;
};

const untisDateToStr = (d: number): string => {
  const s = String(d);
  return `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`;
};

const DAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const untisDateToDayName = (d: number): string => {
  const s = String(d);
  const date = new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8))
  );
  return DAY_NAMES[date.getDay()];
};

// ─── Substitution List ────────────────────────────────────────────────────────

function SubstitutionList() {
  const [subs, setSubs] = useState<Substitution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await fetchAuth("/api/webuntis/substitutions");
      setSubs(data.substitutions || []);
    } catch (err: any) {
      setError(err.message || "Vertretungen konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      cancel:    "Entfall",
      subst:     "Vertretung",
      add:       "Zusatzstunde",
      shift:     "Verlegung",
      roomsubst: "Raumänderung",
      standby:   "Bereitschaft",
    };
    return map[type] || type;
  };

  const typeColor = (type: string) => {
    if (type === "cancel")    return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    if (type === "subst")     return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    if (type === "add")       return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    return "text-slate-400 bg-slate-500/10 border-slate-500/20";
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Vertretungsplan — Heute
        </h3>
        <button
          onClick={load}
          disabled={isLoading}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          title="Aktualisieren"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Lädt…
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
          <p className="text-rose-400 text-xs">{error}</p>
          <button
            onClick={load}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            Erneut versuchen
          </button>
        </div>
      ) : subs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic">
          Keine Vertretungen für heute
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {subs.map((sub) => (
            <div
              key={sub.id}
              className="bg-slate-950/60 border border-slate-800/60 rounded-xl px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${typeColor(sub.type)}`}>
                      {typeLabel(sub.type)}
                    </span>
                    {sub.classes && sub.classes.length > 0 && (
                      <span className="text-[10px] text-indigo-300 font-mono">
                        {sub.classes.map((c) => c.name).join(", ")}
                      </span>
                    )}
                  </div>
                  {sub.subject && (
                    <p className="text-xs text-white font-medium mt-1">{sub.subject.longname || sub.subject.name}</p>
                  )}
                  {sub.teachers && sub.teachers.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Lehrer: {sub.teachers.map((t) => t.name).join(", ")}
                    </p>
                  )}
                  {sub.text && (
                    <p className="text-[10px] text-slate-500 italic mt-0.5">{sub.text}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-mono text-slate-400">{formatTime(sub.startTime)}</p>
                  <p className="text-[10px] font-mono text-slate-500">–{formatTime(sub.endTime)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Timetable View ───────────────────────────────────────────────────────────

function TimetableView({ classes }: { classes: SchoolClass[] }) {
  const [selectedClassId, setSelectedClassId] = useState<number | null>(
    classes.length > 0 ? classes[0].id : null
  );
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (classId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await fetchAuth(`/api/webuntis/timetable/${classId}`);
      setTimetable(data.timetable || []);
    } catch (err: any) {
      setError(err.message || "Stundenplan konnte nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClassId) load(selectedClassId);
  }, [selectedClassId, load]);

  // Group by day
  const byDay = timetable.reduce<Record<number, TimetableEntry[]>>((acc, entry) => {
    if (!acc[entry.date]) acc[entry.date] = [];
    acc[entry.date].push(entry);
    return acc;
  }, {});
  const days = Object.keys(byDay).map(Number).sort();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-white flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-400" />
          Wochenplan
        </h3>
        {selectedClassId && (
          <button
            onClick={() => load(selectedClassId)}
            disabled={isLoading}
            className="text-slate-500 hover:text-slate-300 transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {/* Class selector */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {classes.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedClassId(c.id)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              selectedClassId === c.id
                ? "bg-indigo-600 text-white"
                : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Lädt…
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
          <p className="text-rose-400 text-xs">{error}</p>
          {selectedClassId && (
            <button
              onClick={() => load(selectedClassId)}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Erneut versuchen
            </button>
          )}
        </div>
      ) : days.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-xs italic">
          Keine Stundenplan-Daten für diese Woche
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <div className="flex gap-2 min-w-max">
            {days.map((day) => (
              <div key={day} className="flex flex-col gap-1.5" style={{ minWidth: "120px" }}>
                <div className="bg-slate-800 rounded-lg px-2 py-1 text-center">
                  <p className="text-[10px] font-bold text-slate-300">{untisDateToDayName(day)}</p>
                  <p className="text-[9px] text-slate-500">{untisDateToStr(day)}</p>
                </div>
                {(byDay[day] || [])
                  .sort((a, b) => a.startTime - b.startTime)
                  .map((entry) => {
                    const cancelled = entry.code === "cancelled";
                    return (
                      <div
                        key={entry.id}
                        className={`rounded-lg px-2 py-1.5 border text-[10px] ${
                          cancelled
                            ? "bg-rose-950/30 border-rose-500/20 opacity-60"
                            : "bg-slate-900/60 border-slate-800/60"
                        }`}
                      >
                        <p className="font-mono text-slate-400">
                          {formatTime(entry.startTime)}–{formatTime(entry.endTime)}
                        </p>
                        <p className={`font-bold ${cancelled ? "line-through text-rose-400" : "text-white"}`}>
                          {entry.su?.[0]?.name || "–"}
                        </p>
                        <p className="text-slate-500">
                          {entry.te?.[0]?.name || ""}
                          {entry.ro?.[0]?.name ? ` · ${entry.ro[0].name}` : ""}
                        </p>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard Component ─────────────────────────────────────────────────

interface WebUntisDashboardProps {
  classes: SchoolClass[];
}

export default function WebUntisDashboard({ classes }: WebUntisDashboardProps) {
  const [activeView, setActiveView] = useState<"substitutions" | "timetable">("substitutions");

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80 w-fit">
        <button
          onClick={() => setActiveView("substitutions")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeView === "substitutions"
              ? "bg-slate-800 text-white shadow-xs"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          Vertretungsplan
        </button>
        <button
          onClick={() => setActiveView("timetable")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeView === "timetable"
              ? "bg-slate-800 text-white shadow-xs"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          Wochenplan
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-4">
        {activeView === "substitutions" && <SubstitutionList />}
        {activeView === "timetable" && <TimetableView classes={classes} />}
      </div>
    </div>
  );
}
