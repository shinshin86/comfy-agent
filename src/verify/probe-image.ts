import type { ProbeResult } from "./types.js";

const base = (format: string): Omit<ProbeResult, "size_bytes" | "magic"> => ({
  parsed: false,
  format,
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
});

const readUInt24LE = (buffer: Buffer, offset: number) =>
  buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

export const probePng = (buffer: Buffer) => {
  const result = base("png");
  if (buffer.length < 24) return result;
  result.parsed = true;
  result.kind = "image";
  result.width = buffer.readUInt32BE(16);
  result.height = buffer.readUInt32BE(20);

  let offset = 8;
  let durationMs = 0;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = offset + 8;
    if (data + length + 4 > buffer.length) break;
    if (type === "acTL" && length >= 8) {
      result.animated = true;
      result.kind = "video";
      result.frame_count = buffer.readUInt32BE(data);
    } else if (type === "fcTL" && length >= 26) {
      const numerator = buffer.readUInt16BE(data + 20);
      const denominator = buffer.readUInt16BE(data + 22) || 100;
      durationMs += (numerator / denominator) * 1000;
    }
    offset = data + length + 4;
    if (type === "IEND") break;
  }
  if (result.animated && durationMs > 0) {
    result.duration_s = durationMs / 1000;
    if (result.frame_count) result.fps = result.frame_count / result.duration_s;
  }
  return result;
};

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2]);

export const probeJpeg = (buffer: Buffer) => {
  const result = base("jpeg");
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return result;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    while (offset < buffer.length && buffer[offset] !== 0xff) offset += 1;
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (SOF_MARKERS.has(marker) && length >= 7) {
      result.parsed = true;
      result.kind = "image";
      result.height = buffer.readUInt16BE(offset + 3);
      result.width = buffer.readUInt16BE(offset + 5);
      return result;
    }
    offset += length;
  }
  return result;
};

export const probeWebp = (buffer: Buffer) => {
  const result = base("webp");
  if (
    buffer.length < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return result;
  }

  let offset = 12;
  let durationMs = 0;
  let frames = 0;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + length > buffer.length) break;
    if (type === "VP8X" && length >= 10) {
      result.width = readUInt24LE(buffer, data + 4) + 1;
      result.height = readUInt24LE(buffer, data + 7) + 1;
      if ((buffer[data] & 0x02) !== 0) result.animated = true;
    } else if (type === "VP8 " && length >= 10) {
      if (buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
        result.width = buffer.readUInt16LE(data + 6) & 0x3fff;
        result.height = buffer.readUInt16LE(data + 8) & 0x3fff;
      }
    } else if (type === "VP8L" && length >= 5 && buffer[data] === 0x2f) {
      const bits = buffer.readUInt32LE(data + 1);
      result.width = (bits & 0x3fff) + 1;
      result.height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (type === "ANIM") {
      result.animated = true;
    } else if (type === "ANMF" && length >= 16) {
      result.animated = true;
      frames += 1;
      durationMs += readUInt24LE(buffer, data + 12);
    }
    offset = data + length + (length % 2);
  }

  if (result.width !== null && result.height !== null) {
    result.parsed = true;
    result.kind = result.animated ? "video" : "image";
    result.frame_count = result.animated ? frames || null : 1;
    if (durationMs > 0) {
      result.duration_s = durationMs / 1000;
      if (frames > 0) result.fps = frames / result.duration_s;
    }
  }
  return result;
};

const skipSubBlocks = (buffer: Buffer, start: number) => {
  let offset = start;
  while (offset < buffer.length) {
    const size = buffer[offset];
    offset += 1;
    if (size === 0) return offset;
    if (offset + size > buffer.length) return buffer.length;
    offset += size;
  }
  return offset;
};

export const probeGif = (buffer: Buffer, scanFrames = true) => {
  const result = base("gif");
  if (
    buffer.length < 13 ||
    (buffer.toString("ascii", 0, 6) !== "GIF87a" && buffer.toString("ascii", 0, 6) !== "GIF89a")
  ) {
    return result;
  }
  result.parsed = true;
  result.kind = "image";
  result.width = buffer.readUInt16LE(6);
  result.height = buffer.readUInt16LE(8);
  if (!scanFrames) return result;

  const packed = buffer[10];
  let offset = 13;
  if ((packed & 0x80) !== 0) offset += 3 * 2 ** ((packed & 0x07) + 1);
  let frames = 0;
  let durationMs = 0;
  let pendingDelayMs = 0;
  while (offset < buffer.length) {
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0x3b) break;
    if (marker === 0x21) {
      if (offset >= buffer.length) break;
      const label = buffer[offset];
      offset += 1;
      if (label === 0xf9 && offset + 6 <= buffer.length && buffer[offset] === 4) {
        pendingDelayMs = buffer.readUInt16LE(offset + 2) * 10;
      }
      offset = skipSubBlocks(buffer, offset);
      continue;
    }
    if (marker !== 0x2c || offset + 9 > buffer.length) break;
    const imagePacked = buffer[offset + 8];
    offset += 9;
    if ((imagePacked & 0x80) !== 0) offset += 3 * 2 ** ((imagePacked & 0x07) + 1);
    if (offset >= buffer.length) break;
    offset += 1;
    offset = skipSubBlocks(buffer, offset);
    frames += 1;
    durationMs += pendingDelayMs;
    pendingDelayMs = 0;
  }
  result.frame_count = frames || null;
  result.animated = frames >= 2;
  result.kind = result.animated ? "video" : "image";
  if (durationMs > 0) {
    result.duration_s = durationMs / 1000;
    result.fps = frames / result.duration_s;
  }
  return result;
};
