# Global Official Business Facts V1 — Implementation Report

Checked: 2026-08-15 (Asia/Taipei)

Baseline: `global-official-business-facts-security-hardened-r1.zip`

## Outcome

The hardened R1 skeleton is now a deployable V1 repository with three production adapters, canonical `/api/v1` surfaces, a provenance-preserving compact response, fixed server-side x402 v2 terms, Cloudflare-native rate limits, static jurisdiction pages, shared OpenAPI/runtime/Bazaar schemas and adversarial regression coverage.

File-level changes are grouped in `CHANGED-FILES.md`; the trust-boundary/manual reconciliation is in `ARCHITECTURE-REVIEW-V1.md`; deployment steps are in `USER-ACTIONS.md`.

The currently deployed public hostname will remain the old skeleton until this repository is pushed to GitHub `main` and Cloudflare finishes its connected deployment.

### Cloudflare/CDP production hotfix — 2026-08-15

The first production unpaid lookup reached the active Worker but returned fail-closed HTTP 503 before the x402 challenge. Cloudflare observability identified the exact failure as `TypeError: getRandomValues is not a function` while the CDP client fetched facilitator-supported payment kinds.

This was not an invalid CDP key, Polygon incompatibility or a registry-adapter failure. `@coinbase/cdp-sdk` imports its JWT nonce helper from `uncrypto`; under Wrangler's `nodejs_compat` condition, `uncrypto` selected a Node Web Crypto path that is not callable in workerd. The repository now aliases only that dependency boundary to Cloudflare's standards-based `globalThis.crypto` while preserving the official Coinbase/x402 authentication, verification and settlement flow.

The payment gate also now treats facilitator initialization failures as transient fail-closed events with a bounded ten-second retry cooldown. A failed initialization can no longer permanently poison a long-lived Worker isolate, and repeated traffic cannot create an upstream retry storm.

Settlement timeout handling was also corrected. Once a settle request starts, a client-side facilitator timeout is an indeterminate outcome: the facilitator or chain may still have accepted it. The API now returns `PAYMENT_OUTCOME_UNKNOWN`, never automatically replays the authorization, and directs the buyer to reconcile wallet/chain state with the response request ID.

## Production adapters

### Norway — enabled

- Adapter: `no-brreg-enhetsregisteret-v1`
- Scheme: `no-organisasjonsnummer`
- Source: Brønnøysundregistrene, Enhetsregisteret open-data API
- Transport: exact HTTPS origin/path/method allowlist; no upstream authentication
- Status: deterministic precedence for bankruptcy, liquidation, compulsory liquidation, dissolution and active
- Error semantics: 404 `NOT_FOUND`; 410 `WITHDRAWN_FOR_LEGAL_REASONS`
- Licence: NLOD 2.0 with source attribution
- Scope warning: Enhetsregisteret covers legal entities and other registered units, not companies only
- Fixture/parser/normalization tests: PASS
- Live smoke: PASS during implementation (`923609016`, HTTP 200, required bindings verified)

### Slovakia — enabled

- Adapter: `sk-rpo-v1`
- Scheme: `sk-ico`
- Source: Register právnických osôb, podnikateľov a orgánov verejnej moci (RPO)
- Lookup: exact two-call `search?identifier=` → RPO internal ID → `entity/{id}`
- Timed values: selects entries whose `validTo` is absent or null; never assumes index zero
- Status: `termination` maps to `dissolved`; otherwise canonical `other` with raw/source status preserved
- Licence: CC BY 4.0 with required attribution
- Warnings: nightly refresh/up to 24-hour lag; aggregation-register scope
- Fixture/parser/normalization tests: PASS
- Live smoke: PASS during implementation (`00166197` → internal RPO ID `9389295`; current TimedValue/CodeValue shapes verified)

### Singapore — field-binding gate passed and enabled

- Adapter: `sg-acra-opendata-v1`
- Scheme: `sg-uen`
- One designated resource only: `d_3f960c10fed6145404ca7b821f263b87`
- Gate result: PASS
- Verified `result.fields[]`: `uen`, `issuance_agency_desc`, `uen_status_desc`, `entity_name`, `entity_type_desc`, `uen_issue_date`, `reg_street_name`, `reg_postal_code`, `_id`
- Runtime re-checks the field binding on every response and fails `SOURCE_SCHEMA_CHANGED` if it drifts
- Lookup performs one UEN-filtered request; no 27-resource fan-out, bulk ingest, database or search index
- Licence: Singapore Open Data Licence v1.0 with the verified attribution template
- Warnings: monthly refresh; ACRA open-data publication is not a certified/current BizFile+ profile
- Fixture/parser/normalization tests: PASS
- Official field-binding smoke: PASS

## Public surfaces

Human:

- `/`
- `/business/`
- `/business/no/`
- `/business/sk/`
- `/business/sg/`
- `/privacy/`
- `/support/`
- `/terms/`

Free machine API:

- `GET /api/v1/health`
- `GET /api/v1/openapi.json`
- `GET /api/v1/catalogue`
- `GET /api/v1/catalogue/jurisdictions`
- `GET /api/v1/catalogue/jurisdictions/:iso2`

