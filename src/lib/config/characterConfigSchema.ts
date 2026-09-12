import { DataType, type ConfigEntry } from "./types";
import { characterDefaults } from "./defaults";
import { ATTACK_MOTION_CONFIG_OPTIONS } from "./attackMotionConfigSchema";
import { BASE_PARRY_CONFIG_OPTIONS } from "./baseParryConfigSchema";
import { RECOVERY_CONFIG_OPTIONS } from "./recoveryConfigSchema";
import { MOVEMENT_CONFIG_OPTIONS } from "./movementConfigSchema";
import { STUN_CONFIG_OPTIONS } from "./stunConfigSchema";
import { FORWARD_GEOMETRY_CONFIG_OPTIONS, BUBBLE_GEOMETRY_CONFIG_OPTIONS } from "./geometryConfigSchema";
import { CAMERA_CONFIG_OPTIONS } from "./cameraConfigSchema";

export const CHARACTER_CATEGORY_NAME = "Character";

export enum CharacterConfigGroupName {
  Movement = "Movement",
  Combat = "Combat",
  General = "General",
  AttackMotion = "AttackMotion",
  Recovery = "Recovery",
  // Feature clusters (spec: .scratch/cswics-features). Keys arrive per feature ticket.
  Chftp = "Chftp",
  Chamber = "Chamber",
  Parry = "Parry",
  Combo = "Combo",
  Damage = "Damage",
  Stun = "Stun",
  Misc = "Misc",
  DebugTools = "DebugTools",
  Camera = "Camera",
}

export const CHARACTER_CONFIG_OPTIONS: Record<
  CharacterConfigGroupName,
  ConfigEntry[]
