import http from "node:http";
import path from "node:path";
import { watch, type FSWatcher, promises as fs } from "node:fs";
import type { AddressInfo } from "node:net";
import { readGallery } from "../characters/gallery.js";
import { listCharacters, resolveCharacter } from "../characters/store.js";
import type { Language } from "../i18n/index.js";
import { readConfigSync } from "../io/config.js";
import { CliError } from "../io/errors.js";
import { getCharactersDirPath, getJobsDirPath, type WorkdirScope } from "../io/workdir.js";
import { readJob, updateJob } from "../jobs/store.js";
import { JobRecordSchema, type JobRecord } from "../jobs/types.js";
import { decideComfyBaseUrl } from "../utils/base-url.js";
import { resolveSeedTargets } from "../cli/run/args.js";
import { buildAgentPrompt, type RequestContextOutput } from "./prompt.js";
import { loadStudioPresets, type CapabilityFetcher } from "./capabilities.js";
import { StudioCatalog } from "./catalog.js";
import { readWorkflowProfile } from "./profiles.js";
import { mapComposerParams, parseGenerate, validateGenerateParams } from "./generate.js";
import { receiveUpload, resolveUpload, MAX_UPLOAD_BYTES } from "./uploads.js";
import {
  buildRerunArgs,
  buildStudioArgs,
  acceptsKind,
  buildRerunForm,
  cliLauncher,
  comfyInputFetcher,
  loadRerunPreset,
  resolveRerunInputs,
  validateRerunRequest,
  type RerunInputOverride,
  MAX_RERUN_COUNT,
  StudioRuns,
  StudioRunLimitError,
  type RunLauncher,
} from "./rerun.js";
import {
  appendRequest,
  ensureStudioDir,
  getStudioDirPath,
  handledRequestIds,
  listPlans,
  listRequests,
  StudioSelectionSchema,
  StudioRequestContextSchema,
} from "./store.js";

export type StudioServerOptions = {
  cwd: string;
  host: string;
  port: number;
  publicDir: string;
  /** Language forced by --lang / COMFY_AGENT_LANG; null lets the browser decide. */
  lang: Language | null;
  jobLimit?: number;
  /** How re-runs invoke `comfy-agent run`; tests replace it. */
  launcher?: RunLauncher;
  /** How re-runs fetch inputs from the ComfyUI server; tests replace it. */
  fetchServerInput?: (serverName: string) => Promise<Buffer>;
  capabilityFetcher?: CapabilityFetcher;
  maxUploadBytes?: number;
};

export type StudioServer = {
  url: string;
  close: () => Promise<void>;
};

const STATIC_FILES: Record<string, string> = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/style.css": "style.css",
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

const KIND_BY_EXT: Record<string, string> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".gif": "image",
  ".mp4": "video",
  ".webm": "video",
  ".mov": "video",
  ".wav": "audio",
  ".mp3": "audio",
  ".flac": "audio",
  ".ogg": "audio",
  ".m4a": "audio",
};

const MAX_BODY_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const decodePathPart = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "INVALID_PARAM", "Invalid URL encoding.");
  }
};

// The file extension wins: job records store ComfyUI's output bucket as `kind`,
// and video nodes report their mp4/webm files under "images".
const outputKind = (kind: string | undefined, filename: string) =>
  KIND_BY_EXT[path.extname(filename).toLowerCase()] ?? kind ?? "file";

const jobOutputPath = (record: JobRecord, index: number) => {
  const output = record.outputs[index];
  if (!output) return null;
  // saved_to is schema-validated as a bare basename, so this stays in output_dir.
  return path.join(record.output_dir, output.saved_to);
};

/** Tolerant loader: a single malformed record must not blank the gallery. */
const loadJobs = async (cwd: string, limit: number): Promise<JobRecord[]> => {
  const jobsDir = getJobsDirPath(cwd, "local");
  let names: string[];
  try {
    names = await fs.readdir(jobsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          const raw = JSON.parse(await fs.readFile(path.join(jobsDir, name), "utf-8")) as unknown;
          const parsed = JobRecordSchema.safeParse(raw);
          return parsed.success ? parsed.data : null;
        } catch {
          return null;
        }
      }),
  );
  return records
    .filter((record): record is JobRecord => record !== null)
    .sort((left, right) => Date.parse(right.submitted_at) - Date.parse(left.submitted_at))
    .slice(0, limit);
};

