export type ErrorDetails = Record<string, unknown>;

export class CliError extends Error {
  code: string;
  exitCode: number;
  details?: ErrorDetails;

  constructor(code: string, message: string, exitCode = 2, details?: ErrorDetails) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export const isCliError = (err: unknown): err is CliError => {
  return err instanceof CliError;
};

export type ErrorPayload = {
  ok: false;
  error: { code: string; message: string; details: ErrorDetails | null };
};

export const buildErrorPayload = (
  code: string,
  message: string,
  details?: ErrorDetails | null,
): ErrorPayload => {
  return {
    ok: false,
    error: {
      code,
      message,
      details: details ?? null,
    },
  };
};

export const errorPayloadFrom = (err: unknown): ErrorPayload => {
  if (isCliError(err)) {
    return buildErrorPayload(err.code, err.message, err.details ?? null);
  }
  const message = err instanceof Error ? err.message : String(err);
  return buildErrorPayload("UNEXPECTED", message, { cause: String(err) });
};

export const exitCodeFrom = (err: unknown) => {
  if (isCliError(err)) return err.exitCode;
  return 3;
};
