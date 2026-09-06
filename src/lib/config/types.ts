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
  /**
   * String entries only: the fixed list of choice names the webapp offers.
   * The mod maps a choice name to an asset; the webapp never sends asset paths.
   */
  choices?: string[];
  /**
   * Feature-toggle entries only (spec: .scratch/cswics-features, CONTEXT.md
   * "Feature toggle"). Exactly one Bool entry per feature group carries this.
   * The webapp renders it first in its group and greys the group's other
   * entries (the feature parameters) while it is off; those parameters are
   * still stored and still sent, the mod only reads them while the toggle
   * is on.
   */
  isFeatureToggle?: boolean;
};

export enum DataType {
  Bool = "Bool",
  Float = "Float",
  Vector = "Vector",
  Vector2D = "Vector2D",
  FloatArray = "FloatArray",
  String = "String",
}
