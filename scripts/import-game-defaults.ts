/** bun scripts/import-game-defaults.ts <mod>/.scratch/ui-defaults/extracted.json */
const input = process.argv[2];
if (!input) throw new Error('Pass the editor extraction JSON path.');
const { errors, ...snapshot } = await Bun.file(input).json();
if (!Array.isArray(errors) || errors.length) throw new Error(`Extraction failed: ${JSON.stringify(errors)}`);
snapshot.provenance = {
  extractedOn: new Date().toISOString().slice(0, 10),
  source: 'Mordhau SDK class defaults; EZ character and weapons, stock motions referenced by runtime profiles',
  precision: 'six decimal places; no live player/loadout/perk adjustments',
};
await Bun.write(new URL('../src/lib/config/gameDefaults.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n');
console.log('Imported defaults. Run bun test ./tests/game-defaults.test.ts before accepting the snapshot.');
