"use client";

import { FloatInput } from "./FloatInput";

export type Vector2Object = { x: number; y: number };
export type Vector2Array = [number, number];
export type Vector2Value = Vector2Object | Vector2Array;

export interface Vector2DInputProps {
  value: Vector2Value;
  onChange: (value: Vector2Object) => void;
  disabled?: boolean;
  step?: number;
}

function normalizeVector(value: Vector2Value): Vector2Object {
  if (Array.isArray(value)) {
    return { x: value[0], y: value[1] };
  }
  return value;
}

export function Vector2DInput({
  value,
  onChange,
  disabled,
  step,
}: Vector2DInputProps) {
  const normalized = normalizeVector(value);

  const handleChange = (axis: "x" | "y", newValue: number) => {
    onChange({ ...normalized, [axis]: newValue });
  };

  return (
    <div className="flex gap-2">
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">X</label>
        <FloatInput
          value={normalized.x}
          onChange={(v) => handleChange("x", v)}
          disabled={disabled}
          step={step}
        />
      </div>
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Y</label>
        <FloatInput
          value={normalized.y}
          onChange={(v) => handleChange("y", v)}
          disabled={disabled}
          step={step}
        />
      </div>
    </div>
  );
}
