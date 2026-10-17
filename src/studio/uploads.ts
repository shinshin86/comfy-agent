import path from "node:path";
import { randomUUID } from "node:crypto";
import type http from "node:http";
import { promises as fs } from "node:fs";
import { CliError } from "../io/errors.js";
import { getStudioDirPath } from "./store.js";

const TYPES: Record<string, { ext: string; kind: string }> = {
  "image/png": { ext: "png", kind: "image" },
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "audio/wav": { ext: "wav", kind: "audio" },
  "audio/x-wav": { ext: "wav", kind: "audio" },
  "audio/mpeg": { ext: "mp3", kind: "audio" },
  "audio/flac": { ext: "flac", kind: "audio" },
  "audio/ogg": { ext: "ogg", kind: "audio" },
  "audio/mp4": { ext: "m4a", kind: "audio" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
};
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const dir = (cwd: string) => path.join(getStudioDirPath(cwd), "uploads");
const invalid = (code: string, message: string): never => {
  throw new CliError(code, message, 2);
};

export const receiveUpload = async (
  cwd: string,
  req: http.IncomingMessage,
  maxBytes = MAX_UPLOAD_BYTES,
) => {
  const type = (req.headers["content-type"] ?? "").toLowerCase().split(";")[0]!;
  const format = TYPES[type];
  if (!format) return invalid("UNSUPPORTED_MEDIA_TYPE", "Unsupported upload media type.");
  if (Number(req.headers["content-length"] ?? 0) > maxBytes)
    return invalid("BODY_TOO_LARGE", "Upload too large.");
  await fs.mkdir(dir(cwd), { recursive: true });
  const id = randomUUID();
  const target = path.join(dir(cwd), `${id}.${format.ext}`);
  const file = await fs.open(target, "wx");
  let size = 0;
  try {
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      const data = chunk as Buffer;
      size += data.length;
      if (size > maxBytes) invalid("BODY_TOO_LARGE", "Upload too large.");
      // FileHandle.write may write only part of a chunk.
      let written = 0;
      while (written < data.length)
        written += (await file.write(data, written, data.length - written)).bytesWritten;
    }
    if (!size) invalid("INVALID_PARAM", "Upload is empty.");
  } catch (error) {
    // Drain the request without retaining data so a chunked oversized body
    // still receives the JSON 413 response rather than a destroyed socket.
    req.resume();
    await file.close();
    await fs.rm(target, { force: true });
    throw error;
  }
  await file.close();
  return { upload_id: id, kind: format.kind, url: `/api/media/upload/${id}` };
};

/** IDs resolve only within Studio's upload directory; filenames are never accepted. */
export const resolveUpload = async (cwd: string, id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
    return invalid("FILE_NOT_FOUND", "Unknown upload.");
  const formats = new Map(Object.values(TYPES).map((format) => [format.ext, format.kind]));
  for (const [ext, kind] of formats) {
    const target = path.join(dir(cwd), `${id}.${ext}`);
    try {
      if ((await fs.stat(target)).isFile()) return { path: target, kind };
    } catch {
      /* Try next extension. */
    }
  }
  return invalid("FILE_NOT_FOUND", "Unknown upload.");
};
