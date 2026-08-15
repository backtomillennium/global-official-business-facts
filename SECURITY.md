# Security policy and V1 invariants

All inbound requests, payment material and official upstream responses are untrusted.

## Enforced invariants

- No private keys, seed phrases, wallet backups, CDP secrets, registry credentials or payment signatures are committed or logged.
- Paid input is a strict JSON object containing only `jurisdiction`, `scheme` and `identifier`.
- JSON bodies are streamed through a 2,048-byte hard limit before parsing; content type, UTF-8, per-field length and ASCII character constraints are enforced.
- Known jurisdiction, scheme ownership and identifier syntax are checked before a payment challenge. Entity existence is not checked for free.
- x402 price, asset, network and payee are server constants. The client cannot override them.
- The official x402 v2 resource-server and facilitator flow verifies and settles each payment before any paid upstream lookup. Failure is closed. A settle-stage timeout is treated as an indeterminate outcome, not silently retried or mislabeled as definitely unpaid.
- A payment is not converted into application credit or a reusable session. Every request goes through verify and settle; replay rejection remains enforced by the payment authorization/facilitator/on-chain mechanism.
- The request Workers Rate Limiting binding executes before expensive work. Source-capacity bindings are consumed only by requests that present a payment authorization and before settlement, so ordinary 402 discovery cannot exhaust source capacity or incur a charge. Slovakia consumes two capacity units for its two official subrequests; Norway and Singapore consume one.
- Every executable source has an explicit HTTPS origin, path and method allowlist. There is no generic proxy or user-selected upstream URL.
- Subrequest redirects use `manual` mode and every 3xx fails closed. Credential forwarding to a redirect target is impossible.
- Upstream fetch and response streaming share a fixed timeout. Responses have declared and streaming byte limits and must pass content-type, JSON and adapter schema validation.
- Official-source 404, legal-withdrawal 410, rate limit, timeout, unavailability, malformed response and schema change remain distinct errors.
- Business responses and API errors use `Cache-Control: no-store`. Raw upstream business records are parsed in memory and discarded.
- V1 does not expose officers, directors, owners, shareholders, UBOs, person IDs, personal residential addresses, paid documents or binary filings.
- Public catalogue output is a curated projection; internal evidence, promotion manifests and verification records are not published wholesale.
- Static IDs/slugs/URLs are validated before they can affect filesystem paths or HTML attributes.
- Production `workers.dev` and preview URLs are disabled, and the Worker additionally requires the HTTPS custom hostname `business.newbies.cool`.
- CORS permits public machine clients but is not an authorization boundary. No cookies or credential sessions are used.

## Secrets

Production payment credentials are Cloudflare secrets:

- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`

Set them directly in Cloudflare. Do not place real values in `wrangler.jsonc`, `.env`, `.dev.vars` committed/shared with others, GitHub issues, chat, screenshots or logs. The public payee EVM address is configuration, not a secret.

## Logging allowlist

Operational logs may contain only request ID, jurisdiction, identifier scheme, adapter ID, result class, latency, upstream status class and payment result class. Identifier values are omitted. Raw records, personal data, source credentials, facilitator bodies and payment signatures are prohibited. Cloudflare automatic invocation logs are disabled because they can persist request headers; only application-generated allowlisted logs are retained.

## Payment outcome handling

- No payment header: return a standards-compliant HTTP 402 challenge after syntax and policy validation; do not consume source capacity.
- Verification or definite settlement rejection: fail closed without calling an official source.
- Successful settlement: call the fixed adapter once and return the normalized result or a distinct official-source error.
- Settle-stage timeout: return `PAYMENT_OUTCOME_UNKNOWN`; never automatically retry settlement and instruct the buyer not to reuse the same authorization.
- The service does not turn a payment into reusable credit or a session.

## Residual limits

Workers Rate Limiting is per Cloudflare location and eventually consistent. It is an abuse-control/capacity guard, not an accounting ledger or a global concurrency lock. A syntactically valid but cryptographically invalid signed request can consume a local source-capacity unit because capacity must be checked before settlement to prevent charging a request that cannot be served. The broader request limiter bounds this behavior; persistent distributed abuse should be handled with Cloudflare WAF/rate-limit rules at the account edge.

## Dependency and repository security

- Runtime and development dependencies are exact versions and `package-lock.json` is committed.
- CI uses `npm ci --ignore-scripts`, build, Worker type generation, strict TypeScript, all tests, production dependency audit and Wrangler dry-run.
- The CDP SDK currently pins an Axios release covered by security advisories; the root lockfile enforces the compatible fixed Axios version through an exact npm override.
- Dependabot and CodeQL workflows are committed.
- GitHub secret scanning, push protection and main-branch protection must be enabled in repository settings.

## Incident response

If an upstream schema, licence, source behavior or payment dependency changes:

1. Fail closed with the existing error taxonomy.
2. Disable the affected adapter if the discrepancy persists.
3. Never weaken validation merely to keep a route green.
4. Re-verify technical and policy evidence before re-enabling production.

Report security issues privately to the repository owner. Do not include secrets, payment signatures or personal registry data in a report.
