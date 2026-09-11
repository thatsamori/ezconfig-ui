// Isolated browser fixture: callbacks update local React state only.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ValueEditor } from '../../src/components/console/ValueEditor';
import { CHARACTER_CONFIG_OPTIONS } from '../../src/lib/config/characterConfigSchema';
import { WEAPON_CONFIG_OPTIONS } from '../../src/lib/config/weaponConfigSchema';
import type { ConfigValue } from '../../src/lib/store/configStore';
import type { ConfigEntry } from '../../src/lib/config/types';

function Example({ entry, weapon = 'Character', group }: { entry: ConfigEntry; weapon?: string; group: string }) {
  const [value, setValue] = useState<ConfigValue>();
  const [writes, setWrites] = useState(0);
  const update = (next?: ConfigValue) => { setValue(next); setWrites(n => n + 1); };
  return <section style={{ display: 'grid', gridTemplateColumns: '300px 180px 200px', gap: 24, alignItems: 'center', padding: 12, borderBottom: '1px solid #333' }}>
    <span>{weapon} {group} {entry.configKey}</span>
    <ValueEditor entry={entry} database={weapon} category={group} value={value} label={`${weapon} ${group} ${entry.configKey}`} onChange={update} onReset={() => update(undefined)} debounceMs={0} />
    <output>{JSON.stringify({ value: value ?? null, writes })}</output>
  </section>;
}

function App() {
  const find = (key: string) => Object.values(CHARACTER_CONFIG_OPTIONS).flat().find(e => e.configKey === key)!;
  return <main style={{ padding: 32, maxWidth: 1000 }}>
    <h1>Actual defaults · isolated UI verification</h1>
    <Example entry={find('MaxWalkSpeed')} group="Movement" />
    <Example entry={find('RiposteWindowBase')} group="Parry" />
    <Example entry={find('AllowDrop')} group="General" />
    <Example entry={find('HighBlockColliderRelativeOffsetLocation')} group="Parry" />
    {['Strike', 'AltStrike', 'Stab', 'AltStab'].map(group => <Example key={group} entry={WEAPON_CONFIG_OPTIONS.Attack.find(e => e.configKey === 'Windup')!} weapon="ArmingSword" group={group} />)}
    <Example entry={WEAPON_CONFIG_OPTIONS.Attack.find(e => e.configKey === 'Damage')!} weapon="Greatsword" group="Strike" />
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
