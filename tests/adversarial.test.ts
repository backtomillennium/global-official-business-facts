import { FacilitatorTimeoutError } from "@x402/core/server";
import type { FacilitatorClient } from "@x402/core/server";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { SettleResponse, VerifyResponse } from "@x402/core/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readJsonObject } from "../src/adapters/shared/json";
import { assertSafeRequestTarget, hostnameIsAllowed } from "../src/http/security";
import {
  BASE_SEPOLIA,
  BASE_SEPOLIA_USDC,
  POLYGON_MAINNET,
  POLYGON_USDC,
  X402_AMOUNT_ATOMIC,
  X402_PAY_TO,
  X402PaymentGate,
} from "../src/payment/x402-gate";
import { WorkerSourceFetcher } from "../src/sources/source-fetcher";

const policy = [{
  sourceId: "official-source",
  allowedOrigins: ["https://official.example"],
  allowedPaths: ["/api/search"],
  allowedPathPrefixes: ["/api/entity/"],
  allowedMethods: ["GET" as const],
  allowedRequestHeaders: ["accept"],
  timeoutMs: 25,
  maxResponseBytes: 64,
}];

afterEach(() => vi.restoreAllMocks());

describe("adversarial routing and outbound transport", () => {
  it.each([
    "https://private.example/api/search",
    "http://official.example/api/search",
    "https://127.0.0.1/api/search",
    "https://official.example.evil.test/api/search",
    "https://official.example@evil.test/api/search",
    "https://official.example/api%2Fsearch",
    "https://official.example/api/../admin",
    "file:///api/search",
  ])("blocks non-allowlisted or ambiguous URL %s before fetch", async (url) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(new WorkerSourceFetcher(policy).request("official-source", { method: "GET", url }))
      .rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks non-allowlisted methods and headers before fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fetcher = new WorkerSourceFetcher(policy);
    await expect(fetcher.request("official-source", { method: "POST", url: "https://official.example/api/search" }))
      .rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    await expect(fetcher.request("official-source", { method: "GET", url: "https://official.example/api/search", headers: { authorization: "secret" } }))
      .rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [301, "http://127.0.0.1/private"],
    [302, "https://169.254.169.254/latest/meta-data"],
    [307, "https://evil.test/steal"],
    [308, "https://official.example/api/search"],
  ])("fails closed on redirect %i without following location", async (status, location) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status, headers: { location } }));
    await expect(new WorkerSourceFetcher(policy).request("official-source", { method: "GET", url: "https://official.example/api/search" }))
      .rejects.toMatchObject({ code: "SOURCE_BAD_RESPONSE" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }));
  });

  it.each([
    [401, "SOURCE_AUTH_ERROR"],
    [403, "SOURCE_AUTH_ERROR"],
    [429, "SOURCE_RATE_LIMITED"],
    [500, "SOURCE_UNAVAILABLE"],
  ])("maps upstream status %i without inventing NOT_FOUND", async (status, code) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
    await expect(new WorkerSourceFetcher(policy).request("official-source", { method: "GET", url: "https://official.example/api/search" }))
      .rejects.toMatchObject({ code });
  });

  it("keeps 404 and 410 available for adapter-level semantics", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fetcher = new WorkerSourceFetcher(policy);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await fetcher.request("official-source", { method: "GET", url: "https://official.example/api/search" })).status).toBe(404);
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 410 }));
    expect((await fetcher.request("official-source", { method: "GET", url: "https://official.example/api/search" })).status).toBe(410);
  });

  it("maps transport aborts to SOURCE_TIMEOUT", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(new WorkerSourceFetcher(policy).request("official-source", { method: "GET", url: "https://official.example/api/search" }))
      .rejects.toMatchObject({ code: "SOURCE_TIMEOUT" });
  });

  it("keeps the timeout active while a successful response body is streaming", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const signal = init?.signal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
        },
      });
      return new Response(body, { headers: { "content-type": "application/json" } });
    });
    const response = await new WorkerSourceFetcher(policy).request("official-source", { method: "GET", url: "https://official.example/api/search" });
    await expect(new Response(response.body).text()).rejects.toMatchObject({ code: "SOURCE_TIMEOUT" });
  });

  it("rejects a declared or streamed response larger than its fixed bound", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const fetcher = new WorkerSourceFetcher(policy);
    fetchSpy.mockResolvedValueOnce(new Response("{}", { headers: { "content-length": "65", "content-type": "application/json" } }));
    await expect(fetcher.request("official-source", { method: "GET", url: "https://official.example/api/search" }))
      .rejects.toMatchObject({ code: "SOURCE_BAD_RESPONSE" });

    fetchSpy.mockResolvedValueOnce(new Response("x".repeat(65), { headers: { "content-type": "application/json" } }));
    const streamed = await fetcher.request("official-source", { method: "GET", url: "https://official.example/api/search" });
    await expect(new Response(streamed.body).text()).rejects.toMatchObject({ code: "SOURCE_BAD_RESPONSE" });
  });

  it("rejects wrong content type, invalid JSON and non-object JSON", async () => {
    const response = (body: string, contentType: string) => {
      const value = new Response(body, { headers: { "content-type": contentType } });
      return { status: value.status, headers: value.headers, body: value.body };
    };
    await expect(readJsonObject(response("{}", "text/html"), "official-source")).rejects.toMatchObject({ code: "SOURCE_BAD_RESPONSE" });
    await expect(readJsonObject(response("{", "application/json"), "official-source")).rejects.toMatchObject({ code: "SOURCE_BAD_RESPONSE" });
    await expect(readJsonObject(response("[]", "application/json"), "official-source")).rejects.toMatchObject({ code: "SOURCE_SCHEMA_CHANGED" });
  });

  it("rejects encoded API routing tricks and alternate hostnames", () => {
    expect(() => assertSafeRequestTarget(new URL("https://business.newbies.cool/api/v1/%2e%2e"), "https://business.newbies.cool/api/v1/%2e%2e"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() => assertSafeRequestTarget(new URL("https://business.newbies.cool/api/v1/%252f"), "https://business.newbies.cool/api/v1/%252f"))
      .toThrowError(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(hostnameIsAllowed("https://business.newbies.cool/api/v1/health", "business.newbies.cool")).toBe(true);
    expect(hostnameIsAllowed("https://preview.workers.dev/api/v1/health", "business.newbies.cool")).toBe(false);
    expect(hostnameIsAllowed("http://business.newbies.cool/api/v1/health", "business.newbies.cool")).toBe(false);
    expect(hostnameIsAllowed("https://business.newbies.cool:8443/api/v1/health", "business.newbies.cool")).toBe(false);
  });
});

