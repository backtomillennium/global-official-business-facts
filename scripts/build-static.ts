import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Catalogue } from "../src/catalogue/catalogue";
import { serializePublicMachineCatalogue } from "../src/catalogue/public-catalogue";
import { loadCatalogueFiles, validateCatalogue } from "./catalogue-utils";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const data = await loadCatalogueFiles();
const errors = validateCatalogue(data);
if (errors.length) throw new Error(errors.join("\n"));
const catalogue = new Catalogue(data);

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "business"), { recursive: true });
for (const page of ["privacy", "support", "terms"]) await mkdir(path.join(dist, page), { recursive: true });
const css = await readFile(path.join(root, "src", "static", "styles.css"), "utf8");
await writeFile(path.join(dist, "styles.css"), css);

const esc = (value: string) => value.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
const safeExternalUrl = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`Unsafe external URL: ${value}`);
  return esc(url.toString());
};
const disclaimer = `<aside class="disclaimer" aria-label="Service disclaimer"><strong>Important</strong><p>Global Official Business Facts is not an official registry.</p><p>Facts are retrieved from identified official sources and normalized for machine use. Source scope, update frequency and legal meaning vary by jurisdiction. For authoritative or legally certified information, consult the originating registry.</p></aside>`;
const paymentNotice = `<aside class="notice" aria-label="Paid lookup notice"><strong>Paid lookup notice</strong><p>$0.01 USDC buys one syntactically valid lookup execution attempt. Payment is settled before the official source is queried, so NOT_FOUND may still be charged. Local validation and signed-request capacity-limit failures occur before settlement. If the API returns <span class="mono">PAYMENT_OUTCOME_UNKNOWN</span>, do not reuse the same payment authorization. Read the <a href="/terms/">service terms</a> before paying.</p></aside>`;
const shell = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Normalized official business facts from identified government and registry sources."><title>${esc(title)}</title><link rel="stylesheet" href="/styles.css"></head><body><header class="site-header"><a class="wordmark" href="/">Global Official Business Facts</a><nav aria-label="Primary"><a href="/business/">Jurisdictions</a><a href="/api/v1/openapi.json">OpenAPI</a><a href="/api/v1/catalogue">Catalogue API</a><a href="/terms/">Terms</a><a href="/privacy/">Privacy</a><a href="/support/">Support</a></nav></header><main>${body}${disclaimer}</main><footer><p>Source-linked official facts · typed identifiers · no scraped global company master database</p><p><a href="/terms/">Terms</a> · <a href="/privacy/">Privacy</a> · <a href="/support/">Support</a></p></footer></body></html>`;

const production = data.adapterManifests.filter((manifest) => manifest.promotionState === "PRODUCTION");
const cards = data.jurisdictions.map((jurisdiction) => {
  const manifest = production.find((item) => item.jurisdictionId === jurisdiction.id);
  const scheme = data.identifierSchemes.find((item) => item.id === jurisdiction.defaultIdentifierSchemeId);
  return `<article class="card"><p class="eyebrow">${esc(jurisdiction.iso2 ?? jurisdiction.id)}</p><h3><a href="/business/${esc(jurisdiction.slug)}/">${esc(jurisdiction.name.canonical)}</a></h3><p>${manifest ? "Live exact-identifier adapter" : "Machine adapter not enabled"}</p><p class="mono">${esc(scheme?.id ?? "No production scheme")}</p></article>`;
}).join("");

await writeFile(path.join(dist, "index.html"), shell("Global Official Business Facts", `<section class="hero"><p class="eyebrow">V1 · official-source lookup</p><h1>Global Official Business Facts</h1><p class="lede">Official business facts from government and registry sources, normalized into one machine-readable interface.</p><p class="principles">Source-linked.<br>Typed identifiers.<br>No scraped global company master database.</p><div class="actions"><a class="button" href="/business/">View live adapters</a><a class="button secondary" href="/api/v1/openapi.json">Read OpenAPI</a></div></section>${paymentNotice}<section aria-labelledby="live-adapters"><div class="section-heading"><h2 id="live-adapters">Live adapters</h2><p>Paid exact lookup: $0.01 USDC per lookup attempt.</p></div><div class="cards">${cards}</div></section><section class="research-note"><h2>Global research, selective production access</h2><p>Global registry availability research covered 250 jurisdictions. Machine lookup is enabled only where technical and reuse verification passed.</p></section>`));

