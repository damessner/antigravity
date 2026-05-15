"use client";

import React from "react";
import { Plus, Edit3, Settings2, Trash2 } from "lucide-react";
import { Category, Grade, Pupil, User, ColumnMetadata } from "@/types";
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
  onEditCategory: (category: Category) => void;
  onToggleCellVisibility: (catId: number, pupilId: number, assName: string, isVisible: boolean) => void;
}

function GradebookTableBase({
  pupils,
  categories,
  grades,
  columns,
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
  onEditCategory,
  onToggleCellVisibility
}: GradebookTableProps) {
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
              return (
                <th 
                  key={cat.id} 
                  colSpan={catCols.length} 
                  className="px-2 py-2 border-b border-r-2 border-slate-800 text-left relative group"
                >
                  <div className="flex items-center justify-between gap-2 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => isOwner && onEditCategory(cat)}
                      className="text-[10px] font-black uppercase tracking-wider text-indigo-400 truncate pr-8 text-left hover:text-indigo-300 transition-colors"
                      title={isOwner ? "Bereich bearbeiten" : cat.name}
                    >
                      {cat.name} ({cat.weight_percentage}%){cat.is_self_directed ? " • SDL" : ""}
                    </button>
                    
                    {isOwner && (
                      <div className="absolute right-1 top-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity bg-slate-900/80 rounded-md p-0.5 backdrop-blur-sm">
                        <button
                          onClick={() => onAddAssessment(cat.id)}
                          className="p-2 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors"
                          title="Neue Spalte (Bewertung) hinzufügen"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteCategory(cat.id)}
                          className="p-2 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-700 transition-colors"
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
                        className="p-2 text-slate-400 hover:text-cyan-400"
                        title="Metadaten & Info bearbeiten"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => onToggleColumnVisibility(col.category.id, col.assessmentName)}
                        className="p-2 text-slate-400 hover:text-amber-400"
                        title="Sichtbarkeit für Schüler umschalten"
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
          {pupils.map((p, pIdx) => (
            <tr 
              key={p.id} 
              className={`group/row transition-colors ${pIdx % 2 === 0 ? "bg-transparent" : "bg-slate-900/10"} hover:bg-indigo-500/5`}
            >
              <td className="sticky left-0 z-30 px-4 py-2 h-11 bg-slate-950/80 border-r-2 border-slate-800 text-[11px] font-bold text-slate-300 group-hover/row:text-white backdrop-blur-sm">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[9px] text-slate-600 font-mono w-4">{pIdx + 1}</span>
                  {p.name}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const GradebookTable = React.memo(GradebookTableBase);
