"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
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

/**
 * Check if HTML content is empty (just empty paragraph or whitespace)
 */
function isHtmlEmpty(html: string): boolean {
  // Remove HTML tags and check if anything remains
  const text = html.replace(/<[^>]*>/g, "").trim();
  return text.length === 0;
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
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  const handleSubmit = () => {
    if (isHtmlEmpty(noteText)) return;

    if (editingIndex !== null) {
      onEditNote(editingIndex, noteText);
      setEditingIndex(null);
    } else {
      onAddNote(noteText);
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

  const handleDeleteClick = (index: number) => {
    setDeleteIndex(index);
  };

  const handleDeleteConfirm = () => {
    if (deleteIndex === null) return;

    onDeleteNote(deleteIndex);
    // If we were editing this note, cancel the edit
    if (editingIndex === deleteIndex) {
      handleCancel();
    } else if (editingIndex !== null && editingIndex > deleteIndex) {
      // Adjust editing index if we deleted a note before it
      setEditingIndex(editingIndex - 1);
    }
    setDeleteIndex(null);
  };

  const handleDeleteCancel = () => {
    setDeleteIndex(null);
  };

  return (
    <>
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
                    <div
                      className="text-sm prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: note.note }}
                    />
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
                            onClick={() => handleDeleteClick(index)}
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
              <RichTextEditor
                content={noteText}
                onChange={setNoteText}
                placeholder="Add a note..."
              />
              <div className="flex justify-end gap-2">
                {editingIndex !== null && (
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                )}
                <Button onClick={handleSubmit} disabled={isHtmlEmpty(noteText)}>
                  {editingIndex !== null ? "Save" : "Add Note"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={(open) => !open && handleDeleteCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