const rows = data.jurisdictions.map((jurisdiction) => {
  const manifest = production.find((item) => item.jurisdictionId === jurisdiction.id);
  return `<tr><th scope="row"><a href="/business/${esc(jurisdiction.slug)}/">${esc(jurisdiction.name.canonical)}</a></th><td>${esc(jurisdiction.iso2 ?? "—")}</td><td>${manifest ? "Production" : "Unavailable"}</td><td>${esc(jurisdiction.defaultIdentifierSchemeId ?? "—")}</td><td>${esc(jurisdiction.lastReviewedAt ?? "Unknown")}</td></tr>`;
}).join("");
await writeFile(path.join(dist, "business", "index.html"), shell("Live jurisdictions — Global Official Business Facts", `<p class="breadcrumb"><a href="/">Home</a> / Jurisdictions</p><h1>Live jurisdictions</h1><p class="lede compact">Production lookup support is narrower than the completed 250-jurisdiction research catalogue. Each live adapter passed technical, policy and exposure gates.</p><div class="table-wrap"><table><thead><tr><th>Jurisdiction</th><th>ISO2</th><th>Machine status</th><th>Lookup scheme</th><th>Last verified</th></tr></thead><tbody>${rows}</tbody></table></div>`));

const freshnessByJurisdiction: Record<string, string> = {
  NOR: "Per-entity official API; registry refresh cadence is not stated in the verified source material.",
  SVK: "Nightly; the official RPO API may lag the live register by up to 24 hours.",
  SGP: "Monthly open-data refresh; may lag BizFile+.",
};
const exposedFieldLabels: Record<string, string> = {
  identifiers: "Typed official identifier",
  legalName: "Legal/entity name",
  status: "Normalized status with source value/label",
  entityType: "Entity/legal type",
  registrationDate: "Registration or establishment date",
  registeredAddress: "Published registered/business address",
  industryCodes: "Industry/activity code",
  provenance: "Official-source provenance and retrieval time",
  warnings: "Freshness and source-scope warnings",
};

