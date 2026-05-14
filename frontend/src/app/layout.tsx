import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "School Management System | Live Dashboard",
  description: "Echtzeit-Raumbelegung, Curriculares Notenbuch und Disziplinäre Notizen für österreichische Mittelschulen.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
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
        {children}
      </body>
    </html>
  );
}
