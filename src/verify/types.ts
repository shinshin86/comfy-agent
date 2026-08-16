export type VerifyKind = "image" | "video" | "audio" | "unknown";

export type ProbeSource = "pure-js" | "ffprobe" | "pure-js+ffprobe" | "none";

export type ProbeResult = {
  parsed: boolean;
  format: string;
  kind: VerifyKind;
  animated: boolean;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  fps: number | null;
  frame_count: number | null;
  channels: number | null;
  sample_rate: number | null;
  bits_per_sample: number | null;
  size_bytes: number;
  magic: string;
};

export type FfprobeResult = {
  kind: VerifyKind;
  format: string | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  fps: number | null;
  frame_count: number | null;
  frame_count_estimated: boolean;
  channels: number | null;
  sample_rate: number | null;
  bit_rate: number | null;
};

export type VerifyWarning = {
  code: string;
  message: string;
  hint?: string;
  details?: Record<string, unknown>;
};

export type VerifyCheck = {
  id: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
  skipped?: boolean;
};

export type FrameArtifact = {
  index: number;
  frame_n: number | null;
  t_s: number | null;
  path: string;
};

export type FileArtifacts = {
  frames: FrameArtifact[];
  sheet: string | null;
  waveform: string | null;
};

export type FileReport = {
  path: string;
  kind: VerifyKind;
  format: string;
  animated: boolean;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  fps: number | null;
  frame_count: number | null;
  channels: number | null;
  sample_rate: number | null;
  bits_per_sample: number | null;
  size_bytes: number;
  sha256: string | null;
  probe_source: ProbeSource;
  ffprobe: FfprobeResult | null;
  artifacts: FileArtifacts;
  checks: VerifyCheck[];
  warnings: VerifyWarning[];
};

export type ToolInfo = {
  available: boolean;
  path: string | null;
  version: string | null;
};

export type VerifyTools = {
  ffmpeg: ToolInfo;
  ffprobe: ToolInfo;
};

export type VerifyManifestSummary = {
  found: boolean;
  preset?: string;
  runs?: number;
  expected_outputs?: number;
};

export type VerifySummary = {
  files: number;
  by_kind: Record<VerifyKind, number>;
  checks_passed: number;
  checks_failed: number;
  warnings: number;
  verified_visually: false;
};

export type VerifyReport = {
  ok: boolean;
  target: string;
  target_type: "dir" | "file";
  manifest: VerifyManifestSummary;
  tools: VerifyTools;
  verify_dir: string;
  files: FileReport[];
  extra_files: string[];
  sheet: string | string[] | null;
  checks: VerifyCheck[];
  summary: VerifySummary;
  warnings: VerifyWarning[];
};
