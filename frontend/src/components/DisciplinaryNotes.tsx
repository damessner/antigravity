"use client";

import { useState, useEffect, useMemo } from "react";
import { Socket } from "socket.io-client";
import { 
  MessageSquarePlus, Eye, EyeOff, Trash2,
  Smile, Meh, Frown, Bot, AlertCircle
} from "lucide-react";
import { Pupil } from "./TeacherDashboard";
import { getApiUrl } from "@/utils/apiDiscovery";

// Fix 6: Deterministic emoji pools per sentiment
const EMOJI_POOLS: Record<string, string[]> = {
  positive: ["😊", "⭐", "👍", "🏆", "🌟", "✅", "💪", "🎉"],
  neutral:  ["📝", "💬", "🔔", "📌", "🗒️", "💡", "📋", "ℹ️"],
  negative: ["⚠️", "🚨", "❌", "🔴", "😔", "📛", "🛑", "👎"],
};

const getSentimentEmoji = (sentiment: string, noteId: number): string => {
  const pool = EMOJI_POOLS[sentiment] ?? EMOJI_POOLS.neutral;
  return pool[noteId % pool.length];
};

export interface Note {
  id: number;
  pupil_id: number;
  note_text: string;
  sentiment: "positive" | "neutral" | "negative";
  is_visible_to_pupil: boolean;
  auto_source?: string;
  created_at: string;
  teacher_id: number;
  teacher_name?: string;
}

interface CurrentUser {
  id: number;
  username: string;
  full_name: string;
  role: "admin" | "teacher" | "pupil" | "lernwerkstatt";
}

interface DisciplinaryNotesProps {
  classes: { id: number; name: string }[];
  pupils: Pupil[];
  socket: Socket | null;
}

