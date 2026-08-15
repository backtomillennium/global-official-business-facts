# Global Official Business Facts V1

Official business facts from government and registry sources, normalized into one machine-readable interface.

Source-linked. Typed identifiers. No scraped global company master database.

Production hostname: `https://business.newbies.cool`

## V1 production adapters

| Jurisdiction | Adapter | Identifier scheme | Official machine source |
|---|---|---|---|
| Norway | `no-brreg-enhetsregisteret-v1` | `no-organisasjonsnummer` | Brønnøysundregistrene Enhetsregisteret API |
| Slovakia | `sk-rpo-v1` | `sk-ico` | Register právnických osôb (RPO) API |
| Singapore | `sg-acra-opendata-v1` | `sg-uen` | Entities Registered with ACRA, published through data.gov.sg |

Singapore was enabled only after a targeted field-binding smoke confirmed both `uen` and `entity_name` in resource `d_3f960c10fed6145404ca7b821f263b87`.

## Public routes

Free:

- `GET /api/v1/health`
- `GET /api/v1/openapi.json`
- `GET /api/v1/catalogue`
- `GET /api/v1/catalogue/jurisdictions`
- `GET /api/v1/catalogue/jurisdictions/:iso2`

Paid:

- `POST /api/v1/business/lookup`

Example body:

```json
{
  "jurisdiction": "NO",
  "scheme": "no-organisasjonsnummer",
  "identifier": "923609016"
}
```

The body is validated before the x402 challenge. When a payment authorization is supplied, local official-source capacity is reserved before settlement. An official-source lookup occurs only after successful payment verification and settlement. The fixed price buys one execution attempt, so an official `NOT_FOUND` result may still be charged.

## Payment configuration

- Protocol: x402 v2
- Scheme: `exact`
- Production network: Polygon mainnet (`eip155:137`)
- Asset: native USDC (`0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`)
- Amount: `10000` atomic units (`$0.01` USDC)
- Payee: `0xF3E577c98CFa7f300fE8f39F7EcFD14B368DCb2f`
- Test integration: Base Sepolia (`eip155:84532`)

Production facilitator credentials are Cloudflare secrets named `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`. Never commit them, put them in `.dev.vars` that may be shared, paste them into issue/chat text, or log them.

If settlement starts but its result cannot be confirmed before timeout, the API returns `PAYMENT_OUTCOME_UNKNOWN`. The buyer must not reuse that payment authorization; inspect the wallet or chain and contact support with the `X-Request-Id` instead. This avoids treating an indeterminate on-chain outcome as a definite failed payment.

## Data and privacy boundaries

- No persistent company-record storage; adapter payloads are parsed in memory and discarded.
- Business responses use `Cache-Control: no-store`.
- No global entity resolution or person resolution.
- V1 does not expose directors, officers, shareholders, owners, UBOs, person identifiers, personal residential addresses, paid documents or binary filings.
- Official-source, machine-access and reuse-policy decisions remain distinct catalogue records.
- Raw/source values and derived status provenance remain in the internal model; public output is compact.

Global Official Business Facts is not an official registry. Facts are retrieved from identified official sources and normalized for machine use. Source scope, update frequency and legal meaning vary by jurisdiction. For authoritative or legally certified information, consult the originating registry.

## Reproducible verification

Node.js 22 or newer is required. Dependencies are exactly pinned, including a security override for the CDP SDK's Axios transitive dependency.

```sh
npm ci --ignore-scripts
npm run build
npm run types:worker
npm run typecheck
npm test
npm run test:x402:testnet
npm audit --omit=dev --audit-level=high
npx --no-install wrangler deploy --dry-run
```

`npm run test:x402:testnet` performs a real no-payment challenge against the official testnet facilitator. It does not spend funds or execute a settlement.

## Architecture

Lookup flow:

```text
strict HTTP parser
→ typed jurisdiction + identifier scheme
→ production policy gate
→ signed-request official-source capacity reservation
→ x402 verify + settle
→ fixed adapter
→ allowlisted official source transport
→ schema parser + deterministic normalization
→ provenance-preserving public serializer
→ no-store response
```

Key separations are enforced in code and data: jurisdiction ≠ registry ≠ source ≠ adapter; research closure ≠ production permission; human availability ≠ machine availability ≠ reuse permission. Slovakia reserves two source subrequests because its lookup is a search-plus-detail flow; Norway and Singapore reserve one.

## Deployment

Cloudflare is connected to GitHub branch `main`. A successful push builds the static assets and deploys Worker `global-official-business-facts`. The two CDP secrets are runtime secrets, not build variables. After deploying this revision, first verify an unpaid HTTP 402 challenge and only then authorize one real Polygon USDC settlement. See `USER-ACTIONS.md`.
