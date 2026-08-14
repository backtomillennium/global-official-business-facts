import type {
  AdapterDefinition,
  AdapterManifest,
  AccessMethod,
  ExposureProfile,
  IdentifierScheme,
  Jurisdiction,
  Licence,
  ProductionEligibilityAssessment,
  Registry,
  ResearchAssessment,
  Source,
  AccessConstraint,
  Evidence,
  VerificationRecord,
} from "../domain/types";

export interface CompiledCatalogue {
  generatedAt: string;
  jurisdictions: Jurisdiction[];
  registries: Registry[];
  accessMethods: AccessMethod[];
  sources: Source[];
  identifierSchemes: IdentifierScheme[];
  licences: Licence[];
  constraints: AccessConstraint[];
  evidence: Evidence[];
  assessments: ResearchAssessment[];
  adapters: AdapterDefinition[];
  adapterManifests: AdapterManifest[];
  exposureProfiles: ExposureProfile[];
  eligibilityAssessments: ProductionEligibilityAssessment[];
  verificationRecords: VerificationRecord[];
}