const jobView = (record: JobRecord) => ({
  job_id: record.job_id,
  preset: record.preset,
  status: record.status,
  submitted_at: record.submitted_at,
  completed_at: record.completed_at,
  duration_ms: record.duration_ms,
  base_url: record.base_url,
  source: record.source,
  seed: record.seed,
  params: record.params,
  uploads: record.uploads,
  skipped_inputs: record.skipped_inputs ?? [],
  prompt_input: record.prompt_input,
  prompt_final: record.prompt_final,
  negative_final: record.negative_final,
  character: record.character,
  favorite: record.favorite ?? false,
  tags: record.tags ?? [],
  reject_reason: record.reject_reason,
  notes: record.notes ?? [],
  error: record.error,
  verify: record.verify,
  outputs: record.outputs.map((output, index) => ({
    index,
    filename: output.filename,
    kind: outputKind(output.kind, output.saved_to),
    path: path.join(record.output_dir, output.saved_to),
    url: `/api/media/job/${encodeURIComponent(record.job_id)}/${index}`,
  })),
});

const loadCharacters = async (cwd: string) => {
  const scopes: WorkdirScope[] = ["local", "global"];
  const lists = await Promise.all(
    scopes.map(async (scope) => {
      try {
        return await listCharacters({ cwd, scope });
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const views = [];
  for (const { character, scope, path: dir } of lists.flat()) {
    // Local characters shadow global ones of the same name, as in resolveCharacter.
    if (seen.has(character.name)) continue;
    seen.add(character.name);
    let gallery: Awaited<ReturnType<typeof readGallery>>["items"] = [];
    try {
      gallery = (await readGallery(dir)).items;
    } catch {
      gallery = [];
    }
    const base = `/api/media/character/${scope}/${encodeURIComponent(character.name)}`;
    views.push({
      name: character.name,
      display_name: character.display_name,
      scope,
      appearance: character.appearance,
      style: character.style,
      tags: character.tags,
      forms: character.forms.map(({ id }) => id),
      loras: character.loras,
      references: character.references.map((reference, index) => ({
        ...reference,
        url: `${base}/ref/${index}`,
      })),
      gallery: gallery.map((item, index) => ({
        id: item.id,
        job_id: item.job_id,
        caption: item.caption,
        approved: item.approved,
        url: `${base}/gallery/${index}`,
      })),
    });
  }
  return views;
};

const buildState = async (options: StudioServerOptions, runs: StudioRuns) => {
  const { cwd } = options;
  const [records, characters, plans, requests, presets] = await Promise.all([
    loadJobs(cwd, options.jobLimit ?? 200),
    loadCharacters(cwd),
    listPlans(cwd),
    listRequests(cwd),
    loadStudioPresets(cwd),
  ]);
  const models = new Map(
    await Promise.all(
      [...new Set(records.map((record) => record.preset))].map(async (name) => {
        const entry = presets.find((preset) => preset.name === name);
        let label: string | undefined;
        if (entry?.preset) {
          try {
            label = (await readWorkflowProfile(cwd, entry.preset, entry.scope)).model_label;
          } catch {
            // A missing or invalid workflow must not hide recorded outputs.
          }
        }
        return [name, label] as const;
      }),
    ),
  );
  const handled = handledRequestIds(plans);
  // Read config relative to the studio cwd, not the process cwd.
  const connection = decideComfyBaseUrl({}, process.env, (scope) => readConfigSync(cwd, scope));
  return {
    ok: true,
    cwd,
    lang: options.lang,
    connection: { base_url: connection.value, source: connection.source },
    presets: presets.map((preset) => preset.name).sort(),
    characters,
    plans,
    requests: requests
      .map((request) => ({ ...request, handled: handled.has(request.id) }))
      .reverse(),
    jobs: records.map((record) => ({ ...jobView(record), model_label: models.get(record.preset) })),
    runs: runs.list(),
  };
};

const sendJson = (res: http.ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};

const sendFile = async (req: http.IncomingMessage, res: http.ServerResponse, filePath: string) => {
  let file;
  try {
    file = await fs.open(filePath, "r");
  } catch {
    throw new HttpError(404, "FILE_NOT_FOUND", "File not found.");
  }
  let streaming = false;
  try {
    // Stat and stream the same open file; a later deletion or symlink change
    // cannot redirect the stream to a different file.
    const stat = await file.stat();
    if (!stat.isFile()) throw new HttpError(404, "FILE_NOT_FOUND", "File not found.");
    const type = MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    let bounds: { start: number; end: number } | undefined;
    // Safari will not play <video> without byte-range support.
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      bounds = { start, end };
      res.writeHead(206, {
        "Content-Type": type,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
      });
    } else {
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
        "Cache-Control": type.startsWith("text/") ? "no-store" : "private, max-age=60",
      });
    }
    const stream = file.createReadStream(bounds);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
    streaming = true;
  } finally {
    if (!streaming) await file.close();
  }
};

const readJsonBody = async (req: http.IncomingMessage): Promise<Record<string, unknown>> => {
  if (!(req.headers["content-type"] ?? "").startsWith("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "BODY_TOO_LARGE", "Request too large.");
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new HttpError(400, "INVALID_JSON", "Body must be a JSON object.");
};

const readJobOrThrow = async (cwd: string, jobId: string) => {
  return (await readJob(jobId, cwd, "local", { fallback: false })).record;
};

// A retained re-creation input identifies a recorded slot, never an arbitrary path.
const originalInput = async (options: StudioServerOptions, jobId: string, slot: string) => {
  const record = await readJobOrThrow(options.cwd, jobId);
  const loaded = await loadRerunPreset(options.cwd, record);
  if (
    "reason" in loaded ||
    !Object.hasOwn(record.uploads, slot) ||
    !Object.hasOwn(loaded.preset.uploads ?? {}, slot)
  )
    throw new HttpError(400, "INVALID_PARAM", "Original input is unavailable.");
  const def = loaded.preset.uploads![slot]!;
  const kind =
    def.kind === "mask"
      ? "image"
      : def.kind === "file"
        ? (KIND_BY_EXT[path.extname(record.uploads[slot]!).toLowerCase()] ?? "file")
        : def.kind;
  return {
    kind,
    resolve: async () => {
      const inputs = await resolveRerunInputs(
        options.cwd,
        { ...record, uploads: { [slot]: record.uploads[slot]! } },
        loaded.preset,
        {},
        {
          outputFile: async () => null,
          fetchServerInput:
            options.fetchServerInput ??
            comfyInputFetcher(
              decideComfyBaseUrl({}, process.env, (scope) => readConfigSync(options.cwd, scope))
                .value,
            ),
        },
      );
      return inputs[slot]!;
    },
  };
};

const handleFeedback = async (cwd: string, jobId: string, body: Record<string, unknown>) => {
  const record = await readJobOrThrow(cwd, jobId);
  const patch: Parameters<typeof updateJob>[1] = {};
  if (typeof body.favorite === "boolean") patch.favorite = body.favorite;
  if (body.reject === null) {
    patch.tags = (record.tags ?? []).filter((tag) => tag !== "reject");
    patch.reject_reason = undefined;
  } else if (body.reject !== undefined) {
    const reason = typeof body.reject === "string" ? body.reject.trim() : "";
    if (!reason) throw new HttpError(400, "INVALID_PARAM", "A reject reason is required.");
    patch.tags = [...new Set([...(record.tags ?? []), "reject"])];
    patch.reject_reason = reason;
  }
  if (body.note !== undefined) {
    const text = typeof body.note === "string" ? body.note.trim() : "";
    if (!text) throw new HttpError(400, "INVALID_PARAM", "A note must not be empty.");
    patch.notes = [...(record.notes ?? []), { at: new Date().toISOString(), text }];
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "INVALID_PARAM", "Nothing to update.");
  }
  const updated = await updateJob(record.job_id, patch, cwd, "local", { fallback: false });
  return jobView(updated.record);
};

const handleRequest = async (
  options: StudioServerOptions,
  body: Record<string, unknown>,
  lang: Language,
) => {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) throw new HttpError(400, "INVALID_PARAM", "Request text is required.");
  const selected = StudioSelectionSchema.array().safeParse(body.selected ?? []);
  if (!selected.success) throw new HttpError(400, "INVALID_PARAM", "Invalid selection.");
  const character =
    typeof body.character === "string" && body.character ? body.character : undefined;

  const outputs: RequestContextOutput[] = [];
  for (const selection of selected.data) {
    const record = await readJobOrThrow(options.cwd, selection.job_id);
    const filePath = jobOutputPath(record, selection.output_index);
    if (!filePath) throw new HttpError(400, "INVALID_PARAM", "Unknown output index.");
    const output = record.outputs[selection.output_index]!;
    outputs.push({
      job_id: record.job_id,
      output_index: selection.output_index,
      preset: record.preset,
      kind: outputKind(output.kind, output.saved_to),
      path: filePath,
      prompt: record.prompt_final,
    });
  }

  const contextResult = StudioRequestContextSchema.optional().safeParse(body.context);
  if (!contextResult.success) throw new HttpError(400, "INVALID_PARAM", "Invalid request context.");
  const context = contextResult.data;
  const uploadPaths: Record<string, string> = {};
  for (const [slot, input] of Object.entries(context?.inputs ?? {})) {
    if ("upload_id" in input)
      uploadPaths[slot] = (await resolveUpload(options.cwd, input.upload_id)).path;
    else if ("input_job_id" in input)
      uploadPaths[slot] = await (
        await originalInput(options, input.input_job_id, input.input_slot)
      ).resolve();
    else if (
      !selected.data.some(
        (item) => item.job_id === input.job_id && item.output_index === input.output_index,
      )
    ) {
      const record = await readJobOrThrow(options.cwd, input.job_id);
      const file = jobOutputPath(record, input.output_index);
      if (!file) throw new HttpError(400, "INVALID_PARAM", "Unknown input output.");
      outputs.push({
        job_id: record.job_id,
        output_index: input.output_index,
        preset: record.preset,
        kind: outputKind(record.outputs[input.output_index]!.kind, file),
        path: file,
      });
    }
  }
  if (context?.source_job_id) await readJobOrThrow(options.cwd, context.source_job_id);
  const draft = { text, selected: selected.data, character, context };
  // `send: false` only previews the text for the copy button; nothing is stored.
  const request =
    body.send === true
      ? await appendRequest(options.cwd, draft)
      : { ...draft, id: "(preview)", at: new Date().toISOString() };
  return { request, prompt: buildAgentPrompt(request, outputs, lang, uploadPaths) };
};

const parseInputOverrides = (value: unknown): Record<string, RerunInputOverride> => {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "INVALID_PARAM", "inputs must be an object.");
  }
  const entries: Array<[string, RerunInputOverride]> = [];
  for (const [name, selection] of Object.entries(value as Record<string, unknown>)) {
    const parsed = StudioSelectionSchema.safeParse(selection);
    if (!parsed.success) throw new HttpError(400, "INVALID_PARAM", `Invalid input: ${name}`);
    entries.push([name, parsed.data]);
  }
  return Object.fromEntries(entries);
};

