import type { AdapterDefinition, AdapterManifest, ExposureProfile, ProductionEligibilityAssessment } from "../domain/types";
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

export class ProductionPolicyGate implements PolicyGate {
  constructor(
    private readonly eligibilityAssessments: ProductionEligibilityAssessment[],
    private readonly exposureProfiles: ExposureProfile[],
  ) {}

  evaluate(input: { request: LookupRequest; adapter: AdapterDefinition; manifest: AdapterManifest }): SourcePolicyDecision {
    if (input.manifest.promotionState !== "PRODUCTION") {
      return { allowed: false, cachePolicy: { mode: "no-store" }, reason: `Adapter is ${input.manifest.promotionState}` };
    }
    const eligibility = this.eligibilityAssessments.find(
      (item) => item.adapterId === input.adapter.id && item.decision === "eligible",
    );
    if (!eligibility) {
      return { allowed: false, cachePolicy: { mode: "no-store" }, reason: "No eligible ProductionEligibilityAssessment" };
    }
    const profile = this.exposureProfiles.find((item) => item.id === input.manifest.exposureProfileId);
    if (!profile) {
      return { allowed: false, cachePolicy: { mode: "no-store" }, reason: "Exposure profile missing" };
    }
    return {
      allowed: true,
      cachePolicy: input.manifest.cachePolicy,
      allowedCanonicalFields: profile.allowedCanonicalFields,
    };
  }
}
