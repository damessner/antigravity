"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { getApiUrl } from "@/utils/apiDiscovery";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;
    if (!userStr) {
      router.replace("/login");
      return;
    }
    setUser(JSON.parse(userStr));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Die neuen Passwörter stimmen nicht überein");
      return;
    }

    if (newPassword.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein");
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const res = await fetch(`${apiUrl}/api/users/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Aktualisieren des Passworts");
      }

      // Update stored user details
      if (user) {
        const updatedUser = { ...user, requires_password_change: false };
        localStorage.setItem("user", JSON.stringify(updatedUser));
      }

      setSuccess(true);
      setTimeout(() => {
        router.replace("/");
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Es ist ein unerwarteter Fehler aufgetreten");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative">
      <div className="absolute top-1/3 right-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 relative z-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-3 text-amber-500">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Passwortänderung erforderlich</h1>
          <p className="text-xs text-slate-400 mt-1">
            Bitte setzen Sie ein persönliches Passwort für Ihr Konto.
          </p>
        </div>

        {success ? (
          <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center flex flex-col items-center gap-3">
            <ShieldCheck className="w-10 h-10 text-emerald-400 animate-bounce" />
            <p className="text-emerald-300 font-medium text-sm">Passwort erfolgreich geändert!</p>
            <p className="text-xs text-slate-400">Weiterleitung zum Dashboard...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Aktuelles Passwort
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Neues Passwort
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2 px-4 text-white text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Neues Passwort bestätigen
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                placeholder="Passwort wiederholen"
                className="w-full bg-slate-950/60 border border-slate-800 rounded-xl py-2 px-4 text-white text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Wird gespeichert...</span>
                </>
              ) : (
                <span>Passwort festlegen</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