const isLoopbackHost = (hostHeader: string | undefined, port: number) => {
  if (!hostHeader) return false;
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(
    hostHeader.toLowerCase(),
  );
};

export const startStudioServer = async (options: StudioServerOptions): Promise<StudioServer> => {
  await ensureStudioDir(options.cwd);
  await fs.mkdir(getJobsDirPath(options.cwd, "local"), { recursive: true });

  const clients = new Set<http.ServerResponse>();
  const feedbackWrites = new Map<string, Promise<unknown>>();
  const runs = new StudioRuns(options.launcher ?? cliLauncher, () => notify());
  const catalog = new StudioCatalog(options.cwd, options.capabilityFetcher);
  let stateInFlight: ReturnType<typeof buildState> | null = null;
  let stateNext: ReturnType<typeof buildState> | null = null;
  const startStateRead = () => {
    stateNext = null;
    stateInFlight = buildState(options, runs).finally(() => {
      stateInFlight = null;
    });
    return stateInFlight;
  };
  const readState = () => {
    if (stateNext) return stateNext;
    if (!stateInFlight) return startStateRead();
    // Never share a read that started before the request arrived. Requests
    // waiting on an active read share the next one, even if the active read fails.
    stateNext = stateInFlight.then(startStateRead, startStateRead);
    return stateNext;
  };
  let boundPort = options.port;

  const server = http.createServer(async (req, res) => {
    try {
      // Reject DNS-rebinding style requests: only loopback Host headers are served.
      if (!isLoopbackHost(req.headers.host, boundPort)) {
        throw new HttpError(403, "FORBIDDEN_HOST", "Studio only answers loopback requests.");
      }
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const method = req.method ?? "GET";

      if (method !== "GET" && method !== "HEAD") {
        const origin = req.headers.origin;
        if (origin && !isLoopbackHost(origin.replace(/^https?:\/\//, ""), boundPort)) {
          throw new HttpError(403, "FORBIDDEN_ORIGIN", "Cross-origin writes are not allowed.");
        }
      }

      const staticFile = STATIC_FILES[url.pathname];
      if (staticFile && method === "GET") {
        await sendFile(req, res, path.join(options.publicDir, staticFile));
        return;
      }

      if (url.pathname === "/api/state" && method === "GET") {
        sendJson(res, 200, await readState());
        return;
      }

      if (url.pathname === "/api/capabilities" && method === "GET") {
        sendJson(
          res,
          200,
          await catalog.probe.read(
            await loadJobs(options.cwd, options.jobLimit ?? 200),
            url.searchParams.get("refresh") === "1",
          ),
        );
        return;
      }

      if (url.pathname === "/api/catalog" && method === "GET") {
        sendJson(
          res,
          200,
          await catalog.read(
            await loadJobs(options.cwd, options.jobLimit ?? 200),
            url.searchParams.get("refresh") === "1",
          ),
        );
        return;
      }

      if (url.pathname === "/api/uploads" && method === "POST") {
        sendJson(res, 200, {
          ok: true,
          ...(await receiveUpload(options.cwd, req, options.maxUploadBytes ?? MAX_UPLOAD_BYTES)),
        });
        return;
      }
      const uploadMedia = /^\/api\/media\/upload\/([^/]+)$/.exec(url.pathname);
      if (uploadMedia && method === "GET") {
        await sendFile(
          req,
          res,
          (await resolveUpload(options.cwd, decodePathPart(uploadMedia[1]!))).path,
        );
        return;
      }

      if (url.pathname === "/api/generate" && method === "POST") {
        const body = parseGenerate(await readJsonBody(req));
        let defaultSkip: string[] = [];
        let requestedParams = body.params;
        if (body.capability) {
          const current = await catalog.read(await loadJobs(options.cwd, options.jobLimit ?? 200));
          const engine = current.capabilities
            .find((capability) => capability.id === body.capability)
            ?.engines.find((engine) => engine.preset === body.preset);
          if (!engine)
            throw new HttpError(
              400,
              "INVALID_PARAM",
              "This creation is not available on the connected ComfyUI.",
            );
          requestedParams = mapComposerParams(body, engine);
          defaultSkip = engine.default_skip;
        }
        const loaded = (await loadStudioPresets(options.cwd)).find(
          (entry) => entry.name === body.preset,
        );
        if (!loaded?.preset)
          throw new HttpError(400, "INVALID_PARAM", "Preset is missing or invalid.");
        const preset = loaded.preset;
        const source = body.source_job_id
          ? await readJobOrThrow(options.cwd, body.source_job_id)
          : undefined;
        const skip = [...new Set(body.skip ?? source?.skipped_inputs ?? defaultSkip)];
        const pruned = skip.length ? await catalog.validateSkip(preset, loaded.scope, skip) : null;
        const liveNodes = pruned ? new Set(Object.keys(pruned)) : undefined;
        for (const slot of skip)
          if (Object.hasOwn(body.inputs, slot))
            throw new HttpError(
              400,
              "INVALID_PARAM",
              `Input ${slot} cannot be supplied and skipped together.`,
            );
        if (
          source &&
          (source.source !== "local" ||
            source.preset !== body.preset ||
            source.scope !== loaded.scope)
        ) {
          throw new HttpError(
            400,
            "INVALID_PARAM",
            "Source job cannot be replayed with this preset.",
          );
        }
        const seedNames = new Set(resolveSeedTargets(preset).map(({ param }) => param));
        const params = {
          ...Object.fromEntries(
            Object.entries(source?.params ?? {}).filter(
              ([name]) => Object.hasOwn(preset.parameters ?? {}, name) && !seedNames.has(name),
            ),
          ),
          ...requestedParams,
        };
        validateGenerateParams(preset, params, liveNodes);
        const inputs: Record<string, string> = {};
        const originals: Record<string, Awaited<ReturnType<typeof originalInput>>> = {};
        for (const [slot, input] of Object.entries(body.inputs)) {
          const def = Object.hasOwn(preset.uploads ?? {}, slot) ? preset.uploads![slot] : undefined;
          if (!def) throw new HttpError(400, "INVALID_PARAM", `Unknown input: ${slot}`);
          let file: { path: string; kind: string };
          if ("upload_id" in input) file = await resolveUpload(options.cwd, input.upload_id);
          else if ("input_job_id" in input) {
            const original = await originalInput(options, input.input_job_id, input.input_slot);
            if (!acceptsKind(def.kind, original.kind))
              throw new HttpError(400, "INVALID_PARAM", `Input ${slot} needs ${def.kind}.`);
            originals[slot] = original;
            continue;
          } else {
            const record = await readJobOrThrow(options.cwd, input.job_id);
            const output = record.outputs[input.output_index];
            const target = jobOutputPath(record, input.output_index);
            if (!output || !target) throw new HttpError(400, "INVALID_PARAM", "Unknown output.");
            file = { path: target, kind: outputKind(output.kind, output.saved_to) };
            try {
              if (!(await fs.stat(file.path)).isFile()) throw new Error();
            } catch {
              throw new HttpError(400, "INVALID_PARAM", "Input file is missing.");
            }
          }
          if (!acceptsKind(def.kind, file.kind))
            throw new HttpError(400, "INVALID_PARAM", `Input ${slot} needs ${def.kind}.`);
          inputs[slot] = file.path;
        }
        for (const [slot, def] of Object.entries(preset.uploads ?? {})) {
          if (skip.includes(slot) || (pruned && !Object.hasOwn(pruned, String(def.target.node_id))))
            continue;
          if (def.required && !inputs[slot] && !originals[slot] && !source?.uploads[slot])
            throw new HttpError(400, "INVALID_PARAM", `Input is required: ${slot}`);
        }
        const prepare = async () => {
          for (const [slot, original] of Object.entries(originals))
            inputs[slot] = await original.resolve();
          if (source) {
            // Resolve original inputs only for slots the user did not replace.
            const pending = {
              ...source,
              uploads: Object.fromEntries(
                Object.entries(source.uploads).filter(
                  ([slot]) =>
                    !Object.hasOwn(inputs, slot) &&
                    !skip.includes(slot) &&
                    (!liveNodes ||
                      !preset.uploads?.[slot] ||
                      liveNodes.has(String(preset.uploads[slot]!.target.node_id))),
                ),
              ),
            };
            Object.assign(
              inputs,
              await resolveRerunInputs(
                options.cwd,
                pending,
                preset,
                {},
                {
                  outputFile: async () => null,
                  fetchServerInput:
                    options.fetchServerInput ??
                    comfyInputFetcher(
                      decideComfyBaseUrl({}, process.env, (scope) =>
                        readConfigSync(options.cwd, scope),
                      ).value,
                    ),
                },
              ),
            );
          }
          return buildStudioArgs(
            body.preset,
            loaded.scope,
            preset,
            params,
            inputs,
            body.count,
            body.seed,
            body.lang ?? options.lang ?? undefined,
            skip,
            liveNodes,
          );
        };
        sendJson(res, 200, {
          ok: true,
          run: runs.start(
            options.cwd,
            { job_id: source?.job_id ?? "", preset: body.preset },
            prepare,
            body.count,
          ),
        });
        return;
      }

      if (url.pathname === "/api/events" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        res.write("retry: 2000\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }

      const jobMedia = /^\/api\/media\/job\/([^/]+)\/(\d+)$/.exec(url.pathname);
      if (jobMedia && method === "GET") {
        const record = await readJobOrThrow(options.cwd, decodePathPart(jobMedia[1]!));
        const filePath = jobOutputPath(record, Number(jobMedia[2]));
        if (!filePath) throw new HttpError(404, "FILE_NOT_FOUND", "Unknown output.");
        await sendFile(req, res, filePath);
        return;
      }

      const inputMedia = /^\/api\/media\/input\/([^/]+)\/([^/]+)$/.exec(url.pathname);
      if (inputMedia && method === "GET") {
        const record = await readJobOrThrow(options.cwd, decodePathPart(inputMedia[1]!));
        // Only files recorded by `run` as upload sources are served.
        const name = decodePathPart(inputMedia[2]!);
        const filePath =
          record.upload_sources && Object.hasOwn(record.upload_sources, name)
            ? record.upload_sources[name]
            : undefined;
        if (!filePath) throw new HttpError(404, "FILE_NOT_FOUND", "Unknown input.");
        await sendFile(req, res, filePath);
        return;
      }

      const characterMedia =
        /^\/api\/media\/character\/(local|global)\/([^/]+)\/(ref|gallery)\/(\d+)$/.exec(
          url.pathname,
        );
      if (characterMedia && method === "GET") {
        const [, scope, name, kind, index] = characterMedia;
        const characterName = decodePathPart(name!);
        let resolved;
        try {
          resolved = await resolveCharacter(characterName, {
            cwd: options.cwd,
            scope: scope as WorkdirScope,
          });
        } catch {
          throw new HttpError(404, "CHARACTER_NOT_FOUND", "Character not found.");
        }
        // Reference and gallery paths are schema-validated relative paths under refs/ or gallery/.
        const relative =
          kind === "ref"
            ? resolved.character.references[Number(index)]?.file
            : (await readGallery(resolved.path)).items[Number(index)]?.file;
        if (!relative) throw new HttpError(404, "FILE_NOT_FOUND", "Unknown file.");
        await sendFile(req, res, path.join(resolved.path, relative));
        return;
      }

      const rerun = /^\/api\/jobs\/([^/]+)\/rerun$/.exec(url.pathname);
      if (rerun && (method === "GET" || method === "POST")) {
        const record = await readJobOrThrow(options.cwd, decodePathPart(rerun[1]!));
        const loaded = await loadRerunPreset(options.cwd, record);
        if (method === "GET") {
          sendJson(res, 200, {
            ok: true,
            form:
              "preset" in loaded
                ? await buildRerunForm(record, loaded.preset)
                : { supported: false, reason: loaded.reason },
          });
          return;
        }
        if (!("preset" in loaded)) {
          throw new HttpError(
            400,
            "RERUN_UNSUPPORTED",
            `Re-run is not supported: ${loaded.reason}`,
          );
        }
        const body = await readJsonBody(req);
        const count = typeof body.count === "number" ? body.count : 1;
        if (!Number.isInteger(count) || count < 1 || count > MAX_RERUN_COUNT) {
          throw new HttpError(400, "INVALID_PARAM", `count must be 1-${MAX_RERUN_COUNT}.`);
        }
        const overrides =
          body.overrides && typeof body.overrides === "object" && !Array.isArray(body.overrides)
            ? (body.overrides as Record<string, unknown>)
            : {};
        const inputOverrides = parseInputOverrides(body.inputs);
        if (
          body.skip !== undefined &&
          (!Array.isArray(body.skip) ||
            !body.skip.every((slot) => typeof slot === "string" && slot))
        )
          throw new HttpError(400, "INVALID_PARAM", "Invalid skipped inputs.");
        const skip = [
          ...new Set((body.skip as string[] | undefined) ?? record.skipped_inputs ?? []),
        ];
        const pruned = skip.length
          ? await catalog.validateSkip(loaded.preset, record.scope, skip)
          : null;
        const liveNodes = pruned ? new Set(Object.keys(pruned)) : undefined;
        if (skip.some((slot) => Object.hasOwn(inputOverrides, slot)))
          throw new HttpError(
            400,
            "INVALID_PARAM",
            "An input cannot be supplied and skipped together.",
          );
        const request = {
          overrides,
          seed: body.seed === "same" ? ("same" as const) : ("new" as const),
          count,
          skip,
          liveNodes,
          lang: body.lang === "ja" || body.lang === "en" ? body.lang : (options.lang ?? undefined),
        };
        const preset = loaded.preset;
        // Validate edits and input names now so mistakes come back as 400s;
        // resolving (and possibly downloading) input files happens in the run.
        try {
          validateRerunRequest(record, preset, overrides, inputOverrides);
        } catch (error) {
          throw new HttpError(
            400,
            "INVALID_PARAM",
            error instanceof Error ? error.message : String(error),
          );
        }
        const prepare = async () => {
          const pending = {
            ...record,
            uploads: Object.fromEntries(
              Object.entries(record.uploads).filter(
                ([slot]) =>
                  !skip.includes(slot) &&
                  (!liveNodes ||
                    !preset.uploads?.[slot] ||
                    liveNodes.has(String(preset.uploads[slot]!.target.node_id))),
              ),
            ),
          };
          const inputs = await resolveRerunInputs(options.cwd, pending, preset, inputOverrides, {
            outputFile: async (selection) => {
              const source = await readJobOrThrow(options.cwd, selection.job_id);
              const filePath = jobOutputPath(source, selection.output_index);
              const output = source.outputs[selection.output_index];
              if (!filePath || !output) return null;
              return { path: filePath, kind: outputKind(output.kind, output.saved_to) };
            },
            fetchServerInput: (serverName) =>
              options.fetchServerInput
                ? options.fetchServerInput(serverName)
                : comfyInputFetcher(
                    decideComfyBaseUrl({}, process.env, (scope) =>
                      readConfigSync(options.cwd, scope),
                    ).value,
                  )(serverName),
          });
          return buildRerunArgs(record, preset, { ...request, inputs });
        };
        sendJson(res, 200, { ok: true, run: runs.start(options.cwd, record, prepare, count) });
        return;
      }

      const feedback = /^\/api\/jobs\/([^/]+)\/feedback$/.exec(url.pathname);
      if (feedback && method === "POST") {
        const body = await readJsonBody(req);
        const record = await readJobOrThrow(options.cwd, decodePathPart(feedback[1]!));
        // Feedback for one record must see the preceding write, including prefix routes.
        const previous = feedbackWrites.get(record.job_id) ?? Promise.resolve();
        const write = previous
          .catch(() => undefined)
          .then(() => handleFeedback(options.cwd, record.job_id, body));
        feedbackWrites.set(record.job_id, write);
        let job;
        try {
          job = await write;
        } finally {
          if (feedbackWrites.get(record.job_id) === write) feedbackWrites.delete(record.job_id);
        }
        sendJson(res, 200, {
          ok: true,
          job,
        });
        return;
      }

      if (url.pathname === "/api/requests" && method === "POST") {
        const body = await readJsonBody(req);
        const lang: Language =
          body.lang === "en" ? "en" : body.lang === "ja" ? "ja" : (options.lang ?? "en");
        sendJson(res, 200, { ok: true, ...(await handleRequest(options, body, lang)) });
        return;
      }

      throw new HttpError(404, "NOT_FOUND", "Not found.");
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof StudioRunLimitError) {
        sendJson(res, 429, {
          ok: false,
          error: { code: "RUN_LIMIT_REACHED", message: error.message },
        });
        return;
      }
      if (error instanceof CliError) {
        const statuses: Record<string, number> = {
          JOB_NOT_FOUND: 404,
          JOB_AMBIGUOUS_ID: 409,
          INVALID_JOB_RECORD: 409,
          INVALID_PARAM: 400,
          UNKNOWN_INPUT_SLOT: 400,
          INPUT_NOT_SKIPPABLE: 400,
          FILE_NOT_FOUND: 404,
          UNSUPPORTED_MEDIA_TYPE: 415,
          BODY_TOO_LARGE: 413,
        };
        sendJson(res, statuses[error.code] ?? 500, {
          ok: false,
          error: { code: error.code, message: error.message },
        });
        return;
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, {
          ok: false,
          error: { code: error.code, message: error.message },
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 500, { ok: false, error: { code: "INTERNAL", message } });
    }
  });

  // Push a single "changed" event per burst of file writes; clients refetch /api/state.
  let pending: NodeJS.Timeout | null = null;
  const notify = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      for (const client of clients) client.write("event: changed\ndata: {}\n\n");
    }, 250);
  };
  const watchers: FSWatcher[] = [];
  const watchDir = (dir: string, recursive: boolean) => {
    try {
      const watcher = watch(dir, { recursive }, notify);
      watcher.on("error", () => watcher.close());
      watchers.push(watcher);
    } catch {
      // Watching is best-effort; the UI also refetches on focus.
    }
  };
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  boundPort = (server.address() as AddressInfo).port;
  // Do not leave timers or watchers alive if binding the port fails.
  watchDir(getJobsDirPath(options.cwd, "local"), false);
  watchDir(getStudioDirPath(options.cwd), true);
  watchDir(getCharactersDirPath(options.cwd, "local"), true);
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": ping\n\n");
  }, 25_000);
  const displayHost = options.host.includes(":") ? `[${options.host}]` : options.host;

  return {
    url: `http://${displayHost}:${boundPort}/`,
    close: async () => {
      clearInterval(heartbeat);
      if (pending) clearTimeout(pending);
      for (const watcher of watchers) watcher.close();
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};
