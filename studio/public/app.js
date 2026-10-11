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
    filterRejected: "不採用",
    items: "{n} 件",
    noOutputs: "まだ生成結果がありません。",
    addContext: "＋素材",
    removeContext: "素材から外す",
    useAsContext: "この素材で依頼",
    favorite: "★ お気に入り",
    unfavorite: "★ 解除",
    reject: "不採用にする",
    unreject: "不採用を取り消す",
    rejectReason: "不採用の理由(次の判断に使われます)",
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
    rejectedBecause: "不採用の理由",
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
    filterRejected: "Rejected",
    items: "{n} items",
    noOutputs: "No outputs yet.",
    addContext: "+ Use",
    removeContext: "Remove from request",
    useAsContext: "Use in request",
    favorite: "★ Favorite",
    unfavorite: "★ Unfavorite",
    reject: "Reject",
    unreject: "Undo reject",
    rejectReason: "Why reject? (used for the next decision)",
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
    rejectedBecause: "Rejected because",
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
  showRejected: false,
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
  hintSeen: false,
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

const renderOutputInspector = (job, output) => {
  const linked = stepsForJob(job.job_id);
  const rejected = job.tags.includes("reject");
  const editor =
    state.editing === "reject"
      ? `<form class="inline-form" data-form="reject"><input name="value" required aria-label="${esc(t("rejectReason"))}" placeholder="${esc(
          t("rejectReason"),
        )}" autofocus /><button type="submit">${esc(t("save"))}</button>
        <button type="button" class="ghost" data-cancel-edit>${esc(t("cancel"))}</button></form>`
      : state.editing === "note"
        ? `<form class="inline-form" data-form="note"><input name="value" required aria-label="${esc(t("notePlaceholder"))}" placeholder="${esc(
            t("notePlaceholder"),
          )}" autofocus /><button type="submit">${esc(t("save"))}</button>
          <button type="button" class="ghost" data-cancel-edit>${esc(t("cancel"))}</button></form>`
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
    <div class="actions">
      <button type="button" class="secondary" data-action="favorite" aria-pressed="${job.favorite}">${esc(
        job.favorite ? t("unfavorite") : t("favorite"),
      )}</button>
      <button type="button" class="secondary" data-action="${rejected ? "unreject" : "reject"}">${esc(
        rejected ? t("unreject") : t("reject"),
      )}</button>
      <button type="button" class="secondary" data-action="note">${esc(t("note"))}</button>
      <button type="button" data-toggle-context="${esc(job.job_id)}:${output.index}">${esc(
        inContext(job.job_id, output.index) ? t("removeContext") : t("addAgentContext"),
      )}</button>
    </div>
    ${editor}
    <div class="detail-create-actions"><button type="button" data-load-job="${esc(job.job_id)}">${esc(t("rerunTitle"))}</button><button type="button" class="secondary" data-use-output="${esc(job.job_id)}:${output.index}">${esc(t("useMaterial"))}</button></div>
    ${rejected && job.reject_reason ? `<p><span class="badge reject">${esc(t("rejectedBecause"))}</span> ${esc(job.reject_reason)}</p>` : ""}
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
  none: ["なし", "None"],
  showRejected: ["不採用も表示", "Show rejected"],
  detailTitle: ["結果の詳細", "Result details"],
  close: ["閉じる", "Close"],
  askAgent: ["エージェントに相談", "Ask the agent"],
  generate: ["生成 ⏎", "Generate ⏎"],
  generating: ["送信中…", "Starting…"],
  connectionTitle: ["接続先とできること", "Connection & what you can make"],
  modeContext: [
    "接続中の ComfyUI{server} でできること（{n} 種類）",
    "What your connected ComfyUI{server} can do ({n})",
  ],
  singleModeContext: [
    "接続中の ComfyUI{server} でできるのは「{name}」だけです",
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
  dropHere: ["ここにドロップ", "Drop here"],
  required: ["必須", "Required"],
  optional: ["なしでも可", "Can be omitted"],
  bakedInput: ["既定の入力あり", "Default input available"],
  skipInput: ["使わない", "Do not use"],
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
  useMaterial: ["この素材で作る", "Create with this"],
  addAgentContext: ["依頼の参考に追加", "Add to agent context"],
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
  const oldInputs =
    old?.inputs.map((slot) => ({
      slot: slot.slot,
      role: slot.role,
      kind: slot.kind,
      input: state.inputs[slot.slot],
      original: state.originalInputs.find((input) => input.name === slot.slot),
      skipped: state.skip.has(slot.slot),
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
    const occupied = (item) => item?.input || item?.original || item?.skipped;
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
      if (slot.optional && item.skipped) state.skip.add(slot.slot);
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
  state.sourceJob = null;
  state.seed = "random";
  state.count = 1;
  state.size = null;
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
  $("#connection").textContent = online
    ? `${t("connected")}${server.gpu ? ` · ${server.gpu.replace(/^NVIDIA /, "")}${server.vram_total ? ` ${Math.round(server.vram_total / 1024 ** 3)}GB` : ""}` : ""}${counts.length ? ` · ${counts.join(" / ")}` : ""}`
    : t(server?.state === "offline" ? "offlineTitle" : "checking");
  const reasonsOpen = $("#not-runnable")?.open;
  $("#connection-details").innerHTML =
    `<section id="creation-capabilities" tabindex="-1" aria-labelledby="creation-capabilities-title"><h3 id="creation-capabilities-title">${esc(t("makeAndWhy"))}</h3><p class="hint">${esc(t("makeAndWhyBody"))}</p>${state.catalog?.unverified && online ? `<p class="hint">${esc(t("previousCheck"))} · <button type="button" class="text-link" data-reconnect${state.checking ? " disabled" : ""}>${esc(t("recheck"))}</button></p>` : ""}<ul class="creation-modes">${capabilities()
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
      )}</ul>${!capabilities().length ? `<p class="hint">${esc(t(server?.state === "offline" ? "offlineBody" : online ? "emptyCatalogBody" : "informationPending"))}</p>` : ""}</section>` +
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
const renderInputs = () => {
  const engine = currentEngine();
  $("#input-slots").innerHTML = (engine?.inputs ?? [])
    .map((slot) => {
      if (state.skip.has(slot.slot))
        return `<button type="button" class="setting-chip skipped-input" data-toggle-slot="${esc(slot.slot)}" aria-pressed="true">${esc(text(slot.label))}: ${esc(t("skipInput"))} ↺</button>`;
      const filled = Boolean(
        state.inputs[slot.slot] || state.originalInputs.some((i) => i.name === slot.slot),
      );
      return `<div class="input-slot ${filled ? "filled" : ""}" data-drop-slot="${esc(slot.slot)}"><div class="slot-heading"><strong>${esc(text(slot.label))}</strong><span>${esc(t(slot.optional ? "optional" : slot.required ? "required" : "bakedInput"))}</span>${filled ? `<button type="button" class="ghost clear-slot" data-clear-slot="${esc(slot.slot)}" aria-label="${esc(t("clearInput"))}: ${esc(text(slot.label))}">×</button>` : ""}</div><div class="slot-body">${slotPreview(slot)}<div class="slot-actions"><button type="button" class="ghost" data-pick-slot="${esc(slot.slot)}">${esc(t("pickResult"))}</button><label class="file-button">${esc(t("uploadFile"))}<input type="file" data-upload-slot="${esc(slot.slot)}" accept="${slot.kind === "file" ? "image/*,audio/*,video/*" : `${slot.kind === "mask" ? "image" : slot.kind}/*`}" aria-label="${esc(t("uploadFile"))}: ${esc(text(slot.label))}"></label>${slot.optional ? `<button type="button" class="ghost" data-toggle-slot="${esc(slot.slot)}" aria-pressed="false">${esc(t("skipInput"))}</button>` : ""}</div></div></div>`;
    })
    .join("");
  observeVideos($("#input-slots"));
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
  $("#action-note").textContent = reason;
  $("#character-chip").innerHTML = state.character
    ? `<span class="character-chip">${esc(t("characterAttached", { name: state.character }))}<button class="ghost" type="button" data-clear-character aria-label="${esc(t("clearInput"))}">×</button></span>`
    : "";
};
const renderComposer = () => {
  const server = state.catalog?.server;
  const online = server?.state === "online" && capabilities().length > 0;
  $("#online-composer").hidden = !online;
  $("#offline-panel").hidden = online;
  $("#first-hint").textContent = online && !state.hintSeen ? t("firstHint") : "";
  if (!online) {
    closePopovers();
    $("#offline-panel").innerHTML =
      `<h2>${esc(t(!server || server.state === "checking" ? "checking" : server.state === "online" ? "emptyCatalog" : "offlineTitle"))}</h2><p>${esc(t(!server ? "checking" : server.state === "online" ? "emptyCatalogBody" : server.state === "offline" ? "offlineBody" : "informationPending"))}</p>${server ? `<div class="offline-url"><code>${esc(server.base_url)}</code><small>${esc(sourceText(server.source))}</small></div><div class="actions">${server.state === "online" ? `<button type="button" class="secondary" data-capability-details>${esc(t("capabilityDetails"))}</button>` : ""}<button type="button" data-reconnect${state.checking ? " disabled" : ""}>${esc(t(state.checking ? "checking" : server.state === "online" ? "recheck" : "reconnect"))}</button><button type="button" class="secondary" data-url-help>${esc(t("changeUrl"))}</button><button type="button" class="secondary" data-ask>${esc(t("askAgent"))}</button></div><p class="hint">${esc(t("offlineNote"))}</p>` : ""}`;
    return;
  }
  const cap = currentCapability();
  if (!cap) return;
  const host = connectedServerName(server.base_url);
  $("#mode-context").innerHTML =
    `<span>${esc(t(capabilities().length === 1 ? "singleModeContext" : "modeContext", { server: host ? (state.lang === "ja" ? `（${host}）` : ` (${host})`) : "", n: capabilities().length, name: text(capabilities()[0].label) }))}</span><span>· <button type="button" class="text-link" data-capability-details aria-haspopup="dialog">${esc(t("capabilityDetails"))}</button></span>${state.catalog.unverified ? `<span class="previous-check">${esc(t("previousCheck"))} · <button type="button" class="text-link" data-reconnect${state.checking ? " disabled" : ""}>${esc(t("recheck"))}</button></span>` : ""}`;
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
};
const matchesFilter = ({ job, output }) =>
  (state.showRejected || !job.tags.includes("reject")) &&
  (state.filter === "all" || state.filter === "favorite"
    ? state.filter !== "favorite" || job.favorite
    : output.kind === state.filter);
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
            `<article class="card ${inContext(job.job_id, output.index) ? "in-context" : ""} ${job.tags.includes("reject") ? "rejected" : ""}" tabindex="0" role="button" draggable="true" data-job="${esc(job.job_id)}" data-index="${output.index}" aria-label="${esc(output.filename)}">${mediaTag(output)}<button type="button" class="card-favorite" data-favorite-job="${esc(job.job_id)}" aria-pressed="${job.favorite}" aria-label="${esc(t(job.favorite ? "unfavorite" : "favorite"))}">${job.favorite ? "★" : "☆"}</button><div class="card-actions">${output.kind === "image" && animate ? `<button type="button" data-card-mode="image_to_video" data-selection="${esc(job.job_id)}:${output.index}">${esc(t("animate"))}</button>` : ""}${output.kind === "image" && edit ? `<button type="button" data-card-mode="image_edit" data-selection="${esc(job.job_id)}:${output.index}">${esc(t("editImage"))}</button>` : ""}${engineForJob(job) && job.source === "local" ? `<button type="button" data-load-job="${esc(job.job_id)}">${esc(t("recreate"))}</button>` : ""}</div><div class="meta"><span>${esc(jobModelName(job, output.kind))}</span>${output.kind === "video" ? '<span aria-hidden="true">▶</span>' : ""}</div></article>`,
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
const renderRuns = () => {
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
const serialInputs = () =>
  Object.fromEntries([
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
const contextData = () => ({
  task: currentCapability()?.capability,
  preset: state.engineName ?? undefined,
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
      return `${text(slot.label)}: ${state.skip.has(slot.slot) ? t("skipInput") : input ? (input.filename ?? found?.output.filename ?? t("inputOriginal")) : (original?.server_name ?? t("none"))}`;
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
const copyRequest = async () => {
  if (!$("#request-text").value.trim()) return setRequestStatus(t("needText"));
  try {
    const { prompt } = await api("/api/requests", requestBody(false));
    try {
      await navigator.clipboard.writeText(prompt);
      setRequestStatus(t("copied"));
    } catch {
      const fallback = $("#copy-fallback");
      fallback.value = prompt;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      setRequestStatus(t("clipboardFallback"));
    }
  } catch (error) {
    setRequestStatus(error.message);
  }
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
const attachInput = (input, kind, slotName = null, preferred = null) => {
  let engine = currentEngine(),
    slot =
      slotName && slotName !== "attach"
        ? engine?.inputs.find((i) => i.slot === slotName)
        : engine?.inputs.find((i) => slotAccepts(i, kind));
  if (preferred || !slot) {
    const target =
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
      return false;
    }
    const suitable =
      target.engines.find((e) => e.default && e.inputs.some((i) => slotAccepts(i, kind))) ??
      target.engines.find((e) => e.inputs.some((i) => slotAccepts(i, kind)));
    chooseEngine(target.id, suitable.preset);
    engine = currentEngine();
    slot = engine.inputs.find((i) => slotAccepts(i, kind));
  }
  if (!slot || !slotAccepts(slot, kind)) {
    setStatus(t("inputUnsupported"));
    return false;
  }
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
const upload = async (file, slot = null) => {
  if (!file) return;
  setStatus(t("uploading"));
  try {
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error?.message ?? response.statusText);
    attachInput({ ...result, filename: file.name }, result.kind, slot);
  } catch (error) {
    setStatus(error.message);
  }
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
    state.originalInputs = form.inputs ?? [];
    state.skip = new Set(form.skip ?? job.skipped_inputs ?? []);
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
  catalogSequence = 0;
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
  const n = ++catalogSequence;
  state.checking = true;
  renderConnection();
  if (!state.catalog) renderComposer();
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
    setStatus(error.message);
  } finally {
    if (n === catalogSequence) {
      state.checking = false;
      renderConnection();
      renderComposer();
    }
  }
};
document.addEventListener("click", (event) => {
  const target = event.target.closest("button,[data-job],[data-plan]");
  if (!target) return;
  const d = target.dataset;
  if (d.closeDialog) $(`#${d.closeDialog}`).close();
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
  } else if (d.pickSlot) renderPicker(d.pickSlot);
  else if (d.toggleSlot) {
    const slot = currentEngine()?.inputs.find((input) => input.slot === d.toggleSlot);
    if (!slot) return;
    if (state.skip.has(slot.slot)) {
      if (currentEngine().inputless) {
        const target = capabilities().find((cap) =>
          cap.engines.some((engine) => engine.preset === state.engineName && !engine.inputless),
        );
        if (target) chooseEngine(target.id, state.engineName, false);
      }
      state.skip.delete(slot.slot);
    } else if (slot.optional) state.skip.add(slot.slot);
    renderComposer();
  } else if (d.pickOutput) {
    const selection = selectionFrom(d.pickOutput),
      found = findOutput(selection.job_id, selection.output_index);
    if (found) attachInput(selection, found.output.kind, state.pickerSlot);
    $("#picker-dialog").close();
  } else if (d.clearSlot) {
    delete state.inputs[d.clearSlot];
    state.originalInputs = state.originalInputs.filter((i) => i.name !== d.clearSlot);
    renderInputs();
    renderActions();
  } else if (d.cardMode) useSelection(selectionFrom(d.selection), d.cardMode);
  else if (d.favoriteJob) {
    const job = state.data.jobs.find((j) => j.job_id === d.favoriteJob);
    if (job) void feedback(job.job_id, { favorite: !job.favorite });
  } else if (d.loadJob) void loadJob(d.loadJob);
  else if (d.useOutput) useSelection(selectionFrom(d.useOutput));
  else if (d.toggleContext) {
    const selection = selectionFrom(d.toggleContext);
    if (inContext(selection.job_id, selection.output_index))
      state.context = state.context.filter(
        (s) => s.job_id !== selection.job_id || s.output_index !== selection.output_index,
      );
    else state.context.push(selection);
    renderGallery();
    renderInspector();
    renderContext();
  } else if (d.removeContext) {
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
    else if (d.action === "unreject") void feedback(job.job_id, { reject: null });
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
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "prompt") {
    state.prompt = el.value;
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
  if (el.id === "show-rejected") {
    state.showRejected = el.checked;
    renderGallery();
  } else if (el.name === "seed-mode") {
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
    await api("/api/generate", {
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
    setStatus(t("rerunStarted"));
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
  if (value && state.focus?.type === "output")
    void feedback(
      state.focus.job_id,
      form.dataset.form === "reject" ? { reject: value } : { note: value },
    );
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
  [...event.dataTransfer.types].some((type) =>
    ["Files", "application/x-studio-output"].includes(type),
  );
$("#create-form").addEventListener("dragover", (event) => {
  if (isInputDrag(event)) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    event.target.closest(".input-slot")?.classList.add("drag-over");
  }
});
$("#create-form").addEventListener("dragleave", (event) =>
  event.target.closest(".input-slot")?.classList.remove("drag-over"),
);
$("#create-form").addEventListener("drop", (event) => {
  if (!isInputDrag(event)) return;
  event.preventDefault();
  document.querySelectorAll(".drag-over").forEach((e) => e.classList.remove("drag-over"));
  const slot = event.target.closest("[data-drop-slot]")?.dataset.dropSlot;
  const raw = event.dataTransfer.getData("application/x-studio-output");
  if (raw) {
    try {
      const selection = JSON.parse(raw);
      const found = findOutput(selection.job_id, selection.output_index);
      if (found) attachInput(selection, found.output.kind, slot);
    } catch {
      /* invalid drag data */
    }
  } else void upload(event.dataTransfer.files?.[0], slot);
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
  if (event.key === "Escape") closePopovers();
});
new ResizeObserver(() => {
  document.documentElement.style.setProperty(
    "--composer-space",
    `${$(".composer-dock").getBoundingClientRect().height + 32}px`,
  );
}).observe($(".composer-dock"));
setInterval(() => {
  if (state.data) renderRuns();
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
