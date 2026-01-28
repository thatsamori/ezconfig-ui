import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/store/authStore";
import { useNotesContext } from "@/lib/notes/NotesContext";
import type { Note } from "@/lib/notes/types";

export interface UseNotesOptions {
  schema: string;
  configKey: string;
}

export interface UseNotesReturn {
  notes: Note[];
  loading: boolean;
  addNote: (note: string) => Promise<boolean>;
  editNote: (noteId: string, note: string) => Promise<boolean>;
  deleteNote: (noteId: string) => Promise<boolean>;
  currentUsername: string;
}

export function useNotes({ schema, configKey }: UseNotesOptions): UseNotesReturn {
  const { getNotes, getCachedNotes, updateCache, isLoading, subscribeToLoading } = useNotesContext();
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

  const addNote = useCallback(
    async (note: string): Promise<boolean> => {
      if (!user) return false;
      try {
        const response = await fetch(`/api/notes/${encodeURIComponent(schema)}/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            configKey,
            note,
            createdBy: user.username,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Update cache with server response
          updateCache(schema, result.data);
          setVersion((v) => v + 1);
          return true;
        } else {
          toast.error(result.error || "Failed to save note", { position: "bottom-right" });
          return false;
        }
      } catch (error) {
        console.error("Failed to add note:", error);
        toast.error("Failed to save note", { position: "bottom-right" });
        return false;
      }
    },
    [user, schema, configKey, updateCache]
  );

  const editNote = useCallback(
    async (noteId: string, note: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/notes/${encodeURIComponent(schema)}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            configKey,
            noteId,
            note,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Update cache with server response
          updateCache(schema, result.data);
          setVersion((v) => v + 1);
          return true;
        } else {
          toast.error(result.error || "Failed to update note", { position: "bottom-right" });
          return false;
        }
      } catch (error) {
        console.error("Failed to edit note:", error);
        toast.error("Failed to update note", { position: "bottom-right" });
        return false;
      }
    },
    [schema, configKey, updateCache]
  );

  const deleteNote = useCallback(
    async (noteId: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/notes/${encodeURIComponent(schema)}/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            configKey,
            noteId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Update cache with server response
          updateCache(schema, result.data);
          setVersion((v) => v + 1);
          return true;
        } else {
          toast.error(result.error || "Failed to delete note", { position: "bottom-right" });
          return false;
        }
      } catch (error) {
        console.error("Failed to delete note:", error);
        toast.error("Failed to delete note", { position: "bottom-right" });
        return false;
      }
    },
    [schema, configKey, updateCache]
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
