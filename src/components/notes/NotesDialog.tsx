"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { relativeTime } from "@/components/console/model";
import { useNotesContext } from "@/lib/notes/NotesContext";
import type { NoteView } from "@/lib/platform/notes";

export interface NotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configKey: string;
  context?: string;
  notes: NoteView[];
  onAddNote: (body: string) => Promise<boolean>;
  onEditNote: (noteId: number, body: string) => Promise<boolean>;
  onDeleteNote: (noteId: number) => Promise<boolean>;
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
  context,
  notes,
  onAddNote,
  onEditNote,
  onDeleteNote,
}: NotesDialogProps) {
  const [noteText, setNoteText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [deleteNoteId, setDeleteNoteId] = useState<number | null>(null);
  const { refresh } = useNotesContext();
  // Other owners' newest Notes, each time the panel opens.
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);
  const deleting = notes.find((note) => note.id === deleteNoteId);

  const handleSubmit = async () => {
    if (isHtmlEmpty(noteText)) return;

    let success: boolean;
    if (editingNoteId !== null) {
      success = await onEditNote(editingNoteId, noteText);
      if (success) {
        setEditingNoteId(null);
      }
    } else {
      success = await onAddNote(noteText);
    }
    if (success) {
      setNoteText("");
    }
  };

  const handleEdit = (noteId: number, currentNote: string) => {
    setNoteText(currentNote);
    setEditingNoteId(noteId);
  };

  const handleCancel = () => {
    setNoteText("");
    setEditingNoteId(null);
  };

  const handleDeleteClick = (noteId: number) => {
    setDeleteNoteId(noteId);
  };

  const handleDeleteConfirm = async () => {
    if (deleteNoteId === null) return;

    const success = await onDeleteNote(deleteNoteId);
    if (success) {
      // If we were editing this note, cancel the edit
      if (editingNoteId === deleteNoteId) {
        handleCancel();
      }
    }
    setDeleteNoteId(null);
  };

  const handleDeleteCancel = () => {
    setDeleteNoteId(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="console-sheet notes-sheet">
          <DialogHeader>
            <DialogDescription>Notes{context ? ` · ${context}` : ''}</DialogDescription>
            <DialogTitle>{configKey}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Notes list */}
            {notes.length > 0 ? (
              <div className="notes-list space-y-3 overflow-y-auto">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="note-item space-y-2"
                  >
                    {/* Sanitized when it was saved (src/lib/platform/notes.ts). */}
                    <div
                      className="text-sm prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: note.body }}
                    />
                    <div className="flex items-center justify-between">
                      <span className="note-author"><span className="note-avatar">{note.author.slice(0, 1).toUpperCase()}</span>{note.author}<time className="note-time" dateTime={new Date(note.createdAt).toISOString()} title={new Date(note.createdAt).toLocaleString()}>{relativeTime(note.createdAt)}</time>{note.editedAt !== null && <time className="note-time" dateTime={new Date(note.editedAt).toISOString()} title={new Date(note.editedAt).toLocaleString()}>edited</time>}</span>
                      {(note.canEdit || note.canDelete) && (
                        <div className="flex gap-1">
                          {note.canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleEdit(note.id, note.body)}
                              aria-label={`Edit note by ${note.author}`}
                              disabled={editingNoteId !== null}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          {note.canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteClick(note.id)}
                              aria-label={`Delete note by ${note.author}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Discuss what this config value does or if you find anything interesting about it. Everyone sees your notes.
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
                {editingNoteId !== null && (
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                )}
                <Button onClick={handleSubmit} disabled={isHtmlEmpty(noteText)}>
                  {editingNoteId !== null ? "Save" : "Post note"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteNoteId !== null} onOpenChange={(open) => !open && handleDeleteCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && !deleting.canEdit ? `This note is by ${deleting.author}; you are deleting it as the platform operator. ` : ""}This action cannot be undone.
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
