"use client";

import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/lib/hooks";
import { SaveIndicator } from "./SaveIndicator";
import { constrainedFloatError } from '@/lib/config/numericConstraints';

export interface FloatInputProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  step?: number;
  min?: number;
  max?: number;
}

export function FloatInput({
  value,
  onChange,
  disabled,
  step,
  min,
  max,
}: FloatInputProps) {
  const [localValue, setLocalValue, saveState] = useDebouncedCallback(
    String(value),
    (strValue) => {
      const parsed = min === undefined ? parseFloat(strValue) : Number(strValue);
      if (!isNaN(parsed) && (min === undefined || (strValue.trim() !== '' && !constrainedFloatError(parsed, min)))) {
        onChange(parsed);
      }
    },
    1000
  );
  const error = min === undefined ? undefined : localValue.trim() === '' ? 'Enter a value.' : constrainedFloatError(Number(localValue), min);
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
        step={step}
        min={min}
        aria-invalid={invalid || undefined}
        max={max}
        className="w-24"
      />
      {invalid ? <span role="alert" className="text-xs text-destructive">{error}</span> : <SaveIndicator state={saveState} />}
    </div>
  );
}
