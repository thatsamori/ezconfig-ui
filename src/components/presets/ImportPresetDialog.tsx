"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PresetManifest } from "@/lib/presets/types";

interface ImportPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manifest: PresetManifest | null;
  existingNames: string[];
  onConfirm: (name: string, title: string, description: string) => void;
  isImporting: boolean;
}

/**
 * Convert a title to a safe preset folder name
 * - Lowercase
 * - Replace spaces and special characters with hyphens
 * - Remove consecutive hyphens
 * - Remove leading/trailing hyphens
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ImportPresetDialog({
  open,
  onOpenChange,
  manifest,
  existingNames,
  onConfirm,
  isImporting,
}: ImportPresetDialogProps) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  // Initialize form from manifest when dialog opens
  useEffect(() => {
    if (open && manifest) {
      const suggestedName = slugify(manifest.title);
      setTitle(manifest.title);
      setDescription(manifest.description || "");
      setName(suggestedName);
      // Validate the suggested name immediately
      validateName(suggestedName);
    }
  }, [open, manifest]);

  const validateName = useCallback((value: string): boolean => {
    if (!value || value.length === 0) {
      setNameError("Name is required");
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      setNameError("Only letters, numbers, hyphens, and underscores allowed");
      return false;
    }
    if (existingNames.includes(value)) {
      setNameError("A preset with this name already exists");
      return false;
    }
    setNameError(null);
    return true;
  }, [existingNames]);

  const validateTitle = (value: string): boolean => {
    if (!value || value.trim().length === 0) {
      setTitleError("Title is required");
      return false;
    }
    setTitleError(null);
    return true;
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (value) validateName(value);
    else setNameError(null);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (value) validateTitle(value);
    else setTitleError(null);
  };

  const isValid = name.length > 0 && title.trim().length > 0 && !nameError && !titleError;

  const handleImport = () => {
    if (!validateName(name) || !validateTitle(title)) {
      return;
    }
    onConfirm(name, title.trim(), description.trim());
  };

  const handleClose = () => {
    // Reset form on close
    setName("");
    setTitle("");
    setDescription("");
    setNameError(null);
    setTitleError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Import Preset</DialogTitle>
          <DialogDescription>
            Review and customize the preset details before importing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="import-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="import-name"
              placeholder="my-preset"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={nameError ? "border-destructive" : ""}
            />
            {nameError ? (
              <p className="text-sm text-destructive">{nameError}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Alphanumeric, hyphens, and underscores only
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="import-title">
              Display Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="import-title"
              placeholder="My Custom Preset"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className={titleError ? "border-destructive" : ""}
            />
            {titleError && (
              <p className="text-sm text-destructive">{titleError}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="import-description">Description</Label>
            <Textarea
              id="import-description"
              placeholder="Describe what this preset configures..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!isValid || isImporting}>
            {isImporting ? "Importing..." : "Import Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
