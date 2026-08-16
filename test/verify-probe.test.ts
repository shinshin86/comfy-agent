import path from "node:path";
import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";
import { probeFile } from "../src/verify/probe.js";
import { createTmpWorkdir } from "./helpers/tmp-workdir.js";

const REAL_FIXTURE_DIR = new URL("./fixtures/verify/", import.meta.url);

const pngChunk = (type: string, data: Buffer) => {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, "ascii");
  data.copy(chunk, 8);
  return chunk;
};

export const buildPng = ({
  w,
  h,
  apngFrames = 0,
}: {
  w: number;
  h: number;
  apngFrames?: number;
}) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunks = [Buffer.from("89504e470d0a1a0a", "hex"), pngChunk("IHDR", ihdr)];
  if (apngFrames > 0) {
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(apngFrames, 0);
    chunks.push(pngChunk("acTL", actl));
    for (let index = 0; index < apngFrames; index += 1) {
      const fctl = Buffer.alloc(26);
      fctl.writeUInt32BE(index, 0);
      fctl.writeUInt32BE(w, 4);
      fctl.writeUInt32BE(h, 8);
      fctl.writeUInt16BE(1, 20);
      fctl.writeUInt16BE(10, 22);
      chunks.push(pngChunk("fcTL", fctl));
    }
  }
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
};

export const buildJpeg = (w: number, h: number) => {
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
};

const webpChunk = (type: string, data: Buffer) => {
  const chunk = Buffer.alloc(8 + data.length + (data.length % 2));
  chunk.write(type, 0, "ascii");
  chunk.writeUInt32LE(data.length, 4);
  data.copy(chunk, 8);
  return chunk;
};

export const buildWebp = ({
  w,
  h,
  anmf = [],
  lossless = false,
}: {
  w: number;
  h: number;
  anmf?: Array<{ durMs: number }>;
  lossless?: boolean;
}) => {
  const chunks: Buffer[] = [];
  if (lossless) {
    const data = Buffer.alloc(5);
    data[0] = 0x2f;
    const bits = (w - 1) | ((h - 1) << 14);
    data.writeUInt32LE(bits >>> 0, 1);
    chunks.push(webpChunk("VP8L", data));
  } else {
    const vp8x = Buffer.alloc(10);
    if (anmf.length > 0) vp8x[0] = 0x02;
    vp8x.writeUIntLE(w - 1, 4, 3);
    vp8x.writeUIntLE(h - 1, 7, 3);
    chunks.push(webpChunk("VP8X", vp8x));
  }
  if (anmf.length > 0) {
    chunks.push(webpChunk("ANIM", Buffer.alloc(6)));
    for (const frame of anmf) {
      const data = Buffer.alloc(16);
      data.writeUIntLE(frame.durMs, 12, 3);
      chunks.push(webpChunk("ANMF", data));
    }
  }
  const payload = Buffer.concat([Buffer.from("WEBP"), ...chunks]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(payload.length, 4);
  return Buffer.concat([riff, payload]);
};

export const buildGif = (w: number, h: number, delaysMs: number[]) => {
  const header = Buffer.alloc(13);
  header.write("GIF89a", 0, "ascii");
  header.writeUInt16LE(w, 6);
  header.writeUInt16LE(h, 8);
  const frames = delaysMs.map((delay) => {
    const gce = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0, 0, 0x00, 0x00]);
    gce.writeUInt16LE(Math.round(delay / 10), 4);
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(w, 5);
    descriptor.writeUInt16LE(h, 7);
    return Buffer.concat([gce, descriptor, Buffer.from([0x02, 0x02, 0x4c, 0x01, 0x00])]);
  });
  return Buffer.concat([header, ...frames, Buffer.from([0x3b])]);
};

