# Movement ticket 06 combined UI evidence

Added `tests/fixtures/movement-combined-review.ts`, invoked in its own process
by `tests/movement-combined.test.ts`. It follows the existing fixtures: real
store writes routed into the actual save handler, isolated temporary data,
actual persistence/review/selected apply, and only external RCON mocked.

The combined fixture asserts 13 distinct new implemented explicit Float keys,
22 total Movement keys, 170 distinct Character keys across 12 categories, and
63 Weapon entries. All 13 additions coexist in one saved configuration, inserted
in reverse order, with finite zero/signed values plus existing TimeToMaxSprint
and Recovery. It verifies combined selection and each of the 13 individually,
then partial Reset across component/crouch/equipment families with independent
siblings preserved, actual wipe-before-retained-command ordering, and removal
of all additions while TimeToMaxSprint and Recovery remain in transport.
It reuses the existing UI editing behavior without duplicate component tests.

Reviewed all 13 descriptions and TimeToMaxSprint for measured/native caveats.
Only the two duration descriptions needed changes: mode follows the weapon
performing the attack; fist attacks and kicks are supported; kicks use their
own attack mode rather than the held weapon's grip; couched attacks are excluded.
This wording was coordinated with the native owner and follows ticket05's
completed special-case proof. Existing native phase/offset/eligibility, captured
timing, omission/range-curve defaults and Cswics mappings are preserved. No
universal main-mode-only kick claim was added.

Validation: full UI suite 40 passed / 305 assertions; TypeScript --noEmit passed;
git diff --check passed (only existing line-ending warnings). After adding the
explicit all-13-Float assertion, the focused combined test passed again.
These are UI contract/transport results; native context conclusions remain with
ticket06's separate evidence. No generated schema, mod, editor/API state,
commit, packaging or deployment was touched. UI source ownership returns to
movement04_resume for final context wording, if needed, and integration handoff.

## Captured command artifact for native follow-through

`ticket06-captured-rcon.json` contains the exact final captured transport array
from an extra real-store/save/review/apply stage using ticket06's gameplay
values. It retains `string ` on the wipe, Movement command (all 13 plus
TimeToMaxSprint) and adjacent Recovery command (WorldRecoveryTime 0.65).
The artifact is explicit UTF-8 JSON with a `commands` array. Regenerate with
`EZCONFIG_CAPTURE_MOVEMENT_COMMANDS=1` while running the combined fixture;
normal tests exercise the stage without writing the workspace artifact.
The added stage and TypeScript passed. Earlier signed/zero and reset checks
remain unchanged. The native owner must record its own parser/playback result.
