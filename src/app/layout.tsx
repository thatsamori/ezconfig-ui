import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EZConfig UI",
  description: "Configuration interface for the ezconfig game mod",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