> = {
  Camera: CAMERA_CONFIG_OPTIONS,
  DebugTools: [
    {
      configKey: "AllowVisualizeBlockCollider",
      dataType: DataType.Bool,
      isImplemented: true,
      defaultValue: false,
      documentation:
        "Allows players to display active parry colliders with the local console command ezvisualizeblockcollider 1. Use 0 to turn the display off, or status for current counts and the peak count since enabling it. Green outlines show the server's active box; red outlines show its forward-parry region. The server sends snapshots 20 times per second, so the display includes network delay; it is not a hit-history or rewind trace. This EZConfig mesh overlay is independent of m.VisualizeBlockCollider and does not change collision. Turning this option off or resetting it clears the display and requires players to opt in again. Requires the updated server and client paks.",
    },
  ],
  AttackMotion: ATTACK_MOTION_CONFIG_OPTIONS,
  Recovery: RECOVERY_CONFIG_OPTIONS,
  Movement: [
    ...MOVEMENT_CONFIG_OPTIONS,
    ...BUBBLE_GEOMETRY_CONFIG_OPTIONS,
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
      isImplemented: true,
      documentation: "Sets the time in seconds for the native full-sprint speed target to ramp from partial sprint toward the full-sprint modifier. Acceleration and loadout can make actual speed lag behind that target. This is separate from SprintAcceleration. Updates and Reset affect ongoing movement; native eligibility can restart the ramp when movement no longer qualifies for full sprint. Cswics mod: TimeToMaxSprint.",
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
      gatedBy: "ChftpStun",
      documentation:
        "Length of the chftp stun motion in seconds. Cswics: ChftpStunValues.X",
      default: 1.5,
    },
    {
      configKey: "ChftpStunMovementRestriction",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "Movement restriction applied for the length of the stun, as the engine's movement-restriction enum index (an integer sent as Float and truncated by the mod); 3 = NO_MOVEMENT. Cswics: ChftpStunValues.Y",
      default: 3,
    },
    {
      configKey: "ChftpStunDisarms",
      dataType: DataType.Bool,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "Whether the chftp stun also disarms the stunned player. Cswics: ChftpStunValues.Z",
      default: true,
    },
    {
      configKey: "ChftpStunAnimation",
      dataType: DataType.String,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "Stun montage the chftp stun plays; Default is the stock stun montage. Choice names map to assets inside the mod. Cswics: ChftpStunAnimation",
      default: "Default",
      choices: ["Default"],
    },
    {
      configKey: "ChftpStunTurnCap",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "Turn cap modifier applied while chftp stunned; lower is a tighter cap. Cswics: ChftpStunTurnCap (index 0..3 = 0.4, 1.5625, 1.7708, 2.0833)",
      default: 0.4,
    },
    {
      configKey: "ChftpStunStaminaCost",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "Extra stamina the chamber-feint-to-parry player loses on top of the standard block drain when the stun lands. Replaces the game's own chamber-feint-to-parry penalty of 15. Cswics: CustomChftpStunStamCost",
      default: 15,
    },
    {
      configKey: "ChftpStunAttackerStaminaReward",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "Stamina given to the attacker whose attack was blocked by a chamber-feint-to-parry. Cswics: ChftpStamForAttacker",
      default: 30,
    },
    {
      configKey: "ChftpStunExcludeStabs",
      dataType: DataType.Bool,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "When on, a chamber-feint-to-parry against a stab pays only the standard block drain (no penalty at all) and is not stunned. Cswics: ExcludeStabChftpStam",
      default: false,
    },
    {
      configKey: "ChftpStunIgnoreEarlyRelease",
      dataType: DataType.Bool,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "When on, a chamber feinted inside the early-release allowance does not count as a chamber-feint-to-parry and is not stunned. Cswics: DisableEarlyReleaseCHFTPStun",
      default: false,
    },
    {
      configKey: "ChftpStunCanParry",
      dataType: DataType.Bool,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "Whether the stunned player can still parry during the chftp stun. Cswics: inverse of DisableParryInChftpStun",
      default: true,
    },
    {
      configKey: "ChftpStunParryDuration",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "ChftpStun",
      documentation:
        "Parry-up duration in seconds for a parry made out of a chftp stun; 0 means stock. Cswics: ChftpStunParryDuration",
      default: 0.325,
    },
    {
      configKey: "ChftpStunParryRecoveryTime",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "ChftpStun",
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
      gatedBy: "ChamberSlowdown",
      documentation:
        "How long in seconds the movement slowdown lasts after a chamber. Cswics: CustomChamberSlowdownDuration",
      default: 0.2,
    },
  ],
  Parry: [
    ...BASE_PARRY_CONFIG_OPTIONS,
    ...FORWARD_GEOMETRY_CONFIG_OPTIONS,
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
    // ExperimentalParry: replace the base time remaining after a block. Toggle first.
    {
      configKey: "ExperimentalParry",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "After a successful block, replaces the remaining base parry time with the current ExperimentalParryDuration. This can shorten or lengthen the parry; the successful-parry bonus can add more time. This toggle controls only ExperimentalParryDuration; base parry controls and other features work independently. Cswics mod: useExperimentalParry.",
      default: false,
    },
    {
      configKey: "ExperimentalParryDuration",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "ExperimentalParry",
      documentation:
        "Base parry time remaining after a successful block, in seconds: 0.05 means 50 milliseconds. Uses the current value when the block happens and replaces the remaining base time. The successful-parry bonus can extend the actual duration. Only used while ExperimentalParry is on. Cswics mod: ExperimentalParryDuration.",
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
        "Enables custom recovery and stamina changes for a parry within the post-flinch detection window. Timing starts at the last flinch, even if another motion occurs before the parry. GiveMissParryIfFlinchedBeforeDuration sets that window; zero disables qualification. Turning this feature off keeps the independently configured base parry rules. Cswics mod: TrueComboValues (the combined input also enabled its custom feature).",
      default: false,
    },
    {
      configKey: "TrueComboRecoveryTime",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "TrueCombo",
      documentation:
        "Recovery after a parry made inside the post-flinch miss-parry window, in seconds: 0.25 means 250 milliseconds. Higher positive values prolong that recovery; lower positive values let you act again sooner. Zero uses normal parry recovery for this path. While TrueCombo is on, this replaces the base miss-parry recovery and silences its woosh. Ordinary and held-parry recovery keep their separate settings. Cswics mod: TrueComboValues.Y",
      default: 0.25,
    },
    {
      configKey: "TrueComboStamina",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "TrueCombo",
      documentation:
        "Stamina change applied once for a qualifying parry after the last flinch while TrueCombo is on. Negative values drain stamina; positive values restore it; zero makes no change. Fractional values are truncated to whole points. An intervening motion does not erase the flinch, but the detection window must still be active. Cswics mod: TrueComboValues.Z.",
      default: 0,
    },
  ],
  Combo: [
    // MissComboPenalty: a combo started from a missed attack turns slower and gets a fixed feint window (ticket 10). Toggle first.
    {
      configKey: "MissComboPenalty",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When on, an attack that is a combo started from a missed attack (the motion's bIsComboFromMiss) has the attacker's turn rate cap and look-up rate cap multiplied by MissComboTurnCapMultiplier for that attack, and its feint window and combo feint window replaced by MissComboFeintWindow. Off is stock behaviour; the other MissComboPenalty keys are stored and sent regardless but only read while this is on. Cswics: UseMissComboPenalty (set true whenever the Cswics actor applies MissComboPenalty)",
      default: false,
    },
    {
      configKey: "MissComboTurnCapMultiplier",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "MissComboPenalty",
      documentation:
        "Multiplier applied to the attacker's turn rate cap and look-up rate cap for a combo attack started from a miss; 1.0 leaves the caps stock, lower values make the attacker turn slower during that attack. Only read while MissComboPenalty is on, stored regardless. Cswics: MissComboPenalty.X",
      default: 1.0,
    },
    {
      configKey: "MissComboFeintWindow",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "MissComboPenalty",
      documentation:
        "Feint window in seconds (both the feint window and the combo feint window) written onto a combo attack started from a miss, replacing the motion's stock windows; 0.05 is the Cswics default. Only read while MissComboPenalty is on, stored regardless. Cswics: MissComboPenalty.Y",
      default: 0.05,
    },
  ],
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
      gatedBy: "TeamDamageReflect",
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
        "Adds extra recovery time when a player hits a teammate and the hit stops their attack. The setting is captured at the teammate hit; later updates or wipes affect later hits. Cswics mod: no separate toggle; Cswics always applied its value.",
      default: false,
    },
    {
      configKey: "TeamHitRecoveryExtraTime",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "TeamHitRecovery",
      documentation:
        "Seconds added to the attacker's recovery after a teammate hit. Higher positive values make that recovery last longer. Captured at the hit while TeamHitRecovery is on, so an update or wipe afterward does not change that hit's extra time. Cswics mod: customTeamHitRecoveryTime.",
      default: 0.35,
    },
  ],
  Stun: STUN_CONFIG_OPTIONS,
  Misc: [
    // NoJumpInParryRecovery: owning-client Jump gate (ticket 13).
    {
      configKey: "NoJumpInParryRecovery",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When on, pressing jump during parry recovery does not request a jump. Climbing is attempted first as usual; other motions and the active parry stage keep normal jump behaviour. Off is stock behaviour. Cswics: DisableJumpParryRecovery (character: DisableJumpDuringRecovery)",
      default: false,
    },
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
      gatedBy: "DisarmPickupDelay",
      documentation:
        "Seconds after a disarm during which pickups are blocked; only read while DisarmPickupDelay is on, stored regardless. Cswics: disarmPickupDelayDuration",
      default: 0.001,
    },
    // DelayedSuicide: the suicide key plays an emote and the character dies when it ends (ticket 08). Toggle first.
    {
      configKey: "DelayedSuicide",
      dataType: DataType.Bool,
      isImplemented: true,
      isFeatureToggle: true,
      documentation:
        "Feature toggle. When on, pressing the suicide key plays a suicide emote and the character dies only when it finishes, instead of dying instantly; while it is on the stock instant suicide request is blocked on the pawn. Off is stock behaviour. Cswics: useDelayedSuicide",
      default: false,
    },
    {
      configKey: "DelayedSuicideDuration",
      dataType: DataType.Float,
      isImplemented: true,
      gatedBy: "DelayedSuicide",
      documentation:
        "Seconds the suicide emote plays before the character dies; only read while DelayedSuicide is on, stored regardless. Cswics: delayedSuicideDuration",
      default: 3.0,
    },
  ],
};
for (const group of Object.values(CharacterConfigGroupName)) {
  for (const entry of CHARACTER_CONFIG_OPTIONS[group]) Object.assign(entry, characterDefaults(entry));
}

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
