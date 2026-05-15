"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, User, Loader2, Sparkles } from "lucide-react";
import { getApiUrl } from "@/utils/apiDiscovery";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Anmeldedaten ungültig");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.user.requires_password_change) {
        router.replace("/change-password");
      } else {
        router.replace("/");
      }
    } catch (err: any) {
      setError(err.message || "Verbindung zum Server fehlgeschlagen");
    } finally {
      setIsLoading(false);
    }
  };

  const autofill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      {/* Background elegant gradient elements */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-8 h-8 text-white animate-soft" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Schulmanagement V2</h1>
          <p className="text-sm text-slate-400 mt-1">Raumbelegung Echtzeit-Belegung</p>
          <span className="inline-block mt-2 px-2.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-mono text-indigo-400">
            v2.1 (Gateway-Proxy)
          </span>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Benutzername
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <User className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                placeholder="z.B. da.messner"
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Passwort
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <KeyRound className="w-4 h-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-3 rounded-xl transition-all shadow-md shadow-indigo-600/20 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Anmelden...</span>
              </>
            ) : (
              <span>Dashboard öffnen</span>
            )}
          </button>
        </form>

        {/* Quick Demo Pre-fills */}
        <div className="mt-8 pt-6 border-t border-slate-800/80">
          <p className="text-xs font-medium text-slate-500 text-center mb-3">Schnellzugriff für Testzwecke:</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => autofill("da.messner", "admin")}
              type="button"
              className="bg-slate-950/40 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] py-1.5 rounded-lg transition-colors"
            >
              👑 Admin
            </button>
            <button
              onClick={() => autofill("teacher.one", "teacher")}
              type="button"
              className="bg-slate-950/40 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] py-1.5 rounded-lg transition-colors"
            >
              👩‍🏫 Lehrer 1
            </button>
            <button
              onClick={() => autofill("pupil_3g_1", "teacher")}
              type="button"
              className="bg-slate-950/40 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] py-1.5 rounded-lg transition-colors"
            >
              🌱 Schüler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
