"use client";

import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Download, RefreshCw } from "lucide-react";
import { fetchAuth } from "@/utils/fetchAuth";
import { getWsUrl } from "@/utils/apiDiscovery";

type LogLevel = "error" | "warn" | "info";

interface LogEntry {
  ts: number;
  iso: string;
  level: LogLevel;
  context: string;
  message: string;
  error?: string;
  stack?: string;
}

export function AdminDebugConsole() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>(["error", "warn", "info"]);
  const [isLoading, setIsLoading] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  const levelsQuery = useMemo(() => selectedLevels.join(","), [selectedLevels]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const { data } = await fetchAuth(`/api/admin/logs?levels=${encodeURIComponent(levelsQuery)}&limit=300`);
      setEntries(data?.entries || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [levelsQuery]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const socketInstance = io(getWsUrl(), { auth: { token }, transports: ["websocket"] });
    socketInstance.on("connect", () => socketInstance.emit("join_admin_debug"));
    socketInstance.on("admin_log", (entry: LogEntry) => {
      if (!selectedLevels.includes(entry.level)) return;
      setEntries((prev) => [entry, ...prev].slice(0, 500));
    });
    setSocket(socketInstance);
    return () => {
      socketInstance.disconnect();
      setSocket(null);
    };
  }, [selectedLevels]);

  const toggleLevel = (level: LogLevel) => {
    setSelectedLevels((prev) => {
      if (prev.includes(level)) return prev.filter((l) => l !== level);
      return [...prev, level];
    });
  };

  const exportCsv = async () => {
    const { res } = await fetchAuth(`/api/admin/logs?format=csv&levels=${encodeURIComponent(levelsQuery)}&limit=2000`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `admin-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const statusDot = socket?.connected ? "bg-emerald-500" : "bg-rose-500";

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Debugging-Konsole</h3>
            <p className="text-[11px] text-slate-500">Live-Logstream, Filter und CSV-Export</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusDot}`} />
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Aktualisieren
            </button>
            <button
              onClick={exportCsv}
              className="text-xs px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-500/10 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              CSV Export
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {(["error", "warn", "info"] as LogLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                selectedLevels.includes(level)
                  ? level === "error"
                    ? "border-rose-400/50 text-rose-300 bg-rose-500/10"
                    : level === "warn"
                    ? "border-amber-400/50 text-amber-300 bg-amber-500/10"
                    : "border-cyan-400/50 text-cyan-300 bg-cyan-500/10"
                  : "border-slate-700 text-slate-500"
              }`}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-black/50 border border-slate-800 rounded-2xl p-4 font-mono text-[10px] text-slate-300 h-[520px] overflow-y-auto custom-scrollbar space-y-2">
        {entries.length === 0 ? (
          <div className="text-slate-500 text-xs text-center py-10">Keine Logs für die aktuellen Filter.</div>
        ) : (
          entries.map((entry) => (
            <div key={`${entry.ts}-${entry.message}-${entry.level}`} className="border border-slate-800 rounded-xl p-2.5 bg-slate-950/70">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-slate-500">{entry.iso}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                  entry.level === "error" ? "bg-rose-500/10 text-rose-300" :
                  entry.level === "warn" ? "bg-amber-500/10 text-amber-300" :
                  "bg-cyan-500/10 text-cyan-300"
                }`}>{entry.level.toUpperCase()}</span>
                <span className="text-indigo-300">{entry.context}</span>
              </div>
              <div className="whitespace-pre-wrap break-words">{entry.message}</div>
              {entry.error && <div className="text-rose-300 mt-1 break-words">{entry.error}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
