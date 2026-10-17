// comfy-agent Studio — a thin view over .comfy-agent/ state.
// The agent session owns decisions; this page shows them and records the
// user's selections and feedback back into the same files.

const MESSAGES = {
  ja: {
    characters: "キャラクター",
    plans: "制作計画",
    requests: "受信箱",
    composerTitle: "エージェントへの依頼を作る",
    flow1: "ここで依頼文を作る",
    flow2: "Claude Code / Codex に渡す",
    flow3: "エージェントが生成すると、結果がここに出る",
    queueNote:
      "Studio 自体は生成しません。「受信箱に置く」は、`comfy-agent studio inbox --follow` を監視しているセッションだけが受け取ります。",
    noCharacters: "まだありません。`comfy-agent character create` で作れます。",
    noPlans: "エージェントが計画を書くとここに出ます。",
    noRequests: "受信箱は空です。",
    placeholder:
      "作りたいもの・変えたいことを書いてください(例: この子をカフェに座らせて / この画像をもっと映画っぽく)",
    copy: "依頼文をコピー",
    send: "受信箱に置く",
    hint: "画像の「＋素材」で依頼に添付できます(⌘+Enter でコピー)",
    copied:
      "コピーしました。Claude Code / Codex のセッションに貼り付けてください(まだ何も実行されていません)。",
    sent: "受信箱に置きました({id})。監視中のセッションがなければ、エージェントに「Studio の受信箱を確認して」と伝えてください。",
    needText: "依頼の内容を書いてください。",
    filterAll: "すべて",
    filterFav: "お気に入り",
    filterImage: "画像",
    filterVideo: "動画",
    filterAudio: "音声",
    items: "{n} 件",
    noOutputs: "まだ生成結果がありません。",
    addContext: "＋素材",
    removeContext: "素材から外す",
    favorite: "★ お気に入り",
    unfavorite: "★ 解除",
    note: "メモ",
    notePlaceholder: "フィードバックを書く(例: もう少し暗く / この雰囲気を今後も使いたい)",
    save: "保存",
    cancel: "やめる",
    decision: "AIの判断",
    noDecision: "この生成に紐づく計画はありません。",
    preset: "プリセット",
    method: "方式",
    model: "モデル",
    character: "キャラクター",
    prompt: "プロンプト",
    negative: "ネガティブ",
    seed: "シード",
    duration: "所要時間",
    status: "状態",
    submitted: "開始",
    settings: "設定",
    reason: "理由",
    inputs: "入力",
    params: "パラメータ",
    notes: "メモ",
    intent: "依頼",
    summary: "解釈",
    steps: "工程",
    selectSomething: "生成結果か制作計画を選ぶと、ここに詳細とAIの判断が出ます。",
    connectedTo: "接続先",
    handled: "計画あり",
    pending: "エージェント未対応",
    useCharacter: "依頼にキャラクターを指定",
    approved: "承認済み",
    loadFailed: "状態を読み込めませんでした: {message}",
    rerunTitle: "この設定で再生成",
    rerunNote:
      "判断の要らない再実行は、Studio から直接 ComfyUI({url})に送ります。方式やモデルを変えたいときはエージェントに依頼してください。",
    rerunLoading: "読み込み中…",
    inputsTitle: "入力",
    durationFrames: "動画の長さ: 約 {s} 秒({fps} fps)",
    durationSeconds: "動画の長さ: 約 {s} 秒",
    inputOriginal: "元の入力をそのまま使う",
    inputFromContext: "＋素材: {preset}",
    inputHint: "「＋素材」で選んだ画像や音声に差し替えられます。",
    inputServerOnly:
      "元のファイルがローカルに見つからないため、ComfyUI 上のコピー({name})を取得して使います。サーバーを作り直していると失敗します。",
    rerunRemote: "ComfyUI 側に保存されたワークフローの生成は、まだ Studio から再生成できません。",
    rerunPresetMissing: "プリセットが見つからないため再生成できません。",
    seedNew: "新しいシード(別案)",
    seedSame: "同じシード",
    countLabel: "枚数",
    rerunButton: "ComfyUI で生成する",
    rerunStarted: "生成を開始しました。",
    rerunLimit: "同時再実行の上限に達しています。実行中の生成が終わってから再度お試しください。",
    runsTitle: "Studio から実行した生成",
    runRunning: "生成中",
    runCompleted: "完了",
    runFailed: "失敗",
    showResult: "結果を見る",
    elapsed: "{s} 秒",
  },
  en: {
    characters: "Characters",
    plans: "Plans",
    requests: "Inbox",
    composerTitle: "Write a request for your agent",
    flow1: "Write the request here",
    flow2: "Hand it to Claude Code / Codex",
    flow3: "Results appear here once the agent generates them",
    queueNote:
      "The studio never generates by itself. “Put in inbox” only reaches a session watching `comfy-agent studio inbox --follow`.",
    noCharacters: "None yet. Create one with `comfy-agent character create`.",
    noPlans: "Plans written by the agent appear here.",
    noRequests: "The inbox is empty.",
    placeholder:
      "Describe what to make or change (e.g. seat her in a café / make this image more cinematic)",
    copy: "Copy request",
    send: "Put in inbox",
    hint: "Attach outputs with “+ Use” (⌘+Enter copies)",
    copied: "Copied. Paste it into your Claude Code / Codex session (nothing has run yet).",
    sent: "Put in inbox ({id}). If no session is watching, ask your agent to check the studio inbox.",
    needText: "Write what you want first.",
    filterAll: "All",
    filterFav: "Favorites",
    filterImage: "Images",
    filterVideo: "Video",
    filterAudio: "Audio",
    items: "{n} items",
    noOutputs: "No outputs yet.",
    addContext: "+ Use",
    removeContext: "Remove from request",
    favorite: "★ Favorite",
    unfavorite: "★ Unfavorite",
    note: "Note",
    notePlaceholder: "Write feedback (e.g. a bit darker / keep this mood)",
    save: "Save",
    cancel: "Cancel",
    decision: "Agent decision",
    noDecision: "No plan is linked to this output.",
    preset: "Preset",
    method: "Method",
    model: "Model",
    character: "Character",
    prompt: "Prompt",
    negative: "Negative",
    seed: "Seed",
    duration: "Duration",
    status: "Status",
    submitted: "Started",
    settings: "Settings",
    reason: "Reason",
    inputs: "Inputs",
    params: "Parameters",
    notes: "Notes",
    intent: "Request",
    summary: "Interpretation",
    steps: "Steps",
    selectSomething: "Select an output or a plan to see details and the agent's decision.",
    connectedTo: "Server",
    handled: "planned",
    pending: "not picked up",
    useCharacter: "Use this character in the request",
    approved: "approved",
    loadFailed: "Could not load state: {message}",
    rerunTitle: "Re-run with these settings",
    rerunNote:
      "Re-runs that need no judgment are sent straight to ComfyUI ({url}). Ask your agent to change the method or model.",
    rerunLoading: "Loading…",
    inputsTitle: "Inputs",
    durationFrames: "Clip length: about {s}s ({fps} fps)",
    durationSeconds: "Clip length: about {s}s",
    inputOriginal: "Keep the original input",
    inputFromContext: "+ Use: {preset}",
    inputHint: "Replace it with an output picked via “+ Use”.",
    inputServerOnly:
      "The original file is not on this machine, so the copy on ComfyUI ({name}) is fetched. This fails if the server was recreated.",
    rerunRemote: "Workflows stored on the ComfyUI server cannot be re-run from the studio yet.",
    rerunPresetMissing: "The preset was not found, so this cannot be re-run.",
    seedNew: "New seed (variation)",
    seedSame: "Same seed",
    countLabel: "Count",
    rerunButton: "Generate on ComfyUI",
    rerunStarted: "Generation started.",
    rerunLimit:
      "The concurrent re-run limit has been reached. Wait for a running generation to finish, then try again.",
    runsTitle: "Runs started from the studio",
    runRunning: "running",
    runCompleted: "done",
    runFailed: "failed",
    showResult: "Show result",
    elapsed: "{s}s",
  },
};

const state = {
  data: null,
  catalog: null,
  lang: "ja",
  filter: "all",
  deleteTarget: null,
  deleting: false,
  focus: null,
  context: [],
  character: null,
  editing: null,
  capability: null,
  engineName: null,
  engineCache: null,
  autoModel: true,
  modelQuery: "",
  params: {},
  prompt: "",
  inputs: {},
  originalInputs: [],
  skip: new Set(),
  sourceJob: null,
  duration: null,
  size: null,
  seed: "random",
  count: 1,
  generating: false,
  checking: false,
  pickerSlot: null,
  dismissedRuns: new Set(),
  trackedRuns: new Set(),
  runStatusActive: false,
  hintSeen: false,
  assist: null,
  assistOriginal: null,
};
const $ = (selector) => document.querySelector(selector);

const t = (key, params = {}) => {
  const text = MESSAGES[state.lang][key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
};

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );

const api = async (path, body) => {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    const error = new Error(json.error?.message ?? res.statusText);
    error.code = json.error?.code;
    throw error;
  }
  return json;
};

const allOutputs = () =>
  (state.data?.jobs ?? []).flatMap((job) => job.outputs.map((output) => ({ job, output })));

const findOutput = (jobId, index) =>
  allOutputs().find(({ job, output }) => job.job_id === jobId && output.index === index);

const inContext = (jobId, index) =>
  state.context.some((item) => item.job_id === jobId && item.output_index === index);

const mediaTag = (output, className = "media", controls = false) => {
  if (output.kind === "image") {
    return `<img class="${className}" src="${esc(output.url)}" alt="" loading="lazy" />`;
  }
  if (output.kind === "video") {
    return controls
      ? `<video class="${className}" src="${esc(output.url)}" controls loop playsinline></video>`
      : `<video class="${className}" data-src="${esc(output.url)}#t=0.1" muted loop playsinline preload="metadata"></video>`;
  }
  if (output.kind === "audio" && controls) {
    return `<audio class="${className}" src="${esc(output.url)}" controls></audio>`;
  }
  const icon = output.kind === "audio" ? "♪" : output.kind === "video" ? "▶" : "📄";
  return `<div class="${className} media-icon">${icon}</div>`;
};

// Galleries can hold hundreds of clips; only load the ones near the viewport so
// they do not exhaust the browser's connections to the studio server.
const videoObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const video = entry.target;
            video.src = video.dataset.src;
            videoObserver.unobserve(video);
          }
        },
        { rootMargin: "300px" },
      )
    : null;

const observeVideos = (root) => {
  for (const video of root.querySelectorAll("video[data-src]:not([src])")) {
    if (videoObserver) videoObserver.observe(video);
    else video.src = video.dataset.src;
  }
};

const unobserveVideos = (root) => {
  for (const video of root.querySelectorAll("video[data-src]:not([src])")) {
    videoObserver?.unobserve(video);
  }
};

