import path from "node:path";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { readConfigSync } from "../io/config.js";
import { getSubdirPath, type WorkdirScope } from "../io/workdir.js";
import { loadPresetFile } from "../preset/loader.js";
import type { Preset } from "../preset/schema.js";
import { decideComfyBaseUrl } from "../utils/base-url.js";
import {
  normalizeWorkflow,
  type Workflow,
  type WorkflowObjectInfo,
} from "../workflow/normalize.js";
import { resolveWorkflowPath } from "../workflow/load.js";
import { buildPreflightReport } from "../workflow/preflight.js";
import { resolveSeedTargets } from "../cli/run/args.js";
import type { JobRecord } from "../jobs/types.js";

export type StudioTask =
  | "text_to_image"
  | "image_edit"
  | "text_to_video"
  | "image_to_video"
  | "reference_to_video"
  | "audio"
  | "video_to_video"
  | "remove_background"
  | "inpaint"
  | "upscale"
  | "custom";

export const inferCapability = (preset: Preset, workflow: Workflow) => {
  const classes = Object.values(workflow).flatMap((node) =>
    node && typeof node === "object" && "class_type" in node && typeof node.class_type === "string"
      ? [node.class_type]
      : [],
  );
  const name = preset.name.toLowerCase();
  const video = classes.some((type) =>
    /SaveVideo|VideoCombine|CreateVideo|SaveWEBM|SaveAnimated(?:WEBP|PNG)/i.test(type),
  );
  const audio = classes.some((type) => /SaveAudio/i.test(type));
  const output = video ? "video" : audio ? "audio" : "image";
  const uploads = Object.values(preset.uploads ?? {});
  const images = uploads.filter((def) => def.kind === "image" || def.kind === "mask");
  const audios = uploads.filter((def) => def.kind === "audio");
  const token = (value: string) => new RegExp(`(?:^|[_-])(?:${value})(?:$|[_-])`).test(name);
  let task: StudioTask;
  if (preset.task) {
    const aliases: Partial<Record<NonNullable<Preset["task"]>, StudioTask>> = {
      image_to_image: "image_edit",
      text_to_audio: "audio",
      audio_to_audio: "audio",
      audio_inpaint: "audio",
    };
    task = aliases[preset.task] ?? (preset.task as StudioTask);
  } else if (output === "video") {
    task = token("flf2v")
      ? "image_to_video"
      : images.length > 1 ||
          (images.length > 0 && audios.length > 0) ||
          images.some((def) => def.role === "reference_image")
        ? "reference_to_video"
        : images.length
          ? "image_to_video"
          : uploads.some((def) => /video/.test(def.role ?? ""))
            ? "video_to_video"
            : token("r2v")
              ? "reference_to_video"
              : token("i2v")
                ? "image_to_video"
                : "text_to_video";
  } else if (output === "audio") task = "audio";
  else task = images.length || token("i2i|edit") ? "image_edit" : "text_to_image";
  return { task, task_source: preset.task ? ("preset" as const) : ("inferred" as const), output };
};

export const capabilityInputs = (preset: Preset) => {
  const entries = Object.entries(preset.uploads ?? {});
  const images = entries.filter(([, def]) => def.kind === "image");
  const framePair = /(?:^|[_-])flf2v(?:$|[_-])/i.test(preset.name);
  return entries.map(([name, def]) => {
    const imageIndex = images.findIndex(([slot]) => slot === name);
    const words = [name, def.role, ...(def.aliases ?? [])].join(" ").toLowerCase();
    const first = /(?:^|[\s_-])(?:first|start|initial)(?:$|[\s_-])/.test(words);
    const last = /(?:^|[\s_-])(?:last|end|final)(?:$|[\s_-])/.test(words);
    let label: string = def.role ?? (def.kind === "mask" ? "mask" : `input_${def.kind}`);
    let labelIndex: number | undefined;
    if (def.kind === "image" && framePair) {
      label = first ? "first_frame" : last ? "last_frame" : "numbered_image";
      if (!first && !last) labelIndex = imageIndex + 1;
    } else if (
      def.kind === "image" &&
      images.length > 1 &&
      images.filter(([, other]) => (other.role ?? "input_image") === label).length > 1
    ) {
      label = "numbered_image";
      labelIndex = imageIndex + 1;
    }
    return {
      name,
      kind: def.kind,
      role: def.role,
      label,
      ...(labelIndex === undefined ? {} : { label_index: labelIndex }),
      required: def.required ?? false,
    };
  });
};

