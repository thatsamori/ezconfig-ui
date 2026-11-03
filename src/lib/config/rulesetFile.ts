/**
 * A Ruleset file (online-platform#54): one Ruleset version as JSON, which a
 * server owner exports and sends to someone, who imports it as a new Ruleset
 * of their own.
 *
 *   { "format": "ezconfig-ruleset", "formatVersion": 1, "name": "<Ruleset name>",
 *     "description": "<the version's description>" | null, "values": <values document> }
 *
 * It holds nothing else: no owner, ids, Notes or Game server keys.
 *
 * A file that comes back is input from outside. Reading one checks only that it
 * is this format, which refuses the whole file. Its name, description and each
 * of its values are checked by the import (rulesets.ts).
 */
import { isObject, isValuesDocument, type ValuesDocument } from './valuesDocument';

export const RULESET_FILE_FORMAT = 'ezconfig-ruleset';
export const RULESET_FILE_VERSION = 1;
/** About three times a file of every key for every weapon. */
export const RULESET_FILE_LIMIT = 1024 * 1024;
export const RULESET_FILE_TOO_LARGE = 'This file is too large to be a Ruleset file';

const FIELDS = ['format', 'formatVersion', 'name', 'description', 'values'];
const NOT_A_RULESET_FILE = 'This file is not a Ruleset file exported from EZConfig';
const BAD_FORM = 'This Ruleset file is not in the expected form, so it may have been edited or damaged';

export type RulesetFileRead =
  | { ok: true; name: unknown; description: unknown; values: ValuesDocument }
  | { ok: false; error: string };

/** The file for one Ruleset version, with its values document as stored. */
export function writeRulesetFile(ruleset: { name: string; description: string | null; values: unknown }): string {
  const { name, description, values } = ruleset;
  return `${JSON.stringify({ format: RULESET_FILE_FORMAT, formatVersion: RULESET_FILE_VERSION, name, description, values }, null, 2)}\n`;
}

/** A file's text, if it is a Ruleset file of a format version this build reads. */
export function readRulesetFile(text: string): RulesetFileRead {
  let file: unknown;
  try {
    file = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { ok: false, error: `${NOT_A_RULESET_FILE}: it is not valid JSON` };
  }
  if (!isObject(file) || file.format !== RULESET_FILE_FORMAT) return { ok: false, error: NOT_A_RULESET_FILE };
  if (Number.isInteger(file.formatVersion) && (file.formatVersion as number) > RULESET_FILE_VERSION) {
    return { ok: false, error: `This Ruleset file is format version ${file.formatVersion}, and the platform reads up to version ${RULESET_FILE_VERSION}` };
  }
  if (file.formatVersion !== RULESET_FILE_VERSION || Object.keys(file).some(field => !FIELDS.includes(field)) || !isValuesDocument(file.values)) return { ok: false, error: BAD_FORM };
  return { ok: true, name: file.name, description: file.description, values: file.values };
}

/**
 * A Ruleset name as part of a file name: only letters, marks, numbers, spaces,
 * hyphens and underscores stay, so no quote, separator or control or
 * direction-changing character reaches the header or the owner's disk.
 */
const fileNamePart = (name: string, unsafe: RegExp) =>
  name.normalize('NFC').replace(unsafe, '-').replace(/-{2,}/g, '-').replace(/^[ -]+|[ -]+$/g, '');

/** The download's `Content-Disposition`: RFC 6266, with an ASCII name for clients that do not read `filename*`. */
export function rulesetFileDisposition(name: string, number: number): string {
  const fileName = (part: string) => `${part || 'Ruleset'} version ${number}.json`;
  const full = fileNamePart(name, /[^\p{L}\p{M}\p{N} _-]+/gu);
  return `attachment; filename="${fileName(fileNamePart(full, /[^A-Za-z0-9 _-]+/g))}"; filename*=UTF-8''${encodeURIComponent(fileName(full))}`;
}
