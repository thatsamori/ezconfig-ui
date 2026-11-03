# 24: Content-Security-Policy with nonces

Status: completed
Type: task
Created: 2026-11-02
Blocked by: 23
Parent: [Spec: EZConfig online platform (V1)](../spec.md)

## What to build

Every page the platform serves carries a Content-Security-Policy with a fresh
nonce per request, set in Next.js middleware. It backs up the Note sanitizer:
inline script without the nonce never runs. Pages built in later slices
inherit it, so they must work under it.

## Acceptance criteria

- [x] Each page response carries a policy that allows `'self'`, allows images
      from `cdn.discordapp.com` for Discord avatars, and blocks inline script
      that has no nonce.
- [x] Next.js's own scripts carry the request's nonce. The sign-in page, the
      signed-in shell and the console editor work with no CSP violations in
      the browser console.
- [x] The policy ships with the open-source core and holds no
      instance-specific host.
- [x] A test checks the header on a page response: a nonce is present, it
      changes per request, and the allowed sources are listed.
- [x] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.

## Comments

2026-11-02: Done on branch `claude/op24-csp-nonces-c9d44a` (not pushed).
180 tests pass (175 before, 5 new), typecheck is clean, and lint stays at 20.

- The policy is set in `src/proxy.ts`, Next 16's name for middleware (it
  always runs on Node). It runs on every path except API routes,
  `_next/static`, `_next/image`, the favicon and prefetches:
  `default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self'
  blob: data: https://cdn.discordapp.com; font-src 'self'
  https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; form-action
  'self'; frame-ancestors 'none'`. In development, `script-src` also allows
  `'unsafe-eval'`, which React's development build needs.
- The proxy puts the policy on the request too. Next.js reads the nonce
  there and puts it on its own scripts. That only happens when a page renders
  per request, so the root layout awaits `connection()`; `next build` now
  lists `/` and `/_not-found` as dynamic. Pages added by later slices inherit
  both. The nonce is also in an `x-nonce` request header, for a component
  that has to pass it on itself (`next/script`).
- Google Fonts: the root layout links the Google Fonts stylesheet, which
  loads font files from `fonts.gstatic.com`, so `style-src` and `font-src`
  name both hosts. They are the same for every instance. Self-hosting the
  fonts would take them out of the policy.
- Styles allow `'unsafe-inline'`: Sonner, Radix's scroll lock and TipTap
  insert `<style>` elements and React renders `style` attributes, none of
  them with a nonce. Script is nonce-only.
- No `upgrade-insecure-requests`: the app runs over plain HTTP locally, and
  Caddy serves the platform over HTTPS with HSTS.
- Tests: `tests/content-security-policy.test.ts` calls the proxy for a page
  and checks the nonce, that it changes per request, the allowed sources, that
  the only hosts are Discord's CDN and Google Fonts, that the policy is handed
  on to rendering, and that the matcher covers pages but not API routes,
  static files or prefetches.
  `tests/fixtures/content-security-policy-next.ts` (run after
  `NEXT_BUILD_DIR=.next-automatic-sync-test/csp bun run build`) starts the
  built app on Bun with temp storage and a session. Every `<script>` on `/`
  (15) and on a 404 page (13) carries that response's nonce, two loads get
  different nonces, and `/api/auth/session` has no page policy. With
  `--keep-open` it leaves the server up and prints the session cookie, for a
  browser check.
- Browser check: that fixture's production server in the built-in browser
  (Chromium 152). The sign-in page, the signed-in shell, and the console
  editor all showed no CSP violations: a value edit, a Note posted with bold
  text from the TipTap editor, the Review & apply dialog (cancelled, not
  applied), search, the account menu and the weapons view. The only console
  errors were the two 401s from the signed-out session check. The avatar loaded
  from `cdn.discordapp.com` and the font stylesheet from Google. To confirm
  that the policy is enforced, an injected `<img onerror>` and a
  `javascript:` link were blocked and reported as violations, and `eval`
  was refused. `'strict-dynamic'` still lets a running script add a script
  with `createElement`: the policy stops injected markup, not code that
  already runs.
