# Global Official Business Facts — Security Review V1

Review date: 2026-08-14

Scope: hardened R1 → deployable V1, including NOR/SVK/SGP adapters, canonical API, x402, Cloudflare configuration, static assets and dependency supply chain.

## Verdict

No known critical or high-severity implementation finding remains open in the repository. Mainnet payment operation is intentionally fail-closed until Cloudflare CDP secrets are configured. A real settlement was not attempted.

## Security controls verified

### Inbound request boundary — PASS

- `Content-Type` must be unambiguous `application/json` with optional UTF-8 charset.
- Body streaming stops at 2,048 bytes before JSON parsing.
- Invalid UTF-8 and malformed/deep JSON receive controlled 400 responses.
- Request body is an exact three-field object; extra/missing fields are rejected.
- Jurisdiction, identifier scheme ownership, per-field length and ASCII character allowlists are checked before payment.
- Encoded API path tricks, malformed path encoding, slash/backslash injection and unsafe target lengths fail closed.
- CORS permits only the required methods/headers and exposes only payment challenge/response headers; no credentials/cookies are enabled.

### Abuse controls — PASS

- `REQUEST_RATE_LIMITER`: 60 requests per 60 seconds per SHA-256 client-IP key.
- `UPSTREAM_RATE_LIMITER`: 30 calls per 60 seconds per jurisdiction key.
- Both are Cloudflare Workers Rate Limiting bindings, not browser controls.
- Repeated malformed requests never reach payment verification or upstream adapters.

### SSRF and upstream boundary — PASS

- Source ID must have an explicit policy.
- Only `https://data.brreg.no/enhetsregisteret/api/enheter/...`, `https://api.statistics.sk/rpo/v1/search`, `https://api.statistics.sk/rpo/v1/entity/...` and `https://data.gov.sg/api/action/datastore_search` are reachable.
- Protocol, credentials, origin, path, method and request headers are deny-by-default.
- Identifiers cannot supply a URL, host, protocol or arbitrary path.
- Redirect mode is `manual`; 301/302/307/308, cross-host, private-IP and protocol-downgrade locations all fail before any follow.
- 401/403, 404, 410, 429, 5xx, timeout, malformed JSON, wrong content type, oversized data and schema drift retain separate controlled semantics.
- Response timeout remains active until the bounded body finishes, not merely until headers arrive.

### Payment boundary — PASS for implementation and challenge; settlement not attempted

- Server constants bind x402 version 2, exact scheme, Polygon `eip155:137`, native USDC, 10,000 atomic units and the fixed payee.
- Canonical request syntax and production adapter availability are checked before challenge; entity existence is not looked up for free.
- Official x402/Exact EVM/facilitator primitives are used. Cryptographic verification is not reimplemented.
- The official resource-server settlement primitive completes before the paid upstream lookup.
- Missing, malformed, wrong-network, wrong-asset, wrong-amount, wrong-payee, verify failure, settle failure and facilitator failure all fail closed.
- Repeated identical payloads are never converted into an application entitlement; each request invokes verify and settle. On-chain/facilitator authorization semantics remain the replay authority.
- Payment signatures and facilitator errors are not returned or logged.

### Data exposure and persistence — PASS

- Public response is a compact allowlisted projection.
- Internal source values, adapter/normalization versions and raw status flags remain internal provenance.
- Public output includes official source URL, retrieval time, warnings, licence and attribution.
- Raw company payloads are not logged or persisted.
- No D1, KV, R2, Durable Objects or company-data filesystem writes exist.
- Business responses use `no-store`.
- Person-heavy fields and documents are excluded by profile and adapter mappings.

### Deployment surface — PASS in repository

- `workers_dev=false`, `preview_urls=false`.
- Worker requires HTTPS and exact hostname `business.newbies.cool` for API and static assets.
- Static CSP, frame denial, HSTS, `nosniff`, no-referrer and permissions restrictions are generated.
- API responses receive restrictive security headers and request IDs.
- CodeQL, CI and Dependabot configuration are committed.

### Dependency supply chain — PASS

- All direct dependencies are exact versions; no `latest` ranges remain.
- `package-lock.json` is committed and deterministic `npm ci --ignore-scripts` passes.
- TypeScript was pinned to compatible 5.9.3 rather than an incompatible floating major.
- CDP SDK peer dependencies required by its public x402 entrypoint are explicitly pinned.
- Axios is overridden to the compatible fixed 1.19.0 because CDP SDK 1.55.0 directly pins a vulnerable older release.
- `npm audit --audit-level=high`: 0 vulnerabilities at review time.

## Adversarial coverage

The suite covers 2 KiB and oversized bodies, deep/malformed JSON, extra fields, long/Unicode/control/null identifiers, full URLs, invalid encoding, unsupported/duplicate content types, wrong methods, CORS, repeated malformed requests, rate limits, encoded slashes/dots/double encoding, alternate hostnames, preview/workers.dev names, SSRF, request-header injection, redirects to hostile/private/protocol-downgrade destinations, body streaming timeout, declared/streamed oversized responses, wrong content type/JSON/root/schema, all relevant upstream statuses, payment term substitution, malformed payment headers, facilitator failures, payment reuse behavior, paid not-found/timeout, response/log leakage and static header configuration.

Final suite result: PASS — 12 test files / 92 total tests. The focused security command also passed 3 files / 39 tests. See `V1-IMPLEMENTATION-REPORT.md` for the release matrix.

## Residual operational actions

- Configure CDP secrets directly in Cloudflare.
- Perform and observe one real Polygon USDC settlement.
- Confirm GitHub secret scanning, push protection and branch protection in repository settings.
- Monitor upstream schema/licence change triggers and dependency advisories.

These are deployment/account actions, not reasons to weaken or bypass repository controls.