/** Never expose node IDs as the primary label. The UI translates these semantic keys. */
export const capabilityFields = (preset: Preset) =>
  Object.entries(preset.parameters ?? {})
    .filter(([name]) => !resolveSeedTargets(preset).some(({ param }) => param === name))
    .map(([name, def]) => {
      const input = def.target.input;
      const alias = def.aliases
        ?.map((value) => value.replace(/^--/, ""))
        .find((value) =>
          /^(length|frames|num_frames|fps|frame_rate|duration|seconds)$/.test(value),
        );
      const label =
        alias ??
        (def.role && !["custom", "advanced"].includes(def.role)
          ? def.role
          : /^(text|prompt|positive_prompt)$/.test(input)
            ? "prompt"
            : input.replace(/_/g, " "));
      return {
        name,
        role: def.role,
        label,
        type: def.type,
        description: def.description,
        value: def.default ?? "",
        min: def.min,
        max: def.max,
        choices: def.choices,
        required: def.required ?? false,
      };
    });

export const loadStudioPresets = async (cwd: string) => {
  const seen = new Set<string>();
  const result: Array<{ name: string; scope: WorkdirScope; preset: Preset | null }> = [];
  for (const scope of ["local", "global"] as const) {
    let names: string[];
    try {
      names = await fs.readdir(getSubdirPath("presets", cwd, scope));
    } catch {
      continue;
    }
    for (const file of names.sort()) {
      if (!/\.ya?ml$/.test(file)) continue;
      const name = file.replace(/\.ya?ml$/, "");
      if (seen.has(name)) continue;
      seen.add(name);
      let preset: Preset | null = null;
      try {
        preset = await loadPresetFile(path.join(getSubdirPath("presets", cwd, scope), file));
      } catch {
        /* Broken local presets still shadow global presets. */
      }
      result.push({ name, scope, preset });
    }
  }
  return result;
};

type Snapshot = {
  reachable: boolean;
  checked_at?: string;
  fingerprint?: string;
  objectInfo?: Record<string, unknown>;
  system?: { gpu?: string; gpu_label?: string; vram_total?: number; comfyui_version?: string };
  error?: { code: "timeout" | "http" | "network" | "invalid_response"; status?: number };
};
export const serverFingerprint = (objectInfo: Record<string, unknown>) => {
  const models = new Set<string>();
  const walk = (value: unknown, modelInput = false) => {
    if (
      typeof value === "string" &&
      (modelInput || /\.(safetensors|gguf|ckpt|pth|bin)$/i.test(value))
    )
      models.add(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, modelInput));
    else if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value))
        walk(
          item,
          modelInput ||
            /^(?:model|ckpt|checkpoint|unet|lora|vae|clip)[_-]?(?:name|file|path)?\d*$/i.test(key),
        );
  };
  walk(objectInfo);
  return createHash("sha256")
    .update(JSON.stringify([Object.keys(objectInfo).sort(), [...models].sort()]))
    .digest("hex")
    .slice(0, 16);
};
export const STUDIO_OBJECT_INFO_TIMEOUT_MS = 90_000;
export const STUDIO_SYSTEM_STATS_TIMEOUT_MS = 5_000;
export const STUDIO_SNAPSHOT_STALE_MS = 10 * 60_000;
export const isStudioSnapshotStale = (checkedAt: string | undefined) =>
  checkedAt !== undefined && Date.now() - Date.parse(checkedAt) > STUDIO_SNAPSHOT_STALE_MS;
export const formatStudioGpuLabel = (name: string) =>
  name
    .replace(/^cuda:\d+\s+/i, "")
    .replace(/\s+:\s*.*$/, "")
    .replace(/^NVIDIA\s+/i, "")
    .trim();
const SNAPSHOT_CACHE_MS = 60_000;
class ProbeError extends Error {
  constructor(
    readonly code: NonNullable<Snapshot["error"]>["code"],
    readonly status?: number,
  ) {
    super(code);
  }
}
export type CapabilityFetcher = (
  url: string,
  options?: { signal: AbortSignal },
) => Promise<unknown>;
const fetchJson: CapabilityFetcher = async (url, options) => {
  const res = await fetch(url, options);
  if (!res.ok) throw new ProbeError("http", res.status);
  return res.json();
};

