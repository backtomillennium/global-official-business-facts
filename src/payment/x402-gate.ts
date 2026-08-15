import { createCdpFacilitatorClient } from "@coinbase/cdp-sdk/x402";
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import type { FacilitatorClient, HTTPAdapter, HTTPRequestContext, HTTPResponseInstructions, RoutesConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { LOOKUP_ROUTE, lookupRequestJsonSchema, publicBusinessResponseJsonSchema } from "../http/api-schema";

export const X402_VERSION = 2;
export const X402_SCHEME = "exact";
export const X402_PRICE = "$0.01";
export const X402_AMOUNT_ATOMIC = "10000";
export const X402_PAY_TO = "0xF3E577c98CFa7f300fE8f39F7EcFD14B368DCb2f";
export const POLYGON_MAINNET = "eip155:137";
export const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
export const BASE_SEPOLIA = "eip155:84532";
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export type PaymentResultClass = "required" | "invalid" | "settled" | "unavailable";

export interface PaymentRequestDescriptor {
  method: string;
  url: string;
  headers: Headers;
}

export type PaymentDecision =
  | { ok: true; headers: Record<string, string>; resultClass: "settled" }
  | { ok: false; response: Response; resultClass: Exclude<PaymentResultClass, "settled"> };

export interface PaymentGate {
  authorizeAndSettle(request: PaymentRequestDescriptor): Promise<PaymentDecision>;
}

export interface PaymentSecrets {
  CDP_API_KEY_ID: string;
  CDP_API_KEY_SECRET: string;
}

class RequestAdapter implements HTTPAdapter {
  private readonly parsed: URL;

  constructor(private readonly request: PaymentRequestDescriptor) {
    this.parsed = new URL(request.url);
  }

  getHeader(name: string): string | undefined { return this.request.headers.get(name) ?? undefined; }
  getMethod(): string { return this.request.method; }
  getPath(): string { return this.parsed.pathname; }
  getUrl(): string { return this.parsed.toString(); }
  getAcceptHeader(): string { return this.request.headers.get("accept") ?? "application/json"; }
  getUserAgent(): string { return this.request.headers.get("user-agent") ?? ""; }
  getQueryParams(): Record<string, string> { return Object.fromEntries(this.parsed.searchParams.entries()); }
  getQueryParam(name: string): string | undefined { return this.parsed.searchParams.get(name) ?? undefined; }
  async getBody(): Promise<undefined> { return undefined; }
}

function responseFromInstructions(instructions: HTTPResponseInstructions): Response {
  const headers = new Headers(instructions.headers);
  let body: BodyInit | null = null;
  if (instructions.body !== undefined) {
    if (instructions.isHtml || typeof instructions.body === "string") {
      body = String(instructions.body);
    } else {
      body = JSON.stringify(instructions.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
    }
  }
  return new Response(body, { status: instructions.status, headers });
}

function paymentUnavailable(): PaymentDecision {
  return {
    ok: false,
    resultClass: "unavailable",
    response: new Response(JSON.stringify({ error: { code: "PAYMENT_UNAVAILABLE", message: "Payment verification is temporarily unavailable" } }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    }),
  };
}

export class X402PaymentGate implements PaymentGate {
  private readonly httpServer: x402HTTPResourceServer;
  private initialization: Promise<void> | null = null;

  constructor(input: { facilitator: FacilitatorClient; network: Network; asset: string; assetName: string }) {
    const resourceServer = new x402ResourceServer(input.facilitator)
      .register(input.network, new ExactEvmScheme())
      .registerExtension(bazaarResourceServerExtension);
    const routes: RoutesConfig = {
      [`POST ${LOOKUP_ROUTE}`]: {
        accepts: {
          scheme: X402_SCHEME,
          network: input.network,
          payTo: X402_PAY_TO,
          price: {
            asset: input.asset,
            amount: X402_AMOUNT_ATOMIC,
            extra: { name: input.assetName, version: "2" },
          },
          maxTimeoutSeconds: 120,
        },
        resource: `https://business.newbies.cool${LOOKUP_ROUTE}`,
        description: "Normalized official business facts from government and business-register sources.",
        mimeType: "application/json",
        serviceName: "Global Official Business Facts",
        tags: ["business", "official-source", "lookup"],
        extensions: declareDiscoveryExtension({
          bodyType: "json",
          input: { jurisdiction: "NO", scheme: "no-organisasjonsnummer", identifier: "923609016" },
          inputSchema: lookupRequestJsonSchema,
          output: { schema: publicBusinessResponseJsonSchema },
        }),
        unpaidResponseBody: () => ({
          contentType: "application/json",
          body: { error: { code: "PAYMENT_REQUIRED", message: "x402 v2 payment is required" } },
        }),
        settlementFailedResponseBody: () => ({
          contentType: "application/json",
          body: { error: { code: "PAYMENT_INVALID", message: "Payment could not be settled" } },
        }),
      },
    };
    this.httpServer = new x402HTTPResourceServer(resourceServer, routes);
  }

  async authorizeAndSettle(request: PaymentRequestDescriptor): Promise<PaymentDecision> {
    try {
      this.initialization ??= this.httpServer.initialize();
      await this.initialization;
      const adapter = new RequestAdapter(request);
      const paymentHeader = adapter.getHeader("payment-signature");
      const context: HTTPRequestContext = {
        adapter,
        path: adapter.getPath(),
        method: adapter.getMethod(),
        ...(paymentHeader === undefined ? {} : { paymentHeader }),
      };
      const processed = await this.httpServer.processHTTPRequest(context);
      if (processed.type === "payment-error") {
        const response = responseFromInstructions(processed.response);
        return { ok: false, response, resultClass: response.status === 402 && !request.headers.has("payment-signature") ? "required" : "invalid" };
      }
      if (processed.type !== "payment-verified") return paymentUnavailable();
      if (processed.beforeHandlerSettlement) {
        return {
          ok: true,
          resultClass: "settled",
          headers: this.httpServer.createCompletedSettlementHeaders(processed.beforeHandlerSettlement, "no-store"),
        };
      }

      // Exact EIP-3009 normally settles after a framework handler. GOBF deliberately invokes
      // the official resource-server settlement primitive here so no paid upstream lookup is
      // executed until settlement has succeeded.
      const settled = await this.httpServer.processSettlement(
        processed.paymentPayload,
        processed.paymentRequirements,
        processed.declaredExtensions,
        { request: context },
      );
      if (!settled.success) {
        return { ok: false, response: responseFromInstructions(settled.response), resultClass: "invalid" };
      }
      return { ok: true, headers: settled.headers, resultClass: "settled" };
    } catch (error) {
      // Never serialize facilitator errors, auth material, payment payloads, or signatures.
      void error;
      return paymentUnavailable();
    }
  }
}

export function createTestnetPaymentGate(): PaymentGate {
  return new X402PaymentGate({
    facilitator: new HTTPFacilitatorClient({ url: "https://x402.org/facilitator", timeoutMs: 10_000 }),
    network: BASE_SEPOLIA,
    asset: BASE_SEPOLIA_USDC,
    assetName: "USDC",
  });
}

export function createProductionPaymentGate(secrets?: Partial<PaymentSecrets>): PaymentGate {
  if (!secrets?.CDP_API_KEY_ID || !secrets.CDP_API_KEY_SECRET) {
    return { authorizeAndSettle: async () => paymentUnavailable() };
  }
  const facilitator = createCdpFacilitatorClient({
    apiKeyId: secrets.CDP_API_KEY_ID,
    apiKeySecret: secrets.CDP_API_KEY_SECRET,
  });
  return new X402PaymentGate({ facilitator, network: POLYGON_MAINNET, asset: POLYGON_USDC, assetName: "USD Coin" });
}
