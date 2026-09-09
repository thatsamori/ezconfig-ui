# Movement ticket 05 UI evidence

Added `AttackSupersprintDuration` and `SecondAttackSupersprintDuration` as
independent explicit Float controls under Character/Movement. Both have no
numeric default, no gate/toggle and initially `isImplemented: false`. Existing
01-04 entries, implementation flags and editing components are preserved.

Provisional descriptions express seconds captured for each applicable new
logical main/alternate attack, preservation of the current capture through
later updates/wipes, native weapon/range-curve defaults when omitted, and Reset
through wipe-and-apply. They do not claim a whole-attack duration, universal
applicability, first-frame timing, or zero/negative native gameplay behavior.
Each ends with `Cswics mod: customMovementAccelerations.Z.` and explains that
Cswics assigned both modes together while EZConfig keeps them independent.
The native owner must finalize wording against measured evidence before marking
support. The helper does not claim parser/native timing proof.

`tests/fixtures/movement-attack-duration-review.ts` routes actual store HTTP
writes into the real save handler, using isolated temporary persistence,
real review and selected apply. Only external RCON transport is mocked.
It checks absent durations, both insertion orders, independent partial selection
for zero/-0.25/0.45, removal of either mode while retaining its sibling including
zero, actual wipe-before-retained-command ordering, removal of both modes and
preservation of SupersprintModifier, SprintAcceleration, TimeToMaxSprint,
equipment subsprint and Recovery. Existing explicit-editor coverage is reused.

Validation: focused Movement tests 6 passed / 91 assertions; full suite
39 passed / 304 assertions; TypeScript --noEmit and git diff --check passed
(only pre-existing line-ending warnings). These are UI boundary checks, not
evidence for native attack consumption.

UI source ownership returns to movement05_prepare for final text/flags and
contract integration. No generated string schema, mod file, Blueprint, editor
or API state, commit, push, packaging or deployment was touched by this helper.
