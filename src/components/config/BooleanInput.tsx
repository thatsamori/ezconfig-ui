"use client";

import { Switch } from "@/components/ui/switch";

export interface BooleanInputProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

export function BooleanInput({ value, onChange, disabled }: BooleanInputProps) {
  return (
    <Switch
      checked={value}
      onCheckedChange={onChange}
      disabled={disabled}
    />
  );
}
