"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TeacherDashboard from "@/components/TeacherDashboard";

export default function HomePage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const userStr = typeof window !== "undefined" ? localStorage.getItem("user") : null;

    if (!token || !userStr) {
      router.replace("/login");
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (user.requires_password_change) {
        router.replace("/change-password");
        return;
      }

      // Check if initial setup is needed (rooms table empty)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      fetch(`${apiUrl}/api/setup/status`)
        .then((res) => res.json())
        .then((data) => {
          if (data.needsSetup) {
            router.replace("/setup");
          } else {
            setIsAuthenticated(true);
          }
        })
        .catch((err) => {
          // If check fails, proceed to dashboard anyway
          console.warn('Setup status check failed:', err);
          setIsAuthenticated(true);
        })
        .finally(() => setIsLoading(false));
    } catch (e) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      router.replace("/login");
    }
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <p className="text-slate-400 font-medium animate-pulse">Lade Schul-Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <TeacherDashboard />;
}
