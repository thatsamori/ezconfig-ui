"use client";

import { Button } from "@/components/ui/button";
import { FloatInput } from "./FloatInput";

export interface FloatArrayInputProps {
  value: number[];
  onChange: (value: number[]) => void;
  disabled?: boolean;
  step?: number;
}

export function FloatArrayInput({
  value,
  onChange,
  disabled,
  step,
}: FloatArrayInputProps) {
  const handleValueChange = (index: number, newValue: number) => {
    const updated = [...value];
    updated[index] = newValue;
    onChange(updated);
  };

  const handleAdd = () => {
    onChange([...value, 0]);
  };

  const handleRemove = (index: number) => {
    if (value.length <= 1) return;
    const updated = value.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-2">
      {value.map((v, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-6">{index}</span>
          <FloatInput
            value={v}
            onChange={(newValue) => handleValueChange(index, newValue)}
            disabled={disabled}
            step={step}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => handleRemove(index)}
            disabled={disabled || value.length <= 1}
            aria-label={`Remove value at index ${index}`}
          >
            -
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={disabled}
        className="self-start"
      >
        + Add Value
      </Button>
    </div>
  );
}
