"use client";

import { useState } from "react";
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
import { useConfigStore } from "@/lib/store/configStore";
import { toast } from "sonner";

interface SavePresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function SavePresetDialog({ open, onOpenChange, onSaved }: SavePresetDialogProps) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);

  const values = useConfigStore((state) => state.values);

  const validateName = (value: string): boolean => {
    if (!value || value.length === 0) {
      setNameError("Name is required");
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      setNameError("Only letters, numbers, hyphens, and underscores allowed");
      return false;
    }
    setNameError(null);
    return true;
  };

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

  const handleSave = async () => {
    if (!validateName(name) || !validateTitle(title)) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/presets/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          title: title.trim(),
          description: description.trim(),
          data: values,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save preset");
      }

      toast.success(`Preset "${title}" saved successfully`, {
        position: "bottom-right",
      });

      // Reset form
      setName("");
      setTitle("");
      setDescription("");
      setNameError(null);
      setTitleError(null);

      // Close dialog and notify parent
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save preset", {
        position: "bottom-right",
      });
    } finally {
      setIsSaving(false);
    }
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
          <DialogTitle>Save as Preset</DialogTitle>
          <DialogDescription>
            Save your current configuration as a reusable preset.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
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
            <Label htmlFor="title">
              Display Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
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
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
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
          <Button onClick={handleSave} disabled={!isValid || isSaving}>
            {isSaving ? "Saving..." : "Save Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
