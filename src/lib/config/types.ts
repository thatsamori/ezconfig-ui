/**
 * {
   configKey: "CanDodge",
   dataType: DataType.Boolean,
   isImplemented: false,
   documentation: "",
   default: false,
 }
 */
export type ConfigEntry = {
  configKey: string;
  dataType: DataType;
  isImplemented: boolean;
  documentation: string;
  default: any;
};

export enum DataType {
  Bool = "Bool",
  Float = "Float",
  Vector = "Vector",
  Vector2D = "Vector2D",
  FloatArray = "FloatArray",
}
