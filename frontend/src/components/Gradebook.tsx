"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pupil, SchoolClass, Subject, Category, Grade, User, ColumnMetadata, PupilTag, RankPreviewEntry } from "@/types";
import { getApiUrl } from "@/utils/apiDiscovery";
import { fetchAuth } from "@/utils/fetchAuth";
import { ScaleType, toPercent } from "./gradeUtils";
import { useWeightBalancer } from "./useWeightBalancer";
import EditAssessmentModal from "./EditAssessmentModal";
import ParticipationTracker from "./ParticipationTracker";

// Modular Sub-components
import { WeightingOverlay } from "./gradebook/WeightingOverlay";
import { GradebookHeader } from "./gradebook/GradebookHeader";
import { GradebookTable } from "./gradebook/GradebookTable";

// Modular Hooks
import { useGradebookData, useGradebookMatrix } from "@/hooks/useGradebookData";
import { useGradebookMutations } from "@/hooks/useGradebookMutations";

interface GradebookProps {
  classes: SchoolClass[];
  pupils: Pupil[];
  socket?: unknown;
}

interface GradebookColumn {
  category: Category;
  assessmentName: string;
  isCatLastCol: boolean;
  colSubset: Grade[];
  metadata?: ColumnMetadata;
}

interface EditMetadataState {
  categoryId: number;
  oldName: string;
  metadata?: ColumnMetadata;
}

interface EditCategoryState {
  id: number;
  name: string;
  weight_percentage: number;
  scale_type: string;
  is_self_directed: boolean;
}

interface RankRules {
  meister_max_average: number;
  geselle_min_sdl: number;
}

interface GradingPreset {
  id: string;
  title: string;
  description: string;
  categories: { name: string; weight: number; scale: ScaleType; isSelfDirected?: boolean }[];
}

const GRADING_PRESETS: GradingPreset[] = [
  { id: "sprachen", title: "Sprachfächer Standard", description: "Kommunikation, Übungen und Leistungsmessung", categories: [{ name: "Mitarbeit", weight: 20, scale: "numeric_1_5" }, { name: "Lernzielkontrollen", weight: 30, scale: "percentage", isSelfDirected: true }, { name: "Schularbeiten", weight: 50, scale: "numeric_1_5" }] },
  { id: "mint", title: "MINT-Fach Fokus", description: "Tests, Übungen und Schularbeiten", categories: [{ name: "Mitarbeit", weight: 15, scale: "numeric_1_5" }, { name: "Lernzielkontrollen", weight: 35, scale: "numeric_0_100", isSelfDirected: true }, { name: "Schularbeiten", weight: 50, scale: "numeric_1_5" }] },
  { id: "projekt", title: "Projektbasiertes Lernen", description: "Projektarbeit mit Reflexion", categories: [{ name: "Aktive Mitarbeit", weight: 25, scale: "numeric_1_5" }, { name: "Portfolio", weight: 35, scale: "percentage", isSelfDirected: true }, { name: "Projektpräsentation", weight: 40, scale: "numeric_1_5" }] },
  { id: "offen", title: "Offener Unterricht", description: "Selbststeuerung und Lernfortschritt", categories: [{ name: "Offenes Lernen", weight: 40, scale: "percentage", isSelfDirected: true }, { name: "Mitarbeit", weight: 30, scale: "numeric_1_5" }, { name: "Reflexion", weight: 30, scale: "numeric_1_5" }] },
  { id: "sport", title: "Schulsport", description: "Aktivität, Technik, Teamleistung", categories: [{ name: "Aktive Mitarbeit", weight: 35, scale: "numeric_1_5" }, { name: "Technik", weight: 30, scale: "numeric_1_5" }, { name: "Leistungstest", weight: 35, scale: "numeric_1_5" }] },
  { id: "klassisch", title: "Klassischer Unterricht", description: "Bewährte Mischung", categories: [{ name: "Mitarbeit", weight: 30, scale: "numeric_1_5" }, { name: "Hausübungen", weight: 20, scale: "numeric_1_5", isSelfDirected: true }, { name: "Tests", weight: 20, scale: "percentage" }, { name: "Schularbeiten", weight: 30, scale: "numeric_1_5" }] },
  { id: "kreativ", title: "Kreativwerkstatt", description: "Produkte und Präsentation", categories: [{ name: "Prozess", weight: 30, scale: "numeric_1_5" }, { name: "Produkt", weight: 40, scale: "numeric_1_5" }, { name: "Präsentation", weight: 30, scale: "numeric_1_5" }] },
  { id: "kompetenz", title: "Kompetenzraster", description: "Kompetenzorientierte Verteilung", categories: [{ name: "Grundkompetenzen", weight: 40, scale: "percentage" }, { name: "Vertiefung", weight: 30, scale: "percentage", isSelfDirected: true }, { name: "Transfer", weight: 30, scale: "numeric_1_5" }] }
];

