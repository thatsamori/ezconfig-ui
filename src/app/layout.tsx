import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "EZConfig",
  description: "Game configuration management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
        </Providers>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
