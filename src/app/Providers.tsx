"use client";

import { NotesProvider } from "@/lib/notes/NotesContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return <NotesProvider>{children}</NotesProvider>;
}
