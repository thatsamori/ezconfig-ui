"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Keep an explicit numeric draft unsaved until the user confirms it. */
export function ExplicitFloatOverride({
  configKey,
  disabled,
  onConfirm,
  onCancel,
}: {
  configKey: string;
  disabled?: boolean;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  const valid = draft.trim() !== "" && Number.isFinite(Number(draft));

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && valid) onConfirm(Number(draft));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <Input
        autoFocus
        aria-label={`${configKey} override`}
        type="number"
        step="any"
        required
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Enter value"
        disabled={disabled}
        className="w-32"
      />
      <Button type="submit" variant="outline" size="sm" disabled={disabled || !valid}>
        Use value
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}
