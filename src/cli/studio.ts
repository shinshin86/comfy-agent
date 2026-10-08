import { promises as fs, watch } from "node:fs";
import { spawn } from "node:child_process";
import { ZodError } from "zod";
import { t, type Language } from "../i18n/index.js";
import { CliError } from "../io/errors.js";
import { print, printJson } from "../io/output.js";
import { readResource, resourcePath } from "../io/resources.js";
import { startStudioServer } from "../studio/server.js";
import {
  ensureStudioDir,
  getRequestsFilePath,
  handledRequestIds,
  listPlans,
  listRequests,
  parseRequestLines,
  savePlan,
} from "../studio/store.js";

export type StudioServeOptions = {
  port?: string;
  host?: string;
  open?: boolean;
  lang?: string;
};

export type StudioPlanOptions = { json?: boolean };
export type StudioInboxOptions = { json?: boolean; follow?: boolean; all?: boolean };

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const explicitLanguage = (options: StudioServeOptions): Language | null => {
  const value = options.lang ?? process.env.COMFY_AGENT_LANG;
  return value === "ja" || value === "en" ? value : null;
};

const parsePort = (value: string | undefined) => {
  if (value === undefined) return 8790;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new CliError("INVALID_PARAM", t("studio.invalid_port"), 2, { port: value });
  }
  return port;
};

const openBrowser = (url: string) => {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // The URL is printed anyway; failing to open a browser is not an error.
  }
};

export const runStudioServe = async (options: StudioServeOptions) => {
  const host = options.host ?? "127.0.0.1";
  // The API can rewrite job records, so it must never be reachable from the network.
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new CliError("INVALID_PARAM", t("studio.loopback_only"), 2, { host });
  }
  let server;
  try {
    server = await startStudioServer({
      cwd: process.cwd(),
      host,
      port: parsePort(options.port),
      publicDir: resourcePath("studio", "public"),
      lang: explicitLanguage(options),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      throw new CliError(
        "PORT_IN_USE",
        t("studio.port_in_use", { port: options.port ?? "8790" }),
        2,
      );
    }
    throw error;
  }
  print(t("studio.listening", { url: server.url }));
  print(t("studio.agent_hint"));
  if (options.open) openBrowser(server.url);

  await new Promise<void>((resolve) => {
    const stop = () => {
      void server.close().then(resolve);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
};

const readPlanInput = async (file: string): Promise<unknown> => {
  const raw =
    file === "-"
      ? await new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = [];
          process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
          process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
          process.stdin.on("error", reject);
        })
      : await fs.readFile(file, "utf-8");
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new CliError("INVALID_PLAN", t("studio.plan_invalid"), 2, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

export const runStudioPlan = async (file: string, options: StudioPlanOptions) => {
  let plan;
  try {
    plan = await savePlan(process.cwd(), await readPlanInput(file));
  } catch (error) {
    if (error instanceof ZodError) {
      throw new CliError("INVALID_PLAN", t("studio.plan_invalid"), 2, { issues: error.issues });
    }
    throw error;
  }
  if (options.json) {
    printJson({ ok: true, plan });
    return;
  }
  print(t("studio.plan_saved", { id: plan.id }));
};

export const runStudioInbox = async (options: StudioInboxOptions) => {
  const cwd = process.cwd();
  if (!options.follow) {
    const handled = handledRequestIds(await listPlans(cwd));
    const requests = (await listRequests(cwd)).filter(
      (request) => options.all || !handled.has(request.id),
    );
    if (options.json) {
      printJson({ ok: true, requests });
      return;
    }
    if (requests.length === 0) {
      print(t("studio.inbox_empty"));
      return;
    }
    for (const request of requests) {
      print(`${request.id}  ${request.at}  ${request.text}`);
    }
    return;
  }

  // Follow mode prints one JSON line per new request, so an agent can stream it
  // into a live session (e.g. Claude Code's Monitor) and react without polling.
  await ensureStudioDir(cwd);
  const filePath = getRequestsFilePath(cwd);
  let offset = 0;
  try {
    offset = (await fs.stat(filePath)).size;
  } catch {
    await fs.writeFile(filePath, "", { flag: "a" });
  }
  const drain = async () => {
    const handle = await fs.open(filePath, "r");
    try {
      const { size } = await handle.stat();
      if (size < offset) offset = 0;
      if (size === offset) return;
      const buffer = Buffer.alloc(size - offset);
      await handle.read(buffer, 0, buffer.length, offset);
      const text = buffer.toString("utf-8");
      const complete = text.lastIndexOf("\n") + 1;
      offset += Buffer.byteLength(text.slice(0, complete));
      for (const request of parseRequestLines(text.slice(0, complete))) {
        print(JSON.stringify(request));
      }
    } finally {
      await handle.close();
    }
  };
  let draining = Promise.resolve();
  const schedule = () => {
    draining = draining.then(drain).catch(() => undefined);
  };
  const watcher = watch(filePath, schedule);
  // fs.watch can miss events on some filesystems; a slow poll is the safety net.
  const poll = setInterval(schedule, 2000);
  await new Promise<void>((resolve) => {
    const stop = () => {
      watcher.close();
      clearInterval(poll);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
};

export const runStudioGuide = async () => {
  print(await readResource("docs/studio.md"));
};
