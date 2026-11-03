/**
 * Origins (online-platform#35): the Ruleset version a Draft or Live
 * configuration was last loaded from or saved as, and whether it is modified
 * from it.
 *
 * Modified compares the stored overrides exactly, over the values the current
 * schema has a place for: an override equal to its game default is not the
 * same as no override, and values the schema has no place for never count.
 * A deleted Ruleset has cleared every origin that pointed into it (0009).
 */
import { isDeepStrictEqual } from 'node:util';
import { documentFields } from '@/lib/config/valuesDocument';
import { platformStore } from './storage';

export interface Origin {
  rulesetId: number;
  rulesetName: string;
  versionId: number;
  /** The version's number within its Ruleset. */
  number: number;
  /** The configuration's values differ from the version's. */
  modified: boolean;
}

/** The values the current schema has a place for, by path. */
const placed = (document: unknown) => new Map(documentFields(document).filter(field => field.category).map(field => [JSON.stringify(field.path), field.value]));

/** Whether two values documents differ, compared exactly over the values the current schema has a place for. */
export function differentValues(a: unknown, b: unknown): boolean {
  const [left, right] = [placed(a), placed(b)];
  return left.size !== right.size || [...left].some(([path, value]) => !right.has(path) || !isDeepStrictEqual(right.get(path), value));
}

/** The origin a configuration with these values shows; null when it has none. */
export function originOf(originId: number | null, document: unknown): Origin | null {
  if (originId === null) return null;
  const row = platformStore().get<{ ruleset_id: number; name: string; number: number; overrides: string }>(
    'SELECT rulesets.id AS ruleset_id, rulesets.name, ruleset_versions.number, ruleset_versions.overrides FROM ruleset_versions JOIN rulesets ON rulesets.id = ruleset_versions.ruleset_id WHERE ruleset_versions.id = ?',
    originId,
  );
  return row ? { rulesetId: row.ruleset_id, rulesetName: row.name, versionId: originId, number: row.number, modified: differentValues(document, JSON.parse(row.overrides)) } : null;
}
