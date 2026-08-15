export type DomainErrorCode =
  | "INVALID_REQUEST"
  | "UNKNOWN_JURISDICTION"
  | "UNSUPPORTED_JURISDICTION"
  | "UNKNOWN_IDENTIFIER_SCHEME"
  | "UNSUPPORTED_IDENTIFIER"
  | "INVALID_IDENTIFIER"
  | "RATE_LIMITED"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_INVALID"
  | "PAYMENT_UNAVAILABLE"
  | "NOT_FOUND"
  | "WITHDRAWN_FOR_LEGAL_REASONS"
  | "NO_PRODUCTION_ADAPTER"
  | "ADAPTER_DISABLED"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_TIMEOUT"
  | "SOURCE_RATE_LIMITED"
  | "SOURCE_AUTH_ERROR"
  | "SOURCE_BAD_RESPONSE"
  | "SOURCE_SCHEMA_CHANGED"
  | "POLICY_BLOCKED"
  | "LICENCE_BLOCKED"
  | "INTERNAL_ERROR";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = "DomainError";
  }
}
