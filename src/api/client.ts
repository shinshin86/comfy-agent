import { promises as fs } from "node:fs";
import path from "node:path";
import { CliError } from "../io/errors.js";
import { t } from "../i18n/index.js";
import { sleep } from "../utils/time.js";

export type UploadResponse = {
  name?: string;
  filename?: string;
  subfolder?: string;
  type?: string;
};

export class ComfyClient {
  baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getJson<T = unknown>(
    urlPath: string,
    options?: { retries?: number; retryDelayMs?: number },
  ) {
    const retries = options?.retries ?? 2;
    const delay = options?.retryDelayMs ?? 300;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await fetch(`${this.baseUrl}${urlPath}`);
        if (!res.ok) {
          if (res.status >= 500 && attempt < retries) {
            await sleep(delay);
            continue;
          }
          throw new CliError("API_ERROR", t("api.get_failed", { path: urlPath }), 3, {
            status: res.status,
          });
        }
        return (await res.json()) as T;
      } catch (err) {
        if (attempt < retries) {
          await sleep(delay);
          continue;
        }
        if (err instanceof CliError) throw err;
        throw new CliError("API_ERROR", t("api.get_network_error", { path: urlPath }), 3, {
          cause: String(err),
        });
      }
    }

    throw new CliError("API_ERROR", t("api.get_failed", { path: urlPath }), 3);
  }

  async postJson<T = unknown>(urlPath: string, body: unknown) {
    try {
      const res = await fetch(`${this.baseUrl}${urlPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new CliError("API_ERROR", t("api.post_failed", { path: urlPath }), 3, {
          status: res.status,
        });
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof CliError) throw err;
      throw new CliError("API_ERROR", t("api.post_network_error", { path: urlPath }), 3, {
        cause: String(err),
      });
    }
  }

  async uploadFile(urlPath: string, filePath: string): Promise<UploadResponse> {
    const buffer = await fs.readFile(filePath);
    const file = new File([buffer], path.basename(filePath));
    const form = new FormData();
    form.append("image", file);

    try {
      const res = await fetch(`${this.baseUrl}${urlPath}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new CliError("API_ERROR", t("api.post_failed", { path: urlPath }), 3, {
          status: res.status,
        });
      }
      return (await res.json()) as UploadResponse;
    } catch (err) {
      if (err instanceof CliError) throw err;
      throw new CliError("API_ERROR", t("api.post_network_error", { path: urlPath }), 3, {
        cause: String(err),
      });
    }
  }

  async viewFile(params: { filename: string; subfolder?: string; type?: string }) {
    const search = new URLSearchParams();
    search.set("filename", params.filename);
    if (params.subfolder) search.set("subfolder", params.subfolder);
    if (params.type) search.set("type", params.type);

    const urlPath = `/view?${search.toString()}`;

    for (let attempt = 0; attempt <= 2; attempt += 1) {
      try {
        const res = await fetch(`${this.baseUrl}${urlPath}`);
        if (!res.ok) {
          if (res.status >= 500 && attempt < 2) {
            await sleep(300);
            continue;
          }
          throw new CliError("API_ERROR", t("api.get_failed", { path: urlPath }), 3, {
            status: res.status,
          });
        }
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err) {
        if (attempt < 2) {
          await sleep(300);
          continue;
        }
        if (err instanceof CliError) throw err;
        throw new CliError("API_ERROR", t("api.get_network_error", { path: urlPath }), 3, {
          cause: String(err),
        });
      }
    }

    throw new CliError("API_ERROR", t("api.get_failed", { path: urlPath }), 3);
  }

  async prompt(
    workflow: Record<string, unknown>,
    options?: { clientId?: string; promptId?: string },
  ) {
    const body: Record<string, unknown> = { prompt: workflow };
    if (options?.clientId) {
      body.client_id = options.clientId;
    }
    if (options?.promptId) {
      body.prompt_id = options.promptId;
    }
    return this.postJson<{ prompt_id?: string }>("/prompt", body);
  }

  async history(promptId: string) {
    return this.getJson(`/history/${promptId}`, { retries: 2, retryDelayMs: 500 });
  }

  async queue() {
    return this.getJson("/queue", { retries: 1, retryDelayMs: 300 });
  }

  async objectInfo() {
    return this.getJson("/object_info", { retries: 1, retryDelayMs: 300 });
  }
}
