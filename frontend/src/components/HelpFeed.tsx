"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, Filter, CheckCircle2, MessageSquare, Clock, RefreshCw, UserCheck } from "lucide-react";
import { getApiUrl } from "@/utils/apiDiscovery";

interface HelpRequestItem {
  id: number;
  pupil_id: number;
  subject: string;
  message: string;
  status: "open" | "claimed" | "resolved";
  claimed_by_teacher_id?: number | null;
  teacher_comment?: string | null;
  created_at: string;
  class_id?: number;
  full_name?: string;
  pupil_name?: string;
  class_name?: string;
  teacher_name?: string;
}

export default function HelpFeed({ socket, currentUser }: { socket: any; currentUser: any }) {
  const [requests, setRequests] = useState<HelpRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState("all");

  // Local interaction comment caches keyed by request id
  const [claimComments, setClaimComments] = useState<{ [key: number]: string }>({});
  const [liveUpdateComments, setLiveUpdateComments] = useState<{ [key: number]: string }>({});
  const [isSaving, setIsSaving] = useState<{ [key: number]: boolean }>({});

  // Trigger continuous timer string re-evaluations
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchActiveRequests = async () => {
    setIsLoading(true);
    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();

    try {
      const res = await fetch(`${apiUrl}/api/help/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data || []);
        
        // Populate live commentary inputs initially
        const commentMap: { [key: number]: string } = {};
        data.forEach((r: HelpRequestItem) => {
          if (r.teacher_comment) {
            commentMap[r.id] = r.teacher_comment;
          }
        });
        setLiveUpdateComments(commentMap);
      }
    } catch (err) {
      console.error("Fetch active help dispatches error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveRequests();
  }, []);

  // Socket state event binding layer
  useEffect(() => {
    if (!socket) return;

    const handleCreated = (newItem: HelpRequestItem) => {
      setRequests(prev => {
        if (prev.some(r => Number(r.id) === Number(newItem.id))) return prev;
        return [...prev, newItem];
      });
    };

    const handleClaimedOrUpdated = (updatedItem: HelpRequestItem) => {
      setRequests(prev => prev.map(r => Number(r.id) === Number(updatedItem.id) ? updatedItem : r));
      if (updatedItem.teacher_comment) {
        setLiveUpdateComments(prev => ({ ...prev, [updatedItem.id]: updatedItem.teacher_comment || "" }));
      }
    };

    const handleResolved = (payload: { id: number }) => {
      setRequests(prev => prev.filter(r => Number(r.id) !== Number(payload.id)));
    };

    socket.on("help_created", handleCreated);
    socket.on("help_claimed", handleClaimedOrUpdated);
    socket.on("help_updated", handleClaimedOrUpdated);
    socket.on("help_resolved", handleResolved);

    return () => {
      socket.off("help_created", handleCreated);
      socket.off("help_claimed", handleClaimedOrUpdated);
      socket.off("help_updated", handleClaimedOrUpdated);
      socket.off("help_resolved", handleResolved);
    };
  }, [socket]);

  // Derive stable dynamic class list filters
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    requests.forEach(r => {
      if (r.class_name) set.add(r.class_name);
    });
    return Array.from(set).sort();
  }, [requests]);

  // Sort by created_at ascending (oldest requests prioritized first per prompt rule)
  const filteredSortedRequests = useMemo(() => {
    return requests
      .filter(r => {
        const nameTarget = r.pupil_name || r.full_name || "";
        const matchSearch = nameTarget.toLowerCase().includes(searchQuery.toLowerCase());
        const matchClass = selectedClass === "all" || r.class_name === selectedClass;
        return matchSearch && matchClass;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [requests, searchQuery, selectedClass]);

  const handleClaimRequest = async (id: number) => {
    setIsSaving(prev => ({ ...prev, [id]: true }));
    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();
    const comment = claimComments[id]?.trim();

    try {
      const res = await fetch(`${apiUrl}/api/help/${id}/claim`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teacher_comment: comment || undefined })
      });
      if (res.ok) {
        const updated = await res.json();
        setRequests(prev => prev.map(r => Number(r.id) === Number(id) ? updated : r));
      }
    } catch (err) {
      console.error("Claim request network operation exception:", err);
    } finally {
      setIsSaving(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleUpdateCommentOnTheFly = async (id: number) => {
    setIsSaving(prev => ({ ...prev, [id]: true }));
    const token = localStorage.getItem("token");
    const apiUrl = getApiUrl();
    const commentTarget = liveUpdateComments[id] || "";

    try {
      const res = await fetch(`${apiUrl}/api/help/${id}/comment`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teacher_comment: commentTarget })
      });
      if (res.ok) {
        const updated = await res.json();
        setRequests(prev => prev.map(r => Number(r.id) === Number(id) ? updated : r));
      }
    } catch (err) {
      console.error("Update live comment operation error:", err);
    } finally {
      setIsSaving(prev => ({ ...prev, [id]: false }));
    }
  };

  // Helper computing humanized wait elapsed strings
  const renderTimeElapsed = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins <= 0) return "Gerade eben";
    return `wartet seit ${diffMins} Min`;
  };

  return (
    <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full p-4 md:p-6 animate-fadeIn duration-200">
      
      {/* Premium Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-800 shrink-0">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span>🙋 Live-Hilfe & Dispatch System</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Echtzeit
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Eintreffende Anfragen von Schülern priorisieren, übernehmen und mit interaktiven Statusnachrichten versehen.
          </p>
        </div>

        <button
          onClick={fetchActiveRequests}
          disabled={isLoading}
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          title="Verbindungsstatus & Feed neu laden"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
        </button>
      </div>

      {/* STICKY CONTROL BAR FILTERS */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-md p-3 rounded-2xl border border-slate-800/80 mb-5 flex flex-col sm:flex-row items-center gap-3 shadow-lg">
        
        {/* Search input by student name */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Schüler suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Dynamic Class selection dropdown */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs font-medium text-slate-400 whitespace-nowrap">Klasse filtern:</span>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            <option value="all">Alle Klassen</option>
            {availableClasses.map(className => (
              <option key={className} value={className}>{className}</option>
            ))}
          </select>
        </div>

      </div>

      {/* DISPATCH CARDS DISPLAY (Oldest First) */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-6">
        {filteredSortedRequests.map((item) => {
          const isClaimed = item.status === "claimed";
          const isOwnerOfClaim = isClaimed && Number(item.claimed_by_teacher_id) === Number(currentUser?.id);
          const activeTeacherName = item.teacher_name || "Lehrperson";

          return (
            <div
              key={item.id}
              className={`p-4 rounded-2xl border transition-all duration-200 relative group flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                isClaimed
                  ? "bg-slate-950/40 border-slate-800/40 opacity-70"
                  : "bg-slate-900/80 border-indigo-500/40 shadow-xl shadow-indigo-500/5 ring-1 ring-indigo-500/10"
              }`}
            >
              
              {/* Profile details & Message string */}
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-white tracking-tight">
                    {item.pupil_name || item.full_name || "Schüler"}
                  </span>
                  
                  {item.class_name && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-950 text-slate-400 border border-slate-800">
                      {item.class_name}
                    </span>
                  )}

                  <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    {item.subject}
                  </span>

                  <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1 ml-auto md:ml-0">
                    <Clock className="w-2.5 h-2.5 text-indigo-400" />
                    {renderTimeElapsed(item.created_at)}
                  </span>
                </div>

                <p className={`text-xs p-2.5 rounded-xl border ${
                  isClaimed ? "bg-slate-950/30 text-slate-400 border-slate-800/30" : "bg-slate-950/80 text-slate-200 border-slate-800/80"
                }`}>
                  {item.message}
                </p>
              </div>

              {/* ACTION / COMMENT INTERACTION BLOCK */}
              <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                
                {item.status === "open" ? (
                  <>
                    <input
                      type="text"
                      placeholder="Nachricht hinterlassen (Optional)"
                      value={claimComments[item.id] || ""}
                      onChange={(e) => setClaimComments({ ...claimComments, [item.id]: e.target.value })}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors w-full sm:w-48"
                    />
                    
                    <button
                      type="button"
                      onClick={() => handleClaimRequest(item.id)}
                      disabled={isSaving[item.id]}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-xs shrink-0 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Übernehmen</span>
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-800/40 shrink-0">
                      <UserCheck className="w-3 h-3 text-emerald-400" />
                      <span>Wird betreut von <strong className="text-slate-200">{activeTeacherName}</strong></span>
                    </div>

                    {/* Dynamic Commentary live configuration access */}
                    {isOwnerOfClaim && (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          type="text"
                          placeholder="Kommentar aktualisieren..."
                          value={liveUpdateComments[item.id] ?? (item.teacher_comment || "")}
                          onChange={(e) => setLiveUpdateComments({ ...liveUpdateComments, [item.id]: e.target.value })}
                          className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors flex-1 min-w-[120px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateCommentOnTheFly(item.id)}
                          disabled={isSaving[item.id]}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors border border-slate-700 shrink-0 disabled:opacity-50"
                          title="Kommentar speichern"
                        >
                          {isSaving[item.id] ? "..." : "Update"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>

            </div>
          );
        })}

        {filteredSortedRequests.length === 0 && !isLoading && (
          <div className="py-16 text-center flex flex-col items-center justify-center gap-3 text-slate-500">
            <CheckCircle2 className="w-12 h-12 text-emerald-500/20 stroke-1" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-400">Keine aktiven Hilfeanfragen verzeichnet</p>
              <p className="text-[11px]">Alle gemeldeten Probleme wurden erfolgreich gelöst oder die Suchkriterien greifen nicht.</p>
            </div>
          </div>
        )}

        {isLoading && requests.length === 0 && (
          <div className="py-16 text-center text-xs text-slate-600 animate-pulse">
            Lade Live-Hilferufe vom Server...
          </div>
        )}
      </div>

    </div>
  );
}
