"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BooleanInput,
  FloatInput,
  VectorInput,
  Vector2DInput,
  FloatArrayInput,
} from "@/components/config";
import { ConfigEntry, DataType } from "@/lib/config/types";
import type { ConfigValue } from "@/lib/store/configStore";
import { Pencil, X } from "lucide-react";

export interface ConfigRowProps {
  configEntry: ConfigEntry;
  value: ConfigValue | undefined;
  onChange: (value: ConfigValue) => void;
  onReset?: () => void;
  disabled?: boolean;
}

export function ConfigRow({
  configEntry,
  value,
  onChange,
  onReset,
  disabled,
}: ConfigRowProps) {
  const isCustomized = value !== undefined;

  const handleEdit = () => {
    // When clicking Edit, set to the schema default value
    const defaultValue = configEntry.default;
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  };

  const renderInput = () => {
    // Value is guaranteed to exist here (only called when isCustomized)
    switch (configEntry.dataType) {
      case DataType.Boolean:
        return (
          <BooleanInput
            value={value as boolean}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.Float:
        return (
          <FloatInput
            value={value as number}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.Vector:
        return (
          <VectorInput
            value={value as { x: number; y: number; z: number }}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.Vector2D:
        return (
          <Vector2DInput
            value={value as { x: number; y: number }}
            onChange={onChange}
            disabled={disabled}
          />
        );
      case DataType.FloatArray:
        return (
          <FloatArrayInput
            value={value as number[]}
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
      <div className="flex-1 flex items-center gap-2">
        {isCustomized ? (
          <>
            {renderInput()}
            {onReset && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onReset}
                disabled={disabled}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Reset to game default"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <>
            <Badge variant="secondary" className="text-xs">
              Game Default
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleEdit}
              disabled={disabled}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Customize value"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
