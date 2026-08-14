# Global Official Business Facts — architecture skeleton

This repository implements the Round 01–04 boundaries only.

Current guarantees:

- Catalogue domain and lookup runtime are separate.
- Research snapshots cannot directly enable production adapters.
- Adapter, source transport, policy, HTTP, and serialization are separate layers.
- `AdapterDefinition` (code/capability) and `AdapterManifest` (promotion/production decision) are separate.
- Production adapters require explicit promotion and an eligible assessment.
- Company lookup data is not persistently stored by default.
- Cache policy defaults to `no-store`.
- `basic-business-facts-v0` excludes people-heavy fields.
- The FakeAdapter exists only under `tests/` / direct test injection and is never registered by the production Worker.
- The production Worker currently registers zero real adapters.

## Commands

```sh
npm install
npm run check
npm run dev
```

`npm run check` validates the catalogue, generates static pages, type-checks, runs tests, and performs a Wrangler dry-run deploy.

## Data flow

Research snapshot → verification → curated catalogue / candidate manifest → eligibility assessment → explicit production promotion.

Lookup flow:

HTTP → route parser → typed lookup request → adapter registry → policy gate → adapter → source parser/normalization → canonical record → public serializer.

No real government endpoint or production permission is asserted in this skeleton.

## Round 04 research pools

`data/research/candidate-pools-2026-08-14.json` records the 21 converged candidates, 4 Work-high pending candidates, and 9 reconciliation-required candidates exactly as research input. It deliberately creates no `AdapterManifest` and grants no production permission.
