/**
 * POST /api/apply
 *
 * Apply config to game via RCON.
 * Requires a platform session; the apply record names its server owner.
 *
 * Request body: { commands?: string[], wipeDatabase?: boolean }
 * - If commands provided: use those commands directly (selective apply)
 * - If commands not provided: build from config (full apply)
 * - wipeDatabase: if true (default), prepends WipeDatabases command
 *
 * Response: { success: boolean, commandsSent?: number, error?: string, failedAt?: string }
 */

import { NextResponse } from "next/server";
import { buildRconCommands } from "@/lib/database/apply";
import { executeAcknowledgedBatch } from "@/lib/rcon/service";
import { writeApplyRecord } from '@/lib/database/applyRecord';
import { cameraCommandError } from '@/lib/config/cameraPolicyValidation';
import { requireSession } from '@/lib/platform/auth';

interface ApplyRequest {
  commands?: string[];
  wipeDatabase?: boolean;
}

export async function POST(request: Request) {
  const session = requireSession(request);
  if (!session.ok) return session.response;
  try {
    const body = (await request.json()) as ApplyRequest;

    // Get commands: use provided commands or build from config
    let categoryCommands: string[];
    if (body.commands !== undefined) {
      if (!Array.isArray(body.commands) || !body.commands.every((command) => typeof command === 'string')) {
        return NextResponse.json({ success: false, error: 'Commands must be an array of strings' }, { status: 400 });
      }
      // Selective apply: use provided commands
      categoryCommands = body.commands;
      const error = cameraCommandError(categoryCommands);
      if (error) return NextResponse.json({ success: false, error, failedAt: 'validation' }, { status: 400 });
    } else {
      // Full apply: build from config
      categoryCommands = await buildRconCommands();
    }

    // Build full command list: optionally WipeDatabases first, then all category commands
    // wipeDatabase defaults to true if not specified (backwards compatible)
    const shouldWipe = body.wipeDatabase !== false;
    const commands = shouldWipe
      ? ["string ezconfig WipeDatabases", ...categoryCommands]
      : categoryCommands;

    console.log(`Applying config: ${commands.length} commands to send`);
    for (const cmd of commands) {
      console.log(`  - ${cmd.substring(0, 100)}${cmd.length > 100 ? "..." : ""}`);
    }

    const result = await executeAcknowledgedBatch(commands, { signal: request.signal });
    const serverConfirmedComplete = result.serverState === 'complete' && result.commandsSucceeded === commands.length;
    if (!result.success && !serverConfirmedComplete) return NextResponse.json(result, { status: result.failedAt === 'validation' ? 400 : result.status === 'rejected' ? 409 : 502 });
    // The server confirmed terminal processing; metadata failure is separate
    // and must not encourage replaying an already completed apply.
    let metadataWarning: string | undefined;
    await writeApplyRecord({ at: new Date().toISOString(), username: session.user.username, commands: result.commandsSucceeded, values: result.acceptedValues, ignored: result.ignoredKeys }).catch((error) => {
      console.error('Could not record last apply:', error);
      metadataWarning = 'Configuration was processed, but apply history could not be saved.';
    });

    return NextResponse.json({
      ...result,
      ...(metadataWarning ? { metadataWarning } : {}),
    });
  } catch (error) {
    console.error("Error in apply endpoint:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        failedAt: "RCON connection",
      },
      { status: 500 }
    );
  }
}
