import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ValueEditor } from '../../src/components/console/ValueEditor';
import { ATTACK_MOTION_CONFIG_OPTIONS } from '../../src/lib/config/attackMotionConfigSchema';

function App() {
  const [value, setValue] = useState<number | undefined>();
  const [writes, setWrites] = useState(0);
  return <main>
    <h1>StrikeFeintWindow</h1>
    <ValueEditor entry={ATTACK_MOTION_CONFIG_OPTIONS.find(e => e.configKey === 'StrikeFeintWindow')!}
      value={value} label="StrikeFeintWindow" onChange={v => { setValue(v as number); setWrites(n => n + 1); }}
      onReset={() => { setValue(undefined); setWrites(n => n + 1); }} />
    <output data-testid="state">{JSON.stringify({ value: value ?? null, writes })}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
