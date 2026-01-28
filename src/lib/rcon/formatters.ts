import { DataType } from "@/lib/config/types";

/**
 * Format a boolean value for RCON commands
 */
export function formatBoolean(value: boolean): string {
  return value ? "True" : "False";
}

/**
 * Format a float value for RCON commands (2 decimal places)
 */
export function formatFloat(value: number): string {
  return value.toFixed(2);
}

/**
 * Format a Vector value for RCON commands
 * Store format: { x: number, y: number, z: number }
 * Output format: "X=0.00,Y=0.00,Z=0.00"
 */
export function formatVector(value: {
  x: number;
  y: number;
  z: number;
}): string {
  return `X=${value.x.toFixed(2)},Y=${value.y.toFixed(2)},Z=${value.z.toFixed(2)}`;
}

/**
 * Format a Vector2D value for RCON commands
 * Store format: { x: number, y: number }
 * Output format: "X=0.00,Y=0.00,Z=0.00" (Z is always 0 for 2D vectors)
 */
export function formatVector2D(value: { x: number; y: number }): string {
  return `X=${value.x.toFixed(2)},Y=${value.y.toFixed(2)},Z=0.00`;
}

/**
 * Format a FloatArray value for RCON commands
 * Output format: "(0.00,0.00,0.00)"
 */
export function formatFloatArray(values: number[]): string {
  return `(${values.map((v) => v.toFixed(2)).join(",")})`;
}

/**
 * Format a value based on its data type for RCON commands
 */
export function formatValue(dataType: DataType, value: unknown): string {
  switch (dataType) {
    case DataType.Bool:
      return formatBoolean(value as boolean);
    case DataType.Float:
      return formatFloat(value as number);
    case DataType.Vector:
      return formatVector(value as { x: number; y: number; z: number });
    case DataType.Vector2D:
      return formatVector2D(value as { x: number; y: number });
    case DataType.FloatArray:
      return formatFloatArray(value as number[]);
    default:
      throw new Error(`Unknown data type: ${dataType}`);
  }
}
