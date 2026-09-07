import { DataType, type ConfigEntry } from "./types";

export const CHARACTER_CATEGORY_NAME = "Character";

export enum CharacterConfigGroupName {
  Movement = "Movement",
  Combat = "Combat",
  General = "General",
  // Feature clusters (spec: .scratch/cswics-features). Keys arrive per feature ticket.
  Chftp = "Chftp",
  Chamber = "Chamber",
  Parry = "Parry",
  Combo = "Combo",
  Damage = "Damage",
  Stun = "Stun",
  Misc = "Misc",
}

export const CHARACTER_CONFIG_OPTIONS: Record<
  CharacterConfigGroupName,
  ConfigEntry[]
> = {
  Movement: [
    // Booleans
    {
      configKey: "CanDodge",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },

    // Floats
    {
      configKey: "TimeToMaxSprint",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.96,
    },
    {
      configKey: "CrouchCooldown",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.15,
    },
    {
      configKey: "SprintingMoveBlockedByFraction",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.1,
    },
    {
      configKey: "MoveBlockedBySlowMinInterval",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.5,
    },
    {
      configKey: "FallingTimeToRagdoll",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.5,
    },
    {
      configKey: "DodgeDuration",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.375,
    },
    {
      configKey: "DodgeCooldown",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.15,
    },
    {
      configKey: "DodgeStaminaCost",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 10,
    },
  ],

  Combat: [
    // Booleans
    {
      configKey: "IsUnflinchable",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "IsHitStopOnTeamHitsDisabled",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "DisableProjectileRangedDrawFlinch",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "CanReceiveClientsideHits",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "DisableRagdollFalling",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "CannotRequestSuicide",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "WillStopMelee",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "DisableHealingItems",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "IgnoreGameStateHealthRegenRestriction",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "IsAllowedOutOfBounds",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "TeamkillsCountForAutoKick",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "HasLastChance",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "ForceRagdollIfDmgAgent",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "CanJumpKick",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },

    // Floats
    {
      configKey: "StructureDamageModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "StructureRepairModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "ExtraStaminaOnHit",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0,
    },
    {
      configKey: "StaminaCostModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "MeleeWindupModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "MeleeComboExtraWindupModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "MeleeReleaseModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "MeleeMissRecoveryModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "LegDamageBonusModifierAirborne",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "UnflinchableDamageThreshold",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "StaminaRegenPerTick",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 6,
    },
    {
      configKey: "StaminaRegenDelay",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.3,
    },
    {
      configKey: "StaminaOnKill",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 25,
    },
    {
      configKey: "HealthOnKill",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 25,
    },
    {
      configKey: "StaminaRegenTickRate",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.25,
    },
    {
      configKey: "JumpStaminaCost",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 10.0,
    },
    {
      configKey: "KnockbackParry",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 450.0,
    },
    {
      configKey: "KnockbackWorld",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 400.0,
    },
    {
      configKey: "KnockbackClash",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 400.0,
    },
    {
      configKey: "DamageArmorTierOverride",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: -1,
    },
    {
      configKey: "HealthRegenDelay",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 4.5,
    },
    {
      configKey: "HealthRegenPerTick",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 5,
    },
    {
      configKey: "HealthRegenTickRate",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.25,
    },
    {
      configKey: "OutOfBoundsKillTime",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 5.0,
    },
    {
      configKey: "ReflectMeleeDamagePercentage",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "LastChanceHealAmount",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0,
    },
    {
      configKey: "ReceivedDamageModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "ReceivedFallDamageModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "ReceivedTeamDamageModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "ReceivedFireDamageModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "ReceivedRangedDamageModifier",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },
    {
      configKey: "ReceivedDamageAbsorption",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "ReceivedDamageMax",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.0,
    },
    {
      configKey: "KnockbackFlinch",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 325.0,
    },
    {
      configKey: "RagdollForceMultIfDmgAgent",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 1.0,
    },

    // Vectors - Low Block Collider Relative Offset
    {
      configKey: "LowBlockColliderRelativeOffsetLocation",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 75.0, y: 0.0, z: -35.0 },
    },
    {
      configKey: "LowBlockColliderRelativeOffsetRotation",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 0.0, y: 59.999985, z: 0.0 },
    },
    {
      configKey: "LowBlockColliderRelativeOffsetScale",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 1.0, y: 1.0, z: 0.81 },
    },

    // Vectors - High Block Collider Relative Offset
    {
      configKey: "HighBlockColliderRelativeOffsetLocation",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 10.0, y: 0.0, z: -100.0 },
    },
    {
      configKey: "HighBlockColliderRelativeOffsetRotation",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 0.0, y: -44.999989, z: 0.0 },
    },
    {
      configKey: "HighBlockColliderRelativeOffsetScale",
      dataType: DataType.Vector,
      isImplemented: false,
      documentation: "",
      default: { x: 1.0, y: 1.0, z: 1.1 },
    },
  ],

  General: [
    // Booleans
    {
      configKey: "CannotChamber",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: false,
    },
    {
      configKey: "AllowDrop",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "AllowClimbing",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "AllowVehicles",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },
    {
      configKey: "AllowEquipmentRotate",
      dataType: DataType.Bool,
      isImplemented: false,
      documentation: "",
      default: true,
    },

    // Floats
    {
      configKey: "JumpCooldown",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 0.15,
    },
    {
      configKey: "LookUpLimit",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 55.0,
    },
    {
      configKey: "LookDownLimit",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: 70.0,
    },
    {
      configKey: "LookUpRateCap",
      dataType: DataType.Float,
      isImplemented: false,
      documentation: "",
      default: -1.0,
    },
  ],

  // Feature clusters: empty until the feature tickets add their keys.
  // Feature parameter defaults equal the Cswics values, so a bare toggle
  // reproduces Cswics behaviour. Integers travel as Float (ADR 0003).
  Chftp: [
    // ChftpStun: stun on chamber-feint-to-parry (ticket 02). Toggle first.
    {
      configKey: "ChftpStun",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When an attack is blocked by a parry that came out of a feinted chamber (chamber-feint-to-parry), the player who feinted is stunned and pays stamina while the attacker is rewarded stamina. Off is stock behaviour; the other Chftp keys are stored and sent regardless but only read while this is on. Cswics: useChftpStun",
      default: false,
    },
    {
      configKey: "ChftpStunDuration",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Length of the chftp stun motion in seconds. Cswics: ChftpStunValues.X",
      default: 1.5,
    },
    {
      configKey: "ChftpStunMovementRestriction",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Movement restriction applied for the length of the stun, as the engine's movement-restriction enum index (an integer sent as Float and truncated by the mod); 3 = NO_MOVEMENT. Cswics: ChftpStunValues.Y",
      default: 3,
    },
    {
      configKey: "ChftpStunDisarms",
      dataType: DataType.Bool,
      isImplemented: true,
      documentation:
        "Whether the chftp stun also disarms the stunned player. Cswics: ChftpStunValues.Z",
      default: true,
    },
    {
      configKey: "ChftpStunAnimation",
      dataType: DataType.String,
      isImplemented: true,
      documentation:
        "Stun montage the chftp stun plays; Default is the stock stun montage. Choice names map to assets inside the mod. Cswics: ChftpStunAnimation",
      default: "Default",
      choices: ["Default"],
    },
    {
      configKey: "ChftpStunTurnCap",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Turn cap modifier applied while chftp stunned; lower is a tighter cap. Cswics: ChftpStunTurnCap (index 0..3 = 0.4, 1.5625, 1.7708, 2.0833)",
      default: 0.4,
    },
    {
      configKey: "ChftpStunStaminaCost",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Extra stamina the chamber-feint-to-parry player loses on top of the standard block drain when the stun lands. Replaces the game's own chamber-feint-to-parry penalty of 15. Cswics: CustomChftpStunStamCost",
      default: 15,
    },
    {
      configKey: "ChftpStunAttackerStaminaReward",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Stamina given to the attacker whose attack was blocked by a chamber-feint-to-parry. Cswics: ChftpStamForAttacker",
      default: 30,
    },
    {
      configKey: "ChftpStunExcludeStabs",
      dataType: DataType.Bool,
      isImplemented: true,
      documentation:
        "When on, a chamber-feint-to-parry against a stab pays only the standard block drain (no penalty at all) and is not stunned. Cswics: ExcludeStabChftpStam",
      default: false,
    },
    {
      configKey: "ChftpStunIgnoreEarlyRelease",
      dataType: DataType.Bool,
      isImplemented: true,
      documentation:
        "When on, a chamber feinted inside the early-release allowance does not count as a chamber-feint-to-parry and is not stunned. Cswics: DisableEarlyReleaseCHFTPStun",
      default: false,
    },
    {
      configKey: "ChftpStunCanParry",
      dataType: DataType.Bool,
      isImplemented: true,
      documentation:
        "Whether the stunned player can still parry during the chftp stun. Cswics: inverse of DisableParryInChftpStun",
      default: true,
    },
    {
      configKey: "ChftpStunParryDuration",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Parry-up duration in seconds for a parry made out of a chftp stun; 0 means stock. Cswics: ChftpStunParryDuration",
      default: 0.325,
    },
    {
      configKey: "ChftpStunParryRecoveryTime",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Recovery time in seconds after a parry made out of a chftp stun; 0 means stock. Cswics: ChftpStunParryRecoveryTime",
      default: 0.675,
    },
  ],
  Chamber: [
    // ChamberSlowdown: movement slowdown after a chamber (ticket 03). Toggle first.
    {
      configKey: "ChamberSlowdown",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When a player chambers (blocks an attack with a chamber), that player's movement is restricted to partial sprint for a short duration. Off is stock behaviour; the other Chamber keys are stored and sent regardless but only read while this is on. Cswics: useChamberSlowdown",
      default: false,
    },
    {
      configKey: "ChamberSlowdownDuration",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "How long in seconds the movement slowdown lasts after a chamber. Cswics: CustomChamberSlowdownDuration",
      default: 0.2,
    },
  ],
  Parry: [
    // ExperimentalParry: parry window extended after a block (ticket 04). Toggle first.
    {
      configKey: "ExperimentalParry",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When a player blocks an attack with a parry (OnBlockedMelee), the live parry motion's parry-up time is extended so the parry window stays open for an extra ExperimentalParryDuration seconds measured from the block. Off is stock behaviour; the other Parry keys are stored and sent regardless but only read while this is on. Cswics: useExperimentalParry",
      default: false,
    },
    {
      configKey: "ExperimentalParryDuration",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Seconds added to the parry-up time after a block; only read while ExperimentalParry is on, stored regardless. Cswics: ExperimentalParryDuration",
      default: 0.05,
    },
    // KicksUnparryable: kicks cannot be parried (ticket 05).
    {
      configKey: "KicksUnparryable",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When on, kicks cannot be parried: a parry against a kick fails as if it had not been attempted, so the kick lands. Off is stock behaviour. Cswics: DisableKickparry",
      default: false,
    },
    // TrueCombo: parry inside the post-flinch miss-parry window gets a custom recovery time and stamina offset (ticket 11). Toggle first.
    {
      configKey: "TrueCombo",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When on, a parry that begins inside the stock miss-parry window after being flinched (the parry motion's GiveMissParryIfFlinchedBeforeDuration) gets its recovery time replaced by TrueComboRecoveryTime and the parrier's stamina offset by TrueComboStamina. Off is stock behaviour; the other TrueCombo keys are stored and sent regardless but only read while this is on. Cswics: TrueComboValues (gated on the use flag)",
      default: false,
    },
    {
      configKey: "TrueComboRecoveryTime",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Parry recovery time in seconds applied to a parry made inside the post-flinch miss-parry window; only read while TrueCombo is on, stored regardless. Cswics: TrueComboValues.Y",
      default: 0.25,
    },
    {
      configKey: "TrueComboStamina",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Stamina offset in whole points (negative drains) applied to the parrier on a parry made inside the post-flinch miss-parry window; 0 means none. Only read while TrueCombo is on, stored regardless. Cswics: TrueComboValues.Z",
      default: 0,
    },
  ],
  Combo: [],
  Damage: [
    // TeamDamageReflect: team damage dealt back to the attacker (ticket 06). Toggle first.
    {
      configKey: "TeamDamageReflect",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When on, melee or ranged (non-generic) damage dealt to a teammate is also dealt to the attacker, scaled by TeamDamageReflectPercent. Does nothing in free-for-all (game state team count of 1 or less). Off is stock behaviour. Cswics: TeamDamageReflect (Cswics gated on a nonzero percent)",
      default: false,
    },
    {
      configKey: "TeamDamageReflectPercent",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Fraction of the team damage dealt back to the attacker, as a multiplier (1 = the full damage, 0.5 = half), truncated to a whole number of damage points; only read while TeamDamageReflect is on, stored regardless. Cswics: TeamDamageReflect",
      default: 0,
    },
    // TeamHitRecovery: extra hit-recovery time for the attacker after a team hit (ticket 07). Toggle first.
    {
      configKey: "TeamHitRecovery",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When on, a player who hits a teammate has TeamHitRecoveryExtraTime added to the hit-recovery motion they are put into, so team hits cost the attacker more. Off is stock behaviour. Cswics: (no alias; Cswics always applied its value)",
      default: false,
    },
    {
      configKey: "TeamHitRecoveryExtraTime",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Seconds added to the end of the attacker's hit-recovery motion after hitting a teammate; only read while TeamHitRecovery is on, stored regardless. Cswics: customTeamHitRecoveryTime",
      default: 0.35,
    },
  ],
  Stun: [],
  Misc: [
    // DisarmPickupDelay: pickups blocked for a while after being disarmed (ticket 09). Toggle first.
    {
      configKey: "DisarmPickupDelay",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When on, a player who has just been disarmed cannot pick anything up for DisarmPickupDelayDuration seconds (their interaction sweeps are suspended, then restored). Off is stock behaviour. Cswics: useDisarmPickupDelay",
      default: false,
    },
    {
      configKey: "DisarmPickupDelayDuration",
      dataType: DataType.Float,
      isImplemented: true,
      documentation:
        "Seconds after a disarm during which pickups are blocked; only read while DisarmPickupDelay is on, stored regardless. Cswics: disarmPickupDelayDuration",
      default: 0.001,
    },
  ],
};
export const characterConfigFlatMap = Object.values(CHARACTER_CONFIG_OPTIONS)
  .reduce((acc, group) => [...acc, ...group], [])
  .reduce(
    (acc, configEntry) => ({
      ...acc,
      [configEntry.configKey]: configEntry,
    }),
    {},
  );

export type CharacterConfigKeyType = keyof typeof characterConfigFlatMap;
