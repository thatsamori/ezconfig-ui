import { DataType, type ConfigEntry } from "./types";

function scalar(
  configKey: string,
  documentation: string,
  cswicsReference: string,
  measured = false,
): ConfigEntry {
  return {
    configKey,
    dataType: DataType.Float,
    isImplemented: measured,
    defaultVariesByMotion: true,
    documentation: `${documentation} Uses the configured value when recovery begins; an ongoing recovery keeps its base values after an update or wipe. Cswics mod: ${cswicsReference}.`,
  };
}

export const RECOVERY_CONFIG_OPTIONS: ConfigEntry[] = [
  scalar(
    "WorldRecoveryTime",
    "Sets recovery after your attack hits the world, such as a wall, in seconds. Higher positive values make this recovery last longer. Zero or negative values let this recovery end on the next game update.",
    "customWorldHitRecoveryTime",
    true,
  ),
  scalar(
    "WorldMissStaminaFactor",
    "Scales your attack's miss stamina cost when it hits the world, such as a wall. A value of 0.5 uses half that cost; 2 uses twice the cost. Zero removes this cost, and negative values restore stamina.",
    "WorldHitStamCostMulti",
    true,
  ),
  scalar(
    "ParriedRecoveryTimeOffset",
    "Adds this many seconds to your recovery when another player parries your attack, before applying the minimum and maximum. Positive values lengthen recovery and negative values shorten it unless a limit stops the change.",
    "ParryLockout.X",
    true,
  ),
  scalar(
    "ParriedRecoveryTimeMin",
    "Sets the lower limit, in seconds, for your recovery when another player parries your attack. Raising it can prevent recovery from ending sooner. If this exceeds the maximum, the native calculation can choose either limit depending on the calculated recovery.",
    "ParryLockout.Y",
    true,
  ),
  scalar(
    "ParriedRecoveryTimeMax",
    "Sets the upper limit, in seconds, for your recovery when another player parries your attack. Lowering it can shorten recovery. Setting both limits to zero lets recovery end on the next game update. Leaving the minimum unconfigured keeps its game default.",
    "ParryLockout.Z",
    true,
  ),
  scalar(
    "ExtraStrikeLockout",
    "Adds this many seconds to the wait before starting a strike after a feint. Higher positive values delay that strike; negative values shorten the wait. Your weapon's regular lockout and the game's late-feint adjustment still apply.",
    "StrikeAndStabFeintLockout.X",
    true,
  ),
  scalar(
    "ExtraStabLockout",
    "Adds this many seconds to the wait before starting a stab after a feint. Higher positive values delay that stab; negative values shorten the wait. Your weapon's regular lockout and the game's late-feint adjustment still apply.",
    "StrikeAndStabFeintLockout.Y",
    true,
  ),
];
