import type { CompiledCatalogue } from "../catalogue/types";

export const compiledCatalogue: CompiledCatalogue = {
  "generatedAt": "2026-08-14T00:00:00.000Z",
  "jurisdictions": [
    {
      "id": "NOR",
      "slug": "no",
      "iso2": "NO",
      "iso3": "NOR",
      "m49": "578",
      "name": {
        "canonical": "Norway",
        "local": "Norge"
      },
      "jurisdictionType": "sovereign",
      "parentJurisdictionId": null,
      "registryStructure": "national",
      "researchStatus": "CLOSED_FOR_V1",
      "lastReviewedAt": "2026-08-14",
      "defaultIdentifierSchemeId": "no-organisasjonsnummer"
    },
    {
      "id": "SVK",
      "slug": "sk",
      "iso2": "SK",
      "iso3": "SVK",
      "m49": "703",
      "name": {
        "canonical": "Slovakia",
        "local": "Slovensko"
      },
      "jurisdictionType": "sovereign",
      "parentJurisdictionId": null,
      "registryStructure": "national-aggregation",
      "researchStatus": "CLOSED_FOR_V1",
      "lastReviewedAt": "2026-08-14",
      "defaultIdentifierSchemeId": "sk-ico"
    },
    {
      "id": "SGP",
      "slug": "sg",
      "iso2": "SG",
      "iso3": "SGP",
      "m49": "702",
      "name": {
        "canonical": "Singapore",
        "local": null
      },
      "jurisdictionType": "sovereign",
      "parentJurisdictionId": null,
      "registryStructure": "national-open-data-publication",
      "researchStatus": "CLOSED_FOR_V1_FIELD_BINDING_PASSED",
      "lastReviewedAt": "2026-08-14",
      "defaultIdentifierSchemeId": "sg-uen"
    }
  ],
  "registries": [
    {
      "id": "no-enhetsregisteret",
      "jurisdictionId": "NOR",
      "authority": {
        "name": "Brønnøysundregistrene",
        "type": "national-registry-authority"
      },
      "name": "Enhetsregisteret",
      "registryRole": "national-legal-entity-register",
      "scope": {
        "geographic": "national",
        "entityScope": "legal entities and other registered units",
        "isPrimaryCompanyRegister": false
      }
    },
    {
      "id": "sk-rpo-registry",
      "jurisdictionId": "SVK",
      "authority": {
        "name": "Ministry of Interior of the Slovak Republic",
        "type": "national-registry-operator"
      },
      "name": "Register právnických osôb, podnikateľov a orgánov verejnej moci (RPO)",
      "registryRole": "national-aggregation-register",
      "scope": {
        "geographic": "national",
        "entityScope": "legal persons, entrepreneurs and public authorities",
        "isPrimaryCompanyRegister": false
      }
    },
    {
      "id": "sg-acra-open-data",
      "jurisdictionId": "SGP",
      "authority": {
        "name": "Accounting and Corporate Regulatory Authority (ACRA)",
        "type": "national-business-registry-authority"
      },
      "name": "Entities Registered with ACRA",
      "registryRole": "official-open-data-publication",
      "scope": {
        "geographic": "national",
        "entityScope": "ACRA-registered entities in the published open-data resource",
        "isPrimaryCompanyRegister": false
      }
    }
  ],
  "accessMethods": [
    {
      "id": "no-brreg-rest-v2",
      "sourceId": "no-brreg-enhetsregisteret",
      "type": "REST",
      "endpoint": "https://data.brreg.no/enhetsregisteret/api/enheter/",
      "authentication": {
        "type": "none",
        "required": false,
        "registration": "none",
        "credentialRef": null
      },
      "formats": [
        "application/vnd.brreg.enhetsregisteret.enhet.v2+json"
      ],
      "rateLimit": {
        "status": "not-stated",
        "requests": null,
        "windowSeconds": null
      }
    },
    {
      "id": "sk-rpo-rest-v1",
      "sourceId": "sk-rpo",
      "type": "REST",
      "endpoint": "https://api.statistics.sk/rpo/v1/",
      "authentication": {
        "type": "none",
        "required": false,
        "registration": "none",
        "credentialRef": null
      },
      "formats": [
        "application/json"
      ],
      "rateLimit": {
        "status": "not-stated",
        "requests": null,
        "windowSeconds": null
      }
    },
    {
      "id": "sg-datagov-datastore-search",
      "sourceId": "sg-acra-datagovsg",
      "type": "CKAN",
      "endpoint": "https://data.gov.sg/api/action/datastore_search",
      "authentication": {
        "type": "none",
        "required": false,
        "registration": "none",
        "credentialRef": null
      },
      "formats": [
        "application/json"
      ],
      "rateLimit": {
        "status": "stated",
        "requests": 4,
        "windowSeconds": 10
      }
    }
  ],
  "sources": [
    {
      "id": "no-brreg-enhetsregisteret",
      "registryId": "no-enhetsregisteret",
      "authority": "Brønnøysundregistrene",
      "name": "Enhetsregisteret open data API",
      "sourceKind": "registry-api",
      "sourceForm": "per-entity-query",
      "official": true,
      "machineReadable": true,
      "recordScope": "National register of legal entities and other registered units; not companies-only",
      "url": "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
      "accessMethodIds": [
        "no-brreg-rest-v2"
      ],
      "licenceId": "nlod-2.0",
      "constraintIds": [
        "no-legal-entity-scope",
        "no-410-withdrawal"
      ],
      "lastVerifiedAt": "2026-08-14"
    },
    {
      "id": "sk-rpo",
      "registryId": "sk-rpo-registry",
      "authority": "Ministry of Interior of the Slovak Republic",
      "name": "RPO public REST API",
      "sourceKind": "registry-api",
      "sourceForm": "per-entity-query",
      "official": true,
      "machineReadable": true,
      "recordScope": "Aggregation of the commercial register, trade register and other source registers",
      "url": "https://rpo.minv.sk/rpo-api-doc.html",
      "accessMethodIds": [
        "sk-rpo-rest-v1"
      ],
      "licenceId": "cc-by-4.0-rpo",
      "constraintIds": [
        "sk-rpo-nightly",
        "sk-rpo-aggregation-scope"
      ],
      "lastVerifiedAt": "2026-08-14"
    },
    {
      "id": "sg-acra-datagovsg",
      "registryId": "sg-acra-open-data",
      "authority": "Accounting and Corporate Regulatory Authority (ACRA) / GovTech Singapore",
      "name": "Entities Registered with ACRA — UEN-keyed resource",
      "sourceKind": "government-open-data-api",
      "sourceForm": "per-entity-query",
      "official": true,
      "machineReadable": true,
      "recordScope": "Open-data publication of ACRA records; not a certified BizFile+ profile",
      "url": "https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view",
      "accessMethodIds": [
        "sg-datagov-datastore-search"
      ],
      "licenceId": "singapore-open-data-1.0",
      "constraintIds": [
        "sg-monthly-refresh",
        "sg-open-data-scope"
      ],
      "lastVerifiedAt": "2026-08-15"
    }
  ],
  "identifierSchemes": [
    {
      "id": "no-organisasjonsnummer",
      "jurisdictionId": "NOR",
      "name": "Norwegian organisation number",
      "localName": "organisasjonsnummer",
      "kind": "legal-entity",
      "format": {
        "type": "numeric",
        "length": 9,
        "pattern": "^[0-9]{9}$"
      },
      "issuingAuthority": "Brønnøysundregistrene",
      "searchableSourceIds": [
        "no-brreg-enhetsregisteret"
      ]
    },
    {
      "id": "sk-ico",
      "jurisdictionId": "SVK",
      "name": "Identification number of organisation",
      "localName": "IČO",
      "kind": "company",
      "format": {
        "type": "numeric",
        "length": 8,
        "pattern": "^[0-9]{8}$"
      },
      "issuingAuthority": "Statistical Office of the Slovak Republic",
      "searchableSourceIds": [
        "sk-rpo"
      ]
    },
    {
      "id": "sg-uen",
      "jurisdictionId": "SGP",
      "name": "Unique Entity Number",
      "localName": "UEN",
      "kind": "business",
      "format": {
        "type": "alphanumeric",
        "length": null,
        "pattern": "^[A-Z0-9]{1,32}$"
      },
      "issuingAuthority": "Singapore UEN issuance agencies",
      "searchableSourceIds": [
        "sg-acra-datagovsg"
      ]
    }
  ],
  "licences": [
    {
      "id": "nlod-2.0",
      "name": "Norsk lisens for offentlige data",
      "version": "2.0",
      "status": "verified-open-licence",
      "commercialReuse": "allowed",
      "redistribution": "allowed",
      "caching": "conditional",
      "attributionRequired": true,
      "attributionText": "Source: Brønnøysundregistrene — Enhetsregisteret. Licence: NLOD 2.0.",
      "attributionStatus": "verified",
      "sourceUrl": "https://data.norge.no/nlod/no/2.0",
      "verifiedAt": "2026-08-14"
    },
    {
      "id": "cc-by-4.0-rpo",
      "name": "Creative Commons Attribution",
      "version": "4.0",
      "status": "verified-open-licence",
      "commercialReuse": "allowed",
      "redistribution": "allowed",
      "caching": "allowed",
      "attributionRequired": true,
      "attributionText": "Source: Register právnických osôb (RPO), Ministry of Interior of the Slovak Republic. Licence: CC BY 4.0.",
      "attributionStatus": "verified",
      "sourceUrl": "https://rpo.minv.sk/rpo-api-doc.html",
      "verifiedAt": "2026-08-14"
    },
    {
      "id": "singapore-open-data-1.0",
      "name": "Singapore Open Data Licence",
      "version": "1.0",
      "status": "verified-open-licence",
      "commercialReuse": "allowed",
      "redistribution": "allowed",
      "caching": "not-stated",
      "attributionRequired": true,
      "attributionText": "Contains information from Entities Registered with ACRA accessed on {date} from data.gov.sg which is made available under the terms of the Singapore Open Data Licence version 1.0 https://data.gov.sg/open-data-licence",
      "attributionStatus": "verified",
      "sourceUrl": "https://data.gov.sg/open-data-licence",
      "verifiedAt": "2026-08-15"
    }
  ],
  "constraints": [
    {
      "id": "no-legal-entity-scope",
      "type": "source-scope",
      "scopeType": "source",
      "scopeId": "no-brreg-enhetsregisteret",
      "description": "Enhetsregisteret includes sole proprietorships, associations and other legal entities; it is not companies-only.",
      "severity": "informational",
      "sourceUrl": "https://www.brreg.no/om-oss/registrene-vare/om-enhetsregisteret/",
      "verifiedAt": "2026-08-14",
      "confidence": "high"
    },
    {
      "id": "no-410-withdrawal",
      "type": "legal-withdrawal",
      "scopeType": "source",
      "scopeId": "no-brreg-enhetsregisteret",
      "description": "HTTP 410 means withdrawn for legal reasons and must remain distinct from not-found; V1 stores no record.",
      "severity": "operational",
      "sourceUrl": "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
      "verifiedAt": "2026-08-14",
      "confidence": "high"
    },
    {
      "id": "sk-rpo-nightly",
      "type": "freshness",
      "scopeType": "source",
      "scopeId": "sk-rpo",
      "description": "The public RPO API is refreshed nightly and may lag the live register by up to 24 hours.",
      "severity": "operational",
      "sourceUrl": "https://rpo.minv.sk/rpo-api-doc.html",
      "verifiedAt": "2026-08-14",
      "confidence": "high"
    },
    {
      "id": "sk-rpo-aggregation-scope",
      "type": "source-scope",
      "scopeType": "registry",
      "scopeId": "sk-rpo-registry",
      "description": "RPO aggregates multiple source registers and is not a single commercial register.",
      "severity": "informational",
      "sourceUrl": "https://rpo.minv.sk/rpo-api-doc.html",
      "verifiedAt": "2026-08-14",
      "confidence": "high"
    },
    {
      "id": "sg-monthly-refresh",
      "type": "freshness",
      "scopeType": "source",
      "scopeId": "sg-acra-datagovsg",
      "description": "The ACRA open-data publication is refreshed monthly.",
      "severity": "operational",
      "sourceUrl": "https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view",
      "verifiedAt": "2026-08-15",
      "confidence": "high"
    },
    {
      "id": "sg-open-data-scope",
      "type": "source-scope",
      "scopeType": "source",
      "scopeId": "sg-acra-datagovsg",
      "description": "This is an official open-data publication with some columns removed, not a certified BizFile+ profile.",
      "severity": "informational",
      "sourceUrl": "https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view",
      "verifiedAt": "2026-08-15",
      "confidence": "high"
    }
  ],
  "evidence": [
    {
      "id": "EV-NOR-LIC-1",
      "claimType": "LICENCE",
      "subjectType": "source",
      "subjectId": "no-brreg-enhetsregisteret",
      "value": "NLOD 2.0",
      "sourceUrl": "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
      "sourceAuthority": "Brønnøysundregistrene",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-NOR-API-1",
      "claimType": "MACHINE_ROUTE",
      "subjectType": "source",
      "subjectId": "no-brreg-enhetsregisteret",
      "value": "GET /enhetsregisteret/api/enheter/{organisasjonsnummer}; no authentication",
      "sourceUrl": "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
      "sourceAuthority": "Brønnøysundregistrene",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-NOR-ERR-1",
      "claimType": "ERROR_SEMANTICS",
      "subjectType": "source",
      "subjectId": "no-brreg-enhetsregisteret",
      "value": "404 not found and 410 legal withdrawal are distinct",
      "sourceUrl": "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
      "sourceAuthority": "Brønnøysundregistrene",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-NOR-CONSTRAINT-1",
      "claimType": "AUTOMATION",
      "subjectType": "source",
      "subjectId": "no-brreg-enhetsregisteret",
      "value": "Open-data API supports automated use",
      "sourceUrl": "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
      "sourceAuthority": "Brønnøysundregistrene",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-NOR-LIVE-V1",
      "claimType": "TECHNICAL_VERIFICATION",
      "subjectType": "adapter",
      "subjectId": "no-brreg-enhetsregisteret-v1",
      "value": "Live 200 response contained the required identifier and legal-name fields plus mapped status, entity type, date, address and industry fields",
      "sourceUrl": "https://data.brreg.no/enhetsregisteret/api/enheter/923609016",
      "sourceAuthority": "Brønnøysundregistrene",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SVK-LIC-1",
      "claimType": "LICENCE",
      "subjectType": "source",
      "subjectId": "sk-rpo",
      "value": "CC BY 4.0",
      "sourceUrl": "https://rpo.minv.sk/rpo-api-doc.html",
      "sourceAuthority": "Ministry of Interior of the Slovak Republic",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SVK-API-1",
      "claimType": "MACHINE_ROUTE",
      "subjectType": "source",
      "subjectId": "sk-rpo",
      "value": "Public GET /search and GET /entity/{id}",
      "sourceUrl": "https://rpo.minv.sk/rpo-api-doc.html",
      "sourceAuthority": "Ministry of Interior of the Slovak Republic",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SVK-API-2",
      "claimType": "MACHINE_ROUTE",
      "subjectType": "source",
      "subjectId": "sk-rpo",
      "value": "Production base https://api.statistics.sk/rpo/v1/",
      "sourceUrl": "https://rpo.statistics.sk/docs/oznam.html",
      "sourceAuthority": "Statistical Office of the Slovak Republic",
      "checkedAt": "2026-08-14",
      "confidence": "medium",
      "evidenceClass": "first-party-partial"
    },
    {
      "id": "EV-SVK-FRESH-1",
      "claimType": "FRESHNESS",
      "subjectType": "source",
      "subjectId": "sk-rpo",
      "value": "Nightly refresh; up to 24 hours behind the live register",
      "sourceUrl": "https://rpo.minv.sk/rpo-api-doc.html",
      "sourceAuthority": "Ministry of Interior of the Slovak Republic",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SVK-LIVE-V1",
      "claimType": "TECHNICAL_VERIFICATION",
      "subjectType": "adapter",
      "subjectId": "sk-rpo-v1",
      "value": "Live two-call lookup verified search internal-id binding and current TimedValue/CodeValue response shapes",
      "sourceUrl": "https://api.statistics.sk/rpo/v1/entity/9389295?showHistoricalData=false&showOrganizationUnits=false",
      "sourceAuthority": "Ministry of Interior of the Slovak Republic",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SGP-LIC-1",
      "claimType": "LICENCE",
      "subjectType": "source",
      "subjectId": "sg-acra-datagovsg",
      "value": "Singapore Open Data Licence v1.0",
      "sourceUrl": "https://data.gov.sg/open-data-licence",
      "sourceAuthority": "Government of Singapore / GovTech Singapore",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SGP-COM-1",
      "claimType": "COMMERCIAL_USE",
      "subjectType": "licence",
      "subjectId": "singapore-open-data-1.0",
      "value": "allowed",
      "sourceUrl": "https://data.gov.sg/open-data-licence",
      "sourceAuthority": "Government of Singapore",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SGP-RED-1",
      "claimType": "REDISTRIBUTION",
      "subjectType": "licence",
      "subjectId": "singapore-open-data-1.0",
      "value": "allowed with licence conditions",
      "sourceUrl": "https://data.gov.sg/open-data-licence",
      "sourceAuthority": "Government of Singapore",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SGP-ATT-1",
      "claimType": "ATTRIBUTION",
      "subjectType": "licence",
      "subjectId": "singapore-open-data-1.0",
      "value": "required; agency supplies a notice template",
      "sourceUrl": "https://data.gov.sg/open-data-licence",
      "sourceAuthority": "Government of Singapore",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SGP-API-1",
      "claimType": "MACHINE_ROUTE",
      "subjectType": "source",
      "subjectId": "sg-acra-datagovsg",
      "value": "GET /api/action/datastore_search with filters; no API key",
      "sourceUrl": "https://guide.data.gov.sg/developer-guide/dataset-apis/search-and-filter-within-dataset",
      "sourceAuthority": "GovTech Singapore",
      "checkedAt": "2026-08-14",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SGP-SCOPE-1",
      "claimType": "SOURCE_SCOPE",
      "subjectType": "source",
      "subjectId": "sg-acra-datagovsg",
      "value": "ACRA open-data publication; some columns removed",
      "sourceUrl": "https://data.gov.sg/datasets/d_3f960c10fed6145404ca7b821f263b87/view",
      "sourceAuthority": "ACRA / GovTech Singapore",
      "checkedAt": "2026-08-15",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SGP-FIELD-V1",
      "claimType": "TECHNICAL_VERIFICATION",
      "subjectType": "adapter",
      "subjectId": "sg-acra-opendata-v1",
      "value": "The designated UEN-keyed resource result.fields contains uen and entity_name plus the mapped status, entity-type, issue-date and address fields",
      "sourceUrl": "https://data.gov.sg/api/action/datastore_search?resource_id=d_3f960c10fed6145404ca7b821f263b87&limit=1",
      "sourceAuthority": "GovTech Singapore / ACRA",
      "checkedAt": "2026-08-15",
      "confidence": "high",
      "evidenceClass": "first-party"
    },
    {
      "id": "EV-SGP-RATE-1",
      "claimType": "RATE_LIMIT",
      "subjectType": "access-method",
      "subjectId": "sg-datagov-datastore-search",
      "value": "Without API key: 4 Datastore Search calls per 10 seconds; 429 when exceeded",
      "sourceUrl": "https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits",
      "sourceAuthority": "GovTech Singapore",
      "checkedAt": "2026-08-15",
      "confidence": "high",
      "evidenceClass": "first-party"
    }
  ],
  "assessments": [
    {
      "jurisdictionId": "NOR",
      "publicness": {
        "total": null,
        "tier": null
      },
      "integrationGrade": "I4",
      "confidence": "high",
      "researchCompleteness": "CLOSED_FOR_V1",
      "checkedAt": "2026-08-14"
    },
    {
      "jurisdictionId": "SVK",
      "publicness": {
        "total": null,
        "tier": null
      },
      "integrationGrade": "I4",
      "confidence": "high",
      "researchCompleteness": "CLOSED_FOR_V1",
      "checkedAt": "2026-08-14"
    },
    {
      "jurisdictionId": "SGP",
      "publicness": {
        "total": null,
        "tier": null
      },
      "integrationGrade": "I3",
      "confidence": "high",
      "researchCompleteness": "CLOSED_FOR_V1_FIELD_BINDING_PASSED",
      "checkedAt": "2026-08-14"
    }
  ],
  "adapters": [
    {
      "id": "no-brreg-enhetsregisteret-v1",
      "version": "1.0.0",
      "normalizationVersion": "1",
      "jurisdictionId": "NOR",
      "supportedIdentifierSchemeIds": [
        "no-organisasjonsnummer"
      ],
      "sourceIds": [
        "no-brreg-enhetsregisteret"
      ],
      "capabilities": {
        "exactLookup": true,
        "nameSearch": false,
        "bulkSync": false,
        "incrementalSync": false,
        "documentFetch": false,
        "historicalLookup": false
      },
      "scopeWarnings": [
        "Enhetsregisteret is Norway's national legal-entity register and is not limited to companies."
      ]
    },
    {
      "id": "sk-rpo-v1",
      "version": "1.0.0",
      "normalizationVersion": "1",
      "jurisdictionId": "SVK",
      "supportedIdentifierSchemeIds": [
        "sk-ico"
      ],
      "sourceIds": [
        "sk-rpo"
      ],
      "capabilities": {
        "exactLookup": true,
        "nameSearch": false,
        "bulkSync": false,
        "incrementalSync": false,
        "documentFetch": false,
        "historicalLookup": false
      },
      "scopeWarnings": [
        "Official RPO API is refreshed nightly and may lag the live register by up to 24 hours.",
        "RPO is an aggregation register, not a single commercial register."
      ]
    },
    {
      "id": "sg-acra-opendata-v1",
      "version": "1.0.0",
      "normalizationVersion": "1",
      "jurisdictionId": "SGP",
      "supportedIdentifierSchemeIds": [
        "sg-uen"
      ],
      "sourceIds": [
        "sg-acra-datagovsg"
      ],
      "capabilities": {
        "exactLookup": true,
        "nameSearch": false,
        "bulkSync": false,
        "incrementalSync": false,
        "documentFetch": false,
        "historicalLookup": false
      },
      "scopeWarnings": [
        "The resource is the official Entities Registered with ACRA open-data publication, not a current or certified BizFile+ profile.",
        "The source is refreshed monthly."
      ]
    }
  ],
  "adapterManifests": [
    {
      "adapterId": "no-brreg-enhetsregisteret-v1",
      "jurisdictionId": "NOR",
      "sourceIds": [
        "no-brreg-enhetsregisteret"
      ],
      "identifierSchemeIds": [
        "no-organisasjonsnummer"
      ],
      "exposureProfileId": "basic-business-facts-v0",
      "promotionState": "PRODUCTION",
      "enabledCapabilities": [
        "exactLookup"
      ],
      "technicalVerification": {
        "status": "pass",
        "verifiedAt": "2026-08-14",
        "verificationRecordIds": [
          "VR-NOR-SOURCE-V1"
        ]
      },
      "policyVerification": {
        "status": "pass",
        "verifiedAt": "2026-08-14",
        "verificationRecordIds": [
          "VR-NOR-LICENCE-V1"
        ]
      },
      "cachePolicy": {
        "mode": "no-store"
      }
    },
    {
      "adapterId": "sk-rpo-v1",
      "jurisdictionId": "SVK",
      "sourceIds": [
        "sk-rpo"
      ],
      "identifierSchemeIds": [
        "sk-ico"
      ],
      "exposureProfileId": "basic-business-facts-v0",
      "promotionState": "PRODUCTION",
      "enabledCapabilities": [
        "exactLookup"
      ],
      "technicalVerification": {
        "status": "pass",
        "verifiedAt": "2026-08-14",
        "verificationRecordIds": [
          "VR-SVK-SOURCE-V1"
        ]
      },
      "policyVerification": {
        "status": "pass",
        "verifiedAt": "2026-08-14",
        "verificationRecordIds": [
          "VR-SVK-LICENCE-V1"
        ]
      },
      "cachePolicy": {
        "mode": "no-store"
      }
    },
    {
      "adapterId": "sg-acra-opendata-v1",
      "jurisdictionId": "SGP",
      "sourceIds": [
        "sg-acra-datagovsg"
      ],
      "identifierSchemeIds": [
        "sg-uen"
      ],
      "exposureProfileId": "basic-business-facts-v0",
      "promotionState": "PRODUCTION",
      "enabledCapabilities": [
        "exactLookup"
      ],
      "technicalVerification": {
        "status": "pass",
        "verifiedAt": "2026-08-14",
        "verificationRecordIds": [
          "VR-SGP-SOURCE-V1"
        ]
      },
      "policyVerification": {
        "status": "pass",
        "verifiedAt": "2026-08-14",
        "verificationRecordIds": [
          "VR-SGP-LICENCE-V1"
        ]
      },
      "cachePolicy": {
        "mode": "no-store"
      }
    }
  ],
  "exposureProfiles": [
    {
      "id": "basic-business-facts-v0",
      "version": "1.0.0",
      "allowedCanonicalFields": [
        "identifiers",
        "legalName",
        "status",
        "entityType",
        "registrationDate",
        "registeredAddress",
        "industryCodes",
        "provenance",
        "warnings"
      ],
      "prohibitedFieldClasses": [
        "officers",
        "directors",
        "shareholders",
        "owners",
        "beneficial-owners",
        "personal-residential-addresses",
        "person-identifiers",
        "paid-documents",
        "filing-binaries"
      ],
      "personDataAllowed": false
    }
  ],
  "eligibilityAssessments": [
    {
      "adapterId": "no-brreg-enhetsregisteret-v1",
      "assessedAt": "2026-08-14",
      "sourceScope": "pass",
      "identifier": "pass",
      "technical": "pass",
      "automation": "pass",
      "commercialUse": "pass",
      "responseRedistribution": "pass",
      "attribution": "pass",
      "exposureSafety": "pass",
      "provenance": "pass",
      "adapterQuality": "pass",
      "operational": "pass",
      "cache": "no-store",
      "decision": "eligible",
      "blockers": [],
      "warnings": [
        "Entity scope is broader than companies.",
        "HTTP 410 is a legal-withdrawal semantic and must never be collapsed into NOT_FOUND."
      ],
      "evidenceIds": [
        "EV-NOR-LIC-1",
        "EV-NOR-API-1",
        "EV-NOR-ERR-1",
        "EV-NOR-CONSTRAINT-1",
        "EV-NOR-LIVE-V1"
      ]
    },
    {
      "adapterId": "sk-rpo-v1",
      "assessedAt": "2026-08-14",
      "sourceScope": "pass",
      "identifier": "pass",
      "technical": "pass",
      "automation": "pass",
      "commercialUse": "pass",
      "responseRedistribution": "pass",
      "attribution": "pass",
      "exposureSafety": "pass",
      "provenance": "pass",
      "adapterQuality": "pass",
      "operational": "pass",
      "cache": "no-store",
      "decision": "eligible",
      "blockers": [],
      "warnings": [
        "RPO is an aggregation register.",
        "The public API refresh is nightly and may lag by up to 24 hours."
      ],
      "evidenceIds": [
        "EV-SVK-LIC-1",
        "EV-SVK-API-1",
        "EV-SVK-API-2",
        "EV-SVK-FRESH-1",
        "EV-SVK-LIVE-V1"
      ]
    },
    {
      "adapterId": "sg-acra-opendata-v1",
      "assessedAt": "2026-08-14",
      "sourceScope": "pass",
      "identifier": "pass",
      "technical": "pass",
      "automation": "pass",
      "commercialUse": "pass",
      "responseRedistribution": "pass",
      "attribution": "pass",
      "exposureSafety": "pass",
      "provenance": "pass",
      "adapterQuality": "pass",
      "operational": "pass",
      "cache": "no-store",
      "decision": "eligible",
      "blockers": [],
      "warnings": [
        "Open-data publication is not a certified BizFile+ profile.",
        "Refresh is monthly.",
        "Runtime fails closed if the verified field binding changes."
      ],
      "evidenceIds": [
        "EV-SGP-LIC-1",
        "EV-SGP-COM-1",
        "EV-SGP-RED-1",
        "EV-SGP-ATT-1",
        "EV-SGP-API-1",
        "EV-SGP-SCOPE-1",
        "EV-SGP-FIELD-V1"
      ]
    }
  ],
  "verificationRecords": [
    {
      "id": "VR-NOR-SOURCE-V1",
      "subjectId": "no-brreg-enhetsregisteret-v1",
      "checkedAt": "2026-08-14",
      "claims": [
        {
          "claim": "Exact lookup endpoint returned the expected entity and required fields",
          "result": "pass",
          "evidenceIds": [
            "EV-NOR-API-1",
            "EV-NOR-LIVE-V1"
          ]
        },
        {
          "claim": "404 and 410 semantics remain distinct",
          "result": "pass",
          "evidenceIds": [
            "EV-NOR-ERR-1"
          ]
        }
      ],
      "verdict": "pass"
    },
    {
      "id": "VR-SVK-SOURCE-V1",
      "subjectId": "sk-rpo-v1",
      "checkedAt": "2026-08-14",
      "claims": [
        {
          "claim": "Two-call IČO search and entity lookup returned the documented current TimedValue and CodeValue shapes",
          "result": "pass",
          "evidenceIds": [
            "EV-SVK-API-1",
            "EV-SVK-API-2",
            "EV-SVK-LIVE-V1"
          ]
        },
        {
          "claim": "Nightly freshness warning is surfaced",
          "result": "pass",
          "evidenceIds": [
            "EV-SVK-FRESH-1"
          ]
        }
      ],
      "verdict": "pass"
    },
    {
      "id": "VR-SGP-SOURCE-V1",
      "subjectId": "sg-acra-opendata-v1",
      "checkedAt": "2026-08-14",
      "claims": [
        {
          "claim": "Designated UEN-keyed resource contains verified uen and entity_name field bindings",
          "result": "pass",
          "evidenceIds": [
            "EV-SGP-API-1",
            "EV-SGP-FIELD-V1"
          ]
        },
        {
          "claim": "Runtime adapter revalidates the field binding and uses one exact-filtered resource request",
          "result": "pass",
          "evidenceIds": [
            "EV-SGP-FIELD-V1"
          ]
        }
      ],
      "verdict": "pass"
    },
    {
      "id": "VR-NOR-LICENCE-V1",
      "subjectId": "no-brreg-enhetsregisteret-v1",
      "checkedAt": "2026-08-14",
      "claims": [
        {
          "claim": "NLOD 2.0 is attached to the official API and required attribution is configured",
          "result": "pass",
          "evidenceIds": [
            "EV-NOR-LIC-1"
          ]
        },
        {
          "claim": "V1 uses NO_STORE and preserves 410 legal-withdrawal semantics",
          "result": "pass",
          "evidenceIds": [
            "EV-NOR-ERR-1"
          ]
        }
      ],
      "verdict": "pass"
    },
    {
      "id": "VR-SVK-LICENCE-V1",
      "subjectId": "sk-rpo-v1",
      "checkedAt": "2026-08-14",
      "claims": [
        {
          "claim": "Official RPO data are provided under CC BY 4.0 and attribution is configured",
          "result": "pass",
          "evidenceIds": [
            "EV-SVK-LIC-1"
          ]
        }
      ],
      "verdict": "pass"
    },
    {
      "id": "VR-SGP-LICENCE-V1",
      "subjectId": "sg-acra-opendata-v1",
      "checkedAt": "2026-08-14",
      "claims": [
        {
          "claim": "Commercial reuse and redistribution are permitted subject to Singapore Open Data Licence conditions",
          "result": "pass",
          "evidenceIds": [
            "EV-SGP-LIC-1",
            "EV-SGP-COM-1",
            "EV-SGP-RED-1"
          ]
        },
        {
          "claim": "Required attribution template and non-endorsement scope are configured",
          "result": "pass",
          "evidenceIds": [
            "EV-SGP-ATT-1",
            "EV-SGP-SCOPE-1"
          ]
        }
      ],
      "verdict": "pass"
    }
  ]
};
