# Movement ticket 04 UI helper evidence

Verified 2026-09-08. Added SubSprintSpeedBonusEquipped and
SecondSubSprintSpeedBonusEquipped as two independent explicit Float controls in
Character/Movement. Both have absent numeric defaults and requiresExplicitValue.
Initial implementation flags remain false; descriptions are cautious pending
the native owner's findings. They do not promise a universal formula, reversed
movement, or removal of all equipment penalties. Prior Movement descriptions,
defaults and editor behavior are preserved.

`tests/fixtures/movement-equipment-review.ts` uses the actual store, save,
temporary persistence, review and selected-apply handlers, mocking only external
RCON transport. Store HTTP requests are routed into the real handler. Coverage:

- Independent main/alternate values in both insertion orders.
- Zero, -125 and 80.5 selected for each key without sending its sibling.
- Reset/removal of either key preserving the other, including explicit zero.
- WipeDatabases precedes retained commands in the actual apply-handler output.
- SprintModifier, TimeToMaxSprint, ordinary crouch and Recovery coexist and
  survive removal of both new overrides.

Checks: focused Movement tests passed 5 tests/70 assertions; full UI suite passed
38 tests/283 assertions; TypeScript and git diff whitespace checks passed.
The unchanged explicit-editor components reuse their ticket 01 interaction
coverage. No mod file, builder, generated string schema, editor/API state,
commit, packaging or deployment was touched by this helper. Final native-derived
descriptions, implementation flags and contract integration belong to the
ticket 04 owner after UI source ownership is returned.

## Resumed UI source review — 2026-09-08

Final candidate descriptions now lead with the measured walking-speed effect.
Main-mode wording gives the observed +0.2/-0.2 signs; alternate-mode wording
limits its sign claim to tested positive values. Both explain independent
logical modes through grip changes, native composition, ongoing update/wipe
semantics and Reset through the existing wipe-and-apply flow. Restoration names
each item's own class defaults without claiming all unconfigured state must be
reset. The Cswics mapping remains last, with no all-penalties promise or invented
universal numeric default, units or formula.

The candidate timing/mode/restoration wording describes the accepted production
contract and must be checked against ticket04's final integration evidence.
Both isImplemented flags remain false. The native pilot establishes walking
only; no claim is made that all states below full sprint were independently
validated, nor that alternate negative movement was measured by that pilot.

Changed only the two documentation strings in movementConfigSchema.ts and this
note. Existing fixture coverage was reviewed and left unchanged. Focused tests
passed 5/70, TypeScript --noEmit passed, and git diff --check passed (only existing
line-ending warnings). The prior full-suite baseline remains 38/283; a redundant
full rerun was not performed for this text-only edit. UI source ownership returns
to the ticket04 worker for integration, any native-evidence correction and eventual
flag activation after working consumers/parser proof. No generated contract,
mod assets, editor/API state, commit, push or deployment was touched.
