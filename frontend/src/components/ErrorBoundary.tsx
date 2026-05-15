"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-rose-500" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Hoppla! Etwas ist schiefgelaufen.</h1>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              Ein unerwarteter Fehler ist aufgetreten. Die Anwendung musste unterbrochen werden.
            </p>
            <div className="bg-slate-950 rounded-xl p-4 mb-8 text-left border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Fehlermeldung</p>
              <p className="text-xs font-mono text-rose-400 break-words">
                {this.state.error?.message || "Unbekannter Fehler"}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Anwendung neu laden</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
