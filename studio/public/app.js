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
    seed: "seed",
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
    seedNew: "新しい seed(別案)",
    seedSame: "同じ seed",
    countLabel: "枚数",
    rerunButton: "ComfyUI で生成する",
    rerunStarted: "生成を開始しました。",
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
  lang: "ja",
  filter: "all",
  focus: null, // { type: "output", job_id, index } | { type: "plan", id }
  context: [], // [{ job_id, output_index }]
  character: null,
  editing: null, // "reject" | "note"
  forms: {}, // job_id -> rerun form (or "loading")
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
  if (!json.ok) throw new Error(json.error?.message ?? res.statusText);
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

/* ---------- Sidebar ---------- */

const renderCharacters = () => {
  const characters = state.data.characters;
  if (characters.length === 0) {
    $("#characters").innerHTML = `<p class="empty">${esc(t("noCharacters"))}</p>`;
    return;
  }
  $("#characters").innerHTML = characters
    .map((character) => {
      const thumb =
        character.gallery.find((item) => item.approved === "human") ??
        character.references[0] ??
        character.gallery[0];
      return `<button type="button" class="list-item" data-character="${esc(character.name)}"
        aria-pressed="${state.character === character.name}" title="${esc(t("useCharacter"))}">
        ${thumb ? `<img class="thumb" src="${esc(thumb.url)}" alt="" />` : `<span class="thumb"></span>`}
        <span class="label">${esc(character.display_name ?? character.name)}
          <small>${esc(character.name)} · ${esc(character.scope)}</small></span>
      </button>`;
    })
    .join("");
};

const renderPlans = () => {
  const plans = state.data.plans;
  if (plans.length === 0) {
    $("#plans").innerHTML = `<p class="empty">${esc(t("noPlans"))}</p>`;
    return;
  }
  $("#plans").innerHTML = plans
    .map(
      (plan) => `<button type="button" class="list-item" data-plan="${esc(plan.id)}"
        aria-pressed="${state.focus?.type === "plan" && state.focus.id === plan.id}">
        <span class="label">${esc(plan.title)}
          <small><span class="badge ${esc(plan.status)}">${esc(plan.status)}</span>
          ${plan.steps.length} ${esc(t("steps"))}</small></span>
      </button>`,
    )
    .join("");
};

const renderRequests = () => {
  const requests = state.data.requests.slice(0, 20);
  if (requests.length === 0) {
    $("#requests").innerHTML = `<p class="empty">${esc(t("noRequests"))}</p>`;
    return;
  }
  $("#requests").innerHTML = requests
    .map(
      (request) => `<div class="list-item" title="${esc(request.id)}">
        <span class="label">${esc(request.text)}
          <small><span class="badge ${request.handled ? "ok" : "proposed"}">${esc(
            request.handled ? t("handled") : t("pending"),
          )}</span> ${esc(formatDate(request.at))}</small></span>
      </div>`,
    )
    .join("");
};

/* ---------- Composer ---------- */

const renderContext = () => {
  const chips = state.context
    .map((item) => {
      const found = findOutput(item.job_id, item.output_index);
      if (!found) return "";
      return `<span class="chip">${mediaTag(found.output, "", false)}
        ${esc(found.job.preset)}
        <button type="button" data-remove-context="${esc(item.job_id)}:${item.output_index}"
          aria-label="${esc(t("removeContext"))}">×</button></span>`;
    })
    .join("");
  const character = state.character
    ? `<span class="chip">👤 ${esc(state.character)}
        <button type="button" data-clear-character aria-label="×">×</button></span>`
    : "";
  unobserveVideos($("#context"));
  $("#context").innerHTML = character + chips;
  observeVideos($("#context"));
};

const requestBody = (send) => ({
  text: $("#request-text").value.trim(),
  selected: state.context,
  character: state.character ?? undefined,
  lang: state.lang,
  send,
});

const setStatus = (message) => {
  $("#composer-status").textContent = message;
};

