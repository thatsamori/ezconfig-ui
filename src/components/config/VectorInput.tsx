"use client";

import { FloatInput } from "./FloatInput";

export type Vector3Object = { x: number; y: number; z: number };
export type Vector3Array = [number, number, number];
export type Vector3Value = Vector3Object | Vector3Array;

export interface VectorInputProps {
  value: Vector3Value;
  onChange: (value: Vector3Object) => void;
  disabled?: boolean;
  step?: number;
}

function normalizeVector(value: Vector3Value): Vector3Object {
  if (Array.isArray(value)) {
    return { x: value[0], y: value[1], z: value[2] };
  }
  return value;
}

export function VectorInput({
  value,
  onChange,
  disabled,
  step,
}: VectorInputProps) {
  const normalized = normalizeVector(value);

  const handleChange = (axis: "x" | "y" | "z", newValue: number) => {
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
      <div className="flex flex-col">
        <label className="text-xs text-muted-foreground mb-1">Z</label>
        <FloatInput
          value={normalized.z}
          onChange={(v) => handleChange("z", v)}
          disabled={disabled}
          step={step}
        />
      </div>
    </div>
  );
}
