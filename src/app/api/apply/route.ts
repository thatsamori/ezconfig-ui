/**
 * POST /api/apply
 *
 * Apply saved config to game via RCON.
 * Requires password authentication.
 *
 * Request body: { password: string, commands?: string[] }
 * - If commands provided: use those commands directly (selective apply)
 * - If commands not provided: build from saved config (full apply)
 *
 * Response: { success: boolean, commandsSent?: number, error?: string, failedAt?: string }
 */

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildRconCommands } from "@/lib/database/apply";
import { executeBatchCommands } from "@/lib/rcon/service";

interface ApplyRequest {
  password: string;
  commands?: string[];
  wipeDatabase?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApplyRequest;

    // Check if EZCONFIG_PASSWORD is configured
    if (!env.ezconfigPassword) {
      return NextResponse.json(
        {
          success: false,
          error: "EZCONFIG_PASSWORD not configured on server",
        },
        { status: 500 }
      );
    }

    // Validate password
    if (!body.password || body.password !== env.ezconfigPassword) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get commands: use provided commands or build from saved config
    let categoryCommands: string[];
    if (body.commands && body.commands.length > 0) {
      // Selective apply: use provided commands
      categoryCommands = body.commands;
    } else {
      // Full apply: build from saved config
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

    await executeBatchCommands(commands);

    return NextResponse.json({
      success: true,
      commandsSent: commands.length,
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
