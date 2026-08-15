import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { norwayAdapter } from "../src/adapters/norway/no-brreg-enhetsregisteret-v1";
import { singaporeAdapter } from "../src/adapters/singapore/sg-acra-opendata-v1";
import { slovakiaAdapter } from "../src/adapters/slovakia/sk-rpo-v1";
import { Catalogue } from "../src/catalogue/catalogue";
import { DomainError } from "../src/domain/errors";
import { compiledCatalogue } from "../src/generated/catalogue.generated";
import { createApp, type RuntimeBindings } from "../src/http/app";
import { AdapterRegistry } from "../src/lookup/adapter-registry";
import { LookupService } from "../src/lookup/lookup-service";
import type { PaymentDecision, PaymentGate } from "../src/payment/x402-gate";
import { ProductionPolicyGate } from "../src/policy/policy-gate";

const norwayFixture = JSON.parse(readFileSync(new URL("./fixtures/nor-entity.json", import.meta.url), "utf8")) as unknown;
const catalogue = new Catalogue(compiledCatalogue);

function makeRuntime(decision: PaymentDecision, events: string[] = [], sourceError?: DomainError) {
  const payment = vi.fn(async () => {
    events.push("payment");
    return decision;
  });
  const paymentGate: PaymentGate = { authorizeAndSettle: payment };
  const sourceRequest = vi.fn(async () => {
    events.push("upstream");
    if (sourceError) throw sourceError;
    const response = new Response(JSON.stringify(norwayFixture), { headers: { "content-type": "application/hal+json" } });
    return { status: response.status, headers: response.headers, body: response.body };
  });
  const lookup = new LookupService(
    catalogue,
    new AdapterRegistry([norwayAdapter, slovakiaAdapter, singaporeAdapter]),
    new ProductionPolicyGate(compiledCatalogue.eligibilityAssessments, compiledCatalogue.exposureProfiles),
    (requestId) => ({
      fetcher: { request: sourceRequest },
      clock: { now: () => new Date("2026-08-14T08:00:00.000Z") },
      logger: { info() {}, warn() {}, error() {} },
      requestId,
    }),
  );
  const app = createApp({ catalogue, lookupService: lookup, paymentGateFactory: () => paymentGate });
  return { app, payment, sourceRequest };
}

const requiredDecision: PaymentDecision = {
  ok: false,
  resultClass: "required",
  response: new Response(JSON.stringify({ error: { code: "PAYMENT_REQUIRED", message: "Payment required" } }), {
    status: 402,
    headers: { "content-type": "application/json", "payment-required": "test-challenge" },
  }),
};
const settledDecision: PaymentDecision = { ok: true, resultClass: "settled", headers: { "payment-response": "test-settlement" } };

function validBody() {
  return JSON.stringify({ jurisdiction: "NO", scheme: "no-organisasjonsnummer", identifier: "923609016" });
}

async function request(app: ReturnType<typeof makeRuntime>["app"], path: string, init?: RequestInit, env: RuntimeBindings = {}) {
  return app.request(`https://business.newbies.cool${path}`, init, env);
}

beforeEach(() => vi.restoreAllMocks());

