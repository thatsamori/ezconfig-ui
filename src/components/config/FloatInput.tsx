"use client";

import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/lib/hooks";
import { SaveIndicator } from "./SaveIndicator";
import { constrainedFloatTextError } from '@/lib/config/numericConstraints';

export interface FloatInputProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
}

export function FloatInput({
  value,
  onChange,
  disabled,
  step,
  min,
  max,
  integer,
}: FloatInputProps) {
  const [localValue, setLocalValue, saveState] = useDebouncedCallback(
    String(value),
    (strValue) => {
      const parsed = min === undefined ? parseFloat(strValue) : Number(strValue);
      if (!isNaN(parsed) && (min === undefined || !constrainedFloatTextError(strValue, min, max, integer))) {
        onChange(parsed);
      }
    },
    1000
  );
  const error = min === undefined ? undefined : constrainedFloatTextError(localValue, min, max, integer);
  const invalid = error !== undefined;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={localValue}
        onChange={handleChange}
        disabled={disabled}
        step={integer ? 1 : step}
        min={min}
        aria-invalid={invalid || undefined}
        max={max}
        className="w-24"
      />
      {invalid ? <span role="alert" className="text-xs text-destructive">{error}</span> : <SaveIndicator state={saveState} />}
    </div>
  );
}
