import { getConfigMutationState, useConfigStore, type ConfigState, type ConfigValue } from './configStore';

export const CONFIG_POLL_INTERVAL_MS = 2000;

export interface ConfigSyncStatus {
  savedAt: string | null;
  loading: boolean;
  error: string;
}

export interface EditingField { database: string; category: string; key: string }

function assignField(values: ConfigState['values'], field: EditingField, value: ConfigValue | undefined) {
  const { database, category, key } = field;
  const categories = database === 'Character' ? values.character : values.weapons[database] ??= {};
  const entries = categories[category] ??= {};
  if (value === undefined) delete entries[key];
  else entries[key] = value;
  if (!Object.keys(entries).length) delete categories[category];
  if (database !== 'Character' && !Object.keys(categories).length) delete values.weapons[database];
}

/** Keep the focused cell mounted with its draft; cache its incoming value so
 * blurring can catch up without downloading an unchanged config again. */
function preserveEditingField(values: ConfigState['values'], field: EditingField | null) {
  if (!field) return undefined;
  const { database, category, key } = field;
  const current = useConfigStore.getState().getValue(database, category, key);
  const categories = database === 'Character' ? values.character : values.weapons[database];
  const incoming = categories?.[category]?.[key];
  if (JSON.stringify(current) === JSON.stringify(incoming)) return undefined;
  assignField(values, field, current);
  return { field, incoming, held: current };
}

/** One instance per mounted console. Responses never acknowledge a newer save
 * than the snapshot they contain, and local writes invalidate in-flight reads. */
export function createConfigSync(options: {
  canApply: () => boolean;
  editingField?: () => EditingField | null;
  onStatus: (status: ConfigSyncStatus) => void;
}) {
  let revision: string | undefined;
  let savedAt: string | null = null;
  let busy = false;
  let disposed = false;
  let deferred: ReturnType<typeof preserveEditingField>;
  const controller = new AbortController();
  const status = (error = '') => {
    if (!disposed) options.onStatus({ savedAt, loading: revision === undefined, error });
  };
  async function read(url: string) {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
    if (!response.ok) throw new Error('Live updates unavailable. Retrying…');
    const data = await response.json();
    if (!data.success || typeof data.revision !== 'string') throw new Error('Live updates unavailable. Retrying…');
    return data;
  }
  return {
    async poll() {
      if (busy || disposed) return;
      busy = true;
      try {
        const before = getConfigMutationState();
        if (before.failed) { status('Some edits could not be saved. Retry those edits to resume live updates.'); return; }
        if (before.pending) return;
        if (revision !== undefined) {
          const metadata = await read('/api/config/revision');
          if (disposed) return;
          if (metadata.revision === revision) {
            const after = getConfigMutationState();
            if (before.epoch !== after.epoch || after.pending || after.failed || !options.canApply()) return;
            const editing = options.editingField?.();
            if (deferred && (!editing || editing.database !== deferred.field.database || editing.category !== deferred.field.category || editing.key !== deferred.field.key)) {
              const { database, category, key } = deferred.field;
              // Do not replay a cached remote value over a newer local edit.
              if (JSON.stringify(useConfigStore.getState().getValue(database, category, key)) === JSON.stringify(deferred.held)) {
                const values = structuredClone(useConfigStore.getState().values);
                assignField(values, deferred.field, deferred.incoming);
                useConfigStore.setState({ values, workingValues: values, savedValues: values });
              }
              deferred = undefined;
            }
            status();
            return;
          }
        }
        if (!options.canApply()) return;
        const snapshot = await read('/api/databases/overrides');
        const after = getConfigMutationState();
        if (disposed || !options.canApply() || before.epoch !== after.epoch || after.pending || after.failed) return;
        if (!snapshot.values?.character || !snapshot.values?.weapons) throw new Error('Could not load saved overrides. Retrying…');
        const values = snapshot.values as ConfigState['values'];
        deferred = preserveEditingField(values, options.editingField?.() ?? null);
        useConfigStore.setState({ values, workingValues: values, savedValues: values });
        revision = snapshot.revision;
        savedAt = snapshot.savedAt;
        status();
      } catch (error) {
        status(error instanceof Error ? error.message : 'Live updates unavailable. Retrying…');
      } finally {
        busy = false;
      }
    },
    dispose() { disposed = true; controller.abort(); },
  };
}
