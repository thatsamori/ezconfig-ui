"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { KeyNotes, NotesByKey } from "@/lib/platform/notes";

interface NotesContextValue {
  /** Every Note shown, once loaded; null before. */
  notes: NotesByKey | null;
  /** Loads every Note the first time it is called; later calls share that load. */
  load: () => Promise<void>;
  /** Loads every Note again, for others' newest. */
  refresh: () => Promise<void>;
  /** Replaces one key's Notes with what a change returned. */
  replaceKey: (change: KeyNotes) => void;
}

const NotesContext = createContext<NotesContextValue | null>(null);

/** The platform's Notes for the editor: one load for every row, then each change's answer. */
export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<NotesByKey | null>(null);
  const loading = useRef<Promise<void> | null>(null);

  const fetchNotes = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/notes", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) return false;
      setNotes(result.data);
      return true;
    } catch {
      return false;
    }
  }, []);

  const refresh = useCallback(async () => { await fetchNotes(); }, [fetchNotes]);

  // The editor works without Notes: a failed first load is tried again by the next row that asks.
  const load = useCallback(() => (loading.current ??= fetchNotes().then(loaded => { if (!loaded) loading.current = null; })), [fetchNotes]);

  const replaceKey = useCallback(({ database, key, notes: keyNotes }: KeyNotes) => {
    setNotes(current => {
      const next: NotesByKey = current ? { ...current, [database]: { ...current[database] } } : { Character: {}, Weapon: {} };
      if (keyNotes.length) next[database][key] = keyNotes;
      else delete next[database][key];
      return next;
    });
  }, []);

  return <NotesContext.Provider value={{ notes, load, refresh, replaceKey }}>{children}</NotesContext.Provider>;
}

export function useNotesContext() {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error("useNotesContext must be used within a NotesProvider");
  }
  return context;
}
