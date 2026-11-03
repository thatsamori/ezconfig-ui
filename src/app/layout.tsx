import type { Metadata } from "next";
import { connection } from "next/server";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "EZConfig",
  description: "Game configuration management",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Every page renders per request, so Next.js can put the request's CSP nonce on its scripts (src/proxy.ts).
  await connection();
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
        <Toaster theme="dark" position="bottom-right" offset={{ bottom: '96px', right: '24px' }} toastOptions={{ style: { background: '#1a1b1f', color: '#f2f2f3', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '12px 16px', fontFamily: 'DM Sans, sans-serif', fontSize: 13 } }} icons={{ success: <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#5fcf8c' }} /> }} />
      </body>
    </html>
  );
}
