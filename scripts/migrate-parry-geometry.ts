// Retained manual entry point after the temporary startup hook is retired.
// Stop the webapp first. Explicit roots avoid accidentally targeting default data.
import { migrateParryGeometry } from '../src/lib/migrations/parry-geometry';

if (import.meta.main) {
  const [databasesRoot, presetsRoot, ...extra] = process.argv.slice(2);
  if (!databasesRoot || !presetsRoot || extra.length) throw new Error('Usage: bun run scripts/migrate-parry-geometry.ts <Databases root> <Presets root>');
  console.info(JSON.stringify(await migrateParryGeometry({ databasesRoot, presetsRoot }), null, 2));
}
