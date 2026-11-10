import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { documentIn, handleDocs, LANGUAGES, type Language } from "../src/docs";

const TEXT_KEYS = ["title", "summary", "description"];

type Node = Record<string, unknown>;

/** JSONPath of every object with a text key, as the overlay writes it, mapped to its text keys. */
function textTargets(document: unknown): Map<string, string[]> {
  const targets = new Map<string, string[]>();
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (value === null || typeof value !== "object") return;
    const node = value as Node;
    const keys = TEXT_KEYS.filter((key) => typeof node[key] === "string");
    if (keys.length > 0) targets.set(path, keys);
    for (const [key, child] of Object.entries(node)) {
      if (!keys.includes(key)) walk(child, `${path}['${key}']`);
    }
  };
  walk(document, "$");
  return targets;
}

function withoutTexts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTexts);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Node).filter(([key, child]) => !(TEXT_KEYS.includes(key) && typeof child === "string"));
  return Object.fromEntries(entries.map(([key, child]) => [key, withoutTexts(child)]));
}

const [source, ...translations] = LANGUAGES as [Language, ...Language[]];

describe("documentation languages", () => {
  for (const language of translations) {
    test(`${language.slug} translates every text of openapi.yaml`, async () => {
      const overlay = parse(await Bun.file(language.overlay ?? "").text()) as { actions: { target: string; update: Node }[] };
      const translated = new Map(overlay.actions.map((action) => [action.target, Object.keys(action.update)]));
      expect(translated).toEqual(textTargets(await documentIn(source)));
    });

    test(`${language.slug} changes only texts`, async () => {
      expect(withoutTexts(await documentIn(language))).toEqual(withoutTexts(await documentIn(source)));
    });
  }

  test("fails when an overlay targets something openapi.yaml no longer has", async () => {
    const dir = mkdtempSync(join(tmpdir(), "overlay-"));
    const overlay = join(dir, "stale.overlay.yaml");
    writeFileSync(overlay, "overlay: 1.0.0\ninfo: {title: t, version: '1'}\nactions:\n  - target: $['components']['schemas']['Gone']\n    update: {title: x}\n");
    const stale: Language = { slug: "xx", title: "Stale", locale: "en", overlay };
    await expect(documentIn(stale)).rejects.toThrow("$['components']['schemas']['Gone']");
  });

  test("the page loads Scalar from this server, with no CDN or Scalar proxy", async () => {
    const html = await (await handleDocs(new Request("http://localhost/"))).text();
    expect(html).toContain('src="/scalar.js"');
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).not.toContain("proxy.scalar.com");
    for (const language of LANGUAGES) expect(html).toContain(`/openapi.${language.slug}.yaml`);
  });
});
