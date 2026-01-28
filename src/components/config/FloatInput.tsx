"use client";

import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/lib/hooks";
import { SaveIndicator } from "./SaveIndicator";

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
      const parsed = parseFloat(strValue);
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
    },
    1000
  );

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
        max={max}
        className="w-24"
      />
      <SaveIndicator state={saveState} />
    </div>
  );
}
