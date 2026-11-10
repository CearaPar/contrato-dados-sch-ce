import type { Finding, JsonObject, Resource } from "./types";

const DECIMAL_TOLERANCE = 1e-6;

function numberField(record: JsonObject, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > DECIMAL_TOLERANCE;
}

function checkOrder(record: JsonObject, where: string): Finding[] {
  const findings: Finding[] = [];
  const total = numberField(record, "total_volume_m3");
  const measurements = record["sold_measurements"];

  if (total !== null && Array.isArray(measurements) && measurements.length > 0) {
    const sum = measurements.reduce<number>((acc, item) => {
      const volume = typeof item === "object" && item !== null ? (item as JsonObject)["volume_m3"] : null;
      return acc + (typeof volume === "number" ? volume : 0);
    }, 0);
    if (differs(sum, total)) {
      findings.push({
        severity: "error",
        resource: "orders",
        where: `${where}.sold_measurements`,
        message: `a soma dos volumes das medições (${sum}) difere de total_volume_m3 (${total})`,
      });
    }
  }

  const gross = numberField(record, "gross_amount");
  const grossBrl = numberField(record, "gross_amount_brl");
  if (record["currency"] === "BRL" && gross !== null && grossBrl !== null && differs(gross, grossBrl)) {
    findings.push({
      severity: "error",
      resource: "orders",
      where: `${where}.gross_amount_brl`,
      message: `em BRL, gross_amount_brl (${grossBrl}) deve repetir gross_amount (${gross})`,
    });
  }
  return findings;
}

function checkRetirement(record: JsonObject, where: string): Finding[] {
  const findings: Finding[] = [];
  const total = numberField(record, "total_volume_m3");
  const measurements = record["consumed_measurements"];

  if (total !== null && Array.isArray(measurements) && measurements.length > 0) {
    const sum = measurements.reduce<number>((acc, item) => {
      const volume = typeof item === "object" && item !== null ? (item as JsonObject)["volume_m3"] : null;
      return acc + (typeof volume === "number" ? volume : 0);
    }, 0);
    if (differs(sum, total)) {
      findings.push({
        severity: "error",
        resource: "retirements",
        where: `${where}.consumed_measurements`,
        message: `a soma dos volumes das medições (${sum}) difere de total_volume_m3 (${total})`,
      });
    }
  }
  return findings;
}

function checkMeasurement(record: JsonObject, where: string): Finding[] {
  const start = record["period_start"];
  const end = record["period_end"];
  if (typeof start !== "string" || typeof end !== "string") return [];
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs >= startMs) return [];
  return [
    {
      severity: "error",
      resource: "measurements",
      where: `${where}.period_end`,
      message: "period_end é anterior a period_start",
    },
  ];
}

/** Rules that span several fields and cannot be expressed in the JSON Schema. */
export function checkConsistency(resource: Resource, record: JsonObject, where: string): Finding[] {
  if (resource === "orders") return checkOrder(record, where);
  if (resource === "retirements") return checkRetirement(record, where);
  if (resource === "measurements") return checkMeasurement(record, where);
  return [];
}
