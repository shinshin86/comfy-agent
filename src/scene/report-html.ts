import type { SceneReport, ReportWarning } from "./report.js";
import type { Interval } from "./audio.js";

export const escapeHtml = (value: unknown): string =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
const number = (value: number | null | undefined, suffix = "") =>
  value === null || value === undefined ? "—" : `${value.toFixed(2)}${suffix}`;
const url = (value: string) => escapeHtml(value.split("/").map(encodeURIComponent).join("/"));
const image = (file: string | null, label: string) =>
  file
    ? `<figure><img src="${url(file)}" alt="${escapeHtml(label)}" loading="lazy"><figcaption>${escapeHtml(label)}</figcaption></figure>`
    : "";
const warnings = (items: ReportWarning[]) =>
  items.length
    ? `<ul class="warnings">${items.map((item) => `<li><code>${escapeHtml(item.code)}</code> ${escapeHtml(item.message)}</li>`).join("")}</ul>`
    : '<p class="muted">No warnings from these checks.</p>';

const timeline = (
  duration: number,
  rows: Array<{ label: string; intervals: Interval[] }>,
  cut?: Interval,
) => {
  if (!(duration > 0)) return '<p class="muted">No timing data available.</p>';
  const width = 780;
  const x = (time: number) => (Math.max(0, Math.min(duration, time)) / duration) * width;
  return `<div class="timeline" role="group" aria-label="Speech-like energy timeline">${rows
    .map((row) => {
      return `<div class="timeline-row"><span class="timeline-label">${escapeHtml(row.label)}</span><svg viewBox="0 0 ${width} 24" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(row.label)} speech-like intervals"><rect class="track" x="0" y="3" width="${width}" height="18"/>${cut ? `<rect class="cut" x="${x(cut.start)}" y="1" width="${Math.max(0, x(cut.end) - x(cut.start))}" height="22"/>` : ""}${row.intervals.map((interval) => `<rect class="speech" x="${x(interval.start)}" y="6" width="${Math.max(0, x(interval.end) - x(interval.start))}" height="12"/>`).join("")}</svg></div>`;
    })
    .join(
      "",
    )}<div class="timeline-row"><span></span><div class="timeline-scale"><span>0 s</span><span>${escapeHtml(number(duration, " s"))}</span></div></div></div>`;
};

export const renderReportHtml = (report: SceneReport): string => {
  const count = report.warning_count;
  const summary = `<section id="warnings"><h2>Warnings</h2>${
    count
      ? `<ul class="warnings">${report.all_warnings
          .map((warning) => {
            const shot = warning.scope.startsWith("shot:") ? warning.scope.slice(5) : null;
            const target =
              shot !== null ? `shot-${shot}` : warning.scope === "final" ? "final" : "report";
            const label =
              shot !== null ? `Shot ${shot}` : warning.scope === "final" ? "Final edit" : "Scene";
            return `<li><a href="#${escapeHtml(target)}">${escapeHtml(label)}</a>: <code>${escapeHtml(warning.code)}</code> ${escapeHtml(warning.message)}</li>`;
          })
          .join("")}</ul>`
      : '<p class="muted">No warnings from these checks.</p>'
  }</section>`;
  const final = report.final;
  const finalHtml = final
    ? `<section id="final"><div class="section-title"><h2>Final edit</h2><span class="badge">${escapeHtml(final.status)}</span></div>
    <div class="metrics"><div><b>${escapeHtml(number(final.metadata.duration_s, " s"))}</b><span>Duration · expected ${escapeHtml(number(final.expected_duration_s, " s"))}</span></div><div><b>${escapeHtml(final.metadata.width)} × ${escapeHtml(final.metadata.height)}</b><span>${escapeHtml(final.metadata.frame_count)} frames · ${escapeHtml(number(final.metadata.fps, " fps"))}</span></div><div><b>${escapeHtml(number(final.loudness.max_db, " dBFS"))}</b><span>Peak · mean ${escapeHtml(number(final.loudness.mean_db, " dBFS"))}</span></div><div><b>${escapeHtml(number(final.unique_frames?.ratio === null || !final.unique_frames ? null : final.unique_frames.ratio * 100, "%"))}</b><span>Distinct motion frames · expected ${escapeHtml(number(final.unique_frames?.expected_ratio === null || !final.unique_frames ? null : final.unique_frames.expected_ratio * 100, "%"))}</span></div></div>
    ${image(final.boundaries, "Frames before and after cut boundaries, plus first and last frame")}
    <p class="muted">Frame positions: ${escapeHtml(final.boundary_frames.map((frame) => `${frame.frame} (${frame.time_s.toFixed(2)}s)`).join(", "))}. Motion-frame ratio uses downscaled mpdecimate; static shots and grain affect this estimate. Exact decoded-frame ratio: ${escapeHtml(number(final.unique_frames?.exact_ratio === null || !final.unique_frames ? null : final.unique_frames.exact_ratio * 100, "%"))}.</p>
    <h3>Speech timeline</h3>${timeline(final.metadata.duration_s ?? 0, [...report.shots.map((shot) => ({ label: shot.id, intervals: final.speech_timeline.filter((interval) => interval.shot === shot.id) })), { label: "Final mix", intervals: final.speech.intervals }])}
    <p class="muted">Shot rows map detected source intervals through the selected cuts. Final mix includes BGM.</p>${warnings(final.warnings)}
    <a href="${url(`../../${final.file}`)}">Open final video</a></section>`
    : `<section id="final"><h2>Final edit</h2><p>No final video is available yet.</p></section>`;
  const shots = report.shots
    .map((shot) => {
      const transcript = shot.video.transcript;
      return `<section id="shot-${escapeHtml(shot.id)}"><div class="section-title"><h2>${escapeHtml(shot.id)}</h2><span class="badge">Video: ${escapeHtml(shot.video.status)}</span></div>
      <h3>Keyframes <span class="muted">${escapeHtml(shot.keyframe.status)} · pick ${escapeHtml(shot.keyframe.pick ?? "pending")}</span></h3>
      <div class="image-pair">${image(shot.keyframe.reference, "Character reference")}${image(shot.keyframe.sheet, "Keyframe candidates in selection order")}</div>
      <p class="muted">${escapeHtml(shot.keyframe.candidates.map((candidate, index) => `${index + 1}: ${candidate.width}×${candidate.height} (${candidate.size_ok === null ? "no size constraint" : candidate.size_ok ? "size matches" : "size mismatch"})`).join(" · "))}</p>
      <h3>Clip · start / middle / end</h3>${image(shot.video.sheet, "Clip frames")}
      <div class="metrics"><div><b>${escapeHtml(number(shot.video.cut?.start, " s"))} → ${escapeHtml(number(shot.video.cut?.end, " s"))}</b><span>Selected cut · ${escapeHtml(number(shot.video.cut?.duration, " s"))}</span></div><div><b>${escapeHtml(number(shot.video.suggested_cut_start, " s"))}</b><span>Suggested cut start</span></div><div><b>${escapeHtml(number(shot.video.missed_speech_s, " s"))}</b><span>Detected speech outside cut</span></div></div>
      ${timeline(shot.video.metadata?.duration_s ?? 0, [{ label: "Clip", intervals: shot.video.speech.intervals }], shot.video.cut ?? undefined)}
      <p class="muted">Blue bars: speech-like energy. Outline: selected cut. Threshold ${escapeHtml(number(shot.video.speech.threshold_db, " dBFS"))}; 20th-percentile level ${escapeHtml(number(shot.video.speech.noise_floor_db, " dBFS"))}. In clips without quiet intervals, the threshold may be below this level.</p>
      <div class="dialogue"><div><h3>Expected dialogue</h3><pre>${escapeHtml(shot.video.expected_dialogue || "No dialogue tags in the prompt.")}</pre></div><div><h3>Transcript</h3><pre>${escapeHtml(transcript.status === "completed" ? transcript.text : `${transcript.status}: ${transcript.reason}`)}</pre>${transcript.status === "completed" ? `<p>Character similarity: ${escapeHtml(number(transcript.similarity))}</p>` : ""}</div></div>
      ${warnings(shot.warnings)}${shot.video.file ? `<a href="${url(`../../${shot.video.file}`)}">Open clip</a>` : ""}</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(report.scene)} · Scene report</title>
