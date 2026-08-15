// @coinbase/cdp-sdk currently imports its JWT nonce helper from `uncrypto`.
// With Wrangler's `nodejs_compat` condition, uncrypto 0.1.3 selects its Node
// build, whose `node:crypto.webcrypto.getRandomValues` path is not callable in
// workerd. Cloudflare Workers expose the standard Web Crypto implementation on
// globalThis, so keep the official CDP/x402 flow and only adapt that dependency
// boundary to the platform-native API.
const workerCrypto = globalThis.crypto;

export const subtle: Crypto["subtle"] = workerCrypto.subtle;

export const randomUUID: Crypto["randomUUID"] = () => workerCrypto.randomUUID();

export const getRandomValues: Crypto["getRandomValues"] = array =>
  workerCrypto.getRandomValues(array);

const uncrypto = { subtle, randomUUID, getRandomValues };

export default uncrypto;