export default function DisciplinaryNotes({ classes, pupils, socket }: DisciplinaryNotesProps) {
  const [selectedClassId, setSelectedClassId] = useState<number>(classes[0]?.id || 1);
  const [selectedPupilId, setSelectedPupilId] = useState<number | "all">("all");
  
  // Note states
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // Filters
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "neutral" | "negative" | "auto">("all");

  // New Note Form
  const [newNoteText, setNewNoteText] = useState("");
  const [newSentiment, setNewSentiment] = useState<"positive" | "neutral" | "negative">("neutral");
  const [newNoteVisible, setNewNoteVisible] = useState(false);

  // Read current user
  useEffect(() => {
    const uStr = localStorage.getItem("user");
    if (uStr) setCurrentUser(JSON.parse(uStr));
  }, []);

  // Default class initialization
  useEffect(() => {
    if (classes.length > 0 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, selectedClassId]);

  // Derive stable list of pupils belonging to selectedClassId
  const classPupils = useMemo(() => {
    const targetClassName = classes.find((c) => Number(c.id) === Number(selectedClassId))?.name;
    return pupils.filter((p) => p.class_name === targetClassName).sort((a, b) => a.name.localeCompare(b.name));
  }, [pupils, classes, selectedClassId]);

  // Load notes feed for chosen class
  const loadClassNotes = async (classId: number) => {
    setIsLoading(true);
    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/notes/class/${classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data || []);
      }
    } catch (err) {
      setAlertMsg("Fehler beim Abrufen der Klassen-Notizen");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      loadClassNotes(selectedClassId);
      setSelectedPupilId("all"); // reset selection when class switches
    }
  }, [selectedClassId]);

  // Handle auto message clearing
  useEffect(() => {
    if (alertMsg) {
      const t = setTimeout(() => setAlertMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertMsg]);

  // Integrate live incoming broadcast notes via props socket triggers
  useEffect(() => {
    if (!socket) return;
    const handleNewNote = (created: Note) => {
      // Append to list if target pupil is within current class subset
      const matchingPupil = classPupils.find((p) => Number(p.id) === Number(created.pupil_id));
      if (matchingPupil) {
        setNotes((prev: Note[]) => {
          // Avoid duplicate appends
          if (prev.some((n: Note) => Number(n.id) === Number(created.id))) return prev;
          return [created, ...prev];
        });
      }
    };

    socket.on("note_created", handleNewNote);
    return () => {
      socket.off("note_created", handleNewNote);
    };
  }, [socket, classPupils]);

  // Compute counters per pupil Section 8
  const pupilCounters = useMemo(() => {
    const map: Record<number, { pos: number; neu: number; neg: number }> = {};
    classPupils.forEach((p) => {
      map[p.id] = { pos: 0, neu: 0, neg: 0 };
    });

    notes.forEach((n) => {
      const pid = Number(n.pupil_id);
      if (map[pid]) {
        if (n.sentiment === "positive") map[pid].pos++;
        else if (n.sentiment === "negative") map[pid].neg++;
        else map[pid].neu++;
      }
    });
    return map;
  }, [notes, classPupils]);

  // Filter notes subset
  const filteredNotes = useMemo(() => {
    return notes.filter((n: Note) => {
      // Pupil context filter
      if (selectedPupilId !== "all" && Number(n.pupil_id) !== Number(selectedPupilId)) return false;

      // Role filter: pupils only view records marked visible
      if (currentUser?.role === "pupil" && !n.is_visible_to_pupil) return false;

      // Sentiment filter
      if (sentimentFilter === "positive") return n.sentiment === "positive";
      if (sentimentFilter === "neutral") return n.sentiment === "neutral";
      if (sentimentFilter === "negative") return n.sentiment === "negative";
      if (sentimentFilter === "auto") return n.auto_source !== null && n.auto_source !== undefined;

      return true;
    });
  }, [notes, selectedPupilId, sentimentFilter, currentUser]);

  // --- Handlers ---
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = selectedPupilId === "all" ? classPupils[0]?.id : selectedPupilId;
    if (!targetId || !newNoteText.trim()) return;

    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          pupil_id: targetId,
          note_text: newNoteText.trim(),
          sentiment: newSentiment,
          is_visible_to_pupil: newNoteVisible,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Local appends are done via WebSocket event broadcast automatically
      setNewNoteText("");
      setNewNoteVisible(false);
      setAlertMsg("Eintrag erfolgreich veröffentlicht.");
    } catch (err: any) {
      setAlertMsg(err.message || "Fehler beim Veröffentlichen");
    }
  };

  const handleToggleVisibility = async (id: number) => {
    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/notes/${id}/toggle-visibility`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setNotes((prev: Note[]) =>
          prev.map((n: Note) => (Number(n.id) === Number(id) ? { ...n, is_visible_to_pupil: data.is_visible_to_pupil } : n))
        );
      } else {
        const errData = await res.json();
        setAlertMsg(errData.error || "Keine Berechtigung zum Ändern der Sichtbarkeit");
      }
    } catch (e) {}
  };

  const handleDeleteNote = async (id: number) => {
    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/notes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setNotes((prev: Note[]) => prev.filter((n: Note) => Number(n.id) !== Number(id)));
        setAlertMsg("Eintrag gelöscht.");
      } else {
        const errData = await res.json();
        setAlertMsg(errData.error || "Löschen verweigert");
      }
    } catch (e) {}
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-950">
      {/* LEFT DRAWER PANEL: PUPIL LIST FOR SELECTED CLASS Section 8 */}
      <aside className="w-64 bg-slate-900/60 border-r border-slate-800 p-4 shrink-0 flex flex-col gap-3 overflow-y-auto">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Klassen-Auswahl
          </label>
          <select
            value={selectedClassId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedClassId(Number(e.target.value))}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs font-bold text-amber-400 focus:outline-none focus:border-amber-500"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                Klasse {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="h-px bg-slate-800/80 my-1" />

        {/* Global selection option */}
        <button
          onClick={() => setSelectedPupilId("all")}
          className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between ${
            selectedPupilId === "all"
              ? "bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold"
              : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
          }`}
        >
          <span>👥 Alle Schüler der Klasse</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-950 text-slate-500 font-mono">
            {classPupils.length}
          </span>
        </button>

        {/* Individual Pupil Cards mapped list Section 8 */}
        <div className="space-y-1.5 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block px-1 pt-1">
            Schüler-Akte
          </span>
          {classPupils.map((p) => {
            const isSelected = selectedPupilId === p.id;
            const cnts = pupilCounters[p.id] || { pos: 0, neu: 0, neg: 0 };

            return (
              <button
                key={p.id}
                onClick={() => setSelectedPupilId(p.id)}
                className={`w-full p-2.5 rounded-xl text-left transition-all border ${
                  isSelected
                    ? "bg-amber-500/15 text-white border-amber-500/40 shadow-xs"
                    : "bg-slate-950/40 border-slate-900 text-slate-300 hover:border-slate-800"
                }`}
              >
                <span className="font-bold text-xs truncate block">{p.name}</span>

                {/* Counters Row Section 8 */}
                <div className="flex items-center gap-1 mt-1.5">
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      cnts.pos > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-950 text-slate-600"
                    }`}
                    title="Positive Einträge"
                  >
                    +{cnts.pos}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      cnts.neu > 0 ? "bg-slate-800 text-slate-300 border border-slate-700" : "bg-slate-950 text-slate-600"
                    }`}
                    title="Neutrale Bemerkungen"
                  >
                    •{cnts.neu}
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      cnts.neg > 0 ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse" : "bg-slate-950 text-slate-600"
                    }`}
                    title="Negative Disziplinarvermerke"
                  >
                    -{cnts.neg}
                  </span>
                </div>
              </button>
            );
          })}

          {classPupils.length === 0 && (
            <p className="text-[11px] text-slate-600 italic text-center pt-4">Keine Schüler in der Auswahl</p>
          )}
        </div>
      </aside>

      {/* MAIN PANEL: LOG VIEW FEED & EDITORS Section 8 */}
      <main className="flex-1 p-6 overflow-y-auto flex flex-col max-w-4xl mx-auto w-full">
        {alertMsg && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-300 text-xs font-medium flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{alertMsg}</span>
          </div>
        )}

        {/* Filter Pill Buttons Row Section 8 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Disziplinäre & Verhaltensdokumentation</span>
              {selectedPupilId !== "all" && (
                <span className="text-amber-400 font-mono text-xs">
                  ({classPupils.find((p) => p.id === selectedPupilId)?.name})
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Filtern und Erfassen von Beobachtungen in Echtzeit</p>
          </div>

          {/* Filter Pills list Section 8 */}
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            {[
              { id: "all", label: "Alle" },
              { id: "positive", label: "Positiv", icon: Smile, color: "text-emerald-400" },
              { id: "neutral", label: "Neutral", icon: Meh, color: "text-slate-400" },
              { id: "negative", label: "Negativ", icon: Frown, color: "text-rose-400" },
              { id: "auto", label: "System-Auto", icon: Bot, color: "text-cyan-400" },
            ].map((pill) => {
              const IconComponent = pill.icon;
              const isActive = sentimentFilter === pill.id;

              return (
                <button
                  key={pill.id}
                  onClick={() => setSentimentFilter(pill.id as any)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    isActive
                      ? "bg-slate-800 text-white border-slate-700 shadow-xs"
                      : "bg-slate-950 text-slate-500 border-transparent hover:text-slate-300"
                  }`}
                >
                  {IconComponent && <IconComponent className={`w-3 h-3 ${pill.color}`} />}
                  <span>{pill.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Append Form Entry Box Section 8 */}
        {currentUser?.role !== "pupil" && classPupils.length > 0 && (
          <form onSubmit={handleCreateNote} className="glass-panel p-4 mb-6 shrink-0 border-amber-500/20 bg-gradient-to-b from-slate-900/90 to-amber-950/10">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-white flex items-center gap-1.5">
                <MessageSquarePlus className="w-4 h-4 text-amber-400" />
                <span>Neuen Vermerk hinterlegen</span>
              </label>

              {/* Target selector placeholder */}
              {selectedPupilId === "all" ? (
                <select
                  defaultValue=""
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPupilId(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 rounded p-1 text-[11px] font-bold text-amber-400 focus:outline-none"
                >
                  <option value="" disabled>
                    Zielschüler wählen...
                  </option>
                  {classPupils.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-bold text-amber-300">
                  Ziel: {classPupils.find((p) => p.id === selectedPupilId)?.name}
                </span>
              )}
            </div>

            <textarea
              rows={2}
              value={newNoteText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNoteText(e.target.value)}
              placeholder="Beobachtung oder Vorfall schildern..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
              required
            />

            {/* Bottom Row controllers */}
            <div className="flex items-center justify-between gap-3 mt-3 pt-2 border-t border-slate-800/60">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">Einstufung:</span>
                  <div className="flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setNewSentiment("positive")}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                        newSentiment === "positive" ? "bg-emerald-500/15 text-emerald-400" : "text-slate-600 hover:text-slate-400"
                      }`}
                    >
                      <Smile className="w-3 h-3" /> Positiv
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSentiment("neutral")}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                        newSentiment === "neutral" ? "bg-slate-800 text-slate-200" : "text-slate-600 hover:text-slate-400"
                      }`}
                    >
                      <Meh className="w-3 h-3" /> Neutral
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSentiment("negative")}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${
                        newSentiment === "negative" ? "bg-rose-500/15 text-rose-400" : "text-slate-600 hover:text-slate-400"
                      }`}
                    >
                      <Frown className="w-3 h-3" /> Negativ
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newNoteVisible}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewNoteVisible(e.target.checked)}
                    className="w-3.5 h-3.5 rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <span>Für Schüler sichtbar</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={!newNoteText.trim() || (selectedPupilId === "all" && classPupils.length === 0)}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition-all shadow-xs disabled:opacity-40"
              >
                Eintragen
              </button>
            </div>
          </form>
        )}

        {/* LOG VIEW TIMELINE LIST Section 8 */}
        <div className="space-y-3 flex-1">
          {filteredNotes.map((note) => {
            const isAuto = note.auto_source !== null && note.auto_source !== undefined;
            const targetPupil = classPupils.find((p) => Number(p.id) === Number(note.pupil_id));
            const pupilName = targetPupil?.name || `Schüler-ID #${note.pupil_id}`;

            // Styling mapping depending on sentiment
            let borderStyle = "border-slate-800 bg-slate-900/60";
            let badgeStyle = "bg-slate-800 text-slate-400";

            if (note.sentiment === "positive") {
              borderStyle = "border-emerald-500/30 bg-emerald-950/10";
              badgeStyle = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
            } else if (note.sentiment === "negative") {
              borderStyle = "border-rose-500/30 bg-rose-950/10";
              badgeStyle = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
            }

            // Fix 6: Deterministic emoji using modulo pool
            const sentimentEmoji = getSentimentEmoji(note.sentiment, Number(note.id));

            if (isAuto) {
              borderStyle += " border-l-4 border-l-cyan-500";
            }

            const timestampDe = new Date(note.created_at).toLocaleString("de-DE", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            // Permission block
            const canEdit = currentUser?.role === "admin" || Number(note.teacher_id) === Number(currentUser?.id);

            return (
              <div
                key={note.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 ${borderStyle}`}
              >
                {/* Meta details banner */}
                <div className="flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-xs text-white">{pupilName}</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 ${badgeStyle}`}>
                      <span className="text-[11px]">{sentimentEmoji}</span>
                      <span className="capitalize">{note.sentiment}</span>
                    </span>

                    {isAuto && (
                      <span
                        className="px-2 py-0.5 rounded text-[9px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1"
                        title="System-generierter Nachweisvermerk (automatisch synchronisiert)"
                      >
                        <Bot className="w-2.5 h-2.5" /> Auto-Log
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-slate-500 shrink-0">{timestampDe}</span>
                </div>

                {/* Main observation log text */}
                <p className="text-xs text-slate-200 leading-relaxed font-normal whitespace-pre-wrap pl-1">
                  {note.note_text}
                </p>

                {/* Footer status markers & Action controllers Section 8 */}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-800/40 text-[10px] text-slate-500">
                  <div className="flex items-center gap-3">
                    <span>Von: {note.teacher_name || "Lehrperson"}</span>
                    <span className="flex items-center gap-1">
                      {note.is_visible_to_pupil ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                          <Eye className="w-3 h-3" /> Sichtbar für Schüler
                        </span>
                      ) : (
                        <span className="text-slate-600 flex items-center gap-1">
                          <EyeOff className="w-3 h-3" /> Privat (nur Lehrer)
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Edit triggers Section 8 */}
                  {currentUser?.role !== "pupil" && (
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <button
                          onClick={() => handleToggleVisibility(note.id)}
                          className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors"
                          title="Sichtbarkeitsstatus umschalten"
                        >
                          Sichtbarkeit umschalten
                        </button>
                      )}

                      {/* Manual notes allow deletion, auto generated disable Section 8 */}
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        disabled={isAuto || !canEdit}
                        className="p-1 rounded text-slate-600 hover:text-rose-400 hover:bg-slate-950 transition-colors disabled:opacity-30 disabled:hover:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        title={isAuto ? "Automatische Systemaudits können nicht gelöscht werden" : "Eintrag löschen"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredNotes.length === 0 && (
            <div className="p-8 text-center text-slate-600 border border-dashed border-slate-800 rounded-xl italic">
              Keine entsprechenden Einträge in dieser Ansichtsfilterung gefunden.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
