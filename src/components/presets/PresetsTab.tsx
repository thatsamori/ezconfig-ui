"use client";

import { useState, useEffect } from "react";
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
import type { PresetInfo, PresetData } from "@/lib/presets/types";

export function PresetsTab() {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Dialog state
  const [selectedPreset, setSelectedPreset] = useState<PresetInfo | null>(null);
  const [dialogType, setDialogType] = useState<"confirm" | "unsaved" | null>(null);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);

  const hasUnsavedChanges = useConfigStore((state) => state.hasUnsavedChanges);
  const resetWorkingValues = useConfigStore((state) => state.resetWorkingValues);
  const loadPreset = useConfigStore((state) => state.loadPreset);

  // Wait for client mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch presets on mount
  useEffect(() => {
    async function fetchPresets() {
      try {
        const res = await fetch("/api/presets");
        if (!res.ok) {
          throw new Error("Failed to fetch presets");
        }
        const data = await res.json();
        setPresets(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load presets");
      } finally {
        setIsLoading(false);
      }
    }

    fetchPresets();
  }, []);

  const handleLoadClick = (preset: PresetInfo) => {
    setSelectedPreset(preset);
    if (hasUnsavedChanges) {
      setDialogType("unsaved");
    } else {
      setDialogType("confirm");
    }
  };

  const handleConfirmLoad = async () => {
    if (!selectedPreset) return;

    setIsLoadingPreset(true);
    try {
      const res = await fetch(`/api/presets/${selectedPreset.name}`);
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
    }
  };

  const handleDiscardAndLoad = async () => {
    resetWorkingValues();
    setDialogType("confirm");
  };

  const handleCloseDialog = () => {
    setDialogType(null);
    setSelectedPreset(null);
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

  if (presets.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">No presets available</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
        {presets.map((preset) => (
          <Card key={preset.name}>
            <CardHeader>
              <CardTitle>{preset.manifest.title}</CardTitle>
              <CardDescription>{preset.manifest.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => handleLoadClick(preset)}
                variant="default"
                className="w-full"
              >
                Load
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

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
    </>
  );
}
