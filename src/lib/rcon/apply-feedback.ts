import type { BatchApplyResult } from "./batch";

const values = (count: number) => `${count} config ${count === 1 ? "value" : "values"}`;

/** User-facing processing facts; never imply that a failed send reverted state. */
export function applyFeedback(result: BatchApplyResult, server: string): string {
  const ignored = result.ignoredKeys ? `; ignored ${result.ignoredKeys} unknown ${result.ignoredKeys === 1 ? "key" : "keys"}` : "";
  if (result.success) {
    if (result.configurationCleared && result.acceptedValues === 0) return `Cleared configuration on ${server}${ignored}.`;
    return `Processed ${values(result.acceptedValues)} on ${server}${ignored}.`;
  }
  if (result.status === "rejected") return `Apply did not start: ${result.error || "the server did not admit this submission"}.`;
  const cleared = result.configurationCleared ? " Configuration was cleared." : "";
  if (result.serverState === "complete") return `Server reported completion after confirmation was interrupted: processed ${values(result.acceptedValues)}${ignored}.${cleared}`;
  if (result.status === "unconfirmed") return `Apply confirmation was interrupted: ${values(result.acceptedValues)} confirmed${ignored}.${cleared} ${result.error || "Further processing is uncertain"}.`;
  return `Apply incomplete: processed ${values(result.acceptedValues)}${ignored}.${cleared} ${result.error || "The server stopped this submission"}.`;
}
