import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCatalogueFiles, validateCatalogue } from "./catalogue-utils";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const data = await loadCatalogueFiles();
const errors = validateCatalogue(data);
if (errors.length) throw new Error(errors.join("\n"));

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "business"), { recursive: true });
const css = await readFile(path.join(root, "src", "static", "styles.css"), "utf8");
await writeFile(path.join(dist, "styles.css"), css);

const esc = (value: string) => value.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/styles.css"></head><body><main>${body}</main></body></html>`;

await writeFile(path.join(dist, "index.html"), shell("Global Official Business Facts", `<h1>Global Official Business Facts</h1><p>Official registry catalogue and normalized machine lookup infrastructure.</p><p><a href="/business/">Browse jurisdiction catalogue</a></p>`));

const rows = data.jurisdictions.map((j) => {
  const adapters = data.adapterManifests.filter((a) => a.jurisdictionId === j.id && a.promotionState === "PRODUCTION");
  return `<tr><td><a href="/business/${encodeURIComponent(j.slug)}/">${esc(j.name.canonical)}</a></td><td>${esc(j.jurisdictionType)}</td><td>${esc(j.researchStatus)}</td><td>${adapters.length ? "Available" : "Unavailable"}</td><td>${esc(j.lastReviewedAt ?? "Unknown")}</td></tr>`;
}).join("");
await writeFile(path.join(dist, "business", "index.html"), shell("Jurisdiction Catalogue", `<h1>Jurisdiction Catalogue</h1><p>Catalogue coverage is separate from production lookup support.</p><table><thead><tr><th>Jurisdiction</th><th>Type</th><th>Research</th><th>Production lookup</th><th>Last reviewed</th></tr></thead><tbody>${rows}</tbody></table>${data.jurisdictions.length === 0 ? "<p>No curated jurisdiction seed has been imported yet.</p>" : ""}`));

for (const j of data.jurisdictions) {
  const dir = path.join(dist, "business", j.slug);
  await mkdir(dir, { recursive: true });
  const registries = data.registries.filter((r) => r.jurisdictionId === j.id);
  const sources = data.sources.filter((s) => registries.some((r) => r.id === s.registryId));
  const adapters = data.adapterManifests.filter((a) => a.jurisdictionId === j.id && a.promotionState === "PRODUCTION");
  const body = `<p><a href="/business/">← Catalogue</a></p><h1>${esc(j.name.canonical)}</h1><dl><dt>Internal jurisdiction ID</dt><dd>${esc(j.id)}</dd><dt>Jurisdiction type</dt><dd>${esc(j.jurisdictionType)}</dd><dt>Research status</dt><dd>${esc(j.researchStatus)}</dd><dt>Last reviewed</dt><dd>${esc(j.lastReviewedAt ?? "Unknown")}</dd><dt>Machine lookup</dt><dd>${adapters.length ? "Available" : "No production adapter"}</dd></dl><h2>Official registries / sources</h2>${sources.length ? `<ul>${sources.map((s) => `<li><a href="${esc(s.url)}" rel="external">${esc(s.name)}</a> — ${esc(s.sourceKind)} / ${esc(s.sourceForm)}</li>`).join("")}</ul>` : "<p>No curated source record yet.</p>"}`;
  await writeFile(path.join(dir, "index.html"), shell(`${j.name.canonical} — Global Official Business Facts`, body));
}

await mkdir(path.join(dist, "machine"), { recursive: true });
await writeFile(path.join(dist, "machine", "catalogue.json"), JSON.stringify(data, null, 2));
console.log(`Generated ${data.jurisdictions.length} jurisdiction pages.`);
