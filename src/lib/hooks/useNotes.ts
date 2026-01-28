import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/store/authStore";
import type { Note, NotesData } from "@/lib/notes/types";

export interface UseNotesOptions {
  schema: string;
  configKey: string;
}

export interface UseNotesReturn {
  notes: Note[];
  loading: boolean;
  addNote: (note: string) => Promise<boolean>;
  editNote: (index: number, note: string) => Promise<boolean>;
  deleteNote: (index: number) => Promise<boolean>;
  currentUsername: string;
}

export function useNotes({ schema, configKey }: UseNotesOptions): UseNotesReturn {
  const [notesData, setNotesData] = useState<NotesData>({});
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((state) => state.user);

  const notes = notesData[configKey] || [];

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/notes/${encodeURIComponent(schema)}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setNotesData(data.data || {});
        }
      }
    } catch {
      // Ignore fetch errors - notes are optional
    } finally {
      setLoading(false);
    }
  }, [schema]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Wrap saveNotes in useCallback to ensure stable reference
  // Returns true on success, false on failure
  const saveNotes = useCallback(
    async (updatedData: NotesData): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/notes/${encodeURIComponent(schema)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: updatedData }),
          }
        );
        if (!response.ok) {
          const data = await response.json();
          console.error("Failed to save notes:", data.error);
          return false;
        }
        return true;
      } catch (error) {
        console.error("Failed to save notes:", error);
        return false;
      }
    },
    [schema]
  );

  const addNote = useCallback(
    async (note: string): Promise<boolean> => {
      if (!user) return false;
      const newNote: Note = { createdBy: user.username, note };
      const updatedNotes = [...notes, newNote];
      const updatedData = { ...notesData, [configKey]: updatedNotes };
      const success = await saveNotes(updatedData);
      if (success) {
        setNotesData(updatedData);
      } else {
        toast.error("Failed to save note", { position: "bottom-right" });
      }
      return success;
    },
    [user, notes, notesData, configKey, saveNotes]
  );

  const editNote = useCallback(
    async (index: number, note: string): Promise<boolean> => {
      const updatedNotes = notes.map((n, i) => (i === index ? { ...n, note } : n));
      const updatedData = { ...notesData, [configKey]: updatedNotes };
      const success = await saveNotes(updatedData);
      if (success) {
        setNotesData(updatedData);
      } else {
        toast.error("Failed to update note", { position: "bottom-right" });
      }
      return success;
    },
    [notes, notesData, configKey, saveNotes]
  );

  const deleteNote = useCallback(
    async (index: number): Promise<boolean> => {
      const updatedNotes = notes.filter((_, i) => i !== index);
      const updatedData = { ...notesData };
      if (updatedNotes.length === 0) {
        delete updatedData[configKey];
      } else {
        updatedData[configKey] = updatedNotes;
      }
      const success = await saveNotes(updatedData);
      if (success) {
        setNotesData(updatedData);
      } else {
        toast.error("Failed to delete note", { position: "bottom-right" });
      }
      return success;
    },
    [notes, notesData, configKey, saveNotes]
  );

  return {
    notes,
    loading,
    addNote,
    editNote,
    deleteNote,
    currentUsername: user?.username || "",
  };
}
