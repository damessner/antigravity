"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pupil, SchoolClass, Subject, Category, Grade, User, ColumnMetadata, PupilTag, RankPreviewEntry } from "@/types";
import { getApiUrl } from "@/utils/apiDiscovery";
import { fetchAuth } from "@/utils/fetchAuth";
import { ScaleType } from "./gradeUtils";
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

export default function Gradebook({ classes, pupils, socket }: GradebookProps) {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isWeightingOpen, setIsWeightingOpen] = useState(false);
  const [gradebookView, setGradebookView] = useState<"matrix" | "participation">("matrix");

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

  const handleOpenAddAssessment = useCallback((catId: number) => {
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

      {/* Tab Switcher for Matrix / Mitarbeit */}
      <div className="flex gap-2 mb-4 pb-4 border-b border-slate-800/40">
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
        />
      )}

      {gradebookView === "participation" && selectedSubject && (
        <div className="flex-1 overflow-y-auto">
          <ParticipationTracker
            subjects={subjects}
            pupils={classPupils}
            classId={selectedClassId}
          />
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
