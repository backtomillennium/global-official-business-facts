import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { Catalogue } from "../catalogue/catalogue";
import {
  serializeJurisdictionDetail,
  serializeJurisdictionList,
  serializePublicMachineCatalogue,
} from "../catalogue/public-catalogue";
import { DomainError } from "../domain/errors";
import type { LookupService } from "../lookup/lookup-service";
import { serializeBusinessRecord } from "../lookup/serializer";
import type { PaymentGate, PaymentSecrets } from "../payment/x402-gate";
import { LOOKUP_ROUTE, buildOpenApiDocument, parseLookupBody } from "./api-schema";
import { readStrictJson } from "./request-body";
import { API_SECURITY_HEADERS, assertSafeRequestTarget, decodePathSegment, publicErrorPayload } from "./security";

interface RateLimiterBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export type RuntimeBindings = Partial<PaymentSecrets> & {
  REQUEST_RATE_LIMITER?: RateLimiterBinding;
  UPSTREAM_RATE_LIMITER?: RateLimiterBinding;
};

type AppEnvironment = {
  Bindings: RuntimeBindings;
  Variables: { requestId: string };
};

export interface AppInput {
  catalogue: Catalogue;
  lookupService: LookupService;
  paymentGateFactory: (bindings: RuntimeBindings) => PaymentGate;
}

const CORS_HEADERS: Readonly<Record<string, string>> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, payment-signature",
  "access-control-expose-headers": "payment-required, payment-response",
  "access-control-max-age": "600",
};

function statusFor(code: DomainError["code"]): ContentfulStatusCode {
  switch (code) {
    case "INVALID_REQUEST":
    case "INVALID_IDENTIFIER":
    case "UNKNOWN_IDENTIFIER_SCHEME":
    case "UNSUPPORTED_IDENTIFIER":
      return 400;
    case "PAYMENT_REQUIRED":
    case "PAYMENT_INVALID":
      return 402;
    case "ADAPTER_DISABLED":
    case "POLICY_BLOCKED":
    case "LICENCE_BLOCKED":
      return 403;
    case "UNKNOWN_JURISDICTION":
    case "NOT_FOUND":
      return 404;
    case "WITHDRAWN_FOR_LEGAL_REASONS":
      return 410;
    case "RATE_LIMITED":
    case "SOURCE_RATE_LIMITED":
      return 429;
    case "UNSUPPORTED_JURISDICTION":
    case "NO_PRODUCTION_ADAPTER":
      return 501;
    case "PAYMENT_UNAVAILABLE":
    case "SOURCE_UNAVAILABLE":
    case "SOURCE_TIMEOUT":
    case "SOURCE_AUTH_ERROR":
      return 503;
    case "SOURCE_BAD_RESPONSE":
    case "SOURCE_SCHEMA_CHANGED":
      return 502;
    default:
      return 500;
  }
}

function applyPublicHeaders(headers: Headers, requestId: string): void {
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) headers.set(name, value);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  headers.set("x-request-id", requestId);
}

