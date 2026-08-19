export type RunOptions = {
  json?: boolean;
  async?: boolean;
  dryRun?: boolean;
  out?: string;
  source?: string;
  n?: string;
  seed?: string;
  seedStep?: string;
  pollIntervalMs?: string;
  timeoutSeconds?: string;
  baseUrl?: string;
  global?: boolean;
  character?: string;
  form?: string;
  characterRef?: string;
  characterPrompt?: "replace" | "prefix" | "off";
  lora?: string;
  /** commander --no-preflight sets this to false; default true */
  preflight?: boolean;
};

export type RunSource = "auto" | "local" | "remote" | "remote-catalog";
