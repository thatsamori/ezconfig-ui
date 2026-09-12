import { DataType, type ConfigEntry } from './types';

export const CAMERA_CONFIG_OPTIONS: ConfigEntry[] = [
  {
    configKey: 'CustomFOV',
    dataType: DataType.Bool,
    isImplemented: true,
    isFeatureToggle: true,
    defaultValue: false,
    documentation: 'Allows each player to choose and save an independent EZConfig FOV in Video Settings. Enabling this does not force a FOV: players keep their ordinary game setting until they choose a custom value. One local preference serves first and third person, including mounted and ladder views. Disabling the server option returns players to ordinary FOV without deleting their saved preferences; the player Reset control returns that player to ordinary FOV. Requires matching server and client paks.',
  },
  {
    configKey: 'CustomFOVMax',
    dataType: DataType.Float,
    isImplemented: true,
    gatedBy: 'CustomFOV',
    defaultValue: 120,
    minimum: 101,
    maximum: 179,
    integer: true,
    documentation: 'Optionally sets the highest base FOV a player may choose, in whole degrees from 101 to 179. Players may choose from 30 up to this maximum. A lower server limit temporarily limits a saved preference without overwriting it. This value stays stored while CustomFOV is off; resetting this server setting restores 120. Native camera effects apply to the chosen base in supported player views. Exactly 180 is excluded because its perspective projection collapses.',
  },
];
