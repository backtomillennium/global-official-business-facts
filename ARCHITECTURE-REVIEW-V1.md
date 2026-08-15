# Global Official Business Facts V1 — Architecture Review

Review date: 2026-08-15 (Asia/Taipei)

## Verdict

The V1 boundary is coherent after the fixes in this release: Cloudflare terminates the public request, the Worker validates and meters it, Coinbase CDP verifies and settles a fixed x402 payment, and a jurisdiction adapter performs only its predeclared official-source request. Payment data is not forwarded to registries; registry payloads are not forwarded to Coinbase; neither becomes persistent company data.

The production failure `TypeError: getRandomValues is not a function` was an SDK/runtime compatibility defect, not an invalid Secret API key. The narrow `uncrypto` alias delegates only Web Crypto operations to the Workers-standard `globalThis.crypto`; Coinbase's JWT, x402 verification and settlement implementation remain official library code.

## Trust boundaries and communication sequence

```text
buyer / API client
  │ HTTPS: strict JSON body, optional PAYMENT-SIGNATURE
  ▼
Cloudflare edge + Worker
  │ 1. hostname/method/path/content-type/body/schema validation
  │ 2. request abuse limit
  │ 3. if signed: reserve official-source subrequest capacity
  │
  ├── no signature ──► HTTP 402 + PAYMENT-REQUIRED
  │
  │ server-authenticated HTTPS; CDP secret never sent to buyer/registry
  ▼
Coinbase CDP x402 facilitator
  │ supported-kind discovery, payment verification, exact settlement
  │
  ├── definite rejection/unavailable ──► controlled failure; no registry call
  ├── settle timeout ──► PAYMENT_OUTCOME_UNKNOWN; no automatic replay
  ▼
fixed jurisdiction adapter
  │ allowlisted HTTPS GET, redirect=manual, no client-controlled host/path
  ▼
official source (Brreg / RPO / data.gov.sg)
  │ bounded status/content-type/bytes/time/schema parsing
  ▼
normalizer + public allowlist serializer
  │ compact provenance-preserving JSON, Cache-Control: no-store
  ▼
buyer
```

The `PAYMENT-SIGNATURE` header is used only by the payment gate. The fixed source transport creates a fresh header allowlist and never forwards client headers, CDP credentials or facilitator responses. Conversely, CDP receives payment/resource metadata, not raw registry records.

## Official manual reconciliation

