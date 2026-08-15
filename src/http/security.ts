import { DomainError } from "../domain/errors";

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "cross-origin-resource-policy": "cross-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

export function assertSafeRequestTarget(url: URL, rawUrl = url.toString()): void {
  if (url.pathname.length > 2048 || url.search.length > 2048) {
    throw new DomainError("INVALID_REQUEST", "Request target is too long");
  }
  if (CONTROL_CHARACTERS.test(url.pathname) || CONTROL_CHARACTERS.test(url.search)) {
    throw new DomainError("INVALID_REQUEST", "Request target contains control characters");
  }

  const authorityEnd = rawUrl.indexOf("/", rawUrl.indexOf("//") + 2);
  const rawTarget = authorityEnd === -1 ? "/" : rawUrl.slice(authorityEnd);
  const rawPath = rawTarget.split(/[?#]/, 1)[0] ?? "";
  if (url.pathname.startsWith("/api/") && /%/i.test(rawPath)) {
    throw new DomainError("INVALID_REQUEST", "Encoded API paths are not accepted");
  }
  if (/(?:^|\/)(?:\.{1,2})(?:\/|$)/.test(rawPath) || rawPath.includes("\\")) {
    throw new DomainError("INVALID_REQUEST", "Unsafe request path");
  }
}

export function hostnameIsAllowed(requestUrl: string, expectedHostname: string): boolean {
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" && url.hostname === expectedHostname && url.port === "";
  } catch {
    return false;
  }
}

export function decodePathSegment(value: string, label: string, maxLength: number): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new DomainError("INVALID_REQUEST", `Invalid ${label} encoding`);
  }
  if (decoded.length === 0 || decoded.length > maxLength || CONTROL_CHARACTERS.test(decoded) || decoded.includes("/") || decoded.includes("\\")) {
    throw new DomainError("INVALID_REQUEST", `Invalid ${label}`);
  }
  return decoded;
}

export function publicErrorPayload(error: DomainError): Record<string, unknown> {
  const safeDetailKeys = new Set(["jurisdiction", "identifierScheme"]);
  const details: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(error.details)) {
    if (safeDetailKeys.has(key)) details[key] = value;
  }

  const genericMessages: Partial<Record<DomainError["code"], string>> = {
    SOURCE_UNAVAILABLE: "Official source is temporarily unavailable",
    SOURCE_TIMEOUT: "Official source timed out",
    SOURCE_RATE_LIMITED: "Official source is temporarily rate limited",
    SOURCE_AUTH_ERROR: "Official source request could not be completed",
    SOURCE_BAD_RESPONSE: "Official source returned an invalid response",
    SOURCE_SCHEMA_CHANGED: "Official source response schema changed",
    POLICY_BLOCKED: "This lookup is not permitted by current source policy",
    LICENCE_BLOCKED: "This lookup is not permitted by current reuse policy",
    INTERNAL_ERROR: "Internal error",
  };

  return {
    code: error.code,
    message: genericMessages[error.code] ?? error.message,
    ...details,
  };
}
