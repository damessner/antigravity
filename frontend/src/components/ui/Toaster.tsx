"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-slate-900 group-[.toaster]:text-slate-100 group-[.toaster]:border-slate-800 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-slate-400",
          actionButton:
            "group-[.toast]:bg-indigo-600 group-[.toast]:text-white group-[.toast]:rounded-lg",
          cancelButton:
            "group-[.toast]:bg-slate-800 group-[.toast]:text-slate-400 group-[.toast]:rounded-lg",
          success: "group-[.toast]:text-emerald-400 group-[.toast]:border-emerald-500/20",
          error: "group-[.toast]:text-rose-400 group-[.toast]:border-rose-500/20",
          info: "group-[.toast]:text-indigo-400 group-[.toast]:border-indigo-500/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
