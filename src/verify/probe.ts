import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { probeFlac, probeMp3, probeWav } from "./probe-audio.js";
import { probeGif, probeJpeg, probePng, probeWebp } from "./probe-image.js";
import { probeIsoBmff } from "./probe-isobmff.js";
import type { ProbeResult } from "./types.js";

const MAX_SCAN_BYTES = 64 * 1024 * 1024;

const unknown = (size: number, magic: string): ProbeResult => ({
  parsed: false,
  format: "unknown",
  kind: "unknown",
  animated: false,
  width: null,
  height: null,
  duration_s: null,
  fps: null,
  frame_count: null,
  channels: null,
  sample_rate: null,
  bits_per_sample: null,
  size_bytes: size,
  magic,
});

const withFileFields = (
  parsed: Omit<ProbeResult, "size_bytes" | "magic">,
  size: number,
  magic: string,
): ProbeResult => ({ ...parsed, size_bytes: size, magic });

const isIsoBmff = (buffer: Buffer) =>
  buffer.length >= 8 && ["ftyp", "moov", "free", "wide"].includes(buffer.toString("ascii", 4, 8));

export const probeBuffer = (buffer: Buffer, size = buffer.length, scanGifFrames = true) => {
  const magic = buffer.subarray(0, 16).toString("hex");
  let parsed: Omit<ProbeResult, "size_bytes" | "magic"> | null = null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    parsed = probePng(buffer);
  } else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    parsed = probeJpeg(buffer);
  } else if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF") {
    const type = buffer.toString("ascii", 8, 12);
    if (type === "WEBP") parsed = probeWebp(buffer);
    else if (type === "WAVE") parsed = probeWav(buffer);
  } else if (buffer.length >= 6 && buffer.toString("ascii", 0, 3) === "GIF") {
    parsed = probeGif(buffer, scanGifFrames);
  } else if (buffer.length >= 4 && buffer.toString("ascii", 0, 4) === "fLaC") {
    parsed = probeFlac(buffer);
  } else if (
    (buffer.length >= 3 && buffer.toString("ascii", 0, 3) === "ID3") ||
    (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
  ) {
    parsed = probeMp3(buffer);
  } else if (isIsoBmff(buffer)) {
    parsed = probeIsoBmff(buffer);
  }
  return parsed ? withFileFields(parsed, size, magic) : unknown(size, magic);
};

const readRange = async (handle: FileHandle, offset: number, length: number) => {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buffer, 0, length, offset);
  return buffer.subarray(0, bytesRead);
};

const readIsoBmffSections = async (filePath: string, size: number) => {
  const handle = await fs.open(filePath, "r");
  try {
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset + 8 <= size) {
      const header = await readRange(handle, offset, 16);
      if (header.length < 8) break;
      let boxSize = header.readUInt32BE(0);
      let headerSize = 8;
      if (boxSize === 1) {
        if (header.length < 16) break;
        const large = header.readBigUInt64BE(8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) break;
        boxSize = Number(large);
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = size - offset;
      }
      if (boxSize < headerSize || offset + boxSize > size) break;
      const type = header.toString("ascii", 4, 8);
      if (["ftyp", "moov", "moof"].includes(type) && boxSize <= MAX_SCAN_BYTES) {
        chunks.push(await readRange(handle, offset, boxSize));
      }
      offset += boxSize;
    }
    return Buffer.concat(chunks);
  } finally {
    await handle.close();
  }
};

export const probeFile = async (filePath: string): Promise<ProbeResult> => {
  const stat = await fs.stat(filePath);
  const handle = await fs.open(filePath, "r");
  let header: Buffer;
  try {
    header = await readRange(handle, 0, Math.min(stat.size, 32));
  } finally {
    await handle.close();
  }
  if (isIsoBmff(header) && stat.size > MAX_SCAN_BYTES) {
    const selected = await readIsoBmffSections(filePath, stat.size);
    return probeBuffer(selected, stat.size);
  }
  const isLargeGif = stat.size > MAX_SCAN_BYTES && header.toString("ascii", 0, 3) === "GIF";
  const bytesToRead = isLargeGif ? Math.min(stat.size, 32) : Math.min(stat.size, MAX_SCAN_BYTES);
  const dataHandle = await fs.open(filePath, "r");
  let buffer: Buffer;
  try {
    buffer = await readRange(dataHandle, 0, bytesToRead);
  } finally {
    await dataHandle.close();
  }
  return probeBuffer(buffer, stat.size, !isLargeGif);
};

export const SUPPORTED_FORMATS = [
  "png",
  "jpeg",
  "webp",
  "gif",
  "mp4",
  "mov",
  "wav",
  "flac",
  "mp3",
] as const;
