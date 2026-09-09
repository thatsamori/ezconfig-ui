/**
 * {
   configKey: "CanDodge",
   dataType: DataType.Boolean,
   isImplemented: false,
   documentation: "",
   default: false,
 }
 */
export type DefaultValue = boolean | number | string | number[] | { x: number; y: number; z?: number };
export type DefaultMetadata = {
  /** Verified base value, before live perks, loadout and other modifiers. */
  defaultValue?: DefaultValue;
  /** Actual values when there is no single default across contexts. */
  defaultVariants?: { value: DefaultValue; contexts: string[] }[];
  /** Weapon name -> attack/general category -> verified base value. */
  defaultValues?: Record<string, Record<string, DefaultValue>>;
};

export type ConfigEntry = DefaultMetadata & {
  configKey: string;
  dataType: DataType;
  isImplemented: boolean;
  documentation: string;
  /** Legacy edit seed. Display and new schemas use defaultValue/defaultVariants. */
  default?: DefaultValue;
  /** Stock values differ by motion; Customize must ask for an explicit value. */
  defaultVariesByMotion?: boolean;
  /** Customize opens an unsaved numeric draft instead of seeding a default. */
  requiresExplicitValue?: boolean;
  /**
   * String entries only: the fixed list of choice names the webapp offers.
   * The mod maps a choice name to an asset; the webapp never sends asset paths.
   */
  choices?: string[];
  /**
   * Feature-toggle entries only (spec: .scratch/cswics-features, CONTEXT.md
   * "Feature toggle"). A Bool entry that switches a feature on or off. A group
   * may hold several toggles; each feature parameter names its toggle via
   * gatedBy.
   */
  isFeatureToggle?: boolean;
  /**
   * Feature-parameter entries only: the configKey of the toggle (in the same
   * group) that enables this entry. The webapp greys and locks the entry while
   * that toggle's stored value is not true; the value is still stored and
   * still sent, the mod only reads it while the toggle is on.
   */
  gatedBy?: string;
};

export enum DataType {
  Bool = "Bool",
  Float = "Float",
  Vector = "Vector",
  Vector2D = "Vector2D",
  FloatArray = "FloatArray",
  String = "String",
}
