import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import { documentIn, LANGUAGES, page, SCALAR_BUNDLE } from "./docs";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");

/**
 * Builds the standalone static documentation site for GitHub Pages.
 */
export async function buildStatic(destDir: string = DIST): Promise<void> {
  mkdirSync(destDir, { recursive: true });

  // 1. Copy Scalar browser bundle
  copyFileSync(SCALAR_BUNDLE, join(destDir, "scalar.js"));

  // 2. Generate index.html with relative paths
  writeFileSync(join(destDir, "index.html"), page("."), "utf8");

  // 3. Generate spec for each language (PT and EN)
  for (const language of LANGUAGES) {
    const doc = await documentIn(language);
    writeFileSync(join(destDir, `openapi.${language.slug}.yaml`), stringify(doc), "utf8");
  }

  // 4. .nojekyll to prevent GitHub Pages Jekyll processing
  writeFileSync(join(destDir, ".nojekyll"), "", "utf8");

  console.log(`Site estático gerado com sucesso em: ${destDir}`);
}

if (import.meta.main) {
  await buildStatic();
}
