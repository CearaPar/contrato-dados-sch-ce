import { describe, expect, test } from "bun:test";
import { validateRecord } from "../src/validate";
import type { JsonObject, Resource } from "../src/types";
import { firstExample, loadExample, without } from "./fixtures";

interface Case {
  name: string;
  resource: Resource;
  record: JsonObject;
  expectWhere: string;
}

function messages(resource: Resource, record: JsonObject): string[] {
  return validateRecord(resource, record, "r").map((item) => item.where);
}

const REJECTED: Case[] = [
  { name: "timestamp without Z", resource: "plants", record: { ...firstExample("plants"), updated_at: "2026-10-01T12:00:00-03:00" }, expectWhere: "r.updated_at" },
  { name: "null in a required field", resource: "plants", record: { ...firstExample("plants"), name: null }, expectWhere: "r.name" },
  { name: "empty string instead of null", resource: "buyers", record: { ...firstExample("buyers"), city: "" }, expectWhere: "r.city" },
  { name: "masked CNPJ", resource: "originators", record: { ...firstExample("originators"), document: "11.222.333/0001-81" }, expectWhere: "r.document" },
  { name: "unknown modality", resource: "plants", record: { ...firstExample("plants"), modality: "GEOTHERMAL" }, expectWhere: "r.modality" },
  { name: "OTHER without modality_description", resource: "plants", record: without(loadExample("plants")[1] ?? {}, "modality_description"), expectWhere: "r.modality_description" },
  { name: "latitude out of range", resource: "plants", record: { ...firstExample("plants"), latitude: 91 }, expectWhere: "r.latitude" },
  { name: "CAIP-2 malformed", resource: "measurements", record: { ...firstExample("measurements"), chain: "ethereum" }, expectWhere: "r.chain" },
  { name: "missing state", resource: "plants", record: without(firstExample("plants"), "state"), expectWhere: "r.state" },
  { name: "invalid Brazilian state", resource: "plants", record: { ...firstExample("plants"), state: "XX" }, expectWhere: "r.state" },
  { name: "plant outside Brazil", resource: "plants", record: { ...firstExample("plants"), country: "US" }, expectWhere: "r.country" },
  { name: "null notarization_hash", resource: "measurements", record: { ...firstExample("measurements"), notarization_hash: null }, expectWhere: "r.notarization_hash" },
  { name: "notarization_hash without chain", resource: "measurements", record: { ...firstExample("measurements"), chain: null }, expectWhere: "r.chain" },
  { name: "certificate unit volume other than 1", resource: "units", record: { ...firstExample("units"), unit_volume_m3: 2 }, expectWhere: "r.unit_volume_m3" },
  { name: "token_id without asset_reference", resource: "units", record: { ...firstExample("units"), asset_reference: null }, expectWhere: "r.asset_reference" },
  { name: "foreign currency without FX data", resource: "orders", record: without(firstExample("orders"), "fx_rate_brl", "fx_rate_source", "fx_rate_date"), expectWhere: "r.fx_rate_brl" },
  { name: "missing sold_measurements", resource: "orders", record: without(firstExample("orders"), "sold_measurements"), expectWhere: "r.sold_measurements" },
  { name: "reversal without reversal fields", resource: "orders", record: { ...firstExample("orders"), reversal_status: "REFUNDED" }, expectWhere: "r.reversed_at" },
  { name: "tx_hash without chain", resource: "orders", record: { ...firstExample("orders"), tx_hash: "0x1" }, expectWhere: "r.chain" },
  { name: "retirement transactions without chain", resource: "retirements", record: { ...firstExample("retirements"), chain: null }, expectWhere: "r.chain" },
  { name: "missing consumed_measurements", resource: "retirements", record: without(firstExample("retirements"), "consumed_measurements"), expectWhere: "r.consumed_measurements" },
  { name: "retirement without purpose", resource: "retirements", record: without(firstExample("retirements"), "purpose"), expectWhere: "r.purpose" },
  { name: "retirement purpose outside art. 22", resource: "retirements", record: { ...firstExample("retirements"), purpose: "OTHER" }, expectWhere: "r.purpose" },
];

describe("schema rules", () => {
  for (const item of REJECTED) {
    test(`rejects: ${item.name}`, () => {
      const where = messages(item.resource, item.record);
      expect(where.length).toBeGreaterThan(0);
      expect(where.some((entry) => entry === item.expectWhere || entry.startsWith(`${item.expectWhere}.`))).toBe(true);
    });
  }

  test("unknown fields are ignored", () => {
    expect(messages("plants", { ...firstExample("plants"), brand_new_field: 1 })).toEqual([]);
  });

  test("a pending measurement may omit notarization_hash", () => {
    const record = { ...without(firstExample("measurements"), "notarization_hash", "chain"), status: "PENDING" };
    expect(messages("measurements", record)).toEqual([]);
  });

  test("optional fields may be omitted or null", () => {
    expect(messages("buyers", loadExample("buyers")[1] ?? {})).toEqual([]);
  });
});

describe("cross-field consistency", () => {
  test("measurement volumes must add up to total_volume_m3 in orders", () => {
    const record = { ...firstExample("orders"), total_volume_m3: 999 };
    const findings = validateRecord("orders", record, "r");
    expect(findings.map((item) => item.where)).toContain("r.sold_measurements");
  });

  test("consumed measurement volumes must add up to total_volume_m3 in retirements", () => {
    const record = { ...firstExample("retirements"), total_volume_m3: 999 };
    const findings = validateRecord("retirements", record, "r");
    expect(findings.map((item) => item.where)).toContain("r.consumed_measurements");
  });

  test("BRL orders repeat gross_amount in gross_amount_brl", () => {
    const record = { ...(loadExample("orders")[1] ?? {}), gross_amount_brl: 1 };
    const findings = validateRecord("orders", record, "r");
    expect(findings.map((item) => item.where)).toContain("r.gross_amount_brl");
  });

  test("measurement period must not end before it starts", () => {
    const record = { ...firstExample("measurements"), period_end: "2026-08-01T00:00:00Z" };
    const findings = validateRecord("measurements", record, "r");
    expect(findings.map((item) => item.where)).toContain("r.period_end");
  });
});
