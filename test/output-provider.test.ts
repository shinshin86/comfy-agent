import { describe, expect, it } from "vitest";
import { extractOutputFiles } from "../src/output/provider.js";

describe("extractOutputFiles", () => {
  it("collects images/videos/gifs/audio and dedupes", () => {
    const entry = {
      outputs: {
        "12": {
          images: [{ filename: "a.png", subfolder: "x", type: "output" }],
          videos: [{ filename: "b.mp4" }],
          audios: [{ filename: "c.wav" }],
          misc: [{ filename: "a.png", subfolder: "x", type: "output" }],
        },
        "13": {
          gifs: [{ filename: "d.gif" }],
        },
      },
    };

    const files = extractOutputFiles(entry);
    expect(files).toEqual([
      { filename: "a.png", subfolder: "x", type: "output" },
      { filename: "b.mp4" },
      { filename: "c.wav" },
      { filename: "d.gif" },
    ]);
  });

  it("returns empty when outputs are missing", () => {
    expect(extractOutputFiles({})).toEqual([]);
  });
});
