import { createMockServer } from "@scalar/mock-server";
import { contract } from "./contract";

const DEFAULT_PORT = 4174;

/** Scalar's fixed 401 body. */
interface ScalarUnauthorized {
  error: string;
  message: string;
}

/** Scalar's fixed 422 body, sent when a request breaks the contract. */
interface ScalarViolations {
  error: string;
  violations: { location: string; path: string; message: string }[];
}

function contractError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Rewrites the two responses Scalar hardcodes into the error object of section 1.4:
 * 401 keeps its status, 422 becomes 400. Every other response passes through.
 */
export async function toContractError(response: Response): Promise<Response> {
  if (response.status === 401) {
    const body = (await response.json()) as ScalarUnauthorized;
    if (typeof body.message !== "string") throw new Error("Scalar mudou o corpo do 401");
    return contractError(401, "unauthenticated", body.message);
  }
  if (response.status === 422) {
    const body = (await response.json()) as ScalarViolations;
    if (!Array.isArray(body.violations)) throw new Error("Scalar mudou o corpo do 422");
    return contractError(400, "invalid_parameter", body.violations.map((item) => item.message).join("; "));
  }
  return response;
}

/** Scalar's mock server for openapi.yaml, answering errors as the contract requires. */
export async function createContractMock(): Promise<(request: Request) => Promise<Response>> {
  const app = await createMockServer({ document: contract as unknown as Record<string, unknown>, logger: false });
  return async (request) => toContractError(await app.fetch(request));
}

if (import.meta.main) {
  const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
  const fetch = await createContractMock();
  Bun.serve({ port, fetch });
  console.log(`Operador simulado em http://localhost:${port} (cabeçalho Token com qualquer valor)`);
}
