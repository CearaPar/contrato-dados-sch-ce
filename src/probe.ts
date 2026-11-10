import { hasErrors, validateErrorBody, validateResponseBody } from "./validate";
import { RESOURCES, type Finding, type Resource } from "./types";

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

export interface ProbeOptions {
  baseUrl: string;
  token: string;
  resources: Resource[];
  limit: number;
  maxPages: number;
  fetcher: Fetcher;
}

export interface ResourceReport {
  resource: Resource;
  pages: number;
  records: number;
  complete: boolean;
  findings: Finding[];
}

export interface ProbeReport {
  resources: ResourceReport[];
}

export function authHeaders(token: string): Record<string, string> {
  return { Token: token, Accept: "application/json" };
}

function resourceUrl(baseUrl: string, resource: Resource, params: Record<string, string>): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${resource}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function finding(resource: Resource, where: string, message: string): Finding {
  return { severity: "error", resource, where, message };
}

async function readJson(response: Response): Promise<{ body: unknown; valid: boolean }> {
  const text = await response.text();
  try {
    return { body: JSON.parse(text), valid: true };
  } catch {
    return { body: null, valid: false };
  }
}

async function expectErrorResponse(
  options: ProbeOptions,
  resource: Resource,
  label: string,
  headers: Record<string, string>,
  params: Record<string, string>,
  expectedStatus: number,
): Promise<Finding[]> {
  const response = await options.fetcher(resourceUrl(options.baseUrl, resource, params), { headers });
  if (response.status !== expectedStatus) {
    return [finding(resource, label, `esperado HTTP ${expectedStatus}, recebido ${response.status}`)];
  }
  const { body, valid } = await readJson(response);
  if (!valid) return [finding(resource, label, "o corpo do erro não é JSON")];
  return validateErrorBody(resource, body, label);
}

async function probePages(options: ProbeOptions, resource: Resource): Promise<ResourceReport> {
  const findings: Finding[] = [];
  let pageToken: string | null = null;
  let pages = 0;
  let records = 0;
  let complete = false;

  while (pages < options.maxPages) {
    const params: Record<string, string> = { limit: String(options.limit) };
    if (pageToken) params["page_token"] = pageToken;
    const label = `GET /${resource} (página ${pages + 1})`;
    const response = await options.fetcher(resourceUrl(options.baseUrl, resource, params), {
      headers: authHeaders(options.token),
    });

    if (response.status !== 200) {
      findings.push(finding(resource, label, `esperado HTTP 200, recebido ${response.status}`));
      break;
    }
    const { body, valid } = await readJson(response);
    if (!valid) {
      findings.push(finding(resource, label, "o corpo da resposta não é JSON"));
      break;
    }
    if (typeof body === "object" && body !== null && "error" in body) {
      findings.push(finding(resource, label, "HTTP 200 com objeto de erro no corpo não é aceito (seção 1.4)"));
      break;
    }

    const bodyFindings = validateResponseBody(resource, body, records);
    findings.push(...bodyFindings.map((item) => ({ ...item, where: `${label}: ${item.where}` })));
    const envelope = body as { items?: unknown[]; next_page_token?: unknown; total_count?: unknown };
    if (!Array.isArray(envelope.items)) break;

    pages += 1;
    records += envelope.items.length;
    if (envelope.items.length > options.limit) {
      findings.push(finding(resource, label, `a página trouxe ${envelope.items.length} itens, acima do limit=${options.limit}`));
    }
    if (typeof envelope.total_count === "number" && envelope.total_count < records) {
      findings.push(finding(resource, label, `total_count (${envelope.total_count}) é menor que os ${records} registros já recebidos`));
    }
    if (typeof envelope.next_page_token !== "string") {
      complete = envelope.next_page_token === null;
      break;
    }
    pageToken = envelope.next_page_token;
  }

  return { resource, pages, records, complete, findings };
}

export async function probeResource(options: ProbeOptions, resource: Resource): Promise<ResourceReport> {
  const authHeader = authHeaders(options.token);
  const unauthenticated = await expectErrorResponse(
    options,
    resource,
    `GET /${resource} sem credencial`,
    { Accept: "application/json" },
    {},
    401,
  );
  const invalidParameter = await expectErrorResponse(
    options,
    resource,
    `GET /${resource}?updated_since=invalido`,
    authHeader,
    { updated_since: "invalido" },
    400,
  );
  const report = await probePages(options, resource);
  return { ...report, findings: [...unauthenticated, ...invalidParameter, ...report.findings] };
}

/** Exercises the operator API the way the consumer will: auth, errors, pagination, payloads. */
export async function probeOperator(options: ProbeOptions): Promise<ProbeReport> {
  const requested = options.resources.length > 0 ? options.resources : [...RESOURCES];
  const resources: ResourceReport[] = [];
  for (const resource of requested) resources.push(await probeResource(options, resource));
  return { resources };
}

export function reportHasErrors(report: ProbeReport): boolean {
  return report.resources.some((item) => hasErrors(item.findings));
}
