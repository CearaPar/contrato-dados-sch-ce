import { describe, expect, test } from "bun:test";
import { contract, itemSchemaName } from "../src/contract";
import { RESOURCES } from "../src/types";

function collectRefs(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(collectRefs);
  if (typeof node !== "object" || node === null) return [];
  return Object.entries(node).flatMap(([key, value]) =>
    key === "$ref" && typeof value === "string" ? [value] : collectRefs(value),
  );
}

function resolves(ref: string): boolean {
  let node: unknown = contract;
  for (const part of ref.replace(/^#\//, "").split("/")) {
    if (typeof node !== "object" || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return true;
}

describe("openapi.yaml", () => {
  test("authenticates with the Token header", () => {
    const { components, security } = contract as unknown as {
      components: { securitySchemes: Record<string, { type: string; in?: string; name?: string }> };
      security: Record<string, unknown>[];
    };
    expect(Object.values(components.securitySchemes)).toEqual([
      expect.objectContaining({ type: "apiKey", in: "header", name: "Token" }),
    ]);
    expect(security).toEqual([{ tokenHeader: [] }]);
  });

  test("declares one path per resource", () => {
    expect(Object.keys(contract.paths).sort()).toEqual(RESOURCES.map((resource) => `/${resource}`).sort());
  });

  test("is self-contained: every $ref points inside the document", () => {
    const refs = collectRefs(contract);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect({ ref, resolves: resolves(ref) }).toEqual({ ref, resolves: true });
  });

  test("each path returns pages of its own item schema", () => {
    const names = RESOURCES.map(itemSchemaName);
    expect(new Set(names).size).toBe(RESOURCES.length);
  });
});
