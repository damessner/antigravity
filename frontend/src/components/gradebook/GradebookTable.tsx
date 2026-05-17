"use client";

import React from "react";
import { Plus, Settings2, Trash2, Eye, EyeOff, Pencil } from "lucide-react";
import { Category, Grade, Pupil, PupilTag, User, ColumnMetadata, RankPreviewEntry } from "@/types";
import { GradeCell } from "./GradeCell";
import { getPlaceholderForScale, toPercent } from "../gradeUtils";
import { ScaleType } from "../gradeUtils";

interface GradebookColumn {
  category: Category;
  assessmentName: string;
  isCatLastCol: boolean;
  metadata?: ColumnMetadata;
}

interface GradebookTableProps {
  pupils: Pupil[];
  categories: Category[];
  grades: Grade[];
  columns: GradebookColumn[];
  pupilTags?: PupilTag[];
  rankPreview?: RankPreviewEntry[];
  rankConfig?: { level: number; name: string; symbol: string }[];
  currentUser: User | null;
  isOwner: boolean;
  onGradeChange: (catId: number, pId: number, assName: string, val: string) => void;
  onCellContextMenu: (e: React.MouseEvent, catId: number, pId: number, assName: string) => void;
  onAddAssessment: (catId: number, suggestedName?: string) => void;
  onRenameColumn: (catId: number, oldName: string) => void;
  onEditMetadata: (catId: number, assName: string, metadata?: ColumnMetadata) => void;
  onDeleteCategory: (catId: number) => void;
  onScaleSwitch: (catId: number, newScale: ScaleType) => void;
  onToggleColumnVisibility: (catId: number, assName: string) => void;
  onToggleCategoryVisibility: (catId: number) => void;
  onEditCategory: (category: Category) => void;
  onToggleCellVisibility: (catId: number, pupilId: number, assName: string, isVisible: boolean) => void;
  onRankChange: (pupilId: number, tierTag: string | null) => void;
  showOwnerInsights?: boolean;
}

const toAustrianGrade = (score: number | null): number | null => {
  if (score === null || Number.isNaN(score)) return null;
  return 1 + (1 - score) * 4;
};

