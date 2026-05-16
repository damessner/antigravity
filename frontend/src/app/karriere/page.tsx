"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Trophy, TrendingUp, AlertTriangle, Lightbulb, Users, ArrowLeft, Star, Target, Crown 
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

interface DashboardData {
  classes: ClassStat[];
  topPupils: TopPupil[];
  risingStars: RisingStar[];
  supportNeeded: TopPupil[];
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="max-w-7xl mx-auto mb-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/")}
            className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Star className="w-8 h-8 text-amber-400" />
              Karriere-Dashboard
            </h1>
            <p className="text-slate-500 text-sm font-medium">Performance-Analysen & Schulweite Einblicke</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Rankings */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Class Overview Grid */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data?.classes.slice(0, 3).map((c, idx) => (
              <div key={c.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Crown className="w-12 h-12 text-white" />
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Rank #{idx+1} Klasse</p>
                <h2 className="text-4xl font-black text-white mb-2">{c.name}</h2>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Notenschnitt</p>
                    <p className="text-xl font-bold text-indigo-400">{Number(c.avg_grade).toFixed(2)}</p>
                  </div>
                  <div className="w-px h-8 bg-slate-800" />
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Schüler</p>
                    <p className="text-xl font-bold text-slate-300">{c.pupil_count}</p>
                  </div>
                </div>
              </div>
            ))}
          </section>

          {/* Top Pupils Table */}
          <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl shadow-indigo-500/5">
            <div className="px-8 py-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Schulweite Top-Performer
              </h3>
            </div>
            <div className="p-2">
              <table className="w-full text-left border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] font-bold text-slate-500 uppercase">
                    <th className="px-6 py-2">Pupil</th>
                    <th className="px-6 py-2">Klasse</th>
                    <th className="px-6 py-2 text-right">Schnitt</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.topPupils.map((p, idx) => (
                    <tr key={idx} className="bg-slate-950/50 hover:bg-slate-800/50 transition-all group">
                      <td className="px-6 py-4 rounded-l-2xl">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 flex items-center justify-center bg-slate-900 rounded-full text-[10px] font-black text-slate-500">
                            {idx + 1}
                          </span>
                          <span className="text-sm font-bold text-slate-200 group-hover:text-white">{p.full_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">{p.class_name}</td>
                      <td className="px-6 py-4 text-right rounded-r-2xl font-black text-indigo-400">{Number(p.avg_grade).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

        </div>

        {/* Right Column: Insights & Alerts */}
        <div className="space-y-6">
          
          {/* Rising Stars */}
          <section className="bg-gradient-to-br from-indigo-900/20 to-slate-900 border border-indigo-500/20 p-6 rounded-3xl">
            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Rising Stars
            </h3>
            <div className="space-y-4">
              {data?.risingStars.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                  <div>
                    <p className="text-sm font-bold text-slate-200">{s.full_name}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{s.class_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase">Verbesserung</p>
                    <p className="text-sm font-black text-emerald-400">+{Number(s.improvement).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Support Radar */}
          <section className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-3xl">
            <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Support Radar
            </h3>
            <div className="space-y-4">
              {data?.supportNeeded.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-950/50 rounded-2xl">
                  <div>
                    <p className="text-sm font-bold text-slate-300">{p.full_name}</p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{p.class_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-rose-400">{Number(p.avg_grade).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Fun Insights */}
          <section className="bg-amber-500/5 border border-amber-500/10 p-6 rounded-3xl">
            <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Lightbulb className="w-4 h-4" />
              Fun Insights
            </h3>
            <div className="space-y-4">
              {data?.insights.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Noch keine Einblicke generiert. Der Sync läuft...</p>
              ) : (
                data?.insights.map((i, idx) => (
                  <div key={idx} className="space-y-1">
                    <p className="text-xs font-bold text-amber-200">{i.title}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{i.content}</p>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
