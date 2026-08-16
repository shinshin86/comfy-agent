import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach } from "vitest";

export type TmpWorkdir = {
  root: string;
  cwd: string;
  home: string;
  workdir: string;
};

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const roots = new Set<string>();
const subdirs = ["workflows", "presets", "outputs", "cache"];

export const createTmpWorkdir = async (): Promise<TmpWorkdir> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "comfy-agent-test-"));
  const cwd = path.join(root, "work");
  const home = path.join(root, "home");
  const workdir = path.join(cwd, ".comfy-agent");
  await Promise.all([
    fs.mkdir(home, { recursive: true }),
    ...subdirs.map((subdir) => fs.mkdir(path.join(workdir, subdir), { recursive: true })),
  ]);
  roots.add(root);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return { root, cwd, home, workdir };
};

afterEach(async () => {
  await Promise.all([...roots].map((root) => fs.rm(root, { recursive: true, force: true })));
  roots.clear();
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
});
