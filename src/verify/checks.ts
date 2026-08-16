import type { FileReport, VerifyCheck, VerifyKind } from "./types.js";

export type VerifyExpectations = {
  kind?: Exclude<VerifyKind, "unknown">;
  count?: number;
  size?: { width: number; height: number };
  minDuration?: number;
  maxDuration?: number;
};

export const builtinChecks = (file: FileReport): VerifyCheck[] => {
  const checks: VerifyCheck[] = [
    { id: "readable", pass: file.size_bytes > 0, actual: file.size_bytes },
    { id: "parsed", pass: file.format !== "unknown", actual: file.format },
  ];
  if (file.kind === "image" || file.kind === "video") {
    checks.push({
      id: "dimensions_nonzero",
      pass: (file.width ?? 0) > 0 && (file.height ?? 0) > 0,
      actual: file.width === null || file.height === null ? null : `${file.width}x${file.height}`,
    });
  }
  if (file.kind === "video" || file.kind === "audio") {
    checks.push({
      id: "duration_positive",
      pass: file.duration_s === null || file.duration_s > 0,
      actual: file.duration_s,
      ...(file.duration_s === null ? { skipped: true } : {}),
    });
  }
  if (file.kind === "video") {
    checks.push({
      id: "frame_count_positive",
      pass: file.frame_count === null || file.frame_count >= 2,
      actual: file.frame_count,
      ...(file.frame_count === null ? { skipped: true } : {}),
    });
  }
  return checks;
};

export const expectationChecks = (
  file: FileReport,
  expectations: VerifyExpectations,
): VerifyCheck[] => {
  const checks: VerifyCheck[] = [];
  if (expectations.kind) {
    checks.push({
      id: "expect_kind",
      pass: file.kind === expectations.kind,
      expected: expectations.kind,
      actual: file.kind,
    });
  }
  if (expectations.size && (file.kind === "image" || file.kind === "video")) {
    checks.push({
      id: "expect_size",
      pass: file.width === expectations.size.width && file.height === expectations.size.height,
      expected: `${expectations.size.width}x${expectations.size.height}`,
      actual: file.width === null || file.height === null ? null : `${file.width}x${file.height}`,
    });
  }
  if (expectations.minDuration !== undefined && (file.kind === "video" || file.kind === "audio")) {
    checks.push({
      id: "min_duration",
      pass: file.duration_s === null || file.duration_s >= expectations.minDuration,
      expected: expectations.minDuration,
      actual: file.duration_s,
      ...(file.duration_s === null ? { skipped: true } : {}),
    });
  }
  if (expectations.maxDuration !== undefined && (file.kind === "video" || file.kind === "audio")) {
    checks.push({
      id: "max_duration",
      pass: file.duration_s === null || file.duration_s <= expectations.maxDuration,
      expected: expectations.maxDuration,
      actual: file.duration_s,
      ...(file.duration_s === null ? { skipped: true } : {}),
    });
  }
  return checks;
};

export const countCheck = (actual: number, expected: number): VerifyCheck => ({
  id: "expect_count",
  pass: actual === expected,
  expected,
  actual,
});
