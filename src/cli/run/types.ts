export type RunOptions = {
  json?: boolean;
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
};

export type RunSource = "auto" | "local" | "remote" | "remote-catalog";