export class StudioCapabilities {
  private cache: { url: string; until: number; snapshot: Snapshot } | null = null;
  private inFlight: { url: string; promise: Promise<Snapshot> } | null = null;
  constructor(
    private readonly cwd: string,
    private readonly fetcher: CapabilityFetcher = fetchJson,
  ) {}
  private async fetchWithTimeout(url: string, timeoutMs: number) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new ProbeError("timeout");
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });
    try {
      return await Promise.race([this.fetcher(url, { signal: controller.signal }), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
  private snapshot(url: string, refresh: boolean): Promise<Snapshot> {
    // Refresh bypasses completed results, but shares an already-running probe.
    if (this.inFlight?.url === url) return this.inFlight.promise;
    if (!refresh && this.cache?.url === url && this.cache.until > Date.now())
      return Promise.resolve(this.cache.snapshot);
    const promise = (async (): Promise<Snapshot> => {
      const [info, stats] = await Promise.allSettled([
        this.fetchWithTimeout(`${url}/object_info`, STUDIO_OBJECT_INFO_TIMEOUT_MS),
        this.fetchWithTimeout(`${url}/system_stats`, STUDIO_SYSTEM_STATS_TIMEOUT_MS),
      ]);
      const objectInfo =
        info.status === "fulfilled" &&
        info.value &&
        typeof info.value === "object" &&
        !Array.isArray(info.value)
          ? (info.value as Record<string, unknown>)
          : undefined;
      const raw =
        stats.status === "fulfilled"
          ? (stats.value as {
              devices?: Array<{ name?: string; vram_total?: number }>;
              system?: { comfyui_version?: string };
            } | null)
          : null;
      const device = raw?.devices?.[0];
      const system = raw
        ? {
            gpu: device?.name,
            gpu_label: device?.name ? formatStudioGpuLabel(device.name) : undefined,
            vram_total: device?.vram_total,
            comfyui_version: raw.system?.comfyui_version,
          }
        : undefined;
      const error = objectInfo
        ? undefined
        : info.status === "fulfilled" || info.reason instanceof SyntaxError
          ? { code: "invalid_response" as const }
          : info.reason instanceof ProbeError
            ? { code: info.reason.code, status: info.reason.status }
            : { code: "network" as const };
      return {
        reachable: objectInfo !== undefined || raw != null,
        checked_at: objectInfo ? new Date().toISOString() : undefined,
        objectInfo,
        system,
        fingerprint: objectInfo ? serverFingerprint(objectInfo) : undefined,
        error,
      };
    })().then((snapshot) => {
      if (this.inFlight?.promise === promise) {
        this.inFlight = null;
        // Only a successful object_info probe can be reused for a full TTL.
        this.cache = snapshot.objectInfo
          ? { url, until: Date.now() + SNAPSHOT_CACHE_MS, snapshot }
          : null;
      }
      return snapshot;
    });
    this.inFlight = { url, promise };
    return promise;
  }
  serverSnapshot(refresh = false) {
    const decision = decideComfyBaseUrl({}, process.env, (scope) =>
      readConfigSync(this.cwd, scope),
    );
    return this.snapshot(decision.value.replace(/\/$/, ""), refresh);
  }
  async read(jobs: JobRecord[], refresh = false) {
    return (await this.readWithSnapshot(jobs, refresh)).result;
  }
  async readWithSnapshot(jobs: JobRecord[], refresh = false) {
    const decision = decideComfyBaseUrl({}, process.env, (scope) =>
      readConfigSync(this.cwd, scope),
    );
    const url = decision.value.replace(/\/$/, "");
    const cached =
      !refresh &&
      this.inFlight?.url !== url &&
      this.cache?.url === url &&
      this.cache.until > Date.now();
    const [snapshot, loaded] = await Promise.all([
      this.snapshot(url, refresh),
      loadStudioPresets(this.cwd),
    ]);
    const presets = await Promise.all(
      loaded.map(async ({ name, scope, preset }) => {
        let workflow: Workflow = {};
        let valid = preset !== null;
        try {
          if (preset)
            workflow = normalizeWorkflow(
              JSON.parse(await fs.readFile(resolveWorkflowPath(preset, scope, this.cwd), "utf-8")),
              { objectInfo: snapshot.objectInfo as WorkflowObjectInfo | undefined },
            );
        } catch {
          valid = false;
        }
        const resolved = preset ?? { version: 1 as const, name, workflow: "" };
        const report =
          snapshot.objectInfo && valid ? buildPreflightReport(workflow, snapshot.objectInfo) : null;
        const nodes = [...new Set(report?.missing_nodes.map((node) => node.class_type) ?? [])];
        const models = [...new Set(report?.missing_models.map((model) => model.value) ?? [])];
        const availability = !report
          ? "unknown"
          : nodes.length
            ? "missing_nodes"
            : models.length
              ? "missing_models"
              : "ok";
        const last = jobs
          .filter((job) => job.preset === name)
          .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at))[0];
        return {
          name,
          scope,
          description: resolved.description,
          ...inferCapability(resolved, workflow),
          inputs: capabilityInputs(resolved),
          fields: capabilityFields(resolved),
          has_seed: resolveSeedTargets(resolved).length > 0,
          availability,
          missing: { nodes, models },
          invalid: !valid,
          last_used_at: last?.submitted_at,
        };
      }),
    );
    const result = {
      ok: true,
      server: {
        base_url: decision.value,
        source: decision.source,
        reachable: snapshot.reachable,
        system: snapshot.system,
        fingerprint: snapshot.fingerprint,
        cached: Boolean(cached),
        checked_at: snapshot.checked_at,
        error: snapshot.error,
      },
      presets,
    };
    return { result, snapshot };
  }
}
