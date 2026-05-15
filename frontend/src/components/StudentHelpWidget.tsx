"use client";

import React, { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { MessageSquare, Send, CheckCircle, Clock, AlertCircle, Sparkles, UserCheck } from "lucide-react";
import { getApiUrl, getWsUrl } from "@/utils/apiDiscovery";
import { fetchAuth } from "@/utils/fetchAuth";


interface ActiveHelpRequest {
  id: number;
  subject: string;
  message: string;
  status: "open" | "claimed" | "resolved";
  teacher_comment?: string | null;
  teacher_name?: string | null;
  full_name?: string;
  pupil_name?: string;
}

export default function StudentHelpWidget({ subjectsList }: { subjectsList?: string[] }) {
  const [activeRequest, setActiveRequest] = useState<ActiveHelpRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // State 1 form variables
  const [selectedSubject, setSelectedSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fallback subjects array ensuring smooth state 1 selection
  const subjects = (subjectsList && subjectsList.length > 0) 
    ? subjectsList 
    : ["Mathematik", "Deutsch", "Englisch", "Biologie", "Geografie", "Allgemein"];

  // Set default subject once available
  useEffect(() => {
    if (subjects.length > 0 && !selectedSubject) {
      setSelectedSubject(subjects[0]);
    }
  }, [subjects, selectedSubject]);

  // Establish local reactive WebSocket feed connection
  useEffect(() => {
    const token = localStorage.getItem("token");
    const wsUrl = getWsUrl();
    
    const socket: Socket = io(wsUrl, {
      auth: { token }
    });

    const userStr = localStorage.getItem("user");
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const myNameTarget = currentUser?.full_name || "";

    // Handler helpers comparing against current user representation
    const isMyRequest = (item: any) => {
      const targetName = item.pupil_name || item.full_name || "";
      return targetName.toLowerCase() === myNameTarget.toLowerCase();
    };

    socket.on("connect", () => {
      // Re-fetch state once reconnected
      fetchMyActiveRequest();
    });

    socket.on("help_created", (item: any) => {
      if (isMyRequest(item)) {
        setActiveRequest(item);
      }
    });

    socket.on("help_claimed", (item: any) => {
      if (isMyRequest(item)) {
        setActiveRequest(item);
      }
    });

    socket.on("help_updated", (item: any) => {
      if (isMyRequest(item)) {
        setActiveRequest(item);
      }
    });

    socket.on("help_resolved", (payload: any) => {
      setActiveRequest(prev => {
        if (prev && Number(prev.id) === Number(payload.id)) {
          return null; // Reset to State 1 seamlessly
        }
        return prev;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const fetchMyActiveRequest = async () => {
    setIsLoading(true);
    try {
      const userStr = localStorage.getItem("user");
      const currentUser = userStr ? JSON.parse(userStr) : null;
      const myNameTarget = currentUser?.full_name || "";

      const { data } = await fetchAuth("/api/help/active");
      if (data) {
        const activeRequests: ActiveHelpRequest[] = data;
        // Match against own full name
        const match = activeRequests.find(r => {
          const targetName = r.pupil_name || r.full_name || "";
          return targetName.toLowerCase() === myNameTarget.toLowerCase();
        });
        setActiveRequest(match || null);
      }
    } catch (err) {
      console.error("Fetch personal active help requests failed:", err);
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    fetchMyActiveRequest();
  }, []);

  // Submit help trigger (Transitions to State 2)
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data } = await fetchAuth("/api/help", {
        method: "POST",
        body: JSON.stringify({ subject: selectedSubject, message: message.trim() || "" })
      });

      // Clear input fields
      setMessage("");
      setActiveRequest(data);
    } catch (err: any) {
      setError(err.message || "Netzwerkfehler aufgetreten");
    } finally {
      setIsSubmitting(false);
    }
  };


  // Resolve request trigger (Resets to State 1)
  const handleResolveRequest = async () => {
    if (!activeRequest) return;

    try {
      const { res } = await fetchAuth(`/api/help/${activeRequest.id}/resolve`, {
        method: "PUT"
      });
      if (res.ok) {
        setActiveRequest(null);
      }
    } catch (err) {
      console.error("Resolve operation exception:", err);
    }
  };


  if (isLoading) {
    return (
      <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80 text-center text-xs text-slate-600 animate-pulse">
        Lade Dispatcher-Status...
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-950 to-slate-900 p-4 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden group">
      
      {/* Decorative blurred backdrops */}
      <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

      {/* Widget Header Title */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800/60">
        <div className="flex items-center gap-1.5">
          <span className="text-base">🙋</span>
          <h3 className="text-xs font-bold text-white tracking-tight">Live-Hilferuf (Dispatch)</h3>
        </div>
        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">
          {activeRequest ? `Status: ${activeRequest.status}` : "Bereit"}
        </span>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-[11px] flex items-center gap-1.5 animate-fadeIn">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* STATE 1: NO ACTIVE REQUEST */}
      {!activeRequest && (
        <form onSubmit={handleSubmitRequest} className="space-y-2.5 animate-fadeIn">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Betroffenes Fach:
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              {subjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Deine Frage / Problembeschreibung:
            </label>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional: z.B. Ich verstehe Aufgabe 3b auf Seite 42 nicht."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2 rounded-xl transition-all shadow-md shadow-indigo-600/10 flex items-center justify-center gap-1.5 active:scale-[0.99] disabled:opacity-50 mt-1"
          >
            <Send className="w-3.5 h-3.5 shrink-0" />
            <span>🙋 Ich brauche Hilfe</span>
          </button>
        </form>
      )}

      {/* STATE 2: OPEN (PULSING WAITING BADGE) */}
      {activeRequest?.status === "open" && (
        <div className="py-4 text-center space-y-3 animate-fadeIn">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold animate-pulse shadow-xs">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            <span>Warte auf Lehrperson...</span>
          </div>

          <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/40 text-left">
            <span className="text-[9px] font-mono font-bold text-indigo-400 block mb-0.5">
              Gemeldetes Fach: {activeRequest.subject}
            </span>
            <p className="text-xs text-slate-300 italic">
              &quot;{activeRequest.message}&quot;
            </p>
          </div>

          <p className="text-[10px] text-slate-500">
            Deine Anfrage ist auf dem Dashboard der Lehrkräfte sichtbar. Sobald sie bestätigt wird, ändert sich dieser Status.
          </p>
        </div>
      )}

      {/* STATE 3: CLAIMED (TEACHER IS ON THE WAY) */}
      {activeRequest?.status === "claimed" && (
        <div className="space-y-3 animate-fadeIn">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <Sparkles className="w-4 h-4 shrink-0 animate-bounce" />
            <span>Lehrperson ist auf dem Weg!</span>
          </div>

          {/* Prominent teacher commentary presentation */}
          {activeRequest.teacher_comment ? (
            <div className="bg-indigo-950/40 p-3 rounded-xl border border-indigo-500/30 relative">
              <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                Nachricht der Lehrperson:
              </span>
              <p className="text-xs font-bold text-white leading-relaxed">
                {activeRequest.teacher_comment}
              </p>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic px-2">
              Deine Betreuung wurde bestätigt. Die Lehrkraft steuert deinen Platz an.
            </div>
          )}

          <div className="bg-slate-900/40 p-2 rounded-lg border border-slate-800/40 text-[10px] text-slate-400 text-left">
            <span>Fach: <strong className="text-slate-300">{activeRequest.subject}</strong></span>
          </div>

          {/* Prominent Reset Resolution Button */}
          <button
            type="button"
            onClick={handleResolveRequest}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 active:scale-[0.99] mt-2"
          >
            <CheckCircle className="w-4 h-4 stroke-[2.5]" />
            <span>✅ Hilfe erhalten (Abschließen)</span>
          </button>
        </div>
      )}

    </div>
  );
}
