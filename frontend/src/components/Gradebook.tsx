"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { 
  Plus, Upload, Download, Lock, Eye, EyeOff, Trash2, 
  Check, RefreshCw, AlertCircle, FileSpreadsheet, UserCheck, Edit3, Settings2, Calendar 
} from "lucide-react";
import { Pupil } from "./TeacherDashboard";
import { toPercent, fromPercent, ScaleType, getPlaceholderForScale } from "./gradeUtils";
import { useWeightBalancer } from "./useWeightBalancer";
import ImportDiffModal from "./ImportDiffModal";
import EditAssessmentModal from "./EditAssessmentModal";

interface GradebookProps {
  classes: { id: number; name: string }[];
  pupils: Pupil[];
  socket?: any;
}

// Sub-component 1: Toggleable Weighting Overlay Dashboard
function WeightingOverlay({
  categories,
  onWeightChange,
  onToggleLock,
  onClose
}: {
  categories: any[];
  onWeightChange: (id: number, val: number) => void;
  onToggleLock: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="mb-4 bg-slate-900/95 border border-amber-500/40 p-4 rounded-xl shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 relative shrink-0">
      <button 
        onClick={onClose}
        className="absolute top-2.5 right-2.5 text-slate-500 hover:text-slate-300 text-xs font-bold px-1.5 py-0.5 rounded bg-slate-950/60 transition-colors"
        title="Panel einklappen"
      >
        ✕
      </button>

      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-400">⚖️ Weight Balancer (Proportional Auto-Sync)</span>
        </div>
        <span className="text-[10px] font-mono font-bold text-slate-400 mr-6">
          Summe: <span className="text-emerald-400">100%</span> verriegelt
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div key={c.id} className={`p-2 rounded-lg border transition-all ${c.isLocked ? "bg-slate-950/30 border-slate-800/80 opacity-60" : "bg-slate-950 border-slate-800"}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-[11px] font-medium text-slate-300 truncate flex-1" title={c.name}>
                {c.name}
              </span>
              
              <button
                type="button"
                onClick={() => onToggleLock(c.id)}
                className={`p-0.5 rounded transition-colors ${c.isLocked ? "text-amber-400 bg-amber-500/10" : "text-slate-600 hover:text-slate-400"}`}
                title={c.isLocked ? "Gesperrt (Ausgeschlossen vom Auto-Balancing)" : "Klick zum Sperren der Gewichtung"}
              >
                <Lock className="w-2.5 h-2.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                value={c.weight_percentage}
                disabled={c.isLocked}
                onChange={(e) => onWeightChange(c.id, Number(e.target.value))}
                className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <div className="flex items-center gap-0.5 w-11 justify-end shrink-0">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={c.weight_percentage}
                  disabled={c.isLocked}
                  onChange={(e) => onWeightChange(c.id, Number(e.target.value))}
                  className="w-7 bg-transparent text-right font-mono text-[11px] font-bold text-amber-400 focus:outline-none disabled:opacity-50"
                />
                <span className="text-[9px] text-slate-500 font-mono">%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Sub-component 2: Memoized Super-Narrow Grade Input Cell guaranteeing Snappy iPad layout responsiveness
interface NarrowCellProps {
  categoryId: number;
  pupilId: number;
  assessmentName: string;
  valueStr: string;
  isVisible: boolean;
  disabled: boolean;
  placeholderGuide: string;
  maxLength?: number;
  isCatLastCol: boolean;
  onChange: (catId: number, pId: number, assName: string, val: string) => void;
  onContextMenu: (e: React.MouseEvent, catId: number, pId: number, assName: string) => void;
}

const MemoizedNarrowGradeCell = React.memo(function MemoizedNarrowGradeCell({
  categoryId,
  pupilId,
  assessmentName,
  valueStr,
  isVisible,
  disabled,
  placeholderGuide,
  maxLength = 3,
  isCatLastCol,
  onChange,
  onContextMenu
}: NarrowCellProps) {
  return (
    <td className={`p-0 w-10 min-w-[40px] max-w-[48px] h-9 align-middle ${isCatLastCol ? "border-r-2 border-slate-700/80" : "border-r border-slate-800/40"}`}>
      <div 
        onContextMenu={(e) => onContextMenu(e, categoryId, pupilId, assessmentName)}
        className={`w-full h-full flex items-center justify-center relative ${!isVisible ? "opacity-30 bg-slate-950/80" : ""}`}
        title="Rechtsklick/Longpress zum Umschalten der spezifischen Schülersichtbarkeit"
      >
        <input
          type="text"
          maxLength={maxLength}
          value={valueStr}
          disabled={disabled}
          onChange={(e) => onChange(categoryId, pupilId, assessmentName, e.target.value)}
          placeholder={placeholderGuide}
          className="w-full h-full bg-transparent hover:bg-slate-900/50 focus:bg-slate-900 text-center font-mono text-xs font-bold text-white focus:outline-none transition-colors p-0 rounded-none border-none disabled:opacity-50 disabled:cursor-not-allowed selection:bg-cyan-500/30"
        />
        {!isVisible && (
          <span className="absolute right-0.5 top-0.5 pointer-events-none text-[8px] text-rose-500 select-none font-bold" title="Für Schüler ausgeblendet">
            ∅
          </span>
        )}
      </div>
    </td>
  );
});

export default function Gradebook({ classes, pupils, socket }: GradebookProps) {
  // 0 = "not yet initialized" — prevents loadSubjects from firing before classes have been resolved
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);

  // Request-counter refs to discard stale async responses and prevent race conditions
  const subjectsReqRef = useRef<number>(0);
  const matrixReqRef = useRef<number>(0);

  // Matrix details
  const [categories, setCategories] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [pupilTags, setPupilTags] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Toggleable overlay dashboard state
  const [isWeightingOpen, setIsWeightingOpen] = useState(false);

  // Compact tooltips / modals
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: "", abbreviation: "", second_teacher_id: "" });
  
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ 
    name: "", 
    weight_percentage: 20, 
    scale_type: "numeric_1_5",
    is_self_directed: false,
    default_deadline: ""
  });

  const [showAddAssessment, setShowAddAssessment] = useState<{ categoryId: number } | null>(null);
  const [newAssessmentName, setNewAssessmentName] = useState("");

  // Compact popover input for inline column rename
  const [editingCol, setEditingCol] = useState<{ categoryId: number; oldName: string; newName: string } | null>(null);

  // Standalone column properties edit modal state
  const [showEditMetadataModal, setShowEditMetadataModal] = useState<{
    assessmentId?: number;
    categoryId: number;
    oldName: string;
    initialName?: string;
    initialInfoText?: string;
    initialDeadline?: string | null;
  } | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);

  // Excel Interoperability / Synchronization State tracking
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [parsedExcelResult, setParsedExcelResult] = useState<any | null>(null);

  // Derive target class pupils stably
  const classPupils = useMemo(() => {
    const targetClassName = classes.find((c) => Number(c.id) === Number(selectedClassId))?.name;
    return pupils.filter((p) => p.class_name === targetClassName).sort((a, b) => a.name.localeCompare(b.name));
  }, [pupils, classes, selectedClassId]);

  // Retrieve current active principal user
  useEffect(() => {
    const uStr = localStorage.getItem("user");
    if (uStr) setCurrentUser(JSON.parse(uStr));
  }, []);

  // Hydrate partner teachers selection
  useEffect(() => {
    const fetchU = async () => {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      try {
        const res = await fetch(`${apiUrl}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setUsers(d || []);
        }
      } catch (e) {}
    };
    fetchU();
  }, []);

  // Resolve the correct class to show once the classes list has been loaded from the server.
  // We must NOT run this before classes are available — doing so would default to a hardcoded
  // "1" fallback that gets persisted to localStorage and permanently breaks subject loading
  // for teachers whose classes have a different id.
  useEffect(() => {
    if (classes.length === 0) return; // Wait until classes are actually available
    const savedClass = localStorage.getItem("saved_class_id");
    if (savedClass && classes.some((c) => Number(c.id) === Number(savedClass))) {
      setSelectedClassId(Number(savedClass));
    } else if (classes.length > 0) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes]);

  // Load curricular modules overview
  const loadSubjects = async (classId: number) => {
    // Increment counter so that any older in-flight request can detect it is stale
    const reqId = ++subjectsReqRef.current;
    setIsLoading(true);
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/gradebook/subjects?class_id=${classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Discard response if a newer request has already been dispatched
      if (reqId !== subjectsReqRef.current) return;
      if (res.ok) {
        const data = await res.json();
        if (reqId !== subjectsReqRef.current) return;
        setSubjects(data || []);
        if (data.length > 0) {
          const savedSubjId = localStorage.getItem(`saved_subject_${classId}`);
          const targetSubj = data.find((s: any) => Number(s.id) === Number(savedSubjId)) || data[0];
          loadMatrix(targetSubj);
        } else {
          setSelectedSubject(null);
          setCategories([]);
          setGrades([]);
          setPupilTags([]);
        }
      }
    } catch (err) {
      if (reqId === subjectsReqRef.current) {
        setAlertMsg("Fehler beim Laden der Fächerübersicht");
      }
    } finally {
      if (reqId === subjectsReqRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!selectedClassId) return; // 0 = not yet initialized, wait for classes to load
    localStorage.setItem("saved_class_id", String(selectedClassId));
    loadSubjects(selectedClassId);
  }, [selectedClassId]);

  // Synchronize targeted grade record structures
  const loadMatrix = async (subj: any) => {
    // Increment counter so stale matrix loads can be discarded
    const reqId = ++matrixReqRef.current;
    setSelectedSubject(subj);
    if (subj?.id) {
      localStorage.setItem(`saved_subject_${subj.class_id}`, String(subj.id));
    }
    setIsLoading(true);
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/gradebook/matrix/${subj.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reqId !== matrixReqRef.current) return;
      if (res.ok) {
        const data = await res.json();
        if (reqId !== matrixReqRef.current) return;
        setCategories(data.categories || []);
        setGrades(data.grades || []);
        setPupilTags(data.pupil_tags || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setAlertMsg(errData.error || "Zugriff auf diese Beurteilungsmatrix verweigert");
        setCategories([]);
        setGrades([]);
        setPupilTags([]);
      }
    } catch (err) {
      if (reqId === matrixReqRef.current) {
        setAlertMsg("Matrix konnte nicht synchronisiert werden");
      }
    } finally {
      if (reqId === matrixReqRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Auto-expire messages
  useEffect(() => {
    if (alertMsg) {
      const t = setTimeout(() => setAlertMsg(null), 5000);
      return () => clearTimeout(t);
    }
  }, [alertMsg]);

  // Live socket synchronizers streaming subject updates to partner UI instances
  useEffect(() => {
    if (!socket || !selectedSubject) return;

    const handleSubjectUpdated = ({ subject_id, categories: updatedCats }: any) => {
      if (Number(subject_id) === Number(selectedSubject.id) && Array.isArray(updatedCats)) {
        setCategories(updatedCats);
      }
    };

    const handleCategoryWeightsUpdated = ({ subject_id, weights }: any) => {
      if (Number(subject_id) === Number(selectedSubject.id) && Array.isArray(weights)) {
        setCategories((prev) =>
          prev.map((c) => {
            const match = weights.find((w: any) => Number(w.id) === Number(c.id));
            return match ? { ...c, weight_percentage: Number(match.weight_percentage) } : c;
          })
        );
      }
    };

    const handleMatrixImportedBatch = ({ subject_id }: any) => {
      if (Number(subject_id) === Number(selectedSubject.id)) {
        loadMatrix(selectedSubject);
      }
    };

    socket.on("subject_updated", handleSubjectUpdated);
    socket.on("category_weights_updated", handleCategoryWeightsUpdated);
    socket.on("matrix_imported_batch", handleMatrixImportedBatch);

    return () => {
      socket.off("subject_updated", handleSubjectUpdated);
      socket.off("category_weights_updated", handleCategoryWeightsUpdated);
      socket.off("matrix_imported_batch", handleMatrixImportedBatch);
    };
  }, [socket, selectedSubject]);

  const isOwnerOrCoTeacher = useMemo(() => {
    if (!currentUser || !selectedSubject) return false;
    if (currentUser.role === "admin") return true;
    const uid = Number(currentUser.id);
    return Number(selectedSubject.teacher_id) === uid || Number(selectedSubject.second_teacher_id) === uid;
  }, [currentUser, selectedSubject]);

  // --- Dynamic Proportional Balancer Hook logic coupled with API Debouncing ---
  const saveWeightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveWeightsDebounced = useCallback((updatedCats: any[]) => {
    if (saveWeightTimeoutRef.current) {
      clearTimeout(saveWeightTimeoutRef.current);
    }
    saveWeightTimeoutRef.current = setTimeout(async () => {
      setCategories(updatedCats); // top-level state alignment
      if (!selectedSubject) return;
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      try {
        await fetch(`${apiUrl}/api/gradebook/weights`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            subject_id: selectedSubject.id,
            weights: updatedCats.map(c => ({ id: c.id, weight_percentage: c.weight_percentage }))
          })
        });
      } catch (e) {}
    }, 500);
  }, [selectedSubject]);

  const { categories: balancedCategories, handleWeightChange, toggleLock } = useWeightBalancer(categories, saveWeightsDebounced);

  // --- Transposed Grid Column Generator (Columns = Assessments across all Categories) ---
  const allColumns = useMemo(() => {
    const list: { category: any; assessmentName: string; isCatLastCol: boolean; colSubset: any[]; metadata?: any }[] = [];
    balancedCategories.forEach((cat) => {
      const subset = grades.filter((g) => Number(g.category_id) === Number(cat.id));
      const uniqueNames = Array.from(new Set(subset.map((g) => g.assessment_name || "Note")));
      const metadataRows = Array.isArray(cat.column_metadata) ? cat.column_metadata : [];
      const metadataNames = metadataRows.map((m: any) => m.name);
      const names = uniqueNames.length > 0 ? uniqueNames : ["Bewertung 1"];
      const mergedNames = Array.from(new Set([...names, ...metadataNames]));

      mergedNames.forEach((assName, idx) => {
        const metadata = metadataRows.find((m: any) => m.name === assName);
        list.push({
          category: cat,
          assessmentName: assName,
          isCatLastCol: idx === mergedNames.length - 1,
          colSubset: subset.filter(g => g.assessment_name === assName),
          metadata
        });
      });
    });
    return list;
  }, [balancedCategories, grades]);

  // --- Core Handlers ---
  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/gradebook/subject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newSubject.name,
          abbreviation: newSubject.abbreviation || newSubject.name.substring(0, 2).toUpperCase(),
          class_id: selectedClassId,
          second_teacher_id: newSubject.second_teacher_id ? Number(newSubject.second_teacher_id) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSubjects((prev) => [...prev, data]);
      setShowAddSubject(false);
      setNewSubject({ name: "", abbreviation: "", second_teacher_id: "" });
      loadMatrix(data);
      setAlertMsg("Neues Fach erfolgreich registriert.");
    } catch (err: any) {
      setAlertMsg(err.message || "Fach konnte nicht angelegt werden");
    }
  };

  const handleToggleProjection = async () => {
    if (!selectedSubject || !isOwnerOrCoTeacher) return;
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/gradebook/subject/${selectedSubject.id}/toggle-projection`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedSubject((prev: any) => ({ ...prev, projection_visible: data.projection_visible }));
      }
    } catch (e) {}
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) return;
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/gradebook/category`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subject_id: selectedSubject.id,
          name: newCategory.name,
          weight_percentage: Number(newCategory.weight_percentage),
          scale_type: newCategory.scale_type,
          is_self_directed: newCategory.is_self_directed,
          default_deadline: newCategory.default_deadline ? new Date(newCategory.default_deadline).toISOString() : null
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (data.updatedCategories && Array.isArray(data.updatedCategories)) {
        setCategories(data.updatedCategories);
      } else {
        setCategories((prev) => [...prev, data]);
      }
      setShowAddCategory(false);
      setNewCategory({ name: "", weight_percentage: 20, scale_type: "numeric_1_5", is_self_directed: false, default_deadline: "" });
    } catch (err: any) {
      setAlertMsg(err.message);
    }
  };

  const handleDeleteCategory = async (catId: number) => {
    if (!confirm("Kategorie inklusive aller eingetragenen Einzelnoten restlos entfernen?")) return;
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/gradebook/category/${catId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCategories((prev) => prev.filter((c) => Number(c.id) !== Number(catId)));
        setGrades((prev) => prev.filter((g) => Number(g.category_id) !== Number(catId)));
      }
    } catch (e) {}
  };

  const handleAddAssessmentRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddAssessment || !newAssessmentName.trim()) return;

    const catId = showAddAssessment.categoryId;
    const name = newAssessmentName.trim();

    const dummyGrades = classPupils.map((p) => ({
      category_id: catId,
      pupil_id: p.id,
      assessment_name: name,
      grade_value: null,
      is_visible: true,
    }));

    setGrades((prev) => [...prev, ...dummyGrades]);
    setShowAddAssessment(null);
    setNewAssessmentName("");

    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    try {
      const res = await fetch(`${apiUrl}/api/assessments/0`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category_id: catId,
          old_name: name,
          name,
          info_text: null,
          deadline: null
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Bewertung konnte nicht initialisiert werden");
      }

      const savedMeta = await res.json();
      setCategories((prev) =>
        prev.map((c) => {
          if (Number(c.id) !== Number(catId)) return c;
          const existingMetaList = Array.isArray(c.column_metadata) ? c.column_metadata : [];
          const filtered = existingMetaList.filter((a: any) => a.name !== name);
          return {
            ...c,
            column_metadata: [...filtered, savedMeta]
          };
        })
      );
    } catch (err: any) {
      setAlertMsg(err.message || "Bewertung wurde lokal erstellt, Metadaten konnten nicht gespeichert werden.");
    }
  };

  const handleScaleSwitch = async (catId: number, newScale: ScaleType) => {
    if (!isOwnerOrCoTeacher) return;

    setCategories(prev => prev.map(c => c.id === catId ? { ...c, scale_type: newScale } : c));

    setGrades(prev => prev.map(g => {
      if (Number(g.category_id) === catId && g.grade_value !== null && g.grade_value !== undefined && g.grade_value !== "") {
        const oldCat = categories.find(c => c.id === catId);
        const oldScale = (oldCat?.scale_type || "numeric_1_5") as ScaleType;
        const pct = toPercent(String(g.grade_value), oldScale);
        const translatedStr = fromPercent(pct, newScale);
        return { ...g, grade_value: translatedStr };
      }
      return g;
    }));

    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    try {
      await fetch(`${apiUrl}/api/gradebook/category-scale`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category_id: catId, scale_type: newScale })
      });
    } catch (e) {}
  };

  // Compact floating tooltip inline rename processing
  const handleRenameColumnSubmit = async () => {
    if (!editingCol || !editingCol.newName.trim() || editingCol.newName.trim() === editingCol.oldName) {
      setEditingCol(null);
      return;
    }
    const cleanNew = editingCol.newName.trim();
    const targetCatId = editingCol.categoryId;
    const oldNameTarget = editingCol.oldName;

    setGrades(prev => prev.map(g => 
      Number(g.category_id) === targetCatId && g.assessment_name === oldNameTarget
        ? { ...g, assessment_name: cleanNew }
        : g
    ));
    setEditingCol(null);

    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    try {
      await fetch(`${apiUrl}/api/gradebook/rename-column`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category_id: targetCatId,
          old_name: oldNameTarget,
          new_name: cleanNew
        })
      });
    } catch (e) {}
  };

  const handleMetadataSaved = (updatedMeta: { id?: number; name: string; info_text: string; deadline: string | null }) => {
    if (!showEditMetadataModal) return;
    const targetCatId = showEditMetadataModal.categoryId;
    const oldNameTarget = showEditMetadataModal.oldName;
    const cleanNew = updatedMeta.name;

    // 1. Update categories array column_metadata embedded lists
    setCategories(prev => prev.map(c => {
      if (Number(c.id) === targetCatId) {
        const existingMetaList = Array.isArray(c.column_metadata) ? c.column_metadata : [];
        const filtered = existingMetaList.filter((a: any) => a.name !== oldNameTarget);
        return {
          ...c,
          column_metadata: [
            ...filtered,
            {
              id: updatedMeta.id,
              category_id: targetCatId,
              name: cleanNew,
              info_text: updatedMeta.info_text,
              deadline: updatedMeta.deadline
            }
          ]
        };
      }
      return c;
    }));

    // 2. If name changed, rename all relevant cells inside grades matrix state
    if (cleanNew !== oldNameTarget) {
      setGrades(prev => prev.map(g => 
        Number(g.category_id) === targetCatId && g.assessment_name === oldNameTarget
          ? { ...g, assessment_name: cleanNew }
          : g
      ));
    }
  };

  const handleToggleColumnVisibility = async (catId: number, assName: string) => {
    if (!isOwnerOrCoTeacher) return;
    const colGrades = grades.filter(g => Number(g.category_id) === catId && g.assessment_name === assName);
    const currentVis = colGrades.every(g => g.is_visible !== false);
    const targetVis = !currentVis;

    setGrades(prev => prev.map(g => 
      Number(g.category_id) === catId && g.assessment_name === assName
        ? { ...g, is_visible: targetVis }
        : g
    ));

    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    try {
      await fetch(`${apiUrl}/api/gradebook/column-visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category_id: catId, assessment_name: assName, is_visible: targetVis })
      });
    } catch (e) {}
  };

  const handleCellContextMenu = useCallback(async (e: React.MouseEvent, catId: number, pupilId: number, assName: string) => {
    e.preventDefault();
    if (!isOwnerOrCoTeacher) return;

    setGrades(prev => {
      const cellObj = prev.find(g => Number(g.category_id) === catId && Number(g.pupil_id) === pupilId && g.assessment_name === assName);
      const targetVis = cellObj ? cellObj.is_visible === false : false;
      
      const filtered = prev.filter(g => !(Number(g.category_id) === catId && Number(g.pupil_id) === pupilId && g.assessment_name === assName));
      const updatedVal = cellObj?.grade_value !== undefined ? cellObj.grade_value : null;
      
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      setTimeout(async () => {
        try {
          await fetch(`${apiUrl}/api/gradebook/cell-visibility`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ category_id: catId, pupil_id: pupilId, assessment_name: assName, is_visible: targetVis })
          });
        } catch (err) {}
      }, 0);

      return [
        ...filtered,
        {
          category_id: catId,
          pupil_id: pupilId,
          assessment_name: assName,
          grade_value: updatedVal,
          is_visible: targetVis
        }
      ];
    });
  }, [isOwnerOrCoTeacher]);

  const handleGradeChange = useCallback(async (categoryId: number, pupilId: number, assessmentName: string, valStr: string) => {
    if (!isOwnerOrCoTeacher) return;

    const trimmedVal = valStr.trim();
    let saveVal: string | number | null = trimmedVal;
    if (saveVal === "") saveVal = null;

    setGrades((prev) => {
      const filtered = prev.filter(
        (g) =>
          !(
            Number(g.category_id) === Number(categoryId) &&
            Number(g.pupil_id) === Number(pupilId) &&
            g.assessment_name === assessmentName
          )
      );
      if (saveVal === null) return filtered;
      return [
        ...filtered,
        {
          category_id: categoryId,
          pupil_id: pupilId,
          assessment_name: assessmentName,
          grade_value: saveVal,
          is_visible: true,
        },
      ];
    });

    if (saveVal === null) return;

    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    try {
      await fetch(`${apiUrl}/api/gradebook/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category_id: categoryId,
          pupil_id: pupilId,
          assessment_name: assessmentName,
          grade_value: saveVal,
          is_visible: true,
        }),
      });
    } catch (e) {}
  }, [isOwnerOrCoTeacher]);

  const handleTagChange = async (pupilId: number, tierTag: string) => {
    if (!selectedSubject || !isOwnerOrCoTeacher) return;

    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const targetTag = tierTag === "none" ? null : tierTag;

    setPupilTags((prev) => {
      const filtered = prev.filter((t) => Number(t.pupil_id) !== Number(pupilId));
      if (!targetTag) return filtered;
      return [...filtered, { pupil_id: pupilId, subject_id: selectedSubject.id, tier_tag: targetTag }];
    });

    try {
      await fetch(`${apiUrl}/api/gradebook/tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subject_id: selectedSubject.id,
          pupil_id: pupilId,
          tier_tag: targetTag,
        }),
      });
    } catch (e) {}
  };

  // --- Excel Interoperability / Sync Handlers ---
  const handleExcelExportTrigger = () => {
    if (!selectedSubject) return;
    import("./excelService").then((module) => {
      module.generateExcel({
        subject: selectedSubject,
        classPupils,
        categories: balancedCategories,
        allColumns,
        grades,
      });
    });
  };

  const handleExcelFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // clear picker state

    try {
      setIsLoading(true);
      const txt = await file.text();
      const module = await import("./excelService");
      
      const parsed = module.parseExcel(txt, balancedCategories, grades, classPupils);
      setParsedExcelResult(parsed);
      setDiffModalOpen(true);
    } catch (err: any) {
      setAlertMsg(`Excel-Parser gescheitert: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmExcelImport = async (forceOverwrite: boolean) => {
    if (!parsedExcelResult || !selectedSubject) return;

    const targets = parsedExcelResult.deltas.filter((d: any) => d.isModified || (d.validationWarning && d.newValue !== undefined));
    if (targets.length === 0) {
      setDiffModalOpen(false);
      return;
    }

    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      setIsLoading(true);
      const res = await fetch(`${apiUrl}/api/gradebook/import-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subject_id: selectedSubject.id,
          export_timestamp: parsedExcelResult.exportTimestamp,
          force_overwrite: forceOverwrite,
          deltas: targets.map((t: any) => ({
            category_id: t.categoryId,
            pupil_id: t.pupilId,
            assessment_name: t.assessmentName,
            grade_value: t.newValue === "" ? null : t.newValue,
            is_visible: true
          }))
        })
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.isLockConflict) {
          setParsedExcelResult((prev: any) => ({ ...prev, hasOptimisticLockWarning: true }));
          setAlertMsg("Serverseitiger Sperrkonflikt: Bitte bestätigen Sie das absichtliche Überschreiben.");
          return;
        }
        throw new Error(data.error || "Batch-Verarbeitung gescheitert");
      }

      setAlertMsg("Excel Notenabgleich und synchrones Upsert erfolgreich abgeschlossen!");
      setDiffModalOpen(false);
      setParsedExcelResult(null);
      loadMatrix(selectedSubject);
    } catch (err: any) {
      setAlertMsg(`Excel Import fehlgeschlagen: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportSingleSubject = () => {
    if (!selectedSubject) return;
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    window.open(`${apiUrl}/api/backup/gradebook/${selectedSubject.id}?token=${token}`, "_blank");
  };

  const handleImportSubjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    try {
      setIsLoading(true);
      const txt = await importFile.text();
      const payload = JSON.parse(txt);

      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

      const res = await fetch(`${apiUrl}/api/backup/gradebook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAlertMsg("Notenbuch-Matrix erfolgreich importiert und synchronisiert!");
      setImportFile(null);
      loadSubjects(selectedClassId);
    } catch (err: any) {
      setAlertMsg(`Import gescheitert: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Compute final aggregated AT Projection grade reliably matching mixed rubric conversions
  const getPupilProjection = (pupilId: number) => {
    let totalWeight = 0;
    let weightedPercentageSum = 0;

    balancedCategories.forEach((cat) => {
      const subset = grades.filter(
        (g) => Number(g.category_id) === Number(cat.id) && Number(g.pupil_id) === Number(pupilId) && g.grade_value !== null && g.grade_value !== ""
      );

      const accessibleSubset = currentUser?.role === "pupil" 
        ? subset.filter(g => g.is_visible !== false)
        : subset;

      if (accessibleSubset.length > 0) {
        let validCount = 0;
        let sumPct = 0;
        accessibleSubset.forEach((g) => {
          const pct = toPercent(String(g.grade_value), (cat.scale_type || "numeric_1_5") as ScaleType);
          if (pct !== null) {
            sumPct += pct;
            validCount++;
          }
        });

        if (validCount > 0) {
          const avgPct = sumPct / validCount;
          const w = Number(cat.weight_percentage) || 0;
          weightedPercentageSum += avgPct * w;
          totalWeight += w;
        }
      }
    });

    if (totalWeight === 0) return "-";
    const finalPercentage = weightedPercentageSum / totalWeight;

    if (finalPercentage >= 0.87) return 1;
    if (finalPercentage >= 0.75) return 2;
    if (finalPercentage >= 0.60) return 3;
    if (finalPercentage >= 0.50) return 4;
    return 5;
  };

  const cycleMasteryTag = (pupilId: number) => {
    if (!selectedSubject || !isOwnerOrCoTeacher) return;
    const currentTagObj = pupilTags.find((t) => Number(t.pupil_id) === Number(pupilId));
    const currentVal = currentTagObj?.tier_tag || "none";

    let nextVal = "none";
    if (currentVal === "none") nextVal = "Lehrling";
    else if (currentVal === "Lehrling") nextVal = "Geselle";
    else if (currentVal === "Geselle") nextVal = "Meister";
    else nextVal = "none";

    handleTagChange(pupilId, nextVal);
  };

  // Assign distinct top border colors per Category grouping
  const categoryAccentBorders = ["border-t-cyan-500", "border-t-indigo-500", "border-t-amber-500", "border-t-emerald-500", "border-t-rose-500"];

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-950">
      {/* LEFT DRAWER PANEL */}
      <aside className="w-64 bg-slate-900/60 border-r border-slate-800 p-4 shrink-0 flex flex-col gap-4 overflow-y-auto">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Klassen-Auswahl
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs font-bold text-indigo-400 focus:outline-none focus:border-indigo-500"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                Klasse {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="h-px bg-slate-800/80" />

        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fächer</span>
          {currentUser?.role !== "pupil" && (
            <button
              onClick={() => setShowAddSubject(true)}
              className="text-slate-400 hover:text-indigo-400 p-1 rounded transition-colors"
              title="Neues Fach anlegen"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Subjects list map */}
        <div className="space-y-1 flex-1">
          {subjects.map((s) => {
            const isSelected = selectedSubject?.id === s.id;
            const isPriv =
              currentUser?.role !== "admin" &&
              Number(s.teacher_id) !== Number(currentUser?.id) &&
              Number(s.second_teacher_id) !== Number(currentUser?.id);

            return (
              <button
                key={s.id}
                onClick={() => loadMatrix(s)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 font-bold"
                    : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="px-1.5 py-0.5 rounded bg-slate-950 text-[10px] font-mono text-slate-400 border border-slate-800 shrink-0">
                    {s.abbreviation}
                  </span>
                  <span className="truncate">{s.name}</span>
                </div>
                {isPriv && <Lock className="w-3 h-3 text-slate-600 shrink-0" />}
              </button>
            );
          })}

          {subjects.length === 0 && (
            <p className="text-[11px] text-slate-600 italic text-center pt-4">Keine Fächer in dieser Klasse</p>
          )}
        </div>

        {/* Import / Export File triggers */}
        {selectedSubject && isOwnerOrCoTeacher && (
          <div className="pt-3 border-t border-slate-800 space-y-2 shrink-0">
            <button
              onClick={handleExportSingleSubject}
              className="w-full bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-3 h-3" />
              <span>Matrix exportieren</span>
            </button>

            <div>
              <label className="block text-[9px] font-bold text-slate-500 text-center mb-1">Backup importieren:</label>
              <input
                type="file"
                accept=".json"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="w-full text-[10px] text-slate-400 file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-[10px] file:bg-slate-800 file:text-slate-300 bg-slate-950 p-1 rounded border border-slate-800"
              />
              {importFile && (
                <button
                  onClick={handleImportSubjectSubmit}
                  className="w-full mt-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] py-1 rounded transition-colors font-bold"
                >
                  Import bestätigen
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* MAIN SPREADSHEET CONTAINER */}
      <main className="flex-1 p-6 overflow-auto flex flex-col relative">
        {/* INTERACTIVE EXCEL IMPORT PREVIEW OVERLAY */}
        <ImportDiffModal
          isOpen={diffModalOpen}
          deltas={parsedExcelResult?.deltas || []}
          hasOptimisticLockWarning={parsedExcelResult?.hasOptimisticLockWarning || false}
          exportTimestamp={parsedExcelResult?.exportTimestamp || null}
          lastMatrixUpdate={parsedExcelResult?.lastMatrixUpdate || null}
          onConfirm={handleConfirmExcelImport}
          onCancel={() => {
            setDiffModalOpen(false);
            setParsedExcelResult(null);
          }}
        />

        {/* COMPACT FLOATING MODAL FOR INLINE COLUMN RENAMING */}
        {editingCol && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900 border-2 border-cyan-500 p-4 rounded-xl shadow-2xl z-50 w-72 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-800">
              <span className="text-xs font-bold text-cyan-400">✏️ Spaltenbezeichnung editieren</span>
              <button 
                onClick={() => setEditingCol(null)} 
                className="text-slate-500 hover:text-slate-300 text-xs font-bold px-1"
              >
                ✕
              </button>
            </div>
            
            <p className="text-[10px] text-slate-400 mb-2 truncate">
              Aktuell: <span className="font-mono text-slate-200 font-bold">{editingCol.oldName}</span>
            </p>

            <input
              type="text"
              value={editingCol.newName}
              autoFocus
              onChange={(e) => setEditingCol({ ...editingCol, newName: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameColumnSubmit();
                if (e.key === "Escape") setEditingCol(null);
              }}
              placeholder="Kurzbezeichnung eingeben..."
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white font-bold focus:outline-none focus:border-cyan-400 mb-3"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingCol(null)}
                className="flex-1 bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs py-1 rounded border border-slate-800 transition-colors"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleRenameColumnSubmit}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold py-1 rounded transition-colors shadow-xs"
              >
                Speichern
              </button>
            </div>
          </div>
        )}

        {alertMsg && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-300 text-xs font-medium flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{alertMsg}</span>
          </div>
        )}

        {/* Create Subject Modal Overlay */}
        {showAddSubject && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-modal p-5 w-full max-w-sm border border-slate-700 shadow-2xl">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center justify-between">
                <span>Neues Unterrichtsfach anlegen</span>
                <button onClick={() => setShowAddSubject(false)} className="text-slate-500 hover:text-white">✕</button>
              </h3>
              
              {alertMsg && (
                <div className="mb-3 bg-rose-500/10 border border-rose-500/30 p-2 rounded-lg text-rose-300 text-[11px] font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{alertMsg}</span>
                </div>
              )}

              <form onSubmit={handleCreateSubject} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Fachbezeichnung</label>
                  <input
                    type="text"
                    value={newSubject.name}
                    onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                    placeholder="z.B. Mathematik"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Abkürzung (max. 3 Zeichen)</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={newSubject.abbreviation}
                    onChange={(e) => setNewSubject({ ...newSubject, abbreviation: e.target.value.toUpperCase() })}
                    placeholder="M"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Optionaler Zweitlehrer</label>
                  <select
                    value={newSubject.second_teacher_id}
                    onChange={(e) => setNewSubject({ ...newSubject, second_teacher_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Kein Zweitlehrer</option>
                    {users
                      .filter((u) => u.role !== "pupil")
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddSubject(false)}
                    className="flex-1 bg-slate-950 border border-slate-800 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-slate-900 transition-colors"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded-lg text-xs font-bold transition-colors shadow-md"
                  >
                    Erstellen
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Active Subject Matrix Rendering */}
        {selectedSubject ? (
          <div className="flex-1 flex flex-col min-w-max">
            {/* Context Header banner */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white tracking-tight">{selectedSubject.name}</h2>
                  <span className="px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-400 border border-indigo-800/60 font-mono text-xs font-bold">
                    {selectedSubject.abbreviation}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-3">
                  <span>Inhaber-ID: {selectedSubject.teacher_id}</span>
                  {selectedSubject.second_teacher_id && <span>Zweitlehrer-ID: {selectedSubject.second_teacher_id}</span>}
                  {!isOwnerOrCoTeacher && (
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Nur Lesezugriff (Privat)
                    </span>
                  )}
                </p>
              </div>

              {/* Action triggers with FEATURE 1 TOGGLEABLE WEIGHTING DASHBOARD BUTTON */}
              <div className="flex items-center gap-2">
                {isOwnerOrCoTeacher && (
                  <>
                    {/* EXCEL INTEROPERABILITY CONTROLS */}
                    <button
                      onClick={handleExcelExportTrigger}
                      className="bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
                      title="Strukturiertes Excel-Dokument inkl. Styles exportieren"
                    >
                      <span>📥 Excel Export</span>
                    </button>

                    <label className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs">
                      <span>📤 Excel Import</span>
                      <input
                        type="file"
                        accept=".xls,.xlsx,.csv"
                        onChange={handleExcelFileInput}
                        className="hidden"
                      />
                    </label>

                    {/* FEATURE 1 TRIGGER BUTTON */}
                    <button
                      onClick={() => setIsWeightingOpen(!isWeightingOpen)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all shadow-xs ${
                        isWeightingOpen 
                          ? "bg-amber-500 text-slate-950 border-amber-400 font-extrabold" 
                          : "bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-700/80"
                      }`}
                      title="Proportionales Balancing-Overlay ein-/ausblenden"
                    >
                      <Settings2 className="w-4 h-4 shrink-0" />
                      <span>Gewichtung ändern {isWeightingOpen ? "▲" : "▼"}</span>
                    </button>

                    <button
                      onClick={handleToggleProjection}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                        selectedSubject.projection_visible
                          ? "bg-slate-900 border-slate-700 text-slate-300"
                          : "bg-slate-950 border-slate-800 text-slate-600"
                      }`}
                      title="Ergebnisprojektion umschalten"
                    >
                      {selectedSubject.projection_visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>Projektion {selectedSubject.projection_visible ? "aktiv" : "stumm"}</span>
                    </button>

                    <button
                      onClick={() => setShowAddCategory(true)}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Kategorie hinzufügen</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* TOGGLEABLE WEIGHTING OVERLAY EMBED */}
            {isWeightingOpen && isOwnerOrCoTeacher && (
              <WeightingOverlay
                categories={balancedCategories}
                onWeightChange={handleWeightChange}
                onToggleLock={toggleLock}
                onClose={() => setIsWeightingOpen(false)}
              />
            )}

            {/* Sub-modal: create category */}
            {showAddCategory && (
              <form onSubmit={handleCreateCategory} className="mb-4 glass-panel p-4 flex flex-wrap items-end gap-3 shrink-0">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Kategoriename</label>
                  <input
                    type="text"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                    placeholder="z.B. Schularbeiten"
                    className="bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-white focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Gewichtung (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newCategory.weight_percentage}
                    onChange={(e) => setNewCategory({ ...newCategory, weight_percentage: Number(e.target.value) })}
                    className="w-20 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-white focus:outline-none text-center font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">Skala</label>
                  <select
                    value={newCategory.scale_type}
                    onChange={(e) => setNewCategory({ ...newCategory, scale_type: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="numeric_1_5">Noten 1-5</option>
                    <option value="gpa_4_0">GPA 4.0</option>
                    <option value="symbolic">+, ~, -</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pb-1.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newCategory.is_self_directed}
                      onChange={(e) => setNewCategory({ ...newCategory, is_self_directed: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>Als selbstgesteuert markieren</span>
                  </label>
                </div>
                <button type="submit" className="bg-cyan-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg h-[31px]">
                  Einfügen
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddCategory(false)}
                  className="text-slate-500 hover:text-slate-300 text-xs px-2 pb-1.5"
                >
                  Abbrechen
                </button>
              </form>
            )}

            {/* Sub-modal: Add Assessment column trigger placeholder */}
            {showAddAssessment && (
              <form onSubmit={handleAddAssessmentRow} className="mb-4 bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center gap-2 shrink-0">
                <span className="text-xs font-bold text-cyan-400">+ Leistungsnachweis:</span>
                <input
                  type="text"
                  value={newAssessmentName}
                  onChange={(e) => setNewAssessmentName(e.target.value)}
                  placeholder="Kurzbezeichnung (z.B. T1)"
                  className="bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs text-white focus:outline-none px-2 w-48"
                  autoFocus
                  required
                />
                <button type="submit" className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-lg">
                  Spalten instanziieren
                </button>
                <button type="button" onClick={() => setShowAddAssessment(null)} className="text-slate-500 text-xs px-2">
                  ✕
                </button>
              </form>
            )}

            {/* FEATURE 2 & 3: TRANSPOSED SUPER-NARROW SPREADSHEET TABLE GRID (Rows = Students, Columns = Assessments) */}
            <div className="glass-panel overflow-x-auto flex-1 border border-slate-800/80">
              <table className="w-full border-collapse text-left">
                {/* Header Row 1: Colored top border accents designating distinct Category membership */}
                <thead>
                  <tr className="bg-slate-950/90 border-b border-slate-800">
                    <th className="p-2.5 min-w-[140px] w-36 sticky left-0 bg-slate-950/95 z-20 border-r border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Kriterien-Gruppe
                    </th>
                    {balancedCategories.map((cat, cIdx) => {
                      const catColsCount = allColumns.filter(c => c.category.id === cat.id).length;
                      const borderAccent = categoryAccentBorders[cIdx % categoryAccentBorders.length];

                      return (
                        <th 
                          key={cat.id} 
                          colSpan={catColsCount} 
                          className={`p-1.5 text-center border-t-4 ${borderAccent} border-r-2 border-slate-700/80 bg-slate-900/30 text-[11px] font-bold text-slate-200 truncate`}
                        >
                          <div className="flex items-center justify-center gap-1 overflow-hidden">
                            <span className="truncate max-w-[90px]" title={cat.name}>{cat.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">({cat.weight_percentage}%)</span>
                            {cat.is_self_directed && (
                              <span className="px-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded text-[9px] font-mono font-extrabold shrink-0" title="Selbstgesteuertes Lernen (SDL)">
                                SDL
                              </span>
                            )}
                            
                            {/* Unified Scale Switching dropdown trigger embedded seamlessly */}
                            {isOwnerOrCoTeacher && (
                              <select
                                value={cat.scale_type || "numeric_1_5"}
                                onChange={(e) => handleScaleSwitch(cat.id, e.target.value as ScaleType)}
                                className="bg-slate-950 text-[9px] border border-slate-800 rounded text-slate-400 focus:outline-none ml-0.5 shrink-0"
                                title="Universelle Notenskala für diese Kategorie wechseln"
                              >
                                <option value="numeric_1_5">1-5</option>
                                <option value="gpa_4_0">4.0</option>
                                <option value="symbolic">+/-</option>
                              </select>
                            )}

                            {isOwnerOrCoTeacher && (
                              <button
                                onClick={() => setShowAddAssessment({ categoryId: cat.id })}
                                className="text-slate-500 hover:text-cyan-400 font-extrabold px-1 shrink-0"
                                title="Neue Leistungsspalte in dieser Kategorie verankern"
                              >
                                +
                              </button>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    {balancedCategories.length > 0 && (
                      <th className="p-2 w-16 text-center bg-indigo-950/40 border-l border-slate-800 text-[10px] font-bold text-indigo-300">
                        📊 Schnitt
                      </th>
                    )}
                  </tr>

                  {/* Header Row 2: Super-Narrow assessment column targets using writing-mode: vertical-rl if string length exceeds 3 */}
                  <tr className="bg-slate-950/60 border-b border-slate-800/80">
                    <th className="p-2 sticky left-0 bg-slate-950/95 z-20 border-r border-slate-800 text-[11px] font-medium text-slate-400 flex items-center justify-between">
                      <span>Schüler / Nachweis</span>
                      <span className="text-[9px] font-mono text-amber-500 font-bold shrink-0">🏷️ Tag</span>
                    </th>
                    {allColumns.map((col, idx) => {
                      const isColVis = col.colSubset.every(g => g.is_visible !== false);
                      const isLong = col.assessmentName.length > 3;

                      return (
                        <th
                          key={idx}
                          className={`p-1 w-10 min-w-[40px] max-w-[48px] text-center align-bottom h-28 transition-colors relative group/header ${
                            col.isCatLastCol ? "border-r-2 border-slate-700/80" : "border-r border-slate-800/40"
                          } ${!isColVis ? "bg-slate-950/80 opacity-50" : "bg-slate-950/20 hover:bg-slate-900/30"}`}
                        >
                          <div className="flex flex-col items-center justify-end h-full w-full">
                            {/* Hover overlay controllers at the peak of the narrow slot */}
                            {isOwnerOrCoTeacher && (
                              <div className="flex flex-col items-center gap-1 mb-1 opacity-0 group-hover/header:opacity-100 absolute top-1 inset-x-0 z-10 bg-slate-950/95 py-1 rounded shadow-xs transition-opacity">
                                <button
                                  onClick={() => setShowEditMetadataModal({
                                    assessmentId: col.metadata?.id,
                                    categoryId: col.category.id,
                                    oldName: col.assessmentName,
                                    initialName: col.assessmentName,
                                    initialInfoText: col.metadata?.info_text || "",
                                    initialDeadline: col.metadata?.deadline || null
                                  })}
                                  className="text-[10px] text-amber-400 hover:scale-110 transition-transform"
                                  title="Spalten-Eigenschaften & Fristen bearbeiten"
                                >
                                  <Edit3 className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  onClick={() => handleToggleColumnVisibility(col.category.id, col.assessmentName)}
                                  className="text-[9px] text-slate-400 hover:text-white"
                                  title={isColVis ? "Spalte stummschalten" : "Spalte aktivieren"}
                                >
                                  {isColVis ? "👁️" : "∅"}
                                </button>
                              </div>
                            )}

                            {/* Click trigger opening unified properties modal */}
                            <div
                              onClick={() => isOwnerOrCoTeacher && setShowEditMetadataModal({
                                assessmentId: col.metadata?.id,
                                categoryId: col.category.id,
                                oldName: col.assessmentName,
                                initialName: col.assessmentName,
                                initialInfoText: col.metadata?.info_text || "",
                                initialDeadline: col.metadata?.deadline || null
                              })}
                              className="cursor-pointer select-none w-full flex items-center justify-center flex-1 overflow-hidden py-1"
                              title="Klicken zum Bearbeiten der Spalteneigenschaften"
                            >
                              <span 
                                className={`text-[11px] font-bold tracking-tight text-slate-200 block whitespace-nowrap ${
                                  !isColVis ? "line-through text-slate-500" : ""
                                }`}
                                style={isLong ? { writingMode: "vertical-rl", transform: "rotate(180deg)" } : undefined}
                              >
                                {col.assessmentName}
                              </span>
                            </div>

                            {/* Category membership dot */}
                            <span className={`w-1 h-1 rounded-full mt-1 shrink-0 ${isColVis ? "bg-cyan-500/40" : "bg-rose-500/40"}`} />

                            {/* Active deadline indicator */}
                            {col.metadata?.deadline && (
                              <div className="mt-0.5 text-amber-400" title={`Frist: ${new Date(col.metadata.deadline).toLocaleDateString('de-DE')}`}>
                                <Calendar className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    {balancedCategories.length > 0 && <th className="p-1 w-16 border-l border-slate-800" />}
                  </tr>
                </thead>

                {/* Table Body: Stably sorted rows mapping individual Students */}
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {classPupils.map((p) => {
                    const curTagObj = pupilTags.find((t) => Number(t.pupil_id) === Number(p.id));
                    const curTagVal = curTagObj?.tier_tag || "none";
                    let tagSymbol = "➖";
                    if (curTagVal === "Meister") tagSymbol = "👑";
                    else if (curTagVal === "Geselle") tagSymbol = "🛠️";
                    else if (curTagVal === "Lehrling") tagSymbol = "🌱";

                    return (
                      <tr key={p.id} className="hover:bg-slate-900/30 transition-colors group/row">
                        {/* Sticky Left Name column + Mastery Switcher */}
                        <td className="p-2 sticky left-0 bg-slate-950/95 group-hover/row:bg-slate-900/90 z-20 border-r border-slate-800 flex items-center justify-between gap-1 transition-colors">
                          <div className="truncate pr-1">
                            <span className="text-xs font-bold text-white block truncate" title={p.name}>
                              {p.name.split(" ")[0]}
                            </span>
                            <span className="text-[9px] text-slate-500 block truncate font-normal">
                              {p.name.split(" ").slice(1).join(" ")}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={!isOwnerOrCoTeacher}
                            onClick={() => cycleMasteryTag(p.id)}
                            className="p-1 text-xs shrink-0 hover:scale-110 transition-transform disabled:opacity-50"
                            title={`Meisterschafts-Tag: ${curTagVal} (Klicken zum Umschalten)`}
                          >
                            {tagSymbol}
                          </button>
                        </td>

                        {/* Mapped narrow input matrix cells */}
                        {allColumns.map((col, cIdx) => {
                          const cellGradeObj = grades.find(
                            (g) =>
                              Number(g.category_id) === Number(col.category.id) &&
                              Number(g.pupil_id) === Number(p.id) &&
                              g.assessment_name === col.assessmentName
                          );
                          const currentValStr = cellGradeObj?.grade_value !== null && cellGradeObj?.grade_value !== undefined ? String(cellGradeObj.grade_value) : "";
                          const isCellVis = col.category.is_self_directed ? true : (cellGradeObj ? cellGradeObj.is_visible !== false : true);
                          const placeholderGuide = getPlaceholderForScale((col.category.scale_type || "numeric_1_5") as ScaleType);

                          if (currentUser?.role === "pupil" && !isCellVis) {
                            return <td key={cIdx} className={`p-0 w-10 text-center bg-slate-950/40 ${col.isCatLastCol ? "border-r-2 border-slate-700/80" : ""}`} />;
                          }

                          return (
                            <MemoizedNarrowGradeCell
                              key={cIdx}
                              categoryId={col.category.id}
                              pupilId={p.id}
                              assessmentName={col.assessmentName}
                              valueStr={currentValStr}
                              isVisible={isCellVis}
                              disabled={!isOwnerOrCoTeacher}
                              placeholderGuide={placeholderGuide}
                              maxLength={col.category.scale_type === "gpa_4_0" ? 3 : 1}
                              isCatLastCol={col.isCatLastCol}
                              onChange={handleGradeChange}
                              onContextMenu={handleCellContextMenu}
                            />
                          );
                        })}

                        {/* Projection Result Output Slot */}
                        {balancedCategories.length > 0 && (
                          selectedSubject.projection_visible ? (
                            <td className="p-2 text-center font-mono text-xs font-bold text-indigo-300 bg-indigo-950/20 border-l border-slate-800 select-all">
                              {getPupilProjection(p.id)}
                            </td>
                          ) : (
                            <td className="p-2 text-center text-slate-700 bg-slate-950/20 border-l border-slate-800 text-[10px]" title="Stummgeschaltet">
                              ∅
                            </td>
                          )
                        )}
                      </tr>
                    );
                  })}

                  {classPupils.length === 0 && (
                    <tr>
                      <td colSpan={allColumns.length + 2} className="p-8 text-center text-slate-600 italic">
                        Keine Schüler in der ausgewählten Klasse verzeichnet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-center max-w-sm mx-auto">
            <FileSpreadsheet className="w-16 h-16 text-slate-800 mb-3 stroke-1" />
            <h3 className="text-sm font-bold text-slate-400">Kein Fach ausgewählt</h3>
            <p className="text-xs mt-1">
              Wählen Sie links ein Fach aus oder legen Sie ein neues curricular gebundenes Evaluierungsmodul an.
            </p>
          </div>
        )}
      </main>

      {/* Embedded standalone column properties edit modal */}
      {showEditMetadataModal && (
        <EditAssessmentModal
          assessmentId={showEditMetadataModal.assessmentId}
          categoryId={showEditMetadataModal.categoryId}
          oldName={showEditMetadataModal.oldName}
          initialName={showEditMetadataModal.initialName}
          initialInfoText={showEditMetadataModal.initialInfoText}
          initialDeadline={showEditMetadataModal.initialDeadline}
          onClose={() => setShowEditMetadataModal(null)}
          onSaved={handleMetadataSaved}
        />
      )}
    </div>
  );
}
