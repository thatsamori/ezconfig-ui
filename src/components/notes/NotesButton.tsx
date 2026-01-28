"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle } from "lucide-react";
import { NotesDialog } from "./NotesDialog";
import { useAuthStore } from "@/lib/store/authStore";
import type { Note, NotesData } from "@/lib/notes/types";

export interface NotesButtonProps {
  database: string;
  category: string;
  configKey: string;
}

export function NotesButton({ database, category, configKey }: NotesButtonProps) {
  const [open, setOpen] = useState(false);
  const [notesData, setNotesData] = useState<NotesData>({});
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((state) => state.user);

  const notes = notesData[configKey] || [];

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(database)}/${encodeURIComponent(category)}`);
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
  }, [database, category]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Fetch fresh data from server to avoid stale state overwrites
  const fetchFreshData = async (): Promise<NotesData> => {
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(database)}/${encodeURIComponent(category)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return data.data || {};
        }
      }
    } catch {
      // Fall back to local state
    }
    return notesData;
  };

  const saveNotes = async (updatedData: NotesData): Promise<boolean> => {
    try {
      const response = await fetch(`/api/notes/${encodeURIComponent(database)}/${encodeURIComponent(category)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: updatedData }),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const handleAddNote = async (note: string): Promise<boolean> => {
    if (!user) return false;
    // Fetch fresh data to avoid overwriting other notes
    const freshData = await fetchFreshData();
    const currentNotes = freshData[configKey] || [];
    const newNote: Note = { createdBy: user.username, note };
    const updatedNotes = [...currentNotes, newNote];
    const updatedData = { ...freshData, [configKey]: updatedNotes };
    const success = await saveNotes(updatedData);
    if (success) {
      setNotesData(updatedData);
    } else {
      toast.error("Failed to save note", { position: "bottom-right" });
    }
    return success;
  };

  const handleEditNote = async (index: number, note: string): Promise<boolean> => {
    // Fetch fresh data to avoid overwriting other notes
    const freshData = await fetchFreshData();
    const currentNotes = freshData[configKey] || [];
    const updatedNotes = currentNotes.map((n, i) => (i === index ? { ...n, note } : n));
    const updatedData = { ...freshData, [configKey]: updatedNotes };
    const success = await saveNotes(updatedData);
    if (success) {
      setNotesData(updatedData);
    } else {
      toast.error("Failed to update note", { position: "bottom-right" });
    }
    return success;
  };

  const handleDeleteNote = async (index: number): Promise<boolean> => {
    // Fetch fresh data to avoid overwriting other notes
    const freshData = await fetchFreshData();
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
      setNotesData(updatedData);
    } else {
      toast.error("Failed to delete note", { position: "bottom-right" });
    }
    return success;
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="h-8 w-8 text-muted-foreground hover:text-foreground relative"
        title="View notes"
      >
        <MessageCircle className="h-4 w-4" />
        {notes.length > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center"
          >
            {notes.length}
          </Badge>
        )}
      </Button>
      <NotesDialog
        open={open}
        onOpenChange={setOpen}
        configKey={configKey}
        notes={notes}
        onAddNote={handleAddNote}
        onEditNote={handleEditNote}
        onDeleteNote={handleDeleteNote}
        currentUsername={user?.username || ""}
      />
    </>
  );
}
