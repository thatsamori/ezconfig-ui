import type { Origin } from '@/lib/platform/origins';

/** A configuration's origin as the pages name it: the Ruleset, the version, and Modified when the values differ from it. */
export function OriginLabel({ origin }: { origin: Origin }) {
  return <span className="origin-label"><span className="origin-name"><strong>{origin.rulesetName}</strong> version {origin.number}</span>{origin.modified ? <span className="modified-tag">Modified</span> : <span className="unmodified-tag">Unmodified</span>}</span>;
}
