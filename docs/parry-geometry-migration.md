# Parry transform category upgrade

This release moves the six `LowBlockColliderRelativeOffset*` and
`HighBlockColliderRelativeOffset*` location, rotation and scale keys from
Character/Combat to Character/Parry. Their names, Vector types and values stay
the same. Parry is the supported category for subsequent commands and presets.
There is no old-command alias or ongoing converter for imported legacy presets.

The temporary webapp startup hook runs before Next accepts normal requests and
before automatic synchronization is registered, even when automatic sync is
disabled. Builds, Edge execution and module imports do not run it. The app uses
one server process per storage installation; startup/HMR shares the existing
config transaction queue. Stop other processes or manual storage writers before
upgrading. This is not a distributed storage migration.

The upgrade inspects active `Databases/Character` files and every stored
`Presets/User/<name>/Character` pair. Only the six keys move. It keeps unrelated
Combat/Parry entries, other categories, weapons and preset manifests intact.
The shipped `GameDefault` preset contains only its manifest and is already
canonical. Static preset files are release assets, not startup migration inputs.

When a key exists in both categories, the Parry value wins by presence, including
a vector whose coordinates are all zero. Invalid JSON, non-object categories,
nonfinite data or malformed transform Vectors fail the upgrade before use.
A present invalid/falsy scalar in Parry is an error; it is never replaced with
the legacy Combat value. The migration does not repair unrelated invalid keys.

Before changing any category file, the migration records every affected pair's
exact original file text in `Databases/.parry-geometry-migration.backup.json`.
A missing original file is recorded as null. This immutable backup includes all
affected presets and is retained after completion. Application logs prefixed
`[EZConfig migration]` identify moved counts, conflict key names, canonical Parry
precedence and the backup location without logging values.

Each Parry replacement is written to a temporary file in its directory, flushed,
atomically renamed and verified before the corresponding Combat keys are removed
with the same write procedure. After every pair is verified, a separate
`.parry-geometry-migration.complete.json` receipt records the backup hash,
completion time and changes. Dot-files at the database root stay outside config
scanning and survive Reset All. A completed receipt makes later startups a no-op;
it does not convert a legacy preset imported afterward.

If startup fails, the app reports the storage error and does not register an
automatic responder or emit a wipe. Keep the backup and any receipt. Fix file
permissions or malformed input and restart. A pending migration recognizes only
the original or planned file contents and safely resumes interrupted writes.
Unexpected external edits block recovery: inspect them against the backup before
restoring the affected file to its original or planned content. Do not overwrite
the backup to silence an error. Backup/receipt disagreement or different storage
roots also requires inspection. Keep both files together if archiving an upgrade;
they contain saved configuration and should have the same access restrictions.
Next may still print its generic Ready line and remain running after a failed
instrumentation hook; configuration requests return HTTP 500. The migration
error and receipt, rather than that Ready line, establish upgrade success.

After successful startup, existing acknowledged synchronization still builds a
fresh canonical snapshot and wipes before applying it. This clears old in-game
Combat values. Migration completion alone does not mean a game sync succeeded.

Once the owner and the one external tester have successfully upgraded, remove
the call to `migrateParryGeometry` from `src/lib/server-startup.ts` in a later
cleanup release. Keep the migration module, tests and this manual entry point
for older installations. With the webapp stopped, supply explicit roots:

```powershell
bun run scripts/migrate-parry-geometry.ts 'C:\path\Databases' 'C:\path\Presets'
```

Tests use temporary roots only. The filesystem suite covers multiple presets,
zero-vector conflicts, malformed/falsy data, single-process concurrent startup,
unwritable destinations and interruptions around each category write and receipt.
The startup fixture verifies ordering, build/import no-ops and failure-before-sync.
Actual parser/geometry and browser acceptance evidence is tracked with ticket05
in the mod's geometry-rules work notes.
