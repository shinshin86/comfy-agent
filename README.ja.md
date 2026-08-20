# Comfy Agent

![Logo](https://github.com/shinshin86/comfy-agent/raw/main/assets/comfy-agent-logo.png)

[![npm version](https://img.shields.io/npm/v/comfy-agent.svg)](https://www.npmjs.com/package/comfy-agent)
[![CI](https://github.com/shinshin86/comfy-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/shinshin86/comfy-agent/actions/workflows/ci.yml)

Comfy Agent は、GPU を持たない個人クリエイターが、Google Colab、RunPod、自宅 GPU
など任意の ComfyUI を AI エージェントに任せて、画像・動画・音楽を作るための CLI です。

English documentation: [README.md](./README.md)

## QuickStart（3 行）

```bash
npm install -g comfy-agent
comfy-agent connect http://127.0.0.1:8188            # Colab なら https://<id>.trycloudflare.com
comfy-agent run default --source remote --prompt "a cat riding a bicycle"
```

`connect` はサーバーを一度確認して URL を記憶します（Colab のトンネル URL が変わったら
再実行するだけ。preset と生成物はローカルに残ります）。`run` は workflow を投げて完了を待ち、
`./.comfy-agent/outputs/<preset>/<timestamp>/` に保存します。`default` は ComfyUI の UI で保存済みの
workflow 名です。自分の JSON を使うなら `comfy-agent import <file> --name <preset>`。

GPU が無い場合は [Google Colab で動かす](#google-colab-で動かす)、AI エージェントに任せるなら
[AI エージェント向け](#ai-エージェント向け) へ。

## Why comfy-agent

- **検証済み環境 catalog** — [36 kit](./scripts/colab/README.md) の GPU、download 量、
  setup 時間、license、E2E 証拠を機械可読データで提供します。
- **成果物と手順はローカルに保存** — preset、output、recipe、job は server reset 後も残り、
  [`connect`](./docs/cli-reference.ja.md#connect) が揮発 URL を吸収します。
- **事実と方針を分離** — CLI は構造化された
  [error contract](./docs/agent-playbook.md#3-error-contract-cli--agent) を返し、
  [playbook](./docs/agent-playbook.md) が agent 非依存の復旧方針を定義します。
- **制作 recipe と検証** — 再利用可能な [recipe](./recipes/music-video/RECIPE.md) に、
  `verify` と証拠に基づく成果物確認を組み込みます。

<a id="ai-エージェント向け"></a>

## AI エージェント向け

Claude Code、Codex、Cursor、Gemini CLI、OpenClaw に対応しています。利用する agent の
同梱 skill を install し、現在の方針を読みます。

```bash
comfy-agent skill install --agent claude
comfy-agent skill install --agent codex
comfy-agent playbook
```

その他の target は `cursor`、`gemini`、`openclaw` です。同梱 skill は
`comfy-agent skill list` で確認できます。repository 上の agent は [AGENTS.md](./AGENTS.md)
にも従ってください。`--json` と構造化 error code を優先し、exit code は `0`、`2`、`3`
だけを扱います。正典は [CLI リファレンス](./docs/cli-reference.ja.md) です。

再利用する character は、生成前に必ず `brief <name> --preset <preset> --json` で確認します。
`run <preset> --character <name>` で正典 prompt、参照画像、LoRA を注入します。
gallery には人間が承認した出力だけを残し、reject と kit note を次の session に引き継ぎます。

## Google Colab で動かす

手元に GPU がなくても、同梱 kit で Colab GPU 上に ComfyUI を立ち上げ、cloudflared
tunnel 越しにローカル CLI から実行できます。次の5ステップで始めます。

```bash
comfy-agent colab kit z_image      # prints installed paths: 01_setup.py / 02_start_comfyui.py / workflows
# paste setup + launcher into Colab, copy the tunnel URL
comfy-agent connect https://<id>.trycloudflare.com
comfy-agent import <workflow path printed above> --name z_image_turbo
comfy-agent run z_image_turbo --prompt "a cat riding a bicycle"
```

| 種別 | キット / モデル | 状態 | 最小GPU | 対応内容 |
| --- | --- | --- | --- | --- |
| 画像 | [`z_image/`](./scripts/colab/z_image/) | 検証済み | T4 | Z-Image Turbo テキスト→画像 |
| 画像 | [`sdxl/`](./scripts/colab/sdxl/) | 検証済み | T4 | Stable Diffusion XL Base テキスト→画像 |
| 画像 | [`sdxl_turbo/`](./scripts/colab/sdxl_turbo/) | 検証済み | T4 | SDXL Turbo 1-step テキスト→画像 |
| 画像 | [`anima/`](./scripts/colab/anima/) | 検証済み | T4 | Anima Base v1.0 アニメ画像生成 |
| 画像 | [`ooo_anima/`](./scripts/colab/ooo_anima/) | 検証済み | T4 | OOO_Anima v10 アニメ画像生成 |
| 画像 | [`anima_pencil/`](./scripts/colab/anima_pencil/) | 検証済み | T4 | anima_pencil v2 アニメ画像生成 |
| 画像 | [`z_anime/`](./scripts/colab/z_anime/) | 一部検証 | T4 | Z-Anime base / distilled 画像生成 |
| 画像 | [`qwen_image/`](./scripts/colab/qwen_image/) | Starter | L4 | Qwen-Image テキスト→画像 |
| 画像 | [`qwen_image_edit/`](./scripts/colab/qwen_image_edit/) | Starter | L4 | Qwen-Image-Edit 指示ベース画像編集 |
| 画像 | [`boogu/`](./scripts/colab/boogu/) | 検証済み | L4 | Boogu-Image Turbo テキスト→画像 |
| 画像 | [`krea2/`](./scripts/colab/krea2/) | 検証済み | L4 | Krea 2 Turbo テキスト→画像 |
| 画像 | [`flux1/`](./scripts/colab/flux1/) | 検証済み | L4 | Flux 1 dev テキスト→画像 |
| 画像 | [`flux2/`](./scripts/colab/flux2/) | 検証済み | A100 | Flux 2 dev テキスト→画像 |
| 画像 | [`hidream_i1/`](./scripts/colab/hidream_i1/) | 検証済み | L4 | HiDream-I1 Fast / Dev / Full 画像生成 |
| 画像 | [`hidream_o1/`](./scripts/colab/hidream_o1/) | 検証済み | A100 | HiDream-O1 Dev 推論指向2K画像生成 |
| 画像 | [`ideogram4/`](./scripts/colab/ideogram4/) | 検証済み | L4 | Ideogram 4.0 文字描画に強い画像生成 |
| 画像 | [`sd35/`](./scripts/colab/sd35/) | 検証済み | L4 | Stable Diffusion 3.5 Large 画像生成 |
| 画像 | [`birefnet/`](./scripts/colab/birefnet/) | 検証済み | T4 | BiRefNet 背景除去・透過PNG |
| 画像 | [`seedvr2/`](./scripts/colab/seedvr2/) | 検証済み | L4 | SeedVR2 高解像度化・修復 |
| 動画 | [`wan21/`](./scripts/colab/wan21/) | 一部検証 | T4 | Wan 2.1 1.3B / 14B テキスト→動画 |
| 動画 | [`wan22/`](./scripts/colab/wan22/) | 一部検証 | A100 | Wan 2.2 TI2V 5B / T2V 14B |
| 動画 | [`wan22_s2v/`](./scripts/colab/wan22_s2v/) | 検証済み | A100 | Wan 2.2 S2V 参照画像＋音声→動画 |
| 動画 | [`animegen_t2v/`](./scripts/colab/animegen_t2v/) | 検証済み | A100 | AnimeGen-T2V アニメ動画生成 |
| 動画 | [`hunyuan_video/`](./scripts/colab/hunyuan_video/) | 検証済み | L4 | Hunyuan Video テキスト→動画 |
| 動画 | [`ltx23/`](./scripts/colab/ltx23/) | Starter | A100 | LTX-2.3 画像 / 画像＋音声→動画 |
| 動画 | [`ltx23_t2v/`](./scripts/colab/ltx23_t2v/) | 検証済み | A100 | LTX-2.3 音声付きテキスト→動画 |
| 動画 | [`ltx25/`](./scripts/colab/ltx25/) | 検証済み | A100 | LTX-2.5 T2V / I2V / 始終端フレーム＋音声 |
| 動画 | [`minimax_h3/`](./scripts/colab/minimax_h3/) | 検証済み | A100 | MiniMax H3 T2V / I2V＋ステレオ音声 |
| 動画 | [`sulphur2/`](./scripts/colab/sulphur2/) | 検証済み | A100 | Sulphur-2 T2V / I2V |
| 動画 | [`10eros/`](./scripts/colab/10eros/) | 一部検証 | A100 | 10Eros T2V / I2V |
| 音声 | [`ace_step_1_5/`](./scripts/colab/ace_step_1_5/) | 一部検証 | T4 | ACE-Step 1.5 歌詞・ボーカル付きフル楽曲 |
| 音声 | [`minimax_music3/`](./scripts/colab/minimax_music3/) | 検証済み | L4 | MiniMax Music 3 歌詞・ボーカル付き楽曲 |
| 音声 | [`stable_audio3_small_music/`](./scripts/colab/stable_audio3_small_music/) | 一部検証 | T4 | Stable Audio 3 Small Music インスト・BGM |
| 音声 | [`stable_audio3/`](./scripts/colab/stable_audio3/) | 検証済み | L4 | Stable Audio 3 Medium 音楽・効果音 |
| 音声 | [`moss_soundeffect_v2/`](./scripts/colab/moss_soundeffect_v2/) | 検証済み | A100 | MOSS-SoundEffect v2 48 kHz効果音 |
| 複合 | [`music_video/`](./scripts/colab/music_video/) | 検証済み | A100 | 楽曲＋キーフレーム＋動画クリップのMVレシピ |

状態は model 品質ではなく検証証拠です。**検証済み**は Colab から local CLI までの
全 flow を通過、**一部検証**は一部 GPU または workflow variant のみ通過、
**Starter** は静的検証済みで E2E 記録待ちです。gated、非商用、地域、利用規約、
有料 GPU の注意は、各 kit README を選択前に確認してください。

runtime 選択前に catalog を使います。

```bash
comfy-agent colab catalog --json
comfy-agent colab suggest "fast image generation on a T4" --json
comfy-agent colab kit z_image --json
```

preset と出力は Colab reset 後も残ります。表示された2つの script を再実行し、新しい
tunnel URL を `connect` してください。preset の再 import は不要です。setup と license の
詳細は [Colab kit guide](./scripts/colab/README.md) を参照してください。

## インストールと要件

- Node.js 22 以上。
- 接続・生成コマンドでは、到達可能な ComfyUI server。

```bash
npm install -g comfy-agent
comfy-agent --help
```

開発者は `npm install`、`npm run build`、`npm run dev -- <command>` を使えます。
Windows では PowerShell を使い、空白を含む file path を quote してください。

npm package には上記 command で使う playbook、skill、recipe、catalog、setup script、
workflow JSON が含まれます。これらの同梱 resource を読んだり install したりするために、
repository を別途 checkout する必要はありません。package install 直後から利用できます。
表示言語は `--lang ja` または `COMFY_AGENT_LANG=ja` で日本語に切り替えられます。

## コマンド一覧

| command | 用途 |
|---|---|
| `init` | local/global workdir を作成。 |
| `connect` | ComfyUI URL を確認して記憶。 |
| `import` | API/UI workflow JSON を local preset に変換。 |
| `run` | preflight、submit、待機/download、または `--async` submit。 |
| `history` | 制作 history を検索し、note・tag・reject を記録。 |
| `character` | 再利用可能な identity、参照画像、LoRA、note、採用作を管理。 |
| `character sheet` | 人間承認済み gallery から identity board を作成。 |
| `brief` | 生成前に character memory と preset 適用可否を取得。 |
| `jobs list\|show\|wait\|prune` | 保存 job の確認と再開。 |
| `doctor` | 接続、workdir、node、model を検査。 |
| `list` | local/remote workflow を検索。 |
| `preset` | parameter、alias、upload、metadata を表示。 |
| `status` | 解決済み runtime 設定を表示。 |
| `verify` | 出力を probe し、確認用成果物を offline 作成。 |
| `analyze` | OpenAI 画像入力で画像を評価。 |
| `colab catalog\|suggest\|kit` | 同梱 Colab kit を確認・解決。 |
| `playbook` | 同梱 agent 方針 document を読む。 |
| `skill list\|install` | 対応 agent 向け同梱 skill を install。 |

全 option と payload は [CLI リファレンス](./docs/cli-reference.ja.md) を参照してください。

## 出力と作業ディレクトリ

`connect` または `init` は `.comfy-agent/` に `workflows/`、`presets/`、`outputs/`、
`jobs/`、`cache/` を作り、記憶した URL は `config.yaml` に保存します。`--global` は
`~/.config/.comfy-agent` を使います。生成物の既定先は
`.comfy-agent/outputs/<preset>/<timestamp>/` で、`run.json` も保存します。`verify` は
`<run-dir>/verify/` に確認用成果物を書きます。

## 終了コードと JSON

CLI の終了コードは `0`（成功）、`2`（呼び出し・入力・local environment が不正）、
`3`（server・実行対象・成果物の状態が期待と異なる）だけです。`--json` の成功は
`{ "ok": true, ... }`、失敗は
`{ "ok": false, "error": { "code": "...", "message": "...", "details": ... } }` です。
`run --dry-run --json` は character option が無ければ raw workflow JSON を返し、
`--character` 付きでは patch 後の `workflow` と character 注入 metadata を含む envelope を
返します。
`PROMPT_REJECTED`（exit 3）はComfyUIがworkflowを拒否した状態です。`details.error` と
`details.node_errors` を確認し、指摘されたnode inputを修正して再実行してください。
詳細は [終了コードとエラー](./docs/cli-reference.ja.md#終了コード) を参照してください。

## ドキュメント

- [Agent Playbook](./docs/agent-playbook.md) — blueprint、復旧、検証方針。
- [CLI リファレンス](./docs/cli-reference.ja.md) — command、preset、JSON、error。
- [Roadmap](./docs/roadmap.md) — release 済みの基盤、計画中 milestone、non-goal。
- [MiniMax H3 prompting](./docs/minimax-h3-prompting.md) — H3 動画・音声 prompt 形式。
- [music-video recipe](./recipes/music-video/RECIPE.md) — 多段制作 workflow。
- [Colab kit guide](./scripts/colab/README.md) — 全 kit と setup 詳細。
- [CHANGELOG](./CHANGELOG.md) — release 履歴。

## Contributing / License

開発者は [CLAUDE.md](./CLAUDE.md) の E2E 検証規律に従ってください。
Comfy Agent は [MIT License](./LICENSE) で提供します。

## Command reference

全 command の詳細は [docs/cli-reference.ja.md](./docs/cli-reference.ja.md) を参照してください。
