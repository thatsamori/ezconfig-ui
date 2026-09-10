import type { BatchApplyResult } from "../../src/lib/rcon/batch";

/**
 * Explicit success outcome for existing known-valid transport fixtures. This
 * accepts fixture entries uniformly; it does not reproduce native validation.
 * Failure/sequencing/correlation behavior is exercised through the real sender
 * in the dedicated acknowledged-batch integration fixture.
 */
export function successfulProcessingFixture(commands: readonly string[]): BatchApplyResult {
  return {
    success: true, status: "complete", serverState: "complete",
    commandsSent: commands.length, commandsSucceeded: commands.length,
    acceptedValues: commands.reduce((count, command) => {
      const start = command.indexOf("{");
      return count + (start < 0 ? 0 : Object.keys(JSON.parse(command.slice(start))).length);
    }, 0),
    ignoredKeys: 0,
    configurationCleared: commands.includes("string ezconfig WipeDatabases"),
    batchToken: "known-valid-transport-fixture",
  };
}