for (const jurisdiction of data.jurisdictions) {
  // Slugs are constrained by catalogue validation before being used as paths.
  const directory = path.join(dist, "business", jurisdiction.slug);
  await mkdir(directory, { recursive: true });
  const registry = data.registries.find((item) => item.jurisdictionId === jurisdiction.id);
  if (!registry) throw new Error(`Registry missing for ${jurisdiction.id}`);
  const source = data.sources.find((item) => item.registryId === registry.id);
  if (!source) throw new Error(`Source missing for ${jurisdiction.id}`);
  const manifest = production.find((item) => item.jurisdictionId === jurisdiction.id);
  const adapter = manifest ? data.adapters.find((item) => item.id === manifest.adapterId) : undefined;
  const profile = manifest ? data.exposureProfiles.find((item) => item.id === manifest.exposureProfileId) : undefined;
  const scheme = data.identifierSchemes.find((item) => item.id === jurisdiction.defaultIdentifierSchemeId);
  const licence = source.licenceId ? data.licences.find((item) => item.id === source.licenceId) : undefined;
  const access = data.accessMethods.find((item) => item.sourceId === source.id);
  const constraints = data.constraints.filter((item) => source.constraintIds.includes(item.id));
  const lookupExample = JSON.stringify({ jurisdiction: jurisdiction.iso2, scheme: scheme?.id, identifier: scheme?.format.type === "numeric" ? "0".repeat(scheme.format.length ?? 8) : "YOUR-UEN" }, null, 2);
  const curlExample = [
    "curl -X POST https://business.newbies.cool/api/v1/business/lookup \\",
    "  -H \'Content-Type: application/json\' \\",
    "  -H \'PAYMENT-SIGNATURE: &lt;x402-v2-payment&gt;\' \\",
    `  --data '${esc(lookupExample.replace(/\n/g, " "))}'`,
  ].join("\n");
  const exposed = (profile?.allowedCanonicalFields ?? []).map((field) => `<li>${esc(exposedFieldLabels[field] ?? field)}</li>`).join("");
  const scopeWarnings = adapter?.scopeWarnings ?? [];
  const limitations = [...constraints.map((item) => item.description), ...scopeWarnings];
  const licenceName = licence ? [licence.name, licence.version].filter(Boolean).join(" ") : "Not verified";
  const body = `<p class="breadcrumb"><a href="/">Home</a> / <a href="/business/">Jurisdictions</a> / ${esc(jurisdiction.name.canonical)}</p><div class="title-row"><div><p class="eyebrow">${esc(jurisdiction.iso2 ?? jurisdiction.id)} · ${esc(jurisdiction.registryStructure)}</p><h1>${esc(jurisdiction.name.canonical)}</h1></div><span class="status">${manifest ? "Production adapter live" : "Paid lookup disabled"}</span></div>${paymentNotice}<section class="detail-grid" aria-label="Source details"><div><h2>Official source</h2><dl><dt>Authority</dt><dd>${esc(registry.authority.name)}</dd><dt>Registry/publication</dt><dd>${esc(registry.name)}</dd><dt>Source</dt><dd>${esc(source.name)}</dd><dt>Source role</dt><dd>${esc(registry.registryRole)}</dd><dt>Official endpoint</dt><dd><a href="${safeExternalUrl(source.url)}" rel="external noreferrer">Open official source</a></dd><dt>Last verified</dt><dd>${esc(source.lastVerifiedAt ?? "Unknown")}</dd></dl></div><div><h2>Machine access</h2><dl><dt>Status</dt><dd>${manifest ? "Enabled for exact identifier lookup" : "Not enabled"}</dd><dt>Identifier</dt><dd><span class="mono">${esc(scheme?.id ?? "—")}</span>${scheme?.localName ? ` (${esc(scheme.localName)})` : ""}</dd><dt>Format</dt><dd>${esc(scheme?.format.pattern ?? "Not stated")}</dd><dt>Upstream interface</dt><dd>${esc(access?.type ?? "Unknown")} · ${access?.authentication.required ? "authentication required" : "no upstream authentication"}</dd><dt>Service price</dt><dd>$0.01 native USDC on Polygon mainnet per lookup attempt</dd><dt>Storage</dt><dd>No persistent business-record storage; response is <span class="mono">no-store</span></dd></dl></div></section><section><h2>Exposed V1 facts</h2><ul class="columns">${exposed}</ul><p>Directors, officers, shareholders, owners, UBO data, personal identifiers, personal residential addresses and paid filings are not exposed.</p></section><section><h2>Freshness and scope</h2><p>${esc(freshnessByJurisdiction[jurisdiction.id] ?? "Unknown")}</p><p><strong>Published scope:</strong> ${esc(source.recordScope)}</p>${limitations.length ? `<ul>${limitations.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}</section><section><h2>Licence and attribution</h2><dl><dt>Licence</dt><dd>${esc(licenceName)}</dd><dt>Commercial reuse</dt><dd>${esc(licence?.commercialReuse ?? "unclear")}</dd><dt>Attribution</dt><dd>${esc(licence?.attributionText ?? "No verified wording")}</dd></dl>${licence?.sourceUrl ? `<p><a href="${safeExternalUrl(licence.sourceUrl)}" rel="external noreferrer">Official licence terms</a></p>` : ""}</section><section><h2>Request example</h2><pre><code>${curlExample}</code></pre><p>The request body is checked before an x402 challenge. When a payment authorization is supplied, local official-source capacity is reserved before settlement. Payment is settled before the official entity source is queried.</p></section>`;
  await writeFile(path.join(directory, "index.html"), shell(`${jurisdiction.name.canonical} — Global Official Business Facts`, body));
}

await writeFile(path.join(dist, "privacy", "index.html"), shell("Privacy — Global Official Business Facts", `<p class="breadcrumb"><a href="/">Home</a> / Privacy</p><h1>Privacy</h1><p class="lede compact">The service is designed to minimize personal data and persistent storage.</p><section><h2>What the service processes</h2><ul><li>Request network metadata needed to serve and protect the API, which can include an IP address and user agent.</li><li>For x402 payment, a public wallet address, transaction data and payment verification metadata may be processed by Cloudflare, Coinbase Developer Platform and the relevant blockchain network.</li><li>The jurisdiction, identifier scheme, adapter identifier, result class, latency, upstream status class and payment result class may appear in allowlisted operational logs. The identifier value and raw business record are omitted.</li></ul></section><section><h2>Storage and logs</h2><p>Business lookup source payloads are parsed in memory and discarded. Paid responses use <span class="mono">Cache-Control: no-store</span>. The Worker does not create user accounts, set application cookies, or use advertising analytics. Cloudflare invocation logs are disabled so request headers such as <span class="mono">PAYMENT-SIGNATURE</span> are not persisted by the application configuration.</p><p>Necessary accounting records, such as timestamp, amount and public transaction hash, may be retained separately from business-source payloads. Public blockchains are independently public and persistent.</p></section><section><h2>Questions</h2><p>Use the <a href="/support/">support channel</a> for privacy or security questions. Never submit private keys, seed phrases, API secrets or payment-signature headers.</p></section>`));

await writeFile(path.join(dist, "support", "index.html"), shell("Support — Global Official Business Facts", `<p class="breadcrumb"><a href="/">Home</a> / Support</p><h1>Support</h1><p class="lede compact">Support for API, payment, privacy and security questions is available without charge.</p><section><h2>Open a support request</h2><p><a class="button" href="https://github.com/backtomillennium/global-official-business-facts/issues" rel="external noreferrer">Open a GitHub issue</a></p><p>Include the request ID from the <span class="mono">X-Request-Id</span> response header, the approximate timestamp and the public transaction hash if a payment settled. If the response code was <span class="mono">PAYMENT_OUTCOME_UNKNOWN</span>, do not reuse the same payment authorization; first inspect the wallet or chain for settlement and then contact support. Do not include a full company payload unless it is already public and necessary to reproduce the issue.</p></section><section><h2>Never send secrets</h2><p>Do not post a CDP API key, private key, seed phrase, wallet backup, <span class="mono">PAYMENT-SIGNATURE</span> header, or unredacted Cloudflare invocation log. Support will never ask for private signing material.</p></section>`));

await writeFile(path.join(dist, "terms", "index.html"), shell("Service terms — Global Official Business Facts", `<p class="breadcrumb"><a href="/">Home</a> / Terms</p><h1>Service terms</h1>${paymentNotice}<section><h2>What the payment purchases</h2><p>The fixed $0.01 USDC price purchases one syntactically valid, jurisdiction-specific official-source lookup execution attempt. It does not guarantee that an entity exists, that every fact is present, or that the originating source is available. Because settlement occurs before the official source call, <span class="mono">NOT_FOUND</span> may still be charged. Validation, unsupported requests and signed-request local capacity-limit failures are rejected before settlement.</p></section><section><h2>Finality and support</h2><p>An x402 exact payment is an on-chain push payment and may be irreversible once confirmed. Any refund that is granted requires a separate transfer and is not automatic. A settlement request can time out after the facilitator or chain has accepted it. If the API returns <span class="mono">PAYMENT_OUTCOME_UNKNOWN</span>, do not reuse the same payment authorization: inspect the wallet or chain for settlement and contact <a href="/support/">support</a> with the response request ID. If a settled attempt later fails because the official source is unavailable or its schema changed, retain the response request ID and public transaction hash and contact support.</p></section><section><h2>Source meaning</h2><p>The service normalizes identified official-source facts and adds typed identifiers, provenance, licence attribution and scope/freshness warnings. It is not the originating registry and does not provide certified extracts, legal advice or a warranty of completeness. The official source and its licence remain authoritative.</p></section><section><h2>Acceptable use</h2><p>Do not use the service to violate law, sanctions, source licences, privacy rights, security controls or third-party rights. Coinbase facilitator screening can reject sanctioned or high-risk payer addresses; that screening does not replace a user's or operator's own legal obligations.</p></section>`));

await mkdir(path.join(dist, "machine"), { recursive: true });
await writeFile(path.join(dist, "machine", "catalogue.json"), JSON.stringify(serializePublicMachineCatalogue(catalogue), null, 2));

// Cloudflare Workers Static Assets applies these without invoking the Worker.
await writeFile(path.join(dist, "_headers"), `/*
  Content-Security-Policy: default-src 'none'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'none'; upgrade-insecure-requests
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Referrer-Policy: no-referrer
  Strict-Transport-Security: max-age=31536000
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY

https://:version.:subdomain.workers.dev/*
  X-Robots-Tag: noindex
`);

console.log(`Generated ${data.jurisdictions.length} production jurisdiction pages.`);
