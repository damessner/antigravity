"use client";

import React from "react";
import { Plus, Edit3, Settings2, Trash2, Eye, EyeOff, Pencil } from "lucide-react";
import { Category, Grade, Pupil, PupilTag, User, ColumnMetadata, RankPreviewEntry } from "@/types";
import { GradeCell } from "./GradeCell";
import { getPlaceholderForScale } from "../gradeUtils";
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
  onAddAssessment: (catId: number) => void;
  onRenameColumn: (catId: number, oldName: string) => void;
  onEditMetadata: (catId: number, assName: string, metadata?: ColumnMetadata) => void;
  onDeleteCategory: (catId: number) => void;
  onScaleSwitch: (catId: number, newScale: ScaleType) => void;
  onToggleColumnVisibility: (catId: number, assName: string) => void;
  onToggleCategoryVisibility: (catId: number) => void;
  onEditCategory: (category: Category) => void;
  onToggleCellVisibility: (catId: number, pupilId: number, assName: string, isVisible: boolean) => void;
}

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
  onToggleCellVisibility
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
    <div className="flex-1 overflow-auto rounded-2xl border border-slate-800/60 bg-slate-950/40 shadow-2xl custom-scrollbar">
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
            {columns.map((col, idx) => (
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
                        title="Spaltensichtbarkeit für Schüler umschalten"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </th>
            ))}
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
  );
}

export const GradebookTable = React.memo(GradebookTableBase);
