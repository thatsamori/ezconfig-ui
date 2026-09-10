"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PresetInfo, PresetData } from "@/lib/presets/types";

interface PresetPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: PresetInfo | null;
  presetType: "static" | "user" | null;
  onConfirmLoad: () => void;
  isLoading: boolean;
}

interface ContentSummary {
  character: { category: string; count: number }[];
  weapons: { name: string; categoryCount: number }[];
}

/**
 * Generate a summary of preset contents for display
 */
function generateSummary(data: PresetData): ContentSummary {
  const character: { category: string; count: number }[] = [];
  const weapons: { name: string; categoryCount: number }[] = [];

  // Count character categories and settings
  for (const [category, values] of Object.entries(data.character)) {
    character.push({
      category,
      count: Object.keys(values).length,
    });
  }

  // Count weapons and their categories
  for (const [weaponName, categories] of Object.entries(data.weapons)) {
    weapons.push({
      name: weaponName,
      categoryCount: Object.keys(categories).length,
    });
  }

  return { character, weapons };
}

export function PresetPreviewDialog({
  open,
  onOpenChange,
  preset,
  presetType,
  onConfirmLoad,
  isLoading,
}: PresetPreviewDialogProps) {
  const [presetData, setPresetData] = useState<PresetData | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch preset data when dialog opens
  useEffect(() => {
    if (open && preset && presetType) {
      setIsFetching(true);
      setFetchError(null);
      setPresetData(null);

      const endpoint =
        presetType === "user"
          ? `/api/presets/user/${preset.name}`
          : `/api/presets/${preset.name}`;

      fetch(endpoint)
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to fetch preset data");
          }
          return res.json();
        })
        .then((response) => {
          setPresetData(response.data as PresetData);
        })
        .catch((err) => {
          setFetchError(err instanceof Error ? err.message : "Failed to load preset");
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  }, [open, preset, presetType]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setPresetData(null);
      setFetchError(null);
    }
  }, [open]);

  const summary = presetData ? generateSummary(presetData) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
        <div className="min-h-0 overflow-y-auto overscroll-contain [overflow-wrap:anywhere]">
          <DialogHeader className="pr-6">
            <DialogTitle>{preset?.manifest.title ?? "Preview Preset"}</DialogTitle>
            <DialogDescription>
              {preset?.manifest.description ?? "Loading preset information..."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {isFetching && (
              <p className="text-muted-foreground text-sm">Loading preset contents...</p>
            )}

            {fetchError && (
              <p className="text-destructive text-sm">{fetchError}</p>
            )}

            {summary && (
              <div className="space-y-4">
                {/* Character Settings */}
                {summary.character.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Character Settings</h4>
                    <p className="text-muted-foreground text-sm">
                      {summary.character
                        .map((cat) => `${cat.category} (${cat.count} ${cat.count === 1 ? "setting" : "settings"})`)
                        .join(", ")}
                    </p>
                  </div>
                )}

                {/* Weapon Settings */}
                {summary.weapons.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm mb-2">Weapon Settings</h4>
                    <p className="text-muted-foreground text-sm">
                      {summary.weapons.length} {summary.weapons.length === 1 ? "weapon" : "weapons"} configured
                    </p>
                    <ul className="text-muted-foreground text-sm mt-1 list-disc list-inside">
                      {summary.weapons.map((weapon) => (
                        <li key={weapon.name}>
                          {weapon.name} ({weapon.categoryCount} {weapon.categoryCount === 1 ? "category" : "categories"})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Empty preset */}
                {summary.character.length === 0 && summary.weapons.length === 0 && (
                  <p className="text-muted-foreground text-sm">This preset contains no configuration data.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onConfirmLoad}
            disabled={isLoading || isFetching || !!fetchError}
          >
            {isLoading ? "Loading..." : "Load Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