const copyRequest = async (event) => {
  event?.preventDefault();
  const body = requestBody(false);
  if (!body.text) return setStatus(t("needText"));
  try {
    const { prompt } = await api("/api/requests", body);
    await navigator.clipboard.writeText(prompt);
    setStatus(t("copied"));
  } catch (error) {
    setStatus(error.message);
  }
};

const queueRequest = async () => {
  const body = requestBody(true);
  if (!body.text) return setStatus(t("needText"));
  try {
    const { request } = await api("/api/requests", body);
    $("#request-text").value = "";
    state.context = [];
    renderContext();
    setStatus(t("sent", { id: request.id }));
    await load();
  } catch (error) {
    setStatus(error.message);
  }
};

/* ---------- Gallery ---------- */

const FILTERS = [
  ["all", "filterAll"],
  ["favorite", "filterFav"],
  ["image", "filterImage"],
  ["video", "filterVideo"],
  ["audio", "filterAudio"],
  ["rejected", "filterRejected"],
];

const matchesFilter = ({ job, output }) => {
  const rejected = job.tags.includes("reject");
  switch (state.filter) {
    case "favorite":
      return job.favorite;
    case "rejected":
      return rejected;
    case "image":
    case "video":
    case "audio":
      return output.kind === state.filter && !rejected;
    default:
      return true;
  }
};

const renderFilters = () => {
  $("#filters").innerHTML = FILTERS.map(
    ([id, label]) =>
      `<button type="button" class="secondary" data-filter="${id}" aria-pressed="${state.filter === id}">${esc(
        t(label),
      )}</button>`,
  ).join("");
};

const renderGallery = () => {
  unobserveVideos($("#gallery"));
  const items = allOutputs().filter(matchesFilter);
  $("#gallery-count").textContent = t("items", { n: items.length });
  if (items.length === 0) {
    $("#gallery").innerHTML = `<p class="empty">${esc(t("noOutputs"))}</p>`;
    return;
  }
  $("#gallery").innerHTML = items
    .map(({ job, output }) => {
      const current =
        state.focus?.type === "output" &&
        state.focus.job_id === job.job_id &&
        state.focus.index === output.index;
      const classes = [
        "card",
        inContext(job.job_id, output.index) ? "in-context" : "",
        job.tags.includes("reject") ? "rejected" : "",
      ].join(" ");
      return `<div class="${classes}" role="button" tabindex="0" aria-current="${current}"
          data-job="${esc(job.job_id)}" data-index="${output.index}">
        ${mediaTag(output)}
        ${job.favorite ? `<span class="fav">★</span>` : ""}
        <button type="button" class="add secondary" data-toggle-context="${esc(job.job_id)}:${output.index}">${esc(
          inContext(job.job_id, output.index) ? "−" : t("addContext"),
        )}</button>
        <div class="meta"><span title="${esc(job.preset)}">${esc(job.preset)}</span>
          ${job.status === "completed" ? "" : `<span class="badge ${esc(job.status)}">${esc(job.status)}</span>`}</div>
      </div>`;
    })
    .join("");
  observeVideos($("#gallery"));
};

/* ---------- Inspector ---------- */

const facts = (rows) =>
  `<dl class="facts">${rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${value}</dd>`)
    .join("")}</dl>`;

const stepDecision = (step) =>
  facts([
    [t("method"), step.method && esc(step.method)],
    [t("model"), step.model && esc(step.model)],
    [t("preset"), step.preset && `<code>${esc(step.preset)}</code>`],
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

const REASON_KEYS = {
  remote_source: "rerunRemote",
  preset_missing: "rerunPresetMissing",
};

const ensureRerunForm = (jobId) => {
  if (state.forms[jobId]) return;
  state.forms[jobId] = "loading";
  api(`/api/jobs/${encodeURIComponent(jobId)}/rerun`)
    .then(({ form }) => {
      state.forms[jobId] = form;
    })
    .catch((error) => {
      state.forms[jobId] = { supported: false, message: error.message };
    })
    .finally(() => renderInspector());
};

const rerunField = (field) => {
  const label = `<span>${esc(field.name)}<small>${esc(field.label)}</small></span>`;
  if (field.type === "string") {
    const rows = field.role === "prompt" ? 5 : 2;
    return `<label class="field">${label}<textarea name="${esc(field.name)}" data-type="string" rows="${rows}">${esc(
      field.value,
    )}</textarea></label>`;
  }
  if (field.type === "int" || field.type === "float") {
    const step = field.type === "int" ? "1" : "any";
    const bounds = `${field.min === undefined ? "" : ` min="${esc(field.min)}"`}${field.max === undefined ? "" : ` max="${esc(field.max)}"`}`;
    return `<label class="field">${label}<input type="number" step="${step}"${bounds} name="${esc(
      field.name,
    )}" data-type="${esc(field.type)}" data-label="${esc(field.label)}" value="${esc(field.value)}" /></label>`;
  }
  return "";
};

