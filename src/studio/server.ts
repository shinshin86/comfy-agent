import http from "node:http";
import path from "node:path";
import { watch, type FSWatcher, promises as fs } from "node:fs";
import type { AddressInfo } from "node:net";
import { readGallery } from "../characters/gallery.js";
import { listCharacters, resolveCharacter } from "../characters/store.js";
import type { Language } from "../i18n/index.js";
import { readConfigSync } from "../io/config.js";
import { CliError } from "../io/errors.js";
import {
  getCharactersDirPath,
  getJobsDirPath,
  getSubdirPath,
  type WorkdirScope,
} from "../io/workdir.js";
import { readJob, updateJob } from "../jobs/store.js";
import { JobRecordSchema, type JobRecord } from "../jobs/types.js";
import { decideComfyBaseUrl } from "../utils/base-url.js";
import { buildAgentPrompt, type RequestContextOutput } from "./prompt.js";
import {
  buildRerunArgs,
  buildRerunForm,
  cliLauncher,
  comfyInputFetcher,
  loadRerunPreset,
  resolveRerunInputs,
  validateRerunRequest,
  type RerunInputOverride,
  MAX_RERUN_COUNT,
  StudioRuns,
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

const listPresetNames = async (cwd: string) => {
  const names = new Set<string>();
  for (const scope of ["local", "global"] as const) {
    try {
      for (const file of await fs.readdir(getSubdirPath("presets", cwd, scope))) {
        if (/\.ya?ml$/.test(file)) names.add(file.replace(/\.ya?ml$/, ""));
      }
    } catch {
      // A missing presets directory just means nothing is imported yet.
    }
  }
  return [...names].sort();
};

const buildState = async (options: StudioServerOptions, runs: StudioRuns) => {
  const { cwd } = options;
  const [records, characters, plans, requests, presets] = await Promise.all([
    loadJobs(cwd, options.jobLimit ?? 200),
    loadCharacters(cwd),
    listPlans(cwd),
    listRequests(cwd),
    listPresetNames(cwd),
  ]);
  const handled = handledRequestIds(plans);
  // Read config relative to the studio cwd, not the process cwd.
  const connection = decideComfyBaseUrl({}, process.env, (scope) => readConfigSync(cwd, scope));
  return {
    ok: true,
    cwd,
    lang: options.lang,
    connection: { base_url: connection.value, source: connection.source },
    presets,
    characters,
    plans,
    requests: requests
      .map((request) => ({ ...request, handled: handled.has(request.id) }))
      .reverse(),
    jobs: records.map(jobView),
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
  try {
    return (await readJob(jobId, cwd, "local")).record;
  } catch (error) {
    if (error instanceof CliError && error.code === "JOB_NOT_FOUND") {
      throw new HttpError(404, "JOB_NOT_FOUND", `Job not found: ${jobId}`);
    }
    throw error;
  }
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
  const updated = await updateJob(record.job_id, patch, cwd, "local");
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

  const draft = { text, selected: selected.data, character };
  // `send: false` only previews the text for the copy button; nothing is stored.
  const request =
    body.send === true
      ? await appendRequest(options.cwd, draft)
      : { ...draft, id: "(preview)", at: new Date().toISOString() };
  return { request, prompt: buildAgentPrompt(request, outputs, lang) };
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
  const runs = new StudioRuns(options.launcher ?? cliLauncher, () => notify());
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
        sendJson(res, 200, await buildState(options, runs));
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
        const request = {
          overrides,
          seed: body.seed === "same" ? ("same" as const) : ("new" as const),
          count,
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
          const inputs = await resolveRerunInputs(options.cwd, record, preset, inputOverrides, {
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
        sendJson(res, 200, {
          ok: true,
          job: await handleFeedback(options.cwd, decodePathPart(feedback[1]!), body),
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
  watchDir(getJobsDirPath(options.cwd, "local"), false);
  watchDir(getStudioDirPath(options.cwd), true);
  watchDir(getCharactersDirPath(options.cwd, "local"), true);
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": ping\n\n");
  }, 25_000);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  boundPort = (server.address() as AddressInfo).port;
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
