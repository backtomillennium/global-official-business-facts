# User actions required for production

Only the following external/account actions remain.

## 1. Update GitHub `main`

Use one of the supplied artifacts:

- Replace/merge the repository with `global-official-business-facts-v1.zip`; or
- Apply `global-official-business-facts-v1.patch` to the hardened R1 baseline.

Review the changed-files summary in `V1-IMPLEMENTATION-REPORT.md`, commit `package-lock.json`, then push branch `main` of `backtomillennium/global-official-business-facts`. Cloudflare's existing GitHub connection should build and deploy Worker `global-official-business-facts` automatically.

## 2. Set Cloudflare secrets

In the Cloudflare dashboard for Worker `global-official-business-facts`, add these as encrypted secrets:

- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`

Enter the real values only in Cloudflare (or interactively through Wrangler on your own trusted machine). Do not paste them into chat, GitHub files/issues, screenshots, `.env`, or this document. No wallet private key, seed phrase or mnemonic is needed by this repository.

## 3. Verify the connected deployment

After Cloudflare reports a successful build, check:

- `https://business.newbies.cool/`
- `https://business.newbies.cool/business/no/`
- `https://business.newbies.cool/business/sk/`
- `https://business.newbies.cool/business/sg/`
- `https://business.newbies.cool/api/v1/health`
- `https://business.newbies.cool/api/v1/openapi.json`
- `https://business.newbies.cool/api/v1/catalogue/jurisdictions`

Confirm a valid paid lookup without `PAYMENT-SIGNATURE` returns HTTP 402 plus `PAYMENT-REQUIRED`. If secrets are absent or invalid, the service must fail closed with `PAYMENT_UNAVAILABLE` rather than execute an upstream lookup.

## 4. Execute the first mainnet settlement

Using a buyer wallet under your control, make one x402 request for $0.01 native USDC on Polygon mainnet (`eip155:137`) and confirm:

1. The challenge specifies native Polygon USDC, amount 10,000 atomic units and payee `0xF3E577c98CFa7f300fE8f39F7EcFD14B368DCb2f`.
2. A successful settlement returns `PAYMENT-RESPONSE` and the official normalized business record.
3. The recipient wallet receives the expected USDC.
4. Reusing the same signed authorization does not create a reusable service credit.

This wallet action cannot be performed by the repository build.

## 5. Confirm GitHub security settings

In repository settings, enable or confirm:

- Secret scanning
- Push protection
- Dependabot alerts
- Code scanning results from the committed CodeQL workflow
- Main-branch protection against force-push/deletion, with CI required before merge

## 6. Complete Bazaar discovery

After the first successful mainnet settlement, verify the paid resource is discoverable with the declared canonical input/output schema. Until then, leave `BAZAAR_STATUS = PENDING_FIRST_SETTLEMENT` and `DISCOVERY_SHIPPED = NO`.
