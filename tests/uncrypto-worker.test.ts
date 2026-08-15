import { describe, expect, it } from "vitest";
import uncrypto, { getRandomValues, randomUUID, subtle } from "../src/compat/uncrypto-worker";

describe("Cloudflare Web Crypto compatibility adapter", () => {
  it("uses the platform Web Crypto implementation for CDP JWT nonces", () => {
    const bytes = new Uint8Array(16);
    const result = getRandomValues(bytes);

    expect(result).toBe(bytes);
    expect(bytes.some(value => value !== 0)).toBe(true);
    expect(uncrypto.getRandomValues).toBe(getRandomValues);
    expect(subtle).toBe(globalThis.crypto.subtle);
    expect(randomUUID()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
