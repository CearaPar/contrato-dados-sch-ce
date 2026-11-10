import { checkConsistency } from "./consistency";
import { envelopeValidator, errorValidator, recordValidator, toFindings } from "./contract";
import type { Finding, JsonObject, Resource } from "./types";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateRecord(resource: Resource, record: unknown, where: string): Finding[] {
  const validate = recordValidator(resource);
  if (!validate(record)) return toFindings(resource, where, validate.errors);
  if (!isObject(record)) return [];
  return checkConsistency(resource, record, where);
}

export function validateRecords(resource: Resource, records: unknown[], offset = 0): Finding[] {
  return records.flatMap((record, index) => validateRecord(resource, record, `items[${offset + index}]`));
}

/** Checks the envelope of section 1.3 and every item it carries. */
export function validateResponseBody(resource: Resource, body: unknown, offset = 0): Finding[] {
  const validateEnvelope = envelopeValidator();
  if (!validateEnvelope(body)) return toFindings(resource, "", validateEnvelope.errors);
  const items = (body as { items: unknown[] }).items;
  return validateRecords(resource, items, offset);
}

/** Checks the error object of section 1.4. */
export function validateErrorBody(resource: Resource | "-", body: unknown, where: string): Finding[] {
  const validate = errorValidator();
  if (validate(body)) return [];
  return toFindings(resource, where, validate.errors);
}

export function hasErrors(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === "error");
}
