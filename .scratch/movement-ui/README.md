# Movement ticket 01 UI evidence

Verified 2026-09-08. Source ownership returned to the ticket 01 implementer
after these checks; native behavior and generated contracts are a separate
integration responsibility.

- `bun test ./tests`: 35 passed, 0 failed, 225 assertions.
- `bun x tsc --noEmit`: passed.
- `git diff --check`: passed. Targeted ESLint could not run because this
  repository has no `eslint.config.js`, `.mjs` or `.cjs` for installed ESLint 9;
  no lint configuration was introduced for this ticket.
- `node .scratch/movement-ui/verify.cjs C:/Users/chris/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`:
  passed in headless installed Edge for both `ValueEditor` and `ConfigRow`.
  The harness uses the production React components and temporary generated
  bundle, with no live user data. It serves an empty notes response only for
  the row's unrelated notes provider.

Both editors show Game default without a motion-variation claim. Customize,
blank draft, typing, blur, Cancel and Escape emit no saved value. Enter saves
zero; Use value saves a negative number; Reset removes the override. The
existing explicit draft component is reused without changing its interactions.

`tests/fixtures/movement-walk-review.ts` verifies the real store, save handler,
temporary persistence, review selection and apply handler. Only RCON transport
is mocked; store requests are routed directly into the real save handler.
Values 0, -100 and 450 survive the established two-decimal command formatting.
TimeToMaxSprint and ParryUpTime coexist and remain excluded from a walking-only
selection. The actual Reset store action removes MaxWalkSpeed, then the apply
handler emits WipeDatabases before the retained commands.

At the helper handoff MaxWalkSpeed was initially marked `isImplemented: false`,
had no numeric default and used `requiresExplicitValue: true`. The ticket owner
subsequently verified native walking/full-sprint effects and parser lifecycle,
set `isImplemented: true`, and documented units and native sprint recalculation.
The user explicitly accepted native threshold recalculation after a large live
change, while EZConfig itself preserves velocity/progress at command delivery.
The numeric default remains omitted. No generated
string schema, mod key list, builder or production asset was changed by this UI
helper. No server was contacted, and no packaging/deployment was performed.
