import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { parse } from "yaml";
import type { Finding, JsonObject, Resource } from "./types";

const OPENAPI_PATH = join(import.meta.dir, "..", "openapi.yaml");
const CONTRACT_ID = "contract";
const SCHEMA_PREFIX = "#/components/schemas/";

interface Operation {
  responses: Record<string, { content?: Record<string, MediaType> }>;
}

interface MediaType {
  schema: JsonObject;
  examples?: Record<string, { value: { items: JsonObject[] } }>;
}

export interface ContractDocument {
  paths: Record<string, { get: Operation }>;
  components: { schemas: Record<string, JsonObject> };
}

/** openapi.yaml, the single source of the contract. */
export const contract = parse(readFileSync(OPENAPI_PATH, "utf8")) as ContractDocument;

function okContent(resource: Resource): MediaType {
  const content = contract.paths[`/${resource}`]?.get.responses["200"]?.content?.["application/json"];
  if (content === undefined) throw new Error(`openapi.yaml sem resposta 200 em /${resource}`);
  return content;
}

/** Name of the item schema in the 200 response of /<resource>: allOf [Page, { items: [<schema>] }]. */
export function itemSchemaName(resource: Resource): string {
  const [, page] = (okContent(resource).schema["allOf"] ?? []) as JsonObject[];
  const items = (page?.["properties"] as { items?: { items?: { $ref?: string } } } | undefined)?.items;
  const ref = items?.items?.$ref;
  if (ref === undefined || !ref.startsWith(SCHEMA_PREFIX)) throw new Error(`/${resource}: resposta 200 fora do formato Page + items`);
  return ref.slice(SCHEMA_PREFIX.length);
}

/** The records of the first example of the 200 response of /<resource>. */
export function exampleItems(resource: Resource): JsonObject[] {
  const [first] = Object.values(okContent(resource).examples ?? {});
  if (first === undefined) throw new Error(`openapi.yaml sem exemplo em /${resource}`);
  return first.value.items;
}

function buildAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  // Registers the components so "#/components/schemas/X" refs resolve inside the contract.
  ajv.addKeyword({ keyword: "components" });
  ajv.addSchema({ $id: CONTRACT_ID, components: contract.components }, CONTRACT_ID);
  return ajv;
}

const ajv = buildAjv();
const validators = new Map<string, ValidateFunction>();

function schemaValidator(name: string): ValidateFunction {
  const cached = validators.get(name);
  if (cached) return cached;
  const validate = ajv.compile({ $ref: `${CONTRACT_ID}${SCHEMA_PREFIX}${name}` });
  validators.set(name, validate);
  return validate;
}

export function recordValidator(resource: Resource): ValidateFunction {
  return schemaValidator(itemSchemaName(resource));
}

export function envelopeValidator(): ValidateFunction {
  return schemaValidator("Page");
}

export function errorValidator(): ValidateFunction {
  return schemaValidator("Error");
}

function toPointer(instancePath: string): string {
  return instancePath
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => (/^\d+$/.test(part) ? `[${part}]` : `.${part}`))
    .join("")
    .replace(/^\./, "");
}

/** Maps Ajv errors to findings, dropping the `if` bookkeeping errors. */
export function toFindings(
  resource: Resource | "-",
  prefix: string,
  errors: ErrorObject[] | null | undefined,
): Finding[] {
  if (!errors) return [];
  return errors
    .filter((issue) => issue.keyword !== "if")
    .map((issue) => {
      const missing = issue.keyword === "required" ? String(issue.params["missingProperty"]) : "";
      const path = [prefix, toPointer(issue.instancePath), missing].filter((part) => part.length > 0);
      return {
        severity: "error" as const,
        resource,
        where: path.join(".").replace(/\.\[/g, "["),
        message: issue.keyword === "required" ? "campo obrigatório ausente" : (issue.message ?? issue.keyword),
      };
    });
}
