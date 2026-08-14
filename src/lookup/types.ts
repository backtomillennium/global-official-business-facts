import type { AdapterCapabilities, BusinessFactRecord, IdentifierKind } from "../domain/types";

export interface LookupRequest {
  jurisdictionId: string;
  identifier: {
    schemeId: string;
    value: string;
  };
}

export interface IdentifierInput {
  schemeId: string;
  value: string;
}

export type ValidationResult = { ok: true; normalizedValue: string } | { ok: false; reason: string };

export interface AdapterExecution {
  requestId: string;
  adapterId: string;
  adapterVersion: string;
  normalizationVersion: string;
  sourceIds: string[];
  startedAt: string;
  completedAt: string;
  cacheStatus: "not-checked" | "bypass-no-store" | "hit" | "miss";
  warnings: string[];
}

export interface AdapterResult {
  record: BusinessFactRecord;
  execution: AdapterExecution;
}

export interface AdapterContext {
  fetcher: SourceFetcher;
  clock: Clock;
  logger: Logger;
  requestId: string;
}

export interface BusinessAdapter {
  id: string;
  version: string;
  normalizationVersion: string;
  jurisdictionId: string;
  supportedIdentifierSchemeIds: string[];
  capabilities: AdapterCapabilities;
  sourceIds: string[];
  validateIdentifier(input: IdentifierInput): ValidationResult;
  lookup(request: LookupRequest, context: AdapterContext): Promise<AdapterResult>;
}

export interface UpstreamRequest {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface UpstreamResponse {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

export interface SourceFetcher {
  request(sourceId: string, request: UpstreamRequest): Promise<UpstreamResponse>;
}

export interface Clock {
  now(): Date;
}

export interface Logger {
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}

export interface PublicBusinessResponse {
  jurisdiction: { id: string; iso2: string | null };
  identifier: { scheme: string; kind: IdentifierKind; value: string };
  facts: Record<string, unknown>;
  source: {
    authority: string;
    registry: string;
    sourceIds: string[];
    retrievedAt: string;
    dataAsOf: string | null;
  };
  warnings: string[];
}
