import { DomainError } from "../../domain/errors";
import type { UpstreamResponse } from "../../lookup/types";

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonObject(response: UpstreamResponse, sourceId: string): Promise<JsonObject> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) {
    throw new DomainError("SOURCE_BAD_RESPONSE", "Official source returned a non-JSON content type", { sourceId });
  }
  if (!response.body) {
    throw new DomainError("SOURCE_BAD_RESPONSE", "Official source returned an empty response", { sourceId });
  }

  let text: string;
  try {
    text = await new Response(response.body).text();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("SOURCE_BAD_RESPONSE", "Official source response could not be read", { sourceId });
  }

  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new DomainError("SOURCE_BAD_RESPONSE", "Official source returned malformed JSON", { sourceId });
  }
  if (!isJsonObject(value)) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", "Official source JSON root is not an object", { sourceId });
  }
  return value;
}

export function requiredString(object: JsonObject, key: string, sourceId: string, maxLength = 1_024): string {
  const value = object[key];
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official source required field is missing or invalid: ${key}`, { sourceId });
  }
  return value;
}

export function optionalString(object: JsonObject, key: string, sourceId: string, maxLength = 1_024): string | null {
  const value = object[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official source field has an unexpected type: ${key}`, { sourceId });
  }
  return value;
}

export function optionalBoolean(object: JsonObject, key: string, sourceId: string): boolean | null {
  const value = object[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official source field has an unexpected type: ${key}`, { sourceId });
  }
  return value;
}

export function optionalObject(object: JsonObject, key: string, sourceId: string): JsonObject | null {
  const value = object[key];
  if (value === undefined || value === null) return null;
  if (!isJsonObject(value)) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official source field has an unexpected type: ${key}`, { sourceId });
  }
  return value;
}

export function optionalStringArray(object: JsonObject, key: string, sourceId: string, maxItems = 32): string[] | null {
  const value = object[key];
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || item.length > 1_024)) {
    throw new DomainError("SOURCE_SCHEMA_CHANGED", `Official source field has an unexpected type: ${key}`, { sourceId });
  }
  return value;
}