const formatDuration = (ms) => (ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`);
const formatDate = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

// Plans reference jobs through step.job_ids; this lets an output show "why".
const stepsForJob = (jobId) =>
  (state.data?.plans ?? []).flatMap((plan) =>
    plan.steps
      .filter((step) => step.job_ids.some((id) => jobId.startsWith(id) || id === jobId))
      .map((step) => ({ plan, step })),
  );

const facts = (rows) =>
  `<dl class="facts">${rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${value}</dd>`)
    .join("")}</dl>`;

const stepDecision = (step) =>
  facts([
    [t("method"), step.method && esc(step.method)],
    [t("model"), step.model && esc(step.model)],

    [t("character"), step.character && esc(step.character)],
    [
      t("inputs"),
      step.inputs.length
        ? step.inputs.map((input) => `<code>${esc(input)}</code>`).join("<br>")
        : "",
    ],
    [t("prompt"), step.prompt && esc(step.prompt)],
    [
      t("settings"),
      Object.keys(step.settings).length ? `<code>${esc(JSON.stringify(step.settings))}</code>` : "",
    ],
  ]);

const closeOutputDestinations = () => {
  document.querySelectorAll(".output-destinations").forEach((menu) => (menu.hidden = true));
  document
    .querySelectorAll("[data-output-destinations]")
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
};
const outputDestinations = (output) =>
  capabilities().filter((cap) =>
    cap.engines.some(
      (engine) => !engine.inputless && engine.inputs.some((slot) => slotAccepts(slot, output.kind)),
    ),
  );
const destinationLabel = (cap, kind) => {
  if (kind === "image" && cap.capability === "image_to_video") return t("animateThisImage");
  if (kind === "image" && cap.capability === "image_edit") return t("editThisImage");
  if (kind === "video" && cap.capability === "video_to_video") return t("editThisVideo");
  return t("useForMode", {
    kind: t(["image", "video", "audio"].includes(kind) ? `${kind}Kind` : "resultKind"),
    mode: text(cap.label),
  });
};
const renderOutputInspector = (job, output) => {
  const linked = stepsForJob(job.job_id);
  const editor =
    state.editing === "note"
      ? `<form class="inline-form" data-form="note"><input name="value" required aria-label="${esc(t("notePlaceholder"))}" placeholder="${esc(t("notePlaceholder"))}" autofocus /><button type="submit">${esc(t("save"))}</button><button type="button" class="ghost" data-cancel-edit>${esc(t("cancel"))}</button></form>`
      : "";
  const destinations = outputDestinations(output);
  const selection = `${esc(job.job_id)}:${output.index}`;
  const suffix = ["image", "video", "audio"].includes(output.kind)
    ? output.kind[0].toUpperCase() + output.kind.slice(1)
    : "Result";
  const destinationButton =
    destinations.length === 1
      ? `<button type="button" class="secondary" data-destination="${esc(destinations[0].id)}" data-selection="${selection}">${esc(destinationLabel(destinations[0], output.kind))}</button>`
      : destinations.length > 1
        ? `<div class="destination-picker"><button type="button" class="secondary" data-output-destinations aria-expanded="false">${esc(t(`createFrom${suffix}`))} ▾</button><div class="output-destinations" hidden>${destinations.map((cap) => `<button type="button" class="ghost" data-destination="${esc(cap.id)}" data-selection="${selection}">${esc(text(cap.label))}</button>`).join("")}</div></div>`
        : "";

  const decision = linked.length
    ? linked
        .map(
          ({ plan, step }) => `<div class="decision">
            <p><strong>${esc(step.title)}</strong> — <a href="#" data-plan="${esc(plan.id)}">${esc(plan.title)}</a></p>
            ${step.purpose ? `<p>${esc(step.purpose)}</p>` : ""}
            ${step.reason ? `<p class="reason">${esc(t("reason"))}: ${esc(step.reason)}</p>` : ""}
            ${stepDecision(step)}
          </div>`,
        )
        .join("")
    : "";

  return `
    ${mediaTag(output, "preview", true)}
    <div class="result-action-groups">
      <section class="result-action-group"><h3>${esc(t("nextCreation"))}</h3><div class="actions"><button type="button" data-load-job="${esc(job.job_id)}"${!engineForJob(job) || job.source !== "local" ? ` disabled title="${esc(t("rerunUnavailable"))}"` : ""}>${esc(t("recreate"))}</button>${destinationButton}</div></section>
      <section class="result-action-group"><h3>${esc(t("organize"))}</h3><div class="actions"><button type="button" class="secondary" data-action="favorite" aria-pressed="${job.favorite}">${esc(job.favorite ? t("unfavorite") : t("favorite"))}</button><button type="button" class="secondary" data-action="note">${esc(t("note"))}</button></div>${editor}</section>
      <section class="result-action-group"><h3>${esc(t("consultGroup"))}</h3><div class="actions"><button type="button" class="secondary" data-consult-output="${selection}">${esc(t(`consult${suffix}`))}</button></div></section>
    </div>
    ${linked.length ? `<h3>${esc(t("decision"))}</h3>${decision}` : ""}
    <h3>${esc(t("prompt"))}</h3>
    ${facts([
      [t("model"), esc(jobModelName(job, output.kind))],
      [
        t("character"),
        job.character &&
          esc(job.character.name + (job.character.form ? ` (${job.character.form})` : "")),
      ],
      [t("prompt"), job.prompt_final && esc(job.prompt_final)],
      [t("negative"), job.negative_final && esc(job.negative_final)],
      [t("seed"), esc(job.seed)],
      [t("status"), `<span class="badge ${esc(job.status)}">${esc(t(job.status))}</span>`],
      [t("submitted"), esc(formatDate(job.submitted_at))],
      [t("elapsedDuration"), esc(formatDuration(job.duration_ms))],
      [t("connectedTo"), `<code>${esc(job.base_url)}</code>`],
    ])}
    ${job.notes.length ? `<h3>${esc(t("notes"))}</h3><ul class="notes">${job.notes.map((note) => `<li>${esc(note.text)}</li>`).join("")}</ul>` : ""}
    <details><summary>${esc(t("params"))}</summary><pre>${esc(JSON.stringify(job.params, null, 2))}</pre></details>
    <details><summary>${esc(t("jobDetails"))}</summary><pre>${esc(job.job_id)}\n${esc(output.path)}</pre></details>`;
};

const renderPlanInspector = (plan) => {
  const steps = plan.steps
    .map((step, index) => {
      const thumbs = step.job_ids
        .flatMap((id) =>
          allOutputs().filter(({ job }) => job.job_id === id || job.job_id.startsWith(id)),
        )
        .map(
          ({ job, output }) =>
            `<button type="button" aria-label="${esc(output.filename)}" data-job="${esc(job.job_id)}" data-index="${output.index}">${mediaTag(output, "")}</button>`,
        )
        .join("");
      return `<div class="step">
        <div class="step-head"><strong>${index + 1}. ${esc(step.title)}</strong>
          <span class="badge ${esc(step.status)}">${esc(t(step.status))}</span></div>
        ${step.purpose ? `<p>${esc(step.purpose)}</p>` : ""}
        ${step.reason ? `<p class="reason">${esc(t("reason"))}: ${esc(step.reason)}</p>` : ""}
        ${stepDecision(step)}
        ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}
      </div>`;
    })
    .join("");
  return `<h2>${esc(t("plans"))}</h2>
    <h3 style="font-size:16px;margin-top:0">${esc(plan.title)} <span class="badge ${esc(plan.status)}">${esc(t(plan.status))}</span></h3>
    ${facts([
      [t("intent"), plan.intent && esc(plan.intent)],
      [t("summary"), plan.summary && esc(plan.summary)],
    ])}
    <h3>${esc(t("steps"))}</h3>
    ${steps}
    <details><summary>${esc(t("planDetails"))}</summary><pre>${esc(plan.id)}${plan.request_id ? `\n${esc(plan.request_id)}` : ""}</pre></details>`;
};

const LABELS = {
  deleteOutput: ["削除", "Delete"],
  deleteTitle: ["この結果を削除しますか？", "Delete this result?"],
  deleteBody: [
    "ファイルと記録が消え、元に戻せません。",
    "The file and its record will be removed. This cannot be undone.",
  ],
  deleteReason: [
    "消す理由（任意）— 書くと、次に作るときエージェントが参考にします",
    "Reason (optional) — your agent can use it when creating the next result",
  ],
  deleteConfirm: ["削除する", "Delete result"],
  deleteCancel: ["やめる", "Cancel"],
  deleting: ["削除中…", "Deleting…"],
  deleted: ["結果を削除しました", "Result deleted"],
  deleteFailed: ["削除できませんでした: {message}", "Could not delete: {message}"],
  nextCreation: ["次を作る", "Create next"],
  organize: ["整理", "Organize"],
  consultGroup: ["相談", "Consult"],
  createFromImage: ["この画像から作る", "Create from this image"],
  createFromVideo: ["この動画から作る", "Create from this video"],
  createFromAudio: ["この音声から作る", "Create from this audio"],
  createFromResult: ["この結果から作る", "Create from this result"],
  animateThisImage: ["この画像を動かす", "Animate this image"],
  editThisImage: ["この画像を編集する", "Edit this image"],
  editThisVideo: ["この動画を編集する", "Edit this video"],
  useForMode: ["この{kind}で「{mode}」", "Use this {kind} for {mode}"],
  consultImage: ["この画像をエージェントに伝えて相談", "Ask the agent about this image"],
  consultVideo: ["この動画をエージェントに伝えて相談", "Ask the agent about this video"],
  consultAudio: ["この音声をエージェントに伝えて相談", "Ask the agent about this audio"],
  consultResult: ["この結果をエージェントに伝えて相談", "Ask the agent about this result"],
  consultIntro: ["この{kind}について相談したいです。", "I'd like to discuss this {kind}."],
  resultKind: ["結果", "result"],
  assistStart: ["プロンプトを提案してもらう", "Suggest a prompt"],
  assistTitle: ["プロンプトの提案", "Prompt suggestions"],
  assistDescription: [
    "接続中のモデル（{name}）に合う書き方で、エージェントが書き直し、意味を日本語で説明します",
    "The agent rewrites it for {name} and explains what it means.",
  ],
  assistWaiting: [
    "エージェントに依頼しました。返事を待っています…",
    "Requested help from your agent. Waiting for a reply…",
  ],
  assistCancel: ["キャンセル", "Cancel"],
  assistHint: [
    "エージェントが受け取っていないようです。このフォルダで開いている Claude Code / Codex に comfy-agent studio inbox --follow を動かすよう頼むか、依頼文をコピーして貼り付けてください。",
    "Your agent may not be receiving requests. Ask Claude Code / Codex in this folder to run comfy-agent studio inbox --follow, or copy and paste this request into the session.",
  ],
  assistCopy: ["依頼文をコピー", "Copy request"],
  assistCopyPrompt: ["コピー", "Copy"],
  assistScrollHint: [
    "説明・補足はスクロールして読めます",
    "Scroll to read the explanation and notes",
  ],
  assistPromptCopied: ["コピーしました", "Copied"],
  assistSelectPrompt: [
    "提案文を選択しました。コピーしてください。",
    "Suggestion selected. Copy the selected text.",
  ],
  assistCopied: [
    "コピーしました。エージェントのセッションに貼り付けてください。",
    "Copied. Paste it into your agent session.",
  ],
  assistMeaning: ["このプロンプトの意味", "What this prompt means"],
  assistUse: ["使う", "Use"],
  assistUndo: ["元に戻す", "Undo"],
  assistOption: ["案{n}", "Option {n}"],
  assistPrompt: ["提案されたプロンプト（編集できます）", "Suggested prompt (editable)"],
  assistApply: ["適用: {name}", "Apply: {name}"],
  assistApplied: ["設定を適用しました", "Setting applied"],
  assistMismatch: [
    "対象のモデル・方式が変わりました。元の設定に戻すか、もう一度依頼してください。",
    "The model or mode has changed. Restore it or request new suggestions.",
  ],
  assistInvalidSetting: [
    "現在の設定では適用できません。長さやサイズの設定を確認してください。",
    "This setting cannot be applied to the current controls. Check duration or size.",
  ],
  assistUsed: ["プロンプトを置き換えました。元に戻せます。", "Prompt replaced. You can undo it."],
  none: ["なし", "None"],
  detailTitle: ["結果の詳細", "Result details"],
  close: ["閉じる", "Close"],
  askAgent: ["エージェントに相談", "Ask the agent"],
  generate: ["生成 ⏎", "Generate ⏎"],
  generating: ["送信中…", "Starting…"],
  generationProgress: ["生成中です（{n} 件）", "Generating: {n}"],
  generationDone: ["できあがりました", "Ready"],
  generationFailed: ["生成に失敗しました: {reason}", "Generation failed: {reason}"],
  generationFailures: ["{n} 件失敗", "{n} failed"],
  connectionTitle: ["接続先とできること", "Connection & what you can make"],
  modeContext: [
    "接続中の ComfyUI{server}でできること（{n} 種類）",
    "What your connected ComfyUI{server} can do ({n})",
  ],
  singleModeContext: [
    "接続中の ComfyUI{server}でできるのは「{name}」だけです",
    "Only “{name}” is available on your connected ComfyUI{server}",
  ],
  capabilityDetails: ["詳しく", "Details"],
  previousCheck: ["前回確認した内容です", "Results from the previous check"],
  makeAndWhy: ["作れるものと、その理由", "What you can make and why"],
  makeAndWhyBody: [
    "表示される作業は、接続している ComfyUI に入っているノードとモデルから自動で判定しています。ComfyUI 側にノードやモデルを追加すると、ここに増えます。",
    "The available tasks are detected automatically from the nodes and models installed in your connected ComfyUI. Adding nodes or models to ComfyUI can make more tasks available here.",
  ],
  modelCount: ["{n} 個のモデル", "{n} models"],
  oneModel: ["1 個のモデル", "1 model"],
  moreModels: ["ほか {n}", "{n} more"],
  unavailableMode: ["使えません", "Unavailable"],
  missingDetails: ["詳しい不足項目", "See what is missing"],
  missingDetailsFor: ["「{name}」の詳しい不足項目", "See what is missing for {name}"],
  informationPending: [
    "制作に必要な情報をまだ確認できていません。再確認してください。",
    "We could not check the information needed to create yet. Please check again.",
  ],
  checking: ["確認中…", "Checking…"],
  checkingBody: [
    "ComfyUI の機能を確認しています（Colab 経由では数十秒かかることがあります）。",
    "Checking ComfyUI’s features (this can take tens of seconds through Colab).",
  ],
  probeFailed: ["ComfyUI の機能を確認できません", "Could not check ComfyUI’s features"],
  probeTimeout: [
    "ComfyUI の機能の取得に時間がかかりすぎたため、確認を終了しました。再確認してください。",
    "The ComfyUI feature check timed out. Please check again.",
  ],
  probeHttpError: [
    "ComfyUI が機能の確認にエラーを返しました（HTTP {status}）。サーバーの状態を確認し、再確認してください。",
    "ComfyUI returned an error during the feature check (HTTP {status}). Check the server and try again.",
  ],
  probeInvalidResponse: [
    "ComfyUI から機能の情報を正しく読み取れませんでした。サーバーの状態を確認し、再確認してください。",
    "ComfyUI’s feature information could not be read. Check the server and try again.",
  ],
  connected: ["ComfyUI 接続中", "ComfyUI connected"],
  offlineTitle: ["ComfyUI に接続できません", "Cannot connect to ComfyUI"],
  offlineBody: [
    "接続先の ComfyUI が応答しないため、いま画像や動画を何が作れるかを確認できません。ComfyUI が起動しているか、接続先の URL が正しいかを確認してください。",
    "ComfyUI is not responding, so we cannot tell which images or videos can be made right now. Check that ComfyUI is running and that the server URL is correct.",
  ],
  offlineNote: [
    "過去の結果、お気に入り、メモ、エージェントへの相談は接続がなくても使えます。",
    "Past results, favorites, notes and agent requests still work without a connection.",
  ],
  emptyCatalog: [
    "この接続先でできる作業がありません",
    "No creation tasks are available on this server",
  ],
  emptyCatalogBody: [
    "接続はできていますが、このフォルダのワークフローに必要なノードやモデルが ComfyUI に揃っていません。",
    "The connection is working, but ComfyUI is missing nodes or models needed by this folder’s workflows.",
  ],
  reconnect: ["再接続", "Reconnect"],
  recheck: ["再確認", "Check again"],
  changeUrl: ["接続先を変える方法", "How to change the server URL"],
  urlHelp: [
    "ComfyUI の起動時に表示された URL を、エージェントに伝えるか次のコマンドで保存します。",
    "Give your agent the URL shown when ComfyUI starts, or save it with this command.",
  ],
  envHelp: [
    "環境変数 COMFY_AGENT_BASE_URL が設定されています。接続先を変えるには、この環境変数も更新して Studio を起動し直してください。",
    "COMFY_AGENT_BASE_URL is set. Update that environment variable and restart Studio to change the server.",
  ],
  sourceConfig: [
    "設定ファイル (.comfy-agent/config.yaml)",
    "Configuration file (.comfy-agent/config.yaml)",
  ],
  sourceEnv: ["環境変数 COMFY_AGENT_BASE_URL", "Environment variable COMFY_AGENT_BASE_URL"],
  sourceDefault: ["標準の接続先", "Default server URL"],
  sourceOption: ["コマンドで指定", "Command option"],
  connectionSource: ["接続先の設定元", "Server URL source"],
  version: ["ComfyUI バージョン", "ComfyUI version"],
  capabilitiesTitle: ["できること", "What you can do"],
  notRunnable: [
    "このサーバーでは使えないワークフロー {n} 件",
    "{n} workflows cannot run on this server",
  ],
  missingNodes: ["不足ノード", "Missing nodes"],
  missingModels: ["不足モデル", "Missing models"],
  imageTypes: ["画像 {n} 種類", "{n} image modes"],
  videoTypes: ["動画 {n} 種類", "{n} video modes"],
  audioTypes: ["音声 {n} 種類", "{n} audio modes"],
  imageModel: ["画像モデル", "Image model"],
  videoModel: ["動画モデル", "Video model"],
  audioModel: ["音声モデル", "Audio model"],
  modelAuto: ["モデル: 自動（{name}）", "Model: Auto ({name})"],
  modelChosen: ["モデル: {name}", "Model: {name}"],
  automatic: ["自動", "Auto"],
  fast: ["速い", "Fast"],
  normal: ["標準", "Normal"],
  quality: ["品質優先", "Quality"],
  modelSelect: ["モデルを選ぶ", "Choose a model"],
  modelFilter: ["名前やモデルで絞り込む", "Filter by name or model"],
  noModels: ["該当するモデルはありません", "No matching models"],
  imageKind: ["画像", "Image"],
  videoKind: ["動画", "Video"],
  audioKind: ["音声", "Audio"],
  fileKind: ["ファイル", "File"],
  durationChip: ["約 {n} 秒", "About {n}s"],
  durationLabel: ["動画の長さ", "Clip length"],
  durationDetails: ["約 {s} 秒 / {frames} フレーム", "About {s}s / {frames} frames"],
  sizeLabel: ["比率・サイズ", "Aspect & size"],
  countChip: ["{n} 枚", "{n} images"],
  countOther: ["{n} 件", "{n} outputs"],
  countLabel: ["生成する件数", "Number of outputs"],
  advanced: ["⚙ 詳細", "⚙ Details"],
  attachImage: ["＋ 画像を添付", "＋ Attach an image"],
  attachMaterial: ["＋ 素材を添付", "＋ Attach an input"],
  pickResult: ["結果から選ぶ", "Pick from results"],
  uploadFile: ["ファイルを選ぶ", "Choose a file"],
  dropImage: ["ここに画像をドロップ", "Drop an image here"],
  dropVideo: ["ここに動画をドロップ", "Drop a video here"],
  dropAudio: ["ここに音声をドロップ", "Drop audio here"],
  dropFile: ["ここにファイルをドロップ", "Drop a file here"],
  dropHere: ["ここにドロップして追加", "Drop here to add"],
  orChoose: ["または", "or"],
  replaceImage: ["別の画像にする", "Use another image"],
  replaceVideo: ["別の動画にする", "Use another video"],
  replaceAudio: ["別の音声にする", "Use another audio file"],
  replaceFile: ["別のファイルにする", "Use another file"],
  optionalEmpty: ["なしでも生成できます", "You can generate without this input"],
  startImage: ["＋ 画像から始める", "+ Start from an image"],
  startVideo: ["＋ 動画から始める", "+ Start from a video"],
  startAudio: ["＋ 音声から始める", "+ Start from audio"],
  startFile: ["＋ ファイルから始める", "+ Start from a file"],
  noImageVideo: ["画像なしで動画を作ります", "Creating a video without an image"],
  noVideoVideo: ["動画素材なしで動画を作ります", "Creating a video without a source video"],
  noImageImage: ["画像素材なしで画像を作ります", "Creating an image without a source image"],
  removeInput: ["外す", "Remove"],
  slotIncompatible: [
    "「{name}」には{kind}を追加できません。",
    "You cannot add {kind} to “{name}”.",
  ],
  noEmptyInput: ["対応する入力枠が埋まっています。", "All compatible input slots are full."],
  ignoredFiles: ["{n} 件のファイルは追加しませんでした。", "{n} files were not added."],
  inputChanged: [
    "作業が変わったため、追加しませんでした。もう一度追加してください。",
    "The task changed, so the file was not added. Please add it again.",
  ],
  required: ["必須", "Required"],
  optional: ["なしでも可", "Can be omitted"],
  bakedInput: ["既定の入力あり", "Default input available"],
  omittedInput: ["入力なし", "No input"],
  inputlessImage: ["画像なしで実行", "Run without images"],
  inputlessVideo: ["動画なしで実行", "Run without video"],
  clearInput: ["取り外す", "Remove"],
  uploading: ["アップロード中…", "Uploading…"],
  inputNeeded: ["{name}を選んでください。", "Choose {name}."],
  imageUnsupported: [
    "この接続先では、画像を入力に使える制作機能がありません。",
    "This server has no creation mode that accepts images.",
  ],
  inputUnsupported: [
    "この素材を使える制作機能がありません。",
    "No creation mode accepts this input.",
  ],
  noCompatibleResults: [
    "この入力に使える結果はありません。ファイルを選べます。",
    "No compatible results yet. You can choose a file.",
  ],
  placeholder_image: ["作りたい画像を説明してください", "Describe the image you want to create"],
  placeholder_editable: [
    "作りたい画像を説明してください（画像を添付すると「編集」に切り替わります）",
    "Describe your image (attach an image to switch to editing)",
  ],
  placeholder_edit: [
    "画像をどう変えたいか説明してください",
    "Describe how you want to change the image",
  ],
  placeholder_video: [
    "作りたい動画と、動きや音を説明してください",
    "Describe your video, including movement and sound",
  ],
  placeholder_animate: [
    "画像をどう動かしたいか説明してください",
    "Describe how you want the image to move",
  ],
  placeholder_audio: [
    "作りたい音楽や音声を説明してください",
    "Describe the music or audio you want to create",
  ],
  placeholder_other: ["作りたいものを説明してください", "Describe what you want to create"],
  firstHint: [
    "生成 = この内容で ComfyUI に直接送る / 相談 = エージェントへの依頼文を作る（コピーまたは受信箱）",
    "Generate sends this directly to ComfyUI / Ask creates an agent request (copy or inbox)",
  ],
  characterExplanation: [
    "登録した見た目や LoRA を依頼に添付します。適用はエージェントに相談してください。",
    "Attach a registered appearance or LoRA to your request. Ask your agent to apply it.",
  ],
  characterAgentOnly: [
    "キャラクターを直接の生成には反映できません。エージェントに相談してください。",
    "Direct generation cannot apply this character. Ask your agent.",
  ],
  characterAttached: ["@{name}", "@{name}"],
  requestCharacter: ["キャラクターを指定", "Choose a character"],
  characterSearch: ["キャラクターを検索", "Search characters"],
  seedRandom: ["ランダム", "Random"],
  seedFixed: ["固定", "Fixed"],
  fixedSeed: ["シード", "Seed"],
  fixedSeedCount: [
    "固定シードでは1件ずつ生成します。",
    "A fixed seed generates one output at a time.",
  ],
  staleProfile: [
    "制作設定が更新されています。エージェントに確認を依頼できます。",
    "Creation settings changed. You can ask your agent to review them.",
  ],
  animate: ["動かす", "Animate"],
  editImage: ["編集する", "Edit"],
  recreate: ["作り直す", "Re-create"],
  jobDetails: ["生成の識別情報", "Job identifiers"],
  planDetails: ["計画の識別情報", "Plan identifiers"],
  elapsedDuration: ["所要時間", "Elapsed time"],
  requestContext: ["相談に含める内容・素材", "Content & inputs included"],
  requestIntro: ["{task}をお願いします。", "Please help with: {task}."],
  requestGeneric: ["作りたいものを相談したいです。", "I would like help with a creation."],
  queueNote: [
    "コピーした依頼文を Claude Code / Codex に貼り付けてください。受信箱は comfy-agent studio inbox --follow を監視しているセッションが受け取ります。",
    "Paste the request into Claude Code / Codex. Inbox requests go to a session watching comfy-agent studio inbox --follow.",
  ],
  clipboardFallback: [
    "下の依頼文を選択してコピーしてください。",
    "Select and copy the request below.",
  ],
  agentArea: ["エージェント", "Agent"],
  agentCount: ["エージェント {n}", "Agent {n}"],
  agentStepProgress: ["{done} / {total} ステップ完了", "{done} / {total} steps complete"],
  running: ["生成中", "Generating"],
  completed: ["完了", "Completed"],
  failed: ["失敗", "Failed"],
  done: ["完了", "Done"],
  pending: ["未着手", "Pending"],
  proposed: ["提案", "Proposed"],
  cancelled: ["中止", "Cancelled"],
  skipped: ["省略", "Skipped"],
  dismissRun: ["表示を閉じる", "Dismiss"],
  noOutputs: [
    "結果はここに並びます。下の入力欄から作ってみましょう。",
    "Your results appear here. Start with the composer below.",
  ],
  rerunUnavailable: [
    "この接続先では、この結果を作り直せません。エージェントに相談できます。",
    "This result cannot be re-created on this server. You can ask your agent.",
  ],
  sourceLoaded: ["内容を入力欄に読み込みました。", "Loaded into the composer."],
};
for (const [key, [ja, en]] of Object.entries(LABELS)) {
  MESSAGES.ja[key] = ja;
  MESSAGES.en[key] = en;
}
MESSAGES.ja.rerunTitle = MESSAGES.ja.recreate;
MESSAGES.en.rerunTitle = MESSAGES.en.recreate;
const text = (value) => value?.[state.lang] ?? value?.en ?? "";
const capabilities = () => state.catalog?.capabilities ?? [];
const currentCapability = () => capabilities().find((c) => c.id === state.capability);
const currentEngine = () => currentCapability()?.engines.find((e) => e.preset === state.engineName);
const slotFilled = (slot) =>
  Boolean(state.inputs[slot.slot] || state.originalInputs.some((i) => i.name === slot.slot));
const hiddenInputSlots = () =>
  new Set(currentEngine()?.inputless ? currentEngine().default_skip : []);
const syncInputSkips = () => {
  const engine = currentEngine();
  if (engine)
    state.skip = new Set([
      ...hiddenInputSlots(),
      ...engine.inputs
        .filter((slot) => slot.optional && !slotFilled(slot))
        .map((slot) => slot.slot),
    ]);
  return state.skip;
};
const inputModeFor = (engine, kind = null) =>
  capabilities().find((cap) =>
    cap.engines.some(
      (e) =>
        e.preset === engine?.preset &&
        !e.inputless &&
        (!kind || e.inputs.some((slot) => slotAccepts(slot, kind))),
    ),
  );
const closeSlotMenus = () => {
  document.querySelectorAll(".slot-replace-menu").forEach((menu) => (menu.hidden = true));
  document
    .querySelectorAll("[data-replace-slot]")
    .forEach((button) => button.setAttribute("aria-expanded", "false"));
};
const capabilityForJob = (job) => {
  const candidates = capabilities().filter((c) => c.engines.some((e) => e.preset === job.preset));
  return (
    candidates.find((c) =>
      c.engines.some(
        (e) =>
          e.preset === job.preset &&
          e.inputless &&
          e.default_skip.every((slot) => job.skipped_inputs?.includes(slot)),
      ),
    ) ??
    candidates.find((c) => c.engines.some((e) => e.preset === job.preset && !e.inputless)) ??
    candidates[0]
  );
};
const engineForJob = (job) => capabilityForJob(job)?.engines.find((e) => e.preset === job.preset);
const modelName = (engine) =>
  ["Image model", "Video model", "Audio model"].includes(engine?.model_label)
    ? t(`${engine.model_label.split(" ")[0].toLowerCase()}Model`)
    : (engine?.model_label ?? "");
const jobModelName = (job, kind) =>
  [job.model_label, engineForJob(job)?.model_label].find(
    (label) => label && !["ComfyUI", "Image model", "Video model", "Audio model"].includes(label),
  ) ?? t(`${kind}Kind`);
const fieldValue = (field) =>
  Object.hasOwn(state.params, field?.param) ? state.params[field.param] : field?.default;
const fpsValue = () => {
  const e = currentEngine() ?? state.engineCache;
  return (
    Number(typeof e?.controls.fps === "number" ? e.controls.fps : fieldValue(e?.controls.fps)) ||
    e?.constraints?.fps ||
    24
  );
};
const slotAccepts = (slot, kind) =>
  slot.kind === "file" || (slot.kind === "mask" ? kind === "image" : slot.kind === kind);
const showDialog = (id) => {
  const d = $(`#${id}`);
  if (!d.open) d.showModal();
};
const setStatus = (message) => {
  state.runStatusActive = false;
  $("#composer-status").textContent = message;
};
const setRequestStatus = (message) => {
  $("#request-status").textContent = message;
};
const closePopovers = () =>
  document.querySelectorAll(".settings-popover").forEach((e) => (e.hidden = true));
const sourceText = (source) =>
  t(
    {
      config: "sourceConfig",
      COMFY_AGENT_BASE_URL: "sourceEnv",
      default: "sourceDefault",
      "--base-url": "sourceOption",
    }[source] ?? "sourceDefault",
  );
const chooseEngine = (capabilityId, presetName = null, automatic = true) => {
  const capability = capabilities().find((c) => c.id === capabilityId);
  if (!capability) return;
  const engine =
    capability.engines.find((e) => e.preset === presetName) ??
    capability.engines.find((e) => e.default) ??
    capability.engines[0];
  const old = currentEngine() ?? state.engineCache;
  const variantSwitch = old?.preset === engine.preset && old.inputless !== engine.inputless;
  const previous = { params: state.params, seed: state.seed, count: state.count, size: state.size };
  const oldInputs =
    old?.inputs.map((slot) => ({
      slot: slot.slot,
      role: slot.role,
      kind: slot.kind,
      input: state.inputs[slot.slot],
      original: state.originalInputs.find((input) => input.name === slot.slot),
    })) ?? [];
  const sourceJob = state.sourceJob;
  state.capability = capability.id;
  state.engineName = engine.preset;
  state.autoModel = automatic;
  state.modelQuery = "";
  state.engineCache = engine;
  state.params = {};
  for (const control of Object.values(engine.controls).flat()) {
    if (control?.param && control.default !== undefined)
      state.params[control.param] = control.default;
  }
  state.inputs = {};
  state.originalInputs = [];
  state.skip = new Set(engine.default_skip ?? []);
  const used = new Set();
  for (const slot of engine.inputs) {
    const compatible = (item, i) =>
      !used.has(i) &&
      item.role === slot.role &&
      slotAccepts(slot, item.kind === "mask" ? "image" : item.kind);
    const sameSlot = oldInputs.findIndex(
      (item, i) => item.slot === slot.slot && compatible(item, i),
    );
    const occupied = (item) => item?.input || item?.original;
    const fallback = oldInputs.findIndex(
      (item, i) =>
        compatible(item, i) &&
        occupied(item) &&
        !engine.inputs.some(
          (other) =>
            other.slot !== slot.slot && other.slot === item.slot && other.role === item.role,
        ),
    );
    const index = occupied(oldInputs[sameSlot]) ? sameSlot : fallback >= 0 ? fallback : sameSlot;
    if (index >= 0) {
      used.add(index);
      const item = oldInputs[index];
      if (item.input) state.inputs[slot.slot] = item.input;
      else if (item.original)
        state.originalInputs.push({
          ...item.original,
          name: slot.slot,
          input_job_id: item.original.input_job_id ?? sourceJob,
          input_slot: item.original.input_slot ?? item.original.name,
        });
    }
  }
  for (const slot of engine.inputless ? engine.default_skip : []) {
    delete state.inputs[slot];
    state.originalInputs = state.originalInputs.filter((input) => input.name !== slot);
  }
  state.sourceJob = variantSwitch ? sourceJob : null;
  state.seed = variantSwitch ? previous.seed : "random";
  state.count = variantSwitch ? previous.count : 1;
  state.size = variantSwitch ? previous.size : null;
  if (variantSwitch) Object.assign(state.params, previous.params);
  state.duration = engine.controls.frames
    ? Number(fieldValue(engine.controls.frames)) / fpsValue()
    : null;
  if (engine.controls.prompt) state.params[engine.controls.prompt.param] = state.prompt;
  closePopovers();
  renderComposer();
  renderGallery();
  setStatus("");
};
const connectedServerName = (baseUrl) => {
  try {
    const url = new URL(baseUrl);
    return url.hostname.endsWith(".trycloudflare.com") ? "Colab" : url.host;
  } catch {
    return "";
  }
};
const modeModelSummary = (capability) => {
  const names = [...new Set(capability.engines.map(modelName))].filter(Boolean);
  const visible = names.slice(0, 3);
  if (names.length > 3) visible.push(t("moreModels", { n: names.length - 3 }));
  return `${t(capability.engines.length === 1 ? "oneModel" : "modelCount", { n: capability.engines.length })}${visible.length ? ` · ${visible.join(state.lang === "ja" ? "、" : ", ")}` : ""}`;
};
let renderedStale = false;
const catalogIsStale = () =>
  state.catalog?.server.state === "online" &&
  (state.catalog.unverified ||
    Date.now() - Date.parse(state.catalog.server.checked_at) > 10 * 60_000);
const catalogStatusMessage = (server) => {
  if (state.checking || !server || server.state === "checking") return t("checkingBody");
  if (server.error?.code === "timeout") return t("probeTimeout");
  if (server.error?.code === "http") return t("probeHttpError", { status: server.error.status });
  if (server.error?.code === "invalid_response") return t("probeInvalidResponse");
  return t(server.state === "online" ? "emptyCatalogBody" : "offlineBody");
};
const renderConnection = () => {
  const server = state.catalog?.server;
  const online = server?.state === "online";
  const counts = ["image", "video", "audio"]
    .map((kind) => {
      const n = capabilities().filter((c) => c.output === kind).length;
      return n ? t(`${kind}Types`, { n }) : "";
    })
    .filter(Boolean);
  $("#connection").className =
    `connection ${online ? "ok" : server?.state === "offline" ? "offline" : ""}`;
  $("#connection").textContent = state.checking
    ? t("checking")
    : online
      ? `${t("connected")}${server.gpu ? ` · ${server.gpu_label ?? server.gpu.replace(/^NVIDIA /, "")}${server.vram_total ? ` · ${Math.round(server.vram_total / 1024 ** 3)}GB` : ""}` : ""}${counts.length ? ` · ${counts.join(" / ")}` : ""}`
      : t(
          server?.error ? "probeFailed" : server?.state === "offline" ? "offlineTitle" : "checking",
        );
  const reasonsOpen = $("#not-runnable")?.open;
  $("#connection-details").innerHTML =
    `<section id="creation-capabilities" tabindex="-1" aria-labelledby="creation-capabilities-title"><h3 id="creation-capabilities-title">${esc(t("makeAndWhy"))}</h3><p class="hint">${esc(t("makeAndWhyBody"))}</p>${catalogIsStale() && online ? `<p class="hint">${esc(t("previousCheck"))} · <button type="button" class="text-link" data-reconnect${state.checking ? " disabled" : ""}>${esc(t("recheck"))}</button></p>` : ""}<ul class="creation-modes">${capabilities()
      .map(
        (c) =>
          `<li><strong>${esc(text(c.label))}</strong><span>${esc(modeModelSummary(c))}</span></li>`,
      )
      .join("")}${(state.catalog?.unavailable ?? [])
      .map(
        (c) =>
          `<li class="unavailable-mode"><strong>${esc(text(c.label))} — ${esc(t("unavailableMode"))}</strong><span>${esc(text(c.reasons[0]?.message))}</span><button type="button" class="text-link" data-missing-details aria-label="${esc(t("missingDetailsFor", { name: text(c.label) }))}">${esc(t("missingDetails"))}</button></li>`,
      )
      .join(
        "",
      )}</ul>${!capabilities().length ? `<p class="hint">${esc(catalogStatusMessage(server))}</p>` : ""}</section>` +
    facts([
      [t("connectedTo"), esc(server?.base_url ?? state.data?.connection?.base_url)],
      [t("connectionSource"), esc(sourceText(server?.source ?? state.data?.connection?.source))],
      ["GPU", esc(server?.gpu ?? "—")],
      ["VRAM", esc(server?.vram_total ? `${Math.round(server.vram_total / 1024 ** 3)} GB` : "—")],
      [t("version"), esc(server?.comfyui_version ?? "—")],
    ]) +
    `${state.catalog?.not_runnable.length ? `<details id="not-runnable"${reasonsOpen ? " open" : ""}><summary>${esc(t("notRunnable", { n: state.catalog.not_runnable.length }))}</summary><ul class="connection-reasons">${state.catalog.not_runnable.map((p) => `<li><strong>${esc(text(p.title))}</strong><small>${esc(p.preset)}</small>${p.missing.nodes.length ? `<p>${esc(t("missingNodes"))}: ${esc(p.missing.nodes.join(", "))}</p>` : ""}${p.missing.models.length ? `<p>${esc(t("missingModels"))}: ${esc(p.missing.models.join(", "))}</p>` : ""}${p.reason ? `<p>${esc(text(p.reason))}</p>` : ""}</li>`).join("")}</ul></details>` : ""}`;
  $("#url-source-help").textContent = server?.source === "COMFY_AGENT_BASE_URL" ? t("envHelp") : "";
  $("#refresh-connection").disabled = state.checking;
};
const slotPreview = (slot) => {
  const input = state.inputs[slot.slot];
  if (input) {
    const found = input.upload_id ? null : findOutput(input.job_id, input.output_index);
    const output = found?.output ?? input;
    return mediaTag(output, "slot-media", output.kind === "audio");
  }
  const original = state.originalInputs.find((i) => i.name === slot.slot);
  if (original?.url)
    return mediaTag(
      { kind: slot.kind === "mask" ? "image" : slot.kind, url: original.url },
      "slot-media",
      slot.kind === "audio",
    );
  return original ? `<span class="slot-original">${esc(t("inputOriginal"))}</span>` : "";
};
const fitInputPreviews = () => {
  const form = $("#create-form"),
    slots = $("#input-slots");
  if (!form || !slots || $("#online-composer").hidden) return;
  // Suggestions use fixed-size thumbnail rows; explanatory text takes the scroll.
  if (form.classList.contains("has-prompt-suggestions")) return;
  const media = [...slots.querySelectorAll(".slot-media")];
  if (!media.length) return;
  const max = Math.max(...media.map((el) => el.getBoundingClientRect().height));
  const budget = parseFloat(getComputedStyle(form).maxHeight);
  const count = Number(slots.dataset.count) || 1;
  const limit =
    innerWidth <= 600 && count > 1
      ? count >= 3
        ? 76
        : 104
      : count >= 3
        ? 120
        : 150;
  const rows = Math.max(1, Math.ceil(count / 3));
  const height = Math.max(
    28,
    Math.min(
      limit,
      Math.floor((budget - form.scrollHeight + max * rows - 3) / rows),
    ),
  );
  const value = `${height}px`;
  if (slots.style.getPropertyValue("--slot-preview-height") !== value)
    slots.style.setProperty("--slot-preview-height", value);
};
const renderInputs = () => {
  const engine = currentEngine();
  syncInputSkips();
  const hidden = hiddenInputSlots();
  const visibleCount = (engine?.inputs ?? []).filter((slot) => !hidden.has(slot.slot)).length;
  $("#input-slots").dataset.count = String(visibleCount);
  $("#input-slots").style.setProperty(
    "--slot-columns",
    String(Math.max(1, Math.min(visibleCount, 3))),
  );
  unobserveVideos($("#input-slots"));
  $("#input-slots").innerHTML = (engine?.inputs ?? [])
    .filter((slot) => !hidden.has(slot.slot))
    .map((slot) => {
      const filled = slotFilled(slot);
      const kind = slot.kind === "mask" ? "image" : slot.kind;
      const suffix = ["image", "video", "audio"].includes(kind)
        ? kind[0].toUpperCase() + kind.slice(1)
        : "File";
      const accept = slot.kind === "file" ? "image/*,audio/*,video/*" : `${kind}/*`;
      const fileInput = `<input type="file" data-upload-slot="${esc(slot.slot)}" accept="${accept}" aria-label="${esc(t("uploadFile"))}: ${esc(text(slot.label))}">`;
      const actions = filled
        ? `<div class="slot-replace"><button type="button" class="secondary slot-action" data-replace-slot="${esc(slot.slot)}" aria-haspopup="true" aria-expanded="false">${esc(t(`replace${suffix}`))}</button><div class="slot-replace-menu" hidden><button type="button" class="ghost" data-slot-file="${esc(slot.slot)}">${esc(t("uploadFile"))}</button><button type="button" class="ghost" data-pick-slot="${esc(slot.slot)}">${esc(t("pickResult"))}</button>${fileInput}</div></div><button type="button" class="secondary slot-action" data-clear-slot="${esc(slot.slot)}" aria-label="${esc(t("removeInput"))}: ${esc(text(slot.label))}">${esc(t("removeInput"))}</button>`
        : `<label class="file-button slot-action secondary">${esc(t("uploadFile"))}${fileInput}</label><button type="button" class="secondary slot-action" data-pick-slot="${esc(slot.slot)}">${esc(t("pickResult"))}</button>`;
      return `<div class="input-slot ${filled ? "filled" : ""}" data-drop-slot="${esc(slot.slot)}"><div class="slot-heading"><strong>${esc(text(slot.label))}</strong><span>${esc(t(slot.optional ? "optional" : slot.required ? "required" : "bakedInput"))}</span></div><div class="slot-body">${filled ? slotPreview(slot) : `<p class="slot-drop-label">${esc(t(`drop${suffix}`))}</p>${slot.optional ? `<p class="slot-optional-hint">${esc(t("optionalEmpty"))}</p>` : ""}`}<div class="slot-actions">${actions}</div></div></div>`;
    })
    .join("");
  const startSlot = engine?.inputs.find((slot) => hidden.has(slot.slot));
  $("#start-input").hidden = !startSlot;
  $("#start-input").textContent = startSlot
    ? t(
        `start${["image", "mask"].includes(startSlot.kind) ? "Image" : startSlot.kind === "video" || startSlot.role === "video_source" ? "Video" : startSlot.kind === "audio" ? "Audio" : "File"}`,
      )
    : "";
  observeVideos($("#input-slots"));
  requestAnimationFrame(fitInputPreviews);
};
const fieldMarkup = (field) => {
  let value = fieldValue(field);
  const attr = `data-param="${esc(field.param)}"${field.required ? " required" : ""}`;
  let input;
  if (field.choices)
    input = `<select ${attr}>${field.choices.map((choice, i) => `<option value="${i}"${JSON.stringify(choice) === JSON.stringify(value) ? " selected" : ""}>${esc(typeof choice === "object" ? JSON.stringify(choice) : choice)}</option>`).join("")}</select>`;
  else if (field.type === "bool")
    input = `<input type="checkbox" ${attr}${value ? " checked" : ""}>`;
  else if (["int", "float"].includes(field.type))
    input = `<input type="number" ${attr} value="${esc(value ?? "")}" step="${field.type === "int" ? 1 : "any"}"${field.min === undefined ? "" : ` min="${field.min}"`}${field.max === undefined ? "" : ` max="${field.max}"`}>`;
  else
    input = `<textarea ${attr} rows="2">${esc(field.type === "json" && value !== undefined ? JSON.stringify(value) : (value ?? ""))}</textarea>`;
  return `<label class="field"><span>${esc(text(field.label))}</span>${input}<small class="param-hint">${esc(field.param)}</small></label>`;
};
const aspectLabel = (w, h) => {
  for (const ratio of ["1:1", "16:9", "9:16", "4:3"]) {
    const [a, b] = ratio.split(":").map(Number);
    if (Math.abs(w / h - a / b) < 0.025) return ratio;
  }
  return `${w}×${h}`;
};
const renderModelOptions = () => {
  const cap = currentCapability();
  const query = state.modelQuery.trim().toLocaleLowerCase();
  const engines = cap.engines.filter((engine) =>
    `${text(engine.title)} ${modelName(engine)} ${t(engine.speed ?? "normal")}`
      .toLocaleLowerCase()
      .includes(query),
  );
  const grouped = cap.engines.length > 6;
  const row = (engine) => {
    const summary = text(engine.summary);
    const baseTitle = text(engine.title).replace(/(?:（設定\s+\d+）|\s+\(Option\s+\d+\))$/, "");
    const redundant = [
      text(engine.title),
      modelName(engine),
      `${modelName(engine)} で${baseTitle}`,
      `${baseTitle} with ${modelName(engine)}`,
      ...capabilities().map((capability) => text(capability.label)),
    ];
    const detail = grouped
      ? summary && !redundant.includes(summary)
        ? summary
        : ""
      : modelName(engine);
    return `<button type="button" class="menu-option" data-engine="${esc(engine.preset)}" aria-pressed="${engine.preset === state.engineName && !state.autoModel}"><strong>${esc(text(engine.title))}</strong><span class="badge">${esc(t(engine.speed ?? "normal"))}</span>${engine.inputless ? `<span class="badge">${esc(t(engine.inputs.some((input) => input.role === "video_source") ? "inputlessVideo" : "inputlessImage"))}</span>` : ""}${detail ? `<small>${esc(detail)}</small>` : ""}</button>`;
  };
  const groups = new Map();
  for (const engine of engines) {
    const model = modelName(engine);
    if (!groups.has(model)) groups.set(model, []);
    groups.get(model).push(engine);
  }
  $("#model-options").innerHTML = !engines.length
    ? `<p class="hint">${esc(t("noModels"))}</p>`
    : cap.engines.length > 6
      ? [...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([model, items]) =>
              `<section class="model-group"><h4>${esc(model)}</h4>${items.map(row).join("")}</section>`,
          )
          .join("")
      : engines.map(row).join("");
};
const renderSettings = () => {
  const engine = currentEngine();
  if (!engine) return;
  const c = engine.controls;
  const imageAttach = capabilities().some((cap) =>
    cap.engines.some((e) => e.inputs.some((i) => i.kind === "image")),
  );
  const chips = [
    currentCapability().engines.length > 1
      ? `<button type="button" class="setting-chip" data-open-popover="model">${esc(t(state.autoModel ? "modelAuto" : "modelChosen", { name: text(state.autoModel ? currentCapability().engines.find((e) => e.default).title : engine.title) }))} ▾</button>`
      : "",
    !engine.inputs.some((i) => i.kind === "image") && imageAttach
      ? `<label class="setting-chip file-button">${esc(t("attachImage"))}<input type="file" data-attach-file accept="image/*" aria-label="${esc(t("attachImage"))}"></label><button type="button" class="setting-chip" data-pick-slot="attach">${esc(t("pickResult"))}</button>`
      : "",
    c.frames
      ? `<button type="button" class="setting-chip" data-open-popover="duration">${esc(
          t("durationChip", {
            n: Math.round(Number(state.duration || 0) * 2) / 2,
          }),
        )} ▾</button>`
      : "",
    c.width && c.height
      ? `<button type="button" class="setting-chip" data-open-popover="size">${esc(aspectLabel(Number(fieldValue(c.width)), Number(fieldValue(c.height))))} ▾</button>`
      : "",
    c.count
      ? `<button type="button" class="setting-chip" data-open-popover="count">${esc(t(currentCapability().output === "image" ? "countChip" : "countOther", { n: state.count }))} ▾</button>`
      : "",
    `<button type="button" class="setting-chip" data-open-popover="details">${esc(t("advanced"))}</button>`,
  ];
  $("#setting-chips").innerHTML = chips.join("");
  $("#model-popover").innerHTML =
    `<h3>${esc(t("modelSelect"))}</h3>${currentCapability().engines.length > 6 ? `<input id="model-filter" type="search" value="${esc(state.modelQuery)}" placeholder="${esc(t("modelFilter"))}" aria-label="${esc(t("modelFilter"))}">` : ""}<button type="button" class="menu-option" data-engine="auto"><strong>${esc(t("automatic"))} (${esc(text(currentCapability().engines.find((e) => e.default).title))})</strong></button><div id="model-options"></div>`;
  renderModelOptions();
  if (c.frames) {
    const fps = fpsValue();
    const [min, max] = engine.constraints?.duration_s ?? [1 / fps, 10];
    const low = Math.max(1, Math.ceil(min * fps), c.frames.min ?? 1);
    const high = Math.min(Math.floor(max * fps), c.frames.max ?? Infinity);
    const step = c.frames.step ?? 1,
      offset = c.frames.step_offset ?? 0;
    const allowed = (n) =>
      Number.isInteger(n) &&
      n >= low &&
      n <= high &&
      (!c.frames.choices || c.frames.choices.includes(n)) &&
      Math.abs((n - offset) / step - Math.round((n - offset) / step)) < 1e-8;
    const candidates = c.frames.choices?.filter(allowed);
    const first = offset + Math.ceil((low - offset) / step) * step;
    const last = offset + Math.floor((high - offset) / step) * step;
    const durations = new Map();
    for (let index = 0; index < 240 && durations.size < 120; index++) {
      const seconds = Math.max(0.5, Math.ceil(min * 2) / 2) + index / 2;
      if (seconds > max) break;
      const frames = candidates
        ? candidates.reduce(
            (best, n) =>
              best === null || Math.abs(n / fps - seconds) < Math.abs(best / fps - seconds)
                ? n
                : best,
            null,
          )
        : first <= last
          ? Math.min(
              last,
              Math.max(first, offset + Math.round((seconds * fps - offset) / step) * step),
            )
          : null;
      if (frames !== null && !durations.has(frames)) durations.set(frames, seconds);
    }
    $("#duration-popover").innerHTML =
      `<h3>${esc(t("durationLabel"))}</h3><div class="duration-options">${[...durations].map(([frames, seconds]) => `<button type="button" class="secondary" data-duration="${frames / fps}" aria-pressed="${Math.abs(frames / fps - state.duration) < 0.001}">${esc(t("durationChip", { n: seconds }))}</button>`).join("")}</div>`;
  }
  $("#size-popover").innerHTML =
    `<h3>${esc(t("sizeLabel"))}</h3>${(engine.constraints?.sizes ?? []).map(([w, h]) => `<button type="button" class="menu-option" data-size="${w}:${h}"><strong>${esc(aspectLabel(w, h))}</strong><small>${w} × ${h}</small></button>`).join("")}`;
  $("#count-popover").innerHTML =
    `<h3>${esc(t("countLabel"))}</h3>${[1, 2, 3, 4].map((n) => `<button type="button" class="menu-option" data-count="${n}"${state.seed !== "random" && n > 1 ? " disabled" : ""}>${esc(t(currentCapability().output === "image" ? "countChip" : "countOther", { n }))}</button>`).join("")}${state.seed !== "random" ? `<p class="hint">${esc(t("fixedSeedCount"))}</p>` : ""}`;
  const fields = [
    c.negative_prompt,
    c.strength,
    ...c.other,
    typeof c.fps === "object" ? c.fps : null,
  ].filter(Boolean);
  $("#details-popover").innerHTML =
    `<h3>${esc(t("advanced"))}</h3>${c.frames ? `<p id="duration-details" class="hint">${esc(t("durationDetails", { s: Number((state.duration || 0).toFixed(2)), frames: Math.round((state.duration || 0) * fpsValue()) }))}</p>` : ""}${fields.map(fieldMarkup).join("")}${c.seed ? `<div class="seed-choice"><label><input type="radio" name="seed-mode" value="random"${state.seed === "random" ? " checked" : ""}> ${esc(t("seedRandom"))}</label><label><input type="radio" name="seed-mode" value="fixed"${state.seed !== "random" ? " checked" : ""}> ${esc(t("seedFixed"))}</label></div><label class="field" id="fixed-seed-field"${state.seed === "random" ? " hidden" : ""}><span>${esc(t("fixedSeed"))}</span><input id="fixed-seed" type="number" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1" value="${typeof state.seed === "number" ? state.seed : 0}"${state.seed === "random" ? " disabled" : ""}></label>` : ""}${engine.stale ? `<p class="hint">${esc(t("staleProfile"))}</p>` : ""}`;
};
const renderActions = () => {
  const engine = currentEngine();
  syncInputSkips();
  const missing = engine?.inputs.find(
    (slot) =>
      slot.required &&
      !state.skip.has(slot.slot) &&
      !state.inputs[slot.slot] &&
      !state.originalInputs.some((i) => i.name === slot.slot),
  );
  const reason = state.character
    ? t("characterAgentOnly")
    : missing
      ? t("inputNeeded", { name: text(missing.label) })
      : "";
  $("#generate").disabled = !engine || Boolean(reason) || state.generating;
  $("#generate").textContent = t(state.generating ? "generating" : "generate");
  $("#generate").classList.toggle("secondary", Boolean(state.character));
  $("#ask-agent").classList.toggle("secondary", !state.character);
  $("#ask-agent").textContent = t("askAgent");
  const inputless = capabilities()
    .flatMap((cap) => cap.engines)
    .find((e) => e.preset === engine?.preset && e.inputless);
  const noSource = inputless && inputless.default_skip.every((slot) => state.skip.has(slot));
  $("#action-note").textContent =
    reason ||
    (noSource && !engine.inputless
      ? t(
          currentCapability().output === "image"
            ? "noImageImage"
            : inputless.inputs.some((slot) => slot.role === "video_source")
              ? "noVideoVideo"
              : "noImageVideo",
        )
      : "");
  $("#character-chip").innerHTML = state.character
    ? `<span class="character-chip">${esc(t("characterAttached", { name: state.character }))}<button class="ghost" type="button" data-clear-character aria-label="${esc(t("clearInput"))}">×</button></span>`
    : "";
};
const renderComposer = () => {
  renderedStale = catalogIsStale();
  const server = state.catalog?.server;
  const online = server?.state === "online" && capabilities().length > 0;
  $("#online-composer").hidden = !online;
  $("#offline-panel").hidden = online;
  $("#first-hint").textContent = online && !state.hintSeen ? t("firstHint") : "";
  if (!online) {
    closePopovers();
    const pending = state.checking || !server || server.state === "checking";
    $("#offline-panel").innerHTML =
      `<h2>${esc(t(pending ? "checking" : server.error ? "probeFailed" : server.state === "online" ? "emptyCatalog" : "offlineTitle"))}</h2><p>${esc(catalogStatusMessage(server))}</p>${server ? `<div class="offline-url"><code>${esc(server.base_url)}</code><small>${esc(sourceText(server.source))}</small></div><div class="actions">${server.state === "online" ? `<button type="button" class="secondary" data-capability-details>${esc(t("capabilityDetails"))}</button>` : ""}<button type="button" data-reconnect${state.checking ? " disabled" : ""}>${esc(t(state.checking ? "checking" : server.error || server.state === "online" ? "recheck" : "reconnect"))}</button><button type="button" class="secondary" data-url-help>${esc(t("changeUrl"))}</button><button type="button" class="secondary" data-ask>${esc(t("askAgent"))}</button></div><p class="hint">${esc(t("offlineNote"))}</p>` : ""}`;
    return;
  }
  const cap = currentCapability();
  if (!cap) return;
  const host = connectedServerName(server.base_url);
  const context = t(capabilities().length === 1 ? "singleModeContext" : "modeContext", {
    server: host ? (state.lang === "ja" ? `（${host}）` : ` (${host})`) : "",
    n: capabilities().length,
    name: text(capabilities()[0].label),
  });
  const ending =
    context.match(/（\d+ 種類）$|だけです$|\(\d+\)$|ComfyUI(?: \([^)]*\))?$/)?.[0] ?? "";
  $("#mode-context").innerHTML =
    `<span>${esc(context.slice(0, context.length - ending.length))}<span class="context-details">${esc(ending)}&nbsp;· <button type="button" class="text-link" data-capability-details aria-haspopup="dialog">${esc(t("capabilityDetails"))}</button></span></span>${state.checking ? `<span class="previous-check">${esc(t("checkingBody"))}</span>` : catalogIsStale() ? `<span class="previous-check">${esc(t("previousCheck"))} · <button type="button" class="text-link" data-reconnect>${esc(t("recheck"))}</button></span>` : ""}`;
  $("#drop-overlay").textContent = t("dropHere");
  $("#prompt").required = Boolean(currentEngine()?.controls.prompt?.required);
  $("#modes").hidden = capabilities().length === 1;
  $("#modes").innerHTML = capabilities()
    .map(
      (c) =>
        `<button class="mode" type="button" data-capability="${esc(c.id)}" title="${esc(modeModelSummary(c))}" aria-describedby="mode-description-${esc(c.id)}" aria-pressed="${state.capability === c.id}">${esc(text(c.label))}</button><span class="sr-only" id="mode-description-${esc(c.id)}">${esc(modeModelSummary(c))}</span>`,
    )
    .join("");
  const placeholders = {
    text_to_image: capabilities().some((c) => c.capability === "image_edit")
      ? "placeholder_editable"
      : "placeholder_image",
    image_edit: "placeholder_edit",
    image_to_video: "placeholder_animate",
    first_last_frame: "placeholder_animate",
    text_to_video: "placeholder_video",
    reference_to_video: "placeholder_video",
    video_to_video: "placeholder_video",
    music: "placeholder_audio",
    sound_effect: "placeholder_audio",
    speech: "placeholder_audio",
  };
  $("#prompt").placeholder = t(placeholders[cap.capability] ?? "placeholder_other");
  $("#prompt").value = state.prompt;
  renderInputs();
  renderSettings();
  renderActions();
  renderAssist();
};
const matchesFilter = ({ job, output }) =>
  state.filter === "all" || state.filter === "favorite"
    ? state.filter !== "favorite" || job.favorite
    : output.kind === state.filter;
const renderFilters = () => {
  $("#filters").innerHTML = [
    ["all", "filterAll"],
    ["favorite", "filterFav"],
    ["image", "filterImage"],
    ["video", "filterVideo"],
    ...(allOutputs().some(({ output }) => output.kind === "audio")
      ? [["audio", "filterAudio"]]
      : []),
  ]
    .map(
      ([id, label]) =>
        `<button type="button" class="filter-button" data-filter="${id}" aria-pressed="${state.filter === id}">${esc(t(label))}</button>`,
    )
    .join("");
};
const renderGallery = () => {
  const items = allOutputs().filter(matchesFilter);
  $("#gallery-count").textContent = t("items", { n: items.length });
  const animate = capabilities().some((c) => c.capability === "image_to_video"),
    edit = capabilities().some((c) => c.capability === "image_edit");
  const html = items.length
    ? items
        .map(
          ({ job, output }) =>
            `<article class="card ${inContext(job.job_id, output.index) ? "in-context" : ""}" tabindex="0" role="button" draggable="true" data-job="${esc(job.job_id)}" data-index="${output.index}" aria-label="${esc(output.filename)}">${mediaTag(output)}<button type="button" class="card-favorite" data-favorite-job="${esc(job.job_id)}" aria-pressed="${job.favorite}" aria-label="${esc(t(job.favorite ? "unfavorite" : "favorite"))}">${job.favorite ? "★" : "☆"}</button><div class="card-actions">${output.kind === "image" && animate ? `<button type="button" data-card-mode="image_to_video" data-selection="${esc(job.job_id)}:${output.index}">${esc(t("animate"))}</button>` : ""}${output.kind === "image" && edit ? `<button type="button" data-card-mode="image_edit" data-selection="${esc(job.job_id)}:${output.index}">${esc(t("editImage"))}</button>` : ""}${engineForJob(job) && job.source === "local" ? `<button type="button" data-load-job="${esc(job.job_id)}">${esc(t("recreate"))}</button>` : ""}</div><div class="meta"><span>${esc(jobModelName(job, output.kind))}</span>${output.kind === "video" ? '<span aria-hidden="true">▶</span>' : ""}</div></article>`,
        )
        .join("")
    : `<p class="empty gallery-empty">${esc(t("noOutputs"))}</p>`;
  if ($("#gallery").dataset.html !== html) {
    unobserveVideos($("#gallery"));
    $("#gallery").innerHTML = html;
    $("#gallery").dataset.html = html;
    observeVideos($("#gallery"));
  }
};
const renderRunStatus = () => {
  if (!state.runStatusActive) return;
  const runs = (state.data?.runs ?? []).filter((run) => state.trackedRuns.has(run.id));
  const active = runs.filter((run) => run.status === "running");
  const failed = runs.filter((run) => run.status === "failed");
  $("#composer-status").textContent = active.length
    ? `${t("generationProgress", { n: active.length })}${failed.length ? ` · ${t("generationFailures", { n: failed.length })}` : ""}`
    : failed.length
      ? t("generationFailed", {
          reason: (failed[0].error?.message ?? failed[0].error?.code ?? t("failed"))
            .split("\n")[0]
            .slice(0, 160),
        })
      : runs.length
        ? t("generationDone")
        : "";
};
const renderRuns = () => {
  renderRunStatus();
  const runs = (state.data?.runs ?? []).filter(
    (run) => ["running", "failed"].includes(run.status) && !state.dismissedRuns.has(run.id),
  );
  $("#running-gallery").innerHTML = runs
    .map(
      (run) =>
        `<article class="running-card ${esc(run.status)}"><div class="running-visual">${run.status === "running" ? '<span class="spinner"></span>' : '<span class="error-icon">!</span>'}<strong>${esc(t(run.status))}</strong><span>${esc(t("elapsed", { s: Math.max(0, Math.round(((run.finished_at ? Date.parse(run.finished_at) : Date.now()) - Date.parse(run.started_at)) / 1000)) }))}</span></div><div class="meta">${esc(
          modelName(
            capabilities()
              .flatMap((c) => c.engines)
              .find((e) => e.preset === run.preset),
          ),
        )}${run.status === "failed" ? `<button type="button" class="ghost" data-dismiss-run="${esc(run.id)}" aria-label="${esc(t("dismissRun"))}">×</button>` : ""}</div>${run.error ? `<p class="run-error">${esc(run.error.message)}</p>` : ""}</article>`,
    )
    .join("");
};
const renderInspector = () => {
  let html = "";
  if (state.focus?.type === "output") {
    const found = findOutput(state.focus.job_id, state.focus.index);
    if (found) html = renderOutputInspector(found.job, found.output);
  } else if (state.focus?.type === "plan") {
    const plan = state.data?.plans.find((p) => p.id === state.focus.id);
    if (plan) html = renderPlanInspector(plan);
  }
  const deleteButton = $("#detail-delete");
  const selectedOutput =
    state.focus?.type === "output" ? findOutput(state.focus.job_id, state.focus.index) : null;
  deleteButton.hidden = !selectedOutput || selectedOutput.job.scope !== "local";
  if (selectedOutput) {
    deleteButton.dataset.deleteOutput = `${selectedOutput.job.job_id}:${selectedOutput.output.index}`;
    deleteButton.disabled = ["running", "submitted"].includes(selectedOutput.job.status);
  }
  const root = $("#inspector");
  if (root.dataset.html === html) return;
  const editor = root.querySelector("[data-form] input");
  const saved =
    editor && root.dataset.focus === JSON.stringify(state.focus)
      ? {
          value: editor.value,
          active: document.activeElement === editor,
          start: editor.selectionStart,
          end: editor.selectionEnd,
        }
      : null;
  unobserveVideos(root);
  root.innerHTML = html;
  root.dataset.html = html;
  root.dataset.focus = JSON.stringify(state.focus);
  observeVideos(root);
  const next = root.querySelector("[data-form] input");
  if (saved && next) {
    next.value = saved.value;
    if (saved.active) {
      next.focus();
      next.setSelectionRange(saved.start, saved.end);
    }
  }
};
const renderAgent = () => {
  const requests = (state.data?.requests ?? []).filter((r) => !r.handled),
    plans = state.data?.plans ?? [];
  $("#agent-button").hidden = !requests.length && !plans.length;
  $("#agent-button").textContent = t("agentCount", { n: requests.length + plans.length });
  $("#agent-area").innerHTML =
    requests
      .map(
        (r) =>
          `<div class="request-item"><span class="badge proposed">${esc(t("pending"))}</span><p>${esc(r.text)}</p></div>`,
      )
      .join("") +
    plans
      .map((plan) => {
        const done = plan.steps.filter((s) => ["done", "skipped"].includes(s.status)).length;
        return `<section class="agent-plan"><button type="button" class="ghost plan-title" data-plan="${esc(plan.id)}">${esc(plan.title)} <span class="badge ${esc(plan.status)}">${esc(t(plan.status))}</span></button><p class="hint">${esc(t("agentStepProgress", { done, total: plan.steps.length }))}</p><div class="plan-progress"><span style="width:${(done / plan.steps.length) * 100}%"></span></div>${plan.steps
          .map(
            (step) =>
              `<div class="agent-step"><span class="badge ${esc(step.status)}">${esc(t(step.status))}</span><span>${esc(step.title)}</span>${step.job_ids
                .flatMap((id) => (state.data?.jobs ?? []).filter((j) => j.job_id.startsWith(id)))
                .map(
                  (job) =>
                    `<button type="button" class="secondary" data-job="${esc(job.job_id)}" data-index="0">${esc(t("showResult"))}</button>`,
                )
                .join("")}</div>`,
          )
          .join("")}</section>`;
      })
      .join("");
};
const renderCharacters = () => {
  const query = $("#character-search").value.trim().toLocaleLowerCase();
  $("#character-search").placeholder = t("characterSearch");
  $("#characters").innerHTML = (state.data?.characters ?? [])
    .filter((c) => `${c.name} ${c.display_name ?? ""}`.toLocaleLowerCase().includes(query))
    .map((c) => {
      const thumb = c.references[0] ?? c.gallery[0];
      return `<button type="button" class="character-option" data-character="${esc(c.name)}">${thumb ? `<img src="${esc(thumb.url)}" alt="">` : ""}<span><strong>${esc(c.display_name ?? c.name)}</strong><small>${esc(c.appearance ?? "")}</small></span></button>`;
    })
    .join("");
  $("#request-character").hidden = !state.data?.characters.length;
};
const serialInputs = () => {
  syncInputSkips();
  return Object.fromEntries([
    ...state.originalInputs
      .filter((input) => input.input_job_id && !state.skip.has(input.name))
      .map((input) => [
        input.name,
        { input_job_id: input.input_job_id, input_slot: input.input_slot },
      ]),
    ...Object.entries(state.inputs)
      .filter(([slot]) => !state.skip.has(slot))
      .map(([slot, input]) => [
        slot,
        input.upload_id
          ? { upload_id: input.upload_id }
          : { job_id: input.job_id, output_index: input.output_index },
      ]),
  ]);
};
const composerSize = () => {
  const c = currentEngine()?.controls;
  const w = Number(fieldValue(c?.width)),
    h = Number(fieldValue(c?.height));
  return w > 0 && h > 0 ? [w, h] : undefined;
};
const contextData = () => ({
  task: currentCapability()?.capability,
  preset: state.engineName ?? undefined,
  model_label: currentEngine()?.model_label,
  duration_s: state.duration || undefined,
  size: composerSize(),
  aspect: composerSize()?.join(":"),
  input_slots: (currentEngine()?.inputs ?? []).flatMap((slot) => {
    const reference = serialInputs()[slot.slot];
    return reference ? [{ slot: slot.slot, kind: slot.kind, role: slot.role, reference }] : [];
  }),
  params: state.params,
  count: state.count,
  seed: state.seed,
  inputs: serialInputs(),
  source_job_id: state.sourceJob ?? undefined,
  skip: [...state.skip],
});
const renderContext = () => {
  $("#context").innerHTML =
    (state.character
      ? `<span class="character-chip">${esc(t("characterAttached", { name: state.character }))}<button type="button" class="ghost" data-clear-character>×</button></span>`
      : "") +
    state.context
      .map((s) => {
        const found = findOutput(s.job_id, s.output_index);
        return found
          ? `<span class="context-chip">${mediaTag(found.output, "", false)}<span>${esc(found.output.filename)}</span><button type="button" class="ghost" data-remove-context="${esc(s.job_id)}:${s.output_index}" aria-label="${esc(t("removeContext"))}">×</button></span>`
          : "";
      })
      .join("");
  observeVideos($("#context"));
  const e = currentEngine() ?? state.engineCache;
  const lines = [
    currentCapability() ? text(currentCapability().label) : "",
    e ? `${t("model")}: ${modelName(e)}` : "",
    state.prompt ? `${t("prompt")}: ${state.prompt}` : "",
    ...(e?.inputs ?? []).map((slot) => {
      const input = state.inputs[slot.slot],
        found = input && !input.upload_id ? findOutput(input.job_id, input.output_index) : null;
      const original = state.originalInputs.find((i) => i.name === slot.slot);
      return `${text(slot.label)}: ${state.skip.has(slot.slot) ? t("omittedInput") : input ? (input.filename ?? found?.output.filename ?? t("inputOriginal")) : (original?.server_name ?? t("none"))}`;
    }),
    state.duration
      ? t("durationDetails", {
          s: Number(state.duration.toFixed(2)),
          frames: Math.round(state.duration * fpsValue()),
        })
      : "",
    e?.controls.count
      ? t(currentCapability()?.output === "image" ? "countChip" : "countOther", { n: state.count })
      : "",
    e?.controls.seed
      ? `${t("seed")}: ${state.seed === "random" ? t("seedRandom") : state.seed}`
      : "",
  ];
  $("#request-context").textContent = lines.filter(Boolean).join("\n");
};
const openRequest = () => {
  closePopovers();
  renderContext();
  $("#request-text").value =
    state.prompt ||
    (currentCapability()
      ? t("requestIntro", { task: text(currentCapability().label) })
      : t("requestGeneric"));
  setRequestStatus("");
  $("#copy-fallback").hidden = true;
  showDialog("request-dialog");
};
const requestBody = (send) => ({
  text: $("#request-text").value.trim(),
  selected: state.context,
  character: state.character ?? undefined,
  context: contextData(),
  lang: state.lang,
  send,
});
const copyPromptText = async (prompt, fallback, report, copiedKey = "copied") => {
  try {
    await navigator.clipboard.writeText(prompt);
    report(t(copiedKey));
  } catch {
    fallback.value = prompt;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    report(t("clipboardFallback"));
  }
};
const copyRequest = async () => {
  if (!$("#request-text").value.trim()) return setRequestStatus(t("needText"));
  try {
    const { prompt } = await api("/api/requests", requestBody(false));
    await copyPromptText(prompt, $("#copy-fallback"), setRequestStatus);
  } catch (error) {
    setRequestStatus(error.message);
  }
};

const updateAssistButtons = () => {
  $("#prompt-assist").textContent = t("assistStart");
  $("#prompt-assist-description").textContent = t("assistDescription", {
    name: modelName(currentEngine()) || t("model"),
  });
  $("#prompt-assist").disabled = !state.prompt.trim() || state.assist?.phase === "waiting";
  $("#prompt-undo").textContent = t("assistUndo");
  $("#prompt-undo").hidden = state.assistOriginal === null;
};
const assistMatches = () =>
  state.assist?.preset === state.engineName && state.assist?.capability === state.capability;
const renderAssist = () => {
  updateAssistButtons();
  const panel = $("#prompt-assist-panel"),
    a = state.assist;
  panel.hidden = !a;
  $("#create-form").classList.toggle("has-prompt-suggestions", Boolean(a?.answer));
  panel.setAttribute("aria-label", t("assistTitle"));
  if (!a) {
    panel.innerHTML = "";
    return;
  }
  const active = document.activeElement?.id === "assist-prompt";
  const selection = active
    ? [$("#assist-prompt").selectionStart, $("#assist-prompt").selectionEnd]
    : null;
  const scroll = panel.querySelector(".assist-content")?.scrollTop ?? 0;
  const promptScroll = $("#assist-prompt")?.scrollTop ?? 0;
  const item = a.answer?.suggestions[a.index];
  const mismatch = !assistMatches();
  const settings = Object.entries(item?.settings ?? {})
    .map(([key, value]) => {
      const name =
        key === "negative_prompt"
          ? `${t("negative")}: ${value}`
          : key === "duration_s"
            ? t("durationChip", { n: value })
            : Array.isArray(value)
              ? `${value[0]} × ${value[1]}`
              : value;
      return `<button type="button" class="secondary" data-assist-setting="${esc(key)}"${mismatch ? " disabled" : ""}>${esc(t("assistApply", { name }))}</button>`;
    })
    .join("");
  panel.innerHTML = `${item ? `<div class="assist-editor"><h3 class="assist-title">${esc(t("assistTitle"))}</h3>
    ${a.answer.suggestions.length > 1 ? `<div class="assist-tabs" aria-label="${esc(t("assistPrompt"))}">${a.answer.suggestions.map((_, i) => `<button type="button" class="secondary" data-assist-option="${i}" aria-pressed="${a.index === i}">${esc(t("assistOption", { n: i + 1 }))}</button>`).join("")}</div>` : ""}
    <label><span class="sr-only">${esc(t("assistPrompt"))}</span><textarea id="assist-prompt" class="assist-prompt" rows="8" maxlength="32000">${esc(item.prompt)}</textarea></label>
  </div>` : ""}<div class="assist-content">${!item ? `<h3 class="assist-title">${esc(t("assistTitle"))}</h3>` : ""}${
    a.phase === "waiting"
      ? `<p role="status">${esc(t("assistWaiting"))}</p>${a.hint ? `<p>${esc(t("assistHint"))}</p>` : ""}`
      : item
        ? `
    ${item.explanation?.[state.lang] ? `<h3>${esc(t("assistMeaning"))}</h3><p class="assist-explanation">${esc(item.explanation[state.lang])}</p>` : ""}
    ${item.notes?.[state.lang] ? `<p class="hint assist-notes">${esc(item.notes[state.lang])}</p>` : ""}
    ${mismatch ? `<p>${esc(t("assistMismatch"))}</p>` : ""}
    <div class="assist-settings">${settings}</div>`
        : ""
  }
    <p id="assist-notice" role="status">${esc(a.message || "")}</p>
    <textarea id="assist-copy-fallback" class="assist-copy-fallback" rows="3" readonly hidden aria-label="${esc(t("assistCopy"))}"></textarea>
  </div><div class="assist-actions"><p class="assist-scroll-hint" hidden>${esc(t("assistScrollHint"))}</p>${item ? `<button type="button" data-assist-use${mismatch || !item.prompt.trim() ? " disabled" : ""}>${esc(t("assistUse"))}</button><button type="button" class="secondary" data-assist-copy-prompt${!item.prompt.trim() ? " disabled" : ""}>${esc(t("assistCopyPrompt"))}</button>` : ""}${a.hint && a.promptText ? `<button type="button" class="secondary" data-assist-copy>${esc(t("assistCopy"))}</button>` : ""}<button type="button" class="secondary" data-assist-close>${esc(t(a.phase === "waiting" ? "assistCancel" : "close"))}</button></div>`;
  if (active && $("#assist-prompt")) {
    $("#assist-prompt").focus({ preventScroll: true });
    $("#assist-prompt").setSelectionRange(...selection);
  }
  panel.querySelector(".assist-content").scrollTop = scroll;
  requestAnimationFrame(() => {
    sizeAssistPrompt();
    if (active && $("#assist-prompt")) $("#assist-prompt").scrollTop = promptScroll;
    updateAssistOverflow();
    fitInputPreviews();
  });
};
const sizeAssistPrompt = () => {
  const field = $("#assist-prompt");
  if (!field) return;
  const style = getComputedStyle(field),
    min = parseFloat(style.minHeight),
    max = parseFloat(style.maxHeight),
    scroll = field.scrollTop;
  field.style.height = `${min}px`;
  field.style.height = `${Math.min(max, Math.max(min, field.scrollHeight + 2))}px`;
  field.scrollTop = scroll;
};
const updateAssistOverflow = () => {
  const panel = $("#prompt-assist-panel"),
    content = panel.querySelector(".assist-content"),
    hint = panel.querySelector(".assist-scroll-hint");
  if (!content || !hint) return;
  const selfHeight = hint.hidden ? 0 : hint.getBoundingClientRect().height;
  hint.hidden =
    !state.assist?.answer || content.scrollHeight - content.clientHeight <= selfHeight + 2;
};
const copySuggestedPrompt = async (button) => {
  const a = state.assist,
    item = a?.answer?.suggestions[a.index];
  if (!item?.prompt.trim()) return;
  try {
    await navigator.clipboard.writeText(item.prompt);
    button.textContent = t("assistPromptCopied");
    setTimeout(() => {
      if (button.isConnected) button.textContent = t("assistCopyPrompt");
    }, 2000);
  } catch {
    const field = $("#assist-prompt");
    field.focus();
    field.select();
    a.message = t("assistSelectPrompt");
    $("#assist-notice").textContent = a.message;
  }
};
const pollAssist = async (a) => {
  if (state.assist !== a || a.phase !== "waiting") return;
  try {
    const { suggestion } = await api(`/api/requests/${encodeURIComponent(a.id)}/suggestion`);
    if (state.assist !== a) return;
    if (suggestion) {
      a.answer = suggestion;
      a.phase = "ready";
      a.index = 0;
      clearTimeout(a.hintTimer);
      renderAssist();
      return;
    }
  } catch {
    // Keep waiting through a temporary local server failure; copying remains available.
  }
  if (state.assist === a) a.pollTimer = setTimeout(() => void pollAssist(a), 1500);
};
const closeAssist = () => {
  clearTimeout(state.assist?.pollTimer);
  clearTimeout(state.assist?.hintTimer);
  state.assist = null;
  renderAssist();
};
const startAssist = async () => {
  if (!state.prompt.trim() || !currentEngine() || state.assist?.phase === "waiting") return;
  closeAssist();
  const a = { phase: "waiting", preset: state.engineName, capability: state.capability, index: 0 };
  state.assist = a;
  renderAssist();
  try {
    const result = await api("/api/requests", {
      kind: "prompt_assist",
      text: state.prompt.trim(),
      lang: state.lang,
      context: contextData(),
      character: state.character ?? undefined,
      selected: state.context,
      send: true,
    });
    if (state.assist !== a) return;
    a.id = result.request.id;
    a.promptText = result.prompt;
    a.hintTimer = setTimeout(() => {
      if (state.assist === a && a.phase === "waiting") {
        a.hint = true;
        renderAssist();
      }
    }, 20000);
    void pollAssist(a);
    void load();
  } catch (error) {
    if (state.assist !== a) return;
    a.phase = "error";
    a.message = error.message;
    renderAssist();
  }
};
const replacePrompt = (value) => {
  state.prompt = value;
  const c = currentEngine()?.controls.prompt;
  if (c) state.params[c.param] = value;
  $("#prompt").value = value;
  updateAssistButtons();
};
const applyAssistSetting = (key) => {
  if (!assistMatches()) return;
  const value = state.assist.answer?.suggestions[state.assist.index]?.settings?.[key];
  const c = currentEngine().controls;
  const changes = {};
  const set = (field, v) => {
    if (
      !field ||
      (field.type === "int" && !Number.isInteger(v)) ||
      (field.min !== undefined && v < field.min) ||
      (field.max !== undefined && v > field.max) ||
      (field.choices && !field.choices.includes(v)) ||
      (field.step &&
        Math.abs(
          (v - (field.step_offset ?? 0)) / field.step -
            Math.round((v - (field.step_offset ?? 0)) / field.step),
        ) > 1e-8)
    )
      throw new Error();
    changes[field.param] = v;
  };
  try {
    if (key === "negative_prompt") set(c.negative_prompt, value);
    else if (key === "duration_s") {
      const bounds = currentEngine().constraints?.duration_s;
      if (bounds && (value < bounds[0] || value > bounds[1])) throw new Error();
      set(c.frames, Math.round(value * fpsValue()));
      state.duration = changes[c.frames.param] / fpsValue();
    } else {
      const size =
        key === "size"
          ? value
          : currentEngine().constraints?.sizes?.find(
              ([w, h]) =>
                Math.abs(w / h - Number(value.split(":")[0]) / Number(value.split(":")[1])) < 0.025,
            );
      if (
        !size ||
        (currentEngine().constraints?.sizes &&
          !currentEngine().constraints.sizes.some(([w, h]) => w === size[0] && h === size[1]))
      )
        throw new Error();
      set(c.width, size[0]);
      set(c.height, size[1]);
      state.size = size;
    }
    Object.assign(state.params, changes);
    state.assist.message = t("assistApplied");
    renderSettings();
  } catch {
    state.assist.message = t("assistInvalidSetting");
  }
  renderAssist();
};
const queueRequest = async () => {
  if (!$("#request-text").value.trim()) return setRequestStatus(t("needText"));
  try {
    const { request } = await api("/api/requests", requestBody(true));
    setRequestStatus(t("sent", { id: request.id }));
    await load();
  } catch (error) {
    setRequestStatus(error.message);
  }
};
const openDelete = (selection) => {
  const found = findOutput(selection.job_id, selection.output_index);
  if (!found) return;
  state.deleteTarget = { ...selection, saved_to: found.output.delete_key };
  $("#delete-reason").value = "";
  $("#delete-status").textContent = "";
  showDialog("delete-dialog");
};
const deleteResult = async (event) => {
  event.preventDefault();
  if (!state.deleteTarget || state.deleting) return;
  const target = state.deleteTarget;
  state.deleting = true;
  $("#confirm-delete").disabled = true;
  $("#delete-status").textContent = t("deleting");
  try {
    const result = await api(
      `/api/jobs/${encodeURIComponent(target.job_id)}/outputs/${target.output_index}/delete`,
      { saved_to: target.saved_to, reason: $("#delete-reason").value.trim() || undefined },
    );
    const removed = new Set(result.removed_indices);
    const remap = (selection) => {
      if (selection.job_id !== target.job_id) return selection;
      if (removed.has(selection.output_index)) return null;
      return {
        ...selection,
        output_index:
          selection.output_index -
          result.removed_indices.filter((i) => i < selection.output_index).length,
      };
    };
    state.context = state.context.map(remap).filter(Boolean);
    for (const [slot, input] of Object.entries(state.inputs)) {
      if (input.upload_id) continue;
      const next = remap(input);
      if (next) state.inputs[slot] = next;
      else delete state.inputs[slot];
    }
    if (result.job_removed) {
      state.originalInputs = state.originalInputs.filter(
        (input) => input.input_job_id !== target.job_id,
      );
      if (state.sourceJob === target.job_id) state.sourceJob = null;
    }
    state.focus = null;
    state.editing = null;
    state.deleteTarget = null;
    $("#delete-dialog").close();
    $("#detail-dialog").close();
    await load();
    renderComposer();
    renderContext();
    setStatus(t("deleted"));
  } catch (error) {
    $("#delete-status").textContent = t("deleteFailed", { message: error.message });
  } finally {
    state.deleting = false;
    $("#confirm-delete").disabled = false;
  }
};
const feedback = async (jobId, body) => {
  try {
    await api(`/api/jobs/${encodeURIComponent(jobId)}/feedback`, body);
    state.editing = null;
    await load();
  } catch (error) {
    setStatus(error.message);
  }
};
const selectionFrom = (raw) => {
  const at = raw.lastIndexOf(":");
  return { job_id: raw.slice(0, at), output_index: Number(raw.slice(at + 1)) };
};
const addContext = (selection) => {
  if (
    !state.context.some(
      (s) => s.job_id === selection.job_id && s.output_index === selection.output_index,
    )
  )
    state.context.push(selection);
  renderContext();
  renderGallery();
};
const resolveInputSlot = (kind, slotName = null, preferred = null, emptyOnly = false) => {
  const targeted = slotName && slotName !== "attach";
  const empty = (slot) =>
    !state.inputs[slot.slot] && !state.originalInputs.some((input) => input.name === slot.slot);
  let engine = currentEngine();
  if (targeted) {
    const slot = engine?.inputs.find((input) => input.slot === slotName);
    if (slot && slotAccepts(slot, kind)) return slot;
    setStatus(
      slot
        ? t("slotIncompatible", { name: text(slot.label), kind: t(`${kind}Kind`) })
        : t("inputUnsupported"),
    );
    return null;
  }
  // A full set of compatible slots must not be overwritten or switch tasks.
  const compatible = engine?.inputs.filter((slot) => slotAccepts(slot, kind)) ?? [];
  if (
    !preferred &&
    !engine?.inputless &&
    compatible.length &&
    emptyOnly &&
    !compatible.some(empty)
  ) {
    setStatus(t("noEmptyInput"));
    return null;
  }
  if (preferred || !compatible.length || engine?.inputless) {
    const target =
      (engine?.inputless ? inputModeFor(engine, kind) : null) ??
      capabilities().find(
        (c) =>
          c.capability ===
            (preferred ??
              (kind === "image"
                ? currentCapability()?.output === "image"
                  ? "image_edit"
                  : "image_to_video"
                : "")) && c.engines.some((e) => e.inputs.some((i) => slotAccepts(i, kind))),
      ) ??
      capabilities().find((c) => c.engines.some((e) => e.inputs.some((i) => slotAccepts(i, kind))));
    if (!target) {
      setStatus(t(kind === "image" ? "imageUnsupported" : "inputUnsupported"));
      return null;
    }
    const suitable =
      target.engines.find(
        (e) =>
          e.preset === engine?.preset && !e.inputless && e.inputs.some((i) => slotAccepts(i, kind)),
      ) ??
      target.engines.find((e) => e.default && e.inputs.some((i) => slotAccepts(i, kind))) ??
      target.engines.find((e) => e.inputs.some((i) => slotAccepts(i, kind)));
    chooseEngine(target.id, suitable.preset);
    engine = currentEngine();
  }
  const slot = engine?.inputs.find(
    (input) => slotAccepts(input, kind) && (!emptyOnly || empty(input)),
  );
  if (!slot) {
    setStatus(t("noEmptyInput"));
    return null;
  }
  return slot;
};
const attachInput = (input, kind, slotName = null, preferred = null, emptyOnly = false) => {
  const slot = resolveInputSlot(kind, slotName, preferred, emptyOnly);
  if (!slot) return false;
  state.inputs[slot.slot] = input;
  state.skip.delete(slot.slot);
  state.originalInputs = state.originalInputs.filter((i) => i.name !== slot.slot);
  renderInputs();
  renderActions();
  setStatus("");
  return true;
};
const useSelection = (selection, preferred = null) => {
  const found = findOutput(selection.job_id, selection.output_index);
  if (!found) return;
  if (!currentEngine()) {
    addContext(selection);
    $("#detail-dialog").close();
    openRequest();
    return;
  }
  if (attachInput(selection, found.output.kind, null, preferred)) {
    $("#detail-dialog").close();
    $("#prompt").focus();
  } else if ($("#detail-dialog").open) {
    addContext(selection);
    $("#detail-dialog").close();
    openRequest();
    setRequestStatus(t("inputUnsupported"));
  }
};
const fileMediaType = (file) => {
  if (file.type) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      wav: "audio/wav",
      mp3: "audio/mpeg",
      flac: "audio/flac",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
    }[extension] ?? "application/octet-stream"
  );
};
const upload = async (file, slotName = null, emptyOnly = false) => {
  if (!file) return false;
  const type = fileMediaType(file),
    kind = type.split("/")[0];
  if (!["image", "video", "audio"].includes(kind)) {
    setStatus(t("inputUnsupported"));
    return false;
  }
  const slot = resolveInputSlot(kind, slotName, null, emptyOnly);
  if (!slot) return false;
  const capability = state.capability,
    engine = state.engineName;
  setStatus(t("uploading"));
  try {
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": type },
      body: file,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error?.message ?? response.statusText);
    if (state.capability !== capability || state.engineName !== engine) {
      setStatus(t("inputChanged"));
      return false;
    }
    return attachInput({ ...result, filename: file.name }, result.kind, slot.slot);
  } catch (error) {
    setStatus(error.message);
    return false;
  }
};
let inputQueue = Promise.resolve();
const addFiles = (files, slotName = null) => {
  // Serialize additions so separate drops and paste events cannot claim the
  // same empty slot while its upload is still in flight.
  inputQueue = inputQueue
    .then(async () => {
      const messages = [],
        failed = [];
      let target = slotName;
      for (const file of files) {
        if (await upload(file, target, true)) target = null;
        else {
          failed.push(file);
          messages.push($("#composer-status").textContent);
        }
      }
      if (failed.length) {
        const details = [...new Set(messages)].join(" ");
        setStatus(
          files.length > 1 ? `${t("ignoredFiles", { n: failed.length })} ${details}` : details,
        );
      }
    })
    .catch((error) => setStatus(error.message));
};
const renderPicker = (slotName) => {
  state.pickerSlot = slotName;
  const slot = currentEngine()?.inputs.find((i) => i.slot === slotName);
  const items = allOutputs().filter(({ output }) =>
    slot ? slotAccepts(slot, output.kind) : output.kind === "image",
  );
  $("#picker-hint").textContent = items.length
    ? slot
      ? text(slot.label)
      : t("attachImage")
    : t("noCompatibleResults");
  $("#picker-results").innerHTML = items
    .map(
      ({ job, output }) =>
        `<button type="button" class="card" data-pick-output="${esc(job.job_id)}:${output.index}">${mediaTag(output)}<span class="meta">${esc(output.filename)}</span></button>`,
    )
    .join("");
  observeVideos($("#picker-results"));
  showDialog("picker-dialog");
};
const loadJob = async (jobId) => {
  const job = state.data?.jobs.find((j) => j.job_id === jobId),
    cap = job && capabilityForJob(job);
  if (!cap) {
    setStatus(t("rerunUnavailable"));
    if (job) {
      addContext({ job_id: job.job_id, output_index: 0 });
      $("#detail-dialog").close();
      openRequest();
      setRequestStatus(t("rerunUnavailable"));
    }
    return;
  }
  try {
    const { form } = await api(`/api/jobs/${encodeURIComponent(jobId)}/rerun`);
    if (!form.supported) throw new Error(t("rerunUnavailable"));
    chooseEngine(cap.id, job.preset, false);
    const engine = currentEngine();
    state.sourceJob = job.job_id;
    state.inputs = {};
    const knownParams = new Set(
      Object.values(engine.controls)
        .flat()
        .filter((control) => control?.param)
        .map((control) => control.param),
    );
    state.params = {
      ...state.params,
      ...Object.fromEntries(Object.entries(job.params).filter(([param]) => knownParams.has(param))),
    };
    state.prompt = String(
      engine.controls.prompt
        ? (state.params[engine.controls.prompt.param] ?? job.prompt_final ?? "")
        : (job.prompt_final ?? ""),
    );
    state.skip = new Set(form.skip ?? job.skipped_inputs ?? []);
    state.originalInputs = (form.inputs ?? []).filter((input) => !state.skip.has(input.name));
    state.seed = engine.controls.seed && typeof job.seed === "number" ? job.seed : "random";
    state.count = 1;
    state.duration = engine.controls.frames
      ? Number(fieldValue(engine.controls.frames)) / fpsValue()
      : null;
    $("#detail-dialog").close();
    renderComposer();
    $("#prompt").focus();
    setStatus(t("sourceLoaded"));
  } catch (error) {
    setStatus(error.message);
  }
};
const applyStaticText = () => {
  document.documentElement.lang = state.lang;
  $(".composer-dock").setAttribute(
    "aria-label",
    state.lang === "ja" ? "制作の入力" : "Creation composer",
  );
  for (const e of document.querySelectorAll("[data-i18n]")) e.textContent = t(e.dataset.i18n);
  $("#lang-toggle").textContent = state.lang === "ja" ? "EN" : "日本語";
  $("#request-text").placeholder = t("placeholder");
};
const renderAll = () => {
  if (!state.data) return;
  renderConnection();
  renderFilters();
  renderGallery();
  renderRuns();
  renderAgent();
  renderInspector();
  renderCharacters();
  if ($("#request-dialog").open) renderContext();
};
let loadSequence = 0,
  catalogSequence = 0,
  catalogPollTimer = null;
