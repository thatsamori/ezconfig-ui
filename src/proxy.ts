/**
 * The Content-Security-Policy every page carries, with a fresh nonce per
 * request (online-platform#24). It backs up the Note sanitizer: inline script
 * without the nonce never runs.
 *
 * Next.js reads the nonce from the policy on the request and puts it on its
 * own scripts, so pages must render per request (the root layout waits for
 * `connection()`). Scripts those scripts load are trusted through
 * `'strict-dynamic'`. Styles stay `'unsafe-inline'`: Sonner, Radix and TipTap
 * insert `<style>` elements and React renders `style` attributes, none of them
 * with a nonce.
 *
 * The sources are the same for every instance: Discord avatars and the Google
 * Fonts stylesheet the root layout links.
 */
import { NextResponse, type NextRequest, type ProxyConfig } from 'next/server';

export const CONTENT_SECURITY_POLICY = 'Content-Security-Policy';
/** The request header that carries the nonce, for a component that must pass it on itself (`next/script`). */
export const NONCE_HEADER = 'x-nonce';

export function contentSecurityPolicy(nonce: string, development = process.env.NODE_ENV === 'development'): string {
  return [
    "default-src 'self'",
    // React's development build evaluates code to rebuild call stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' blob: data: https://cdn.discordapp.com",
    "font-src 'self' https://fonts.gstatic.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CONTENT_SECURITY_POLICY, policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set(CONTENT_SECURITY_POLICY, policy);
  return response;
}

export const config: ProxyConfig = {
  matcher: [{
    // Pages only: not API routes, static files, image optimization or the favicon, and not prefetches.
    source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
    missing: [
      { type: 'header', key: 'next-router-prefetch' },
      { type: 'header', key: 'purpose', value: 'prefetch' },
    ],
  }],
};