function facilitator(input: { verify?: "valid" | "invalid" | "throw"; settle?: "valid" | "invalid" | "throw" | "timeout"; supported?: "valid" | "throw" } = {}) {
  const verify = vi.fn(async (): Promise<VerifyResponse> => {
    if (input.verify === "throw") throw new Error("FACILITATOR_SECRET_DETAIL");
    return input.verify === "invalid" ? { isValid: false, invalidReason: "bad-payment" } : { isValid: true, payer: "0x0000000000000000000000000000000000000001" };
  });
  const settle = vi.fn(async (): Promise<SettleResponse> => {
    if (input.settle === "throw") throw new Error("FACILITATOR_SECRET_DETAIL");
    if (input.settle === "timeout") throw new FacilitatorTimeoutError("settle", 10_000);
    return input.settle === "invalid"
      ? { success: false, errorReason: "failed", transaction: "", network: BASE_SEPOLIA }
      : { success: true, transaction: "0xtest", network: BASE_SEPOLIA, payer: "0x0000000000000000000000000000000000000001" };
  });
  const client: FacilitatorClient = {
    verify,
    settle,
    getSupported: async () => {
      if (input.supported === "throw") throw new Error("FACILITATOR_SECRET_DETAIL");
      return {
        kinds: [{ x402Version: 2, scheme: "exact", network: BASE_SEPOLIA }],
        extensions: [],
        signers: { [BASE_SEPOLIA]: ["0x0000000000000000000000000000000000000002"] },
      };
    },
  };
  return { client, verify, settle };
}

