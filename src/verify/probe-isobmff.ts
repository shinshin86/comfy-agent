import type { ProbeResult, VerifyKind } from "./types.js";

type Box = { type: string; start: number; data: number; end: number };

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

const boxes = (buffer: Buffer, start = 0, end = buffer.length): Box[] => {
  const found: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      const large = buffer.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    found.push({ type, start: offset, data: offset + header, end: offset + size });
    offset += size;
  }
  return found;
};

const child = (buffer: Buffer, parent: Box, type: string) =>
  boxes(buffer, parent.data, parent.end).find((box) => box.type === type);

const children = (buffer: Buffer, parent: Box, type: string) =>
  boxes(buffer, parent.data, parent.end).filter((box) => box.type === type);

const readFixed1616 = (buffer: Buffer, offset: number) => buffer.readUInt32BE(offset) / 65536;

const movieDuration = (buffer: Buffer, mvhd: Box) => {
  if (mvhd.data + 20 > mvhd.end) return null;
  const version = buffer[mvhd.data];
  if (version === 1) {
    if (mvhd.data + 32 > mvhd.end) return null;
    const timescale = buffer.readUInt32BE(mvhd.data + 20);
    const duration = buffer.readBigUInt64BE(mvhd.data + 24);
    return timescale > 0 ? Number(duration) / timescale : null;
  }
  const timescale = buffer.readUInt32BE(mvhd.data + 12);
  const duration = buffer.readUInt32BE(mvhd.data + 16);
  return timescale > 0 ? duration / timescale : null;
};

const mediaTimescale = (buffer: Buffer, mdhd: Box | undefined) => {
  if (!mdhd || mdhd.data + 20 > mdhd.end) return null;
  return buffer[mdhd.data] === 1
    ? mdhd.data + 24 <= mdhd.end
      ? buffer.readUInt32BE(mdhd.data + 20)
      : null
    : buffer.readUInt32BE(mdhd.data + 12);
};

const handlerType = (buffer: Buffer, hdlr: Box | undefined) =>
  hdlr && hdlr.data + 12 <= hdlr.end
    ? buffer.toString("ascii", hdlr.data + 8, hdlr.data + 12)
    : null;

const sampleCount = (buffer: Buffer, stsz: Box | undefined) =>
  stsz && stsz.data + 12 <= stsz.end ? buffer.readUInt32BE(stsz.data + 8) : null;

const timing = (buffer: Buffer, stts: Box | undefined, timescale: number | null) => {
  if (!stts || !timescale || stts.data + 8 > stts.end) return null;
  const count = buffer.readUInt32BE(stts.data + 4);
  let offset = stts.data + 8;
  let samples = 0;
  let ticks = 0;
  for (let index = 0; index < count && offset + 8 <= stts.end; index += 1) {
    const sampleCount = buffer.readUInt32BE(offset);
    samples += sampleCount;
    ticks += sampleCount * buffer.readUInt32BE(offset + 4);
    offset += 8;
  }
  return ticks > 0 ? { samples, fps: samples / (ticks / timescale) } : null;
};

const audioSampleEntry = (buffer: Buffer, stsd: Box | undefined) => {
  if (!stsd || stsd.data + 8 > stsd.end) return null;
  const count = buffer.readUInt32BE(stsd.data + 4);
  let offset = stsd.data + 8;
  for (let index = 0; index < count && offset + 36 <= stsd.end; index += 1) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (size < 36 || offset + size > stsd.end) break;
    if (type === "mp4a") {
      return {
        channels: buffer.readUInt16BE(offset + 24),
        sample_rate: buffer.readUInt32BE(offset + 32) >>> 16,
      };
    }
    offset += size;
  }
  return null;
};

export const probeIsoBmff = (buffer: Buffer) => {
  const top = boxes(buffer);
  const ftyp = top.find(({ type }) => type === "ftyp");
  const major =
    ftyp && ftyp.data + 4 <= ftyp.end ? buffer.toString("ascii", ftyp.data, ftyp.data + 4) : "";
  const format = major === "qt  " ? "mov" : "mp4";
  const result = base(format);
  const moov = top.find(({ type }) => type === "moov");
  if (!ftyp && !moov) return result;
  result.parsed = true;
  const fragmented = top.some(({ type }) => type === "moof");
  if (!moov) return result;
  const mvhd = child(buffer, moov, "mvhd");
  if (!fragmented && mvhd) result.duration_s = movieDuration(buffer, mvhd);

  let kind: VerifyKind = "unknown";
  for (const trak of children(buffer, moov, "trak")) {
    const tkhd = child(buffer, trak, "tkhd");
    const mdia = child(buffer, trak, "mdia");
    if (!mdia) continue;
    const handler = handlerType(buffer, child(buffer, mdia, "hdlr"));
    const minf = child(buffer, mdia, "minf");
    const stbl = minf ? child(buffer, minf, "stbl") : undefined;
    const stsz = stbl ? child(buffer, stbl, "stsz") : undefined;
    const stts = stbl ? child(buffer, stbl, "stts") : undefined;
    const stsd = stbl ? child(buffer, stbl, "stsd") : undefined;
    if (handler === "vide") {
      kind = "video";
      if (tkhd && tkhd.end - 8 >= tkhd.data) {
        result.width = readFixed1616(buffer, tkhd.end - 8);
        result.height = readFixed1616(buffer, tkhd.end - 4);
      }
      result.frame_count = sampleCount(buffer, stsz);
      const time = timing(buffer, stts, mediaTimescale(buffer, child(buffer, mdia, "mdhd")));
      if (time) {
        result.fps = time.fps;
        result.frame_count ??= time.samples;
      }
    } else if (handler === "soun") {
      if (kind === "unknown") kind = "audio";
      const audio = audioSampleEntry(buffer, stsd);
      if (audio) {
        result.channels = audio.channels;
        result.sample_rate = audio.sample_rate;
      }
    }
  }
  result.kind = kind;
  result.animated = kind === "video";
  return result;
};
