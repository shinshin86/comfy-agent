import { runTool } from "../verify/ffmpeg.js";

export const SPEECH_WINDOW_SECONDS = 0.25;
export type Interval = { start: number; end: number };
export type SpeechWindow = Interval & { rms_db: number; active: boolean };
export type SpeechAnalysis = {
  status: "analyzed" | "no_audio" | "unavailable" | "failed";
  method: "band_rms";
  window_s: number;
  band_hz: [number, number];
  noise_floor_db: number | null;
  threshold_db: number | null;
  windows: SpeechWindow[];
  intervals: Interval[];
};
export const emptySpeech = (status: SpeechAnalysis["status"] = "unavailable"): SpeechAnalysis => ({
  status,
  method: "band_rms",
  window_s: SPEECH_WINDOW_SECONDS,
  band_hz: [300, 3500],
  noise_floor_db: null,
  threshold_db: null,
  windows: [],
  intervals: [],
});

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const percentile = (sorted: number[], ratio: number) =>
  sorted[Math.floor((sorted.length - 1) * ratio)];

export const analyzeSpeechWindows = (
  windows: Array<Interval & { rms_db: number }>,
): SpeechAnalysis => {
  if (!windows.length) return emptySpeech("analyzed");
  const levels = windows.map(({ rms_db }) => rms_db).sort((a, b) => a - b);
  const floor = percentile(levels, 0.2);
  // The upper cap also permits continuous speech with no quiet window. The
  // absolute floor keeps near-digital-silence from becoming an active interval.
  const threshold = Math.max(-60, Math.min(floor + 10, percentile(levels, 0.9) - 6));
  const classified = windows.map((window) => ({ ...window, active: window.rms_db >= threshold }));
  const intervals: Interval[] = [];
  for (const window of classified) {
    if (!window.active) continue;
    const previous = intervals.at(-1);
    if (previous && Math.abs(previous.end - window.start) < 1e-5) previous.end = window.end;
    else intervals.push({ start: window.start, end: window.end });
  }
  return {
    ...emptySpeech("analyzed"),
    noise_floor_db: floor,
    threshold_db: threshold,
    windows: classified,
    intervals,
  };
};

/** ffmpeg measures RMS after resampling and band-pass filtering, one frame per window. */
export const detectSpeech = async (
  file: string,
  duration: number,
  ffmpeg: string,
): Promise<SpeechAnalysis> => {
  const { stdout } = await runTool(ffmpeg, [
    "-v",
    "error",
    "-nostdin",
    "-i",
    file,
    "-map",
    "0:a:0",
    "-vn",
    "-af",
    "aresample=16000,aformat=channel_layouts=mono,asetpts=PTS-STARTPTS,highpass=f=300,lowpass=f=3500,asetnsamples=n=4000:p=0,astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=RMS_level,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level:file=-",
    "-f",
    "null",
    "-",
  ]);
  const windows: Array<Interval & { rms_db: number }> = [];
  let start: number | undefined;
  for (const line of stdout.split(/\r?\n/)) {
    const time = /pts_time:([\d.eE+-]+)/.exec(line);
    if (time) start = Number(time[1]);
    const rms = /^lavfi\.astats\.Overall\.RMS_level=(.+)$/.exec(line);
    if (rms && start !== undefined && start < duration) {
      const value = Number(rms[1]);
      windows.push({
        start: round(start),
        end: round(Math.min(duration, start + SPEECH_WINDOW_SECONDS)),
        rms_db: Number.isFinite(value) ? Math.max(-120, value) : -120,
      });
      start = undefined;
    }
  }
  if (!windows.length) throw new Error("The audio analysis returned no RMS windows.");
  return analyzeSpeechWindows(windows);
};

export const speechCutChecks = (analysis: SpeechAnalysis, cut: Interval) => {
  if (analysis.status === "failed" || analysis.status === "unavailable")
    return { warnings: [], missed_speech_s: null, suggested_cut_start: null };
  const overlap = (a: Interval, b: Interval) =>
    Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const missed = analysis.intervals.reduce(
    (sum, interval) => sum + interval.end - interval.start - overlap(interval, cut),
    0,
  );
  const warnings: string[] = [];
  if (!analysis.intervals.length) warnings.push("no_speech");
  if (
    analysis.intervals.some(
      (interval) =>
        overlap(interval, {
          start: Math.max(cut.start, cut.end - SPEECH_WINDOW_SECONDS),
          end: cut.end,
        }) > 1e-6,
    )
  )
    warnings.push("speech_cut_at_end");
  if (missed > 0.5 + 1e-6) warnings.push("cut_outside_speech");
  return {
    warnings,
    missed_speech_s: round(missed),
    suggested_cut_start: analysis.intervals.length
      ? round(Math.max(0, analysis.intervals[0].start - SPEECH_WINDOW_SECONDS))
      : null,
  };
};

export const measureLoudness = async (
  file: string,
  ffmpeg: string,
): Promise<{ mean_db: number | null; max_db: number | null }> => {
  const { stderr } = await runTool(ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-i",
    file,
    "-map",
    "0:a:0",
    "-vn",
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const level = (key: string) => {
    const match = new RegExp(`${key}_volume:\\s*([-+\\d.]+|-[Ii]nf)\\s*dB`).exec(stderr);
    const value = match ? Number(match[1]) : NaN;
    return Number.isFinite(value) ? value : null;
  };
  return { mean_db: level("mean"), max_db: level("max") };
};
