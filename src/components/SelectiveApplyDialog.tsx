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
import { Label } from "@/components/ui/label";
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
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch commands when dialog opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setFetchError(null);
      setSearchQuery("");
      setPassword("");

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
      setPassword("");
      setFetchError(null);
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
    return sorted.filter((cmd) => cmd.toLowerCase().includes(query));
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
    if (!password.trim()) {
      toast.error("Please enter the EZCONFIG_PASSWORD", {
        position: "bottom-right",
      });
      return;
    }

    if (selectedCommands.size === 0) {
      toast.error("No commands selected", { position: "bottom-right" });
      return;
    }

    setIsApplying(true);

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          commands: Array.from(selectedCommands),
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply to Game</DialogTitle>
          <DialogDescription>
            Select which configuration changes to send to the game server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Search input */}
          <Input
            type="text"
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Select All / Deselect All buttons */}
          <div className="flex gap-2">
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

          {/* Command list */}
          <div className="max-h-[300px] overflow-y-auto rounded-md border p-2">
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
                  ? "No commands to apply. Save some configuration first."
                  : "No commands match your search."}
              </p>
            )}

            {!isLoading &&
              !fetchError &&
              filteredCommands.map((command) => (
                <div
                  key={command}
                  className="hover:bg-muted flex items-start gap-2 rounded px-2 py-1.5"
                >
                  <Checkbox
                    id={command}
                    checked={selectedCommands.has(command)}
                    onCheckedChange={() => handleToggleCommand(command)}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={command}
                    className="flex-1 cursor-pointer truncate font-mono text-xs"
                    title={command}
                  >
                    {command}
                  </label>
                </div>
              ))}
          </div>

          {/* Password input */}
          <div className="space-y-2">
            <Label htmlFor="apply-password">EZCONFIG_PASSWORD</Label>
            <Input
              id="apply-password"
              type="password"
              placeholder="Enter password to apply"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isApplying) {
                  handleApply();
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              isApplying || isLoading || selectedCommands.size === 0 || !!fetchError
            }
          >
            {isApplying
              ? "Applying..."
              : `Apply ${selectedCommands.size} Command${selectedCommands.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
