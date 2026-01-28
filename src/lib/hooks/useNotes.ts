import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/store/authStore";
import { useNotesContext } from "@/lib/notes/NotesContext";
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
  const { getNotes, getCachedNotes, invalidateAndRefetch, isLoading, subscribeToLoading } = useNotesContext();
  const [, setVersion] = useState(0);
  const user = useAuthStore((state) => state.user);

  // Get notes from cache (synchronous)
  const notesData = getCachedNotes(schema);
  const notes = notesData[configKey] || [];
  const loading = isLoading(schema);

  // Subscribe to loading state changes to trigger re-renders
  useEffect(() => {
    return subscribeToLoading(() => setVersion((v) => v + 1));
  }, [subscribeToLoading]);

  // Fetch notes on mount (will use cache if available)
  useEffect(() => {
    getNotes(schema).then(() => {
      // Trigger re-render after fetch completes
      setVersion((v) => v + 1);
    });
  }, [schema, getNotes]);

  // Save notes to server
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
      // Fetch fresh data to avoid overwriting other notes
      const freshData = await invalidateAndRefetch(schema);
      const currentNotes = freshData[configKey] || [];
      const newNote: Note = { createdBy: user.username, note };
      const updatedNotes = [...currentNotes, newNote];
      const updatedData = { ...freshData, [configKey]: updatedNotes };
      const success = await saveNotes(updatedData);
      if (success) {
        // Invalidate cache to get fresh data
        await invalidateAndRefetch(schema);
      } else {
        toast.error("Failed to save note", { position: "bottom-right" });
      }
      return success;
    },
    [user, configKey, schema, invalidateAndRefetch, saveNotes]
  );

  const editNote = useCallback(
    async (index: number, note: string): Promise<boolean> => {
      // Fetch fresh data to avoid overwriting other notes
      const freshData = await invalidateAndRefetch(schema);
      const currentNotes = freshData[configKey] || [];
      const updatedNotes = currentNotes.map((n, i) => (i === index ? { ...n, note } : n));
      const updatedData = { ...freshData, [configKey]: updatedNotes };
      const success = await saveNotes(updatedData);
      if (success) {
        await invalidateAndRefetch(schema);
      } else {
        toast.error("Failed to update note", { position: "bottom-right" });
      }
      return success;
    },
    [configKey, schema, invalidateAndRefetch, saveNotes]
  );

  const deleteNote = useCallback(
    async (index: number): Promise<boolean> => {
      // Fetch fresh data to avoid overwriting other notes
      const freshData = await invalidateAndRefetch(schema);
      const currentNotes = freshData[configKey] || [];
      const updatedNotes = currentNotes.filter((_, i) => i !== index);
      const updatedData = { ...freshData };
      if (updatedNotes.length === 0) {
        delete updatedData[configKey];
      } else {
        updatedData[configKey] = updatedNotes;
      }
      const success = await saveNotes(updatedData);
      if (success) {
        await invalidateAndRefetch(schema);
      } else {
        toast.error("Failed to delete note", { position: "bottom-right" });
      }
      return success;
    },
    [configKey, schema, invalidateAndRefetch, saveNotes]
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