describe("V1 HTTP API", () => {
  it("serves canonical health, catalogue and OpenAPI routes", async () => {
    const { app } = makeRuntime(requiredDecision);
    expect((await request(app, "/api/v1/health")).status).toBe(200);
    const catalogueResponse = await request(app, "/api/v1/catalogue/jurisdictions");
    expect((await catalogueResponse.json() as { jurisdictions: unknown[] }).jurisdictions).toHaveLength(3);
    const openapi = await (await request(app, "/api/v1/openapi.json")).json() as {
      paths: Record<string, { post?: { requestBody?: { content?: Record<string, { schema?: { oneOf?: unknown[] } }> } } }>;
    };
    expect(openapi.paths).toHaveProperty("/api/v1/business/lookup");
    expect(openapi.paths).not.toHaveProperty("/api/business/:jurisdiction/:identifier");
    expect(openapi.paths["/api/v1/business/lookup"]?.post?.requestBody?.content?.["application/json"]?.schema?.oneOf).toHaveLength(3);
  });

  it("validates a known request before returning an x402 challenge and never calls upstream", async () => {
    const { app, payment, sourceRequest } = makeRuntime(requiredDecision);
    const response = await request(app, "/api/v1/business/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: validBody(),
    });
    expect(response.status).toBe(402);
    expect(response.headers.get("payment-required")).toBe("test-challenge");
    expect(response.headers.get("access-control-expose-headers")).toContain("payment-response");
    expect(payment).toHaveBeenCalledOnce();
    expect(sourceRequest).not.toHaveBeenCalled();
  });

  it("settles before upstream lookup and emits a compact no-store response", async () => {
    const events: string[] = [];
    const { app, sourceRequest } = makeRuntime(settledDecision, events);
    const response = await request(app, "/api/v1/business/lookup", {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": "redacted-test-value" },
      body: validBody(),
    });
    expect(response.status).toBe(200);
    expect(events).toEqual(["payment", "upstream"]);
    expect(sourceRequest).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("payment-response")).toBe("test-settlement");
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ schemaVersion: "1", jurisdiction: { id: "NOR", iso2: "NO", name: "Norway" } });
    expect(JSON.stringify(body)).not.toContain("statusFlags");
    expect(JSON.stringify(body)).not.toContain("redacted-test-value");
  });

  it.each([
    ["missing content type", { method: "POST", body: validBody() }],
    ["unsupported content type", { method: "POST", headers: { "content-type": "text/plain" }, body: validBody() }],
    ["duplicate content type", { method: "POST", headers: { "content-type": "application/json, text/plain" }, body: validBody() }],
    ["malformed JSON", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }],
    ["extra property", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jurisdiction: "NO", scheme: "no-organisasjonsnummer", identifier: "923609016", url: "https://evil.test" }) }],
    ["unicode identifier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jurisdiction: "NO", scheme: "no-organisasjonsnummer", identifier: "９２３６０９０１６" }) }],
    ["null byte", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jurisdiction: "NO", scheme: "no-organisasjonsnummer", identifier: "923\u0000609016" }) }],
    ["long identifier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jurisdiction: "NO", scheme: "no-organisasjonsnummer", identifier: "9".repeat(500) }) }],
    ["full URL identifier", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jurisdiction: "NO", scheme: "no-organisasjonsnummer", identifier: "https://evil.test" }) }],
    ["deep JSON", { method: "POST", headers: { "content-type": "application/json" }, body: "[".repeat(500) + "0" + "]".repeat(500) }],
  ])("rejects %s without invoking payment or upstream", async (_label, init) => {
    const { app, payment, sourceRequest } = makeRuntime(requiredDecision);
    const response = await request(app, "/api/v1/business/lookup", init as RequestInit);
    expect(response.status).toBe(400);
    expect(payment).not.toHaveBeenCalled();
    expect(sourceRequest).not.toHaveBeenCalled();
  });

  it("enforces the streaming 2 KiB body limit", async () => {
    const { app, payment } = makeRuntime(requiredDecision);
    const response = await request(app, "/api/v1/business/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"padding":"${"a".repeat(2_100)}"}`,
    });
    expect(response.status).toBe(400);
    expect(payment).not.toHaveBeenCalled();
  });

  it("handles CORS preflight without payment or credentials", async () => {
    const { app, payment } = makeRuntime(requiredDecision);
    const response = await request(app, "/api/v1/business/lookup", {
      method: "OPTIONS",
      headers: {
        origin: "https://client.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,payment-signature",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("payment-signature");
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(payment).not.toHaveBeenCalled();
  });

  it("enforces request and upstream rate-limit bindings", async () => {
    const denied = { limit: vi.fn(async () => ({ success: false })) };
    const { app: requestLimited, payment: firstPayment } = makeRuntime(requiredDecision);
    const first = await request(requestLimited, "/api/v1/health", undefined, { REQUEST_RATE_LIMITER: denied });
    expect(first.status).toBe(429);
    expect(firstPayment).not.toHaveBeenCalled();

    const { app: upstreamLimited, payment: secondPayment, sourceRequest } = makeRuntime(settledDecision);
    const second = await request(upstreamLimited, "/api/v1/business/lookup", {
      method: "POST", headers: { "content-type": "application/json", "payment-signature": "signed-test-payment" }, body: validBody(),
    }, { UPSTREAM_RATE_LIMITER: denied });
    expect(second.status).toBe(429);
    expect(secondPayment).not.toHaveBeenCalled();
    expect(sourceRequest).not.toHaveBeenCalled();
  });

  it("does not spend official-source quota on an unpaid 402 challenge", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const { app, payment, sourceRequest } = makeRuntime(requiredDecision);
    const response = await request(app, "/api/v1/business/lookup", {
      method: "POST", headers: { "content-type": "application/json" }, body: validBody(),
    }, { UPSTREAM_RATE_LIMITER: limiter });
    expect(response.status).toBe(402);
    expect(limiter.limit).not.toHaveBeenCalled();
    expect(payment).toHaveBeenCalledOnce();
    expect(sourceRequest).not.toHaveBeenCalled();
  });

  it("uses the official unauthenticated Singapore source quota before payment", async () => {
    const generic = { limit: vi.fn(async () => ({ success: true })) };
    const singapore = { limit: vi.fn(async () => ({ success: false })) };
    const { app, payment, sourceRequest } = makeRuntime(settledDecision);
    const response = await request(app, "/api/v1/business/lookup", {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": "signed-test-payment" },
      body: JSON.stringify({ jurisdiction: "SG", scheme: "sg-uen", identifier: "201201936C" }),
    }, { UPSTREAM_RATE_LIMITER: generic, SINGAPORE_SOURCE_RATE_LIMITER: singapore });
    expect(response.status).toBe(429);
    expect(singapore.limit).toHaveBeenCalledWith({ key: "upstream:SGP" });
    expect(generic.limit).not.toHaveBeenCalled();
    expect(payment).not.toHaveBeenCalled();
    expect(sourceRequest).not.toHaveBeenCalled();
  });

  it("reserves both official RPO subrequests before settling a Slovak lookup", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: true })) };
    const { app, payment, sourceRequest } = makeRuntime(requiredDecision);
    const response = await request(app, "/api/v1/business/lookup", {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": "signed-test-payment" },
      body: JSON.stringify({ jurisdiction: "SK", scheme: "sk-ico", identifier: "00166197" }),
    }, { UPSTREAM_RATE_LIMITER: limiter });
    expect(response.status).toBe(402);
    expect(limiter.limit).toHaveBeenCalledTimes(2);
    expect(limiter.limit).toHaveBeenNthCalledWith(1, { key: "upstream:SVK" });
    expect(limiter.limit).toHaveBeenNthCalledWith(2, { key: "upstream:SVK" });
    expect(payment).toHaveBeenCalledOnce();
    expect(sourceRequest).not.toHaveBeenCalled();
  });

  it("rejects wrong methods and encoded API paths", async () => {
    const { app } = makeRuntime(requiredDecision);
    expect((await request(app, "/api/v1/business/lookup", { method: "GET" })).status).toBe(405);
    // WHATWG Request normalization collapses the first dot-segment before the Worker sees it;
    // it still fails closed as an unknown route. Double encoding remains visible and is rejected.
    expect((await request(app, "/api/v1/catalogue/jurisdictions/%2e%2e")).status).toBe(404);
    expect((await request(app, "/api/v1/catalogue/jurisdictions/%252e%252e")).status).toBe(400);
  });

  it("keeps paid NOT_FOUND, timeout and invalid-source responses distinct without leaking internals", async () => {
    const init: RequestInit = { method: "POST", headers: { "content-type": "application/json" }, body: validBody() };
    const notFound = makeRuntime(settledDecision, [], new DomainError("NOT_FOUND", "No official record"));
    expect((await request(notFound.app, "/api/v1/business/lookup", init)).status).toBe(404);

    const timeout = makeRuntime(settledDecision, [], new DomainError("SOURCE_TIMEOUT", "SECRET_UPSTREAM_DETAIL", { sourceId: "internal-source" }));
    const timeoutResponse = await request(timeout.app, "/api/v1/business/lookup", init);
    expect(timeoutResponse.status).toBe(503);
    expect(await timeoutResponse.text()).not.toContain("SECRET_UPSTREAM_DETAIL");

    const invalid = makeRuntime(settledDecision, [], new DomainError("SOURCE_BAD_RESPONSE", "RAW_UPSTREAM_SENTINEL", { sourceId: "internal-source" }));
    const invalidResponse = await request(invalid.app, "/api/v1/business/lookup", init);
    expect(invalidResponse.status).toBe(502);
    const invalidText = await invalidResponse.text();
    expect(invalidText).not.toContain("RAW_UPSTREAM_SENTINEL");
    expect(invalidText).not.toContain("internal-source");
    expect(invalidText).not.toContain("stack");
  });

  it("bounds repeated malformed requests before payment", async () => {
    const { app, payment } = makeRuntime(requiredDecision);
    for (let index = 0; index < 20; index += 1) {
      const response = await request(app, "/api/v1/business/lookup", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{",
      });
      expect(response.status).toBe(400);
    }
    expect(payment).not.toHaveBeenCalled();
  });
});
