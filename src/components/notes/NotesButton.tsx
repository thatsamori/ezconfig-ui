"use client";

import { useState, useEffect, useCallback } from "react";
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

  const saveNotes = async (updatedData: NotesData) => {
    try {
      await fetch(`/api/notes/${encodeURIComponent(database)}/${encodeURIComponent(category)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: updatedData }),
      });
    } catch {
      // Ignore save errors
    }
  };

  const handleAddNote = (note: string) => {
    if (!user) return;
    const newNote: Note = { createdBy: user.username, note };
    const updatedNotes = [...notes, newNote];
    const updatedData = { ...notesData, [configKey]: updatedNotes };
    setNotesData(updatedData);
    saveNotes(updatedData);
  };

  const handleEditNote = (index: number, note: string) => {
    const updatedNotes = notes.map((n, i) => (i === index ? { ...n, note } : n));
    const updatedData = { ...notesData, [configKey]: updatedNotes };
    setNotesData(updatedData);
    saveNotes(updatedData);
  };

  const handleDeleteNote = (index: number) => {
    const updatedNotes = notes.filter((_, i) => i !== index);
    const updatedData = { ...notesData };
    if (updatedNotes.length === 0) {
      delete updatedData[configKey];
    } else {
      updatedData[configKey] = updatedNotes;
    }
    setNotesData(updatedData);
    saveNotes(updatedData);
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
