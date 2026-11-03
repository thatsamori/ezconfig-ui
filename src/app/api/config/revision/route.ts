import { NextResponse } from 'next/server';
import { readConfigRevision, withConfigLock } from '@/lib/database/revision';
import { requireSession } from '@/lib/platform/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    const metadata = await withConfigLock(readConfigRevision);
    return NextResponse.json({ success: true, ...metadata }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not check config changes.' }, { status: 500 });
  }
}
