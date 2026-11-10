import { describe, expect, test } from "bun:test";
import { authHeaders, probeOperator, reportHasErrors, type ProbeOptions } from "../src/probe";
import { FAKE_TOKEN, FakeOperator, type Quirk } from "./fake-operator";

function options(operator: FakeOperator, overrides: Partial<ProbeOptions> = {}): ProbeOptions {
  return {
    baseUrl: "https://operador.example",
    token: FAKE_TOKEN,
    resources: [],
    limit: 1,
    maxPages: 10,
    fetcher: operator.fetcher,
    ...overrides,
  };
}

async function probeWith(quirk: Quirk, overrides: Partial<ProbeOptions> = {}) {
  const operator = new FakeOperator(quirk);
  const report = await probeOperator(options(operator, overrides));
  return { operator, report };
}

function allFindings(report: Awaited<ReturnType<typeof probeOperator>>) {
  return report.resources.flatMap((item) => item.findings);
}

describe("probe", () => {
  test("a conforming operator passes every resource", async () => {
    const { report } = await probeWith("none");
    expect(allFindings(report)).toEqual([]);
    expect(reportHasErrors(report)).toBe(false);
    expect(report.resources.map((item) => item.resource)).toHaveLength(7);
  });

  test("follows page_token until the last page", async () => {
    const { report } = await probeWith("none", { resources: ["plants"] });
    const [plants] = report.resources;
    expect(plants?.pages).toBe(2);
    expect(plants?.records).toBe(2);
    expect(plants?.complete).toBe(true);
  });

  test("stops at max-pages and reports the run as partial", async () => {
    const { report } = await probeWith("never-ends", { resources: ["plants"], maxPages: 3 });
    const [plants] = report.resources;
    expect(plants?.pages).toBe(3);
    expect(plants?.complete).toBe(false);
  });

  test("sends the credential in the Token header, without Authorization", () => {
    expect(authHeaders(FAKE_TOKEN)).toEqual({ Token: FAKE_TOKEN, Accept: "application/json" });
  });

  test("a wrong credential fails the pages", async () => {
    const { report } = await probeWith("none", { token: "wrong", resources: ["buyers"] });
    expect(reportHasErrors(report)).toBe(true);
  });

  test("flags an operator that serves requests without credentials", async () => {
    const { report } = await probeWith("accepts-missing-auth", { resources: ["buyers"] });
    expect(allFindings(report).map((item) => item.where)).toContain("GET /buyers sem credencial");
  });

  test("flags an operator that ignores an invalid updated_since", async () => {
    const { report } = await probeWith("accepts-invalid-parameter", { resources: ["buyers"] });
    expect(allFindings(report).some((item) => item.where.includes("updated_since=invalido"))).toBe(true);
  });

  test("flags HTTP 200 carrying an error object", async () => {
    const { report } = await probeWith("error-with-http-200", { resources: ["buyers"] });
    expect(allFindings(report).some((item) => item.message.includes("esperado HTTP 400"))).toBe(true);
  });

  test("flags records that break the schema, with the page and index", async () => {
    const { report } = await probeWith("invalid-record", { resources: ["plants"] });
    const where = allFindings(report).map((item) => item.where);
    expect(where.some((entry) => entry.includes("página 1") && entry.includes("items[0].updated_at"))).toBe(true);
  });
});