export default function Gradebook({ classes, pupils, socket }: GradebookProps) {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isWeightingOpen, setIsWeightingOpen] = useState(false);
  const [gradebookView, setGradebookView] = useState<"insights" | "matrix" | "guilds" | "participation">("insights");

  // Data Queries
  const { subjects, isLoadingSubjects, refetchSubjects } = useGradebookData(selectedClassId);
  const matrixQuery = useGradebookMatrix(selectedSubject?.id || null);
  const { categories = [], grades = [], pupil_tags: matrixPupilTags = [] } = matrixQuery.data || {};

  // Mutations
  const mutations = useGradebookMutations(selectedSubject?.id || null);

  // UI state for modals
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: "", abbreviation: "", second_teacher_id: "" });
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({ 
    name: "", 
    weight_percentage: 20, 
    scale_type: "numeric_1_5" as ScaleType,
    is_self_directed: false,
    default_deadline: ""
  });

  const [showAddAssessment, setShowAddAssessment] = useState<{ categoryId: number } | null>(null);
  const [newAssessmentName, setNewAssessmentName] = useState("");
  const [showEditMetadataModal, setShowEditMetadataModal] = useState<EditMetadataState | null>(null);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState<EditCategoryState | null>(null);
  const [showRankConfigModal, setShowRankConfigModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(GRADING_PRESETS[0].id);
  const [isApplyingPreset, setIsApplyingPreset] = useState(false);
  const [focusParticipationWeek, setFocusParticipationWeek] = useState<string | null>(null);
  const [guildThresholds, setGuildThresholds] = useState<Record<number, { journeyman: number; master: number }>>({});
  const [rankConfig, setRankConfig] = useState<{level: number; name: string; symbol: string}[]>([
    { level: 1, name: 'Lehrling', symbol: '🌱' },
    { level: 2, name: 'Geselle', symbol: '🛠️' },
    { level: 3, name: 'Meister', symbol: '👑' }
  ]);
  const [rankRules, setRankRules] = useState<RankRules>({
    meister_max_average: 1.5,
    geselle_min_sdl: 3
  });
  const weightsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateWeightsMutateRef = useRef(mutations.updateWeights.mutate);

  const classPupils = useMemo(() => {
    const targetClass = classes.find((c) => Number(c.id) === Number(selectedClassId));
    if (!targetClass) return [];
    return pupils.filter((p) => p.class_name === targetClass.name).sort((a, b) => a.name.localeCompare(b.name));
  }, [pupils, classes, selectedClassId]);

  useEffect(() => {
    const uStr = localStorage.getItem("user");
    if (uStr) setCurrentUser(JSON.parse(uStr));
  }, []);

  useEffect(() => {
    if (classes.length === 0) return;
    const savedClass = localStorage.getItem("saved_class_id");
    if (savedClass && classes.some((c) => Number(c.id) === Number(savedClass))) {
      setSelectedClassId(Number(savedClass));
    } else {
      setSelectedClassId(classes[0].id);
    }
  }, [classes]);

  useEffect(() => {
    if (subjects.length === 0) {
      if (selectedSubject !== null) setSelectedSubject(null);
      return;
    }
    const currentIsStillValid = selectedSubject && subjects.some((s) => Number(s.id) === Number(selectedSubject.id));
    if (currentIsStillValid) return;
    
    const savedSubjId = localStorage.getItem(`saved_subject_${selectedClassId}`);
    const targetSubj = subjects.find((s) => Number(s.id) === Number(savedSubjId)) || subjects[0];
    
    if (targetSubj && (!selectedSubject || Number(targetSubj.id) !== Number(selectedSubject.id))) {
      setSelectedSubject(targetSubj);
    }
  }, [subjects, selectedClassId, selectedSubject]);


  useEffect(() => {
    if (!selectedSubject) return;
    localStorage.setItem(`saved_subject_${selectedClassId}`, String(selectedSubject.id));

    // Load rank configuration for the subject
    const loadRankConfig = async () => {
      try {
        const { data } = await fetchAuth(`/api/gradebook/rank-config/${selectedSubject.id}`);
        if (data && data.ranks) {
          setRankConfig(data.ranks);
        }
        if (data?.rules) {
          setRankRules({
            meister_max_average: Number(data.rules.meister_max_average ?? 1.5),
            geselle_min_sdl: Number(data.rules.geselle_min_sdl ?? 3)
          });
        }
      } catch (err) {
        console.error('Failed to load rank config:', err);
      }
    };
    loadRankConfig();
  }, [selectedClassId, selectedSubject]);

  const isOwner = useMemo(() => {
    if (!currentUser || !selectedSubject) return false;
    if (currentUser.role === "admin") return true;
    return Number(selectedSubject.teacher_id) === Number(currentUser.id) ||
           Number(selectedSubject.second_teacher_id) === Number(currentUser.id);
  }, [currentUser, selectedSubject]);

  const participationGapQuery = useQuery<{
    blocked: boolean;
    previous_week_start?: string;
    previous_week_end?: string;
    reason?: string;
  }>({
    queryKey: ["participation-gap", selectedSubject?.id, currentUser?.id],
    queryFn: async () => {
      if (!selectedSubject) return { blocked: false };
      const { data } = await fetchAuth(`/api/gradebook/participation-gap/${selectedSubject.id}`);
      return data;
    },
    enabled: !!selectedSubject && !!currentUser && currentUser.role !== "pupil" && isOwner,
    staleTime: 15_000
  });

  // Rank Preview — teacher-only, loaded per selected subject (placed after isOwner to avoid TDZ error)
  const rankPreviewQuery = useQuery<RankPreviewEntry[]>({
    queryKey: ["rank-preview", selectedSubject?.id],
    queryFn: async () => {
      if (!selectedSubject) return [];
      const { data } = await fetchAuth(`/api/gradebook/rank-preview/${selectedSubject.id}`);
      return data as RankPreviewEntry[];
    },
    enabled: !!selectedSubject && isOwner,
    staleTime: 30_000
  });
  const rankPreview = rankPreviewQuery.data || [];

  // Debounced weight saving
  const saveWeightsDebounced = useCallback((updatedCats: Category[]) => {
    if (weightsDebounceRef.current) clearTimeout(weightsDebounceRef.current);
    weightsDebounceRef.current = setTimeout(() => {
      updateWeightsMutateRef.current(updatedCats.map(c => ({ 
      id: c.id, 
      weight_percentage: c.weight_percentage 
    })));
    }, 250);
  }, []);

  useEffect(() => () => {
    if (weightsDebounceRef.current) clearTimeout(weightsDebounceRef.current);
  }, []);

  useEffect(() => {
    updateWeightsMutateRef.current = mutations.updateWeights.mutate;
  }, [mutations.updateWeights.mutate]);

  const { categories: balancedCategories, handleWeightChange, toggleLock } = useWeightBalancer(categories, saveWeightsDebounced);

  const allColumns = useMemo<GradebookColumn[]>(() => {
    const list: GradebookColumn[] = [];
    balancedCategories.forEach((cat) => {
      const subset = grades.filter((g) => Number(g.category_id) === Number(cat.id));
      const uniqueNames = Array.from(new Set(subset.map((g) => g.assessment_name || "Note")));
      const metadataRows = Array.isArray(cat.column_metadata) ? cat.column_metadata : [];
      const metadataNames = metadataRows.map((m) => m.name);
      const names = uniqueNames.length > 0 ? uniqueNames : ["Bewertung 1"];
      const mergedNames = Array.from(new Set([...names, ...metadataNames]));

      mergedNames.forEach((assName, idx) => {
        const metadata = metadataRows.find((m) => m.name === assName);
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

  useEffect(() => {
    if (categories.length === 0) return;
    setGuildThresholds((prev) => {
      const next = { ...prev };
      categories.forEach((cat) => {
        if (!next[cat.id]) next[cat.id] = { journeyman: 45, master: 75 };
      });
      return next;
    });
  }, [categories]);

  const rowInsights = useMemo(() => {
    return classPupils.map((pupil) => {
      const values = allColumns
        .map((col) => {
          const grade = grades.find((g) => Number(g.category_id) === Number(col.category.id) && Number(g.pupil_id) === Number(pupil.id) && g.assessment_name === col.assessmentName);
          return toPercent(grade?.grade_value?.toString() ?? null, col.category.scale_type);
        })
        .filter((v): v is number => v !== null);
      const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
      const trend = values.length >= 4 ? (values.slice(-3).reduce((a, b) => a + b, 0) / 3) - (values.slice(0, 3).reduce((a, b) => a + b, 0) / 3) : 0;
      return { pupilId: pupil.id, pupilName: pupil.name, average: avg, trend };
    });
  }, [classPupils, allColumns, grades]);

  const insightsStats = useMemo(() => {
    const validRows = rowInsights.filter((r) => r.average !== null) as { pupilId: number; pupilName: string; average: number; trend: number }[];
    const classAvg = validRows.length > 0 ? validRows.reduce((sum, r) => sum + r.average, 0) / validRows.length : 0;
    const topMover = [...validRows].sort((a, b) => b.trend - a.trend)[0];
    const mostConsistent = [...validRows].sort((a, b) => Math.abs(a.trend) - Math.abs(b.trend))[0];
    const categoryAverages = categories.map((cat) => {
      const vals = grades
        .filter((g) => Number(g.category_id) === Number(cat.id))
        .map((g) => toPercent(g.grade_value?.toString() ?? null, cat.scale_type))
        .filter((v): v is number => v !== null);
      return { id: cat.id, name: cat.name, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 };
    });
    const numeric15 = grades
      .filter((g) => categories.find((c) => Number(c.id) === Number(g.category_id))?.scale_type === "numeric_1_5")
      .map((g) => Number(g.grade_value))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5)
      .map((v) => Math.round(v));
    const gradeDistribution = [1, 2, 3, 4, 5].map((grade) => ({
      grade,
      count: numeric15.filter((v) => v === grade).length
    }));
    const trendSeries = Array.from({ length: 20 }).map((_, idx) => {
      const y = 60 + Math.sin(idx / 3) * 16 + Math.min(18, idx * 1.2);
      return Math.max(5, Math.min(98, y));
    });
    return { classAvg, topMover, mostConsistent, categoryAverages, trendSeries, gradeDistribution };
  }, [rowInsights, categories, grades]);

  const guildCounts = useMemo(() => {
    let apprentice = 0;
    let journeyman = 0;
    let master = 0;
    const byPupil = new Map<number, string>();
    classPupils.forEach((p) => {
      const manual = matrixPupilTags.find((t) => Number(t.pupil_id) === Number(p.id))?.tier_tag;
      if (manual) {
        byPupil.set(p.id, manual);
      } else {
        const catPercents = categories.map((cat) => {
          const vals = grades
            .filter((g) => Number(g.pupil_id) === Number(p.id) && Number(g.category_id) === Number(cat.id))
            .map((g) => toPercent(g.grade_value?.toString() ?? null, cat.scale_type))
            .filter((v): v is number => v !== null);
          if (vals.length === 0) return null;
          return (vals.reduce((a, b) => a + b, 0) / vals.length) * 100;
        }).filter((v): v is number => v !== null);
        const score = catPercents.length ? catPercents.reduce((a, b) => a + b, 0) / catPercents.length : 0;
        const allThresholds = Object.values(guildThresholds);
        const avgJourneyman = allThresholds.length ? allThresholds.reduce((s, t) => s + t.journeyman, 0) / allThresholds.length : 45;
        const avgMaster = allThresholds.length ? allThresholds.reduce((s, t) => s + t.master, 0) / allThresholds.length : 75;
        if (score >= avgMaster) byPupil.set(p.id, "Meister");
        else if (score >= avgJourneyman) byPupil.set(p.id, "Geselle");
        else byPupil.set(p.id, "Lehrling");
      }
    });
    byPupil.forEach((rank) => {
      if (rank === "Meister") master++;
      else if (rank === "Geselle") journeyman++;
      else apprentice++;
    });
    return { apprentice, journeyman, master };
  }, [classPupils, matrixPupilTags, categories, grades, guildThresholds]);

  // Handlers
  const handleGradeChange = useCallback((categoryId: number, pupilId: number, assessmentName: string, valStr: string) => {
    if (!isOwner) return;
    const trimmedVal = valStr.trim();
    mutations.updateGrade.mutate({
      category_id: categoryId,
      pupil_id: pupilId,
      assessment_name: assessmentName,
      grade_value: trimmedVal === "" ? null : trimmedVal,
      is_visible: true
    });
  }, [isOwner, mutations.updateGrade]);

  const handleCellContextMenu = useCallback(async (e: React.MouseEvent, catId: number, pupilId: number, assName: string) => {
    e.preventDefault();
    if (!isOwner) return;
    const currentGrade = grades.find(g => g.category_id === catId && g.pupil_id === pupilId && g.assessment_name === assName);
    const targetVis = currentGrade ? !currentGrade.is_visible : false;
    
    mutations.updateGrade.mutate({
      category_id: catId,
      pupil_id: pupilId,
      assessment_name: assName,
      is_visible: targetVis
    });
  }, [isOwner, grades, mutations.updateGrade]);

  const handleOpenAddAssessment = useCallback((catId: number, suggestedName?: string) => {
    if (suggestedName) {
      setNewAssessmentName(suggestedName);
    }
    setShowAddAssessment({ categoryId: catId });
  }, []);

  const handleRenameColumn = async (catId: number, oldName: string) => {
    if (!isOwner) return;
    const nextName = prompt("Neuer Name für die Bewertung:", oldName);
    if (!nextName || !nextName.trim() || nextName.trim() === oldName) return;
    try {
      await fetchAuth("/api/assessments/0", {
        method: "PUT",
        body: JSON.stringify({
          category_id: catId,
          old_name: oldName,
          name: nextName.trim(),
          info_text: null,
          deadline: null
        })
      });
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
      toast.success("Bewertung umbenannt");
    } catch (err: unknown) {
      toast.error("Umbenennen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleOpenEditMetadata = useCallback((catId: number, assName: string, metadata?: ColumnMetadata) => {
    setShowEditMetadataModal({ categoryId: catId, oldName: assName, metadata });
  }, []);

  const handleOpenEditCategory = useCallback((category: Category) => {
    if (!isOwner) return;
    setShowEditCategoryModal({
      id: category.id,
      name: category.name,
      weight_percentage: Number(category.weight_percentage) || 0,
      scale_type: category.scale_type || "numeric_1_5",
      is_self_directed: !!category.is_self_directed
    });
  }, [isOwner]);

  const refetchMatrix = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
  }, [queryClient, selectedSubject?.id]);

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await fetchAuth("/api/gradebook/subject", {
        method: "POST",
        body: JSON.stringify({
          ...newSubject,
          class_id: selectedClassId,
          abbreviation: newSubject.abbreviation || newSubject.name.substring(0, 2).toUpperCase(),
        }),
      });
      refetchSubjects();
      setShowAddSubject(false);
      setSelectedSubject(data);
      setShowWizard(true);
      setGradebookView("insights");
      toast.success("Fach registriert");
    } catch (err: unknown) {
      toast.error("Fach konnte nicht erstellt werden", {
        description: err instanceof Error ? err.message : "Bitte Eingaben prüfen und erneut versuchen."
      });
    }
  };

  const handleToggleProjection = async () => {
    if (!selectedSubject || !isOwner) return;
    try {
      const { data } = await fetchAuth(`/api/gradebook/subject/${selectedSubject.id}/toggle-projection`, { method: "PUT" });
      setSelectedSubject((prev) => prev ? ({ ...prev, projection_visible: Boolean(data.projection_visible) }) : prev);
      toast.success(`Projektion ${data.projection_visible ? "aktiviert" : "deaktiviert"}`);
    } catch (err: unknown) {
      toast.error("Projektion konnte nicht umgeschaltet werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    mutations.createCategory.mutate(newCategory, {
      onSuccess: () => setShowAddCategory(false)
    });
  };

  const handleDeleteCategory = async (catId: number) => {
    if (!confirm("Kategorie restlos entfernen?")) return;
    try {
      await fetchAuth(`/api/gradebook/category/${catId}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
      toast.info("Kategorie gelöscht");
    } catch (err: unknown) {
      toast.error("Kategorie konnte nicht gelöscht werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleAddAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddAssessment || !newAssessmentName.trim()) return;
    const catId = showAddAssessment.categoryId;
    const name = newAssessmentName.trim();

    try {
      await fetchAuth("/api/assessments/0", {
        method: "PUT",
        body: JSON.stringify({ category_id: catId, old_name: name, name, info_text: null, deadline: null })
      });
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
      setShowAddAssessment(null);
      setNewAssessmentName("");
    } catch (err: unknown) {
      toast.error("Bewertung konnte nicht hinzugefügt werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleScaleSwitch = async (catId: number, newScale: ScaleType) => {
    if (!isOwner) return;
    try {
      await fetchAuth("/api/gradebook/category-scale", {
        method: "PUT",
        body: JSON.stringify({ category_id: catId, scale_type: newScale })
      });
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
      toast.success("Skala geändert");
    } catch (err: unknown) {
      toast.error("Skala konnte nicht geändert werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleToggleColumnVisibility = async (catId: number, assName: string) => {
    if (!isOwner) return;
    const colGrades = grades.filter(g => Number(g.category_id) === catId && g.assessment_name === assName);
    const currentVis = colGrades.every(g => g.is_visible !== false);
    const targetVis = !currentVis;

    try {
      await fetchAuth("/api/gradebook/column-visibility", {
        method: "PUT",
        body: JSON.stringify({ category_id: catId, assessment_name: assName, is_visible: targetVis })
      });
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
      toast.success(`Spalte ${targetVis ? "sichtbar" : "ausgeblendet"}`);
    } catch (err: unknown) {
      toast.error("Spaltensichtbarkeit konnte nicht geändert werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleToggleCellVisibility = async (catId: number, pupilId: number, assName: string, isVisible: boolean) => {
    if (!isOwner) return;
    try {
      await fetchAuth("/api/gradebook/cell-visibility", {
        method: "PUT",
        body: JSON.stringify({ category_id: catId, pupil_id: pupilId, assessment_name: assName, is_visible: isVisible })
      });
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
    } catch (err: unknown) {
      toast.error("Sichtbarkeit konnte nicht geändert werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleToggleCategoryVisibility = async (catId: number) => {
    if (!isOwner) return;
    try {
      await fetchAuth(`/api/gradebook/category/${catId}/toggle-visibility`, { method: "PUT" });
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
      toast.success("Bereichssichtbarkeit aktualisiert");
    } catch (err: unknown) {
      toast.error("Sichtbarkeit konnte nicht geändert werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleSaveCategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditCategoryModal) return;
    try {
      await fetchAuth(`/api/gradebook/category/${showEditCategoryModal.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: showEditCategoryModal.name,
          weight_percentage: showEditCategoryModal.weight_percentage,
          scale_type: showEditCategoryModal.scale_type,
          is_self_directed: showEditCategoryModal.is_self_directed
        })
      });
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
      setShowEditCategoryModal(null);
      toast.success("Bereich aktualisiert");
    } catch (err: unknown) {
      toast.error("Bereich konnte nicht aktualisiert werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleExport = async () => {
    if (!selectedSubject) return;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/gradebook/export/${selectedSubject.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Export fehlgeschlagen");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Notenliste_${selectedSubject.abbreviation}_${new Date().toISOString().split("T")[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error("Export fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSubject) return;

    const formData = new FormData();
    formData.append("file", file);

    const toastId = toast.loading("Daten werden importiert...");

    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/gradebook/import/${selectedSubject.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Import fehlgeschlagen");
      }

      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject.id] });
      toast.success("Import erfolgreich", { id: toastId });
    } catch (err: unknown) {
      toast.error("Import fehlgeschlagen", {
        id: toastId,
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const handleSaveRankConfig = async () => {
    if (!selectedSubject || !isOwner) return;
    try {
      await fetchAuth(`/api/gradebook/rank-config/${selectedSubject.id}`, {
        method: "PUT",
        body: JSON.stringify({ ranks: rankConfig, rules: rankRules })
      });
      setShowRankConfigModal(false);
      toast.success("Rang-Konfiguration gespeichert");
    } catch (err: unknown) {
      toast.error("Speichern fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };

  const handleRankChange = useCallback((pupilId: number, tierTag: string | null) => {
    if (!isOwner) return;
    mutations.updateTag.mutate({ pupil_id: pupilId, tier_tag: tierTag });
  }, [isOwner, mutations.updateTag]);

  const handleApplyPreset = async () => {
    if (!selectedSubject || !isOwner) return;
    const preset = GRADING_PRESETS.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    setIsApplyingPreset(true);
    try {
      for (const cat of categories) {
        await fetchAuth(`/api/gradebook/category/${cat.id}`, { method: "DELETE" });
      }

      const created: { id: number; weight: number; scale: ScaleType }[] = [];
      for (const entry of preset.categories) {
        const { data } = await fetchAuth("/api/gradebook/category", {
          method: "POST",
          body: JSON.stringify({
            subject_id: selectedSubject.id,
            name: entry.name,
            weight_percentage: entry.weight,
            scale_type: entry.scale,
            is_self_directed: !!entry.isSelfDirected
          })
        });
        created.push({ id: Number(data.id), weight: entry.weight, scale: entry.scale });
      }

      await fetchAuth("/api/gradebook/weights", {
        method: "PUT",
        body: JSON.stringify({
          subject_id: selectedSubject.id,
          weights: created.map((c) => ({ id: c.id, weight_percentage: c.weight }))
        })
      });
      for (const c of created) {
        await fetchAuth("/api/gradebook/category-scale", {
          method: "PUT",
          body: JSON.stringify({ category_id: c.id, scale_type: c.scale })
        });
      }
      queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject.id] });
      toast.success(`Preset „${preset.title}“ angewendet`);
      setShowWizard(false);
    } catch (err: unknown) {
      toast.error("Wizard-Preset konnte nicht angewendet werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    } finally {
      setIsApplyingPreset(false);
    }
  };

  const handleMarkPreviousWeekAbsent = async () => {
    if (!selectedSubject || !participationGapQuery.data?.previous_week_start) return;
    try {
      await fetchAuth(`/api/gradebook/participation-gap/${selectedSubject.id}/skip`, {
        method: "POST",
        body: JSON.stringify({ week_start: participationGapQuery.data.previous_week_start })
      });
      await participationGapQuery.refetch();
      toast.success("Woche als abwesend / keine Schule markiert");
    } catch (err: unknown) {
      toast.error("Markierung fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    }
  };


  if (!selectedClassId && isLoadingSubjects) {
    return <div className="flex-1 flex items-center justify-center">Lade Fächer...</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950/20 rounded-3xl p-4 border border-slate-800/40 backdrop-blur-sm relative overflow-hidden">
      <GradebookHeader
        classes={classes}
        selectedClassId={selectedClassId}
        setSelectedClassId={setSelectedClassId}
        subjects={subjects}
        selectedSubject={selectedSubject}
        onSubjectSelect={setSelectedSubject}
        onAddSubject={() => setShowAddSubject(true)}
        onAddCategory={() => setShowAddCategory(true)}
        onToggleProjection={handleToggleProjection}
        onToggleWeighting={() => setIsWeightingOpen(!isWeightingOpen)}
        onExport={handleExport}
        onImport={handleImportClick}
        onOpenRankConfig={() => setShowRankConfigModal(true)}
        onOpenWizard={() => setShowWizard(true)}
        isLoading={matrixQuery.isLoading}

        refetch={refetchMatrix}
        isOwner={isOwner}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx"
        className="hidden"
      />


      {isWeightingOpen && (
        <WeightingOverlay
          categories={balancedCategories}
          onWeightChange={handleWeightChange}
          onToggleLock={toggleLock}
          onClose={() => setIsWeightingOpen(false)}
        />
      )}

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-4 pb-4 border-b border-slate-800/40">
        <button
          onClick={() => setGradebookView("insights")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            gradebookView === "insights"
              ? "bg-slate-800 text-white shadow-xs"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
          }`}
        >
          📈 Insights (Ergebnisse & Trends)
        </button>
        <button
          onClick={() => setGradebookView("matrix")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            gradebookView === "matrix"
              ? "bg-slate-800 text-white shadow-xs"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
          }`}
        >
          📊 Notenmatrix
        </button>
        <button
          onClick={() => setGradebookView("guilds")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            gradebookView === "guilds"
              ? "bg-slate-800 text-white shadow-xs"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
          }`}
        >
          👑 Gilden-Ränge
        </button>
        <button
          onClick={() => setGradebookView("participation")}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            gradebookView === "participation"
              ? "bg-slate-800 text-white shadow-xs"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
          }`}
        >
          💎 Mitarbeit
        </button>
      </div>

      {gradebookView === "insights" && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="grid md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-indigo-500/30 bg-slate-900/60 backdrop-blur px-4 py-3">
              <div className="text-xs text-indigo-300 font-bold">📈 Klassen-Ø</div>
              <div className="text-2xl text-white font-black">{(insightsStats.classAvg * 100).toFixed(0)}%</div>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/60 backdrop-blur px-4 py-3">
              <div className="text-xs text-emerald-300 font-bold">🎯 Top-Aufsteiger der Woche</div>
              <div className="text-sm text-white font-bold truncate">{insightsStats.topMover?.pupilName || "—"}</div>
            </div>
            <div className="rounded-2xl border border-amber-500/30 bg-slate-900/60 backdrop-blur px-4 py-3">
              <div className="text-xs text-amber-300 font-bold">🔥 Konstanteste Leistung</div>
              <div className="text-sm text-white font-bold truncate">{insightsStats.mostConsistent?.pupilName || "—"}</div>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-slate-900/60 backdrop-blur px-4 py-3">
              <div className="text-xs text-violet-300 font-bold">🏆 Bewertungsbereiche</div>
              <div className="text-2xl text-white font-black">{categories.length}</div>
            </div>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">Ergebnisse & Trends (20 Wochen)</div>
              <svg viewBox="0 0 420 150" className="w-full h-40">
                <polyline fill="none" stroke="#60a5fa" strokeWidth="3" points={insightsStats.trendSeries.map((v, i) => `${(i / 19) * 410},${140 - (v / 100) * 120}`).join(" ")} />
              </svg>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400 mb-3">Kategorienvergleich</div>
              <div className="space-y-2">
                {insightsStats.categoryAverages.map((c) => (
                  <div key={c.id}>
                    <div className="flex justify-between text-[11px] text-slate-300"><span>{c.name}</span><span>{Math.round(c.avg * 100)}%</span></div>
                    <div className="h-2 rounded bg-slate-800"><div className="h-2 rounded bg-indigo-500" style={{ width: `${Math.round(c.avg * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Notenverteilungskurve</div>
                <svg viewBox="0 0 220 70" className="w-full h-20">
                  <polyline
                    fill="none"
                    stroke="#a78bfa"
                    strokeWidth="2"
                    points={insightsStats.gradeDistribution
                      .map((d, i) => `${20 + i * 45},${60 - Math.min(55, d.count * 6)}`)
                      .join(" ")}
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {gradebookView === "matrix" && (
        <GradebookTable
          pupils={classPupils}
          categories={balancedCategories}
          grades={grades}
          columns={allColumns}
          pupilTags={matrixPupilTags}
          rankPreview={rankPreview}
          rankConfig={rankConfig}
          currentUser={currentUser}
          isOwner={isOwner}
          onGradeChange={handleGradeChange}
          onCellContextMenu={handleCellContextMenu}
          onAddAssessment={handleOpenAddAssessment}
          onRenameColumn={handleRenameColumn}
          onEditMetadata={handleOpenEditMetadata}
          onDeleteCategory={handleDeleteCategory}
          onScaleSwitch={handleScaleSwitch}
          onToggleColumnVisibility={handleToggleColumnVisibility}
          onToggleCategoryVisibility={handleToggleCategoryVisibility}
          onEditCategory={handleOpenEditCategory}
          onToggleCellVisibility={handleToggleCellVisibility}
          onRankChange={handleRankChange}
          showOwnerInsights={false}
        />
      )}

      {gradebookView === "guilds" && (
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-900/10 p-4 transition-all">
              <div className="text-xs text-emerald-200 font-bold">🌱 Lehrlinge</div>
              <div className="text-3xl text-white font-black">{guildCounts.apprentice}</div>
            </div>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-900/10 p-4 transition-all">
              <div className="text-xs text-amber-200 font-bold">🛠️ Gesellen</div>
              <div className="text-3xl text-white font-black">{guildCounts.journeyman}</div>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-violet-900/10 p-4 transition-all">
              <div className="text-xs text-violet-200 font-bold">👑 Meister</div>
              <div className="text-3xl text-white font-black">{guildCounts.master}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 space-y-4">
            <h3 className="text-sm font-bold text-white">Ränge & Meisterklassen</h3>
            {categories.map((cat) => {
              const t = guildThresholds[cat.id] || { journeyman: 45, master: 75 };
              return (
                <div key={cat.id} className="space-y-2">
                  <div className="flex justify-between text-xs text-slate-300"><span>{cat.name}</span><span>Geselle {t.journeyman}% · Meister {t.master}%</span></div>
                  <div className="relative">
                    <input type="range" min={0} max={100} value={t.journeyman} onChange={(e) => {
                      const v = Number(e.target.value);
                      setGuildThresholds((prev) => ({ ...prev, [cat.id]: { journeyman: Math.min(v, (prev[cat.id]?.master ?? 75) - 1), master: prev[cat.id]?.master ?? 75 } }));
                    }} className="w-full accent-amber-500" />
                    <input type="range" min={0} max={100} value={t.master} onChange={(e) => {
                      const v = Number(e.target.value);
                      setGuildThresholds((prev) => ({ ...prev, [cat.id]: { journeyman: prev[cat.id]?.journeyman ?? 45, master: Math.max(v, (prev[cat.id]?.journeyman ?? 45) + 1) } }));
                    }} className="w-full accent-violet-500 -mt-2" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <h4 className="text-xs uppercase tracking-widest text-slate-400 mb-2">Manuelle Rang-Overrides</h4>
            <div className="grid md:grid-cols-2 gap-2">
              {classPupils.map((pupil) => {
                const currentRank = matrixPupilTags.find((t) => Number(t.pupil_id) === Number(pupil.id))?.tier_tag || "none";
                return (
                  <div key={pupil.id} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2">
                    <span className="text-xs text-slate-200 truncate">{pupil.name}</span>
                    <select value={currentRank} onChange={(e) => handleRankChange(pupil.id, e.target.value === "none" ? null : e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[10px]">
                      <option value="none">Auto</option>
                      <option value="Lehrling">🌱 Lehrling</option>
                      <option value="Geselle">🛠️ Geselle</option>
                      <option value="Meister">👑 Meister</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {gradebookView === "participation" && selectedSubject && (
        <div className="flex-1 overflow-y-auto">
          <ParticipationTracker
            subjects={subjects}
            pupils={classPupils}
            classId={selectedClassId}
            initialSubjectId={selectedSubject.id}
            initialWeekStart={focusParticipationWeek}
            initialLessonDate={focusParticipationWeek}
          />
        </div>
      )}

      {participationGapQuery.data?.blocked && gradebookView !== "participation" && (
        <div className="absolute inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-amber-500/30 bg-slate-900/90 shadow-2xl p-6">
            <h3 className="text-xl font-black text-white mb-2">⚠️ Fehlende Mitarbeitseinträge für letzte Woche!</h3>
            <p className="text-sm text-slate-300 mb-6">
              Bitte schließen Sie die Mitarbeit zuerst ab, damit die Notenbasis vollständig bleibt.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setFocusParticipationWeek(participationGapQuery.data?.previous_week_start || null);
                  setGradebookView("participation");
                }}
                className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
              >
                Mitarbeit Nachtragen für Woche vom{" "}
                {participationGapQuery.data?.previous_week_start?.split("-").reverse().join(".")}
                {" "}bis{" "}
                {participationGapQuery.data?.previous_week_end?.split("-").reverse().join(".")} 📝
              </button>
              <button
                onClick={handleMarkPreviousWeekAbsent}
                className="px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
              >
                Klasse war abwesend / Keine Schule 🚌
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateSubject} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white">Neues Fach registrieren</h2>
            <div className="space-y-4">
              <input 
                type="text" placeholder="Fachname (z.B. Mathematik)" required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                value={newSubject.name} onChange={e => setNewSubject({...newSubject, name: e.target.value})}
              />
              <input 
                type="text" placeholder="Kürzel (z.B. M)" maxLength={5}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                value={newSubject.abbreviation} onChange={e => setNewSubject({...newSubject, abbreviation: e.target.value})}
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowAddSubject(false)} className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300">Abbrechen</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20">Anlegen</button>
            </div>
          </form>
        </div>
      )}

      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleCreateCategory} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white">Neuer Bereich</h2>
            <div className="space-y-4">
              <input 
                type="text" placeholder="Bereichsname (z.B. Schularbeiten)" required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})}
              />
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Skala</label>
                <select 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                  value={newCategory.scale_type} onChange={e => setNewCategory({...newCategory, scale_type: e.target.value as ScaleType})}

                >
                  <option value="numeric_1_5">Noten 1-5</option>
                  <option value="gpa_4_0">4.0 Skala (4.0 = Sehr Gut)</option>
                  <option value="symbolic">Symbole (+ / ~ / -)</option>
                  <option value="numeric_0_100">0 - 100 Punkte</option>
                  <option value="percentage">0 - 100%</option>
                  <option value="letters_A_F">A - F</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={newCategory.is_self_directed}
                  onChange={(e) => setNewCategory({ ...newCategory, is_self_directed: e.target.checked })}
                />
                Selbstgesteuertes Lernen
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowAddCategory(false)} className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300">Abbrechen</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20">Anlegen</button>
            </div>
          </form>
        </div>
      )}

      {showEditCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleSaveCategoryEdit} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white">Bereich bearbeiten</h2>
            <div className="space-y-4">
              <input
                type="text"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                value={showEditCategoryModal.name}
                onChange={(e) => setShowEditCategoryModal({ ...showEditCategoryModal, name: e.target.value })}
              />
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Gewichtung (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                  value={showEditCategoryModal.weight_percentage}
                  onChange={(e) => setShowEditCategoryModal({ ...showEditCategoryModal, weight_percentage: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Skala</label>
                <select
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                  value={showEditCategoryModal.scale_type}
                  onChange={(e) => setShowEditCategoryModal({ ...showEditCategoryModal, scale_type: e.target.value })}
                >
                  <option value="numeric_1_5">Noten 1-5</option>
                  <option value="gpa_4_0">4.0 Skala (4.0 = Sehr Gut)</option>
                  <option value="symbolic">Symbole (+ / ~ / -)</option>
                  <option value="numeric_0_100">0 - 100 Punkte</option>
                  <option value="percentage">0 - 100%</option>
                  <option value="letters_A_F">A - F</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={showEditCategoryModal.is_self_directed}
                  onChange={(e) => setShowEditCategoryModal({ ...showEditCategoryModal, is_self_directed: e.target.checked })}
                />
                Selbstgesteuertes Lernen
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowEditCategoryModal(null)} className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300">Abbrechen</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20">Speichern</button>
            </div>
          </form>
        </div>
      )}

      {showAddAssessment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleAddAssessment} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white">Neue Bewertung hinzufügen</h2>
            <input 
              type="text" placeholder="Bezeichnung (z.B. 1. Schularbeit)" required autoFocus
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
              value={newAssessmentName} onChange={e => setNewAssessmentName(e.target.value)}
            />
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowAddAssessment(null)} className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300">Abbrechen</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20">Hinzufügen</button>
            </div>
          </form>
        </div>
      )}

      {showEditMetadataModal && (
        <EditAssessmentModal
          assessmentId={showEditMetadataModal.metadata?.id}
          categoryId={showEditMetadataModal.categoryId}
          oldName={showEditMetadataModal.oldName}
          initialName={showEditMetadataModal.metadata?.name || showEditMetadataModal.oldName}
          initialInfoText={showEditMetadataModal.metadata?.info_text || ""}
          initialDeadline={showEditMetadataModal.metadata?.deadline || null}
          onClose={() => setShowEditMetadataModal(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["matrix", selectedSubject?.id] });
          }}
        />
      )}

      {showWizard && selectedSubject && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900/95 border border-slate-700 p-6 rounded-3xl w-full max-w-4xl shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-white">🧙‍♂️ Let the Grading-Wizard help you</h2>
              <button onClick={() => setShowWizard(false)} className="px-3 py-1 rounded-lg text-xs bg-slate-800 text-slate-300">Schließen</button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Wählen Sie eine der 8 Vorlagen. Beim Anwenden werden Kategorien, Gewichtung und Skalen automatisch gesetzt.</p>
            <div className="grid md:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
              {GRADING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPresetId(preset.id)}
                  className={`text-left rounded-2xl border p-4 transition-all ${selectedPresetId === preset.id ? "border-indigo-500 bg-indigo-500/10" : "border-slate-800 bg-slate-950/50 hover:border-slate-700"}`}
                >
                  <div className="text-sm font-bold text-white">{preset.title}</div>
                  <div className="text-[11px] text-slate-400 mb-2">{preset.description}</div>
                  <div className="space-y-1">
                    {preset.categories.map((cat) => (
                      <div key={`${preset.id}-${cat.name}`} className="text-[10px] text-slate-300">✅ {cat.name} · {cat.weight}% · {cat.scale}</div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowWizard(false)} className="flex-1 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">Abbrechen</button>
              <button onClick={handleApplyPreset} disabled={isApplyingPreset} className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">
                {isApplyingPreset ? "Wird angewendet..." : "Preset anwenden 🪄"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rank Configuration Modal */}
      {showRankConfigModal && selectedSubject && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white">Rang-Konfiguration</h2>
            <p className="text-xs text-slate-400 mb-4">Passen Sie die Namen und Symbole der drei Rangstu fen für dieses Fach an.</p>

            <div className="space-y-4">
              {rankConfig.map((rank, idx) => (
                <div key={rank.level} className="space-y-2">
                  <label className="text-[10px] text-slate-500 font-bold uppercase block">
                    Stufe {rank.level} {idx === 0 ? '(Niedrigste)' : idx === 2 ? '(Höchste)' : '(Mittlere)'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Name"
                      value={rank.name}
                      onChange={(e) => {
                        const newConfig = [...rankConfig];
                        newConfig[idx].name = e.target.value;
                        setRankConfig(newConfig);
                      }}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Symbol"
                      value={rank.symbol}
                      maxLength={5}
                      onChange={(e) => {
                        const newConfig = [...rankConfig];
                        newConfig[idx].symbol = e.target.value;
                        setRankConfig(newConfig);
                      }}
                      className="w-20 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-center"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Regeln für Rangwechsel</h3>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 font-bold uppercase block">
                  Meister ab Durchschnitt ≤
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.1}
                  value={rankRules.meister_max_average}
                  onChange={(e) => setRankRules({
                    ...rankRules,
                    meister_max_average: Number(e.target.value)
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 font-bold uppercase block">
                  Geselle ab SDL-Bewertungen ≥
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={rankRules.geselle_min_sdl}
                  onChange={(e) => setRankRules({
                    ...rankRules,
                    geselle_min_sdl: Number(e.target.value)
                  })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm"
                />
              </div>
            </div>
 
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowRankConfigModal(false);
                  // Reset to defaults or reload
                  setRankConfig([
                    { level: 1, name: 'Lehrling', symbol: '🌱' },
                    { level: 2, name: 'Geselle', symbol: '🛠️' },
                    { level: 3, name: 'Meister', symbol: '👑' }
                  ]);
                  setRankRules({
                    meister_max_average: 1.5,
                    geselle_min_sdl: 3
                  });
                }}
                className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSaveRankConfig}
                className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