function GradebookTableBase({
  pupils,
  categories,
  grades,
  columns,
  pupilTags = [],
  rankPreview = [],
  rankConfig = [],
  currentUser,
  isOwner,
  onGradeChange,
  onCellContextMenu,
  onAddAssessment,
  onRenameColumn,
  onEditMetadata,
  onDeleteCategory,
  onScaleSwitch,
  onToggleColumnVisibility,
  onToggleCategoryVisibility,
  onEditCategory,
  onToggleCellVisibility,
  onRankChange,
  showOwnerInsights = true
}: GradebookTableProps) {
  const subjectId = categories.length > 0 ? categories[0].subject_id : null;

  const getRankBadge = (rankName: string | null | undefined): string | null => {
    if (!rankName) return null;
    const config = rankConfig.find(rc => rc.name === rankName);
    if (config) return config.symbol;
    
    // Fallbacks if not in config
    if (rankName === "Meister") return "👑";
    if (rankName === "Geselle") return "🛠️";
    if (rankName === "Lehrling") return "🌱";
    return null;
  };

  const columnsByCategory = React.useMemo(() => {
    const map = new Map<number, GradebookColumn[]>();
    columns.forEach((col) => {
      const key = Number(col.category.id);
      const list = map.get(key) || [];
      list.push(col);
      map.set(key, list);
    });
    return map;
  }, [columns]);

  const gradeByCellKey = React.useMemo(() => {
    const map = new Map<string, Grade>();
    grades.forEach((g) => {
      map.set(`${Number(g.category_id)}:${Number(g.pupil_id)}:${g.assessment_name}`, g);
    });
    return map;
  }, [grades]);

  /** Returns the current assigned rank for a pupil in this subject */
  const getPupilRank = (pupilId: number): string | null => {
    if (!subjectId) return null;
    const tag = pupilTags.find(
      (t) => Number(t.pupil_id) === Number(pupilId) && Number(t.subject_id) === Number(subjectId)
    );
    return tag?.tier_tag || null;
  };

  /** Returns the predicted rank entry for a pupil */
  const getPredictedRank = (pupilId: number): RankPreviewEntry | null =>
    rankPreview.find((r) => Number(r.pupil_id) === Number(pupilId)) || null;

  const sortedRankOptions = React.useMemo(
    () => [...rankConfig].sort((a, b) => Number(a.level) - Number(b.level)),
    [rankConfig]
  );

  const [templateCategoryId, setTemplateCategoryId] = React.useState<number | null>(
    categories[0]?.id ?? null
  );
  const [templateDateManual, setTemplateDateManual] = React.useState("");

  React.useEffect(() => {
    if (categories.length === 0) {
      setTemplateCategoryId(null);
      return;
    }
    if (templateCategoryId && categories.some((c) => Number(c.id) === Number(templateCategoryId))) return;
    setTemplateCategoryId(categories[0].id);
  }, [categories, templateCategoryId]);

  const assignmentTemplates = React.useMemo(
    () => [
      "Vokabeltest",
      "Portfolioabgabe",
      "Projektpräsentation",
      "Aktive Mitarbeit",
      "Heftführung",
      "Lesepass-Kontrolle",
      "Lernzielkontrolle",
      "Kurzquiz",
      "Praktische Übung",
      "Reflexionsbogen"
    ],
    []
  );

  const columnInsights = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneWeek = new Date(today);
    oneWeek.setDate(oneWeek.getDate() + 7);

    return columns.map((col) => {
      const key = `${Number(col.category.id)}:${col.assessmentName}`;
      const colGrades = grades.filter(
        (g) => `${Number(g.category_id)}:${g.assessment_name}` === key
      );
      const filled = colGrades.filter((g) => String(g.grade_value ?? "").trim() !== "").length;
      const isVisible = colGrades.length === 0 ? true : colGrades.every((g) => g.is_visible !== false);
      const deadline = col.metadata?.deadline ? new Date(col.metadata.deadline) : null;
      if (deadline) deadline.setHours(0, 0, 0, 0);

      const isOverdue = !!deadline && deadline < today && filled < pupils.length;
      const isDueSoon = !!deadline && deadline >= today && deadline <= oneWeek;

      return { filled, isVisible, isOverdue, isDueSoon };
    });
  }, [columns, grades, pupils.length]);

  const categoryInsights = React.useMemo(() => {
    return categories.map((cat) => {
      const catColumns = columns.filter((col) => Number(col.category.id) === Number(cat.id));
      const values = grades
        .filter((g) => Number(g.category_id) === Number(cat.id))
        .map((g) => toPercent(g.grade_value?.toString() ?? null, cat.scale_type))
        .filter((v): v is number => v !== null);
      const average = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
      return {
        id: cat.id,
        name: cat.name,
        average,
        assessmentCount: catColumns.length
      };
    });
  }, [categories, columns, grades]);

  const rowInsights = React.useMemo(() => {
    return pupils.map((pupil) => {
      const perColumnValues = columns
        .map((col) => {
          const grade = gradeByCellKey.get(`${Number(col.category.id)}:${Number(pupil.id)}:${col.assessmentName}`);
          return toPercent(grade?.grade_value?.toString() ?? null, col.category.scale_type);
        })
        .filter((v): v is number => v !== null);
      const average = perColumnValues.length
        ? perColumnValues.reduce((sum, v) => sum + v, 0) / perColumnValues.length
        : null;
      const trend = perColumnValues.length >= 4
        ? perColumnValues.slice(-3).reduce((a, b) => a + b, 0) / 3
          - perColumnValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3
        : 0;
      const completionRate = columns.length ? perColumnValues.length / columns.length : 0;
      return { pupilId: pupil.id, pupilName: pupil.name, average, trend, completionRate };
    });
  }, [pupils, columns, gradeByCellKey]);

  const matrixInsight = React.useMemo(() => {
    const averageScores = rowInsights
      .map((entry) => entry.average)
      .filter((v): v is number => v !== null);
    if (averageScores.length === 0) return null;

    const sorted = [...averageScores].sort((a, b) => a - b);
    const classAverage = averageScores.reduce((sum, v) => sum + v, 0) / averageScores.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const stddev = Math.sqrt(
      averageScores.reduce((sum, v) => sum + (v - classAverage) ** 2, 0) / averageScores.length
    );

    const bestPupil = [...rowInsights]
      .filter((p) => p.average !== null)
      .sort((a, b) => Number(b.average) - Number(a.average))[0];
    const needsAttention = [...rowInsights]
      .filter((p) => p.average !== null)
      .sort((a, b) => Number(a.average) - Number(b.average))[0];

    const completedCells = rowInsights.reduce(
      (sum, row) => sum + Math.round(row.completionRate * columns.length),
      0
    );
    const totalCells = columns.length * pupils.length;
    const completionPercent = totalCells > 0 ? (completedCells / totalCells) * 100 : 0;

    const numeric15Grades = grades
      .filter((g) => {
        const cat = categories.find((c) => Number(c.id) === Number(g.category_id));
        return cat?.scale_type === "numeric_1_5";
      })
      .map((g) => Number(g.grade_value))
      .filter((v) => Number.isFinite(v) && v >= 1 && v <= 5)
      .map((v) => Math.round(v));

    const gradeDistribution = [1, 2, 3, 4, 5].map((grade) => ({
      grade,
      count: numeric15Grades.filter((v) => v === grade).length
    }));

    const improvingPupils = rowInsights.filter((r) => r.trend >= 0.08).length;
    const decliningPupils = rowInsights.filter((r) => r.trend <= -0.08).length;
    const atRiskPupils = rowInsights.filter((r) => (r.average ?? 1) <= 0.45).length;

    const topCategory = [...categoryInsights]
      .filter((c) => c.average !== null)
      .sort((a, b) => Number(b.average) - Number(a.average))[0];
    const weakestCategory = [...categoryInsights]
      .filter((c) => c.average !== null)
      .sort((a, b) => Number(a.average) - Number(b.average))[0];

    const hiddenCategoryCount = categories.filter((c) => c.is_hidden_from_pupils).length;
    const hiddenColumnCount = columnInsights.filter((c) => !c.isVisible).length;
    const overdueAssignments = columnInsights.filter((c) => c.isOverdue).length;
    const dueSoonAssignments = columnInsights.filter((c) => c.isDueSoon).length;

    return {
      classAverage,
      median,
      stddev,
      bestPupil,
      needsAttention,
      completionPercent,
      completedCells,
      totalCells,
      hiddenCategoryCount,
      hiddenColumnCount,
      overdueAssignments,
      dueSoonAssignments,
      sdlCategories: categories.filter((c) => c.is_self_directed).length,
      atRiskPupils,
      improvingPupils,
      decliningPupils,
      gradeDistribution,
      topCategory,
      weakestCategory
    };
  }, [rowInsights, grades, categories, categoryInsights, columnInsights, columns.length, pupils.length]);

  if (categories.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl p-12 bg-slate-900/20">
        <div className="bg-slate-800/50 p-4 rounded-full mb-4">
          <Plus className="w-8 h-8 text-slate-600" />
        </div>
        <p className="text-sm font-medium">Noch keine Beurteilungsbereiche definiert.</p>
        <p className="text-[10px] mt-1 opacity-60">Klicken Sie auf "+ Bereich", um zu starten.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3">
      {showOwnerInsights && isOwner && matrixInsight && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Klassen-Ø</div>
              <div className="text-sm font-black text-white">Note {toAustrianGrade(matrixInsight.classAverage)?.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Median</div>
              <div className="text-sm font-black text-white">{toAustrianGrade(matrixInsight.median)?.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Streuung σ</div>
              <div className="text-sm font-black text-white">{matrixInsight.stddev.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400/80 font-bold">Top aktuell</div>
              <div className="text-xs font-bold text-emerald-300 truncate">{matrixInsight.bestPupil?.pupilName || "—"}</div>
            </div>
            <div className="rounded-xl border border-amber-700/40 bg-amber-900/10 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-amber-400/80 font-bold">Braucht Fokus</div>
              <div className="text-xs font-bold text-amber-300 truncate">{matrixInsight.needsAttention?.pupilName || "—"}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Abdeckung</div>
              <div className="text-sm font-black text-white">{matrixInsight.completionPercent.toFixed(0)}%</div>
              <div className="text-[9px] text-slate-500">{matrixInsight.completedCells}/{matrixInsight.totalCells}</div>
            </div>
            <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-rose-300/80 font-bold">Überfällig</div>
              <div className="text-sm font-black text-rose-300">{matrixInsight.overdueAssignments}</div>
            </div>
            <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-cyan-300/80 font-bold">Fällig (7 Tage)</div>
              <div className="text-sm font-black text-cyan-300">{matrixInsight.dueSoonAssignments}</div>
            </div>
            <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-indigo-300/80 font-bold">Ausgeblendete Spalten</div>
              <div className="text-sm font-black text-indigo-200">{matrixInsight.hiddenColumnCount}</div>
            </div>
            <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-indigo-300/80 font-bold">Ausgeblendete Bereiche</div>
              <div className="text-sm font-black text-indigo-200">{matrixInsight.hiddenCategoryCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-amber-300/80 font-bold">Risikogruppe</div>
              <div className="text-sm font-black text-amber-200">{matrixInsight.atRiskPupils}</div>
            </div>
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-emerald-300/80 font-bold">Aufwärtstrend</div>
              <div className="text-sm font-black text-emerald-200">{matrixInsight.improvingPupils}</div>
            </div>
            <div className="rounded-xl border border-orange-800/40 bg-orange-950/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-orange-300/80 font-bold">Abwärtstrend</div>
              <div className="text-sm font-black text-orange-200">{matrixInsight.decliningPupils}</div>
            </div>
            <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-violet-300/80 font-bold">SDL-Bereiche</div>
              <div className="text-sm font-black text-violet-200">{matrixInsight.sdlCategories}</div>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Beste/Schwächste Kategorie</div>
              <div className="text-[10px] text-slate-200 truncate">
                {matrixInsight.topCategory?.name || "—"} / {matrixInsight.weakestCategory?.name || "—"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Notenverteilung (1-5)</div>
              <div className="space-y-1">
                {matrixInsight.gradeDistribution.map((bucket) => {
                  const max = Math.max(...matrixInsight.gradeDistribution.map((b) => b.count), 1);
                  const width = (bucket.count / max) * 100;
                  return (
                    <div key={bucket.grade} className="flex items-center gap-2">
                      <span className="text-[10px] w-8 text-slate-400">Note {bucket.grade}</span>
                      <div className="flex-1 h-2 bg-slate-800 rounded">
                        <div className="h-2 bg-indigo-500/70 rounded" style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-[10px] w-5 text-right text-slate-300">{bucket.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Schnellvorlagen für Bewertungen</div>
              <div className="flex gap-2 items-center mb-2">
                <select
                  value={templateCategoryId ?? ""}
                  onChange={(e) => setTemplateCategoryId(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px]"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <label className="text-[10px] text-slate-400 flex items-center gap-2">
                  <span>[Datum manuell ergänzen]</span>
                  <input
                    type="date"
                    value={templateDateManual}
                    onChange={(e) => setTemplateDateManual(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-200"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {assignmentTemplates.map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => {
                      if (!templateCategoryId) return;
                      const sourceDate = templateDateManual ? new Date(templateDateManual) : new Date();
                      const dateLabel = sourceDate.toLocaleDateString("de-AT");
                      onAddAssessment(templateCategoryId, `${template} ${dateLabel}`);
                    }}
                    className="px-2 py-1 rounded bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 text-[10px] hover:bg-indigo-600/30 transition-colors"
                  >
                    + {template}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="overflow-auto rounded-2xl border border-slate-800/60 bg-slate-950/40 shadow-2xl custom-scrollbar">
      <table className="w-full border-collapse table-fixed select-none">
        <thead className="sticky top-0 z-40">
          {/* Layer 1: Categories */}
          <tr className="bg-slate-900/95 backdrop-blur-md">
            <th className="sticky left-0 z-50 w-48 min-w-[192px] p-0 bg-slate-900/95 border-b border-r-2 border-slate-800 text-left align-bottom">
              <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Schüler/in</div>
            </th>
            {categories.map((cat) => {
              const catCols = columnsByCategory.get(Number(cat.id)) || [];
              const isHidden = !!cat.is_hidden_from_pupils;
              return (
                <th
                  key={cat.id}
                  colSpan={catCols.length || 1}
                  className={`px-2 py-2 border-b border-r-2 border-slate-800 text-left relative group ${isHidden ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => isOwner && onEditCategory(cat)}
                      className="text-[10px] font-black uppercase tracking-wider text-indigo-400 truncate pr-8 text-left hover:text-indigo-300 transition-colors min-h-[44px] min-w-[44px] flex items-center"
                      title={isOwner ? "Bereich bearbeiten" : cat.name}
                    >
                      {isHidden && <EyeOff className="w-3 h-3 mr-1 text-slate-500 shrink-0" />}
                      {cat.name} ({cat.weight_percentage}%){cat.is_self_directed ? " • SDL" : ""}
                    </button>

                    {isOwner && (
                      <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity bg-slate-900/90 rounded-md p-0.5 backdrop-blur-sm">
                        {/* 👁️ Visibility Toggle */}
                        <button
                          onClick={() => onToggleCategoryVisibility(cat.id)}
                          className={`p-2.5 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${isHidden ? "text-amber-400 hover:text-amber-300" : "text-slate-400 hover:text-amber-400"}`}
                          title={isHidden ? "Für Schüler einblenden" : "Für Schüler ausblenden"}
                        >
                          {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        {/* ✏️ Edit Pen */}
                        <button
                          onClick={() => onEditCategory(cat)}
                          className="p-2.5 text-slate-400 hover:text-cyan-400 rounded hover:bg-slate-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Bereich bearbeiten"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {/* ➕ Plus */}
                        <button
                          onClick={() => onAddAssessment(cat.id)}
                          className="p-2.5 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Neue Bewertung hinzufügen"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteCategory(cat.id)}
                          className="p-2.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-700 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Bereich löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>

          {/* Layer 2: Assessments */}
          <tr className="bg-slate-900/80 backdrop-blur-md text-[9px]">
            <th className="sticky left-0 z-50 bg-slate-900/80 border-b border-r-2 border-slate-800" />
            {columns.map((col, idx) => {
              const columnGrades = grades.filter(
                (g) => Number(g.category_id) === Number(col.category.id) && g.assessment_name === col.assessmentName
              );
              const isColumnVisible = columnGrades.length === 0
                ? true
                : columnGrades.every((g) => g.is_visible !== false);
              return (
              <th
                key={`${col.category.id}-${col.assessmentName}-${idx}`}
                className={`p-0 h-10 align-middle font-mono font-bold text-slate-400 border-b border-slate-800 ${col.isCatLastCol ? "border-r-2 border-slate-700/80" : "border-r border-slate-800/40"}`}
              >
                <div className="w-full h-full flex flex-col items-center justify-center relative group/col px-1">
                  <span
                    className="truncate max-w-full cursor-help"
                    title={col.metadata?.info_text || col.assessmentName}
                    onDoubleClick={() => isOwner && onRenameColumn(col.category.id, col.assessmentName)}
                  >
                    {col.assessmentName}
                  </span>

                  {isOwner && (
                    <div className="absolute inset-0 opacity-0 group-hover/col:opacity-100 bg-slate-900/90 flex items-center justify-center gap-1.5 transition-opacity">
                      <button
                        onClick={() => onEditMetadata(col.category.id, col.assessmentName, col.metadata)}
                        className="p-2 text-slate-400 hover:text-cyan-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Metadaten & Info bearbeiten"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onToggleColumnVisibility(col.category.id, col.assessmentName)}
                        className="p-2 text-slate-400 hover:text-amber-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title={isColumnVisible ? "Spalte für Schüler ausblenden" : "Spalte für Schüler einblenden"}
                      >
                        {isColumnVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {pupils.map((p, pIdx) => {
            const currentRank = getPupilRank(p.id);
            const predicted = getPredictedRank(p.id);
            const badge = getRankBadge(currentRank);
            const predictedBadge = getRankBadge(predicted?.predicted_rank);
            const avgDisplay = predicted?.grade_average !== null && predicted?.grade_average !== undefined
              ? predicted.grade_average.toFixed(2)
              : null;

            return (
              <tr
                key={p.id}
                className={`group/row transition-colors ${pIdx % 2 === 0 ? "bg-transparent" : "bg-slate-900/10"} hover:bg-indigo-500/5`}
              >
                <td className="sticky left-0 z-30 px-3 py-2 h-11 bg-slate-950/80 border-r-2 border-slate-800 text-[11px] font-bold text-slate-300 group-hover/row:text-white backdrop-blur-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[9px] text-slate-600 font-mono w-4 shrink-0">{pIdx + 1}</span>
                    {/* Rank insignia badge */}
                    {badge && (
                      <span
                        title={`Rang: ${currentRank}${predicted && predicted.predicted_rank !== currentRank ? ` → Voraussage: ${predicted.predicted_rank}` : ""}`}
                        className="shrink-0 text-sm leading-none"
                      >
                        {badge}
                      </span>
                    )}
                    <span className="truncate">{p.name}</span>
                    {isOwner && (
                      <select
                        value={currentRank || "none"}
                        onChange={(e) => onRankChange(p.id, e.target.value === "none" ? null : e.target.value)}
                        className="shrink-0 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[9px] text-slate-200"
                        title="Rang setzen"
                      >
                        <option value="none">Kein Rang</option>
                        {sortedRankOptions.map((rank) => (
                          <option key={rank.level} value={rank.name}>
                            {rank.symbol} {rank.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {/* Grade average chip */}
                    {isOwner && avgDisplay && (
                      <span className="shrink-0 text-[9px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-1 rounded">
                        Ø{avgDisplay}
                      </span>
                    )}
                    {/* Predicted rank indicator (teacher only) */}
                    {isOwner && predictedBadge && predicted?.predicted_rank !== currentRank && (
                      <span
                        title={`Voraussage: ${predicted?.predicted_rank}`}
                        className="shrink-0 text-[10px] opacity-50"
                      >
                        →{predictedBadge}
                      </span>
                    )}
                  </div>
                </td>
                {columns.map((col, cIdx) => {
                  const gradeObj = gradeByCellKey.get(`${Number(col.category.id)}:${Number(p.id)}:${col.assessmentName}`);

                  return (
                    <GradeCell
                      key={`${p.id}-${col.category.id}-${col.assessmentName}-${cIdx}`}
                      categoryId={col.category.id}
                      pupilId={p.id}
                      assessmentName={col.assessmentName}
                      valueStr={gradeObj?.grade_value?.toString() || ""}
                      isVisible={gradeObj?.is_visible !== false}
                      disabled={!isOwner}
                      placeholderGuide={getPlaceholderForScale(col.category.scale_type)}
                      isCatLastCol={col.isCatLastCol}
                      onChange={onGradeChange}
                      onContextMenu={onCellContextMenu}
                      onToggleVisibility={onToggleCellVisibility}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export const GradebookTable = React.memo(GradebookTableBase);
