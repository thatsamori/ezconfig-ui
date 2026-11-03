import { NextResponse } from 'next/server';
import { buildRconCommands } from '@/lib/database/apply';
import { readApplyRecord } from '@/lib/database/applyRecord';
import { requireSession } from '@/lib/platform/auth';
export async function GET(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    const [commands, lastApplied] = await Promise.all([buildRconCommands(), readApplyRecord()]);
    return NextResponse.json({
      commands,
      lastApplied,
      serverName: process.env.SERVER_NAME || process.env.NEXT_PUBLIC_SERVER_NAME || 'the server'
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Could not load preview'
    }, {
      status: 500
    });
  }
}
