"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Pupil, SchoolClass, Subject, Category, Grade, User, ColumnMetadata } from "@/types";
import { getApiUrl } from "@/utils/apiDiscovery";
import { fetchAuth } from "@/utils/fetchAuth";
import { ScaleType } from "./gradeUtils";
import { useWeightBalancer } from "./useWeightBalancer";

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

export default function Gradebook({ classes, pupils, socket }: GradebookProps) {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<number>(0);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isWeightingOpen, setIsWeightingOpen] = useState(false);

  // Data Queries
  const { subjects, isLoadingSubjects, refetchSubjects } = useGradebookData(selectedClassId);
  const matrixQuery = useGradebookMatrix(selectedSubject?.id || null);
  const { categories = [], grades = [], pupil_tags = [] } = matrixQuery.data || {};
  
  // Mutations
  const mutations = useGradebookMutations(selectedSubject?.id || null);

  // UI state for modals
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
  const [editingCol, setEditingCol] = useState<{ categoryId: number; oldName: string; newName: string } | null>(null);
  const [showEditMetadataModal, setShowEditMetadataModal] = useState<EditMetadataState | null>(null);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState<Category | null>(null);
  const [showEditAssessmentModal, setShowEditAssessmentModal] = useState<{ categoryId: number; oldName: string; metadata?: ColumnMetadata } | null>(null);
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
      setSelectedSubject(null);
      return;
    }
    const currentIsStillValid = selectedSubject && subjects.some((s) => Number(s.id) === Number(selectedSubject.id));
    if (currentIsStillValid) return;
    const savedSubjId = localStorage.getItem(`saved_subject_${selectedClassId}`);
    const targetSubj = subjects.find((s) => Number(s.id) === Number(savedSubjId)) || subjects[0];
    setSelectedSubject(targetSubj);
  }, [subjects, selectedClassId, selectedSubject]);

  useEffect(() => {
    if (!selectedSubject) return;
    localStorage.setItem(`saved_subject_${selectedClassId}`, String(selectedSubject.id));
  }, [selectedClassId, selectedSubject]);

  const isOwner = useMemo(() => {
    if (!currentUser || !selectedSubject) return false;
    if (currentUser.role === "admin") return true;
    return Number(selectedSubject.teacher_id) === Number(currentUser.id) || 
           Number(selectedSubject.second_teacher_id) === Number(currentUser.id);
  }, [currentUser, selectedSubject]);

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
  
  const handleTagChange = useCallback((pupilId: number, tier: string | null) => {
    if (!isOwner) return;
    mutations.updateTag.mutate({ pupil_id: pupilId, tier_tag: tier });
  }, [isOwner, mutations.updateTag]);

  const handleOpenAddAssessment = useCallback((catId: number) => {
    setShowAddAssessment({ categoryId: catId });
  }, []);

  const handleOpenRenameColumn = useCallback((catId: number, oldName: string) => {
    setEditingCol({ categoryId: catId, oldName, newName: oldName });
  }, []);

  const handleOpenEditMetadata = useCallback((catId: number, assName: string, metadata?: ColumnMetadata) => {
    setShowEditMetadataModal({ categoryId: catId, oldName: assName, metadata });
  }, []);

  const handleEditCategory = useCallback((cat: Category) => {
    setShowEditCategoryModal(cat);
  }, []);

  const handleEditAssessment = useCallback((catId: number, assName: string, metadata?: ColumnMetadata) => {
    setShowEditAssessmentModal({ categoryId: catId, oldName: assName, metadata });
  }, []);

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

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditCategoryModal) return;
    mutations.updateCategory.mutate(showEditCategoryModal, {
      onSuccess: () => setShowEditCategoryModal(null)
    });
  };

  const handleUpdateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditAssessmentModal) return;
    
    const { categoryId, oldName, metadata } = showEditAssessmentModal;
    const name = metadata?.name || oldName;
    const info_text = metadata?.info_text || null;
    const deadline = metadata?.deadline || null;

    mutations.updateAssessment.mutate({
      category_id: categoryId,
      old_name: oldName,
      name,
      info_text,
      deadline
    }, {
      onSuccess: () => setShowEditAssessmentModal(null)
    });
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
        onImport={() => {}} 
        isLoading={matrixQuery.isLoading}
        refetch={refetchMatrix}
        isOwner={isOwner}
      />

      {isWeightingOpen && (
        <WeightingOverlay
          categories={balancedCategories}
          onWeightChange={handleWeightChange}
          onToggleLock={toggleLock}
          onClose={() => setIsWeightingOpen(false)}
        />
      )}

      <GradebookTable
        pupils={classPupils}
        categories={balancedCategories}
        grades={grades}
        pupilTags={pupil_tags}
        columns={allColumns}
        currentUser={currentUser}
        isOwner={isOwner}
        onGradeChange={handleGradeChange}
        onCellContextMenu={handleCellContextMenu}
        onTagChange={handleTagChange}
        onEditCategory={handleEditCategory}
        onEditAssessment={handleEditAssessment}
        onAddAssessment={handleOpenAddAssessment}
        onRenameColumn={handleOpenRenameColumn}
        onEditMetadata={handleOpenEditMetadata}
        onDeleteCategory={handleDeleteCategory}
        onScaleSwitch={handleScaleSwitch}
        onToggleColumnVisibility={handleToggleColumnVisibility}
      />

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
                  value={newCategory.scale_type} onChange={e => setNewCategory({...newCategory, scale_type: e.target.value})}
                >
                  <option value="numeric_1_5">Noten 1-5</option>
                  <option value="numeric_0_100">0 - 100 Punkte</option>
                  <option value="percentage">Prozent (0-100%)</option>
                  <option value="letters_A_F">A - F (US Style)</option>
                  <option value="symbols">Symbole (+ / ~ / -)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowAddCategory(false)} className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300">Abbrechen</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20">Anlegen</button>
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
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
              value={newAssessmentName} onChange={e => setNewAssessmentName(e.target.value)}
            />
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowAddAssessment(null)} className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300">Abbrechen</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20">Hinzufügen</button>
            </div>
          </form>
        </div>
      )}

      {showEditCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleUpdateCategory} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white">Bereich bearbeiten</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Name</label>
                <input 
                  type="text" required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                  value={showEditCategoryModal.name} 
                  onChange={e => setShowEditCategoryModal({...showEditCategoryModal, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Gewichtung (%)</label>
                  <input 
                    type="number" min="0" max="100" required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                    value={showEditCategoryModal.weight_percentage} 
                    onChange={e => setShowEditCategoryModal({...showEditCategoryModal, weight_percentage: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Skala</label>
                  <select 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                    value={showEditCategoryModal.scale_type} 
                    onChange={e => setShowEditCategoryModal({...showEditCategoryModal, scale_type: e.target.value})}
                  >
                    <option value="numeric_1_5">Noten 1-5</option>
                    <option value="numeric_0_100">0 - 100 Punkte</option>
                    <option value="percentage">Prozent (0-100%)</option>
                    <option value="letters_A_F">A - F (US Style)</option>
                    <option value="symbols">Symbole (+ / ~ / -)</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-900 transition-colors">
                <input 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                  checked={showEditCategoryModal.is_self_directed} 
                  onChange={e => setShowEditCategoryModal({...showEditCategoryModal, is_self_directed: e.target.checked})}
                />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">Selbstgesteuertes Lernen</span>
                  <span className="text-[10px] text-slate-500">Aktiviert Deadlines und Lernplaner-Funktionen</span>
                </div>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowEditCategoryModal(null)} className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300">Abbrechen</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20">Speichern</button>
            </div>
          </form>
        </div>
      )}

      {showEditAssessmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleUpdateAssessment} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white">Bewertung bearbeiten</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Bezeichnung</label>
                <input 
                  type="text" required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                  value={showEditAssessmentModal.metadata?.name || showEditAssessmentModal.oldName} 
                  onChange={e => setShowEditAssessmentModal({
                    ...showEditAssessmentModal, 
                    metadata: { ...(showEditAssessmentModal.metadata || { name: showEditAssessmentModal.oldName }), name: e.target.value }
                  })}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Zusatzinformationen / Aufgabenstellung</label>
                <textarea 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white h-24 resize-none"
                  placeholder="Details zur Bewertung oder Aufgabe..."
                  value={showEditAssessmentModal.metadata?.info_text || ""} 
                  onChange={e => setShowEditAssessmentModal({
                    ...showEditAssessmentModal, 
                    metadata: { ...(showEditAssessmentModal.metadata || { name: showEditAssessmentModal.oldName }), info_text: e.target.value }
                  })}
                />
              </div>
              
              {balancedCategories.find(c => Number(c.id) === showEditAssessmentModal.categoryId)?.is_self_directed && (
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 text-amber-500">Abgabetermin (Deadline)</label>
                  <input 
                    type="date"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white"
                    value={showEditAssessmentModal.metadata?.deadline ? new Date(showEditAssessmentModal.metadata.deadline).toISOString().split('T')[0] : ""} 
                    onChange={e => setShowEditAssessmentModal({
                      ...showEditAssessmentModal, 
                      metadata: { ...(showEditAssessmentModal.metadata || { name: showEditAssessmentModal.oldName }), deadline: e.target.value }
                    })}
                  />
                  <p className="text-[9px] text-slate-500 mt-1 italic">Hinweis: Die Uhrzeit wird standardmäßig auf 23:59 Uhr gesetzt.</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowEditAssessmentModal(null)} className="flex-1 px-4 py-2 bg-slate-800 rounded-xl text-xs font-bold text-slate-300">Abbrechen</button>
              <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold text-white shadow-lg shadow-indigo-600/20">Speichern</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
