# Movement ticket 03 UI helper evidence

Verified 2026-09-08. Source ownership returns to the ticket 03 implementer after
these checks; native evidence, final descriptions and generated contracts are
the implementer's integration responsibility.

Added only PartialSprintModifier, SprintModifier, SprintAcceleration and
SupersprintModifier in the existing Movement schema array. Each is an
independent Float with no invented numeric default and requiresExplicitValue.
Initial isImplemented flags are false and descriptions are cautious until native
effects, units and timing are verified. Existing walking/crouch/directional
descriptions and the accepted native sprint-threshold clarification are intact.

TimeToMaxSprint source, type, 0.96 default and existing editor behavior were
preserved. Its final measured description must be supplied by the ticket owner.
No explicit-editor component changes or generated string-schema changes were
made by this helper.

The real-store fixture `tests/fixtures/movement-sprint-review.ts` routes store
HTTP requests into the actual save handler, persists temporary data, calls real
review/apply handlers and mocks only external RCON transport. It tests:

- All four new keys plus TimeToMaxSprint independently, including zero and
  negative inputs and both insertion orders.
- Selecting each key alone, excluding its neighbors from captured commands.
- Partial Reset preserving independent sprint/supersprint values and the
  existing TimeToMaxSprint value.
- WipeDatabases before retained commands and coexistence with MaxWalkSpeed,
  ordinary crouch and Recovery.
- Removal of all five tested keys preserving the adjacent saved controls.

Checks: `bun test ./tests/movement.test.ts` passed 4 tests/57 assertions;
`bun test ./tests` passed 37 tests/270 assertions; `bun x tsc --noEmit` and
`git diff --check` passed. Existing explicit-editor interaction coverage is
reused because the editor components and metadata routing did not change.

The ticket owner subsequently completed real-parser/native comparisons and
set all four entries to implemented. Final descriptions distinguish native
speed targets, acceleration in Unreal units per second squared, ramp time and
the actual attack supersprint window. TimeToMaxSprint retains its existing
default/editor behavior and now has a measured description. Final focused
Movement tests and typecheck passed again. Native evidence and the narrowly
authorized preexisting ChamberSlowdown default repair are documented in the
mod's `.scratch/movement-rules/ticket03-evidence.md`.
