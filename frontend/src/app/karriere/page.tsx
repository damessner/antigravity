"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { 
  Trophy, TrendingUp, AlertTriangle, Lightbulb, Users, ArrowLeft, Star, Target, Crown, CheckCircle,
  BarChart3, BookOpen, Award, Zap, Activity
} from "lucide-react";
import { fetchAuth } from "@/utils/fetchAuth";
import { toast } from "sonner";

interface ClassStat {
  id: number;
  name: string;
  avg_grade: number;
  pupil_count: number;
}

interface TopPupil {
  full_name: string;
  class_name: string;
  avg_grade: number;
}

interface RisingStar {
  full_name: string;
  class_name: string;
  improvement: number;
}

interface ActiveParticipator {
  full_name: string;
  class_name: string;
  active_count: number;
}

interface RecentAchievement {
  full_name: string;
  title: string;
  created_at: string;
}

interface DashboardData {
  classes: ClassStat[];
  topPupils: TopPupil[];
  risingStars: RisingStar[];
  supportNeeded: TopPupil[];
  activeParticipators: ActiveParticipator[];
  recentAchievements: RecentAchievement[];
  insights: { title: string; content: string; category: string }[];
}

export default function KarriereDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: dashData } = await fetchAuth("/api/karriere/dashboard");
        setData(dashData);
      } catch (err) {
        toast.error("Dashboard-Daten konnten nicht geladen werden");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const computedInsights = useMemo(() => {
    if (!data) return [];
    const classes = data.classes;
    const topPupils = data.topPupils;
    const supportNeeded = data.supportNeeded;
    const risingStars = data.risingStars;
    const activeParticipators = data.activeParticipators;
    const achievements = data.recentAchievements;

    const totalPupils = classes.reduce((s, c) => s + Number(c.pupil_count), 0);
    const schoolAvg = classes.length
      ? classes.reduce((s, c) => s + Number(c.avg_grade), 0) / classes.length
      : 0;
    const bestClass = classes.length ? [...classes].sort((a, b) => Number(a.avg_grade) - Number(b.avg_grade))[0] : null;
    const worstClass = classes.length ? [...classes].sort((a, b) => Number(b.avg_grade) - Number(a.avg_grade))[0] : null;
    const topStudent = topPupils.length ? topPupils[0] : null;
    const topRiser = risingStars.length ? risingStars[0] : null;
    const topParticipator = activeParticipators.length ? activeParticipators[0] : null;
    const supportCount = supportNeeded.length;
    const excellentClasses = classes.filter((c) => Number(c.avg_grade) <= 2).length;
    const criticalClasses = classes.filter((c) => Number(c.avg_grade) >= 4).length;
    const avgImprovement = risingStars.length
      ? risingStars.reduce((s, r) => s + Number(r.improvement), 0) / risingStars.length
      : 0;

    return [
      {
        title: "Schulweiter Notenschnitt",
        value: schoolAvg.toFixed(2),
        sub: "Durchschnitt aller Klassen (1=SG, 5=NG)",
        color: "indigo",
        icon: "📊",
      },
      {
        title: "Gesamtanzahl Schüler",
        value: String(totalPupils),
        sub: `in ${classes.length} aktiven Klassen`,
        color: "blue",
        icon: "👥",
      },
      {
        title: "Beste Klasse",
        value: bestClass?.name || "—",
        sub: bestClass ? `Ø ${Number(bestClass.avg_grade).toFixed(2)}` : "Keine Daten",
        color: "emerald",
        icon: "🏆",
      },
      {
        title: "Klasse mit Aufholbedarf",
        value: worstClass?.name || "—",
        sub: worstClass ? `Ø ${Number(worstClass.avg_grade).toFixed(2)}` : "Keine Daten",
        color: "rose",
        icon: "⚠️",
      },
      {
        title: "Top-Schüler (Schulweit)",
        value: topStudent?.full_name || "—",
        sub: topStudent ? `${topStudent.class_name} · Ø ${Number(topStudent.avg_grade).toFixed(2)}` : "Keine Daten",
        color: "amber",
        icon: "👑",
      },
      {
        title: "Schüler mit Förderantrag",
        value: String(supportCount),
        sub: "Durchschnittsnote ≥ 4.0",
        color: "rose",
        icon: "🆘",
      },
      {
        title: "Größter Aufsteiger",
        value: topRiser?.full_name || "—",
        sub: topRiser ? `+${Number(topRiser.improvement).toFixed(2)} Verbesserung (30 Tage)` : "Keine Daten",
        color: "emerald",
        icon: "🚀",
      },
      {
        title: "Ø-Verbesserung (Rising Stars)",
        value: risingStars.length ? `+${avgImprovement.toFixed(2)}` : "—",
        sub: `über ${risingStars.length} aufsteigende Schüler`,
        color: "cyan",
        icon: "📈",
      },
      {
        title: "Engagiertester Schüler",
        value: topParticipator?.full_name || "—",
        sub: topParticipator ? `${topParticipator.active_count}× ausgezeichnete Mitarbeit` : "Keine Daten",
        color: "violet",
        icon: "⚡",
      },
      {
        title: "Klassen im Exzellenzbereich",
        value: String(excellentClasses),
        sub: "Klassenø ≤ 2.0 (sehr gut)",
        color: "emerald",
        icon: "⭐",
      },
      {
        title: "Klassen im Kritischen Bereich",
        value: String(criticalClasses),
        sub: "Klassenø ≥ 4.0 (Handlungsbedarf)",
        color: "rose",
        icon: "🔴",
      },
      {
        title: "Jüngste Achievements",
        value: String(achievements.length),
        sub: achievements.length ? `Zuletzt: "${achievements[0]?.title}"` : "Keine Achievements",
        color: "amber",
        icon: "🎖️",
      },
      {
        title: "Top 3 Schüler — Platz 2",
        value: topPupils[1]?.full_name || "—",
        sub: topPupils[1] ? `${topPupils[1].class_name} · Ø ${Number(topPupils[1].avg_grade).toFixed(2)}` : "Keine Daten",
        color: "slate",
        icon: "🥈",
      },
      {
        title: "Top 3 Schüler — Platz 3",
        value: topPupils[2]?.full_name || "—",
        sub: topPupils[2] ? `${topPupils[2].class_name} · Ø ${Number(topPupils[2].avg_grade).toFixed(2)}` : "Keine Daten",
        color: "slate",
        icon: "🥉",
      },
      {
        title: "Rising Star #2",
        value: risingStars[1]?.full_name || "—",
        sub: risingStars[1] ? `+${Number(risingStars[1].improvement).toFixed(2)} · ${risingStars[1].class_name}` : "Keine weiteren",
        color: "cyan",
        icon: "🌟",
      },
      {
        title: "Engagement Leader #2",
        value: activeParticipators[1]?.full_name || "—",
        sub: activeParticipators[1] ? `${activeParticipators[1].active_count}× · ${activeParticipators[1].class_name}` : "Keine weiteren",
        color: "violet",
        icon: "💎",
      },
      {
        title: "Schüler über Schul-Ø",
        value: topPupils.filter((p) => Number(p.avg_grade) < schoolAvg).length > 0
          ? String(topPupils.filter((p) => Number(p.avg_grade) < schoolAvg).length)
          : "0",
        sub: "von erfassten Top-Schülern",
        color: "blue",
        icon: "📉",
      },
      {
        title: "Klassen mit Besser als Schulø",
        value: String(classes.filter((c) => Number(c.avg_grade) < schoolAvg).length),
        sub: `von ${classes.length} Klassen`,
        color: "indigo",
        icon: "🏫",
      },
      {
        title: "Klassen mit SDL-Fokus",
        value: "—",
        sub: "Detailauswertung im Notenbuch",
        color: "slate",
        icon: "🧭",
      },
      {
        title: "Systemstatus",
        value: "✅ Online",
        sub: "Alle Daten aktuell und synchronisiert",
        color: "emerald",
        icon: "🛰️",
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Trophy className="w-12 h-12 text-indigo-500 animate-bounce" />
          <p className="text-slate-400 font-bold tracking-widest uppercase text-xs">Initialisiere Karriere-Matrix...</p>
        </div>
      </div>
    );
  }

  const colorMap: Record<string, string> = {
    indigo: "border-indigo-500/30 bg-indigo-500/5",
    blue: "border-blue-500/30 bg-blue-500/5",
    emerald: "border-emerald-500/30 bg-emerald-500/5",
    rose: "border-rose-500/30 bg-rose-500/5",
    amber: "border-amber-500/30 bg-amber-500/5",
    cyan: "border-cyan-500/30 bg-cyan-500/5",
    violet: "border-violet-500/30 bg-violet-500/5",
    slate: "border-slate-700/40 bg-slate-800/20",
  };
  const textColorMap: Record<string, string> = {
    indigo: "text-indigo-300",
    blue: "text-blue-300",
    emerald: "text-emerald-300",
    rose: "text-rose-300",
    amber: "text-amber-300",
    cyan: "text-cyan-300",
    violet: "text-violet-300",
    slate: "text-slate-400",
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 p-6 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-500/10 blur-[100px] rounded-full" />
        <div className="absolute -bottom-[10%] left-[20%] w-[35%] h-[35%] bg-purple-500/10 blur-[120px] rounded-full" />
      </div>

      <header className="max-w-7xl mx-auto mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => router.push("/")}
            className="group p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all duration-300 backdrop-blur-md"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:-translate-x-1 transition-all" />
          </button>
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-slate-400 flex items-center gap-3">
              <Star className="w-8 h-8 text-amber-400 animate-pulse" />
              MISSION CONTROL
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-black rounded-full border border-emerald-500/20">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                SYSTEM ONLINE
              </span>
               <p className="text-slate-500 text-xs font-mono tracking-widest uppercase opacity-80">Sector: Karriere-Matrix v3.0</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-3xl">
          <div className="text-right hidden sm:block">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Active Fleet</p>
            <p className="text-sm font-black text-white">{data?.classes.length} Classes</p>
          </div>
          <div className="w-px h-8 bg-white/10 mx-2 hidden sm:block" />
          <div className="text-right">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Global Avg</p>
            <p className="text-sm font-black text-indigo-400">
              {data?.classes.length 
                ? (data.classes.reduce((acc, c) => acc + Number(c.avg_grade), 0) / data.classes.length).toFixed(2)
                : "0.00"}
            </p>
          </div>
          <Users className="w-10 h-10 text-slate-700 ml-2" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-10 relative z-10">

        {/* ── INSIGHTS COCKPIT (20 Cards) ── */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Pädagogisches Insights-Cockpit</h2>
            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-black rounded-full border border-indigo-500/20">
              20 INSIGHTS
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {computedInsights.map((insight, idx) => (
              <div
                key={idx}
                className={`rounded-2xl border backdrop-blur-sm px-4 py-3 transition-all hover:-translate-y-0.5 ${colorMap[insight.color] || colorMap.slate}`}
              >
                <div className={`text-xs font-bold mb-1 flex items-center gap-1.5 ${textColorMap[insight.color] || textColorMap.slate}`}>
                  <span>{insight.icon}</span>
                  <span className="truncate">{insight.title}</span>
                </div>
                <div className="text-base text-white font-black truncate">{insight.value}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{insight.sub}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Strategic Overview */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Top Class Command Cards */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {data?.classes.slice(0, 3).map((c, idx) => (
                <div 
                  key={c.id} 
                  className={`relative overflow-hidden group p-6 rounded-[2.5rem] border backdrop-blur-2xl transition-all duration-500 hover:-translate-y-2
                    ${idx === 0 ? "bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_40px_-15px_rgba(99,102,241,0.3)]" : "bg-white/5 border-white/10"}`}
                >
                  <div className={`absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity duration-700
                    ${idx === 0 ? "text-indigo-400" : "text-white"}`}>
                    <Crown className="w-20 h-20 rotate-12" />
                  </div>
                  
                  <div className="relative z-10">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border mb-4 inline-block
                      ${idx === 0 ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-white/5 text-slate-500 border-white/10"}`}>
                      Elite Tier Rank #{idx+1}
                    </span>
                    <h2 className="text-5xl font-black text-white mb-6 tracking-tighter">{c.name}</h2>
                    
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mb-1">Performance Index</p>
                        <p className={`text-3xl font-black ${idx === 0 ? "text-indigo-400" : "text-white/80"}`}>
                          {Number(c.avg_grade).toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mb-1">Crew Size</p>
                        <p className="text-xl font-bold text-slate-400">{c.pupil_count}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 delay-300 ${idx === 0 ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" : "bg-slate-700"}`}
                      style={{ width: `${Math.max(20, 100 - (Number(c.avg_grade) * 20))}%` }}
                    />
                  </div>
                </div>
              ))}
            </section>

            {/* Top Performer Matrix */}
            <section className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="px-8 py-8 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-amber-500" />
                    TOP PILOTS LEADERBOARD
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">School-wide academic excellence ranking</p>
                </div>
                <div className="px-3 py-1 bg-white/5 rounded-full border border-white/5 text-[10px] font-mono text-slate-400">
                  Sorted by: Grade Average ASC
                </div>
              </div>
              <div className="p-4">
                <table className="w-full text-left border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                      <th className="px-8 py-2">Pilot</th>
                      <th className="px-8 py-2">Fleet Sector</th>
                      <th className="px-8 py-2 text-right">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.topPupils.map((p, idx) => (
                      <tr key={idx} className="group bg-white/[0.03] hover:bg-white/[0.08] transition-all duration-300">
                        <td className="px-8 py-5 rounded-l-3xl">
                          <div className="flex items-center gap-4">
                            <span className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black transition-colors
                              ${idx < 3 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-slate-900 text-slate-500 border border-white/5"}`}>
                              {idx + 1}
                            </span>
                            <span className="text-sm font-black text-slate-200 group-hover:text-white transition-colors tracking-tight">
                              {p.full_name}
                              {Number(p.avg_grade) <= 1.5 ? " 👑" : Number(p.avg_grade) <= 2.5 ? " 🛠️" : " 🌱"}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="px-3 py-1 bg-white/5 rounded-lg text-[10px] font-black text-slate-400 uppercase tracking-widest border border-white/5 group-hover:border-white/10 transition-colors">
                            {p.class_name}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right rounded-r-3xl">
                          <span className="text-base font-black text-indigo-400 group-hover:text-indigo-300 group-hover:drop-shadow-[0_0_8px_rgba(129,140,248,0.5)] transition-all">
                            {Number(p.avg_grade).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Active Participation Grid */}
            <section className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="px-8 py-8 border-b border-white/5 bg-white/[0.02]">
                <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                  <Target className="w-6 h-6 text-cyan-400" />
                  ENGAGEMENT RADAR
                </h3>
                <p className="text-xs text-slate-500 font-medium">Most active student contributions across all subjects</p>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                {data?.activeParticipators.map((p, idx) => (
                  <div key={idx} className="group bg-white/[0.03] p-5 rounded-3xl border border-white/5 hover:border-cyan-500/30 transition-all duration-300">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                        <Target className="w-5 h-5" />
                      </div>
                      <span className="text-2xl font-black text-cyan-400 group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] transition-all">
                        {p.active_count}
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-200 tracking-tight leading-tight">{p.full_name}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">{p.class_name}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right Column: Mission Logs & Comms */}
          <div className="lg:col-span-4 space-y-8">
            
            {/* Mission Intel Feed */}
            <section className="bg-[#0f172a] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  MISSION INTEL FEED
                </h3>
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Rising Stars Mini-Section */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Velocity Trajectory: High</p>
                  {data?.risingStars.map((s, idx) => (
                    <div key={idx} className="group flex items-center justify-between p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/5 hover:border-emerald-500/20 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                        <div>
                          <p className="text-sm font-black text-slate-200 tracking-tight">{s.full_name}</p>
                          <p className="text-[9px] font-bold text-slate-600 uppercase">{s.class_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-emerald-400 group-hover:scale-110 transition-transform">
                          ↑{Number(s.improvement).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Achievements Feed */}
                <div className="space-y-3 pt-6 border-t border-white/5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Achievements Decrypted</p>
                  <div className="space-y-3 font-mono">
                    {data?.recentAchievements.map((a, idx) => (
                      <div key={idx} className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 text-[11px] relative overflow-hidden group">
                        <div className="absolute inset-0 bg-indigo-500/5 translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
                        <div className="relative z-10">
                          <span className="text-indigo-400 mr-2">[{new Date(a.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}]</span>
                          <span className="text-slate-300 font-bold">{a.full_name}</span>
                          <span className="text-slate-500 mx-1">unlocked</span>
                          <span className="text-amber-400 font-bold">&ldquo;{a.title}&rdquo;</span>
                        </div>
                      </div>
                    ))}
                    {data?.recentAchievements.length === 0 && (
                      <p className="text-xs text-slate-600 italic font-sans py-2 text-center">Scanning for milestones...</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Support Radar (Action Required) */}
            <section className="bg-rose-500/[0.02] backdrop-blur-xl border border-rose-500/10 p-8 rounded-[2.5rem]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 animate-bounce" />
                  SUPPORT RADAR
                </h3>
                <span className="text-[9px] font-black text-rose-500/50 uppercase">Urgent Intervention</span>
              </div>
              <div className="space-y-3">
                {data?.supportNeeded.map((p, idx) => (
                  <div key={idx} className="group flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-rose-500/30 transition-all cursor-help">
                    <div>
                      <p className="text-sm font-black text-slate-200 tracking-tight">{p.full_name}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">{p.class_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black text-rose-400 group-hover:scale-110 transition-transform">{Number(p.avg_grade).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {data?.supportNeeded.length === 0 && (
                  <div className="text-center py-6">
                    <CheckCircle className="w-8 h-8 text-emerald-500/20 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">All pilots within safe parameters.</p>
                  </div>
                )}
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
