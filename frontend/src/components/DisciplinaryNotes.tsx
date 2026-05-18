"use client";

import { useState, useEffect, useMemo } from "react";
import { Socket } from "socket.io-client";
import { AlertCircle, FileDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Note, Pupil, SchoolClass, User } from "@/types";
import { getApiUrl } from "@/utils/apiDiscovery";
import { NoteSidebar } from "./notes/NoteSidebar";
import { NoteFilter } from "./notes/NoteFilter";
import { NoteForm } from "./notes/NoteForm";
import { NoteList } from "./notes/NoteList";
import { ImportantInfoSection } from "./notes/ImportantInfoSection";

interface DisciplinaryNotesProps {
  classes: SchoolClass[];
  pupils: Pupil[];
  socket: Socket | null;
}

export default function DisciplinaryNotes({ classes, pupils, socket }: DisciplinaryNotesProps) {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState<number>(classes[0]?.id || 1);
  const [selectedPupilId, setSelectedPupilId] = useState<number | "all">("all");
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "neutral" | "negative" | "auto">("all");
  
  const [newNoteText, setNewNoteText] = useState("");
  const [newSentiment, setNewSentiment] = useState<"positive" | "neutral" | "negative">("neutral");
  const [newNoteVisible, setNewNoteVisible] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const uStr = localStorage.getItem("user");
    if (uStr) setCurrentUser(JSON.parse(uStr));
  }, []);

  const { data: notes = [] } = useQuery({
    queryKey: ["notes", selectedClassId],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/notes/class/${selectedClassId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Fehler beim Abrufen der Klassen-Notizen");
      return res.json();
    },
    enabled: !!selectedClassId,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (note: any) => {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(note),
      });
      if (!res.ok) throw new Error("Fehler beim Veröffentlichen");
      return res.json();
    },
    onSuccess: () => {
      setNewNoteText("");
      setNewNoteVisible(false);
      setAlertMsg("Eintrag erfolgreich veröffentlicht.");
      queryClient.invalidateQueries({ queryKey: ["notes", selectedClassId] });
    },
    onError: (err: any) => setAlertMsg(err.message),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/notes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Löschen verweigert");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", selectedClassId] });
      setAlertMsg("Eintrag gelöscht.");
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/notes/${id}/toggle-visibility`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Keine Berechtigung zum Ändern der Sichtbarkeit");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", selectedClassId] });
    },
  });

  const classPupils = useMemo(() => {
    const targetClassName = classes.find((c) => Number(c.id) === Number(selectedClassId))?.name;
    return pupils.filter((p: Pupil) => p.class_name === targetClassName).sort((a: Pupil, b: Pupil) => a.name.localeCompare(b.name));
  }, [pupils, classes, selectedClassId]);

  useEffect(() => {
    if (!socket) return;
    const handleNewNote = (created: Note) => {
      const matchingPupil = classPupils.find((p: Pupil) => Number(p.id) === Number(created.pupil_id));
      if (matchingPupil) {
        queryClient.setQueryData(["notes", selectedClassId], (old: Note[] = []) => {
          if (old.some(n => n.id === created.id)) return old;
          return [created, ...old];
        });
      }
    };
    socket.on("note_created", handleNewNote);
    return () => { socket.off("note_created", handleNewNote); };
  }, [socket, classPupils, selectedClassId, queryClient]);

  const pupilCounters = useMemo(() => {
    const map: Record<number, { pos: number; neu: number; neg: number }> = {};
    classPupils.forEach((p: Pupil) => { map[p.id!] = { pos: 0, neu: 0, neg: 0 }; });
    notes.forEach((n: Note) => {
      const pid = Number(n.pupil_id);
      if (map[pid]) {
        if (n.sentiment === "positive") map[pid].pos++;
        else if (n.sentiment === "negative") map[pid].neg++;
        else map[pid].neu++;
      }
    });
    return map;
  }, [notes, classPupils]);

  const filteredNotes = useMemo(() => {
    return notes.filter((n: Note) => {
      if (selectedPupilId !== "all" && Number(n.pupil_id) !== Number(selectedPupilId)) return false;
      if (currentUser?.role === "pupil" && !n.is_visible_to_pupil) return false;
      if (sentimentFilter === "positive") return n.sentiment === "positive";
      if (sentimentFilter === "neutral") return n.sentiment === "neutral";
      if (sentimentFilter === "negative") return n.sentiment === "negative";
      if (sentimentFilter === "auto") return n.auto_source !== null && n.auto_source !== undefined;
      return true;
    });
  }, [notes, selectedPupilId, sentimentFilter, currentUser]);

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = selectedPupilId === "all" ? classPupils[0]?.id : selectedPupilId;
    if (!targetId || !newNoteText.trim()) return;
    createNoteMutation.mutate({
      pupil_id: targetId,
      note_text: newNoteText.trim(),
      sentiment: newSentiment,
      is_visible_to_pupil: newNoteVisible,
    });
  };

  const handleKelExport = async (pupilId: number) => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/notes/export-kel/${pupilId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export fehlgeschlagen");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      link.download = filenameMatch ? filenameMatch[1] : `KEL_${pupilId}.doc`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setAlertMsg("KEL-Export fehlgeschlagen");
    }
  };

  useEffect(() => {
    if (alertMsg) {
      const t = setTimeout(() => setAlertMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [alertMsg]);

  const selectedPupilObj = selectedPupilId !== "all"
    ? classPupils.find((p) => Number(p.id) === Number(selectedPupilId))
    : null;

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-950">
      <NoteSidebar
        classes={classes}
        selectedClassId={selectedClassId}
        setSelectedClassId={setSelectedClassId}
        selectedPupilId={selectedPupilId}
        setSelectedPupilId={setSelectedPupilId}
        classPupils={classPupils}
        pupilCounters={pupilCounters}
      />

      <main className="flex-1 p-6 overflow-y-auto flex flex-col max-w-4xl mx-auto w-full">
        {alertMsg && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-300 text-xs font-medium flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{alertMsg}</span>
          </div>
        )}

        {/* Header with KEL export button for specific pupil */}
        {selectedPupilObj && currentUser?.role !== "pupil" && (
          <div className="flex items-center justify-between mb-3 shrink-0">
            <span className="text-sm font-bold text-white">{selectedPupilObj.name}</span>
            <button
              onClick={() => handleKelExport(selectedPupilObj.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold transition-all"
              title="KEL-Gesprächsunterlage exportieren (Kinder-Eltern-Lehrperson)"
            >
              <FileDown className="w-3.5 h-3.5" />
              KEL-Gespräch Exportieren 📄
            </button>
          </div>
        )}

        {/* Important Info Section (shown when a specific pupil is selected) */}
        {selectedPupilObj && currentUser?.role !== "pupil" && (
          <ImportantInfoSection
            pupilId={selectedPupilObj.id}
            pupilName={selectedPupilObj.name}
            currentUserRole={currentUser?.role || "teacher"}
          />
        )}

        <NoteFilter
          selectedPupilId={selectedPupilId}
          classPupils={classPupils}
          sentimentFilter={sentimentFilter}
          setSentimentFilter={setSentimentFilter}
        />

        {currentUser?.role !== "pupil" && classPupils.length > 0 && (
          <NoteForm
            selectedPupilId={selectedPupilId}
            setSelectedPupilId={setSelectedPupilId}
            classPupils={classPupils}
            newNoteText={newNoteText}
            setNewNoteText={setNewNoteText}
            newSentiment={newSentiment}
            setNewSentiment={setNewSentiment}
            newNoteVisible={newNoteVisible}
            setNewNoteVisible={setNewNoteVisible}
            handleCreateNote={handleCreateNote}
          />
        )}

        <NoteList
          filteredNotes={filteredNotes}
          classPupils={classPupils}
          currentUser={currentUser}
          handleToggleVisibility={(id) => toggleVisibilityMutation.mutate(id)}
          handleDeleteNote={(id) => deleteNoteMutation.mutate(id)}
        />
      </main>
    </div>
  );
}
