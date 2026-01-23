"use client";

import { Input } from "@/components/ui/input";

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
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    if (!isNaN(newValue)) {
      onChange(newValue);
    }
  };

  return (
    <Input
      type="number"
      value={value}
      onChange={handleChange}
      disabled={disabled}
      step={step}
      min={min}
      max={max}
    />
  );
}
