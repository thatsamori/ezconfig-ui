/**
 * POST /proof/held-post
 *
 * Temporary (online-platform#22): holds the request, then answers. It proves
 * that a held POST is answered through Caddy and Next.js on Bun. The poll
 * endpoint (online-platform#26) replaces it, and this route goes with it.
 *
 * Body: optional JSON `{ "holdSeconds": 1..120 }`, default 120.
 * Response: `{ heldMs, runtime }`, or 400 for any other body.
 *
 * It sits outside `src/app/api/`, whose handlers all require a session; the
 * poll endpoint it stands in for is called by game servers, not browsers.
 */
const MAX_HOLD_SECONDS = 120;

async function readHoldSeconds(request: Request): Promise<number | undefined> {
  const text = await request.text();
  if (!text) return MAX_HOLD_SECONDS;
  try {
    const { holdSeconds = MAX_HOLD_SECONDS } = JSON.parse(text) as { holdSeconds?: unknown };
    return typeof holdSeconds === 'number' && Number.isInteger(holdSeconds) && holdSeconds >= 1 && holdSeconds <= MAX_HOLD_SECONDS ? holdSeconds : undefined;
  } catch { return undefined; }
}

export async function POST(request: Request) {
  const holdSeconds = await readHoldSeconds(request);
  if (holdSeconds === undefined) return Response.json({ error: `holdSeconds must be a whole number from 1 to ${MAX_HOLD_SECONDS}` }, { status: 400 });
  const started = performance.now();
  await new Promise(resolve => setTimeout(resolve, holdSeconds * 1000));
  const runtime = process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`;
  return Response.json({ heldMs: Math.round(performance.now() - started), runtime });
}
