import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useNotesContext } from "@/lib/notes/NotesContext";
import type { NoteDatabase, NoteView } from "@/lib/platform/notes";

export interface UseNotesOptions {
  database: NoteDatabase;
  configKey: string;
}

export interface UseNotesReturn {
  notes: NoteView[];
  addNote: (body: string) => Promise<boolean>;
  editNote: (noteId: number, body: string) => Promise<boolean>;
  deleteNote: (noteId: number) => Promise<boolean>;
}

const NONE: NoteView[] = [];
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** One config key's Notes, and the changes the panel makes; the author is always the signed-in server owner. */
export function useNotes({ database, configKey }: UseNotesOptions): UseNotesReturn {
  const { notes: allNotes, load, replaceKey } = useNotesContext();
  const notes = allNotes?.[database][configKey] ?? NONE;

  useEffect(() => {
    load();
  }, [load]);

  const change = useCallback(
    async (url: string, init: RequestInit, failed: string): Promise<boolean> => {
      try {
        const response = await fetch(url, init);
        const result = await response.json();
        if (response.ok && result.success) {
          replaceKey(result.data);
          return true;
        }
        toast.error(result.error || failed, { position: "bottom-right" });
      } catch {
        toast.error(failed, { position: "bottom-right" });
      }
      return false;
    },
    [replaceKey]
  );

  const addNote = useCallback(
    (body: string) => change("/api/notes", json("POST", { database, key: configKey, body }), "Failed to save note"),
    [change, database, configKey]
  );

  const editNote = useCallback(
    (noteId: number, body: string) => change(`/api/notes/${noteId}`, json("PUT", { body }), "Failed to update note"),
    [change]
  );

  const deleteNote = useCallback(
    (noteId: number) => change(`/api/notes/${noteId}`, { method: "DELETE" }, "Failed to delete note"),
    [change]
  );

  return { notes, addNote, editNote, deleteNote };
}
