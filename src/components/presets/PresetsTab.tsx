"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useConfigStore } from "@/lib/store/configStore";
import { toast } from "sonner";
import { SavePresetDialog } from "./SavePresetDialog";
import type { PresetInfo, PresetData } from "@/lib/presets/types";

interface PresetsResponse {
  static: PresetInfo[];
  user: PresetInfo[];
}

export function PresetsTab() {
  const [staticPresets, setStaticPresets] = useState<PresetInfo[]>([]);
  const [userPresets, setUserPresets] = useState<PresetInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Dialog state for loading presets
  const [selectedPreset, setSelectedPreset] = useState<PresetInfo | null>(null);
  const [presetType, setPresetType] = useState<"static" | "user" | null>(null);
  const [dialogType, setDialogType] = useState<"confirm" | "unsaved" | "delete" | null>(null);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const hasUnsavedChanges = useConfigStore((state) => state.hasUnsavedChanges);
  const savedValues = useConfigStore((state) => state.savedValues);
  const resetWorkingValues = useConfigStore((state) => state.resetWorkingValues);
  const loadPreset = useConfigStore((state) => state.loadPreset);

  // Check if there's anything to save (savedValues has content)
  const hasSavedContent =
    Object.keys(savedValues.character).length > 0 ||
    Object.keys(savedValues.weapons).length > 0;

  // Wait for client mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch presets
  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch("/api/presets");
      if (!res.ok) {
        throw new Error("Failed to fetch presets");
      }
      const data = await res.json();
      const presets = data.data as PresetsResponse;
      setStaticPresets(presets.static || []);
      setUserPresets(presets.user || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load presets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch presets on mount
  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const handleLoadClick = (preset: PresetInfo, type: "static" | "user") => {
    setSelectedPreset(preset);
    setPresetType(type);
    if (hasUnsavedChanges) {
      setDialogType("unsaved");
    } else {
      setDialogType("confirm");
    }
  };

  const handleDeleteClick = (preset: PresetInfo) => {
    setSelectedPreset(preset);
    setPresetType("user");
    setDialogType("delete");
  };

  const handleConfirmLoad = async () => {
    if (!selectedPreset || !presetType) return;

    setIsLoadingPreset(true);
    try {
      // Use different endpoint for user presets vs static presets
      const endpoint = presetType === "user"
        ? `/api/presets/user/${selectedPreset.name}`
        : `/api/presets/${selectedPreset.name}`;

      const res = await fetch(endpoint);
      if (!res.ok) {
        throw new Error("Failed to fetch preset data");
      }
      const response = await res.json();
      loadPreset(response.data as PresetData);
      toast.success(`Loaded preset: ${selectedPreset.manifest.title}`, {
        position: "bottom-right",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load preset", {
        position: "bottom-right",
      });
    } finally {
      setIsLoadingPreset(false);
      setDialogType(null);
      setSelectedPreset(null);
      setPresetType(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedPreset) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/presets/user/${selectedPreset.name}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete preset");
      }

      toast.success(`Deleted preset: ${selectedPreset.manifest.title}`, {
        position: "bottom-right",
      });

      // Refresh preset list
      fetchPresets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete preset", {
        position: "bottom-right",
      });
    } finally {
      setIsDeleting(false);
      setDialogType(null);
      setSelectedPreset(null);
      setPresetType(null);
    }
  };

  const handleDiscardAndLoad = async () => {
    resetWorkingValues();
    setDialogType("confirm");
  };

  const handleCloseDialog = () => {
    setDialogType(null);
    setSelectedPreset(null);
    setPresetType(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading presets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8 py-4">
        {/* Save as Preset button */}
        <div className="flex justify-end">
          <Button
            onClick={() => setSaveDialogOpen(true)}
            disabled={!hasSavedContent}
            variant="outline"
          >
            Save Current Config as Preset
          </Button>
        </div>

        {/* User Presets Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Your Presets</h3>
          {userPresets.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No saved presets yet. Save your current configuration as a preset to see it here.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {userPresets.map((preset) => (
                <Card key={preset.name}>
                  <CardHeader>
                    <CardTitle>{preset.manifest.title}</CardTitle>
                    <CardDescription>{preset.manifest.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button
                      onClick={() => handleLoadClick(preset, "user")}
                      variant="default"
                      className="flex-1"
                    >
                      Load
                    </Button>
                    <Button
                      onClick={() => handleDeleteClick(preset)}
                      variant="destructive"
                    >
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Static Presets Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Built-in Presets</h3>
          {staticPresets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No built-in presets available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staticPresets.map((preset) => (
                <Card key={preset.name}>
                  <CardHeader>
                    <CardTitle>{preset.manifest.title}</CardTitle>
                    <CardDescription>{preset.manifest.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => handleLoadClick(preset, "static")}
                      variant="default"
                      className="w-full"
                    >
                      Load
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Preset Dialog */}
      <SavePresetDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSaved={fetchPresets}
      />

      {/* Unsaved changes dialog */}
      {mounted && (
        <AlertDialog open={dialogType === "unsaved"} onOpenChange={(open) => !open && handleCloseDialog()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
              <AlertDialogDescription>
                You have unsaved changes. Save or discard them before loading a preset.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCloseDialog}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDiscardAndLoad}>
                Discard & Load
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Confirm load dialog */}
      {mounted && (
        <AlertDialog open={dialogType === "confirm"} onOpenChange={(open) => !open && handleCloseDialog()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Load Preset</AlertDialogTitle>
              <AlertDialogDescription>
                Load preset &quot;{selectedPreset?.manifest.title}&quot;? This will replace your current configuration.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCloseDialog}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmLoad} disabled={isLoadingPreset}>
                {isLoadingPreset ? "Loading..." : "Load Preset"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Confirm delete dialog */}
      {mounted && (
        <AlertDialog open={dialogType === "delete"} onOpenChange={(open) => !open && handleCloseDialog()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Preset</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{selectedPreset?.manifest.title}&quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCloseDialog}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
