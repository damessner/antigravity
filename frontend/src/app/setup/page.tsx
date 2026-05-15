"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Plus, Trash2, ArrowRight, ArrowLeft } from "lucide-react";
import { getApiUrl } from "@/utils/apiDiscovery";

const DEFAULT_ROOMS = ["Klassenzimmer", "Lernwerkstatt", "Gang 1. OG", "Gang 2. OG"];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rooms, setRooms] = useState<string[]>([...DEFAULT_ROOMS]);
  const [newRoom, setNewRoom] = useState("");
  const [includeTimeout, setIncludeTimeout] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddRoom = () => {
    const clean = newRoom.trim();
    if (!clean || rooms.includes(clean)) return;
    setRooms((prev) => [...prev, clean]);
    setNewRoom("");
  };

  const handleRemoveRoom = (name: string) => {
    setRooms((prev) => prev.filter((r) => r !== name));
  };

  const handleFinish = async () => {
    setIsLoading(true);
    setError(null);
    const finalRooms = [...rooms];
    if (includeTimeout && !finalRooms.includes("TimeOut")) {
      finalRooms.push("TimeOut");
    }

    const apiUrl = getApiUrl();
    try {
      const res = await fetch(`${apiUrl}/api/setup/init-rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rooms: finalRooms }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup fehlgeschlagen");
      router.replace("/login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600/20 to-cyan-600/20 border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3 mb-1">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <h1 className="text-sm font-bold text-white">Ersteinrichtungs-Assistent</h1>
          </div>
          <div className="flex items-center gap-2 mt-3">
            {([1, 2, 3] as const).map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all ${
                    step === s
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : step > s
                      ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400"
                      : "bg-slate-950 border-slate-800 text-slate-500"
                  }`}
                >
                  {step > s ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
                </div>
                {s < 3 && <div className={`w-8 h-px ${step > s ? "bg-emerald-500/40" : "bg-slate-800"}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Step 1: Räume */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Schritt 1: Räume anlegen</h2>
                <p className="text-xs text-slate-400">
                  Wähle die Räume deiner Schule. Du kannst diese später im Admin-Panel ändern.
                </p>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {rooms.map((room) => (
                  <div
                    key={room}
                    className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-slate-200 font-medium">{room}</span>
                    {!DEFAULT_ROOMS.includes(room) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRoom(room)}
                        className="text-slate-600 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddRoom()}
                  placeholder="Weiteren Raum hinzufügen..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddRoom}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: TimeOut Raum */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Schritt 2: TimeOut-Raum</h2>
                <p className="text-xs text-slate-400">
                  Soll ein TimeOut-Raum erstellt werden? Dieser ermöglicht es Lehrpersonen, Schüler vorübergehend
                  auszusenden und einen Kommentar zu hinterlegen.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIncludeTimeout(true)}
                  className={`flex-1 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    includeTimeout
                      ? "bg-indigo-600/15 border-indigo-500/50 text-indigo-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  ✅ Ja, TimeOut-Raum erstellen
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeTimeout(false)}
                  className={`flex-1 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    !includeTimeout
                      ? "bg-rose-600/10 border-rose-500/40 text-rose-300"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  ❌ Nein, danke
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Bestätigung */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-white mb-1">Schritt 3: Bestätigung</h2>
                <p className="text-xs text-slate-400">
                  Folgende Räume werden angelegt:
                </p>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1.5">
                {rooms.map((r) => (
                  <div key={r} className="flex items-center gap-2 text-xs text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
                {includeTimeout && (
                  <div className="flex items-center gap-2 text-xs text-amber-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>TimeOut</span>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-800">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Zurück
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                disabled={rooms.length === 0}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Weiter
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={isLoading}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {isLoading ? "Wird erstellt..." : "Einrichtung abschließen"}
                {!isLoading && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
