/**
 * GET /api/apply/preview
 *
 * Returns the list of RCON commands that would be sent when applying config.
 * Used by SelectiveApplyDialog to show commands before applying.
 *
 * Response: { commands: string[] }
 */

import { NextResponse } from "next/server";
import { buildRconCommands } from "@/lib/database/apply";

export async function GET() {
  try {
    const commands = await buildRconCommands();

    return NextResponse.json({ commands });
  } catch (error) {
    console.error("Error fetching apply preview:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
