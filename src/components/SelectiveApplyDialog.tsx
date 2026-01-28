"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface SelectiveApplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyComplete: () => void;
}

export function SelectiveApplyDialog({
  open,
  onOpenChange,
  onApplyComplete,
}: SelectiveApplyDialogProps) {
  const [commands, setCommands] = useState<string[]>([]);
  const [selectedCommands, setSelectedCommands] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [wipeDatabase, setWipeDatabase] = useState(true);

  // Fetch commands when dialog opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setFetchError(null);
      setSearchQuery("");

      fetch("/api/apply/preview")
        .then((res) => {
          if (!res.ok) {
            throw new Error("Failed to fetch commands");
          }
          return res.json();
        })
        .then((data) => {
          const cmds = data.commands as string[];
          setCommands(cmds);
          setSelectedCommands(new Set(cmds));
        })
        .catch((err) => {
          setFetchError(
            err instanceof Error ? err.message : "Failed to load commands"
          );
          setCommands([]);
          setSelectedCommands(new Set());
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setCommands([]);
      setSelectedCommands(new Set());
      setSearchQuery("");
      setFetchError(null);
      setWipeDatabase(true);
    }
  }, [open]);

  // Filter and sort commands
  const filteredCommands = useMemo(() => {
    const sorted = [...commands].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    if (!searchQuery.trim()) {
      return sorted;
    }

    const query = searchQuery.toLowerCase();
    // Search against display version (without "string ezconfig " prefix)
    return sorted.filter((cmd) =>
      cmd.replace(/^string ezconfig /i, "").toLowerCase().includes(query)
    );
  }, [commands, searchQuery]);

  const handleToggleCommand = (command: string) => {
    const newSelected = new Set(selectedCommands);
    if (newSelected.has(command)) {
      newSelected.delete(command);
    } else {
      newSelected.add(command);
    }
    setSelectedCommands(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedCommands(new Set(commands));
  };

  const handleDeselectAll = () => {
    setSelectedCommands(new Set());
  };

  const handleApply = async () => {
    // Allow proceeding with 0 commands if wipeDatabase is checked (wipe-only operation)
    if (selectedCommands.size === 0 && !wipeDatabase) {
      toast.error("No commands selected", { position: "bottom-right" });
      return;
    }

    setIsApplying(true);

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commands: Array.from(selectedCommands),
          wipeDatabase,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(
          `Applied config to game (${data.commandsSent} commands sent)`,
          { position: "bottom-right" }
        );
        onOpenChange(false);
        onApplyComplete();
      } else {
        toast.error(`Failed to apply: ${data.error || "Unknown error"}`, {
          position: "bottom-right",
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to apply config",
        { position: "bottom-right" }
      );
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply to Game</DialogTitle>
          <DialogDescription>
            Select which configuration to send to the game server.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {/* Search input */}
          <Input
            type="text"
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="shrink-0"
          />

          {/* Select All / Deselect All buttons */}
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={isLoading || commands.length === 0}
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDeselectAll}
              disabled={isLoading || commands.length === 0}
            >
              Deselect All
            </Button>
            <span className="text-muted-foreground ml-auto self-center text-sm">
              {selectedCommands.size} of {commands.length} selected
            </span>
          </div>

          {/* Wipe database option */}
          <div className="flex shrink-0 items-center gap-2">
            <Checkbox
              id="wipe-database"
              checked={wipeDatabase}
              onCheckedChange={(checked) => setWipeDatabase(checked === true)}
            />
            <label
              htmlFor="wipe-database"
              className="cursor-pointer text-sm"
            >
              Wipe mod database before applying (removes previously applied settings)
            </label>
          </div>

          {/* Command list */}
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md border p-2">
            {isLoading && (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Loading commands...
              </p>
            )}

            {fetchError && (
              <p className="text-destructive py-4 text-center text-sm">
                {fetchError}
              </p>
            )}

            {!isLoading && !fetchError && filteredCommands.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">
                {commands.length === 0
                  ? "No configuration to apply. Customize some settings first."
                  : "No commands match your search."}
              </p>
            )}

            {!isLoading &&
              !fetchError &&
              filteredCommands.map((command) => {
                const displayCommand = command.replace(/^string ezconfig /, "");
                return (
                  <div
                    key={command}
                    className="hover:bg-muted flex items-start gap-2 rounded px-2 py-1.5 min-w-0"
                  >
                    <Checkbox
                      id={command}
                      checked={selectedCommands.has(command)}
                      onCheckedChange={() => handleToggleCommand(command)}
                      className="mt-0.5 shrink-0"
                    />
                    <label
                      htmlFor={command}
                      className="min-w-0 flex-1 cursor-pointer truncate font-mono text-xs"
                      title={displayCommand}
                    >
                      {displayCommand}
                    </label>
                  </div>
                );
              })}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              isApplying || isLoading || (selectedCommands.size === 0 && !wipeDatabase) || !!fetchError
            }
          >
            {isApplying
              ? "Applying..."
              : selectedCommands.size === 0
                ? "Wipe Database"
                : `Apply ${selectedCommands.size} Command${selectedCommands.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
