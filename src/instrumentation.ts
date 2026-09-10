/** Long-lived Node runtime integration. Builds and disabled deployments do no work. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { registerAutomaticSync } = await import("./lib/rcon/automatic-sync-bootstrap");
    await registerAutomaticSync();
  } catch (error) {
    console.error("[EZConfig sync] startup failed", error instanceof Error ? error.message : "Invalid configuration");
  }
}
