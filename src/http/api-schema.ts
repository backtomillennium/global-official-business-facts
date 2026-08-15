import { DomainError } from "../domain/errors";

export const LOOKUP_ROUTE = "/api/v1/business/lookup";
export const SUPPORTED_LOOKUPS = {
  NO: { jurisdictionId: "NOR", scheme: "no-organisasjonsnummer", maxLength: 32 },
  SK: { jurisdictionId: "SVK", scheme: "sk-ico", maxLength: 32 },
  SG: { jurisdictionId: "SGP", scheme: "sg-uen", maxLength: 64 },
} as const;

export interface LookupBody {
  jurisdiction: keyof typeof SUPPORTED_LOOKUPS;
  scheme: (typeof SUPPORTED_LOOKUPS)[keyof typeof SUPPORTED_LOOKUPS]["scheme"];
  identifier: string;
}

export const lookupRequestJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["jurisdiction", "scheme", "identifier"],
  properties: {
    jurisdiction: { type: "string", enum: Object.keys(SUPPORTED_LOOKUPS) },
    scheme: { type: "string", enum: Object.values(SUPPORTED_LOOKUPS).map((item) => item.scheme) },
    identifier: { type: "string", minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9 .-]+$" },
  },
} as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLookupBody(value: unknown): LookupBody {
  if (!isObject(value)) throw new DomainError("INVALID_REQUEST", "JSON body must be an object");
  const keys = Object.keys(value);
  if (keys.length !== 3 || keys.some((key) => !["jurisdiction", "scheme", "identifier"].includes(key))) {
    throw new DomainError("INVALID_REQUEST", "JSON body contains missing or unexpected properties");
  }
  if (typeof value.jurisdiction !== "string" || value.jurisdiction.length > 2) {
    throw new DomainError("INVALID_REQUEST", "jurisdiction must be a two-letter code");
  }
  const jurisdiction = value.jurisdiction.toUpperCase();
  if (!(jurisdiction in SUPPORTED_LOOKUPS)) {
    throw new DomainError("UNKNOWN_JURISDICTION", `Unknown jurisdiction: ${jurisdiction}`, { jurisdiction });
  }
  const rule = SUPPORTED_LOOKUPS[jurisdiction as keyof typeof SUPPORTED_LOOKUPS];
  if (typeof value.scheme !== "string" || value.scheme.length > 64) {
    throw new DomainError("UNKNOWN_IDENTIFIER_SCHEME", "Identifier scheme is missing or invalid", { jurisdiction });
  }
  if (value.scheme !== rule.scheme) {
    throw new DomainError("UNKNOWN_IDENTIFIER_SCHEME", "Identifier scheme is not valid for this jurisdiction", {
      jurisdiction,
      identifierScheme: value.scheme,
    });
  }
  if (typeof value.identifier !== "string" || value.identifier.length === 0 || value.identifier.length > rule.maxLength) {
    throw new DomainError("INVALID_IDENTIFIER", "Identifier length is invalid", {
      jurisdiction,
      identifierScheme: rule.scheme,
    });
  }
  if (!/^[A-Za-z0-9 .-]+$/.test(value.identifier) || /[\u0000-\u001F\u007F]/.test(value.identifier)) {
    throw new DomainError("INVALID_IDENTIFIER", "Identifier contains unsupported characters", {
      jurisdiction,
      identifierScheme: rule.scheme,
    });
  }
  return { jurisdiction: jurisdiction as LookupBody["jurisdiction"], scheme: rule.scheme, identifier: value.identifier };
}

export const publicBusinessResponseJsonSchema = {
  type: "object",
  required: ["schemaVersion", "jurisdiction", "identifier", "facts", "source", "warnings", "attribution"],
  properties: {
    schemaVersion: { type: "string", const: "1" },
    jurisdiction: {
      type: "object",
      required: ["id", "iso2", "name"],
      properties: { id: { type: "string" }, iso2: { type: "string" }, name: { type: "string" } },
    },
    identifier: {
      type: "object",
      required: ["scheme", "value"],
      properties: { scheme: { type: "string" }, value: { type: "string" }, kind: { type: "string" } },
    },
    facts: { type: "object", additionalProperties: true },
    source: {
      type: "object",
      required: ["authority", "sourceId", "sourceUrl", "retrievedAt"],
      properties: {
        authority: { type: "string" }, sourceId: { type: "string" }, sourceUrl: { type: "string", format: "uri" }, retrievedAt: { type: "string", format: "date-time" },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
    attribution: {
      type: "object",
      required: ["required", "text", "licence"],
      properties: { required: { type: "boolean" }, text: { type: "string" }, licence: { type: "string" } },
    },
  },
} as const;

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Global Official Business Facts API",
      version: "1.0.0",
      description: "Normalized basic business facts retrieved from identified official sources. This service is not an official registry.",
    },
    servers: [{ url: "https://business.newbies.cool" }],
    paths: {
      "/api/v1/health": { get: { summary: "Service health", responses: { "200": { description: "Healthy" } } } },
      "/api/v1/catalogue": { get: { summary: "Public production catalogue", responses: { "200": { description: "Catalogue" } } } },
      "/api/v1/catalogue/jurisdictions": { get: { summary: "List V1 jurisdictions", responses: { "200": { description: "Jurisdictions" } } } },
      "/api/v1/catalogue/jurisdictions/{iso2}": {
        get: {
          summary: "Get a V1 jurisdiction",
          parameters: [{ name: "iso2", in: "path", required: true, schema: { type: "string", minLength: 2, maxLength: 2 } }],
          responses: { "200": { description: "Jurisdiction" }, "404": { description: "Unknown jurisdiction" } },
        },
      },
      [LOOKUP_ROUTE]: {
        post: {
          summary: "Paid exact business lookup",
          description: "Normalized official business facts from government and business-register sources. Lookup by jurisdiction-specific official identifier. Returns available basic entity facts plus official-source provenance, licence attribution and freshness/scope warnings.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: lookupRequestJsonSchema } },
          },
          responses: {
            "200": { description: "Normalized business facts", content: { "application/json": { schema: publicBusinessResponseJsonSchema } } },
            "400": { description: "Syntactically invalid request" },
            "402": { description: "x402 v2 payment required or payment failed" },
            "404": { description: "No official source record found" },
            "429": { description: "Request or upstream rate limited" },
            "502": { description: "Official source response invalid" },
            "503": { description: "Payment or official source temporarily unavailable" },
          },
          "x-x402": {
            version: 2,
            scheme: "exact",
            productionNetwork: "eip155:137",
            asset: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
            price: "$0.01",
            payTo: "0xF3E577c98CFa7f300fE8f39F7EcFD14B368DCb2f",
          },
          "x-bazaar": {
            status: "PENDING_FIRST_SETTLEMENT",
            inputSchema: lookupRequestJsonSchema,
          },
        },
      },
    },
  };
}
