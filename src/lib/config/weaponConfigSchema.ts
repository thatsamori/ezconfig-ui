import { DataType, type ConfigEntry } from "./types";
import { weaponDefaults } from "./defaults";

export enum CategoryName {
  ArmingSword = "ArmingSword",
  Axe = "Axe",
  BastardSword = "BastardSword",
  Bardiche = "Bardiche",
  BattleAxe = "BattleAxe",
  Billhook = "Billhook",
  Dagger = "Dagger",
  Estoc = "Estoc",
  ExecutionerSword = "ExecutionerSword",
  Falchion = "Falchion",
  Falx = "Falx",
  FryingPan = "FryingPan",
  Greatsword = "Greatsword",
  HandAxe = "HandAxe",
  Halberd = "Halberd",
  Longsword = "Longsword",
  Mace = "Mace",
  Mallet = "Mallet",
  Maul = "Maul",
  MeatCleaver = "MeatCleaver",
  Messer = "Messer",
  Poleaxe = "Poleaxe",
  Polehammer = "Polehammer",
  Rapier = "Rapier",
  Quarterstaff = "Quarterstaff",
  Scimitar = "Scimitar",
  Shortspear = "Shortspear",
  Shortsword = "Shortsword",
  Sickle = "Sickle",
  SmithHammer = "SmithHammer",
  Spear = "Spear",
  WarAxe = "WarAxe",
  Warhammer = "Warhammer",
  Zweihander = "Zweihander",
  EveningStar = "EveningStar",
}

export enum WeaponConfigAttackName {
  Strike = "Strike",
  AltStrike = "AltStrike",
  Stab = "Stab",
  AltStab = "AltStab",
}

export enum WeaponConfigGroupName {
  General = "General",
  Strike = "Strike",
  AltStrike = "AltStrike",
  Stab = "Stab",
  AltStab = "AltStab",
}

export const WEAPON_CONFIG_OPTIONS: Record<'Attack' | 'General', ConfigEntry[]> = {
  Attack: [
    // Booleans
    {
      configKey: "CanCombo",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "CanMissCombo",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "ForcesRearingFromFront",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "NoFlinch",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "NoReleaseFlinch",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "StopOnHit",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "DrainAllStamOnBlock",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "RagdollOnBlock",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "WillClashWhenParried",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "RagdollOnHit",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "DismountsHorseRider",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "DismountsLadderUser",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },

    // Floats
    {
      configKey: "FlinchSpeedModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "FlinchDurationModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "Windup",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.675,
    },
    {
      configKey: "ComboWindupIncrease",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.25,
    },
    {
      configKey: "MissComboExtraWindupIncrease",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.2,
    },
    {
      configKey: "Release",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.325,
    },
    {
      configKey: "FeintLockOut",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.3,
    },
    {
      configKey: "FeintCost",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 10,
    },
    {
      configKey: "ChamberFeintCost",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 5,
    },
    {
      configKey: "ChamberCost",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 15,
    },
    {
      configKey: "MorphCost",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 7,
    },
    {
      configKey: "HitEffectSpeedUpExponent",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 3.0,
    },
    {
      configKey: "StaminaDrain",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 19.0,
    },
    {
      configKey: "ExtraStaminaDrainVsHeldBlock",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "StaminaDamage",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "WoodDamage",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 10.0,
    },
    {
      configKey: "StoneDamage",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 8.0,
    },
    {
      configKey: "ChipDamagePercentageOnBlock",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "MissStaminaCost",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 10.0,
    },
    {
      configKey: "HitStaminaReward",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 10.0,
    },
    {
      configKey: "MissRecovery",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.7,
    },
    {
      configKey: "HitKnockbackFactor",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.25,
    },

    // Vector 2D
    {
      configKey: "Turncap",
      dataType: DataType.Vector2D,
      isImplemented: false,
      documentation: "",
      default: { x: 150.0, y: 150.0 },
    },

    // Float Arrays (values not visible in images, using empty array)
    {
      configKey: "Damage",
      dataType: DataType.FloatArray,
      isImplemented: false,
      documentation: "",
      default: [],
    },
    {
      configKey: "HeadBonus",
      dataType: DataType.FloatArray,
      isImplemented: false,
      documentation: "",
      default: [],
    },
    {
      configKey: "LegBonus",
      dataType: DataType.FloatArray,
      isImplemented: false,
      documentation: "",
      default: [],
    },
  ],

  General: [
    // Booleans
    {
      configKey: "CanBlock",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "CanBlockOnFoot",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "IsParryHeld",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "UsesExtraEnvironmentTracers",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "HitKnockbackOnTeammates",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },

    // Floats
    {
      configKey: "SlideRadius",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 70.0,
    },
    {
      configKey: "AttackMask",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1,
    },
    {
      configKey: "ParryMask",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 5,
    },
    {
      configKey: "ParryWindowOffset",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "ParryBackpedalSpeedFactor",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.25,
    },
    {
      configKey: "ParryHeldStaminaDrain",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "BoostCosmeticTracersBy",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 25.0,
    },
    {
      configKey: "BlockStaminaNegation",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 13.0,
    },
    {
      configKey: "SecondBlockStaminaNegation",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 13.0,
    },

    // Vector 2D
    {
      configKey: "ParryTurnCap",
      dataType: DataType.Vector2D,
      isImplemented: false,
      documentation: "",
      default: { x: 375.0, y: 262.5 },
    },
    {
      configKey: "ShieldWallTurnCap",
      dataType: DataType.Vector2D,
      isImplemented: false,
      documentation: "",
      default: { x: 80.0, y: 80.0 },
    },
    {
      configKey: "ParrySuccessTurnCap",
      dataType: DataType.Vector2D,
      isImplemented: false,
      documentation: "",
      default: { x: -1.0, y: -1.0 },
    },
    {
      configKey: "BlockStaminaClamp",
      dataType: DataType.Vector2D,
      isImplemented: false,
      documentation: "",
      default: { x: 4.0, y: 20.0 },
    },
    {
      configKey: "SecondBlockStaminaClamp",
      dataType: DataType.Vector2D,
      isImplemented: false,
      documentation: "",
      default: { x: 4.0, y: 20.0 },
    },

    // Vector (X/Y/Z)
    {
      configKey: "ClashNormal",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 0.0, y: -1.0, z: 0.0 },
    },
    {
      configKey: "SecondClashNormal",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 0.0, y: -1.0, z: 0.0 },
    },
    {
      configKey: "LastObservedTraceDirection",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 0.0, y: 0.0, z: 0.0 },
    },

    // Vector (X/Y/Z) - Parry Box Transform
    {
      configKey: "ParryBoxTransformLocation",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 0.0, y: 0.0, z: 0.0 },
    },
    {
      configKey: "ParryBoxTransformRotation",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 0.0, y: 0.0, z: 0.0 },
    },
    {
      configKey: "ParryBoxTransformScale",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 1.0, y: 1.0, z: 1.0 },
    },
  ],
};

WEAPON_CONFIG_OPTIONS.Attack = WEAPON_CONFIG_OPTIONS.Attack.map(entry => weaponDefaults(entry, false));
WEAPON_CONFIG_OPTIONS.General = WEAPON_CONFIG_OPTIONS.General.map(entry => weaponDefaults(entry, true));

export const weaponConfigFlatMap = Object.values(WEAPON_CONFIG_OPTIONS)
  .reduce((acc, group) => [...acc, ...group], [])
  .reduce(
    (acc, configEntry) => ({
      ...acc,
      [configEntry.configKey]: configEntry,
    }),
    {},
  );

export type WeaponConfigKeyType = keyof typeof weaponConfigFlatMap;
