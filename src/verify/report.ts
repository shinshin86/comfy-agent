import path from "node:path";
import { t } from "../i18n/index.js";
import type { FileReport, VerifyReport, VerifySummary } from "./types.js";

export const summarize = (
  files: FileReport[],
  reportChecks: VerifyReport["checks"],
  reportWarnings: VerifyReport["warnings"],
): VerifySummary => {
  const checks = [...reportChecks, ...files.flatMap((file) => file.checks)];
  return {
    files: files.length,
    by_kind: {
      image: files.filter(({ kind }) => kind === "image").length,
      video: files.filter(({ kind }) => kind === "video").length,
      audio: files.filter(({ kind }) => kind === "audio").length,
      unknown: files.filter(({ kind }) => kind === "unknown").length,
    },
    checks_passed: checks.filter(({ pass }) => pass).length,
    checks_failed: checks.filter(({ pass }) => !pass).length,
    warnings:
      reportWarnings.length + files.reduce((count, file) => count + file.warnings.length, 0),
    verified_visually: false,
    record_updated: false,
  };
};

const displayFile = (file: FileReport) => {
  const details = [
    `${file.kind}/${file.format}${file.animated ? " (animated)" : ""}`,
    file.width && file.height ? `${file.width}x${file.height}` : null,
    file.duration_s === null ? null : `${file.duration_s.toFixed(2)}s`,
    file.frame_count === null ? null : `${file.frame_count}f`,
    file.fps === null ? null : `${file.fps.toFixed(2)}fps`,
    `${(file.size_bytes / (1024 * 1024)).toFixed(2)} MiB`,
  ].filter(Boolean);
  const lines = [`- ${path.basename(file.path)}  ${details.join("  ")}`];
  lines.push(
    `    checks: ${file.checks.map((check) => `${check.id} ${check.pass ? "ok" : "FAIL"}${check.skipped ? " (metadata unavailable)" : ""}`).join(", ")}`,
  );
  for (const warning of file.warnings)
    lines.push(`    warning: ${warning.code} — ${warning.message}`);
  return lines;
};

export const toText = (report: VerifyReport) => {
  const manifest = report.manifest.found
    ? `${report.manifest.preset}, ${report.manifest.runs} run(s)`
    : "not found";
  const ffmpeg = report.tools.ffmpeg.available
    ? `ffmpeg ${report.tools.ffmpeg.version ?? "available"}`
    : "ffmpeg unavailable";
  const ffprobe = report.tools.ffprobe.available
    ? `ffprobe ${report.tools.ffprobe.version ?? "available"}`
    : "ffprobe unavailable";
  const lines = [
    `verify: ${report.target} (manifest: ${manifest})`,
    `tools: ${ffmpeg}, ${ffprobe}`,
    "",
  ];
  for (const file of report.files) lines.push(...displayFile(file), "");
  for (const check of report.checks) {
    lines.push(`check: ${check.id} ${check.pass ? "ok" : "FAIL"}`);
  }
  for (const warning of report.warnings)
    lines.push(`warning: ${warning.code} — ${warning.message}`);
  lines.push(
    t("verify.summary", {
      files: report.summary.files,
      passed: report.summary.checks_passed,
      failed: report.summary.checks_failed,
      warnings: report.summary.warnings,
    }),
    `sheet: ${report.sheet ?? "(not generated)"}`,
    `verify.json: ${path.join(report.verify_dir, "verify.json")}`,
    t("verify.not_viewed_note"),
  );
  return lines.join("\n");
};