| Boundary | Official documentation checked | Result in this repository |
|---|---|---|
| Cloudflare Workers Web Crypto | [Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) | Nonces use `globalThis.crypto.getRandomValues`; regression-tested. |
| Workers Node compatibility and aliases | [Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/) | `nodejs_compat` remains enabled for SDK dependencies; only incompatible indirect `uncrypto` is aliased. |
| Worker secrets | [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) | `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` are required runtime secrets, never build variables or source constants. |
| Worker rate limiting | [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) | Request and official-source capacity limits are local abuse guards, not billing ledgers. Singapore follows its stricter published anonymous rate. |
| Worker logging | [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) | Automatic invocation logs are disabled; application logs use a field allowlist and omit identifiers/signatures/raw payloads. |
| CDP server authentication | [CDP API authentication](https://docs.cdp.coinbase.com/api-reference/authentication), [TypeScript SDK authentication](https://docs.cdp.coinbase.com/sdks/cdp-sdks-v2/typescript/auth) | Uses a Secret API key for server-to-server authentication; the public Client API key is not used. Ed25519 secret formatting is left to the official SDK. |
| x402 facilitator/network | [Facilitator](https://docs.cdp.coinbase.com/x402/core-concepts/facilitator), [network support](https://docs.cdp.coinbase.com/x402/network-support) | x402 v2 exact on Polygon mainnet `eip155:137`, native USDC, official `/platform/v2/x402` facilitator. |
| Norway | [Enhetsregisteret API](https://data.brreg.no/enhetsregisteret/api/dokumentasjon/en/index.html) | One exact organisation-number request, required v2 media type, 404 distinct from legal-withdrawal 410, NLOD attribution. |
| Slovakia | [RPO API documentation](https://rpo.minv.sk/rpo-api-doc.html), [RPO API](https://api.statistics.sk/rpo/v1/) | Two requests: IČO search then entity detail; current timed values have absent/null `validTo`; two capacity units reserved. |
| Singapore | [data.gov.sg rate limits](https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits), [open-data licence](https://data.gov.sg/open-data-licence), [designated ACRA dataset](https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view) | Exactly one designated UEN-filtered datastore request; no dataset fan-out; runtime field-binding gate; 4 requests/10 seconds source limiter. |

## Correctness findings and fixes

1. **CDP nonce generation failed in workerd.** The SDK's indirect Node-selected crypto path was not callable. Fixed with a narrow platform adapter and a direct compatibility test.
2. **A transient facilitator initialization could poison an isolate.** Initialization now retries only after a bounded ten-second cooldown while remaining fail closed.
3. **A settlement timeout is not a definite failure.** It now returns `PAYMENT_OUTCOME_UNKNOWN`; the same authorization must not be reused. Other definite verification/settlement failures retain their existing semantics.
4. **Unpaid 402 discovery could consume scarce source quota.** Source capacity is now checked only when a payment authorization exists, before settlement.
5. **Slovakia was counted as one upstream call despite a two-call lookup.** Capacity accounting now reserves two units.
6. **Singapore requires a stricter source-specific rate.** It now has a dedicated 4/10-second binding instead of relying only on the general jurisdiction limit.
7. **Historical Slovak addresses could be presented as current.** Address selection now accepts only a current timed value; it does not fall back to an expired value.
8. **Rejected upstream responses could retain unread bodies.** Error/redirect/oversize branches now best-effort cancel the response stream.
9. **OpenAPI could describe invalid jurisdiction/scheme combinations.** One canonical schema now uses exact per-jurisdiction combinations and is shared by runtime metadata/OpenAPI/Bazaar declarations.

## Security review

- **Payment:** fixed price/network/asset/payee; no client override; official x402 cryptography; verify and settle before official lookup; no reusable application credit.
- **SSRF:** adapter-selected source IDs; exact origin/path/method/header policy; no redirect following; no generic proxy; identifiers cannot become URLs.
- **Input/abuse:** exact content type, 2 KiB streamed limit, fatal UTF-8, exact object, ASCII identifier rules, bounded target decoding, request and source capacity limits.
- **Upstream:** timeout through body consumption, byte ceilings, JSON/content-type/root/schema validation and distinct status semantics.
- **Secrets/logs:** runtime-only CDP secrets; no private wallet material; invocation logs disabled; no raw company payload, payment signature or full facilitator body in custom logs.
- **Privacy/exposure:** no accounts/cookies/analytics/company-record persistence; person-heavy and document fields excluded; privacy, support and charging terms are public.
- **Deployment:** exact production hostname; `workers.dev` and preview URLs disabled; restrictive browser headers; lockfile, CI, CodeQL and Dependabot included.

## Efficiency review

- Unpaid discovery ends at the 402 challenge without touching any registry and without consuming registry capacity.
- A signed request reserves enough source capacity before settlement, preventing a known local overload from charging the buyer.
- Norway and Singapore make one bounded official request; Slovakia makes the minimum required two. There is no Singapore 27-dataset fan-out, bulk ingest, database, queue or background sync.
- Raw responses are streamed into bounded memory, normalized once and discarded. Public output omits meaningless null fields and uses `no-store`.
- Payment client initialization is cached per Worker isolate, while transient failure recovery is cooldown-bounded.
- Static assets are served by Workers Static Assets instead of invoking application routing where possible.

## Residual risks (accepted or operational)

- Cloudflare rate-limit bindings are per location and eventually consistent; distributed abuse may require account-level WAF rules. They must not be used as financial accounting.
- A forged but syntactically valid `PAYMENT-SIGNATURE` can consume a local source-capacity unit before cryptographic rejection. The request limiter bounds this trade-off; moving capacity after settlement would risk charging when local capacity is already unavailable.
- Official schemas, licence terms, service availability and freshness can change. Required-field drift fails closed and should trigger adapter suspension/re-verification.
- Coinbase can change or suspend its service. The payment gate is isolated from adapters so another conforming facilitator can replace it without changing source normalization.
- On-chain settlement is irreversible and can have an indeterminate timeout. Operational support must reconcile `PAYMENT_OUTCOME_UNKNOWN` using the request ID and public chain state.
- A first real Polygon mainnet settlement still requires an operator-controlled buyer wallet and was not performed by this repository review.

## Release decision

Repository implementation is ready for deployment once the complete verification matrix passes. Production acceptance still requires: deploy this exact revision, obtain an unpaid HTTP 402 challenge, then execute and reconcile one authorized $0.01 Polygon USDC settlement.
