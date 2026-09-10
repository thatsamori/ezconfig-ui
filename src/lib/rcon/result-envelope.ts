/** Mordhau's native `listen custom` channel wraps the mod's result body once. */
export function unwrapCustomResult(payload: string): string {
  return payload.startsWith("Custom: ") ? payload.slice("Custom: ".length) : payload;
}