async function oneWayClientKey(request: Request): Promise<string> {
  const input = request.headers.get("cf-connecting-ip") ?? "unknown-client";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function paymentLog(requestId: string, jurisdiction: string, identifierScheme: string, resultClass: string): void {
  console.log(JSON.stringify({
    level: "info",
    event: "payment_result",
    requestId,
    jurisdiction,
    identifierScheme,
    paymentResultClass: resultClass,
  }));
}

export function createApp(input: AppInput) {
  const app = new Hono<AppEnvironment>();

  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    assertSafeRequestTarget(new URL(c.req.url), c.req.url);
    await next();
    applyPublicHeaders(c.res.headers, requestId);
  });

  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "OPTIONS" && c.env?.REQUEST_RATE_LIMITER) {
      const decision = await c.env.REQUEST_RATE_LIMITER.limit({ key: await oneWayClientKey(c.req.raw) });
      if (!decision.success) throw new DomainError("RATE_LIMITED", "API request rate limit exceeded");
    }
    await next();
  });

  app.options("/api/*", (c) => c.body(null, 204));

  app.get("/api/v1/health", (c) => c.json({ status: "ok", schemaVersion: "1" }));
  app.get("/api/v1/openapi.json", (c) => c.json(buildOpenApiDocument()));
  app.get("/api/v1/catalogue", (c) => c.json(serializePublicMachineCatalogue(input.catalogue)));
  app.get("/api/v1/catalogue/jurisdictions", (c) => c.json({
    generatedAt: input.catalogue.data.generatedAt,
    jurisdictions: serializeJurisdictionList(input.catalogue),
  }));
  app.get("/api/v1/catalogue/jurisdictions/:iso2", (c) => {
    const jurisdiction = decodePathSegment(c.req.param("iso2"), "jurisdiction", 32);
    return c.json(serializeJurisdictionDetail(input.catalogue, jurisdiction));
  });

  // Read-only compatibility aliases from the pre-V1 skeleton. Business lookup is never exposed here.
  app.get("/api/catalogue/jurisdictions", (c) => c.json({
    generatedAt: input.catalogue.data.generatedAt,
    jurisdictions: serializeJurisdictionList(input.catalogue),
  }));
  app.get("/api/catalogue/jurisdictions/:iso2", (c) => {
    const jurisdiction = decodePathSegment(c.req.param("iso2"), "jurisdiction", 32);
    return c.json(serializeJurisdictionDetail(input.catalogue, jurisdiction));
  });

  app.post(LOOKUP_ROUTE, async (c) => {
    const body = parseLookupBody(await readStrictJson(c.req.raw));
    const resolved = input.lookupService.resolveRequest({
      jurisdiction: body.jurisdiction,
      scheme: body.scheme,
      value: body.identifier,
    });
    const validated = input.lookupService.validateRequest(resolved);
    const requestId = c.get("requestId");

    const payment = await input.paymentGateFactory(c.env ?? {}).authorizeAndSettle({
      method: c.req.method,
      url: c.req.url,
      headers: c.req.raw.headers,
    });
    paymentLog(requestId, validated.jurisdictionId, validated.identifier.schemeId, payment.resultClass);
    if (!payment.ok) return payment.response;

    if (c.env?.UPSTREAM_RATE_LIMITER) {
      const decision = await c.env.UPSTREAM_RATE_LIMITER.limit({ key: `upstream:${validated.jurisdictionId}` });
      if (!decision.success) throw new DomainError("SOURCE_RATE_LIMITED", "Official source call rate limit exceeded");
    }

    const result = await input.lookupService.lookup(validated, requestId);
    const manifest = input.catalogue.getAdapterManifest(result.execution.adapterId);
    const profile = manifest ? input.catalogue.getExposureProfile(manifest.exposureProfileId) : undefined;
    const response = c.json(serializeBusinessRecord(result.record, input.catalogue, profile));
    for (const [name, value] of Object.entries(payment.headers)) response.headers.set(name, value);
    response.headers.set("cache-control", "no-store");
    return response;
  });

  app.all(LOOKUP_ROUTE, (c) => c.json(
    { error: { code: "INVALID_REQUEST", message: "Method not allowed" } },
    405,
    { Allow: "POST, OPTIONS" },
  ));
  app.all("/api/*", (c) => c.json({ error: { code: "INVALID_REQUEST", message: "Unknown API route" } }, 404));

  app.onError((error, c) => {
    const requestId = c.get("requestId") || crypto.randomUUID();
    if (error instanceof DomainError) {
      const response = c.json({ error: publicErrorPayload(error) }, statusFor(error.code));
      applyPublicHeaders(response.headers, requestId);
      return response;
    }
    console.error(JSON.stringify({ event: "unhandled_error", requestId, type: error instanceof Error ? error.name : typeof error }));
    const response = c.json({ error: { code: "INTERNAL_ERROR", message: "Internal error" } }, 500);
    applyPublicHeaders(response.headers, requestId);
    return response;
  });

  return app;
}
