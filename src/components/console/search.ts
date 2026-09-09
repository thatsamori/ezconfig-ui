import { CHARACTER_CONFIG_OPTIONS, CharacterConfigGroupName } from '@/lib/config/characterConfigSchema';
import { WEAPON_CONFIG_OPTIONS } from '@/lib/config/weaponConfigSchema';
import { attackGroups, weapons } from './model';

export interface SearchDestination {
  id: string;
  label: string;
  path: string;
  tab: 'character' | 'weapons' | 'presets' | 'users';
  weapon?: string;
  group?: string;
  configKey?: string;
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const destinations: SearchDestination[] = [
  { id: 'character', label: 'Character', path: 'Page', tab: 'character' },
  { id: 'weapons', label: 'Weapons', path: 'Page', tab: 'weapons' },
  { id: 'presets', label: 'Presets', path: 'Page', tab: 'presets' },
  { id: 'users', label: 'Users', path: 'Page · Admin', tab: 'users' },
];

for (const group of Object.values(CharacterConfigGroupName)) {
  const entries = CHARACTER_CONFIG_OPTIONS[group];
  if (!entries.length) continue;
  destinations.push({ id: `character/${group}`, label: group, path: 'Character · Group', tab: 'character', group });
  for (const entry of entries) destinations.push({
    id: `character/${group}/${entry.configKey}`, label: entry.configKey,
    path: `Character · ${group}`, tab: 'character', group, configKey: entry.configKey,
  });
}
for (const weapon of weapons) {
  destinations.push({ id: `weapons/${weapon}`, label: weapon, path: 'Weapons', tab: 'weapons', weapon });
  for (const group of attackGroups) {
    for (const entry of WEAPON_CONFIG_OPTIONS[group === 'General' ? 'General' : 'Attack']) destinations.push({
      id: `weapons/${weapon}/${group}/${entry.configKey}`, label: entry.configKey,
      path: `${weapon} · ${group}`, tab: 'weapons', weapon, group, configKey: entry.configKey,
    });
  }
}
const index = destinations.map(destination => ({
  destination,
  label: normalize(destination.label),
  text: normalize(`${destination.tab} ${destination.path} ${destination.label}`),
}));

export function searchGlobal(query: string, context: { weapon: string; isAdmin: boolean }) {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  const phrase = normalize(query);
  const matches = index.filter(item => (context.isAdmin || item.destination.tab !== 'users') && (
    terms.length ? terms.every(term => item.text.includes(term)) : !item.destination.configKey
  ));
  const score = (item: typeof index[number]) =>
    (phrase && item.label === phrase ? 100 : phrase && item.label.startsWith(phrase) ? 50 : 0) +
    (terms.includes(item.label) ? 30 : 0) +
    (item.destination.group && terms.includes(normalize(item.destination.group)) ? 2 : 0) +
    (!item.destination.configKey ? 10 : 0) +
    (item.destination.weapon === context.weapon ? 5 : 0);
  matches.sort((a, b) => score(b) - score(a));
  return { total: matches.length, results: matches.slice(0, 50).map(item => item.destination) };
}