function paymentHeader(overrides: Partial<{ network: string; asset: string; amount: string; payTo: string }> = {}): string {
  const value = {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: overrides.network ?? BASE_SEPOLIA,
      asset: overrides.asset ?? BASE_SEPOLIA_USDC,
      amount: overrides.amount ?? X402_AMOUNT_ATOMIC,
      payTo: overrides.payTo ?? X402_PAY_TO,
      maxTimeoutSeconds: 120,
      extra: { name: "USDC", version: "2" },
    },
    payload: { signature: "0x00", authorization: {} },
  };
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

async function authorize(gate: X402PaymentGate, header?: string) {
  const headers = new Headers({ accept: "application/json" });
  if (header) headers.set("payment-signature", header);
  return gate.authorizeAndSettle({
    method: "POST",
    url: "https://business.newbies.cool/api/v1/business/lookup",
    headers,
  });
}

describe("x402 fail-closed payment boundary", () => {
  it("returns a v2 challenge without calling verify or settle", async () => {
    const fake = facilitator();
    const decision = await authorize(new X402PaymentGate({ facilitator: fake.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" }));
    expect(decision).toMatchObject({ ok: false, resultClass: "required" });
    if (decision.ok) throw new Error("Expected payment requirement");
    expect(decision.response.status).toBe(402);
    expect(decision.response.headers.has("payment-required")).toBe(true);
    expect(fake.verify).not.toHaveBeenCalled();
    expect(fake.settle).not.toHaveBeenCalled();
  });

  it("binds Polygon mainnet native USDC, exact price and payee into the server challenge", async () => {
    const fake = facilitator();
    fake.client.getSupported = async () => ({
      kinds: [{ x402Version: 2, scheme: "exact", network: POLYGON_MAINNET }],
      extensions: ["bazaar"],
      signers: { [POLYGON_MAINNET]: ["0x0000000000000000000000000000000000000002"] },
    });
    const decision = await authorize(new X402PaymentGate({ facilitator: fake.client, network: POLYGON_MAINNET, asset: POLYGON_USDC, assetName: "USD Coin" }));
    if (decision.ok) throw new Error("Expected payment requirement");
    const encoded = decision.response.headers.get("payment-required");
    if (!encoded) throw new Error("PAYMENT-REQUIRED is missing");
    const challenge = decodePaymentRequiredHeader(encoded);
    expect(challenge.x402Version).toBe(2);
    expect(challenge.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "eip155:137",
      asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      amount: "10000",
      payTo: "0xF3E577c98CFa7f300fE8f39F7EcFD14B368DCb2f",
    });
    expect(challenge.extensions).toHaveProperty("bazaar");
  });

  it.each([
    ["wrong network", { network: "eip155:137" }],
    ["wrong asset", { asset: "0x0000000000000000000000000000000000000000" }],
    ["wrong amount", { amount: "9999" }],
    ["wrong payTo", { payTo: "0x0000000000000000000000000000000000000000" }],
  ])("rejects %s before facilitator verification", async (_label, overrides) => {
    const fake = facilitator();
    const gate = new X402PaymentGate({ facilitator: fake.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" });
    const decision = await authorize(gate, paymentHeader(overrides));
    expect(decision).toMatchObject({ ok: false, resultClass: "invalid" });
    expect(fake.verify).not.toHaveBeenCalled();
    expect(fake.settle).not.toHaveBeenCalled();
  });

  it("settles through the official resource server and never treats a payment as reusable credit", async () => {
    const fake = facilitator();
    const gate = new X402PaymentGate({ facilitator: fake.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" });
    expect(await authorize(gate, paymentHeader())).toMatchObject({ ok: true, resultClass: "settled" });
    expect(await authorize(gate, paymentHeader())).toMatchObject({ ok: true, resultClass: "settled" });
    expect(fake.verify).toHaveBeenCalledTimes(2);
    expect(fake.settle).toHaveBeenCalledTimes(2);
  });

  it("fails closed on verify, settle, or facilitator transport failure", async () => {
    const invalidVerify = facilitator({ verify: "invalid" });
    expect(await authorize(new X402PaymentGate({ facilitator: invalidVerify.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" }), paymentHeader()))
      .toMatchObject({ ok: false, resultClass: "invalid" });
    expect(invalidVerify.settle).not.toHaveBeenCalled();

    const invalidSettle = facilitator({ settle: "invalid" });
    expect(await authorize(new X402PaymentGate({ facilitator: invalidSettle.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" }), paymentHeader()))
      .toMatchObject({ ok: false, resultClass: "invalid" });

    const unavailableSettle = facilitator({ settle: "throw" });
    const failedSettle = await authorize(new X402PaymentGate({ facilitator: unavailableSettle.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" }), paymentHeader());
    expect(failedSettle).toMatchObject({ ok: false, resultClass: "invalid" });
    if (failedSettle.ok) throw new Error("Expected failed settlement response");
    expect(await failedSettle.response.text()).not.toContain("FACILITATOR_SECRET_DETAIL");

    const unavailable = facilitator({ supported: "throw" });
    const decision = await authorize(new X402PaymentGate({ facilitator: unavailable.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" }), paymentHeader());
    expect(decision).toMatchObject({ ok: false, resultClass: "unavailable" });
    if (decision.ok) throw new Error("Expected unavailable response");
    expect(await decision.response.text()).not.toContain("FACILITATOR_SECRET_DETAIL");
  });

  it("reports a settlement timeout as indeterminate instead of claiming no payment occurred", async () => {
    const fake = facilitator({ settle: "timeout" });
    const decision = await authorize(
      new X402PaymentGate({ facilitator: fake.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" }),
      paymentHeader(),
    );
    expect(decision).toMatchObject({ ok: false, resultClass: "indeterminate" });
    if (decision.ok) throw new Error("Expected indeterminate settlement response");
    expect(decision.response.status).toBe(503);
    await expect(decision.response.json()).resolves.toMatchObject({
      error: { code: "PAYMENT_OUTCOME_UNKNOWN" },
    });
    expect(fake.verify).toHaveBeenCalledOnce();
    expect(fake.settle).toHaveBeenCalledOnce();
  });

  it("recovers from a transient initialization failure after the bounded cooldown", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const fake = facilitator();
    const supported = vi.fn()
      .mockRejectedValueOnce(new Error("TRANSIENT_FACILITATOR_FAILURE"))
      .mockResolvedValue({
        kinds: [{ x402Version: 2, scheme: "exact", network: BASE_SEPOLIA }],
        extensions: [],
        signers: { [BASE_SEPOLIA]: ["0x0000000000000000000000000000000000000002"] },
      });
    fake.client.getSupported = supported;
    const gate = new X402PaymentGate({ facilitator: fake.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" });

    expect(await authorize(gate)).toMatchObject({ ok: false, resultClass: "unavailable" });
    expect(supported).toHaveBeenCalledTimes(1);

    // Requests during an outage fail closed without creating an upstream retry storm.
    now += 5_000;
    expect(await authorize(gate)).toMatchObject({ ok: false, resultClass: "unavailable" });
    expect(supported).toHaveBeenCalledTimes(1);

    // A healthy facilitator can recover the same long-lived Worker isolate.
    now += 5_001;
    const recovered = await authorize(gate);
    expect(recovered).toMatchObject({ ok: false, resultClass: "required" });
    if (recovered.ok) throw new Error("Expected payment requirement");
    expect(recovered.response.status).toBe(402);
    expect(supported).toHaveBeenCalledTimes(2);
  });

  it("does not log malformed payment signature material", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sentinel = "PAYMENT_SIGNATURE_SENTINEL";
    const fake = facilitator();
    const decision = await authorize(new X402PaymentGate({ facilitator: fake.client, network: BASE_SEPOLIA, asset: BASE_SEPOLIA_USDC, assetName: "USDC" }), sentinel);
    expect(decision.ok).toBe(false);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(sentinel);
  });
});
