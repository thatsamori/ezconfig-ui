"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2 } from "lucide-react";
import type { Note } from "@/lib/notes/types";

export interface NotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configKey: string;
  notes: Note[];
  onAddNote: (note: string) => void;
  onEditNote: (index: number, note: string) => void;
  onDeleteNote: (index: number) => void;
  currentUsername: string;
}

export function NotesDialog({
  open,
  onOpenChange,
  configKey,
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
  currentUsername,
}: NotesDialogProps) {
  const [noteText, setNoteText] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleSubmit = () => {
    if (!noteText.trim()) return;

    if (editingIndex !== null) {
      onEditNote(editingIndex, noteText.trim());
      setEditingIndex(null);
    } else {
      onAddNote(noteText.trim());
    }
    setNoteText("");
  };

  const handleEdit = (index: number, currentNote: string) => {
    setNoteText(currentNote);
    setEditingIndex(index);
  };

  const handleCancel = () => {
    setNoteText("");
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    onDeleteNote(index);
    // If we were editing this note, cancel the edit
    if (editingIndex === index) {
      handleCancel();
    } else if (editingIndex !== null && editingIndex > index) {
      // Adjust editing index if we deleted a note before it
      setEditingIndex(editingIndex - 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notes for {configKey}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Notes list */}
          {notes.length > 0 ? (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {notes.map((note, index) => (
                <div
                  key={index}
                  className="p-3 bg-muted rounded-md space-y-1"
                >
                  <p className="text-sm">{note.note}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      by {note.createdBy}
                    </span>
                    {note.createdBy === currentUsername && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleEdit(index, note.note)}
                          disabled={editingIndex !== null}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notes yet
            </p>
          )}

          {/* Add/Edit form */}
          <div className="space-y-2">
            <Textarea
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="min-h-20"
            />
            <div className="flex justify-end gap-2">
              {editingIndex !== null && (
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
              <Button onClick={handleSubmit} disabled={!noteText.trim()}>
                {editingIndex !== null ? "Save" : "Add Note"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
