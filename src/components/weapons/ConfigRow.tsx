"use client";

import { Label } from "@/components/ui/label";
import {
  BooleanInput,
  FloatInput,
  VectorInput,
  Vector2DInput,
  FloatArrayInput,
} from "@/components/config";
import { ConfigEntry, DataType } from "@/lib/config/types";
import type { ConfigValue } from "@/lib/store/configStore";

export interface ConfigRowProps {
  configEntry: ConfigEntry;
  value: ConfigValue | undefined;
  onChange: (value: ConfigValue) => void;
  disabled?: boolean;
}

export function ConfigRow({
  configEntry,
  value,
  onChange,
  disabled,
}: ConfigRowProps) {
  const renderInput = () => {
    // Use the value or fall back to default
    const currentValue = value ?? configEntry.default;

    switch (configEntry.dataType) {
      case DataType.Boolean:
        return (
          <BooleanInput
            value={currentValue ?? false}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.Float:
        return (
          <FloatInput
            value={currentValue ?? 0}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.Vector:
        return (
          <VectorInput
            value={currentValue ?? { x: 0, y: 0, z: 0 }}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.Vector2D:
        return (
          <Vector2DInput
            value={currentValue ?? { x: 0, y: 0 }}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.FloatArray:
        return (
          <FloatArrayInput
            value={currentValue ?? [0]}
            onChange={onChange}
            disabled={disabled}
          />
        );
      default:
        return <span className="text-muted-foreground">Unknown type</span>;
    }
  };

  return (
    <div className="flex items-center gap-4 py-2 border-b border-border last:border-b-0">
      <Label className="min-w-[200px] font-medium">{configEntry.configKey}</Label>
      <div className="flex-1">{renderInput()}</div>
    </div>
  );
}
