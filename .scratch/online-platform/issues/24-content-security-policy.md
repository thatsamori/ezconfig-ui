# 24: Content-Security-Policy with nonces

Status: open
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

- [ ] Each page response carries a policy that allows `'self'`, allows images
      from `cdn.discordapp.com` for Discord avatars, and blocks inline script
      that has no nonce.
- [ ] Next.js's own scripts carry the request's nonce. The sign-in page, the
      signed-in shell and the console editor work with no CSP violations in
      the browser console.
- [ ] The policy ships with the open-source core and holds no
      instance-specific host.
- [ ] A test checks the header on a page response: a nonce is present, it
      changes per request, and the allowed sources are listed.
- [ ] `bun run typecheck` and the full suite pass, and the lint count does not
      rise.