const load = async () => {
  const n = ++loadSequence;
  try {
    const data = await api("/api/state");
    if (n !== loadSequence) return;
    state.data = data;
    state.context = state.context.filter((s) => findOutput(s.job_id, s.output_index));
    renderAll();
  } catch (error) {
    setStatus(t("loadFailed", { message: error.message }));
  }
};
const loadCatalog = async (refresh = false) => {
  if (state.checking) return;
  clearTimeout(catalogPollTimer);
  const n = ++catalogSequence;
  state.checking = true;
  renderConnection();
  renderComposer();
  try {
    const data = await api(`/api/catalog${refresh ? "?refresh=1" : ""}`);
    if (n !== catalogSequence) return;
    state.catalog = data;
    if (data.capabilities.length && !currentEngine()) {
      const entries = capabilities()
        .flatMap((c) => c.engines.map((e) => ({ cap: c, engine: e })))
        .sort((a, b) => (b.engine.last_used_at ?? "").localeCompare(a.engine.last_used_at ?? ""));
      const latest = entries.find((x) => x.engine.last_used_at);
      chooseEngine(latest?.cap.id ?? capabilities()[0].id, latest?.engine.preset);
    }
    if (currentEngine()) state.engineCache = currentEngine();
    renderComposer();
    renderAll();
  } catch (error) {
    state.catalog = {
      server: { ...state.data?.connection, state: "offline", error: { code: "network" } },
      capabilities: [],
      not_runnable: [],
      unavailable: [],
      unverified: true,
    };
    setStatus(error.message);
  } finally {
    if (n === catalogSequence) {
      state.checking = false;
      renderConnection();
      renderComposer();
      if (state.catalog?.server.state === "checking" && !state.catalog.server.error)
        catalogPollTimer = setTimeout(() => void loadCatalog(), 2000);
    }
  }
};
document.addEventListener("click", (event) => {
  const target = event.target.closest("button,[data-job],[data-plan]");
  if (!target) return;
  const d = target.dataset;
  if (d.closeDialog === "delete-dialog" && state.deleting) return;
  if ("assistStart" in d) void startAssist();
  else if ("assistClose" in d) closeAssist();
  else if ("assistCopyPrompt" in d) void copySuggestedPrompt(target);
  else if ("assistCopy" in d) {
    const a = state.assist;
    if (a?.promptText)
      void copyPromptText(
        a.promptText,
        $("#assist-copy-fallback"),
        (message) => {
          if (state.assist === a) {
            a.message = message;
            $("#assist-notice").textContent = message;
          }
        },
        "assistCopied",
      );
  } else if (d.assistOption !== undefined) {
    state.assist.index = Number(d.assistOption);
    state.assist.message = "";
    renderAssist();
  } else if ("assistUse" in d && assistMatches()) {
    const prompt = state.assist.answer.suggestions[state.assist.index].prompt.trim();
    if (prompt) {
      state.assistOriginal = state.prompt;
      replacePrompt(prompt);
      state.assist.message = t("assistUsed");
      renderAssist();
    }
  } else if ("assistUndo" in d && state.assistOriginal !== null) {
    replacePrompt(state.assistOriginal);
    state.assistOriginal = null;
    if (state.assist) state.assist.message = "";
    renderAssist();
  } else if (d.assistSetting) applyAssistSetting(d.assistSetting);
  else if (d.closeDialog) $(`#${d.closeDialog}`).close();
  else if ("capabilityDetails" in d) {
    showDialog("connection-dialog");
    $("#creation-capabilities").focus({ preventScroll: true });
    $("#creation-capabilities").scrollIntoView({ block: "start" });
  } else if ("missingDetails" in d) {
    const details = $("#not-runnable");
    if (details) {
      details.open = true;
      details.querySelector("summary").focus({ preventScroll: true });
      details.scrollIntoView({ block: "start" });
    }
  } else if (d.capability) chooseEngine(d.capability);
  else if (d.engine)
    chooseEngine(state.capability, d.engine === "auto" ? null : d.engine, d.engine === "auto");
  else if (d.openPopover) {
    const element = $(`#${d.openPopover}-popover`),
      open = element.hidden;
    closePopovers();
    element.hidden = !open;
  } else if (d.duration) {
    state.duration = Number(d.duration);
    state.params[currentEngine().controls.frames.param] = Math.round(state.duration * fpsValue());
    closePopovers();
    renderSettings();
  } else if (d.size) {
    state.size = d.size.split(":").map(Number);
    state.params[currentEngine().controls.width.param] = state.size[0];
    state.params[currentEngine().controls.height.param] = state.size[1];
    closePopovers();
    renderSettings();
  } else if (d.count) {
    state.count = Number(d.count);
    closePopovers();
    renderSettings();
  } else if ("startInput" in d) {
    const engine = currentEngine(),
      target = inputModeFor(engine);
    if (target) chooseEngine(target.id, engine.preset, false);
  } else if (d.replaceSlot) {
    const menu = target.parentElement.querySelector(".slot-replace-menu");
    const open = menu.hidden;
    closeSlotMenus();
    menu.hidden = !open;
    target.setAttribute("aria-expanded", String(open));
  } else if (d.slotFile) {
    const input = target.parentElement.querySelector("input[type=file]");
    closeSlotMenus();
    input.click();
  } else if (d.pickSlot) {
    closeSlotMenus();
    renderPicker(d.pickSlot);
  } else if (d.pickOutput) {
    const selection = selectionFrom(d.pickOutput),
      found = findOutput(selection.job_id, selection.output_index);
    if (found) attachInput(selection, found.output.kind, state.pickerSlot);
    $("#picker-dialog").close();
  } else if (d.clearSlot) {
    delete state.inputs[d.clearSlot];
    state.originalInputs = state.originalInputs.filter((i) => i.name !== d.clearSlot);
    const engine = currentEngine();
    const inputless = capabilities().find((cap) =>
      cap.engines.some(
        (e) =>
          e.preset === engine?.preset &&
          e.inputless &&
          e.default_skip.includes(d.clearSlot) &&
          e.default_skip.every((slot) => !slotFilled({ slot })),
      ),
    );
    if (inputless) chooseEngine(inputless.id, engine.preset, false);
    else {
      renderInputs();
      renderActions();
    }
  } else if (d.cardMode) useSelection(selectionFrom(d.selection), d.cardMode);
  else if (d.favoriteJob) {
    const job = state.data.jobs.find((j) => j.job_id === d.favoriteJob);
    if (job) void feedback(job.job_id, { favorite: !job.favorite });
  } else if (d.loadJob) void loadJob(d.loadJob);
  else if ("outputDestinations" in d) {
    const menu = target.parentElement.querySelector(".output-destinations");
    menu.hidden = !menu.hidden;
    target.setAttribute("aria-expanded", String(!menu.hidden));
  } else if (d.destination) {
    closeOutputDestinations();
    useSelection(selectionFrom(d.selection), d.destination);
  } else if (d.consultOutput) {
    const selection = selectionFrom(d.consultOutput),
      found = findOutput(selection.job_id, selection.output_index);
    if (!found) return;
    addContext(selection);
    $("#detail-dialog").close();
    openRequest();
    if (!state.prompt)
      $("#request-text").value = t("consultIntro", {
        kind: t(
          ["image", "video", "audio"].includes(found.output.kind)
            ? `${found.output.kind}Kind`
            : "resultKind",
        ),
      });
  } else if (d.deleteOutput) openDelete(selectionFrom(d.deleteOutput));
  else if (d.removeContext) {
    const selection = selectionFrom(d.removeContext);
    state.context = state.context.filter(
      (s) => s.job_id !== selection.job_id || s.output_index !== selection.output_index,
    );
    renderGallery();
    renderContext();
  } else if (d.filter) {
    state.filter = d.filter;
    renderFilters();
    renderGallery();
  } else if ("openCharacters" in d) {
    renderCharacters();
    showDialog("character-dialog");
  } else if (d.character) {
    state.character = d.character;
    state.prompt = state.prompt.replace(/(^|\s)@[^\s@]*$/, "$1");
    $("#prompt").value = state.prompt;
    const control = (currentEngine() ?? state.engineCache)?.controls.prompt;
    if (control) state.params[control.param] = state.prompt;
    $("#character-dialog").close();
    renderActions();
    renderContext();
  } else if ("clearCharacter" in d) {
    state.character = null;
    renderActions();
    renderContext();
  } else if ("reconnect" in d) void loadCatalog(true);
  else if ("urlHelp" in d) {
    showDialog("connection-dialog");
    $("#url-help").open = true;
  } else if ("ask" in d) openRequest();
  else if (d.dismissRun) {
    state.dismissedRuns.add(d.dismissRun);
    renderRuns();
  } else if (d.plan) {
    event.preventDefault();
    state.focus = { type: "plan", id: d.plan };
    state.editing = null;
    renderInspector();
    showDialog("detail-dialog");
  } else if (d.action) {
    const job = state.data.jobs.find((j) => j.job_id === state.focus?.job_id);
    if (!job) return;
    if (d.action === "favorite") void feedback(job.job_id, { favorite: !job.favorite });
    else {
      state.editing = d.action;
      renderInspector();
    }
  } else if ("cancelEdit" in d) {
    state.editing = null;
    renderInspector();
  } else if (d.job) {
    state.focus = { type: "output", job_id: d.job, index: Number(d.index) };
    state.editing = null;
    renderInspector();
    showDialog("detail-dialog");
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".settings-popover,[data-open-popover]")) closePopovers();
  if (!event.target.closest(".slot-replace")) closeSlotMenus();
  if (!event.target.closest(".destination-picker")) closeOutputDestinations();
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "prompt") {
    state.prompt = el.value;
    updateAssistButtons();
    const c = currentEngine()?.controls.prompt;
    if (c) state.params[c.param] = el.value;
    if (
      !event.isComposing &&
      /(^|\s)@[^\s@]*$/.test(el.value.slice(0, el.selectionStart)) &&
      state.data?.characters.length
    ) {
      $("#character-search").value = "";
      renderCharacters();
      showDialog("character-dialog");
    }
  } else if (el.id === "assist-prompt") {
    state.assist.answer.suggestions[state.assist.index].prompt = el.value;
    $("[data-assist-use]").disabled = !el.value.trim() || !assistMatches();
    $("[data-assist-copy-prompt]").disabled = !el.value.trim();
    sizeAssistPrompt();
  } else if (el.id === "model-filter") {
    state.modelQuery = el.value;
    renderModelOptions();
  } else if (el.id === "character-search") renderCharacters();
  else if (el.id === "fixed-seed") state.seed = Number(el.value);
  else if (el.dataset.param) {
    const controls = currentEngine()?.controls;
    const field = Object.values(controls ?? {})
      .flat()
      .find((c) => c?.param === el.dataset.param);
    if (!field) return;
    if (field.choices) state.params[field.param] = field.choices[Number(el.value)];
    else if (field.type === "bool") state.params[field.param] = el.checked;
    else if (["int", "float"].includes(field.type)) {
      if (el.value === "") delete state.params[field.param];
      else state.params[field.param] = Number(el.value);
    } else if (field.type === "json") {
      try {
        state.params[field.param] = JSON.parse(el.value);
        el.setCustomValidity("");
      } catch {
        el.setCustomValidity(
          state.lang === "ja" ? "JSON の内容を確認してください。" : "Check the JSON value.",
        );
      }
    } else state.params[field.param] = el.value;
    if (controls.fps?.param === field.param && controls.frames) {
      state.params[controls.frames.param] = Math.round(state.duration * fpsValue());
      if ($("#duration-details"))
        $("#duration-details").textContent = t("durationDetails", {
          s: Number(state.duration.toFixed(2)),
          frames: state.params[controls.frames.param],
        });
    }
  }
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.name === "seed-mode") {
    state.seed = el.value === "random" ? "random" : Number($("#fixed-seed").value);
    if (state.seed !== "random") state.count = 1;
    $("#fixed-seed-field").hidden = state.seed === "random";
    $("#fixed-seed").disabled = state.seed === "random";
    renderSettings();
  } else if (el.dataset.uploadSlot) void upload(el.files?.[0], el.dataset.uploadSlot);
  else if ("attachFile" in el.dataset) void upload(el.files?.[0]);
});
$("#prompt").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    if (!$("#generate").disabled) $("#create-form").requestSubmit();
  }
});
$("#create-form").addEventListener(
  "invalid",
  (event) => {
    const popover = event.target.closest(".settings-popover");
    if (popover) {
      closePopovers();
      popover.hidden = false;
    }
  },
  true,
);
$("#delete-form").addEventListener("submit", deleteResult);
$("#delete-dialog").addEventListener("cancel", (event) => {
  if (state.deleting) event.preventDefault();
});
$("#create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if ($("#generate").disabled) return;
  const engine = currentEngine();
  if (!engine || !$("#create-form").reportValidity()) return;
  state.generating = true;
  state.hintSeen = true;
  try {
    sessionStorage.setItem("comfy-agent-studio-hint-seen", "1");
  } catch {
    /* optional */
  }
  renderActions();
  try {
    const result = await api("/api/generate", {
      capability: state.capability,
      preset: engine.preset,
      params: state.params,
      inputs: serialInputs(),
      skip: [...state.skip],
      count: state.count,
      seed: state.seed,
      ...(engine.controls.prompt ? { prompt: state.prompt } : {}),
      ...(engine.controls.frames && state.duration ? { duration_s: state.duration } : {}),
      ...(state.size ? { size: state.size } : {}),
      lang: state.lang,
      source_job_id: state.sourceJob ?? undefined,
    });
    if (result.run?.id) {
      if (
        !(state.data?.runs ?? []).some(
          (run) => state.trackedRuns.has(run.id) && run.status === "running",
        )
      )
        state.trackedRuns.clear();
      state.trackedRuns.add(result.run.id);
      if (state.data && !state.data.runs.some((run) => run.id === result.run.id))
        state.data.runs.push(result.run);
      state.runStatusActive = true;
      renderRunStatus();
    } else setStatus("");
    await load();
  } catch (error) {
    setStatus(error.code === "RUN_LIMIT_REACHED" ? t("rerunLimit") : error.message);
  } finally {
    state.generating = false;
    renderActions();
    $("#first-hint").textContent = "";
  }
});
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  const value = new FormData(form).get("value")?.toString().trim();
  if (value && state.focus?.type === "output") void feedback(state.focus.job_id, { note: value });
});
document.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".card[data-job]");
  if (!card) return;
  event.dataTransfer.setData(
    "application/x-studio-output",
    JSON.stringify({ job_id: card.dataset.job, output_index: Number(card.dataset.index) }),
  );
  event.dataTransfer.effectAllowed = "copy";
});
const isInputDrag = (event) =>
  [...(event.dataTransfer?.types ?? [])].some((type) =>
    ["Files", "application/x-studio-output"].includes(type),
  );
