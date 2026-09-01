/**
 * Build the self-contained static site for GitHub Pages.
 *
 * Reads the pipeline-generated data payload (produced by export-artifact-data.mts
 * from the seeded/ETL'd DuckDB store) and inlines it into site/template.html,
 * emitting site/dist/index.html — a single file with no external requests, so it
 * runs anywhere static files are served. Escapes script-context characters so the
 * JSON can never break out of its <script> tag.
 *
 *   npx tsx scripts/export-artifact-data.mts > site/data.json
 *   node scripts/build-site.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const templatePath = resolve(root, "site/template.html");
const dataPath = resolve(root, "site/data.json");
const outDir = resolve(root, "site/dist");
const outPath = resolve(outDir, "index.html");

const template = readFileSync(templatePath, "utf8");
let data = readFileSync(dataPath, "utf8");

// Escape characters that could break the <script> context or JS string parsing.
// All remain valid inside JSON when written as \uXXXX escapes. U+2028/U+2029 are
// valid JSON whitespace but illegal in JS strings, so they are escaped too.
// The regex is built from escape codes so this source file contains no literal
// line-separator characters.
const re = new RegExp("[\\u003c\\u003e\\u0026\\u2028\\u2029]", "g");
const map = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  " ": "\\u2028",
  " ": "\\u2029",
};
data = data.replace(re, (c) => map[c]);

if (!template.includes("__DATA__")) {
  console.error("build-site: template is missing the __DATA__ placeholder");
  process.exit(1);
}

const html = template.replace("__DATA__", () => data);
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, html);
// GitHub Pages: skip Jekyll processing of the static output.
writeFileSync(resolve(outDir, ".nojekyll"), "");

console.log(`build-site: wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);
