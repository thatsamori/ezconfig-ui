"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveState } from "@/lib/hooks";

interface SaveIndicatorProps {
  state: SaveState;
  className?: string;
}

export function SaveIndicator({ state, className }: SaveIndicatorProps) {
  if (state === "idle") return null;

  return (
    <div className={cn("flex items-center", className)}>
      {state === "pending" && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
      {state === "saved" && <Check className="h-3 w-3 text-green-500" />}
    </div>
  );
}
