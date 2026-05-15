"use client";

import React from "react";
import { ChevronDown, Plus, Edit3, Settings2, Trash2, Award, Calendar, Info, Zap } from "lucide-react";
import { Category, Grade, Pupil, User, ColumnMetadata, PupilTag } from "@/types";
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
  pupilTags: PupilTag[];
  columns: GradebookColumn[];
  currentUser: User | null;
  isOwner: boolean;
  onGradeChange: (catId: number, pId: number, assName: string, val: string) => void;
  onCellContextMenu: (e: React.MouseEvent, catId: number, pId: number, assName: string) => void;
  onTagChange: (pupilId: number, tier: string | null) => void;
  onEditCategory: (cat: Category) => void;
  onEditAssessment: (catId: number, assName: string, metadata?: ColumnMetadata) => void;
  onAddAssessment: (catId: number) => void;
  onRenameColumn: (catId: number, oldName: string) => void;
  onEditMetadata: (catId: number, assName: string, metadata?: ColumnMetadata) => void;
  onDeleteCategory: (catId: number) => void;
  onScaleSwitch: (catId: number, newScale: ScaleType) => void;
  onToggleColumnVisibility: (catId: number, assName: string) => void;
}

function GradebookTableBase({
  pupils,
  categories,
  grades,
  pupilTags,
  columns,
  currentUser,
  isOwner,
  onGradeChange,
  onCellContextMenu,
  onTagChange,
  onEditCategory,
  onEditAssessment,
  onAddAssessment,
  onRenameColumn,
  onEditMetadata,
  onDeleteCategory,
  onScaleSwitch,
  onToggleColumnVisibility
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
                    <span 
                      className="text-[10px] font-black uppercase tracking-wider text-indigo-400 truncate pr-8 cursor-pointer hover:text-indigo-300"
                      onClick={() => isOwner && onEditCategory(cat)}
                    >
                      {cat.name} ({cat.weight_percentage}%)
                      {cat.is_self_directed && (
                        <Zap className="inline-block w-3 h-3 ml-1 text-amber-400" title="Selbstgesteuertes Lernen" />
                      )}
                    </span>
                    
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
                  <div 
                    className="w-full h-full flex flex-col items-center justify-center relative group/col px-1 cursor-pointer hover:bg-slate-800/30 transition-colors"
                    onClick={() => isOwner && onEditAssessment(col.category.id, col.assessmentName, col.metadata)}
                  >
                    <div className="flex items-center gap-1 max-w-full">
                      <span 
                        className="truncate font-mono font-bold text-slate-400"
                        title={col.metadata?.info_text || col.assessmentName}
                      >
                        {col.assessmentName}
                      </span>
                      {col.metadata?.info_text && <Info className="w-2.5 h-2.5 text-cyan-500/60" />}
                      {col.metadata?.deadline && <Calendar className="w-2.5 h-2.5 text-rose-500/60" />}
                    </div>
                    
                    {col.metadata?.deadline && (
                      <span className="text-[7px] text-slate-600 mt-0.5 font-mono">
                        {new Date(col.metadata.deadline).toLocaleDateString("de-AT", { day: "2.digit", month: "2.digit" })}
                      </span>
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
                <div className="flex items-center justify-between gap-2 overflow-visible">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-[9px] text-slate-600 font-mono w-4">{pIdx + 1}</span>
                    {p.name}
                  </div>
                  
                  {/* Mastery Tag */}
                  <div className="relative group/tag shrink-0">
                    {(() => {
                      const tag = pupilTags.find(t => t.pupil_id === p.id);
                      const tier = tag?.tier_tag || null;
                      
                      const colors: Record<string, string> = {
                        "Meister": "bg-amber-400/20 text-amber-400 border-amber-400/30",
                        "Geselle": "bg-slate-300/20 text-slate-300 border-slate-300/30",
                        "Lehrling": "bg-orange-500/20 text-orange-400 border-orange-500/30",
                        "Anwärter": "bg-indigo-400/20 text-indigo-400 border-indigo-400/30"
                      };
                      
                      return (
                        <div className="flex items-center gap-1">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-tighter border ${tier ? colors[tier] || "bg-slate-800 text-slate-500 border-slate-700" : "bg-transparent text-slate-700 border-transparent group-hover/tag:border-slate-800 group-hover/tag:text-slate-500"}`}>
                            {tier || "Kein Rang"}
                          </span>
                          
                          {isOwner && (
                            <select
                              value={tier || "none"}
                              onChange={(e) => onTagChange(p.id, e.target.value === "none" ? null : e.target.value)}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full"
                            >
                              <option value="none">Kein Rang</option>
                              <option value="Meister">Meister</option>
                              <option value="Geselle">Geselle</option>
                              <option value="Lehrling">Lehrling</option>
                              <option value="Anwärter">Anwärter</option>
                            </select>
                          )}
                        </div>
                      );
                    })()}
                  </div>
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
