"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bookmark } from "lucide-react";
import { relativeTime } from "@/components/console/model";
import JSZip from "jszip";
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
import { PresetPreviewDialog } from "./PresetPreviewDialog";
import { ImportPresetDialog } from "./ImportPresetDialog";
import type { PresetInfo, PresetData, PresetManifest } from "@/lib/presets/types";

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isLoadingPreset, setIsLoadingPreset] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Save dialog state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // Export state
  const [exportingPreset, setExportingPreset] = useState<string | null>(null);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importManifest, setImportManifest] = useState<PresetManifest | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadPreset = useConfigStore((state) => state.loadPreset);

  // Check if there's anything to save (values has content)


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
    setPreviewOpen(true);
  };

  const handleDeleteClick = (preset: PresetInfo) => {
    setSelectedPreset(preset);
    setPresetType("user");
    setDeleteDialogOpen(true);
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
      await loadPreset(response.data as PresetData);
      toast.success(`Loaded preset: ${selectedPreset.manifest.title}`, {
        position: "bottom-right",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load preset", {
        position: "bottom-right",
      });
    } finally {
      setIsLoadingPreset(false);
      setPreviewOpen(false);
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
      setDeleteDialogOpen(false);
      setSelectedPreset(null);
      setPresetType(null);
    }
  };

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setSelectedPreset(null);
    setPresetType(null);
  };

  const handlePreviewOpenChange = (open: boolean) => {
    setPreviewOpen(open);
    if (!open) {
      setSelectedPreset(null);
      setPresetType(null);
    }
  };

  const handleExportPreset = async (preset: PresetInfo) => {
    setExportingPreset(preset.name);
    try {
      // Fetch preset data
      const res = await fetch(`/api/presets/user/${preset.name}`);
      if (!res.ok) {
        throw new Error("Failed to fetch preset data");
      }
      const response = await res.json();
      const data = response.data as PresetData;

      // Create ZIP file
      const zip = new JSZip();

      // Add manifest
      const manifest: PresetManifest = {
        title: preset.manifest.title,
        description: preset.manifest.description,
      };
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      // Add Character configs
      for (const [category, values] of Object.entries(data.character)) {
        zip.file(`Character/${category}.json`, JSON.stringify(values, null, 2));
      }

      // Add Weapon configs
      for (const [weaponName, categories] of Object.entries(data.weapons)) {
        for (const [category, values] of Object.entries(categories)) {
          zip.file(`Weapon/${weaponName}/${category}.json`, JSON.stringify(values, null, 2));
        }
      }

      // Generate and download blob
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${preset.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Exported preset: ${preset.manifest.title}`, {
        position: "bottom-right",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export preset", {
        position: "bottom-right",
      });
    } finally {
      setExportingPreset(null);
    }
  };

  const handleImportFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Validate file type
      if (!file.name.endsWith(".zip")) {
        throw new Error("Please select a ZIP file");
      }

      // Read and validate ZIP structure client-side first
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Check for manifest.json
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        throw new Error("Invalid preset: missing manifest.json");
      }

      // Validate manifest structure
      const manifestContent = await manifestFile.async("string");
      let manifest: PresetManifest;
      try {
        manifest = JSON.parse(manifestContent);
        if (!manifest.title || typeof manifest.title !== "string") {
          throw new Error("Invalid manifest: missing or invalid title");
        }
      } catch {
        throw new Error("Invalid manifest.json format");
      }

      // Store file and manifest, open dialog for user to confirm/edit
      setImportFile(file);
      setImportManifest(manifest);
      setImportDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to read preset file", {
        position: "bottom-right",
      });
    } finally {
      // Clear file input
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const handleImportConfirm = async (name: string, title: string, description: string) => {
    if (!importFile) return;

    setIsImporting(true);
    try {
      // Upload to server for extraction with custom metadata
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("name", name);
      formData.append("title", title);
      formData.append("description", description);

      const res = await fetch("/api/presets/import", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to import preset");
      }

      toast.success(`Imported preset: ${result.data.title}`, {
        position: "bottom-right",
      });

      // Close dialog and reset
      setImportDialogOpen(false);
      setImportFile(null);
      setImportManifest(null);

      // Refresh preset list
      fetchPresets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import preset", {
        position: "bottom-right",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportDialogClose = () => {
    setImportDialogOpen(false);
    setImportFile(null);
    setImportManifest(null);
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
      <div className="presets-page space-y-8">
        {/* Header with Save and Import buttons */}
        <div className="standalone-heading">
          <div className="preset-page-heading"><h1>Presets</h1><p className="page-description">Snapshots of every override. Loading one replaces the working set (you review before anything is sent).</p></div>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip"
            onChange={handleImportFileSelect}
            className="hidden"
            aria-label="Import preset ZIP file"
          />
          <Button
            onClick={() => importInputRef.current?.click()}
            disabled={isImporting}
            variant="outline"
          >
            {isImporting ? "Importing..." : "Import .zip"}
          </Button>
          <Button
            onClick={() => setSaveDialogOpen(true)}
            disabled={isLoadingPreset}
            variant="default"
          >
            Save current as preset
          </Button>
        </div>

        {/* User Presets Section */}
        <div className="space-y-4">
          <h3 className="preset-section-title">Yours</h3>
          {userPresets.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No saved presets yet. Save your current configuration as a preset to see it here.
            </p>
          ) : (
            <div className="preset-grid">
              {userPresets.map((preset) => (
                <Card key={preset.name} className="preset-card">
                  <CardHeader>
                    <CardTitle><span className="preset-icon"><Bookmark size={15} /></span>{preset.manifest.title}</CardTitle>
                    <CardDescription>{preset.manifest.description}</CardDescription>
                    <p className="preset-meta">{preset.weaponCount ?? 0} weapons · {preset.keyCount ?? 0} keys{preset.updatedAt ? ` · edited ${relativeTime(preset.updatedAt)}` : ""}</p>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button
                      onClick={() => handleLoadClick(preset, "user")}
                      variant="default"
                      className="preset-load"
                    >
                      Load
                    </Button>
                    <Button
                      onClick={() => handleExportPreset(preset)}
                      disabled={exportingPreset === preset.name}
                      variant="outline"
                    >
                      {exportingPreset === preset.name ? "Exporting..." : "Export"}
                    </Button>
                    <Button
                      onClick={() => handleDeleteClick(preset)}
                      variant="ghost"
                      className="preset-delete"
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
          <h3 className="preset-section-title">Built-in</h3>
          {staticPresets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No built-in presets available.</p>
          ) : (
            <div className="preset-grid">
              {staticPresets.map((preset) => (
                <Card key={preset.name} className="preset-card">
                  <CardHeader>
                    <CardTitle><span className="preset-icon"><Bookmark size={15} /></span>{preset.manifest.title}</CardTitle>
                    <CardDescription>{preset.manifest.description}</CardDescription>
                    <p className="preset-meta">{preset.weaponCount ?? 0} weapons · {preset.keyCount ?? 0} keys{preset.updatedAt ? ` · edited ${relativeTime(preset.updatedAt)}` : ""}</p>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Button
                      onClick={() => handleLoadClick(preset, "static")}
                      variant="default"
                      className="preset-load"
                    >
                      Load
                    </Button>
                    <Button variant="outline" onClick={() => handleLoadClick(preset, "static")}>Preview</Button>
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

      {/* Import Preset Dialog */}
      <ImportPresetDialog
        open={importDialogOpen}
        onOpenChange={handleImportDialogClose}
        manifest={importManifest}
        existingNames={userPresets.map((p) => p.name)}
        onConfirm={handleImportConfirm}
        isImporting={isImporting}
      />

      {/* Preview dialog */}
      {mounted && (
        <PresetPreviewDialog
          open={previewOpen}
          onOpenChange={handlePreviewOpenChange}
          preset={selectedPreset}
          presetType={presetType}
          onConfirmLoad={handleConfirmLoad}
          isLoading={isLoadingPreset}
        />
      )}

      {/* Confirm delete dialog */}
      {mounted && (
        <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => !open && handleCloseDeleteDialog()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Preset</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{selectedPreset?.manifest.title}&quot;? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCloseDeleteDialog}>Cancel</AlertDialogCancel>
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
