/** Platform storage migrations precede request readiness. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { registerServerStartup } = await import('./lib/server-startup');
  await registerServerStartup();
}
