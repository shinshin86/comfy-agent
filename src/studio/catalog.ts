import type { JobRecord } from "../jobs/types.js";
import { promises as fs } from "node:fs";
import { resolveWorkflowPath } from "../workflow/load.js";
import {
  normalizeWorkflow,
  type Workflow,
  type WorkflowObjectInfo,
} from "../workflow/normalize.js";
import {
  pruneOptionalInputs,
  skipWorkflowUploads,
  hasBakedInput,
} from "../workflow/optional-inputs.js";
import type { Preset, ParameterDef } from "../preset/schema.js";
import {
  StudioCapabilities,
  loadStudioPresets,
  isStudioSnapshotStale,
  type CapabilityFetcher,
} from "./capabilities.js";
import {
  CAPABILITY_LABELS,
  CONTROL_LABELS,
  inputRoleLabel,
  localized,
  autoProfileSummary,
  readWorkflowProfile,
  validateProfileMapping,
  type WorkflowProfile,
  type CapabilityId,
} from "./profiles.js";

export type ResolvedControl = {
  param: string;
  label: { ja: string; en: string };
  type: ParameterDef["type"];
  default?: unknown;
  required: boolean;
  min?: number;
  max?: number;
  step?: number;
  step_offset?: number;
  choices?: unknown[];
};
export type CatalogControls = Partial<
  Record<"prompt" | "negative_prompt" | "width" | "height" | "frames" | "strength", ResolvedControl>
