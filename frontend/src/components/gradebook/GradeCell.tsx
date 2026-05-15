"use client";

import React from "react";
import { Eye, EyeOff } from "lucide-react";

interface GradeCellProps {
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
  onToggleVisibility: (catId: number, pId: number, assName: string, isVisible: boolean) => void;
}

export const GradeCell = React.memo(function GradeCell({
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
  onContextMenu,
  onToggleVisibility
}: GradeCellProps) {
  return (
    <td className={`p-0 w-12 min-w-[44px] max-w-[52px] h-11 align-middle ${isCatLastCol ? "border-r-2 border-slate-700/80" : "border-r border-slate-800/40"}`}>
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
          className="w-full h-full bg-transparent hover:bg-slate-900/50 focus:bg-slate-900 text-center font-mono text-sm font-bold text-white focus:outline-none transition-colors p-0 rounded-none border-none disabled:opacity-50 disabled:cursor-not-allowed selection:bg-cyan-500/30 touch-manipulation"
        />
        {!disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(categoryId, pupilId, assessmentName, !isVisible);
            }}
            className="absolute left-0.5 top-0.5 p-0.5 rounded bg-slate-950/80 text-slate-400 hover:text-white transition-colors"
            title={isVisible ? "Für Schüler ausblenden" : "Für Schüler einblenden"}
          >
            {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
        )}
        {!isVisible && (
          <span className="absolute right-0.5 top-0.5 pointer-events-none text-[8px] text-rose-500 select-none font-bold" title="Für Schüler ausgeblendet">
            ∅
          </span>
        )}
      </div>
    </td>
  );
});
