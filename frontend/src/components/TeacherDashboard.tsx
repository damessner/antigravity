"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { getApiUrl, getWsUrl } from "@/utils/apiDiscovery";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
  DndContext, DragEndEvent, useSensor, useSensors,
  PointerSensor, TouchSensor, closestCenter
} from "@dnd-kit/core";
import {
  LayoutDashboard, GraduationCap, ClipboardList, LogOut,
  Settings, Clock, Calendar, AlertCircle, RefreshCw, Bell
} from "lucide-react";

import RoomDroppable from "./RoomDroppable";
import PupilDraggable from "./PupilDraggable";
import TimerPopover from "./TimerPopover";
import TimeOutModal from "./TimeOutModal";
import PupilCommentModal from "./PupilCommentModal";
import Gradebook from "./Gradebook";
import DisciplinaryNotes from "./DisciplinaryNotes";
import StudentLernplaner from "./StudentLernplaner";
import HelpFeed from "./HelpFeed";

import { Pupil, Room, User } from "@/types";

const LESSON_SCHEDULE = [
  { nr: 1, start: "07:55", end: "08:45" },
  { nr: 2, start: "08:50", end: "09:40" },
  { nr: 3, start: "09:45", end: "10:35" },
  { nr: 4, start: "10:50", end: "11:40" },
  { nr: 5, start: "11:45", end: "12:35" },
  { nr: 6, start: "12:40", end: "13:30" },
  { nr: 7, start: "13:35", end: "14:25" },
  { nr: 8, start: "14:30", end: "15:20" },
  { nr: 9, start: "15:25", end: "16:15" },
  { nr: 10, start: "16:20", end: "17:10" },
];

