"use client";
 
import { useState, useRef } from "react";
import { GraduationCap, Trash2, FileSpreadsheet, Download, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { fetchAuth } from "@/utils/fetchAuth";
import { getApiUrl } from "@/utils/apiDiscovery";
import { toast } from "sonner";
 
import { Pupil, SchoolClass } from "@/types";
 
interface PupilManagementProps {
  pupils: Pupil[];
  classes: SchoolClass[];
  newPupil: { full_name: string; class_id: string };
  setNewPupil: React.Dispatch<React.SetStateAction<{ full_name: string; class_id: string }>>;
  handleCreatePupil: (e: React.FormEvent) => void;
  handleDeletePupil: (id: number, name: string) => void;
  isLoading: boolean;
  refetch?: () => void;
}
 
export function PupilManagement({
  pupils,
  classes,
  newPupil,
  setNewPupil,
  handleCreatePupil,
  handleDeletePupil,
  isLoading,
  refetch
}: PupilManagementProps) {
  const [importLoading, setImportLoading] = useState(false);
  const [importResults, setImportResults] = useState<{ updated: number, errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
 
  const handleDownloadTemplate = async () => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/admin/import/template`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "roster_template.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Template Download fehlgeschlagen");
    }
  };
 
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
 
    const formData = new FormData();
    formData.append("file", file);
 
    setImportLoading(true);
    setImportResults(null);
 
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/admin/import/roster`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Import fehlgeschlagen");
      
      setImportResults(data);
      toast.success("Excel-Import abgeschlossen", { 
        description: `${data.updated} Schüler wurden Klassen zugeordnet.` 
      });
      if (refetch) refetch();
    } catch (err: any) {
      toast.error("Import fehlgeschlagen", { description: err.message });
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
 
  const handleManualAssign = async (pupilId: number, classId: string) => {
    try {
      await fetchAuth(`/api/admin/pupils/${pupilId}/assign`, {
        method: "POST",
        body: JSON.stringify({ class_id: classId ? Number(classId) : null })
      });
      toast.success("Klasse aktualisiert");
      if (refetch) refetch();
    } catch (err) {
      toast.error("Zuordnung fehlgeschlagen");
    }
  };
 
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* EXCEL IMPORT SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Excel Klassen-Import</h2>
          </div>
          <button 
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white transition-colors"
          >
            <Download className="w-3 h-3" />
            Vorlage herunterladen
          </button>
        </div>
        <div className="p-6">
          <p className="text-xs text-slate-400 mb-4">
            Lade eine Excel-Datei hoch, um Schüler basierend auf ihrem Namen automatisch Klassen zuzuordnen. 
            Die Schüler müssen bereits via WebUntis im System existieren.
          </p>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl text-xs transition-all disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              {importLoading ? "Verarbeite..." : "Excel-Datei auswählen"}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              accept=".xlsx" 
              className="hidden" 
            />
          </div>
 
          {importResults && (
            <div className="mt-4 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>{importResults.updated} Zuordnungen erfolgreich aktualisiert.</span>
              </div>
              {importResults.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase mt-2">
                    <AlertCircle className="w-3 h-3" />
                    <span>Hinweise / Fehler ({importResults.errors.length}):</span>
                  </div>
                  <div className="max-h-32 overflow-y-auto text-[10px] text-slate-500 font-mono bg-black/20 p-2 rounded">
                    {importResults.errors.map((err, idx) => (
                      <div key={idx}>{err}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
 
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Einzel-Aufnahme (Manuell)</h2>
        </div>
        <form onSubmit={handleCreatePupil} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Name des Schülers</label>
            <input
              type="text"
              value={newPupil.full_name}
              onChange={(e) => setNewPupil({ ...newPupil, full_name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Vorname Nachname"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase px-1">Stammklasse</label>
            <select
              value={newPupil.class_id}
              onChange={(e) => setNewPupil({ ...newPupil, class_id: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              required
            >
              <option value="">-- Keine Klasse --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Klasse {c.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 text-sm"
          >
            Schüler registrieren
          </button>
        </form>
      </div>
 
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Registrierte Schüler & Zuordnung</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">Name</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-center">Klasse (Manuell ändern)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-center">Login (ID)</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {pupils.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-sm font-bold text-slate-200">{p.name}</td>
                  <td className="px-6 py-4 text-center min-w-[180px]">
                    <select
                      value={p.class_id || ""}
                      onChange={(e) => handleManualAssign(p.id, e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-indigo-400 font-bold focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Keine Klasse</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-center text-[11px] font-mono text-slate-500">{p.username}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDeletePupil(p.id, p.name)}
                      className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-all"
                      title="Schüler abmelden"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