Paid machine API:

- `POST /api/v1/business/lookup`

The two former read-only catalogue paths remain compatibility aliases. Pre-V1 free business GET routes were removed; they cannot bypass payment.

## Payment

- Protocol: x402 v2
- Scheme: exact
- Production network: Polygon mainnet (`eip155:137`)
- Asset: native USDC (`0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`)
- Price: 10,000 atomic units = $0.01 USDC
- Payee: `0xF3E577c98CFa7f300fE8f39F7EcFD14B368DCb2f`
- Test integration: Base Sepolia (`eip155:84532`)
- Server implementation: official x402 v2 resource server + Exact EVM scheme + official facilitator client
- Ordering: strict syntax/policy validation → request abuse limit → signed-request source-capacity reservation → verify → settle → upstream lookup
- Bazaar metadata: canonical input/output schemas are declared; status remains `PENDING_FIRST_SETTLEMENT`
- Testnet 402 challenge: PASS
- Buyer payment execution: NOT ATTEMPTED (no buyer-wallet action was authorized)
- Polygon settlement: NOT ATTEMPTED (the operator has configured production CDP secrets in Cloudflare; no secret value exists in this repository/workspace)

## Abuse and transport controls

- Exact `application/json` content-type handling, including malformed/duplicate rejection
- 2,048-byte streaming request hard limit and fatal UTF-8 decoding
- Exact object shape; no additional properties
- Known jurisdiction/scheme ownership and bounded ASCII identifiers before payment
- Workers Rate Limiting bindings: 60 API requests/minute per one-way client key, 30 official subrequests/minute per jurisdiction key, and a dedicated Singapore 4 requests/10 seconds source guard
- Unpaid 402 discovery does not consume source capacity; Norway/Singapore reserve one source unit and Slovakia reserves two before settlement
- Fixed adapter-selected upstream URLs only
- HTTPS origin/path/method/header allowlists for every source
- Manual redirect mode; every 3xx fails closed
- Timeout remains active through response-body streaming
- Declared and streamed upstream response byte limits
- Rejected, redirected and oversized upstream response bodies are best-effort cancelled
- JSON content-type/root/schema validation; required-field deletion/type mutation fails closed
- Generic public error envelopes omit source IDs, raw upstream bodies, stack traces and facilitator internals
- Production logs omit identifier values, raw business data and payment signatures
- Automatic Cloudflare invocation logs are disabled so raw request headers are not persisted by the repository configuration
- Full custom hostname enforcement; `workers.dev` and preview URLs disabled

## Persistence and exposure

- Persistent business-data storage: NONE
- Cache: `Cache-Control: no-store`
- Raw upstream payload: parsed in memory, normalized, returned and discarded
- No D1, KV, Durable Objects, R2 record store, filesystem record store or background registry sync
- No directors, officers, owners, shareholders, UBOs, person IDs, person-record residential-address fields, paid documents or binary filings

## Verification status

The final artifact passed the following result matrix; the security-specific coverage is also summarized in `SECURITY-REVIEW-V1.md`.

| Check | Result |
|---|---|
| Exact dependencies and lockfile | PASS |
| Deterministic `npm ci --ignore-scripts` | PASS |
| Catalogue validation/build | PASS |
| Static build | PASS |
| TypeScript strict check | PASS |
| Unit/integration/adversarial tests | PASS — 13 files, 104 tests |
| Security-only regression subset | PASS — 3 files, 41 tests |
| Production dependency audit | PASS, 0 vulnerabilities |
| x402 Base Sepolia no-payment challenge | PASS, HTTP 402 + `PAYMENT-REQUIRED` |
| Official live adapter smoke | PASS — Norway, Slovakia and Singapore on 2026-08-15 |
| Wrangler type/config validation | PASS |
| Wrangler dry-run | PASS — 514.90 KiB upload / 101.81 KiB gzip; 19 static assets; three Rate Limiting bindings plus Assets/hostname configuration detected; CDP `uncrypto` alias present in bundle |
| Mainnet settlement | NOT ATTEMPTED |
| Production deployment from this artifact | USER ACTION REQUIRED |

## Known blockers

1. The 2026-08-15 Web Crypto compatibility hotfix must be pushed to GitHub `main` and deployed before repeating the unpaid challenge smoke.
2. A buyer-wallet transaction is required to prove the first real $0.01 Polygon USDC settlement.
3. This workspace cannot push GitHub `main` or mutate the Cloudflare account; the repository ZIP/patch must be applied by the user.
4. Bazaar discovery remains pending until the first successful mainnet settlement.

The reproducible `scripts/live-adapter-smoke.ts` completed against all three designated official sources on 2026-08-15 without widening any source allowlist or performing Singapore dataset fan-out.

## Release flags

- `CORE_IMPLEMENTATION_READY`: YES
- `CORE_SHIPPED`: NO — GitHub/Cloudflare update and first mainnet settlement remain outstanding
- `DISCOVERY_SHIPPED`: NO — `PENDING_FIRST_SETTLEMENT`
