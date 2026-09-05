/** Intent routing for H3 only. Installing an extension never opts a user into it. */
export const H3_EXTENSION_WORKFLOWS = new Set([
  "minimax_h3_sns_t2v",
  "minimax_h3_sns_i2v",
  "minimax_h3_guide_audio",
  "minimax_h3_guide_av",
  "minimax_h3_guide",
  "minimax_h3_motion_t2v",
  "minimax_h3_motion_r2v",
  "minimax_h3_vdn_t2v",
]);

const H3_WORKFLOWS = [
  ...H3_EXTENSION_WORKFLOWS,
  "minimax_h3_fast_t2v",
  "minimax_h3_t2v",
  "minimax_h3_i2v",
  "minimax_h3_r2v",
];

export const selectH3Workflow = (goal: string | undefined): string | undefined => {
  const text = (goal ?? "").normalize("NFKC").toLowerCase();
  const explicit = [...H3_WORKFLOWS]
    .sort((a, b) => b.length - a.length)
    .find((name) => text.includes(name));
  if (explicit) return explicit;
  // VDN is available only when named, never as an automatic speed/quality upgrade.
  if (/vdn/.test(text) && !/vdn\s*(?:なし|不要|以外|を使わ|は使わ)|without\s+vdn/.test(text)) {
    return "minimax_h3_vdn_t2v";
  }
  if (!/h3|エイチ[ス3]|エイチスリー/.test(text)) return undefined;
  const references =
    /r2v|ref2v|reference\s*(?:audio|voice)|参照音声|参考音声|声を|声の|リップシンク|口パク/.test(
      text,
    );
  const image =
    /i2v|image.to.video|animate.*image|画像を動|画像から|写真から|画像.*動画|写真.*動画/.test(text);
  const motion =
    /motion[ _-]*context|continu(?:e|ation)|extend.*(?:clip|video)|続きを|続きの|動き.*引き継|音.*引き継|継続生成/.test(
      text,
    );
  const guide =
    /add[ _-]*guide|keyframe|キーフレーム|終端|最後の.*(?:画像|構図)|途中の.*(?:画像|構図)|構図.*指定|音声.*(?:配置|位置指定)|音を.*(?:配置|位置指定)/.test(
      text,
    );
  const sns =
    /(?:sns|instagram|tiktok)[\sの]*(?:風|っぽ|style|aesthetic)|(?:sns|instagram|tiktok).*撮影風/.test(
      text,
    );
  const noLora = /lora\s*(?:なし|不要|以外|を使わ|は使わ)|without\s+(?:a\s+)?lora/.test(text);
  if (motion) return references ? "minimax_h3_motion_r2v" : "minimax_h3_motion_t2v";
  if (guide) {
    const audioGuide = /audio|音声|音を/.test(text);
    const imageGuide = /image|picture|画像|構図|写真/.test(text);
    return audioGuide
      ? imageGuide
        ? "minimax_h3_guide_av"
        : "minimax_h3_guide_audio"
      : "minimax_h3_guide";
  }
  if (references) return "minimax_h3_r2v";
  if (sns && !noLora) return image ? "minimax_h3_sns_i2v" : "minimax_h3_sns_t2v";
  if (image) return "minimax_h3_i2v";
  if (/fasth3|fast[ _-]*h3|fast|quick|高速|速く|速度優先/.test(text)) return "minimax_h3_fast_t2v";
  return "minimax_h3_t2v";
};
