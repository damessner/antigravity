"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  DndContext, useDraggable, useDroppable, DragOverlay, closestCorners, 
  PointerSensor, TouchSensor, useSensor, useSensors 
} from "@dnd-kit/core";
import { 
  Calendar, Clock, AlertTriangle, CheckCircle, Trash2, Check, RefreshCw, Info 
} from "lucide-react";
import { Socket } from "socket.io-client";
import StudentHelpWidget from "./StudentHelpWidget";
import { getApiUrl } from "@/utils/apiDiscovery";

interface OpenTask {
  task_id: string;
  category_id: number;
  category_name: string;
  assessment_name: string;
  subject_name: string;
  subject_abbreviation: string;
  deadline: string | null;
  info_text: string;
}

interface PlanItem {
  id: number;
  pupil_id?: number;
  category_id: number;
  category_name: string;
  assessment_name: string;
  subject_name: string;
  subject_abbreviation: string;
  planned_date: string; // YYYY-MM-DD
  slot_number: number; // 1 or 2
  completed: boolean;
  deadline: string | null;
  info_text: string;
}

// 1. Sidebar Pool Draggable Card (Cloner Source)
function SidebarTaskCard({ task, onSubmit }: { task: OpenTask; onSubmit: (task: OpenTask) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `source_${task.task_id}`,
    data: { type: "source", task }
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    touchAction: "none",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  // Live countdown logic calculation
  const now = Date.now();
  let isOverdue = false;
  let isUrgent = false;
  let countdownText = "Keine Frist";

  if (task.deadline) {
    const deadlineMs = new Date(task.deadline).getTime();
    const diffMs = deadlineMs - now;

    if (diffMs < 0) {
      isOverdue = true;
      countdownText = "Frist abgelaufen!";
    } else {
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffHours / 24;

      if (diffHours <= 48) {
        isUrgent = true;
        const hrs = Math.floor(diffHours);
        countdownText = `Noch ${hrs} Stunde${hrs !== 1 ? "n" : ""}`;
      } else {
        const days = Math.ceil(diffDays);
        countdownText = `Noch ${days} Tag${days !== 1 ? "e" : ""}`;
      }
    }
  }

  // Border and accent styling based on status rules
  let borderClass = "border-slate-800/80 hover:border-slate-700 bg-slate-900/90";
  if (isOverdue) {
    borderClass = "border-2 border-rose-500 bg-rose-950/20 shadow-md shadow-rose-500/10";
  } else if (isUrgent) {
    borderClass = "border border-amber-500/80 bg-amber-950/20";
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 rounded-xl transition-all cursor-grab active:cursor-grabbing select-none relative group ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] font-mono font-bold text-amber-400 border border-slate-800 shrink-0">
            {task.subject_abbreviation}
          </span>
          <span className="text-xs font-bold text-white truncate block" title={task.assessment_name}>
            {task.assessment_name}
          </span>
        </div>
        {isOverdue && (
          <span className="shrink-0 text-rose-400 animate-pulse" title="Aufgabe ist überfällig!">
            ⚠️
          </span>
        )}
      </div>

      <div className="text-[10px] text-slate-400 truncate mb-2 flex items-center justify-between">
        <span>📁 {task.category_name}</span>
        <span className="text-[9px] text-slate-500">{task.subject_name}</span>
      </div>

      {task.info_text && (
        <p className="text-[10px] text-slate-300 bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/40 mb-2 line-clamp-2 leading-relaxed">
          {task.info_text}
        </p>
      )}

      {/* Deadline Indicator Section */}
      {task.deadline ? (
        <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60 text-[10px]">
          <span className="font-mono text-slate-500 flex items-center gap-1">
            <Calendar className="w-2.5 h-2.5" />
            {new Date(task.deadline).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
          </span>

          <span className={`font-bold tracking-tight px-1.5 py-0.2 rounded text-[9px] ${
            isOverdue ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : 
            isUrgent ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse" : 
            "text-slate-400 bg-slate-950"
          }`}>
            {countdownText}
          </span>
        </div>
      ) : (
        <div className="pt-1 border-t border-slate-800/40 text-[9px] text-slate-500 italic text-right">
          Freie Einteilung
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-slate-800/50">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSubmit(task);
          }}
          className="w-full px-2 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 text-[10px] font-bold transition-colors"
        >
          Abgeben
        </button>
      </div>
    </div>
  );
}

// 2. Planned Item Card inside Blocks (Contains check toggle and delete option)
function PlannedTaskCard({
  item,
  onToggleComplete,
  onDelete
}: {
  item: PlanItem;
  onToggleComplete: (id: number, currentStatus: boolean) => void;
  onDelete: (id: number) => void;
}) {
  // Make planned item card draggable as well to support repositioning across slots
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `plan_${item.id}`,
    data: { type: "plan", item }
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };

  const isOverdue = useMemo(() => {
    if (!item.deadline || item.completed) return false;
    return Date.now() > new Date(item.deadline).getTime();
  }, [item.deadline, item.completed]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2.5 rounded-xl border transition-all relative group bg-slate-950/90 ${
        item.completed 
          ? "border-slate-800/40 opacity-60" 
          : isOverdue 
            ? "border-rose-500/60 shadow-xs shadow-rose-500/5" 
            : "border-slate-800 hover:border-slate-700"
      }`}
    >
      {/* Drag handle wrapper / Title row */}
      <div className="flex items-center justify-between gap-1.5 mb-1">
        <div 
          {...attributes} 
          {...listeners} 
          className="flex items-center gap-1.5 flex-1 min-w-0 cursor-grab active:cursor-grabbing py-0.5"
          title="Gedrückt halten zum Verschieben"
        >
          <span className={`px-1 py-0.2 rounded text-[9px] font-mono font-bold tracking-wider shrink-0 ${
            item.completed ? "bg-slate-900 text-slate-500" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}>
            {item.subject_abbreviation}
          </span>
          <span className={`text-xs font-bold truncate block ${item.completed ? "line-through text-slate-500 font-normal" : "text-white"}`}>
            {item.assessment_name}
          </span>
        </div>

        {/* Action triggers (Complete toggle checkbox & Delete icon) */}
        <div className="flex items-center gap-1 shrink-0 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete(item.id, item.completed);
            }}
            className={`w-4 h-4 rounded flex items-center justify-center transition-colors border ${
              item.completed 
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400" 
                : "bg-slate-900 border-slate-700 hover:border-slate-500 text-transparent hover:text-slate-600"
            }`}
            title={item.completed ? "Als unerledigt markieren" : "Als erledigt markieren"}
          >
            <Check className="w-2.5 h-2.5 stroke-[3]" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="p-1 text-slate-500 hover:text-rose-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="Aus diesem Block entfernen"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {item.info_text && !item.completed && (
        <p className="text-[9px] text-slate-400 line-clamp-1 italic px-0.5 mb-1 select-none">
          {item.info_text}
        </p>
      )}

      {/* Optional short deadline tag */}
      {item.deadline && !item.completed && (
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-500 px-0.5 select-none pt-0.5">
          <span>Frist: {new Date(item.deadline).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</span>
          {isOverdue && <span className="text-rose-400 font-bold">Überfällig</span>}
        </div>
      )}
    </div>
  );
}

