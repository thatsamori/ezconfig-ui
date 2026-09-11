import { DataType, type ConfigEntry } from './types';

/** Accept every finite JS input, then let native Float rounding set the range.
 * A raw -FLT_MAX minimum would reject negative values that round to -FLT_MAX.
 * This opts geometry into existing validation without changing other minima. */
export const GEOMETRY_VALIDATION_MIN = -Number.MAX_VALUE;

export const FORWARD_GEOMETRY_CONFIG_OPTIONS: ConfigEntry[] = [
  {
    configKey: 'ForwardParryLength',
    dataType: DataType.Float,
    isImplemented: true,
    defaultValue: 50,
    minimum: GEOMETRY_VALIDATION_MIN,
    documentation: 'Sets the full length of the native forward-parry region, in game distance units. It begins at the back of the main parry collider and retains its height and rotation. This controls the extra forward-parry check; ordinary parry rules still apply. Zero and negative values make that extra check return false, without disabling all parrying. Updates and Reset affect live characters, including an ongoing parry, at the next native check. An unconfigured width is preserved. EZ character default: 50. Cswics mod: ForwardParryDistance.X.',
  },
  {
    configKey: 'ForwardParryHalfWidth',
    dataType: DataType.Float,
    isImplemented: true,
    defaultValue: 10,
    minimum: GEOMETRY_VALIDATION_MIN,
    documentation: 'Sets the lateral half-width of the native forward-parry region, in game distance units. Its full width is twice this value; the main collider supplies height and rotation. In controlled stock-sword contacts, widening this region advanced the first native block; the effect depends on attack position and other parry rules. This controls the extra forward-parry check; ordinary parry rules still apply. Zero and negative values make that extra check return false, without disabling all parrying. Updates and Reset affect live characters, including an ongoing parry, at the next native check. An unconfigured length is preserved. EZ character default: 10. Cswics mod: ForwardParryDistance.Y.',
  },
];

export const BUBBLE_GEOMETRY_CONFIG_OPTIONS: ConfigEntry[] = [
  {
    configKey: 'EllipseBubbleRadius',
    dataType: DataType.Float,
    isImplemented: true,
    defaultValue: 109.75,
    minimum: GEOMETRY_VALIDATION_MIN,
    documentation: 'Sets the radius of this character\'s native movement-avoidance bubble, in game distance units. In a controlled hostile approach, a larger radius stopped the approaching player farther away. Zero and negative radius allowed approach to the unchanged physical capsule; they do not disable all collision. Applied changes affect ongoing movement at the next native update. Native friendly and vehicle rules still determine applicability. Configuring radius overrides its Tank/Dwarf size scaling; unconfigured length and height remain native. Reset restores the previously configured radius to its base class default; later size-perk rebuilds can rescale it. EZ character default before size perks: 109.75. Cswics mod: BubbleSize.X.',
  },
  {
    configKey: 'EllipseBubbleLength',
    dataType: DataType.Float,
    isImplemented: true,
    defaultValue: 20,
    minimum: GEOMETRY_VALIDATION_MIN,
    documentation: 'Sets the forward segment length of this character\'s native movement-avoidance bubble, in game distance units. In controlled frontal, lateral and rotated approaches, length 200 kept the approaching player farther away than zero. Zero and negative values are literal inputs: zero and -200 allowed closer frontal approach in the measured setup, without disabling physical collision. Changes and Reset affect ongoing movement at the next native update. Radius and height remain independent; native friendly and vehicle rules still determine applicability. Configuring length overrides its Tank/Dwarf size scaling. Reset restores the previously configured length to its base class default; later size-perk rebuilds can rescale it. EZ character default before size perks: 20. Cswics mod: BubbleSize.Y.',
  },
  {
    configKey: 'EllipseBubbleMaxHeightDiff',
    dataType: DataType.Float,
    isImplemented: true,
    defaultValue: 150,
    minimum: GEOMETRY_VALIDATION_MIN,
    documentation: 'Sets the maximum absolute vertical separation admitted by this character\'s native movement-avoidance bubble, in game distance units. The cutoff includes equality: at 16 units above or below the approaching player, 15 excluded avoidance while 16 and 17 included it. Zero admitted equal elevation; a negative value excluded avoidance in the tested ordinary player approach. Neither changes physical collision. Changes and Reset affect ongoing movement at the next native update. Radius and length remain independent; native friendly and vehicle rules still determine applicability. EZ character default: 150. Cswics mod: BubbleSize.Z.',
  },
];
