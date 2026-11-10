import type { Fetcher } from "../src/probe";
import type { JsonObject, Resource } from "../src/types";
import { loadExample } from "./fixtures";

export type Quirk =
  | "none"
  | "accepts-missing-auth"
  | "accepts-invalid-parameter"
  | "error-with-http-200"
  | "invalid-record"
  | "never-ends";

const TOKEN = "secret-token";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function errorBody(code: string, message: string): JsonObject {
  return { error: { code, message } };
}

/** In-memory operator that follows the contract, with one switchable deviation. */
export class FakeOperator {
  readonly requests: string[] = [];

  constructor(private readonly quirk: Quirk = "none") {}

  readonly fetcher: Fetcher = async (url, init) => {
    this.requests.push(url);
    const parsed = new URL(url);
    const resource = parsed.pathname.replace(/^\//, "") as Resource;
    const headers = new Headers(init.headers);
    const authenticated = headers.get("Token") === TOKEN;

    if (!authenticated && this.quirk !== "accepts-missing-auth") {
      return json(401, errorBody("unauthenticated", "credencial ausente ou inválida"));
    }
    if (parsed.searchParams.get("updated_since") === "invalido" && this.quirk !== "accepts-invalid-parameter") {
      return this.quirk === "error-with-http-200"
        ? json(200, errorBody("invalid_parameter", "updated_since: formato inválido"))
        : json(400, errorBody("invalid_parameter", "updated_since: formato inválido"));
    }
    return this.page(resource, parsed);
  };

  private page(resource: Resource, url: URL): Response {
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const all = this.records(resource);
    const offset = Number(url.searchParams.get("page_token") ?? "0");
    const items = all.slice(offset, offset + limit);
    const end = offset + limit;
    const hasMore = this.quirk === "never-ends" || end < all.length;
    return json(200, {
      items,
      next_page_token: hasMore ? String(end) : null,
      total_count: all.length,
    });
  }

  private records(resource: Resource): JsonObject[] {
    const records = loadExample(resource);
    if (this.quirk !== "invalid-record") return records;
    return records.map((record) => ({ ...record, updated_at: "ontem" }));
  }
}

export const FAKE_TOKEN = TOKEN;