let dragDepth = 0;
const clearDrag = () => {
  dragDepth = 0;
  $("#drop-overlay").hidden = true;
  document
    .querySelectorAll(".drag-over")
    .forEach((element) => element.classList.remove("drag-over"));
};
const showDrag = (event) => {
  $("#drop-overlay").hidden = false;
  const slot = event.target.closest?.("[data-drop-slot]");
  document.querySelectorAll(".drag-over").forEach((element) => {
    if (element !== slot) element.classList.remove("drag-over");
  });
  slot?.classList.add("drag-over");
};
document.addEventListener("dragenter", (event) => {
  if (!isInputDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  showDrag(event);
});
document.addEventListener("dragover", (event) => {
  if (!isInputDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  showDrag(event);
});
document.addEventListener("dragleave", (event) => {
  if (!isInputDrag(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) clearDrag();
});
document.addEventListener("dragend", clearDrag);
window.addEventListener("blur", clearDrag);
document.addEventListener("drop", (event) => {
  if (!isInputDrag(event)) return;
  event.preventDefault();
  clearDrag();
  const slot = event.target.closest?.("[data-drop-slot]")?.dataset.dropSlot;
  const raw = event.dataTransfer.getData("application/x-studio-output");
  if (raw) {
    try {
      const selection = JSON.parse(raw);
      const found = findOutput(selection.job_id, selection.output_index);
      if (found) attachInput(selection, found.output.kind, slot, null, true);
      else setStatus(t("inputUnsupported"));
    } catch {
      setStatus(t("inputUnsupported"));
    }
  } else addFiles([...event.dataTransfer.files], slot);
});
$("#create-form").addEventListener("paste", (event) => {
  const images = [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (!images.length) return;
  event.preventDefault();
  addFiles(images, event.target.closest?.("[data-drop-slot]")?.dataset.dropSlot);
});
$("#connection").addEventListener("click", () => showDialog("connection-dialog"));
$("#refresh-connection").addEventListener("click", () => void loadCatalog(true));
$("#ask-agent").addEventListener("click", openRequest);
$("#copy-request").addEventListener("click", () => void copyRequest());
$("#queue-request").addEventListener("click", () => void queueRequest());
$("#agent-button").addEventListener("click", () => showDialog("agent-dialog"));
$("#lang-toggle").addEventListener("click", () => {
  state.lang = state.lang === "ja" ? "en" : "ja";
  setStatus("");
  setRequestStatus("");
  try {
    localStorage.setItem("comfy-agent-studio-lang", state.lang);
  } catch {
    /* optional */
  }
  applyStaticText();
  renderComposer();
  renderAll();
});
$("#request-text").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void copyRequest();
  }
});
document.addEventListener("mouseover", (event) => {
  const video = event.target.closest(".card")?.querySelector("video");
  if (video) void video.play().catch(() => undefined);
});
document.addEventListener("mouseout", (event) => {
  const card = event.target.closest(".card");
  if (card && !card.contains(event.relatedTarget)) card.querySelector("video")?.pause();
});
document.addEventListener("keydown", (event) => {
  const card = event.target.closest(".card");
  if (
    card &&
    ["Enter", " "].includes(event.key) &&
    event.target === card &&
    card.tagName !== "BUTTON"
  ) {
    event.preventDefault();
    card.click();
  }
  if (event.key === "Escape") {
    closePopovers();
    closeSlotMenus();
    closeOutputDestinations();
  }
});
window.addEventListener("resize", sizeAssistPrompt);
new ResizeObserver(() => {
  document.documentElement.style.setProperty(
    "--composer-space",
    `${$(".composer-dock").getBoundingClientRect().height + 32}px`,
  );
  fitInputPreviews();
  updateAssistOverflow();
}).observe($(".composer-dock"));
setInterval(() => {
  if (state.data) renderRuns();
  if (renderedStale !== catalogIsStale()) {
    renderConnection();
    renderComposer();
  }
}, 1000);
const start = async () => {
  await load();
  let saved = null;
  try {
    saved = localStorage.getItem("comfy-agent-studio-lang");
    state.hintSeen = sessionStorage.getItem("comfy-agent-studio-hint-seen") === "1";
  } catch {
    /* optional */
  }
  state.lang =
    state.data?.lang ??
    (saved === "ja" || saved === "en" ? saved : navigator.language.startsWith("ja") ? "ja" : "en");
  applyStaticText();
  renderComposer();
  renderAll();
  void loadCatalog();
  const events = new EventSource("/api/events");
  events.addEventListener("changed", () => void load());
  events.addEventListener("open", () => void load());
  setInterval(() => {
    if (document.visibilityState === "visible") void load();
  }, 5000);
  setInterval(() => {
    if (document.visibilityState === "visible") void loadCatalog();
  }, 60000);
  window.addEventListener("focus", () => {
    void load();
    void loadCatalog();
  });
};
void start();
