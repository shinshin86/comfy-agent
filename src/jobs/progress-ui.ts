import { t } from "../i18n/index.js";
import { log } from "../io/output.js";
import type { ProgressEventRecord } from "../api/progress.js";

export const formatProgressEvent = (event: ProgressEventRecord) => {
  if (event.kind === "channel_connected") return t("run.progress.channel_connected");
  if (event.kind === "channel_unavailable") return t("run.progress.channel_unavailable");
  if (event.kind === "channel_lost") return t("run.progress.channel_lost");
  if (event.kind === "execution_start") return t("run.progress.execution_start");
  if (event.kind === "execution_interrupted") return t("run.progress.execution_interrupted");
  if (event.kind === "execution_error") {
    return t("run.progress.execution_error", {
      node: event.node ?? "-",
      message: event.message ?? "-",
    });
  }
  if (event.kind === "execution_cached") {
    return t("run.progress.execution_cached", { node: event.node ?? "-" });
  }
  if (event.kind === "executing") {
    return t("run.progress.executing", { node: event.node ?? "-" });
  }
  if (event.kind === "executed") {
    return t("run.progress.executed", { node: event.node ?? "-" });
  }
  if (event.kind === "progress") {
    return t("run.progress.progress", {
      node: event.node ?? "-",
      value: event.value ?? 0,
      max: event.max ?? 0,
      percent: event.percent?.toFixed(2) ?? "-",
    });
  }
  return `progress: ${event.kind}`;
};

export type ProgressUi = {
  onEvent: (event: ProgressEventRecord) => void;
  finish: () => void;
};

export const createProgressUi = (enabled: boolean): ProgressUi => {
  if (!enabled) {
    return {
      onEvent: () => {},
      finish: () => {},
    };
  }

  if (!process.stderr.isTTY) {
    return {
      onEvent: (event) => {
        log(formatProgressEvent(event));
      },
      finish: () => {},
    };
  }

  let hasRendered = false;
  let latestNode = "-";

  const bar = (percent: number, width = 24) => {
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped / 100) * width);
    return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
  };

  const draw = (line: string) => {
    process.stderr.write(`\r\x1b[2K${line}`);
    hasRendered = true;
  };

  const flushLine = () => {
    if (!hasRendered) return;
    process.stderr.write("\n");
    hasRendered = false;
  };

  return {
    onEvent: (event) => {
      if (event.node) latestNode = event.node;

      if (event.kind === "progress" && event.percent !== undefined) {
        draw(`Progress ${bar(event.percent)} ${event.percent.toFixed(1)}% (node: ${latestNode})`);
        return;
      }
      if (event.kind === "executing") {
        draw(`Progress running... (node: ${latestNode})`);
        return;
      }
      if (event.kind === "execution_start") {
        draw("Progress started...");
        return;
      }
      if (event.kind === "execution_cached") {
        draw(`Progress using cache... (node: ${latestNode})`);
        return;
      }

      if (
        event.kind === "channel_connected" ||
        event.kind === "channel_unavailable" ||
        event.kind === "channel_lost" ||
        event.kind === "execution_error" ||
        event.kind === "execution_interrupted" ||
        event.kind === "executed"
      ) {
        flushLine();
        log(formatProgressEvent(event));
      }
    },
    finish: flushLine,
  };
};
