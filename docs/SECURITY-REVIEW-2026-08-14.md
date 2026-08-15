# Security review — 2026-08-14

Scope: Round 01–04 architecture skeleton before NOR/SVK and x402 production implementation.

## High-impact issues found and hardened

### 1. Build-time path traversal via jurisdiction slug
The static generator used `path.join(dist, "business", j.slug)` before enforcing a filesystem-safe slug. A malicious or accidentally corrupted imported catalogue value such as `../...` could write outside the expected output directory during CI/build.

Hardening: strict slug validation blocks dots, slashes, backslashes and unsafe characters before generation.

### 2. SSRF / arbitrary upstream fetch risk
`SourceFetcher` accepted an arbitrary URL supplied by adapter code. Future adapters could accidentally concatenate user input into a URL or be modified incorrectly, allowing requests to unintended hosts.

Hardening: deny-by-default source transport policies now require exact source ID plus HTTPS origin, path-prefix and method allowlists.

### 3. Redirect-based credential/header leakage
Worker subrequests can follow redirects unless explicitly controlled. If sensitive headers are ever added to a registry request, an unexpected redirect could forward them to another host.

Hardening: upstream fetch uses `redirect: "manual"`; unexpected redirects fail closed. Request headers are allowlisted per source.

### 4. Public internal-catalogue overexposure
`/machine/catalogue.json` previously emitted the entire compiled internal catalogue, which can later contain verification IDs, constraints, evidence, adapter manifests and credential binding names.

Hardening: public machine catalogue is a curated projection and does not publish internal verification/evidence structures wholesale.

### 5. Unsafe external links from catalogue data
HTML escaping prevents attribute breakout but does not by itself stop `javascript:` or other unsafe URL schemes.

Hardening: external catalogue URLs must be HTTPS and may not contain URL credentials; static generation fails on unsafe URLs.

### 6. Malformed percent encoding causing 500s
Direct `decodeURIComponent()` calls could throw on malformed input, turning client garbage into unhandled server errors.

Hardening: path decoding is bounded and converts malformed encodings/control characters/slashes into `INVALID_REQUEST`.

### 7. Error detail / reconnaissance leakage
Domain errors could expose internal transport details such as source IDs or upstream status in public error JSON.

Hardening: public error serializer only exposes an allowlist of safe details and generic messages for upstream/policy/internal failures.

### 8. Missing browser security headers
Static pages had no explicit CSP/frame/referrer/permissions policy.

Hardening: generated `_headers` adds CSP, frame denial, `nosniff`, no-referrer, HSTS and restrictive browser permissions. API responses also send restrictive security headers.

### 9. Alternate production origins
`workers.dev` and version preview URLs are additional public entry points and can bypass custom-domain-specific security controls or create duplicate public surfaces.

Hardening: `workers_dev=false` and `preview_urls=false` are committed now that the custom domain exists.

### 10. Production gate defense-in-depth
Runtime policy previously trusted `decision: eligible` without rechecking that all required gates were passing.

Hardening: PolicyGate now rejects incomplete eligibility, blockers, person-data-enabled profiles, and non-`no-store` V1 cache policy even if malformed catalogue data reaches runtime.

## Already good in the original skeleton

- No database / no persistent company-data ingestion.
- Raw upstream payload not logged by default.
- Identifier value omitted from structured lookup logs.
- Request ID uses `crypto.randomUUID()`.
- Upstream response size bound and timeout already existed.
- Domain errors separated `NOT_FOUND` from upstream failure and unsupported adapter states.
- Production adapter registration is explicit rather than inferred from research grades.

## Required before paid V1 (not yet applicable to current GET-only skeleton)

- Strict <=2 KiB POST body limit and JSON schema.
- Rate limiting / abuse controls.
- Hono secure headers/body-limit/CORS integration or equivalent controls.
- x402 v2 official middleware with fixed server-side payment parameters.
- Settlement-failure fail-closed tests, replay/duplicate behavior tests, malformed payment-header tests.
- Exact dependency versions + committed lockfile.
- Secret scanning and dependency audit in the build workflow.
- NOR/SVK adversarial parser fixtures: missing required fields, type confusion, oversized arrays/strings, unexpected HTML/error bodies, 3xx, 404, 410 (NOR), 429 and 5xx.
