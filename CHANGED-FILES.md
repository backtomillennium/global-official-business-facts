# Hardened R1 → V1 changed-files summary

## Runtime and API

- `src/index.ts` — registers the three production adapters, production source policies, hostname enforcement and payment gate.
- `src/http/app.ts` — Hono V1 routes, CORS, signed-request capacity reservation, weighted source-subrequest limits, payment-before-upstream ordering and sanitized errors.
- `src/http/api-schema.ts` — canonical runtime/OpenAPI/Bazaar request and response schemas.
- `src/http/request-body.ts` — strict content type, UTF-8 and 2 KiB streaming JSON limit.
- `src/http/security.ts` — bounded/encoded target checks and exact production-host policy.
- `src/domain/errors.ts`, `src/domain/types.ts`, `src/lookup/*` — V1 error semantics, provenance, validation, compact serializer and log allowlist.

## Adapters and source transport

- `src/adapters/norway/no-brreg-enhetsregisteret-v1.ts`
- `src/adapters/slovakia/sk-rpo-v1.ts`
- `src/adapters/singapore/sg-acra-opendata-v1.ts`
- `src/adapters/shared/json.ts`
- `src/sources/production-policies.ts`
- `src/sources/source-fetcher.ts` — origin/path/method/header allowlists, redirect denial, full-body timeout and streaming byte limits.

## Payment

- `src/payment/x402-gate.ts` — official x402 v2 exact EVM verification/settlement, Polygon production constants, Base Sepolia integration, transient initialization recovery, indeterminate settlement-timeout semantics and Bazaar declaration.
- `src/compat/uncrypto-worker.ts` — workerd-compatible Web Crypto boundary for the CDP SDK JWT nonce helper.
- `wrangler.jsonc` aliases `uncrypto` to the platform adapter; facilitator initialization now has bounded fail-closed recovery after transient errors.
- `scripts/x402-testnet-smoke.ts`
- `scripts/live-adapter-smoke.ts`

## Catalogue and production gates

- New V1 records under `data/catalogue/{jurisdictions,registries,sources,access-methods,identifier-schemes,licences,constraints,evidence,assessments,adapters}/v1.json`.
- `data/catalogue/exposure-profiles/basic-business-facts-v0.json` updated for the fixed V1 exposure.
- New production manifests and verification records under `data/production/` and `data/verification/`.
- `src/generated/catalogue.generated.ts` rebuilt deterministically.
- `scripts/catalogue-utils.ts` and `scripts/build-static.ts` updated.

## Human site

- `src/static/styles.css` — semantic responsive V1 styling.
- Generated `dist/` — home, catalogue, NO/SK/SG pages, privacy/support/terms pages, machine catalogue, CSS and Cloudflare `_headers`.

## Tests

- New NOR/SVK/SGP fixtures and adapter tests.
- `tests/api-v1.test.ts` — canonical routes, strict body/payment ordering/rate-limit behavior.
- `tests/adversarial.test.ts` — request, SSRF, upstream and x402 adversarial matrix.
- `tests/uncrypto-worker.test.ts` — Cloudflare Web Crypto compatibility and CDP nonce regression coverage.
- `tests/worker-host.test.ts`, `tests/static-security.test.ts` — origin/config/static-header regression coverage.
- Existing fake catalogue/adapter tests updated for V1 provenance/licence requirements.

## Build, deployment and supply chain

- `package.json` — exact compatible versions, scripts and Axios security override.
- `package-lock.json` — deterministic npm lockfile.
- `wrangler.jsonc` — production hostname variable, three Rate Limiting bindings, required runtime-secret declarations, Worker-first static routing, workers.dev/preview disabled, application-only log persistence and the Worker Web Crypto alias.
- `worker-configuration.d.ts` — generated binding types.
- `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`.
- `.gitignore` expanded for credentials/local state.

## Documentation

- `README.md`
- `SECURITY.md`
- `V1-IMPLEMENTATION-REPORT.md`
- `SECURITY-REVIEW-V1.md`
- `USER-ACTIONS.md`
- `CHANGED-FILES.md`
- `ARCHITECTURE-REVIEW-V1.md`

Historical `docs/SECURITY-REVIEW-2026-08-14.md` remains unchanged as the R1 baseline review.
