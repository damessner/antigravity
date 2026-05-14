"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, BellRing, Smartphone, ShieldCheck, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";

interface UserPreferences {
  notify_help_requests: boolean;
  notify_timers: boolean;
  notify_system: boolean;
}

// Convert VAPID key standard base64 URL format to binary array buffer
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function ProfilePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>({
    notify_help_requests: true,
    notify_timers: true,
    notify_system: true
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isIOSStandaloneWarning, setIsIOSStandaloneWarning] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      router.replace("/login");
      return;
    }
    const parsedUser = JSON.parse(userStr);
    setCurrentUser(parsedUser);

    // Evaluate potential target WebKit/iOS wrapper layout conditions
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = ('standalone' in navigator) && (navigator as any).standalone;
    if (isIOS && !isStandalone) {
      setIsIOSStandaloneWarning(true);
    }

    fetchPreferences();
  }, [router]);

  const fetchPreferences = async () => {
    setIsLoading(true);
    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/users/preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences({
          notify_help_requests: data.notify_help_requests ?? true,
          notify_timers: data.notify_timers ?? true,
          notify_system: data.notify_system ?? true
        });
      }
    } catch (err) {
      console.error("Fetch profile notification preferences failure:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePreference = async (keyTarget: keyof UserPreferences) => {
    const nextState = { ...preferences, [keyTarget]: !preferences[keyTarget] };
    setPreferences(nextState); // Optimistic immediate flip

    const token = localStorage.getItem("token");
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    try {
      const res = await fetch(`${apiUrl}/api/users/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(nextState)
      });
      if (!res.ok) {
        throw new Error("Fehler beim Synchronisieren der Einstellung");
      }
    } catch (err) {
      // Revert cache state on server sync block exception
      setPreferences(preferences);
      setStatusMessage({ type: "error", text: "Einstellung konnte nicht synchronisiert werden." });
    }
  };

  // Device service worker setup triggering runtime remote Push API Subscriptions
  const handleEnableDevicePush = async () => {
    setStatusMessage(null);
    setIsSubscribing(true);

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error("Push-Benachrichtigungen werden von diesem Browser nicht unterstützt.");
      }

      // Request underlying platform level OS permissions
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error("Berechtigung für Benachrichtigungen wurde vom Benutzer verweigert.");
      }

      // Ensure local Service Worker registration scope state
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Securely fetch application VAPID operational target key
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      
      const vapidRes = await fetch(`${apiUrl}/api/push/vapid-public-key`);
      if (!vapidRes.ok) throw new Error("Konnte öffentlichen Push-Schlüssel nicht vom Server abrufen.");
      const { publicKey } = await vapidRes.json();

      const convertedVapidKey = urlBase64ToUint8Array(publicKey);

      // Invoke internal subscription pipeline execution
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      // Transmit generated token parameters directly to target endpoint routing
      const subRes = await fetch(`${apiUrl}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(subscription)
      });

      if (!subRes.ok) {
        throw new Error("Fehler beim Verknüpfen der Subscription mit dem Profil.");
      }

      setStatusMessage({ 
        type: "success", 
        text: "Hervorragend! Push-Benachrichtigungen sind für dieses Gerät jetzt aktiv." 
      });

    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Unbekannter Systemfehler aufgetreten." });
    } finally {
      setIsSubscribing(false);
    }
  };

  const roleLabel = currentUser?.role === "admin" ? "Administrator" : currentUser?.role === "teacher" ? "Lehrperson" : "Schüler";
  const isStaff = currentUser?.role === "admin" || currentUser?.role === "teacher";

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 animate-fadeIn duration-200">
      
      <div className="max-w-3xl mx-auto w-full space-y-6">
        
        {/* Navigation Toolbar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Zurück zum Dashboard</span>
          </button>

          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {roleLabel}
          </span>
        </div>

        {/* Profile Card Summary Banner */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-7 h-7 text-indigo-400" />
            </div>

            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                {currentUser?.full_name || "Benutzerprofil"}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Verwalte deine geräteübergreifenden Benachrichtigungskanäle und PWA-Abonnements.
              </p>
            </div>
          </div>
        </div>

        {statusMessage && (
          <div className={`p-4 rounded-xl border text-xs flex items-center gap-3 animate-fadeIn ${
            statusMessage.type === "success" 
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" 
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}>
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            )}
            <div className="flex-1 font-medium">{statusMessage.text}</div>
          </div>
        )}

        {/* SECTION: CATEGORY TOGGLE SWITCHES */}
        <div className="space-y-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800/80">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Benachrichtigungskategorien</h2>
            </div>

            {isLoading && (
              <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
            )}
          </div>

          <div className="space-y-4 pt-2">
            
            {/* Toggle 1: Live-Hilfe Anfragen (Teachers/Admins) */}
            {isStaff && (
              <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-950/40 border border-slate-800/40">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">Live-Hilfe Anfragen</span>
                  <span className="text-[11px] text-slate-500 block">Mitteilung bei Eintreffen neuer Schülerrufe.</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleTogglePreference("notify_help_requests")}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer shrink-0 ${
                    preferences.notify_help_requests ? "bg-indigo-600" : "bg-slate-800"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full bg-white block transition-transform shadow-xs ${
                    preferences.notify_help_requests ? "translate-x-5" : "translate-x-0"
                  }`} />
                </button>
              </div>
            )}

            {/* Toggle 2: Abgelaufene Timer (All roles) */}
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-950/40 border border-slate-800/40">
              <div>
                <span className="text-xs font-bold text-slate-200 block">Abgelaufene Timer</span>
                <span className="text-[11px] text-slate-500 block">Akustischer oder visueller Alarm bei Zeitablauf.</span>
              </div>

              <button
                type="button"
                onClick={() => handleTogglePreference("notify_timers")}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer shrink-0 ${
                  preferences.notify_timers ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <span className={`w-5 h-5 rounded-full bg-white block transition-transform shadow-xs ${
                  preferences.notify_timers ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </div>

            {/* Toggle 3: Systemnachrichten (All roles) */}
            <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-slate-950/40 border border-slate-800/40">
              <div>
                <span className="text-xs font-bold text-slate-200 block">Systemnachrichten</span>
                <span className="text-[11px] text-slate-500 block">Wichtige Ankündigungen der Schulleitung & Backups.</span>
              </div>

              <button
                type="button"
                onClick={() => handleTogglePreference("notify_system")}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer shrink-0 ${
                  preferences.notify_system ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <span className={`w-5 h-5 rounded-full bg-white block transition-transform shadow-xs ${
                  preferences.notify_system ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
            </div>

          </div>
        </div>

        {/* SECTION: DEVICE SUBSCRIPTION MECHANICS */}
        <div className="space-y-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800/80">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">PWA & Geräte-Aktivierung</h2>
          </div>

          <div className="space-y-3 pt-1">
            <p className="text-xs text-slate-400 leading-relaxed">
              Verknüpfe diesen aktuellen Browser oder dein Mobilgerät als autorisierten Endpunkt. So erreichen dich delegierte Alerts auch im geschlossenen Zustand zuverlässig.
            </p>

            <button
              type="button"
              onClick={handleEnableDevicePush}
              disabled={isSubscribing}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 mt-2 cursor-pointer"
            >
              <BellRing className={`w-4 h-4 ${isSubscribing ? "animate-spin" : ""}`} />
              <span>Push-Benachrichtigungen auf diesem Gerät aktivieren</span>
            </button>

            {/* Target iPadOS / iOS explicit sharing tooltips banner */}
            {isIOSStandaloneWarning && (
              <div className="mt-3 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-300 text-[11px] flex items-start gap-2.5 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-0.5">
                  <strong className="font-bold block">Auf dem iPad / iPhone:</strong>
                  <span>Bitte tippe in Safari auf das Symbol <strong>&apos;Teilen&apos;</strong> und wähle <strong>&apos;Zum Home-Bildschirm hinzufügen&apos;</strong>, um Mitteilungen im Hintergrund restlos freizuschalten.</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