export const buildWav = ({
  ch,
  sr,
  bits,
  samples,
}: {
  ch: number;
  sr: number;
  bits: number;
  samples: number;
}) => {
  const bytesPerSample = bits / 8;
  const dataSize = samples * ch * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(ch, 22);
  buffer.writeUInt32LE(sr, 24);
  buffer.writeUInt32LE(sr * ch * bytesPerSample, 28);
  buffer.writeUInt16LE(ch * bytesPerSample, 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
};

export const buildFlac = ({
  ch,
  sr,
  bits,
  samples,
}: {
  ch: number;
  sr: number;
  bits: number;
  samples: number;
}) => {
  const buffer = Buffer.alloc(42);
  buffer.write("fLaC", 0, "ascii");
  buffer[4] = 0x80;
  buffer.writeUIntBE(34, 5, 3);
  const packed =
    (BigInt(sr) << 44n) | (BigInt(ch - 1) << 41n) | (BigInt(bits - 1) << 36n) | BigInt(samples);
  buffer.writeBigUInt64BE(packed, 18);
  return buffer;
};

export const buildMp3 = (sampleRate = 44100, channels = 2, withId3 = false) => {
  const rateIndex = [44100, 48000, 32000].indexOf(sampleRate);
  let header = 0xffe00000 | (3 << 19) | (1 << 17) | (1 << 16) | (9 << 12) | (rateIndex << 10);
  if (channels === 1) header |= 3 << 6;
  const frame = Buffer.alloc(128);
  frame.writeUInt32BE(header >>> 0, 0);
  if (!withId3) return frame;
  return Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0, 0, 4]),
    Buffer.alloc(4),
    frame,
  ]);
};

const box = (type: string, ...parts: Buffer[]) => {
  const payload = Buffer.concat(parts);
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, "ascii");
  payload.copy(result, 8);
  return result;
};

export const buildMp4 = ({
  w,
  h,
  timescale,
  duration,
  sampleCount,
  moovAtEnd = false,
  fragmented = false,
}: {
  w: number;
  h: number;
  timescale: number;
  duration: number;
  sampleCount: number;
  moovAtEnd?: boolean;
  fragmented?: boolean;
}) => {
  const ftyp = box("ftyp", Buffer.from("isom\0\0\0\0isom", "binary"));
  const mvhdData = Buffer.alloc(20);
  mvhdData.writeUInt32BE(timescale, 12);
  mvhdData.writeUInt32BE(duration, 16);
  const tkhdData = Buffer.alloc(84);
  tkhdData.writeUInt32BE(w * 65536, 76);
  tkhdData.writeUInt32BE(h * 65536, 80);
  const mdhdData = Buffer.alloc(20);
  mdhdData.writeUInt32BE(timescale, 12);
  mdhdData.writeUInt32BE(duration, 16);
  const hdlrData = Buffer.alloc(12);
  hdlrData.write("vide", 8, "ascii");
  const sttsData = Buffer.alloc(16);
  sttsData.writeUInt32BE(1, 4);
  sttsData.writeUInt32BE(sampleCount, 8);
  sttsData.writeUInt32BE(Math.round(duration / sampleCount), 12);
  const stszData = Buffer.alloc(12);
  stszData.writeUInt32BE(sampleCount, 8);
  const stbl = box("stbl", box("stts", sttsData), box("stsz", stszData));
  const mdia = box("mdia", box("mdhd", mdhdData), box("hdlr", hdlrData), box("minf", stbl));
  const moov = box("moov", box("mvhd", mvhdData), box("trak", box("tkhd", tkhdData), mdia));
  const free = box("free", Buffer.alloc(8));
  const moof = fragmented ? box("moof", Buffer.alloc(8)) : Buffer.alloc(0);
  return moovAtEnd
    ? Buffer.concat([ftyp, free, moof, moov])
    : Buffer.concat([ftyp, moov, moof, free]);
};

const writeAndProbe = async (name: string, contents: Buffer) => {
  const tmp = await createTmpWorkdir();
  const filePath = path.join(tmp.cwd, name);
  await fs.writeFile(filePath, contents);
  return probeFile(filePath);
};

