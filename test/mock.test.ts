import { beforeAll, describe, expect, test } from "bun:test";
import { createContractMock, toContractError } from "../src/mock";
import { probeOperator, type Fetcher } from "../src/probe";

const BASE_URL = "http://mock.local";

let fetcher: Fetcher;

beforeAll(async () => {
  const mock = await createContractMock();
  fetcher = (url, init) => mock(new Request(url, init));
});

describe("contract mock", () => {
  test("passes the whole probe", async () => {
    const report = await probeOperator({
      baseUrl: BASE_URL,
      token: "qualquer",
      resources: [],
      limit: 100,
      maxPages: 5,
      fetcher,
    });
    expect(report.resources.flatMap((item) => item.findings)).toEqual([]);
    expect(report.resources).toHaveLength(7);
  });

  test("answers an invalid parameter with 400 and the error object", async () => {
    const response = await fetcher(`${BASE_URL}/plants?updated_since=ontem`, { headers: { Token: "x" } });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_parameter");
    expect(body.error.message).toContain("updated_since");
  });

  test("answers a missing token with 401 and the error object", async () => {
    const response = await fetcher(`${BASE_URL}/plants`, { headers: {} });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthenticated" } });
  });

  test("fails loudly if Scalar changes its 422 body", async () => {
    const changed = Response.json({ detail: "outro formato" }, { status: 422 });
    await expect(toContractError(changed)).rejects.toThrow("Scalar mudou o corpo do 422");
  });
});