// 3. Droppable Block Slot Container (2 per Day)
function DroppableBlockSlot({
  dayDateStr,
  slotNumber,
  items,
  onToggleComplete,
  onDelete
}: {
  dayDateStr: string;
  slotNumber: number;
  items: PlanItem[];
  onToggleComplete: (id: number, currentStatus: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const droppableId = `block_${dayDateStr}_${slotNumber}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId
  });

  return (
    <div className="flex flex-col h-1/2 min-h-[140px] flex-1">
      <div className="flex items-center justify-between px-2 py-1 bg-slate-950/40 border-b border-slate-800/40 text-[10px] text-slate-400 shrink-0">
        <span className="font-bold text-slate-500 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" /> Block {slotNumber}
        </span>
        <span className="font-mono text-[9px]">
          {items.length} {items.length === 1 ? "Aufgabe" : "Aufgaben"}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`p-1.5 flex-1 overflow-y-auto space-y-1.5 transition-colors duration-150 ${
          isOver ? "bg-amber-500/5 ring-1 ring-amber-500/30 ring-inset" : "bg-slate-900/20"
        }`}
      >
        {items.map(item => (
          <PlannedTaskCard
            key={item.id}
            item={item}
            onToggleComplete={onToggleComplete}
            onDelete={onDelete}
          />
        ))}

        {items.length === 0 && (
          <div className="h-full w-full flex items-center justify-center text-[9px] text-slate-700 italic select-none text-center">
            Aufgabe hier ablegen
          </div>
        )}
      </div>
    </div>
  );
}

// 4. Main Integrated Dashboard Layout Component
export default function StudentLernplaner({ socket }: { socket?: Socket | null }) {
  const [tasksPool, setTasksPool] = useState<OpenTask[]>([]);
  const [learningPlan, setLearningPlan] = useState<PlanItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeDragItem, setActiveDragItem] = useState<any | null>(null);
  const [submitTaskModal, setSubmitTaskModal] = useState<{ task: OpenTask; value: string } | null>(null);

  // Configure robust mobile & desktop drag sensors avoiding rapid unintended clicks
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    })
  );

  // Derive target Monday-Friday current calendar block days stably
  const weekDays = useMemo(() => {
    const curr = new Date();
    const day = curr.getDay(); // 0 is Sunday, 1 is Monday
    const firstDayDiff = curr.getDate() - day + (day === 0 ? -6 : 1); // target Monday
    
    const res = [];
    const names = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
    for (let i = 0; i < 5; i++) {
      const d = new Date(curr.setDate(firstDayDiff + i));
      const str = d.toISOString().split("T")[0];
      res.push({ 
        name: names[i], 
        dateStr: str,
        shortDate: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
        isToday: new Date().toISOString().split("T")[0] === str
      });
    }
    return res;
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/student/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasksPool(data.tasks || []);
        setLearningPlan(data.plan || []);
      }
    } catch (err) {
      console.error("Fetch API student state error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Listen for assessment metadata updates (deadline/name/info_text changes) from teacher
  useEffect(() => {
    if (!socket) return;

    const handleAssessmentUpdated = ({ category_id, old_name, name, deadline, info_text }: {
      category_id: number;
      old_name: string;
      name: string;
      deadline: string | null;
      info_text: string | null;
    }) => {
      const matchName = old_name || name;
      // Update tasks pool
      setTasksPool(prev => prev.map(t =>
        Number(t.category_id) === Number(category_id) && t.assessment_name === matchName
          ? { ...t, assessment_name: name, deadline: deadline ?? t.deadline, info_text: info_text ?? t.info_text }
          : t
      ));
      // Update learning plan
      setLearningPlan(prev => prev.map(p =>
        Number(p.category_id) === Number(category_id) && p.assessment_name === matchName
          ? { ...p, assessment_name: name, deadline: deadline ?? p.deadline, info_text: info_text ?? p.info_text }
          : p
      ));
    };

    socket.on("assessment_updated", handleAssessmentUpdated);
    return () => {
      socket.off("assessment_updated", handleAssessmentUpdated);
    };
  }, [socket]);

  // Automatic ephemeral toast clear handler
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Handle local toggling of Completion status
  const handleToggleComplete = async (itemId: number, currentStatus: boolean) => {
    const targetStatus = !currentStatus;
    
    // Optimistic cache swap
    setLearningPlan(prev => prev.map(p => p.id === itemId ? { ...p, completed: targetStatus } : p));

    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      await fetch(`${apiUrl}/api/student/plan-task/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ completed: targetStatus })
      });
    } catch (err) {
      // Re-hydrate state upon async pipeline exceptions
      fetchDashboardData();
    }
  };

  // Handle deletion of scheduled task instances from blocks
  const handleDeletePlanItem = async (itemId: number) => {
    // Immediate reactive response removal
    setLearningPlan(prev => prev.map(p => p.id === itemId ? { ...p, removing: true } : p).filter(p => p.id !== itemId));
    setNotification("Zuweisung entfernt.");

    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      await fetch(`${apiUrl}/api/student/plan-task/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      fetchDashboardData();
    }
  };

  const handleDragStart = (event: any) => {
    const { active } = event;
    if (active.data.current) {
      setActiveDragItem(active.data.current);
    }
  };

  const handleDragEnd = async (event: any) => {
    setActiveDragItem(null);
    const { active, over } = event;
    if (!over) return;

    // Pattern structure: block_YYYY-MM-DD_slotNum
    const overIdStr = String(over.id);
    if (!overIdStr.startsWith("block_")) return;

    const parts = overIdStr.replace("block_", "").split("_");
    const targetDateStr = parts[0];
    const targetSlotNum = Number(parts[1]);

    const activeData = active.data.current;
    if (!activeData) return;

    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    // CASE A: Dropping a source item from the pool sidebar cloner list
    if (activeData.type === "source") {
      const openTask: OpenTask = activeData.task;
      
      // Inject optimistically into layout array view
      const optimisticId = Date.now();
      const newPlanRow: PlanItem = {
        id: optimisticId,
        category_id: openTask.category_id,
        category_name: openTask.category_name,
        assessment_name: openTask.assessment_name,
        subject_name: openTask.subject_name,
        subject_abbreviation: openTask.subject_abbreviation,
        planned_date: targetDateStr,
        slot_number: targetSlotNum,
        completed: false,
        deadline: openTask.deadline,
        info_text: openTask.info_text
      };

      setLearningPlan(prev => [...prev, newPlanRow]);
      setNotification(`Aufgabe in Block ${targetSlotNum} eingeplant.`);

      try {
        const res = await fetch(`${apiUrl}/api/student/plan-task`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            category_id: openTask.category_id,
            assessment_name: openTask.assessment_name,
            planned_date: targetDateStr,
            slot_number: targetSlotNum
          })
        });

        if (res.ok) {
          const persistedData = await res.json();
          // Swap synthetic optimistic ID with actual db allocated key
          setLearningPlan(prev => prev.map(p => p.id === optimisticId ? { ...p, id: persistedData.id } : p));
        } else {
          fetchDashboardData();
        }
      } catch (err) {
        fetchDashboardData();
      }
    } 
    // CASE B: Moving an existing planned card between specific slots
    else if (activeData.type === "plan") {
      const planItem: PlanItem = activeData.item;
      if (planItem.planned_date === targetDateStr && planItem.slot_number === targetSlotNum) {
        return; // No drop transition state mutation
      }

      // Optimistically reposition card
      setLearningPlan(prev => prev.map(p => p.id === planItem.id ? { 
        ...p, 
        planned_date: targetDateStr, 
        slot_number: targetSlotNum 
      } : p));

      // Proxy server record via delete & create sequence guaranteeing idempotent allocation constraints
      try {
        // Run concurrent or sequential replication tasks
        await fetch(`${apiUrl}/api/student/plan-task/${planItem.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });

        const res = await fetch(`${apiUrl}/api/student/plan-task`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            category_id: planItem.category_id,
            assessment_name: planItem.assessment_name,
            planned_date: targetDateStr,
            slot_number: targetSlotNum
          })
        });

        if (res.ok) {
          const persistedData = await res.json();
          setLearningPlan(prev => prev.map(p => p.id === planItem.id ? { ...p, id: persistedData.id } : p));
        } else {
          fetchDashboardData();
        }
      } catch (err) {
        fetchDashboardData();
      }
    }
  };

  const handleSubmitTask = async (task: OpenTask) => {
    setSubmitTaskModal({ task, value: "" });
  };

  const handleConfirmSubmitTask = async () => {
    if (!submitTaskModal) return;
    const value = submitTaskModal.value.trim();
    if (!value) return;

    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/student/submit-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category_id: submitTaskModal.task.category_id,
          assessment_name: submitTaskModal.task.assessment_name,
          grade_value: value
        })
      });
      if (!res.ok) throw new Error("Abgabe fehlgeschlagen");
      setTasksPool(prev => prev.filter(t => t.task_id !== submitTaskModal.task.task_id));
      setSubmitTaskModal(null);
      setNotification("Aufgabe abgegeben.");
    } catch (err) {
      setNotification("Abgabe fehlgeschlagen.");
    }
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn duration-200">
      {/* Title Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span>🚀 Studentisches Lernplaner-Kanban</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Self-Directed
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ziehe Aufgaben links beliebig oft in die Arbeitsblöcke der Wochentage. Klicke zum Abhaken oder Löschen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {notification && (
            <span className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-xl font-semibold animate-in fade-in shrink-0">
              {notification}
            </span>
          )}

          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50 shadow-xs"
            title="Daten vom Server synchronisieren"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-amber-400" : ""}`} />
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 flex-1 overflow-hidden min-h-[500px]">
          
          {/* LEFT SIDEBAR: Open Tasks Pool (Cloner Duplication Sources) */}
          <div className="xl:col-span-1 flex flex-col h-full bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-3.5 bg-gradient-to-r from-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">📦 Aufgabenpool</span>
              </div>
              <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] font-mono font-bold">
                {tasksPool.length} {tasksPool.length === 1 ? "offen" : "offen"}
              </span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-2.5">
              {tasksPool.map(task => (
                <SidebarTaskCard key={task.task_id} task={task} onSubmit={handleSubmitTask} />
              ))}

              {tasksPool.length === 0 && !isLoading && (
                <div className="py-12 text-center flex flex-col items-center justify-center gap-2 text-slate-500">
                  <CheckCircle className="w-8 h-8 text-emerald-500/40 stroke-1" />
                  <p className="text-xs italic">Keine offenen Aufgaben vorliegend.</p>
                </div>
              )}

              {isLoading && tasksPool.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-600 animate-pulse">
                  Lade Aufgabenpool...
                </div>
              )}

              {/* LIVE HELP DISPATCH EMBEDDED WIDGET */}
              <div className="pt-2 mt-2 border-t border-slate-800/40">
                <StudentHelpWidget 
                  subjectsList={Array.from(new Set(tasksPool.map(t => t.subject_name))).filter(Boolean)} 
                />
              </div>
            </div>

            <div className="p-2.5 bg-slate-950/60 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center gap-1.5 shrink-0">
              <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>Aufgaben verbleiben beim Ziehen im Pool für Mehrfachzuweisungen.</span>
            </div>
          </div>

          {/* RIGHT AREA: Monday-Friday Daily Grid Columns containing 2 Blocks each */}
          <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-5 gap-3 h-full overflow-hidden pb-1">
            {weekDays.map(dayRow => {
              // Group plan items scheduled for this day
              const dayItems = learningPlan.filter(p => p.planned_date === dayRow.dateStr);
              const slot1Items = dayItems.filter(p => Number(p.slot_number) === 1);
              const slot2Items = dayItems.filter(p => Number(p.slot_number) === 2);

              return (
                <div 
                  key={dayRow.dateStr}
                  className={`bg-slate-900/60 border rounded-2xl flex flex-col h-full overflow-hidden shadow-xl transition-all ${
                    dayRow.isToday ? "border-amber-500/50 bg-slate-900/90 ring-1 ring-amber-500/20" : "border-slate-800"
                  }`}
                >
                  {/* Daily header bar */}
                  <div className={`p-2.5 border-b flex items-center justify-between shrink-0 ${
                    dayRow.isToday ? "bg-amber-500/10 border-amber-500/30" : "bg-slate-950/60 border-slate-800"
                  }`}>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-xs font-bold ${dayRow.isToday ? "text-amber-400 font-extrabold" : "text-white"}`}>
                        {dayRow.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {dayRow.shortDate}
                      </span>
                    </div>

                    <span className="w-4 h-4 rounded-full bg-slate-950 text-slate-400 text-[9px] font-mono font-bold flex items-center justify-center border border-slate-800/80">
                      {dayItems.length}
                    </span>
                  </div>

                  {/* Body containing 2 consecutive Droppable block elements */}
                  <div className="flex-1 flex flex-col overflow-hidden divide-y divide-slate-800/40">
                    <DroppableBlockSlot
                      dayDateStr={dayRow.dateStr}
                      slotNumber={1}
                      items={slot1Items}
                      onToggleComplete={handleToggleComplete}
                      onDelete={handleDeletePlanItem}
                    />
                    <DroppableBlockSlot
                      dayDateStr={dayRow.dateStr}
                      slotNumber={2}
                      items={slot2Items}
                      onToggleComplete={handleToggleComplete}
                      onDelete={handleDeletePlanItem}
                    />
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Transient visually polished drag feedback wrapper */}
        <DragOverlay zIndex={9999}>
          {activeDragItem ? (
            <div className="w-56 opacity-95 scale-105 shadow-2xl rotate-2">
              {activeDragItem.type === "source" ? (
                <SidebarTaskCard task={activeDragItem.task} />
              ) : (
                <div className="p-2.5 bg-slate-900 border border-amber-500 rounded-xl text-white text-xs font-bold shadow-2xl">
                  🔄 Verschiebe: {activeDragItem.item.assessment_name}
                </div>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {submitTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Aufgabe abgeben</h3>
            <p className="text-xs text-slate-400">{submitTaskModal.task.assessment_name}</p>
            <label htmlFor="submit-task-grade-input" className="text-xs text-slate-300">
              Bewertungswert
            </label>
            <input
              id="submit-task-grade-input"
              type="text"
              value={submitTaskModal.value}
              onChange={(e) => setSubmitTaskModal({ ...submitTaskModal, value: e.target.value })}
              placeholder="Bewertung eingeben"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setSubmitTaskModal(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmitTask}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                Abgeben
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
