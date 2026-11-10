import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { probeOperator, reportHasErrors } from "./probe";
import { hasErrors, validateRecords, validateResponseBody } from "./validate";
import { isResource, RESOURCES, type Finding, type Resource } from "./types";

const USAGE = `Uso:
  validate <recurso> <arquivo.json>
      Valida um arquivo com um registro, uma lista de registros ou uma resposta
      completa ({ items, next_page_token, total_count }).

  probe <url-base> --token-env NOME [--resource <recurso>]...
        [--limit N] [--max-pages N]
      Consulta a API do operador e confere autenticação, erros, paginação e payloads.
      A credencial é lida da variável de ambiente indicada.

Recursos: ${RESOURCES.join(", ")}`;

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(2);
}

function parseResource(raw: string | undefined): Resource {
  if (raw === undefined || !isResource(raw)) fail(`recurso desconhecido: "${raw ?? ""}"`);
  return raw;
}

function printFindings(findings: Finding[]): void {
  for (const item of findings) {
    console.log(`  ${item.severity === "error" ? "ERRO" : "AVISO"}  ${item.where}: ${item.message}`);
  }
}

function runValidate(args: string[]): number {
  const [rawResource, file] = args;
  const resource = parseResource(rawResource);
  if (file === undefined) fail("informe o arquivo a validar");

  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  const findings = Array.isArray(data)
    ? validateRecords(resource, data)
    : typeof data === "object" && data !== null && "items" in data
      ? validateResponseBody(resource, data)
      : validateRecords(resource, [data]);

  if (findings.length === 0) {
    console.log(`${resource}: conforme`);
    return 0;
  }
  console.log(`${resource}: ${findings.length} problema(s)`);
  printFindings(findings);
  return hasErrors(findings) ? 1 : 0;
}

async function runProbe(args: string[], values: CliValues): Promise<number> {
  const [baseUrl] = args;
  if (baseUrl === undefined) fail("informe a URL base da API do operador");
  const tokenEnv = values["token-env"];
  if (tokenEnv === undefined) fail("informe --token-env com o nome da variável que guarda a credencial");
  const token = process.env[tokenEnv];
  if (token === undefined || token.length === 0) fail(`a variável de ambiente ${tokenEnv} está vazia ou não existe`);

  const report = await probeOperator({
    baseUrl,
    token,
    resources: (values.resource ?? []).map(parseResource),
    limit: Number(values.limit ?? "100"),
    maxPages: Number(values["max-pages"] ?? "5"),
    fetcher: (url, init) => fetch(url, init),
  });

  for (const item of report.resources) {
    const state = item.findings.length === 0 ? "conforme" : `${item.findings.length} problema(s)`;
    const coverage = item.pages === 0 ? "nada lido" : item.complete ? "completo" : "parcial (limite de páginas)";
    console.log(`${item.resource}: ${state}; ${item.records} registro(s) em ${item.pages} página(s), ${coverage}`);
    printFindings(item.findings);
  }
  return reportHasErrors(report) ? 1 : 0;
}

type CliValues = ReturnType<typeof readOptions>["values"];

function readOptions(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      resource: { type: "string", multiple: true },
      "token-env": { type: "string" },
      limit: { type: "string" },
      "max-pages": { type: "string" },
    },
  });
}

async function main(): Promise<number> {
  const { positionals, values } = readOptions(process.argv.slice(2));
  const [command, ...rest] = positionals;

  if (command === "validate") return runValidate(rest);
  if (command === "probe") return runProbe(rest, values);
  return fail("comando desconhecido ou ausente");
}

process.exit(await main());
