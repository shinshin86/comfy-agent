import type { ProbeResult } from "./types.js";

const base = (format: string): Omit<ProbeResult, "size_bytes" | "magic"> => ({
  parsed: false,
  format,
  kind: "audio",
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

export const probeWav = (buffer: Buffer) => {
  const result = base("wav");
  if (
    buffer.length < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return result;
  }
  let offset = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === "fmt " && length >= 16 && data + 16 <= buffer.length) {
      result.channels = buffer.readUInt16LE(data + 2);
      result.sample_rate = buffer.readUInt32LE(data + 4);
      byteRate = buffer.readUInt32LE(data + 8);
      result.bits_per_sample = buffer.readUInt16LE(data + 14);
    } else if (type === "data") {
      dataSize = length;
    }
    const next = data + length + (length % 2);
    if (next <= offset) break;
    offset = next;
  }
  if (result.channels && result.sample_rate) {
    result.parsed = true;
    if (byteRate > 0 && dataSize > 0) result.duration_s = dataSize / byteRate;
  }
  return result;
};

export const probeFlac = (buffer: Buffer) => {
  const result = base("flac");
  if (buffer.length < 42 || buffer.toString("ascii", 0, 4) !== "fLaC") return result;
  let offset = 4;
  while (offset + 4 <= buffer.length) {
    const type = buffer[offset] & 0x7f;
    const last = (buffer[offset] & 0x80) !== 0;
    const length = buffer.readUIntBE(offset + 1, 3);
    const data = offset + 4;
    if (data + length > buffer.length) break;
    if (type === 0 && length >= 34) {
      const packed = buffer.readBigUInt64BE(data + 10);
      const sampleRate = Number(packed >> 44n);
      const channels = Number((packed >> 41n) & 0x7n) + 1;
      const bits = Number((packed >> 36n) & 0x1fn) + 1;
      const totalSamples = Number(packed & ((1n << 36n) - 1n));
      if (sampleRate > 0) {
        result.parsed = true;
        result.sample_rate = sampleRate;
        result.channels = channels;
        result.bits_per_sample = bits;
        if (totalSamples > 0) result.duration_s = totalSamples / sampleRate;
      }
      return result;
    }
    offset = data + length;
    if (last) break;
  }
  return result;
};

const synchsafe = (buffer: Buffer, offset: number) =>
  ((buffer[offset] & 0x7f) << 21) |
  ((buffer[offset + 1] & 0x7f) << 14) |
  ((buffer[offset + 2] & 0x7f) << 7) |
  (buffer[offset + 3] & 0x7f);

export const probeMp3 = (buffer: Buffer) => {
  const result = base("mp3");
  let offset = 0;
  if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "ID3") {
    offset = 10 + synchsafe(buffer, 6) + ((buffer[5] & 0x10) !== 0 ? 10 : 0);
  }
  const end = Math.min(buffer.length - 4, offset + 1024 * 1024);
  for (; offset <= end; offset += 1) {
    const header = buffer.readUInt32BE(offset);
    if ((header & 0xffe00000) >>> 0 !== 0xffe00000) continue;
    const version = (header >>> 19) & 0x03;
    const layer = (header >>> 17) & 0x03;
    const sampleIndex = (header >>> 10) & 0x03;
    if (version === 1 || layer === 0 || sampleIndex === 3) continue;
    const baseRates = [44100, 48000, 32000];
    const divisor = version === 3 ? 1 : version === 2 ? 2 : 4;
    result.sample_rate = baseRates[sampleIndex] / divisor;
    result.channels = ((header >>> 6) & 0x03) === 3 ? 1 : 2;
    result.parsed = true;
    return result;
  }
  return result;
};
