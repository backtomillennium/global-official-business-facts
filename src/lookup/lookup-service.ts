import { Catalogue } from "../catalogue/catalogue";
import { DomainError } from "../domain/errors";
import type { AdapterDefinition } from "../domain/types";
import type { PolicyGate } from "../policy/policy-gate";
import { AdapterRegistry } from "./adapter-registry";
import type { AdapterContext, AdapterResult, LookupRequest } from "./types";

function upstreamStatusClass(error: unknown): string {
  if (!(error instanceof DomainError)) return "unclassified";
  switch (error.code) {
    case "NOT_FOUND": return "4xx-not-found";
    case "WITHDRAWN_FOR_LEGAL_REASONS": return "4xx-withdrawn";
    case "SOURCE_AUTH_ERROR": return "4xx-auth";
    case "SOURCE_RATE_LIMITED": return "429";
    case "SOURCE_TIMEOUT": return "timeout";
    case "SOURCE_UNAVAILABLE": return "5xx-or-transport";
    case "SOURCE_BAD_RESPONSE": return "invalid-response";
    case "SOURCE_SCHEMA_CHANGED": return "schema-changed";
    default: return "not-upstream";
  }
}

export class LookupService {
  constructor(
    private readonly catalogue: Catalogue,
    private readonly registry: AdapterRegistry,
    private readonly policyGate: PolicyGate,
    private readonly contextFactory: (requestId: string) => AdapterContext,
  ) {}

  resolveRequest(input: { jurisdiction: string; scheme?: string; value: string }): LookupRequest {
    const jurisdiction = this.catalogue.requireJurisdiction(input.jurisdiction);
    const schemeId = input.scheme ?? jurisdiction.defaultIdentifierSchemeId;
    if (!schemeId) {
      throw new DomainError("UNKNOWN_IDENTIFIER_SCHEME", "Identifier scheme must be specified", {
        jurisdiction: jurisdiction.id,
      });
    }
    const scheme = this.catalogue.getIdentifierScheme(schemeId);
    if (!scheme || scheme.jurisdictionId !== jurisdiction.id) {
      throw new DomainError("UNKNOWN_IDENTIFIER_SCHEME", `Unknown identifier scheme: ${schemeId}`, {
        jurisdiction: jurisdiction.id,
        identifierScheme: schemeId,
      });
    }
    return { jurisdictionId: jurisdiction.id, identifier: { schemeId, value: input.value } };
  }

  validateRequest(request: LookupRequest): LookupRequest {
    const candidates = this.registry.find({
      jurisdictionId: request.jurisdictionId,
      identifierSchemeId: request.identifier.schemeId,
      capability: "exactLookup",
    });
    if (candidates.length === 0) {
      throw new DomainError("NO_PRODUCTION_ADAPTER", "No executable adapter is registered for this lookup", {
        jurisdiction: request.jurisdictionId,
        identifierScheme: request.identifier.schemeId,
      });
    }
    for (const adapter of candidates) {
      const definition = this.findDefinition(adapter.id);
      const manifest = this.catalogue.getAdapterManifest(adapter.id);
      if (!manifest || !this.policyGate.evaluate({ request, adapter: definition, manifest }).allowed) continue;
      const validation = adapter.validateIdentifier({ schemeId: request.identifier.schemeId, value: request.identifier.value });
      if (!validation.ok) {
        throw new DomainError("INVALID_IDENTIFIER", validation.reason, {
          jurisdiction: request.jurisdictionId,
          identifierScheme: request.identifier.schemeId,
        });
      }
      return { ...request, identifier: { ...request.identifier, value: validation.normalizedValue } };
    }
    throw new DomainError("NO_PRODUCTION_ADAPTER", "Compatible adapters exist but none are production-enabled", {
      jurisdiction: request.jurisdictionId,
      identifierScheme: request.identifier.schemeId,
    });
  }

  async lookup(request: LookupRequest, requestId: string = crypto.randomUUID()): Promise<AdapterResult> {
    const candidates = this.registry.find({
      jurisdictionId: request.jurisdictionId,
      identifierSchemeId: request.identifier.schemeId,
      capability: "exactLookup",
    });

    if (candidates.length === 0) {
      throw new DomainError("NO_PRODUCTION_ADAPTER", "No executable adapter is registered for this lookup", {
        jurisdiction: request.jurisdictionId,
        identifierScheme: request.identifier.schemeId,
      });
    }

    let policyRejected = false;
    for (const adapter of candidates) {
      const definition = this.findDefinition(adapter.id);
      const manifest = this.catalogue.getAdapterManifest(adapter.id);
      if (!manifest) {
        policyRejected = true;
        continue;
      }
      const decision = this.policyGate.evaluate({ request, adapter: definition, manifest });
      if (!decision.allowed) {
        policyRejected = true;
        continue;
      }
      const validation = adapter.validateIdentifier({ schemeId: request.identifier.schemeId, value: request.identifier.value });
      if (!validation.ok) {
        throw new DomainError("INVALID_IDENTIFIER", validation.reason, {
          jurisdiction: request.jurisdictionId,
          identifierScheme: request.identifier.schemeId,
        });
      }
      const context = this.contextFactory(requestId);
      const startedAtMs = context.clock.now().getTime();
      context.logger.info("adapter_lookup_start", {
        requestId: context.requestId,
        jurisdiction: request.jurisdictionId,
        identifierScheme: request.identifier.schemeId,
        adapterId: adapter.id,
      });
      try {
        const result = await adapter.lookup(
          { ...request, identifier: { ...request.identifier, value: validation.normalizedValue } },
          context,
        );
        context.logger.info("adapter_lookup_complete", {
          requestId: context.requestId,
          jurisdiction: request.jurisdictionId,
          identifierScheme: request.identifier.schemeId,
          adapterId: adapter.id,
          result: "success",
          latencyMs: Math.max(0, context.clock.now().getTime() - startedAtMs),
          upstreamStatusClass: "2xx",
        });
        return result;
      } catch (error) {
        context.logger.warn("adapter_lookup_failed", {
          requestId: context.requestId,
          jurisdiction: request.jurisdictionId,
          identifierScheme: request.identifier.schemeId,
          adapterId: adapter.id,
          result: "failure",
          latencyMs: Math.max(0, context.clock.now().getTime() - startedAtMs),
          upstreamStatusClass: upstreamStatusClass(error),
        });
        throw error;
      }
    }

    if (policyRejected) {
      throw new DomainError("NO_PRODUCTION_ADAPTER", "Compatible adapters exist but none are production-enabled", {
        jurisdiction: request.jurisdictionId,
        identifierScheme: request.identifier.schemeId,
      });
    }
    throw new DomainError("NO_PRODUCTION_ADAPTER", "No production adapter is available", {
      jurisdiction: request.jurisdictionId,
      identifierScheme: request.identifier.schemeId,
    });
  }

  private findDefinition(adapterId: string): AdapterDefinition {
    const definition = this.catalogue.data.adapters.find((item) => item.id === adapterId);
    if (!definition) throw new DomainError("INTERNAL_ERROR", `Adapter definition missing: ${adapterId}`);
    return definition;
  }
}