describe("pure-JS verify probes", () => {
  it("reads PNG and APNG dimensions, frames, and duration", async () => {
    await expect(writeAndProbe("still.png", buildPng({ w: 32, h: 24 }))).resolves.toMatchObject({
      parsed: true,
      kind: "image",
      format: "png",
      width: 32,
      height: 24,
    });
    await expect(
      writeAndProbe("animated.png", buildPng({ w: 64, h: 48, apngFrames: 3 })),
    ).resolves.toMatchObject({
      kind: "video",
      animated: true,
      frame_count: 3,
      duration_s: 0.3,
    });
  });

  it("uses JPEG magic even when the extension says PNG", async () => {
    await expect(writeAndProbe("wrong.png", buildJpeg(80, 60))).resolves.toMatchObject({
      parsed: true,
      format: "jpeg",
      width: 80,
      height: 60,
    });
  });

  it("reads static lossless and animated WEBP", async () => {
    await expect(
      writeAndProbe("lossless.webp", buildWebp({ w: 17, h: 9, lossless: true })),
    ).resolves.toMatchObject({ format: "webp", kind: "image", width: 17, height: 9 });
    await expect(
      writeAndProbe(
        "animated.webp",
        buildWebp({ w: 1280, h: 704, anmf: [{ durMs: 40 }, { durMs: 50 }, { durMs: 60 }] }),
      ),
    ).resolves.toMatchObject({
      kind: "video",
      animated: true,
      width: 1280,
      height: 704,
      frame_count: 3,
      duration_s: 0.15,
      fps: 20,
    });
  });

  it("reads GIF frames and accumulated delays", async () => {
    await expect(
      writeAndProbe("animated.gif", buildGif(40, 30, [100, 200])),
    ).resolves.toMatchObject({
      kind: "video",
      width: 40,
      height: 30,
      frame_count: 2,
      duration_s: 0.3,
    });
  });

  it("reads WAV and FLAC stream metadata", async () => {
    await expect(
      writeAndProbe("tone.wav", buildWav({ ch: 2, sr: 48000, bits: 16, samples: 48000 })),
    ).resolves.toMatchObject({
      format: "wav",
      channels: 2,
      sample_rate: 48000,
      bits_per_sample: 16,
      duration_s: 1,
    });
    await expect(
      writeAndProbe("tone.flac", buildFlac({ ch: 1, sr: 44100, bits: 24, samples: 88200 })),
    ).resolves.toMatchObject({
      format: "flac",
      channels: 1,
      sample_rate: 44100,
      bits_per_sample: 24,
      duration_s: 2,
    });
  });

  it("reads MP3 sample rate and channels after ID3 without estimating duration", async () => {
    await expect(writeAndProbe("tone.mp3", buildMp3(44100, 1, true))).resolves.toMatchObject({
      format: "mp3",
      channels: 1,
      sample_rate: 44100,
      duration_s: null,
    });
  });

  it("reads ISO BMFF metadata when moov is last and leaves fragmented duration unknown", async () => {
    await expect(
      writeAndProbe(
        "tail.mp4",
        buildMp4({
          w: 320,
          h: 180,
          timescale: 1000,
          duration: 2000,
          sampleCount: 50,
          moovAtEnd: true,
        }),
      ),
    ).resolves.toMatchObject({
      format: "mp4",
      kind: "video",
      width: 320,
      height: 180,
      duration_s: 2,
      frame_count: 50,
      fps: 25,
    });
    await expect(
      writeAndProbe(
        "fragmented.mp4",
        buildMp4({
          w: 64,
          h: 48,
          timescale: 1000,
          duration: 1000,
          sampleCount: 10,
          fragmented: true,
        }),
      ),
    ).resolves.toMatchObject({ parsed: true, duration_s: null });
  });

  it("returns parsed false for empty and truncated files", async () => {
    await expect(writeAndProbe("empty.bin", Buffer.alloc(0))).resolves.toMatchObject({
      parsed: false,
      size_bytes: 0,
    });
    await expect(
      writeAndProbe("cut.png", Buffer.from("89504e470d0a1a0a", "hex")),
    ).resolves.toMatchObject({
      parsed: false,
      format: "png",
    });
  });

  it("does not scan frame blocks for GIF files over 64 MiB", async () => {
    const tmp = await createTmpWorkdir();
    const filePath = path.join(tmp.cwd, "large.gif");
    await fs.writeFile(filePath, buildGif(12, 8, []));
    await fs.truncate(filePath, 64 * 1024 * 1024 + 1);
    await expect(probeFile(filePath)).resolves.toMatchObject({
      parsed: true,
      width: 12,
      height: 8,
      frame_count: null,
    });
  });

  it("reads minimal files emitted by real encoders", async () => {
    for (const name of ["1x1.png", "1x1.jpg", "1x1.webp", "1x1-lossless.webp"]) {
      const result = await probeFile(new URL(name, REAL_FIXTURE_DIR).pathname);
      expect(result, name).toMatchObject({ parsed: true, width: 1, height: 1 });
    }
  });
});
