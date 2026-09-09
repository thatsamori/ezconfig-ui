/** bun scripts/export-default-schema.ts <mod>/.scratch/ui-defaults/schema.json */
import { CHARACTER_CONFIG_OPTIONS } from '../src/lib/config/characterConfigSchema';
import { WEAPON_CONFIG_OPTIONS, CategoryName } from '../src/lib/config/weaponConfigSchema';
import type { ConfigEntry } from '../src/lib/config/types';

const output = process.argv[2];
if (!output) throw new Error('Pass the output path for the editor extractor.');
const keys = (groups: Record<string, ConfigEntry[]>) => Object.fromEntries(Object.entries(groups).map(([group, entries]) => [group, entries.map(({ configKey, dataType }) => ({ configKey, dataType }))]));
await Bun.write(output, JSON.stringify({ character: keys(CHARACTER_CONFIG_OPTIONS), weapon: keys(WEAPON_CONFIG_OPTIONS), weapons: Object.values(CategoryName) }, null, 2) + '\n');
console.log(`Wrote ${output}`);
