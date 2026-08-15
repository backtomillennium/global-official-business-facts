import type { AdapterDefinition, AdapterManifest, ExposureProfile, GateResult, ProductionEligibilityAssessment } from "../domain/types";
import type { LookupRequest } from "../lookup/types";

export type CachePolicy = { mode: "no-store" } | { mode: "ttl"; ttlSeconds: number; reason: string };

export interface SourcePolicyDecision {
  allowed: boolean;
  cachePolicy: CachePolicy;
  reason?: string;
  attribution?: { required: boolean; text: string | null; sourceUrl: string | null };
  allowedCanonicalFields?: string[];
}

export interface PolicyGate {
  evaluate(input: { request: LookupRequest; adapter: AdapterDefinition; manifest: AdapterManifest }): SourcePolicyDecision;
}

function gatePassed(value: GateResult): boolean {
  return value === "pass" || value === "not-applicable";
}

function eligibilityIsOperationallyComplete(eligibility: ProductionEligibilityAssessment): boolean {
  return [
    eligibility.sourceScope,
    eligibility.identifier,
    eligibility.technical,
    eligibility.automation,
    eligibility.commercialUse,
    eligibility.responseRedistribution,
    eligibility.attribution,
    eligibility.exposureSafety,
    eligibility.provenance,
    eligibility.adapterQuality,
    eligibility.operational,
  ].every(gatePassed) && eligibility.blockers.length === 0;
}

export class ProductionPolicyGate implements PolicyGate {
  constructor(
    private readonly eligibilityAssessments: ProductionEligibilityAssessment[],
    private readonly exposureProfiles: ExposureProfile[],
  ) {}

  evaluate(input: { request: LookupRequest; adapter: AdapterDefinition; manifest: AdapterManifest }): SourcePolicyDecision {
    if (input.manifest.promotionState !== "PRODUCTION") {
      return { allowed: false, cachePolicy: { mode: "no-store" }, reason: `Adapter is ${input.manifest.promotionState}` };
    }
    if (input.manifest.adapterId !== input.adapter.id || input.manifest.jurisdictionId !== input.adapter.jurisdictionId) {
      return { allowed: false, cachePolicy: { mode: "no-store" }, reason: "Adapter manifest mismatch" };
    }
    const eligibility = this.eligibilityAssessments.find(
      (item) => item.adapterId === input.adapter.id && item.decision === "eligible",
    );
    if (!eligibility || !eligibilityIsOperationallyComplete(eligibility)) {
      return { allowed: false, cachePolicy: { mode: "no-store" }, reason: "Production eligibility is missing or incomplete" };
    }
    const profile = this.exposureProfiles.find((item) => item.id === input.manifest.exposureProfileId);
    if (!profile || profile.personDataAllowed) {
      return { allowed: false, cachePolicy: { mode: "no-store" }, reason: "V1 exposure profile is missing or permits person data" };
    }
    if (input.manifest.cachePolicy.mode !== "no-store") {
      return { allowed: false, cachePolicy: { mode: "no-store" }, reason: "V1 cache policy must be no-store" };
    }
    return {
      allowed: true,
      cachePolicy: { mode: "no-store" },
      allowedCanonicalFields: profile.allowedCanonicalFields,
    };
  }
}
