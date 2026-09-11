import type { ConfigEntry } from '@/lib/config/types';

const geometryKeys = new Set([
  'MaxParryAngle', 'MaxParryWeaponAngle', 'ForwardParryLength', 'ForwardParryHalfWidth',
  'LowBlockColliderRelativeOffsetLocation', 'LowBlockColliderRelativeOffsetRotation',
  'LowBlockColliderRelativeOffsetScale', 'HighBlockColliderRelativeOffsetLocation',
  'HighBlockColliderRelativeOffsetRotation', 'HighBlockColliderRelativeOffsetScale',
]);

/** Presentation only: all rows retain the existing Character/Parry wire category. */
export function parrySections(entries: ConfigEntry[]) {
  const sections: { title: string; entries: ConfigEntry[] }[] = [
    { title: 'Timing and recovery', entries: [] },
    { title: 'Angles and geometry', entries: [] },
    { title: 'Features', entries: [] },
  ];
  for (const entry of entries) {
    const index = entry.isFeatureToggle || entry.gatedBy ? 2 : geometryKeys.has(entry.configKey) ? 1 : 0;
    sections[index].entries.push(entry);
  }
  return sections.filter(section => section.entries.length > 0);
}