const parseTime = (timeStr: string) => {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

export default function TeacherDashboard() {
  const router = useRouter();

  // Primary States
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "gradebook" | "notes" | "planner" | "help">("dashboard");
  const [selectedClass, setSelectedClass] = useState<string>("all");

  const [rooms, setRooms] = useState<Room[]>([]);
  const [pupils, setPupils] = useState<Pupil[]>([]);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectTags, setSubjectTags] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [alertToast, setAlertToast] = useState<string | null>(null);

  // Time / Clock States
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lessonLabel, setLessonLabel] = useState<string>("Lädt...");
  const [countdownStr, setCountdownStr] = useState<string>("--:--");

  // Popup / Intent States
  const [selectedPupilForTimer, setSelectedPupilForTimer] = useState<Pupil | null>(null);
  const [selectedPupilForComment, setSelectedPupilForComment] = useState<Pupil | null>(null);
  const [pendingDropIntent, setPendingDropIntent] = useState<{ pupilId: number; toRoomId: number; fromRoomId: number } | null>(null);

  // Sensors for DndKit
  // Sensors for DndKit optimized for Snappy iPad Drag-and-Drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 50, tolerance: 5 } })
  );

  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem("token"));
  }, []);

  const { state: dashboardState, classes: classesData, isLoading: isQueryLoading } = useDashboardData(token);

  // Sync Query Data to Local State for Real-Time Updates
  useEffect(() => {
    if (dashboardState) {
      setRooms(dashboardState.rooms || []);
      const mappedPupils = (dashboardState.pupils || []).map((p: any) => ({
        ...p,
        id: Number(p.id),
        room_id: Number(p.room_id || 1),
        arrived_status: p.arrived_status === "arrived",
        active_comment: p.comment || "",
        timer_minutes: p.timer_minutes ? Number(p.timer_minutes) : undefined,
        timer_started_at: p.timer_started_at || undefined,
        timer_started_at_ms: p.timer_started_at_ms !== null && p.timer_started_at_ms !== undefined ? Number(p.timer_started_at_ms) : undefined,
      }));
      setPupils(mappedPupils);
      setSubjects(dashboardState.subjects || []);
      setSubjectTags(dashboardState.subject_tags || []);
    }
  }, [dashboardState]);

  useEffect(() => {
    if (classesData && JSON.stringify(classesData) !== JSON.stringify(classes)) {
      setClasses(classesData);
      if (classesData.length > 0 && selectedClass === "all") {
        setSelectedClass(classesData[0].name);
      }
    }
  }, [classesData, selectedClass, classes]);


  // Socket Connection Setup
  useEffect(() => {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    if (!token || !userStr) {
      router.replace("/login");
      return;
    }

    const usr = JSON.parse(userStr);
    setUser(usr);
    if (usr?.role === "pupil") {
      setActiveTab("planner");
    }

    const wsUrl = getWsUrl();
    const socketInstance = io(wsUrl, {
      auth: { token },
      transports: ["websocket"],
    });

    socketInstance.on("connect", () => {
      setIsConnected(true);
      socketInstance.emit("join_global");
    });

    socketInstance.on("disconnect", () => {
      setIsConnected(false);
    });

    // Real-Time Event Listeners
    socketInstance.on("pupil_moved", ({ pupilId, toRoomId, log }: { pupilId: number, toRoomId: number, log: any }) => {
      setPupils((prev: Pupil[]) =>
        prev.map((p: Pupil) =>
          Number(p.id) === Number(pupilId)
            ? {
              ...p,
              room_id: Number(toRoomId),
              arrived_status: log?.arrived_status === "arrived",
              active_comment: log?.comment || "",
              timer_minutes: log?.timer_minutes ? Number(log?.timer_minutes) : undefined,
              timer_started_at: log?.timer_started_at || undefined,
              timer_started_at_ms: log?.timer_started_at_ms !== null && log?.timer_started_at_ms !== undefined ? Number(log?.timer_started_at_ms) : undefined,
            }
            : p
        )
      );
    });

    socketInstance.on("pupil_enrolled", (newPupil: any) => {
      setPupils((prev: Pupil[]) => [
        ...prev,
        {
          ...newPupil,
          id: Number(newPupil.id),
          room_id: Number(newPupil.room_id || 1),
          arrived_status: newPupil.arrived_status === "arrived",
        },
      ]);
    });

    socketInstance.on("pupil_unenrolled", ({ pupilId }: { pupilId: number }) => {
      setPupils((prev: Pupil[]) => prev.filter((p: Pupil) => Number(p.id) !== Number(pupilId)));
    });

    socketInstance.on("lesson_reset", ({ resetToRoomId }: { resetToRoomId: number }) => {
      setPupils((prev: Pupil[]) =>
        prev.map((p: Pupil) => ({
          ...p,
          room_id: Number(resetToRoomId || 1),
          arrived_status: false,
          active_comment: "",
          timer_minutes: undefined,
          timer_started_at: undefined,
          timer_started_at_ms: undefined,
        }))
      );
      setAlertToast("Unterrichtsstunde zurückgesetzt. Alle Schüler im Klassenzimmer.");
    });

    socketInstance.on("pupil_subject_tag_updated", ({ subject_id, pupil_id, tier_tag }: { subject_id: number, pupil_id: number, tier_tag: string }) => {
      setSubjectTags((prev: any[]) => {
        // filter out defensive old state
        const filtered = prev.filter(
          (t) => !(Number(t.pupil_id) === Number(pupil_id) && Number(t.subject_id) === Number(subject_id))
        );
        if (!tier_tag) return filtered;
        return [...filtered, { pupil_id: Number(pupil_id), subject_id: Number(subject_id), tier_tag }];
      });
    });

    socketInstance.on("pupil_timer_set", ({ pupilId, timer_minutes, timer_started_at, timer_started_at_ms }: { pupilId: number, timer_minutes: number, timer_started_at: string, timer_started_at_ms: number }) => {
      setPupils((prev: Pupil[]) =>
        prev.map((p: Pupil) =>
          Number(p.id) === Number(pupilId)
            ? {
              ...p,
              timer_minutes: timer_minutes ? Number(timer_minutes) : undefined,
              timer_started_at: timer_started_at || undefined,
              timer_started_at_ms: timer_started_at_ms !== null && timer_started_at_ms !== undefined
                ? Number(timer_started_at_ms)
                : timer_started_at
                ? new Date(timer_started_at).getTime()
                : undefined,
            }
            : p
        )
      );
    });

    socketInstance.on("pupil_comment_set", ({ pupilId, comment }: { pupilId: number, comment: string }) => {
      setPupils((prev: Pupil[]) =>
        prev.map((p: Pupil) =>
          Number(p.id) === Number(pupilId)
            ? {
              ...p,
              active_comment: comment || "",
            }
            : p
        )
      );
    });

    socketInstance.on("note_created", (newNote: any) => {
      setNotes((prev: any[]) => [newNote, ...prev]);
    });

    socketInstance.on("move_rejected", ({ reason }: { reason: string }) => {
      setAlertToast(`Verschieben blockiert: ${reason}`);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [router]);

  // Live Timer Tick for Clock & Break Countdown
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      let label = "Pause / Vor Unterricht";
      let nextTargetMinutes = -1;

      for (let i = 0; i < LESSON_SCHEDULE.length; i++) {
        const lesson = LESSON_SCHEDULE[i];
        const startM = parseTime(lesson.start);
        const endM = parseTime(lesson.end);

        if (currentMinutes >= startM && currentMinutes < endM) {
          label = `${lesson.nr}. Stunde`;
          nextTargetMinutes = endM;
          break;
        } else if (currentMinutes < startM) {
          label = i === 0 ? "Vor Unterricht" : `Pause vor ${lesson.nr}. Stunde`;
          nextTargetMinutes = startM;
          break;
        }
      }

      if (currentMinutes >= parseTime(LESSON_SCHEDULE[LESSON_SCHEDULE.length - 1].end)) {
        label = "Unterrichtsende";
      }

      setLessonLabel(label);

      if (nextTargetMinutes !== -1) {
        const remM = nextTargetMinutes - currentMinutes - 1;
        const remS = 59 - now.getSeconds();
        setCountdownStr(`${String(Math.max(0, remM)).padStart(2, "0")}:${String(remS).padStart(2, "0")}`);
      } else {
        setCountdownStr("--:--");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Auto-dismiss alertToast
  useEffect(() => {
    if (alertToast) {
      const t = setTimeout(() => setAlertToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [alertToast]);

  // --- Drag and Drop Processing ---
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !socket) return;

    const pupilId = Number(active.id);
    const toRoomId = Number(over.id);
    const pupil = pupils.find((p) => Number(p.id) === pupilId);

    if (!pupil || Number(pupil.room_id) === toRoomId) return;

    const targetRoom = rooms.find((r) => Number(r.id) === toRoomId);
    if (!targetRoom) return;

    // Check Lernwerkstatt hard cap locally for reactive responsiveness
    if (targetRoom.name === "Lernwerkstatt") {
      const currentInLW = pupils.filter((p) => Number(p.room_id) === toRoomId).length;
      if (currentInLW >= 24) {
        setAlertToast("Lernwerkstatt hat die Maximalkapazität von 24 Schülern erreicht.");
        return;
      }
    }

    if (targetRoom.name === "TimeOut") {
      // Prompt modal constraint
      setPendingDropIntent({ pupilId, toRoomId, fromRoomId: Number(pupil.room_id) });
    } else {
      // Optimistic update: Move the pupil card immediately in local state
      setPupils((prev) =>
        prev.map((p) => (Number(p.id) === pupilId ? { ...p, room_id: toRoomId, active_comment: "" } : p))
      );

      // Immediate emit intent
      socket.emit("move_pupil_intent", {
        pupilId,
        toRoomId,
        fromRoomId: Number(pupil.room_id),
        teacherId: user?.id,
        lessonNumber: parseInt(lessonLabel) || 1,
        comment: "",
      });
    }
  };

  const handleConfirmTimeOut = (comment: string) => {
    if (!pendingDropIntent || !socket) return;

    // Optimistic update
    setPupils((prev) =>
      prev.map((p) =>
        Number(p.id) === pendingDropIntent.pupilId ? { ...p, room_id: pendingDropIntent.toRoomId, active_comment: comment } : p
      )
    );

    socket.emit("move_pupil_intent", {
      pupilId: pendingDropIntent.pupilId,
      toRoomId: pendingDropIntent.toRoomId,
      fromRoomId: pendingDropIntent.fromRoomId,
      teacherId: user?.id,
      lessonNumber: parseInt(lessonLabel) || 1,
      comment,
    });
    setPendingDropIntent(null);
  };

  const handleSavePupilComment = (pupilId: number, comment: string) => {
    const cleanComment = comment.trim();
    setPupils((prev) =>
      prev.map((p) =>
        Number(p.id) === Number(pupilId)
          ? {
            ...p,
            active_comment: cleanComment,
          }
          : p
      )
    );
    if (socket) {
      socket.emit("set_pupil_comment", {
        pupilId,
        comment: cleanComment,
      });
    }
    setSelectedPupilForComment(null);
  };

  // Trigger manual reset lesson boundary
  const handleManualResetLesson = async () => {
    if (!confirm("Aktuelle Stunde beenden und alle Schüler ins Klassenzimmer zurücksetzen?")) return;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/api/reset-lesson`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      setAlertToast("Fehler beim manuellen Zurücksetzen der Unterrichtsstunde.");
    }
  };

  // --- Props Memoizations Section 9 Rule 4 ---
  const stableGradebookPupils = useMemo(() => {
    return pupils.map((p) => ({ ...p }));
  }, [pupils.length, JSON.stringify(pupils.map((p) => p.id)), JSON.stringify(pupils.map((p) => p.class_name))]);

  // German Locale format
  const dateStrDe = currentTime.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).toUpperCase();

  const timeStrDe = currentTime.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Main Navigation Layer */}
      <header className="bg-slate-900 border-b border-slate-800/80 px-4 md:px-6 py-3 flex flex-col md:flex-row items-center justify-between gap-3 shrink-0 z-20">
        {/* Left branding & Tabs */}
        <div className="flex items-center justify-between w-full md:w-auto gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-sm">
              S2
            </div>
            <div>
              <span className="text-xs font-bold text-slate-400 block -mb-1">MS WEISSENBACH TELFS</span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-rose-500"}`} />
                {isConnected ? "Live WS" : "Getrennt"}
              </span>
            </div>
          </div>

          {/* Navigation Pill tabs */}
          <nav className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/80">
            {user?.role !== "pupil" && (
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "dashboard" ? "bg-slate-800 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">🏫 Live</span> Raumbelegung
              </button>
            )}

            <button
              onClick={() => setActiveTab("gradebook")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "gradebook" ? "bg-slate-800 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <GraduationCap className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">📈</span> Evaluationsbereich
            </button>

            <button
              onClick={() => setActiveTab("notes")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "notes" ? "bg-slate-800 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">📋</span> Notizen
            </button>

            <button
              onClick={() => setActiveTab("help")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "help" ? "bg-slate-800 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <span className="text-indigo-400">🙋</span> Live-Hilfe
            </button>

            {user?.role === "pupil" && (
              <button
                onClick={() => setActiveTab("planner")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === "planner" ? "bg-slate-800 text-white shadow-xs font-bold" : "text-amber-500 hover:text-amber-400"
                  }`}
              >
                <span className="hidden sm:inline">📅</span> Lernplaner
              </button>
            )}
          </nav>
        </div>

        {/* Center Live Tickers */}
        <div className="flex items-center gap-4 bg-slate-950/50 px-4 py-1.5 rounded-xl border border-slate-800/50">
          <div className="text-center sm:text-left">
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 justify-center sm:justify-start">
              <Calendar className="w-3 h-3" />
              {dateStrDe}
            </span>
            <span className="text-xs font-mono font-bold text-white tracking-wider flex items-center gap-1.5 justify-center sm:justify-start">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              {timeStrDe}
            </span>
          </div>

          <div className="h-6 w-px bg-slate-800" />

          <div className="text-center sm:text-right">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
              {lessonLabel}
            </span>
            <span className="text-xs font-mono font-bold text-slate-300">
              ⏱️ {countdownStr} verbleibend
            </span>
          </div>
        </div>

        {/* Right Admin Access / Account Actions */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          {user?.role === "admin" && (
            <button
              onClick={() => router.push("/admin")}
              className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Admin-Panel</span>
            </button>
          )}

          <div className="text-right hidden xl:block">
            <span className="text-xs font-bold text-white block">{user?.full_name || "Lehrer"}</span>
            <span className="text-[10px] text-slate-400 uppercase block">{user?.role}</span>
          </div>

          <button
            onClick={() => router.push("/profile")}
            title="Benachrichtigungseinstellungen & Push"
            className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              localStorage.clear();
              router.replace("/login");
            }}
            title="Abmelden"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Global Alert Notification Toast */}
      {alertToast && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center text-amber-300 text-xs font-medium flex items-center justify-center gap-2 animate-fade-in shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{alertToast}</span>
          <button onClick={() => setAlertToast(null)} className="ml-2 font-bold hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Primary View Layer Switching */}
      <main className="flex-1 overflow-y-auto flex flex-col relative">
        {/* TAB 1: LIVE RAUMBELEGUNG GRID */}
        <div className={activeTab === "dashboard" && user?.role !== "pupil" ? "flex-1 p-4 md:p-6 flex flex-col gap-4 max-w-7xl mx-auto w-full" : "hidden"}>
          {/* Top Class Filter & Reset Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Klassenfilter:
              </span>
              {classes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClass(c.name)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${selectedClass === c.name
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                    }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <button
              onClick={handleManualResetLesson}
              className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              <span>Stunde beenden / Reset</span>
            </button>
          </div>

          {/* DndKit Orchestration Grid */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 flex-1">
              {rooms.map((room) => {
                const isShared = ["Gang 1. OG", "Gang 2. OG", "Lernwerkstatt", "TimeOut"].includes(room.name);

                // Filter mapping logic Section 8
                const roomPupils = pupils.filter((p) => {
                  if (Number(p.room_id) !== Number(room.id)) return false;
                  if (isShared) return true; // shared rooms view all attached
                  return p.class_name === selectedClass;
                });

                const countSelectedClass = roomPupils.filter((p) => p.class_name === selectedClass).length;

                return (
                  <RoomDroppable
                    key={room.id}
                    room={room}
                    totalCount={roomPupils.length}
                    classCount={countSelectedClass}
                    selectedClass={selectedClass}
                  >
                    <div className="space-y-2 min-h-[120px]">
                      {roomPupils.map((pupil) => {
                        // Extract subject tags matching this pupil safely
                        const matchingTags = subjectTags
                          .filter((t) => Number(t.pupil_id) === Number(pupil.id))
                          .map((t) => {
                            const sub = subjects.find((s) => Number(s.id) === Number(t.subject_id));
                            const abbr = sub?.abbreviation || "F";
                            const tag = t.tier_tag || "none";
                            const sym = tag === "Meister" ? "👑" : tag === "Geselle" ? "🛠️" : tag === "Lehrling" ? "🌱" : "➖";
                            const lbl = tag === "Meister" ? "Meister" : tag === "Geselle" ? "Geselle" : tag === "Lehrling" ? "Lehrling" : "Nichts/Null";
                            return `${abbr}: ${sym} ${lbl}`;
                          });

                        return (
                          <PupilDraggable
                            key={pupil.id}
                            pupil={pupil}
                            masteryTags={matchingTags}
                            socket={socket}
                            onOpenTimer={() => setSelectedPupilForTimer(pupil)}
                            onOpenComment={() => setSelectedPupilForComment(pupil)}
                          />
                        );
                      })}
                      {roomPupils.length === 0 && (
                        <div className="h-full flex items-center justify-center text-[11px] text-slate-600 italic py-6 border-2 border-dashed border-slate-800/40 rounded-xl">
                          Keine Schüler im Raum
                        </div>
                      )}
                    </div>
                  </RoomDroppable>
                );
              })}
            </div>
          </DndContext>
        </div>

        {/* TAB 2: GRADEBOOK SPREADSHEET MATRIX */}
        <div className={activeTab === "gradebook" ? "flex-1 flex flex-col h-full w-full relative" : "hidden"}>
          <Gradebook
            classes={classes}
            pupils={stableGradebookPupils}
            socket={socket}
          />
        </div>

        {/* TAB 3: DISCIPLINARY NOTES LOG */}
        <div className={activeTab === "notes" ? "flex-1 flex flex-col h-full w-full relative" : "hidden"}>
          <DisciplinaryNotes
            classes={classes}
            pupils={stableGradebookPupils}
            socket={socket}
          />
        </div>

        {/* TAB 4: LIVE HELP FEED / DISPATCH SYSTEM */}
        <div className={activeTab === "help" ? "flex-1 flex flex-col h-full w-full relative" : "hidden"}>
          <HelpFeed socket={socket} currentUser={user} />
        </div>

        {/* TAB 5: SELF-DIRECTED LEARNING PLANNER */}
        <div className={activeTab === "planner" ? "flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full h-full relative" : "hidden"}>
          <StudentLernplaner socket={socket} />
        </div>
      </main>

      {/* Popovers / Overlays */}
      {selectedPupilForTimer && (
        <TimerPopover
          pupil={pupils.find((p) => Number(p.id) === Number(selectedPupilForTimer.id)) || selectedPupilForTimer}
          onClose={() => setSelectedPupilForTimer(null)}
          socket={socket}
        />
      )}

      {selectedPupilForComment && (
        <PupilCommentModal
          pupilName={selectedPupilForComment.name}
          initialComment={pupils.find((p) => Number(p.id) === Number(selectedPupilForComment.id))?.active_comment || ""}
          onClose={() => setSelectedPupilForComment(null)}
          onSave={(comment) => handleSavePupilComment(selectedPupilForComment.id, comment)}
        />
      )}

      {pendingDropIntent && (
        <TimeOutModal
          onConfirm={handleConfirmTimeOut}
          onCancel={() => setPendingDropIntent(null)}
        />
      )}
    </div>
  );
}
