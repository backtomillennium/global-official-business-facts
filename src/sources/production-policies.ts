import { NORWAY_SOURCE_ID } from "../adapters/norway/no-brreg-enhetsregisteret-v1";
import { SINGAPORE_SOURCE_ID } from "../adapters/singapore/sg-acra-opendata-v1";
import { SLOVAKIA_SOURCE_ID } from "../adapters/slovakia/sk-rpo-v1";
import type { SourceTransportPolicy } from "./source-fetcher";

export const PRODUCTION_SOURCE_POLICIES: SourceTransportPolicy[] = [
  {
    sourceId: NORWAY_SOURCE_ID,
    allowedOrigins: ["https://data.brreg.no"],
    allowedPathPrefixes: ["/enhetsregisteret/api/enheter/"],
    allowedMethods: ["GET"],
    allowedRequestHeaders: ["accept"],
    timeoutMs: 8_000,
    maxResponseBytes: 512_000,
  },
  {
    sourceId: SLOVAKIA_SOURCE_ID,
    allowedOrigins: ["https://api.statistics.sk"],
    allowedPaths: ["/rpo/v1/search"],
    allowedPathPrefixes: ["/rpo/v1/entity/"],
    allowedMethods: ["GET"],
    allowedRequestHeaders: ["accept"],
    timeoutMs: 8_000,
    maxResponseBytes: 1_000_000,
  },
  {
    sourceId: SINGAPORE_SOURCE_ID,
    allowedOrigins: ["https://data.gov.sg"],
    allowedPaths: ["/api/action/datastore_search"],
    allowedPathPrefixes: [],
    allowedMethods: ["GET"],
    allowedRequestHeaders: ["accept"],
    timeoutMs: 8_000,
    maxResponseBytes: 1_000_000,
  },
];
