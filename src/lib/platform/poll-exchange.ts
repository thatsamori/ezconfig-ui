/**
 * Reading a poll: the Game server key from its `Authorization` header and
 * what its body reports. The fields are the published contract with the mod,
 * documented in docs/poll-exchange.md; a change here is a change there.
 *
 * Nothing here logs, and no error message repeats what the request sent.
 */

export const POLL_BODY_MAX_BYTES = 128 * 1024;
const ID_MAX = 64, NAME_MAX = 128, ERROR_MAX = 1000;

/** A config key the mod skipped because its build does not know it. */
export interface UnknownKey {
  /** `Character` or a weapon class, as in the delivered commands. */
  database: string;
  category: string;
  key: string;
}

/** How processing a delivered Live configuration ended, as the mod reports it. */
export interface ProcessingResult {
  success: boolean;
  acceptedValues: number;
  changedValues: number;
  unknownKeys: UnknownKey[];
  /** Where processing stopped and why; null when it succeeded. Database and category are '' when the wipe failed. */
  failure: { database: string; category: string; error: string } | null;
}

export interface PollReport {
  /** null when the mod sent '' (a build with no stamp). */
  buildStamp: string | null;
  instanceId: string;
  /** The Live configuration the mod last finished processing, with its result; null when it reports none. */
  processed: { liveConfigurationId: string; result: ProcessingResult } | null;
}

export type PollReportCheck = { ok: true; report: PollReport } | { ok: false; error: string };

/** The token of `Authorization: Bearer <token>`, or undefined when the header is missing or has another form. */
export function readBearerKey(request: Request): string | undefined {
  return /^\s*Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')?.[1];
}

class Invalid extends Error {}
type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

function object(value: unknown, path: string): Fields {
  if (!isObject(value)) throw new Invalid(`${path} must be a JSON object`);
  return value;
}

function text(value: unknown, path: string, { min = 0, max }: { min?: number; max: number }): string {
  if (typeof value !== 'string') throw new Invalid(`${path} must be a string`);
  if ([...value].length < min || [...value].length > max) throw new Invalid(min ? `${path} must be ${min} to ${max} characters` : `${path} must be at most ${max} characters`);
  return value;
}

function count(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Invalid(`${path} must be a whole number of 0 or more`);
  return value;
}

function result(value: unknown, path: string): ProcessingResult {
  const fields = object(value, path);
  if (typeof fields.success !== 'boolean') throw new Invalid(`${path}.success must be true or false`);
  if (!Array.isArray(fields.unknownKeys)) throw new Invalid(`${path}.unknownKeys must be an array`);
  const unknownKeys = fields.unknownKeys.map((entry, index) => {
    const at = `${path}.unknownKeys[${index}]`, unknown = object(entry, at);
    return {
      database: text(unknown.database, `${at}.database`, { min: 1, max: NAME_MAX }),
      category: text(unknown.category, `${at}.category`, { min: 1, max: NAME_MAX }),
      key: text(unknown.key, `${at}.key`, { min: 1, max: NAME_MAX }),
    };
  });
  let failure: ProcessingResult['failure'] = null;
  if (fields.success) {
    if (fields.failure !== undefined && fields.failure !== null) throw new Invalid(`${path}.failure must be absent or null when success is true`);
  } else {
    const stop = object(fields.failure, `${path}.failure`);
    if (typeof stop.error !== 'string') throw new Invalid(`${path}.failure.error must be a string`);
    failure = {
      database: text(stop.database, `${path}.failure.database`, { max: NAME_MAX }),
      category: text(stop.category, `${path}.failure.category`, { max: NAME_MAX }),
      // Kept, not refused: a long error must not stop the mod from reporting.
      error: [...stop.error].slice(0, ERROR_MAX).join(''),
    };
  }
  return {
    success: fields.success,
    acceptedValues: count(fields.acceptedValues, `${path}.acceptedValues`),
    changedValues: count(fields.changedValues, `${path}.changedValues`),
    unknownKeys,
    failure,
  };
}

/** Checks a poll's body against the contract. Fields the contract does not name are ignored. */
export function readPollReport(body: string): PollReportCheck {
  try {
    if (Buffer.byteLength(body) > POLL_BODY_MAX_BYTES) throw new Invalid(`The body must be at most ${POLL_BODY_MAX_BYTES} bytes`);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { throw new Invalid('The body must be JSON'); }
    const fields = object(parsed, 'The body');
    const buildStamp = text(fields.buildStamp, 'buildStamp', { max: ID_MAX });
    const instanceId = text(fields.instanceId, 'instanceId', { min: 1, max: ID_MAX });
    let processed: PollReport['processed'] = null;
    if (fields.processed !== undefined && fields.processed !== null) {
      const reported = object(fields.processed, 'processed');
      processed = {
        liveConfigurationId: text(reported.liveConfigurationId, 'processed.liveConfigurationId', { min: 1, max: ID_MAX }),
        result: result(reported.result, 'processed.result'),
      };
    }
    return { ok: true, report: { buildStamp: buildStamp || null, instanceId, processed } };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}
