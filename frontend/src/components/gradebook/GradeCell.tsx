"use client";
import React from "react";
import { EyeOff, Eye } from "lucide-react";

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
  onContextMenu
}: GradeCellProps) {
  const toggleVisibility = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, categoryId, pupilId, assessmentName);
  };

  return (
    <td className={`p-0 w-12 min-w-[44px] max-w-[52px] h-11 align-middle group/cell ${isCatLastCol ? "border-r-2 border-slate-700/80" : "border-r border-slate-800/40"}`}>
      <div 
        className={`w-full h-full flex items-center justify-center relative ${!isVisible ? "bg-slate-950/80" : ""}`}
        title="Klicken Sie auf das Auge, um die Sichtbarkeit für diesen Schüler zu steuern"
      >
        <input
          type="text"
          maxLength={maxLength}
          value={valueStr}
          disabled={disabled}
          onChange={(e) => onChange(categoryId, pupilId, assessmentName, e.target.value)}
          placeholder={placeholderGuide}
          className={`w-full h-full bg-transparent hover:bg-slate-900/50 focus:bg-slate-900 text-center font-mono text-sm font-bold text-white focus:outline-none transition-colors p-0 rounded-none border-none disabled:opacity-50 disabled:cursor-not-allowed selection:bg-cyan-500/30 touch-manipulation ${!isVisible ? "opacity-30" : ""}`}
        />
        
        {!disabled && (
          <button
            onClick={toggleVisibility}
            className={`absolute right-0.5 top-0.5 p-0.5 rounded-full transition-opacity bg-slate-900/80 backdrop-blur-sm ${isVisible ? "opacity-0 group-hover/cell:opacity-100 text-slate-500 hover:text-white" : "opacity-100 text-rose-500"}`}
            title={isVisible ? "Für diesen Schüler ausblenden" : "Für diesen Schüler einblenden"}
          >
            {isVisible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
          </button>
        )}
      </div>
    </td>
  );
});
