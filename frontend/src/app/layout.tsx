import type { Metadata, Viewport } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { Toaster } from "@/components/ui/Toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "School Management System | Live Dashboard",
  description: "Echtzeit-Raumbelegung, Evaluationsbereich und Disziplinäre Notizen für die MS Weissenbach Telfs.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="bg-slate-950 text-slate-100 font-sans antialiased min-h-screen">
        <QueryProvider>
          <ErrorBoundary>
            {children}
            <Toaster richColors closeButton position="top-right" />
          </ErrorBoundary>
        </QueryProvider>
      </body>
    </html>
  );
}