<style>
:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#182a33;background:#f2f4f4}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:32px 24px 64px}header{padding:16px 0 28px}h1{font-size:36px;letter-spacing:-.03em;margin:8px 0}h2{margin:0;font-size:24px}h3{font-size:16px;margin:24px 0 12px}p,li{line-height:1.6}.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#3e6873}.muted,figcaption{font-size:13px;color:#526670}nav{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}a{color:#076a82}nav a{background:white;border:1px solid #ccd8dc;padding:7px 12px;border-radius:6px;text-decoration:none}section{padding:26px;background:#fff;border:1px solid #d6e0e3;border-radius:12px;margin:0 0 24px}.section-title{display:flex;justify-content:space-between;gap:12px;align-items:center}.badge{font-size:12px;padding:5px 9px;border-radius:5px;background:#e8f1f3;color:#315863}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:20px;margin:22px 0}.metrics b{display:block;font-size:20px;font-weight:600}.metrics span{display:block;font-size:12px;line-height:1.5;color:#526670;margin-top:4px}figure{margin:12px 0;min-width:0}img{display:block;max-width:100%;height:auto;border:1px solid #d6e0e3;border-radius:5px}figcaption{margin-top:7px}.image-pair{display:flex;gap:20px;align-items:flex-start}.image-pair figure{flex:1}.image-pair figure:first-child:not(:only-child){max-width:30%}.dialogue{display:grid;grid-template-columns:1fr 1fr;gap:22px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 system-ui;margin:0;padding:14px;background:#f5f7f8;border-radius:6px}code{font-size:12px;overflow-wrap:anywhere}.warnings{padding:14px 14px 14px 32px;background:#fff8e8;border-left:3px solid #c58b21;border-radius:4px;font-size:13px}.warnings li+li{margin-top:6px}.timeline{width:100%;min-width:0;margin:10px 0;font:12px/1.5 system-ui;color:#526670}.timeline-row{display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px;align-items:center;min-height:30px}.timeline-label{overflow-wrap:anywhere}.timeline-row svg{display:block;width:100%;height:24px;min-width:0}.timeline-scale{display:flex;justify-content:space-between;gap:12px}.track{fill:#edf2f4}.speech{fill:#187f98}.cut{fill:none;stroke:#b47718;stroke-width:1.5}footer{font-size:13px;color:#526670}@media(max-width:640px){main{padding:20px 12px}section{padding:18px}h1{font-size:28px}.dialogue{grid-template-columns:1fr}.image-pair{display:block}.image-pair figure:first-child:not(:only-child){max-width:55%}.metrics{grid-template-columns:1fr 1fr}.section-title{align-items:flex-start;flex-direction:column}.timeline-row{grid-template-columns:80px minmax(0,1fr)}}
</style></head><body><main id="report"><header><div class="eyebrow">Scene review</div><h1>${escapeHtml(report.scene)}</h1><p>${escapeHtml(report.shots.length)} shots · ${escapeHtml(count)} ${count === 1 ? "warning" : "warnings"} · ${escapeHtml(report.generated_at)}</p><p class="muted">Speech intervals are an energy-based estimate, not speech recognition. Music, tones and noise can activate the detector. Review the media before changing a cut.</p><nav><a href="#final">Final edit</a>${report.shots.map((shot) => `<a href="#shot-${escapeHtml(shot.id)}">${escapeHtml(shot.id)}</a>`).join("")}<a href="report.json">JSON report</a></nav></header>
${summary}${finalHtml}${shots}<footer>${escapeHtml(report.next_action)}</footer></main></body></html>\n`;
};
