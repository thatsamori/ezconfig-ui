import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ValueEditor } from '../../src/components/console/ValueEditor';
import { ConfigRow } from '../../src/components/weapons/ConfigRow';
import { NotesProvider } from '../../src/lib/notes/NotesContext';
import { MOVEMENT_CONFIG_OPTIONS } from '../../src/lib/config/movementConfigSchema';
import type { ConfigValue } from '../../src/lib/store/configStore';

const entry = MOVEMENT_CONFIG_OPTIONS.find(entry => entry.configKey === 'MaxWalkSpeed')!;
function Editor({ kind }: { kind: 'console' | 'row' }) {
  const [value, setValue] = useState<ConfigValue>();
  const [writes, setWrites] = useState(0);
  const onChange = (next: ConfigValue) => { setValue(next); setWrites(count => count + 1); };
  const onReset = () => { setValue(undefined); setWrites(count => count + 1); };
  return <section data-testid={kind}>
    <h2>{kind}</h2>
    {kind === 'console'
      ? <ValueEditor entry={entry} value={value} label="MaxWalkSpeed" onChange={onChange} onReset={onReset} />
      : <ConfigRow configEntry={entry} database="Character" category="Movement" value={value} onChange={onChange} onReset={onReset} />}
    <output data-testid="state">{JSON.stringify({ value: value ?? null, writes })}</output>
  </section>;
}
createRoot(document.getElementById('root')!).render(<NotesProvider><Editor kind="console" /><Editor kind="row" /></NotesProvider>);
