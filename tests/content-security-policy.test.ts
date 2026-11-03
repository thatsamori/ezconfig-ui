import { describe, expect, test } from 'bun:test';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { config, proxy } from '../src/proxy';

// A browser's request for a page; the proxy reads nothing from the instance's settings.
const page = (path = '/') => proxy(new NextRequest(new URL(path, 'https://ezconfig.test'), { headers: { accept: 'text/html' } }));

function directives(response: Response): Map<string, string[]> {
  const policy = response.headers.get('Content-Security-Policy');
  expect(policy).toBeTruthy();
  return new Map(policy!.split(';').map(directive => directive.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources]));
}

const nonceOf = (response: Response) => directives(response).get('script-src')?.find(source => /^'nonce-[A-Za-z0-9+/]+={0,2}'$/.test(source));

describe('Content-Security-Policy', () => {
  test('a page response carries a nonce and the allowed sources', () => {
    const policy = directives(page());
    expect(policy.get('default-src')).toEqual(["'self'"]);
    const scripts = policy.get('script-src')!;
    expect(nonceOf(page())).toBeTruthy();
    expect(scripts).toContain("'strict-dynamic'");
    // Inline script needs the nonce: nothing in the policy lets it run without one.
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(policy.get('img-src')).toContain('https://cdn.discordapp.com');
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
  });

  test('the nonce changes per request', () => {
    const nonces = new Set(Array.from({ length: 5 }, () => nonceOf(page())));
    expect(nonces.size).toBe(5);
  });

  test('Next.js renders with the same policy, so its scripts carry the nonce', () => {
    const response = page();
    // How NextResponse.next hands the rewritten request headers on to rendering.
    expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(response.headers.get('Content-Security-Policy'));
    expect(`'nonce-${response.headers.get('x-middleware-request-x-nonce')}'`).toBe(nonceOf(response)!);
  });

  test('the policy names no instance-specific host', () => {
    const hosts = [...directives(page('/servers/1')).values()].flat().filter(source => source.includes('.'));
    expect(hosts.sort()).toEqual(['https://cdn.discordapp.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com']);
  });

  test('it covers every page, and not API routes, static files or prefetches', () => {
    const matches = (url: string, headers = {}) => unstable_doesMiddlewareMatch({ config, url, headers });
    for (const url of ['/', '/?sign-in=failed', '/servers/1', '/invites/abc']) expect(matches(url)).toBe(true);
    for (const url of ['/api/auth/session', '/_next/static/chunks/main.js', '/_next/image?url=x', '/favicon.ico']) expect(matches(url)).toBe(false);
    expect(matches('/', { 'next-router-prefetch': '1' })).toBe(false);
  });
});