> & { fps?: ResolvedControl | number; count?: true; seed?: true; other: ResolvedControl[] };
export const resolveProfileControls = (
  profile: WorkflowProfile,
  preset: Preset,
  workflow?: Workflow,
  objectInfo?: WorkflowObjectInfo,
): CatalogControls => {
  const field = (param: string, key: string) => {
    const def = preset.parameters![param]!;
    const input = def.target.input;
    const node = workflow?.[String(def.target.node_id)] as { class_type?: string } | undefined;
    const info = node?.class_type && objectInfo?.[node.class_type];
    const spec = info && (info.input?.required?.[input] ?? info.input?.optional?.[input]);
    const options =
      Array.isArray(spec) && spec[1] && typeof spec[1] === "object"
        ? (spec[1] as Record<string, unknown>)
        : {};
    const frameRule = key === "frames" && /8\s*(?:n|\*\s*n)\s*\+\s*1/i.test(def.description ?? "");
    const step = frameRule
      ? 8
      : (def.step ??
        (typeof options.step === "number" && options.step > 0 ? options.step : undefined));
    const label =
      CONTROL_LABELS[key] ??
      CONTROL_LABELS[def.role ?? ""] ??
      CONTROL_LABELS[input] ??
      localized(input.replace(/_/g, " "), input.replace(/_/g, " "));
    return {
      param,
      label,
      type: def.type,
      default: def.default,
      required: def.required ?? false,
      min: typeof options.min === "number" ? Math.max(def.min ?? -Infinity, options.min) : def.min,
      max: typeof options.max === "number" ? Math.min(def.max ?? Infinity, options.max) : def.max,
      step,
      step_offset: frameRule
        ? 1
        : step
          ? (def.min ?? (typeof options.min === "number" ? options.min : 0))
          : undefined,
      choices: def.choices,
    };
  };
  return {
    ...Object.fromEntries(
      Object.entries(profile.controls)
        .filter(([key]) => key !== "other")
        .map(([key, value]) => [key, typeof value === "string" ? field(value, key) : value]),
    ),
    other: profile.controls.other.map((param) => field(param, param)),
  } as CatalogControls;
};
const ORDER: CapabilityId[] = [
  "text_to_image",
  "image_edit",
  "upscale",
  "remove_background",
  "text_to_video",
  "image_to_video",
  "first_last_frame",
  "reference_to_video",
  "video_to_video",
  "music",
  "sound_effect",
  "speech",
  "other",
];
const missingMainInput = (profile: WorkflowProfile) => {
  const image = profile.inputs.filter(
    (input) =>
      (input.kind === "image" || input.kind === "file") &&
      !["mask", "audio_reference", "video_source"].includes(input.role),
  );
  const imageRequired = [
    "image_edit",
    "image_to_video",
    "reference_to_video",
    "upscale",
    "remove_background",
  ];
  const missingImage =
    (imageRequired.includes(profile.capability) && !image.length) ||
    (profile.capability === "first_last_frame" &&
      (!image.some((input) => input.role === "start_frame") ||
        !image.some((input) => input.role === "end_frame")));
  if (missingImage)
    return localized(
      "画像を受け取る設定がないため使えません（取り込み直しが必要です）",
      "Cannot receive an image. Import this workflow again to configure its inputs.",
    );
  if (
    profile.capability === "video_to_video" &&
    !profile.inputs.some(
      (input) => (input.kind === "video" || input.kind === "file") && input.role === "video_source",
    )
  )
    return localized(
      "動画を受け取る設定がないため使えません（取り込み直しが必要です）",
      "Cannot receive a video. Import this workflow again to configure its inputs.",
    );
  return undefined;
};
export class StudioCatalog {
  readonly probe: StudioCapabilities;
  constructor(
    private readonly cwd: string,
    fetcher?: CapabilityFetcher,
  ) {
    this.probe = new StudioCapabilities(cwd, fetcher);
  }
  async validateSkip(preset: Preset, scope: "local" | "global", slots: string[]) {
    const snapshot = await this.probe.serverSnapshot();
    const objectInfo = snapshot.objectInfo as WorkflowObjectInfo | undefined;
    const workflow = normalizeWorkflow(
      JSON.parse(await fs.readFile(resolveWorkflowPath(preset, scope, this.cwd), "utf8")),
      { objectInfo },
    );
    return skipWorkflowUploads(workflow, preset, slots, objectInfo);
  }
  async read(jobs: JobRecord[], refresh = false) {
    const { result: checked, snapshot } = await this.probe.readWithSnapshot(jobs, refresh);
    const objectInfo = snapshot.objectInfo as WorkflowObjectInfo | undefined;
    const server = {
      state: checked.server.fingerprint
        ? ("online" as const)
        : checked.server.reachable && !checked.server.error
          ? ("checking" as const)
          : ("offline" as const),
      base_url: checked.server.base_url,
      source: checked.server.source,
      ...checked.server.system,
      fingerprint: checked.server.fingerprint,
      checked_at: checked.server.checked_at,
      error: checked.server.error,
    };
    const loaded = await loadStudioPresets(this.cwd);
    const profiles = await Promise.all(
      loaded.map(async (entry) => {
        if (!entry.preset) return null;
        try {
          const profile = await readWorkflowProfile(this.cwd, entry.preset, entry.scope);
          validateProfileMapping(profile, entry.preset);
          const workflow = normalizeWorkflow(
            JSON.parse(
              await fs.readFile(resolveWorkflowPath(entry.preset, entry.scope, this.cwd), "utf8"),
            ),
            { objectInfo },
          );
          return { entry, profile, workflow };
        } catch {
          return null;
        }
      }),
    );
    const grouped = new Map<
      string,
      {
        id: string;
        capability: CapabilityId;
        label: (typeof CAPABILITY_LABELS)[CapabilityId];
        output: WorkflowProfile["output"];
        inputs: Array<{
          role: string;
          label: { ja: string; en: string };
          kind: string;
          required: boolean;
          optional: boolean;
        }>;
        engines: Array<{
          preset: string;
          scope: "local" | "global";
          model_label: string;
          title: { ja: string; en: string };
          summary?: { ja: string; en: string };
          speed?: WorkflowProfile["speed"];
          default: boolean;
          recommended?: boolean;
          last_used_at?: string;
          stale: boolean;
          audio_track?: boolean;
          default_skip: string[];
          inputless: boolean;
          controls: CatalogControls;
          constraints?: WorkflowProfile["constraints"];
          inputs: Array<{
            slot: string;
            role: string;
            label: { ja: string; en: string };
            kind: string;
            required: boolean;
            optional: boolean;
            default_available: boolean;
          }>;
        }>;
      }
    >();
    const not_runnable: Array<{
      preset: string;
      title: { ja: string; en: string };
      capability: CapabilityId;
      missing: { nodes: string[]; models: string[] };
      reason?: { ja: string; en: string };
    }> = [];
    for (const status of checked.presets) {
      const found = profiles.find((value) => value?.entry.name === status.name);
      const inputReason = found && missingMainInput(found.profile);
      if (status.availability !== "ok" || !found || inputReason) {
        if (server.state === "online")
          not_runnable.push({
            preset: status.name,
            title: found?.profile.title ?? CAPABILITY_LABELS[found?.profile.capability ?? "other"],
            capability: found?.profile.capability ?? "other",
            missing: status.missing,
            ...(!found
              ? {
                  reason: localized(
                    "制作の設定を読み込めません",
                    "Creation settings could not be read",
                  ),
                }
              : {}),
            ...(inputReason ? { reason: inputReason } : {}),
          });
        continue;
      }
      if (server.state !== "online") continue;
      const { profile, entry, workflow } = found,
        preset = entry.preset!;
      const inputs = profile.inputs.map((input, index) => ({
        ...input,
        label: input.label ?? inputRoleLabel(input.role, profile.capability, index + 1),
        required:
          preset.uploads![input.slot]!.required === true ||
          !hasBakedInput(workflow, preset, input.slot),
        default_available: hasBakedInput(workflow, preset, input.slot),
        optional:
          server.state === "online" &&
          pruneOptionalInputs(
            workflow,
            [String(preset.uploads![input.slot]!.target.node_id)],
            objectInfo,
          ).skippable,
      }));
      const base = {
        preset: status.name,
        scope: entry.scope,
        model_label: profile.model_label ?? "ComfyUI",
        title: profile.title ?? CAPABILITY_LABELS[profile.capability],
        summary: profile.summary,
        speed: profile.speed,
        default: false,
        recommended: profile.source === "agent" && profile.recommended,
        last_used_at: status.last_used_at,
        stale: profile.stale,
        audio_track: profile.audio_track,
        controls: resolveProfileControls(profile, preset, workflow, objectInfo),
        constraints: profile.constraints,
        inputs,
        default_skip: [] as string[],
        inputless: false,
      };
      const add = (key: CapabilityId, engine: typeof base) => {
        let group = grouped.get(key);
        if (!group) {
          group = {
            id: key,
            capability: key,
            label: CAPABILITY_LABELS[key],
            output: profile.output,
            inputs: inputs.map(({ role, label, kind, required, optional }) => ({
              role,
              label,
              kind,
              required,
              optional,
            })),
            engines: [],
          };
          grouped.set(key, group);
        }
        if (!group.engines.some((value) => value.preset === engine.preset))
          group.engines.push(
            profile.source === "auto" && key !== profile.capability
              ? { ...engine, summary: autoProfileSummary(key, engine.model_label) }
              : engine,
          );
      };
      add(profile.capability, base);
      const main =
        profile.capability === "image_to_video"
          ? inputs.filter(
              (input) =>
                ["image", "mask", "file"].includes(input.kind) && input.role !== "audio_reference",
            )
          : profile.capability === "first_last_frame"
            ? inputs.filter((input) => ["start_frame", "end_frame"].includes(input.role))
            : profile.capability === "reference_to_video"
              ? inputs.filter(
                  (input) => input.role === "reference" && ["image", "file"].includes(input.kind),
                )
              : profile.capability === "video_to_video"
                ? inputs.filter((input) => input.role === "video_source")
                : ["image_edit", "upscale", "remove_background"].includes(profile.capability)
                  ? inputs.filter((input) => ["edit_source", "reference"].includes(input.role))
                  : [];
      if (
        main.length &&
        main.every((input) => input.optional) &&
        pruneOptionalInputs(
          workflow,
          main.map((input) => String(preset.uploads![input.slot]!.target.node_id)),
          objectInfo,
        ).skippable
      )
        add(profile.output === "video" ? "text_to_video" : "text_to_image", {
          ...base,
          inputless: true,
          default_skip: main.map((input) => input.slot),
        });
    }
    const capabilities = [...grouped.entries()]
      .map(([, group]) => {
        // Cleaned names can coincide for duplicate imports. Give each option
        // a stable display suffix without showing bookkeeping tokens.
        const titles = new Map<string, typeof group.engines>();
        for (const engine of group.engines) {
          const key = JSON.stringify([engine.title, engine.model_label, engine.speed]);
          const same = titles.get(key) ?? [];
          same.push(engine);
          titles.set(key, same);
        }
        for (const same of titles.values()) {
          if (same.length < 2) continue;
          same
            .sort((a, b) => a.preset.localeCompare(b.preset))
            .forEach((engine, index) => {
              engine.title = localized(
                `${engine.title.ja}（設定 ${index + 1}）`,
                `${engine.title.en} (Option ${index + 1})`,
              );
            });
        }
        group.engines.sort(
          (a, b) =>
            (b.last_used_at ?? "").localeCompare(a.last_used_at ?? "") ||
            Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) ||
            Number(b.speed === "normal") - Number(a.speed === "normal") ||
            a.preset.localeCompare(b.preset),
        );
        group.engines[0]!.default = true;
        group.inputs = group.engines[0]!.inputs.map(
          ({ role, label, kind, required, optional }) => ({
            role,
            label,
            kind,
            required,
            optional,
          }),
        );
        return group;
      })
      .sort(
        (a, b) =>
          ORDER.indexOf(a.capability) - ORDER.indexOf(b.capability) || a.id.localeCompare(b.id),
      );
    const unavailable = ORDER.filter(
      (capability) =>
        !grouped.has(capability) && not_runnable.some((entry) => entry.capability === capability),
    ).map((capability) => {
      const entries = not_runnable.filter((entry) => entry.capability === capability);
      const reasons: Array<{ code: string; message: { ja: string; en: string } }> = [];
      for (const [kind, ja, en] of [
        ["nodes", "必要なノードがありません", "Required nodes are missing"],
        ["models", "必要なモデルがありません", "Required models are missing"],
      ] as const) {
        const names = [...new Set(entries.flatMap((entry) => entry.missing[kind]))];
        if (names.length)
          reasons.push({
            code: `missing_${kind}`,
            message: localized(
              `${ja}: ${names[0]}${names.length > 1 ? " など" : ""}`,
              `${en}: ${names[0]}${names.length > 1 ? " and others" : ""}`,
            ),
          });
      }
      for (const entry of entries)
        if (
          entry.reason &&
          !reasons.some((reason) => JSON.stringify(reason.message) === JSON.stringify(entry.reason))
        )
          reasons.push({ code: "configuration", message: entry.reason });
      return { capability, label: CAPABILITY_LABELS[capability], reasons };
    });
    return {
      ok: true,
      server,
      capabilities,
      unavailable,
      not_runnable,
      unverified: server.state !== "online" || isStudioSnapshotStale(server.checked_at),
    };
  }
}
export type StudioCatalogResponse = Awaited<ReturnType<StudioCatalog["read"]>>;
export type CatalogEngine = StudioCatalogResponse["capabilities"][number]["engines"][number];
