import { describe, expect, it } from "vitest";
import { extractOutputFiles } from "../src/output/provider.js";

describe("extractOutputFiles provider kinds", () => {
  it("labels known providers and leaves unknown arrays unlabeled", () => {
    const files = extractOutputFiles({
      outputs: {
        node: {
          images: [{ filename: "image.png" }],
          videos: [{ filename: "video.mp4" }],
          gifs: [{ filename: "animation.gif" }],
          audio: [{ filename: "sound.wav" }],
          custom: [{ filename: "other.bin" }],
        },
      },
    });

    expect(files).toEqual([
      { filename: "image.png", kind: "image" },
      { filename: "video.mp4", kind: "video" },
      { filename: "animation.gif", kind: "gif" },
      { filename: "sound.wav", kind: "audio" },
      { filename: "other.bin" },
    ]);
  });
});
