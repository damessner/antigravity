"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Pencil, Save, X, AlertTriangle } from "lucide-react";
import { getApiUrl } from "@/utils/apiDiscovery";

interface ImportantInfo {
  content: string;
  updated_at: string | null;
  updated_by_name: string | null;
}

interface HistoryEntry {
  id: number;
  content: string;
  changed_at: string;
  changed_by_name: string | null;
}

interface ImportantInfoSectionProps {
  pupilId: number;
  pupilName: string;
  currentUserRole: string;
}

export function ImportantInfoSection({ pupilId, pupilName, currentUserRole }: ImportantInfoSectionProps) {
  const [info, setInfo] = useState<ImportantInfo>({ content: "", updated_at: null, updated_by_name: null });
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showConflictWarning, setShowConflictWarning] = useState(false);

  useEffect(() => {
    const loadInfo = async () => {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = getApiUrl();
        const res = await fetch(`${apiUrl}/api/notes/important-info/${pupilId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setInfo(data);
        }
      } catch {
        // silently ignore
      }
    };
    loadInfo();
  }, [pupilId]);

  const handleEdit = () => {
    setEditValue(info.content);
    setShowConflictWarning(false);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setShowConflictWarning(false);
  };

  const handleSave = async (force = false) => {
    if (!force && info.content && info.updated_by_name) {
      // Show safeguard warning before overwriting existing content from another teacher
      setShowConflictWarning(true);
      return;
    }
    await doSave();
  };

  const doSave = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/notes/important-info/${pupilId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: editValue }),
      });
      if (res.ok) {
        const data = await res.json();
        setInfo(data);
        setIsEditing(false);
        setShowConflictWarning(false);
      }
    } catch {
      // silently ignore
    } finally {
      setIsSaving(false);
    }
  };

  const loadHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/notes/important-info/${pupilId}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch {
      // silently ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreHistory = (entry: HistoryEntry) => {
    setEditValue(entry.content);
    setShowHistory(false);
    setIsEditing(true);
  };

  if (currentUserRole === "pupil") return null;

  const hasContent = info.content && info.content.trim().length > 0;

  return (
    <div className={`rounded-2xl border p-4 mb-4 ${hasContent ? "border-amber-500/40 bg-amber-900/10" : "border-slate-800 bg-slate-900/30"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-4 h-4 ${hasContent ? "text-amber-400" : "text-slate-600"}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${hasContent ? "text-amber-400" : "text-slate-500"}`}>
            Wichtige Info — {pupilName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={handleEdit}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
              title="Bearbeiten"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={loadHistory}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors text-[10px] font-semibold"
            title="Verlauf anzeigen"
          >
            Verlauf {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {!isEditing ? (
        <div
          onClick={handleEdit}
          className={`text-sm leading-relaxed cursor-pointer rounded-xl p-3 min-h-[40px] transition-colors ${
            hasContent
              ? "text-amber-100 hover:bg-amber-900/20 whitespace-pre-wrap"
              : "text-slate-600 italic hover:bg-slate-900/60"
          }`}
        >
          {hasContent ? info.content : "Noch keine wichtigen Informationen eingetragen. Klicken zum Hinzufügen..."}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            autoFocus
            className="w-full bg-slate-950 border border-amber-500/40 rounded-xl p-3 text-sm text-white resize-y min-h-[80px] focus:outline-none focus:border-amber-400 leading-relaxed"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="Wichtige allgemeine Informationen zu diesem Schüler / dieser Schülerin..."
          />

          {showConflictWarning && (
            <div className="rounded-xl border border-amber-500/50 bg-amber-900/20 p-3 text-xs text-amber-200">
              <div className="font-bold mb-1">⚠️ Safeguard: Inhalt wird überschrieben</div>
              <div className="text-amber-300/80 mb-2">
                Diese Info wurde zuletzt von <strong>{info.updated_by_name}</strong> bearbeitet. Das Überschreiben wird im Verlauf protokolliert.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={doSave}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold"
                >
                  Trotzdem speichern
                </button>
                <button
                  type="button"
                  onClick={() => setShowConflictWarning(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[10px] font-bold"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          {!showConflictWarning && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold disabled:opacity-50"
              >
                <Save className="w-3 h-3" />
                {isSaving ? "Speichert..." : "Speichern"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                <X className="w-3 h-3" />
                Abbrechen
              </button>
            </div>
          )}
        </div>
      )}

      {info.updated_by_name && info.updated_at && !isEditing && (
        <div className="mt-2 text-[10px] text-slate-600">
          Zuletzt geändert von <span className="text-slate-500">{info.updated_by_name}</span> am{" "}
          {new Date(info.updated_at).toLocaleString("de-DE", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </div>
      )}

      {showHistory && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Änderungsverlauf</div>
          {historyLoading ? (
            <div className="text-xs text-slate-500 italic">Lädt...</div>
          ) : history.length === 0 ? (
            <div className="text-xs text-slate-600 italic">Noch keine Änderungen im Verlauf</div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {history.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400">
                      {entry.changed_by_name || "Lehrperson"} —{" "}
                      {new Date(entry.changed_at).toLocaleString("de-DE", {
                        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => restoreHistory(entry)}
                      className="text-[9px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                    >
                      Wiederherstellen
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed line-clamp-3">
                    {entry.content || <em className="text-slate-600">(leer)</em>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
