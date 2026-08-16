import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const seedPath = path.join(root, "data", "directory", "jurisdictions.seed.json");

const seed = JSON.parse(await readFile(seedPath, "utf8"));
if (seed?.schemaVersion !== "gobf-jurisdiction-directory-seed-v1" || !Array.isArray(seed.jurisdictions)) {
  throw new Error("Invalid jurisdiction directory seed");
}

const esc = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
})[char] ?? char);

const cleanSortKey = (value) => String(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9]+/g, " ")
  .trim()
  .toLowerCase();

const validateUrl = (value) => {
  if (!value) return "";
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error(`Unsafe official URL: ${value}`);
  }
  return url.toString();
};

const seen = new Set();
const jurisdictions = seed.jurisdictions.map((item) => {
  const country = String(item.country ?? "").trim();
  const iso2 = item.iso2 == null ? null : String(item.iso2).trim().toUpperCase();
  const iso3 = String(item.iso3 ?? "").trim().toUpperCase();
  if (!country || !/^[A-Z0-9]{3}$/.test(iso3)) throw new Error(`Invalid jurisdiction seed row: ${country}/${iso3}`);
  if (iso2 !== null && !/^[A-Z]{2}$/.test(iso2)) throw new Error(`Invalid ISO2 for ${iso3}`);
  if (seen.has(iso3)) throw new Error(`Duplicate ISO3: ${iso3}`);
  seen.add(iso3);
  return {
    country,
    iso2,
    iso3,
    officialUrl: validateUrl(String(item.officialUrl ?? "").trim()),
    urlSource: ["research", "inferred", "manual"].includes(item.urlSource) ? item.urlSource : null,
    queryFormat: String(item.queryFormat ?? "").trim(),
    formatSource: ["research", "inferred", "manual"].includes(item.formatSource) ? item.formatSource : null,
    lookupAvailable: item.lookupAvailable === true,
  };
}).sort((a, b) => cleanSortKey(a.country).localeCompare(cleanSortKey(b.country), "en") || a.iso3.localeCompare(b.iso3));

if (jurisdictions.length !== 250) {
  throw new Error(`Expected 250 jurisdictions, got ${jurisdictions.length}`);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const asset of ["styles.css", "review.js"]) {
  const content = await readFile(path.join(root, "src", "static", asset), "utf8");
  await writeFile(path.join(dist, asset), content);
}

const rows = jurisdictions.map((item, index) => {
  const code = [item.iso2, item.iso3].filter(Boolean).join(" / ");
  const link = item.officialUrl
    ? `<a class="official-link" href="${esc(item.officialUrl)}" target="_blank" rel="external noreferrer">Open official registry ↗</a>`
    : `<span class="no-link">No URL seeded</span>`;
  return `<article class="jurisdiction-row" data-iso3="${esc(item.iso3)}" data-country="${esc(item.country)}" data-iso2="${esc(item.iso2 ?? "")}" data-official-url="${esc(item.officialUrl)}" data-url-source="${esc(item.urlSource ?? "")}" data-initial-format="${esc(item.queryFormat)}" data-format-source="${esc(item.formatSource ?? "")}" data-lookup-available="${item.lookupAvailable ? "true" : "false"}">
    <div class="review-controls" aria-label="Review ${esc(item.country)}">
      <label><input class="js-searchable" type="checkbox"> 確認可查</label>
      <label><input class="js-issue" type="checkbox"> 有狀況</label>
    </div>
    <div class="country-block">
      <span class="row-number">${String(index + 1).padStart(3, "0")}</span>
      <div><h2>${esc(item.country)}</h2><div class="codes">${esc(code)}</div></div>
    </div>
    <label class="format-block">
      <span>查詢格式</span>
      <input class="js-format" type="text" autocomplete="off" spellcheck="false" value="${esc(item.queryFormat)}" placeholder="留空＝尚未確認">
    </label>
    <div class="link-block">${link}</div>
  </article>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="description" content="Official business registry links by jurisdiction, plus a paid live lookup interface where available.">
  <title>Global Official Business Facts</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="/review.js" defer></script>
</head>
<body>
  <main>
    <header class="intro">
      <p class="kicker">Global Official Business Facts</p>
      <h1>Official business registry links, in one place.</h1>
      <p>Use the list for free. Where automated lookup is available, machine clients can request one live official-source query for US$0.01.</p>
      <p class="small">This is an independent directory, not a government registry. Country rows are ordered alphabetically by English name.</p>
    </header>

    <section class="review-bar" aria-label="Local review controls">
      <div>
        <strong id="review-progress">Reviewed 0 / ${jurisdictions.length}</strong>
        <span id="save-status">Changes stay in this browser.</span>
      </div>
      <div class="review-actions">
        <button id="export-json" type="button">Export JSON</button>
        <button id="import-json" type="button">Import JSON</button>
        <input id="import-file" type="file" accept="application/json,.json" hidden>
      </div>
    </section>

    <section class="directory" aria-label="Jurisdiction directory">
      ${rows}
    </section>

    <footer>
      <a href="/jurisdictions.json">Machine-readable directory</a>
      <span> · </span>
      <a href="/api/v1/openapi.json">Lookup API</a>
    </footer>
  </main>
</body>
</html>`;

await writeFile(path.join(dist, "index.html"), html);

const publicDirectory = {
  schemaVersion: "gobf-jurisdiction-directory-v1",
  generatedAt: new Date().toISOString(),
  service: "Global Official Business Facts",
  lookupPrice: { amount: "0.01", currency: "USDC" },
  lookupEndpoint: "https://business.newbies.cool/api/v1/business/lookup",
  jurisdictions: jurisdictions.map(({ country, iso2, iso3, officialUrl, queryFormat, lookupAvailable }) => ({
    country, iso2, iso3, officialUrl, queryFormat, lookupAvailable
  })),
};
await writeFile(path.join(dist, "jurisdictions.json"), JSON.stringify(publicDirectory, null, 2) + "\n");

const headers = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
`;
await writeFile(path.join(dist, "_headers"), headers);
