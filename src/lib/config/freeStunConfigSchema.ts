import { DataType, type ConfigEntry } from './types';

export const FREE_STUN_CONFIG_OPTIONS: ConfigEntry[] = [
  {
    configKey: 'FreeStun',
    dataType: DataType.Bool,
    isImplemented: true,
    isFeatureToggle: true,
    defaultValue: false,
    documentation: 'Replaces ordinary out-of-stamina disarms with a stun that retains the equipped weapon or shield, including stamina loss while chambering. Preserves loadout perks. Chftp keeps its independent duration and disarm settings. Turning this off or Reset affects subsequent events; an active replacement stun keeps its captured rules.',
  },
  {
    configKey: 'FreeStunDuration',
    dataType: DataType.Float,
    isImplemented: true,
    gatedBy: 'FreeStun',
    minimum: 0,
    defaultValue: 1.075,
    documentation: 'Seconds of FreeStun after replacing a stamina disarm. Zero removes the timed stun lockout. Stored and sent while FreeStun is disabled. Ordinary stamina stuns that would not disarm still use OutOfStaminaStunDuration. Each replacement captures its duration at the start; updates and Reset affect subsequent stuns.',
  },
];
