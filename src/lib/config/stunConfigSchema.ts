import { DataType, type ConfigEntry } from './types';
import { FREE_STUN_CONFIG_OPTIONS } from './freeStunConfigSchema';

export const STUN_CONFIG_OPTIONS: ConfigEntry[] = [{
  configKey: 'OutOfStaminaStunDuration',
  dataType: DataType.Float,
  isImplemented: true,
  minimum: 0,
  defaultValue: 1.075,
  documentation: 'Seconds of ordinary out-of-stamina stun, including stamina loss while chambering. Independent of FreeStun and Chftp. Zero removes the timed stun lockout; native disarming remains unchanged. Each stun captures its value when it starts. Updates and Reset affect subsequent stuns. Native stuns caused by hits rather than stamina loss retain their own duration.',
}, ...FREE_STUN_CONFIG_OPTIONS];
