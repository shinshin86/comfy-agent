import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RunCliOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

export type RunCliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST_CLI = path.join(REPO_ROOT, "dist", "cli", "index.js");
const SOURCE_CLI = path.join(REPO_ROOT, "src", "cli", "index.ts");
const TSX_CLI = path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
let staleWarningChecked = false;

const latestMtime = async (target: string): Promise<number> => {
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  const entries = await fs.readdir(target, { withFileTypes: true });
  const mtimes = await Promise.all(
    entries.map((entry) => latestMtime(path.join(target, entry.name))),
  );
  return Math.max(stat.mtimeMs, ...mtimes);
};

const assertDistReady = async () => {
  let distStat;
  try {
    distStat = await fs.stat(DIST_CLI);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("dist/cli/index.js is missing. Run `npm run build` before the smoke tests.");
    }
    throw error;
  }
  if (!distStat.isFile()) {
    throw new Error("dist/cli/index.js is not a file. Run `npm run build` before the smoke tests.");
  }

  if (!staleWarningChecked) {
    staleWarningChecked = true;
    const sourceMtime = await latestMtime(path.join(REPO_ROOT, "src"));
    if (sourceMtime > distStat.mtimeMs) {
      process.stderr.write(
        "Warning: dist CLI is older than src; run `npm run build` before smoke tests.\n",
      );
    }
  }
};

export const runCli = async (
  args: string[],
  { cwd, env = {}, timeoutMs = 20_000 }: RunCliOptions,
): Promise<RunCliResult> => {
  const entryMode = env.COMFY_AGENT_TEST_ENTRY ?? process.env.COMFY_AGENT_TEST_ENTRY;
  let command = process.execPath;
  let commandArgs = [DIST_CLI, ...args];

  if (entryMode === "tsx") {
    // Run the local tsx binary directly instead of going through `npx`, so npm's
    // own stderr chatter (warnings, `npm notice run` lines) never leaks into the
    // CLI's stderr that tests assert on.
    command = process.execPath;
    commandArgs = [TSX_CLI, SOURCE_CLI, ...args];
  } else {
    await assertDistReady();
  }

  return new Promise<RunCliResult>((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: {
        ...process.env,
        COMFY_AGENT_LANG: "en",
        NO_COLOR: "1",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) {
        reject(new Error(`CLI process was terminated by ${signal}. stderr: ${stderr}`));
        return;
      }
      resolve({ code: code ?? 3, stdout, stderr });
    });
  });
};
