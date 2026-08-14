import { Catalogue } from "../catalogue/catalogue";
import { DomainError } from "../domain/errors";
import type { LookupService } from "../lookup/lookup-service";
import { serializeBusinessRecord } from "../lookup/serializer";

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...headers },
  });
}

function statusFor(code: DomainError["code"]): number {
  switch (code) {
    case "INVALID_REQUEST":
    case "INVALID_IDENTIFIER":
    case "UNKNOWN_IDENTIFIER_SCHEME":
    case "UNSUPPORTED_IDENTIFIER":
      return 400;
    case "UNKNOWN_JURISDICTION":
    case "NOT_FOUND":
      return 404;
    case "UNSUPPORTED_JURISDICTION":
    case "NO_PRODUCTION_ADAPTER":
      return 501;
    case "SOURCE_RATE_LIMITED":
      return 429;
    case "SOURCE_UNAVAILABLE":
    case "SOURCE_TIMEOUT":
    case "SOURCE_AUTH_ERROR":
    case "SOURCE_BAD_RESPONSE":
    case "SOURCE_SCHEMA_CHANGED":
      return 503;
    case "ADAPTER_DISABLED":
    case "POLICY_BLOCKED":
    case "LICENCE_BLOCKED":
      return 403;
    default:
      return 500;
  }
}

export function createApp(input: { catalogue: Catalogue; lookupService: LookupService }) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "content-type" } });
    }
    if (request.method !== "GET") return json({ error: { code: "INVALID_REQUEST", message: "Only GET is supported" } }, 405);

    try {
      if (url.pathname === "/api/catalogue/jurisdictions") {
        return json({ generatedAt: input.catalogue.data.generatedAt, jurisdictions: input.catalogue.data.jurisdictions });
      }

      const catalogueMatch = url.pathname.match(/^\/api\/catalogue\/jurisdictions\/([^/]+)$/);
      if (catalogueMatch?.[1]) {
        const jurisdiction = input.catalogue.requireJurisdiction(decodeURIComponent(catalogueMatch[1]));
        return json({
          jurisdiction,
          registries: input.catalogue.data.registries.filter((item) => item.jurisdictionId === jurisdiction.id),
          identifierSchemes: input.catalogue.getIdentifierSchemesForJurisdiction(jurisdiction.id),
          adapters: input.catalogue.data.adapters.filter((item) => item.jurisdictionId === jurisdiction.id),
          adapterManifests: input.catalogue.data.adapterManifests.filter((item) => item.jurisdictionId === jurisdiction.id),
        });
      }

      const explicit = url.pathname.match(/^\/api\/business\/([^/]+)\/([^/]+)\/([^/]+)$/);
      const compact = url.pathname.match(/^\/api\/business\/([^/]+)\/([^/]+)$/);
      if (explicit?.[1] && explicit[2] && explicit[3]) {
        const lookup = input.lookupService.resolveRequest({
          jurisdiction: decodeURIComponent(explicit[1]),
          scheme: decodeURIComponent(explicit[2]),
          value: decodeURIComponent(explicit[3]),
        });
        const result = await input.lookupService.lookup(lookup);
        const manifest = input.catalogue.getAdapterManifest(result.execution.adapterId);
        const profile = manifest ? input.catalogue.getExposureProfile(manifest.exposureProfileId) : undefined;
        return json(serializeBusinessRecord(result.record, input.catalogue, profile), 200, { "cache-control": "no-store" });
      }
      if (compact?.[1] && compact[2]) {
        const lookup = input.lookupService.resolveRequest({
          jurisdiction: decodeURIComponent(compact[1]),
          value: decodeURIComponent(compact[2]),
        });
        const result = await input.lookupService.lookup(lookup);
        const manifest = input.catalogue.getAdapterManifest(result.execution.adapterId);
        const profile = manifest ? input.catalogue.getExposureProfile(manifest.exposureProfileId) : undefined;
        return json(serializeBusinessRecord(result.record, input.catalogue, profile), 200, { "cache-control": "no-store" });
      }

      return json({ error: { code: "INVALID_REQUEST", message: "Unknown API route" } }, 404);
    } catch (error) {
      if (error instanceof DomainError) {
        return json({ error: { code: error.code, message: error.message, ...error.details } }, statusFor(error.code));
      }
      console.error(JSON.stringify({ event: "unhandled_error", message: error instanceof Error ? error.message : String(error) }));
      return json({ error: { code: "INTERNAL_ERROR", message: "Internal error" } }, 500);
    }
  };
}
