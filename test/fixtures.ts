import { exampleItems } from "../src/contract";
import type { JsonObject, Resource } from "../src/types";

export function loadExample(resource: Resource): JsonObject[] {
  return structuredClone(exampleItems(resource));
}

export function firstExample(resource: Resource): JsonObject {
  const [first] = loadExample(resource);
  if (!first) throw new Error(`openapi.yaml: exemplo vazio em /${resource}`);
  return first;
}

export function without(record: JsonObject, ...keys: string[]): JsonObject {
  const copy: JsonObject = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
}
