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
    documentation: `${documentation} Takes effect on the next parry; an ongoing parry keeps its base values through recovery. Cswics mod: ${cswicsReference}.`,
  };
}

export const BASE_PARRY_CONFIG_OPTIONS: ConfigEntry[] = [
  scalar(
    "GiveMissParryIfFlinchedBeforeDuration",
    "For a parry started directly from a flinch, how long after that flinch starts it can qualify for miss-parry detection, in seconds: 0.15 means 150 milliseconds. Higher values allow later parries to qualify; zero disables detection. Enabled TrueCombo also uses this window after intervening motions. This does not turn on TrueCombo or change its recovery or stamina settings.",
    "TrueComboValues.X; zero reproduces disableTrueComboDetector. The original combined TrueComboValues input also enabled its custom feature",
    true,
  ),
  // Initial uptime measured on an EZ weapon; stock/shield/context routing is
  // validated separately as coverage expands.
  scalar(
    "ParryUpTime",
    "How long a normal parry is active, in seconds: 0.3 means 300 milliseconds. Higher values give more time to block an incoming attack; lower values shorten that opportunity. Successful blocks and enabled parry features can change when the parry ends.",
    "customParryWindow",
    true,
  ),
  scalar(
    "ParryRecoveryTime",
    "Recovery after an ordinary parry, in seconds: 0.5 means 500 milliseconds. Higher values keep you in recovery longer; lower values let you act again sooner. Held-parry and post-flinch miss-parry recovery have separate controls.",
    "customParryRecoveryTime; set this and HeldParryRecoveryTime equally to reproduce its paired assignment",
    true,
  ),
  scalar(
    "HeldParryRecoveryTime",
    "Recovery after releasing a held parry, in seconds: 0.5 means 500 milliseconds. Higher values keep you in recovery longer; lower values let you act again sooner. This does not set ordinary or post-flinch miss-parry recovery.",
    "customParryRecoveryTime; set this and ParryRecoveryTime equally to reproduce its paired assignment",
    true,
  ),
  scalar(
    "MaxParryAngle",
    "Higher values make the main parry-angle check more forgiving of off-center attacks. Lower values tighten this check, but a hit may still pass the separate weapon-angle check. The exact angle geometry has not yet been verified.",
    "CustomParryAngles.X",
    true,
  ),
  scalar(
    "MaxParryWeaponAngle",
    "Higher values make the weapon-angle check more forgiving of off-center attacks. Lower values tighten this check, but a hit may still pass the separate main parry-angle check. The exact angle geometry has not yet been verified.",
    "CustomParryAngles.Y",
    true,
  ),
  scalar(
    "MissParryRecoveryTime",
    "Recovery for a parry recognized by the game's post-flinch miss-parry detector, in seconds: 0.25 means 250 milliseconds. Higher positive values prolong this recovery; lower positive values shorten it. Zero disables this special recovery path, so normal parry recovery applies. Setting this at least as high as normal parry recovery silences the miss-detect woosh; a shorter value keeps that cue. Enabled TrueCombo can override this recovery and silence the cue.",
    "ConfigMissDetectorRecovery",
    true,
  ),
  scalar(
    "EasyParryDuration",
    "How long after blocking an attack further parries use the game's successful-parry rules for stamina drain and timing, in seconds: 0.1 means 100 milliseconds. Higher values keep this assistance available longer; lower values shorten it.",
    "EasyParryDuration",
    true,
  ),
  scalar(
    "NonHeldParryExtensionAndRiposteWindowExtra",
    "Extra time for a successful non-held parry and its riposte opportunity, in seconds: 0.1 means 100 milliseconds. Higher values keep the parry active longer. This bonus can also extend the post-block duration set by ExperimentalParry.",
    "SuccessfulParryBonusDuration",
    true,
  ),
  scalar(
    "RiposteWindowBase",
    "The base time allowed to start a riposte after a successful parry, in seconds: 0.2 means 200 milliseconds. The successful-parry bonus can also affect this opportunity.",
    "ConfigRiposteWindow",
    true,
  ),
];
