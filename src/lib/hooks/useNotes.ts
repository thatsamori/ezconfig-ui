import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/store/authStore";
import type { Note, NotesData } from "@/lib/notes/types";

export interface UseNotesOptions {
  schema: string;
  configKey: string;
}

export interface UseNotesReturn {
  notes: Note[];
  loading: boolean;
  addNote: (note: string) => void;
  editNote: (index: number, note: string) => void;
  deleteNote: (index: number) => void;
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

  const saveNotes = async (updatedData: NotesData) => {
    try {
      await fetch(
        `/api/notes/${encodeURIComponent(schema)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: updatedData }),
        }
      );
    } catch {
      // Ignore save errors
    }
  };

  const addNote = useCallback(
    (note: string) => {
      if (!user) return;
      const newNote: Note = { createdBy: user.username, note };
      const updatedNotes = [...notes, newNote];
      const updatedData = { ...notesData, [configKey]: updatedNotes };
      setNotesData(updatedData);
      saveNotes(updatedData);
    },
    [user, notes, notesData, configKey]
  );

  const editNote = useCallback(
    (index: number, note: string) => {
      const updatedNotes = notes.map((n, i) => (i === index ? { ...n, note } : n));
      const updatedData = { ...notesData, [configKey]: updatedNotes };
      setNotesData(updatedData);
      saveNotes(updatedData);
    },
    [notes, notesData, configKey]
  );

  const deleteNote = useCallback(
    (index: number) => {
      const updatedNotes = notes.filter((_, i) => i !== index);
      const updatedData = { ...notesData };
      if (updatedNotes.length === 0) {
        delete updatedData[configKey];
      } else {
        updatedData[configKey] = updatedNotes;
      }
      setNotesData(updatedData);
      saveNotes(updatedData);
    },
    [notes, notesData, configKey]
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