// Video presets expose frame count and fps; show the resulting clip length.
const durationText = (form) => {
  const value = (labels) =>
    Number(
      [...form.querySelectorAll("[data-label]")].find((element) =>
        labels.includes(element.dataset.label),
      )?.value,
    );
  const frames = value(["length", "frames", "num_frames"]);
  const fps = value(["fps", "frame_rate"]);
  const seconds = value(["duration", "seconds"]);
  if (seconds > 0) return t("durationSeconds", { s: seconds.toFixed(1) });
  if (frames > 0 && fps > 0) return t("durationFrames", { s: (frames / fps).toFixed(1), fps });
  return "";
};

const updateDuration = (form) => {
  const note = form.querySelector("[data-duration]");
  if (note) note.textContent = durationText(form);
};

const acceptsKind = (uploadKind, outputKind) =>
  uploadKind === "file" ||
  (uploadKind === "audio" ? outputKind === "audio" : outputKind === "image");

const rerunInput = (input) => {
  const local = input.source === "local" && input.url;
  const preview = !local
    ? ""
    : input.kind === "audio"
      ? `<audio class="input-audio" src="${esc(input.url)}" controls preload="none"></audio>`
      : input.kind === "image" || input.kind === "mask"
        ? `<img class="input-preview" src="${esc(input.url)}" alt="" />`
        : "";
  // Gallery outputs added with "+ Use" are offered as replacements.
  const options = state.context
    .map((item) => ({ item, found: findOutput(item.job_id, item.output_index) }))
    .filter(({ found }) => found && acceptsKind(input.kind, found.output.kind))
    .map(
      ({ item, found }) =>
        `<option value="${esc(item.job_id)}:${item.output_index}">${esc(
          t("inputFromContext", { preset: `${found.job.preset} #${item.output_index}` }),
        )}</option>`,
    )
    .join("");
  return `<div class="input-slot${input.kind === "audio" ? " audio" : ""}">
      ${preview}
      <label class="field"><span>${esc(input.name)}<small>${esc(input.kind)}</small></span>
        <select data-input="${esc(input.name)}">
          <option value="">${esc(t("inputOriginal"))}</option>${options}
        </select>
      </label>
    </div>
    ${input.source === "server" ? `<p class="rerun-note">${esc(t("inputServerOnly", { name: input.server_name }))}</p>` : ""}`;
};

const renderRerunSection = (job) => {
  const form = state.forms[job.job_id];
  const heading = `<h3>${esc(t("rerunTitle"))}</h3>`;
  if (!form || form === "loading") {
    return `${heading}<p class="empty">${esc(t("rerunLoading"))}</p>`;
  }
  if (!form.supported) {
    return `${heading}<p class="empty">${esc(form.message ?? t(REASON_KEYS[form.reason] ?? "rerunPresetMissing"))}</p>`;
  }
  const seed = form.has_seed
    ? `<div class="seed-choice" role="radiogroup">
        <label><input type="radio" name="__seed" value="new" checked /> ${esc(t("seedNew"))}</label>
        <label><input type="radio" name="__seed" value="same" /> ${esc(t("seedSame"))}${
          form.seed === null ? "" : ` <code>${esc(form.seed)}</code>`
        }</label>
      </div>`
    : "";
  return `${heading}
    <form class="rerun" data-rerun="${esc(job.job_id)}">
      <p class="rerun-note">${esc(t("rerunNote", { url: state.data.connection.base_url }))}</p>
      ${
        form.inputs.length
          ? `<div class="inputs"><span class="inputs-title">${esc(t("inputsTitle"))}</span>${form.inputs
              .map(rerunInput)
              .join("")}<p class="rerun-note">${esc(t("inputHint"))}</p></div>`
          : ""
      }
      ${form.fields.map(rerunField).join("")}
      <p class="rerun-note" data-duration></p>
      ${seed}
      <div class="rerun-actions">
        <label class="count">${esc(t("countLabel"))}
          <select name="__count">${[1, 2, 3, 4].map((n) => `<option value="${n}">${n}</option>`).join("")}</select>
        </label>
        <button type="submit">${esc(t("rerunButton"))}</button>
      </div>
    </form>`;
};

const renderOutputInspector = (job, output) => {
  ensureRerunForm(job.job_id);
  const linked = stepsForJob(job.job_id);
  const rejected = job.tags.includes("reject");
  const editor =
    state.editing === "reject"
      ? `<form class="inline-form" data-form="reject"><input name="value" required placeholder="${esc(
          t("rejectReason"),
        )}" autofocus /><button type="submit">${esc(t("save"))}</button>
        <button type="button" class="ghost" data-cancel-edit>${esc(t("cancel"))}</button></form>`
      : state.editing === "note"
        ? `<form class="inline-form" data-form="note"><input name="value" required placeholder="${esc(
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
    : `<p class="empty">${esc(t("noDecision"))}</p>`;

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
        inContext(job.job_id, output.index) ? t("removeContext") : t("useAsContext"),
      )}</button>
    </div>
    ${editor}
    ${renderRerunSection(job)}
    ${rejected && job.reject_reason ? `<p><span class="badge reject">${esc(t("rejectedBecause"))}</span> ${esc(job.reject_reason)}</p>` : ""}
    <h3>${esc(t("decision"))}</h3>
    ${decision}
    <h3>${esc(t("prompt"))}</h3>
    ${facts([
      [t("preset"), `<code>${esc(job.preset)}</code>`],
      [
        t("character"),
        job.character &&
          esc(job.character.name + (job.character.form ? ` (${job.character.form})` : "")),
      ],
      [t("prompt"), job.prompt_final && esc(job.prompt_final)],
      [t("negative"), job.negative_final && esc(job.negative_final)],
      [t("seed"), esc(job.seed)],
      [t("status"), `<span class="badge ${esc(job.status)}">${esc(job.status)}</span>`],
      [t("submitted"), esc(formatDate(job.submitted_at))],
      [t("duration"), esc(formatDuration(job.duration_ms))],
      [t("connectedTo"), `<code>${esc(job.base_url)}</code>`],
    ])}
    ${job.notes.length ? `<h3>${esc(t("notes"))}</h3><ul class="notes">${job.notes.map((note) => `<li>${esc(note.text)}</li>`).join("")}</ul>` : ""}
    <details><summary>${esc(t("params"))}</summary><pre>${esc(JSON.stringify(job.params, null, 2))}</pre></details>
    <details><summary>job</summary><pre>${esc(job.job_id)}\n${esc(output.path)}</pre></details>`;
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
            `<button type="button" data-job="${esc(job.job_id)}" data-index="${output.index}">${mediaTag(output, "")}</button>`,
        )
        .join("");
      return `<div class="step">
        <div class="step-head"><strong>${index + 1}. ${esc(step.title)}</strong>
          <span class="badge ${esc(step.status)}">${esc(step.status)}</span></div>
        ${step.purpose ? `<p>${esc(step.purpose)}</p>` : ""}
        ${step.reason ? `<p class="reason">${esc(t("reason"))}: ${esc(step.reason)}</p>` : ""}
        ${stepDecision(step)}
        ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}
      </div>`;
    })
    .join("");
  return `<h2>${esc(t("plans"))}</h2>
    <h3 style="font-size:16px;margin-top:0">${esc(plan.title)} <span class="badge ${esc(plan.status)}">${esc(plan.status)}</span></h3>
    ${facts([
      [t("intent"), plan.intent && esc(plan.intent)],
      [t("summary"), plan.summary && esc(plan.summary)],
    ])}
    <h3>${esc(t("steps"))}</h3>
    ${steps}
    <details><summary>id</summary><pre>${esc(plan.id)}${plan.request_id ? `\n${esc(plan.request_id)}` : ""}</pre></details>`;
};

const renderInspector = () => {
  const focus = state.focus;
  let html = `<p class="empty">${esc(t("selectSomething"))}</p>`;
  if (focus?.type === "output") {
    const found = findOutput(focus.job_id, focus.index);
    if (found) html = renderOutputInspector(found.job, found.output);
  } else if (focus?.type === "plan") {
    const plan = state.data.plans.find(({ id }) => id === focus.id);
    if (plan) html = renderPlanInspector(plan);
  }
  const inspector = $("#inspector");
  // Keep a playing video alive when unrelated state refreshes arrive.
  if (inspector.dataset.html === html) return;
  // Re-renders (e.g. adding "+ Use" items) must not wipe what the user typed.
  const previous = inspector.querySelector("[data-rerun]");
  const saved = previous
    ? {
        id: previous.dataset.rerun,
        values: [...previous.elements]
          .filter((element) => element.name || element.dataset.input)
          .map((element) => ({
            key: element.name || `input:${element.dataset.input}`,
            value: element.type === "radio" ? element.checked : element.value,
            radioValue: element.type === "radio" ? element.value : undefined,
            disabled: element.disabled,
          })),
      }
    : null;
  inspector.dataset.html = html;
  unobserveVideos(inspector);
  inspector.innerHTML = html;
  const next = inspector.querySelector("[data-rerun]");
  if (saved && next && next.dataset.rerun === saved.id) {
    for (const element of next.elements) {
      const key = element.name || (element.dataset.input ? `input:${element.dataset.input}` : "");
      const entry = saved.values.find(
        (value) =>
          value.key === key &&
          (value.radioValue === undefined || value.radioValue === element.value),
      );
      if (!entry) continue;
      element.disabled = entry.disabled;
      if (element.type === "radio") element.checked = entry.value;
      else if (
        !element.options ||
        [...element.options].some((option) => option.value === entry.value)
      )
        element.value = entry.value;
    }
  }
  inspector.querySelector("input[autofocus]")?.focus();
  observeVideos(inspector);
  const rerunForm = inspector.querySelector("[data-rerun]");
  if (rerunForm) updateDuration(rerunForm);
};

/* ---------- Wiring ---------- */

const renderRuns = () => {
  const runs = state.data.runs ?? [];
  const strip = $("#runs");
  if (runs.length === 0) {
    strip.hidden = true;
    strip.innerHTML = "";
    return;
  }
  strip.hidden = false;
  const now = Date.now();
  strip.innerHTML = `<h2>${esc(t("runsTitle"))}</h2>${runs
    .slice(0, 5)
    .map((run) => {
      const end = run.finished_at ? Date.parse(run.finished_at) : now;
      const seconds = Math.max(0, Math.round((end - Date.parse(run.started_at)) / 1000));
      const label =
        run.status === "running"
          ? t("runRunning")
          : run.status === "completed"
            ? t("runCompleted")
            : t("runFailed");
      const link =
        run.status === "completed" && run.job_ids.length
          ? `<button type="button" class="ghost" data-job="${esc(run.job_ids[0])}" data-index="0">${esc(t("showResult"))}</button>`
          : "";
      return `<div class="run ${esc(run.status)}">
        ${run.status === "running" ? `<span class="spinner" aria-hidden="true"></span>` : ""}
        <span class="badge ${esc(run.status)}">${esc(label)}</span>
        <code>${esc(run.preset)}</code> ×${run.count}
        <span class="muted">${esc(t("elapsed", { s: seconds }))}</span>
        ${link}
        ${run.error ? `<span class="run-error">${esc(run.error.message)}</span>` : ""}
      </div>`;
    })
    .join("")}`;
};

const renderAll = () => {
  if (!state.data) return;
  const { connection, cwd } = state.data;
  $("#connection").textContent = `${t("connectedTo")}: ${connection.base_url}`;
  $("#connection").title = connection.source;
  $("#cwd").textContent = cwd;
  renderCharacters();
  renderPlans();
  renderRequests();
  renderContext();
  renderFilters();
  renderRuns();
  renderGallery();
  renderInspector();
};

const applyStaticText = () => {
  document.documentElement.lang = state.lang;
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  $("#request-text").placeholder = t("placeholder");
  $("#copy-request").textContent = t("copy");
  $("#queue-request").textContent = t("send");
  $("#queue-note").textContent = t("queueNote");
  $("#composer-hint").textContent = t("hint");
  $("#lang-toggle").textContent = state.lang === "ja" ? "English" : "日本語";
};

const LANG_KEY = "comfy-agent-studio-lang";
const savedLang = () => {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
};

const load = async () => {
  try {
    state.data = await api("/api/state");
  } catch (error) {
    setStatus(t("loadFailed", { message: error.message }));
    return;
  }
  // Drop selections that no longer exist (pruned jobs, removed characters).
  state.context = state.context.filter((item) => findOutput(item.job_id, item.output_index));
  if (state.character && !state.data.characters.some(({ name }) => name === state.character)) {
    state.character = null;
  }
  renderAll();
};

const toggleContext = (key) => {
  const [jobId, index] = [
    key.slice(0, key.lastIndexOf(":")),
    Number(key.slice(key.lastIndexOf(":") + 1)),
  ];
  state.context = inContext(jobId, index)
    ? state.context.filter((item) => !(item.job_id === jobId && item.output_index === index))
    : [...state.context, { job_id: jobId, output_index: index }];
  renderContext();
  renderGallery();
  renderInspector();
};

const feedback = async (body) => {
  const focus = state.focus;
  if (focus?.type !== "output") return;
  try {
    await api(`/api/jobs/${encodeURIComponent(focus.job_id)}/feedback`, body);
    state.editing = null;
    await load();
  } catch (error) {
    setStatus(error.message);
  }
};

document.addEventListener("click", (event) => {
  const target = event.target.closest(
    "[data-toggle-context],[data-remove-context],[data-clear-character],[data-character],[data-plan],[data-filter],[data-action],[data-cancel-edit],[data-job]",
  );
  if (!target) return;
  const { dataset } = target;
  if (dataset.toggleContext) {
    event.stopPropagation();
    toggleContext(dataset.toggleContext);
  } else if (dataset.removeContext) {
    toggleContext(dataset.removeContext);
  } else if ("clearCharacter" in dataset) {
    state.character = null;
    renderCharacters();
    renderContext();
  } else if (dataset.character) {
    state.character = state.character === dataset.character ? null : dataset.character;
    renderCharacters();
    renderContext();
  } else if (dataset.plan) {
    event.preventDefault();
    state.focus = { type: "plan", id: dataset.plan };
    state.editing = null;
    renderPlans();
    renderGallery();
    renderInspector();
  } else if (dataset.filter) {
    state.filter = dataset.filter;
    renderFilters();
    renderGallery();
  } else if (dataset.action) {
    const job = state.data.jobs.find(({ job_id: id }) => id === state.focus?.job_id);
    if (!job) return;
    if (dataset.action === "favorite") void feedback({ favorite: !job.favorite });
    else if (dataset.action === "unreject") void feedback({ reject: null });
    else {
      state.editing = dataset.action;
      renderInspector();
    }
  } else if ("cancelEdit" in dataset) {
    state.editing = null;
    renderInspector();
  } else if (dataset.job) {
    state.focus = { type: "output", job_id: dataset.job, index: Number(dataset.index) };
    state.editing = null;
    renderPlans();
    renderGallery();
    renderInspector();
  }
});

document.addEventListener("input", (event) => {
  const form = event.target.closest?.("[data-rerun]");
  if (form && event.target.dataset.label) updateDuration(form);
});

document.addEventListener("change", (event) => {
  if (event.target.name !== "__seed") return;
  const form = event.target.closest("[data-rerun]");
  const select = form?.querySelector('select[name="__count"]');
  if (!select) return;
  const same = event.target.value === "same" && event.target.checked;
  if (same) select.value = "1";
  select.disabled = same;
});

// Keep elapsed times moving while something is generating.
setInterval(() => {
  if (state.data?.runs?.some((run) => run.status === "running")) renderRuns();
}, 1000);

// Preview gallery videos on hover; they stay paused otherwise to save bandwidth.
document.addEventListener("mouseover", (event) => {
  const video = event.target.closest?.(".card")?.querySelector("video");
  if (video && video.paused) void video.play().catch(() => undefined);
});
document.addEventListener("mouseout", (event) => {
  const card = event.target.closest?.(".card");
  if (!card || card.contains(event.relatedTarget)) return;
  card.querySelector("video")?.pause();
});

document.addEventListener("keydown", (event) => {
  const card = event.target.closest?.(".card");
  if (card && (event.key === "Enter" || event.key === " ") && event.target === card) {
    event.preventDefault();
    card.click();
  }
});

const submitRerun = async (form) => {
  const overrides = {};
  for (const element of form.querySelectorAll("[data-type]")) {
    const type = element.dataset.type;
    overrides[element.name] = type === "string" ? element.value : Number(element.value);
  }
  const inputs = {};
  for (const select of form.querySelectorAll("[data-input]")) {
    if (!select.value) continue;
    const at = select.value.lastIndexOf(":");
    inputs[select.dataset.input] = {
      job_id: select.value.slice(0, at),
      output_index: Number(select.value.slice(at + 1)),
    };
  }
  const seed = form.querySelector('input[name="__seed"]:checked')?.value ?? "new";
  const count = Number(form.querySelector('select[name="__count"]').value);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api(`/api/jobs/${encodeURIComponent(form.dataset.rerun)}/rerun`, {
      overrides,
      inputs,
      seed,
      count,
      lang: state.lang,
    });
    setStatus(t("rerunStarted"));
    await load();
  } catch (error) {
    setStatus(error.message);
  } finally {
    button.disabled = false;
  }
};

document.addEventListener("submit", (event) => {
  const rerunForm = event.target.closest("[data-rerun]");
  if (rerunForm) {
    event.preventDefault();
    void submitRerun(rerunForm);
    return;
  }
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const value = new FormData(form).get("value")?.toString().trim();
  if (!value) return;
  void feedback(form.dataset.form === "reject" ? { reject: value } : { note: value });
});

$("#composer").addEventListener("submit", copyRequest);
$("#queue-request").addEventListener("click", queueRequest);
$("#lang-toggle").addEventListener("click", () => {
  state.lang = state.lang === "ja" ? "en" : "ja";
  try {
    localStorage.setItem(LANG_KEY, state.lang);
  } catch {
    // Remembering the language is a convenience only.
  }
  applyStaticText();
  $("#inspector").dataset.html = "";
  renderAll();
});
$("#request-text").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    $("#composer").requestSubmit();
  }
});

const connectEvents = () => {
  const events = new EventSource("/api/events");
  events.addEventListener("changed", () => void load());
};

const start = async () => {
  await load();
  const saved = savedLang();
  state.lang =
    state.data?.lang ??
    (saved === "ja" || saved === "en" ? saved : navigator.language.startsWith("ja") ? "ja" : "en");
  applyStaticText();
  renderAll();
  connectEvents();
  window.addEventListener("focus", () => void load());
};

void start();
