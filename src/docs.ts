import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openapiOverlay, type OpenAPIOverlayOptions } from "openapi-format";
import { parse, stringify } from "yaml";

const ROOT = join(import.meta.dir, "..");
const OPENAPI_PATH = join(ROOT, "openapi.yaml");
const CONFIG_PATH = join(ROOT, "scalar.config.json");
export const SCALAR_BUNDLE = join(ROOT, "node_modules", "@scalar", "api-reference", "dist", "browser", "standalone.js");
const DEFAULT_PORT = 4173;

export interface Language {
  /** Slug in the page URL and the document file name. */
  slug: string;
  /** Label in Scalar's document selector. */
  title: string;
  /** Locale of Scalar's interface labels. */
  locale: string;
  /** Overlay that translates the texts of openapi.yaml; absent for the source language. */
  overlay?: string;
}

/** openapi.yaml is written in Portuguese; every other language is an OpenAPI Overlay over it. */
export const LANGUAGES: Language[] = [
  { slug: "pt", title: "Português", locale: "pt" },
  { slug: "en", title: "English", locale: "en", overlay: join(ROOT, "i18n", "en.overlay.yaml") },
];

type OpenApiDocument = Record<string, unknown>;

function readYaml<T>(path: string): T {
  return parse(readFileSync(path, "utf8")) as T;
}

/** openapi.yaml in the given language. Fails if an overlay action matches nothing. */
export async function documentIn(language: Language): Promise<OpenApiDocument> {
  const source = readYaml<OpenApiDocument>(OPENAPI_PATH);
  if (language.overlay === undefined) return source;
  const overlaySet = readYaml<OpenAPIOverlayOptions["overlaySet"]>(language.overlay);
  const { data, resultData } = await openapiOverlay(source, { overlaySet });
  const unused = resultData["unusedActions"] as { target: string }[];
  if (unused.length > 0) {
    throw new Error(`${language.overlay}: alvos inexistentes no openapi.yaml: ${unused.map((item) => item.target).join(", ")}`);
  }
  return data as OpenApiDocument;
}

function documentPath(language: Language, basePath: string = ""): string {
  const prefix = basePath ? `${basePath}/` : "/";
  return `${prefix}openapi.${language.slug}.yaml`;
}

/** One Scalar configuration per language, so the document selector also switches the interface labels. */
function scalarConfigurations(basePath: string = ""): Record<string, unknown>[] {
  const base = readYaml<Record<string, unknown>>(CONFIG_PATH);
  return LANGUAGES.map((language, index) => ({
    ...base,
    title: language.title,
    slug: language.slug,
    url: documentPath(language, basePath),
    default: index === 0,
    localization: { locale: language.locale },
  }));
}

export function page(basePath: string = ""): string {
  const configurations = JSON.stringify(scalarConfigurations(basePath)).replaceAll("<", "\\u003c");
  const scriptSrc = basePath ? `${basePath}/scalar.js` : "/scalar.js";
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Contrato de dados do SCH-CE</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${scriptSrc}"></script>
    <script>Scalar.createApiReference("#app", ${configurations})</script>
  </body>
</html>`;
}

/** Serves the Scalar reference from the installed package, with no CDN and no Scalar proxy. */
export async function handleDocs(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === "/") return new Response(page(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  if (pathname === "/scalar.js") return new Response(Bun.file(SCALAR_BUNDLE));
  const language = LANGUAGES.find((item) => documentPath(item) === pathname);
  if (language === undefined) return new Response("não encontrado", { status: 404 });
  return new Response(stringify(await documentIn(language)), { headers: { "Content-Type": "application/yaml; charset=utf-8" } });
}

if (import.meta.main) {
  const port = Number(process.env["PORT"] ?? DEFAULT_PORT);
  Bun.serve({ port, fetch: handleDocs });
  console.log(`Documentação em http://localhost:${port} (recarregue a página depois de editar o openapi.yaml)`);
}
