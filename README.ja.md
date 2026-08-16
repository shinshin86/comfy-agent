# Comfy Agent

![Logo](https://github.com/shinshin86/comfy-agent/raw/main/assets/comfy-agent-logo.png)

Comfy Agent は ComfyUI を CLI から使うためのツールです。  
ユーザーがCLIからComfyUIを使えるほか、AIエージェント経由で自動実行する用途にもオススメです。

英語版ドキュメント: [README.md](./README.md)

## QuickStart

ローカル ComfyUI（`http://127.0.0.1:8188`）ですぐ試す方法を以下のとおりです。

1. CLIをインストール

```bash
npm install -g comfy-agent
comfy-agent --help
```

2. ブラウザ上の ComfyUI で `default` を一度保存

![Quick Start - 1](https://github.com/shinshin86/comfy-agent/raw/main/assets/quick-start_1.png)

- ブラウザで ComfyUI（例: `http://127.0.0.1:8188`）にアクセス
- 組み込みの `default` workflow を開き、**Save** を1回実行
- これで CLI から `default [remote]` として参照できます

**注意: ComfyUI上で一度ワークフローを保存しなければ `comfy-agent` 上からは参照できません**

3. CLI で確認して実行

```bash
comfy-agent list --source remote --base-url http://127.0.0.1:8188
comfy-agent run default --source remote --base-url http://127.0.0.1:8188 --prompt "A cat"
```

生成物は既定で `.comfy-agent/outputs/<preset>/<timestamp>/` に保存されます。

自分の workflow JSON を使う場合は、下の `import` セクションの手順をご覧ください。

また、Google Colabで動くComfyUIなどを利用する場合は `--base-url` でURLを指定することで実行可能です。

## Google Colab で動かす

手元に GPU がなくても、Colab の GPU ランタイムで ComfyUI を動かし、
ローカルの `comfy-agent` から cloudflared トンネル越しに呼び出せます。

貼り付けるだけで動くキットを、現在 **36種類** 用意しています。
以下は [`scripts/colab/`](./scripts/colab/) の実装済みcatalogと
対応した一覧です。各リンク先でセットアップスクリプト、workflow、パラメータ、
GPUの目安、ライセンス上の注意を確認できます。

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

状態はモデル品質ではなく検証証拠を表します。**検証済み**はColabからローカルCLIまでの
一連のE2Eを通過、**一部検証**は一部GPUまたはworkflow variantのみ通過、
**Starter**は静的検証済みでE2E記録待ちです。キットによってはアクセス制限、
非商用、地域、利用規約上の制約があります。モデルのダウンロードや有料GPUの選択前に、
リンク先のREADMEを確認してください。

手順はどのキットでも同じです。

1. Colab ノートブックを開き、推奨の GPU ランタイムを選択。
2. キット内の `01_setup.py` をセルに貼り付けて実行
   （ComfyUI・モデル weights・cloudflared をインストール）。
3. [`scripts/colab/02_start_comfyui.py`](./scripts/colab/02_start_comfyui.py)
   を次のセルに貼り付けて実行。ComfyUI とトンネルがバックグラウンドで起動します。
4. 公開 URL を取得:

   ```python
   !cat /content/comfy_url.txt
   ```

5. 手元のマシンに戻り、同梱workflowを一度だけimportし、現在のトンネルURLへ
   接続してプリフライト後に実行:

   ```bash
   comfy-agent import ./scripts/colab/z_image/z_image_turbo.json --name z_image_turbo
   comfy-agent connect https://<id>.trycloudflare.com
   comfy-agent doctor --preset z_image_turbo
   comfy-agent run z_image_turbo --prompt "a cat riding a bicycle"
   ```

補足:

- preset・workflow・生成物はローカルの `.comfy-agent/` に残ります。Colabランタイムの
  再起動後はキットのセルを再実行してComfyUIとモデルを復元し、新しいURLで
  `comfy-agent connect <new-url>` を実行すれば、再importせずに再開できます。
- モデル別のパラメータフラグや VRAM/所要時間の目安は、各キットの `README.md` を参照してください。

AIエージェント向けのキット情報は `colab` 補助コマンドで取得できます。

```bash
comfy-agent colab catalog --json
comfy-agent colab suggest "fast image generation on a T4" --json
comfy-agent doctor --json
comfy-agent doctor --preset <preset> --json
```

`colab suggest` は、出力メディア・音声機能・GPU要件が合わない候補を先に除外し、
目的への適合度と信頼度（`verified` > `partial` > `starter`）で互換候補を並べます。
互換候補がない場合、`--json` は代替候補と満たせない要件を返します。
任意の `gpu.verified` はE2E実測済みGPUで、宣言上の互換下限 `gpu.minimum` とは別です。

catalogからはモデル資産、推定ダウンロード量・セットアップ時間、他キットと同居可能か、
ライセンス上の注意も取得できます。`doctor --preset` は接続先に必要なモデルとノードが
揃っているか検査し、`run` も実行前に同じプリフライトを自動実行します。
設計、復旧、成果物検証までの全体フローは
[Agent Playbook](./docs/agent-playbook.md) を参照してください。

注意: `colab` はリポジトリ側の補助コマンドです。`scripts/colab/catalog.yaml`
を読み込みますが、このファイルは **npm パッケージには同梱されません**。本リポジトリの
チェックアウト上で実行してください。catalog は持ち運びやすい公開情報だけを返します。
パスは `scripts/colab/` からの相対パスで、ローカルの絶対パスや環境変数の値は出力しません。

## 前提

- Node.js 22+
- ComfyUI が起動していること（既定: `http://127.0.0.1:8188`）

## インストール

npm公開版を使う場合（推奨）:

```bash
npm install -g comfy-agent
comfy-agent --help
```

ソースから実行する場合（開発向け）:

```bash
npm install
npm run build
```

開発中の実行例:

```bash
npm run dev -- init
npm run dev -- list
```

## 作業ディレクトリ

`comfy-agent init` 実行で `.comfy-agent/` を作成します。

```
.comfy-agent/
  workflows/
  presets/
  outputs/
  cache/
```

### グローバル設定

`--global` を付けると `~/.config/.comfy-agent` を使用します。

```bash
comfy-agent init --global
comfy-agent list --global
comfy-agent run text2img_v1 --global --prompt "A cat"
```

## ComfyUI 連携の流れ

- POST `/prompt` に workflow API 形式 JSON を送信してキュー投入
- GET `/history/{prompt_id}` をポーリングして完了待ち
- `/history` から `filename/subfolder/type` を抽出し、画像/動画を GET `/view` で保存
- 画像入力が必要な場合は POST `/upload/image` または `/upload/mask`
  （音声/汎用ファイル upload も ComfyUI の input upload 経路を使い、
  `LoadAudio` などへ差し込めます）
- `import` 実行時に GET `/object_info` を参照できる場合は型推定を補強

## base_url の優先順位

1. `--base-url`
2. 環境変数 `COMFY_AGENT_BASE_URL`
3. `.comfy-agent/config.yaml` の `base_url`（`comfy-agent connect` で保存。
   コマンドのスコープを先に参照し、無ければもう一方のスコープを参照）
4. 既定値 `http://127.0.0.1:8188`

## コマンド

### init

```bash
comfy-agent init
comfy-agent init --global
```

### import

ComfyUI の workflow API JSON を取り込み、プリセット雛形を生成します。

```bash
comfy-agent import ./workflow_api.json --name text2img_v1
comfy-agent import ./workflow_api.json --name text2img_v1 --base-url http://127.0.0.1:8188
comfy-agent import ./workflow_api.json --name text2img_v1 --global
comfy-agent import ./workflow_api.json --name text2img_v1 --force
```

補足: こちらを行う場合は ComfyUI 側で workflow API JSON をエクスポートしてください。現在開いている編集状態からの直接取り込みには未対応です。

`/object_info` が取得できる場合は型推定を補強します（`.comfy-agent/cache/object_info.json` にキャッシュ）。失敗してもフォールバックします。

生成されるプリセットには、人間や AI エージェントが読みやすいように自動で注釈が付きます。

- すべてのパラメータに `description` を付与します。
- ノードのクラスと入力名から判別できる場合は `role`（例: `prompt`、`seed`、`steps`、`guidance`、`width`、`height`、`sampler`、`scheduler`、`denoise`、`strength`）を推論します。判別できない入力には `role` は付きません。
- 既知の role には数値ヒントを付与します（`steps`/`width`/`height` に `min: 1`、`guidance` に `min: 0`、`denoise`/`strength` に `min: 0` / `max: 1`）。
- 判別できた入力には `--prompt`、`--negative`、`--steps`、`--cfg`、
  `--width`、`--height` などの安定した alias を付与します。動画・音声では
  `--length`、`--fps`、`--seconds`、`--lyrics` が付く場合もあります。

既存 preset に生成 alias を追加するには `--force` で再 import してください。
parameter の target が同じなら手書き alias は保持されますが、それ以外の手書き編集は
従来どおり上書きされます。生成 alias が操作する target は1つだけです。2段目の sampler、
scheduler、duration、dimension に同じ値が必要な workflow では、追加 target を
`--<node_id>_<input>` で個別指定してください。

これらは説明用のメタデータで、ワークフローの実行内容は変えません。対応フィールドの一覧は [プリセット定義](#プリセット定義) を参照してください。

### list

```bash
comfy-agent list
comfy-agent list --json
comfy-agent list --global
comfy-agent list --source all
comfy-agent list --source remote --base-url http://127.0.0.1:8188
comfy-agent list --source remote-catalog --base-url http://127.0.0.1:8188
```

- `--source all`: `local + remote`（保存済み userdata workflow）
- `--source remote-catalog`: 明示指定時のみカタログ項目を表示

補足: `remote-catalog` はComfyUI側で既に設定されているテンプレートのことになります。ただ、こちらは**API経由では直接実行ができないため**、一度ComfyUI側で保存をしてもらってから、それをリモートのワークフローとして扱うという手順が必要になります。

### run

```bash
comfy-agent run text2img_v1 --prompt "A cat" --steps 30
comfy-agent run text2img_v1 --prompt "A cat" --json
comfy-agent run text2img_v1 --prompt "A cat" --dry-run
comfy-agent run text2img_v1 --prompt "A cat" --n 3 --seed 42 --seed-step 1
comfy-agent run text2img_v1 --global --prompt "A cat"
comfy-agent run image_z_image_turbo --source remote-catalog --prompt "A cat" --base-url http://127.0.0.1:8188
```

- `--seed` は、parameter名 `seed`、alias `seed`、`role: seed` の順で、最初に一致した分類を対象にします。
- 同じ分類に複数の対象がある場合はすべてに同じ値を適用し、`--seed-step` でも同期して進めます。
- `--12_noise_seed 5` のように個別のparameter flagを明示した対象では、その値を `--seed` より優先します。

uploads がある場合の例:

```bash
comfy-agent run inpaint_v1 --prompt "fix" --init-image ./in.png --mask ./mask.png
comfy-agent run talking_v1 --image ./portrait.png --audio ./voice.mp3
```

プリセットの parameter や upload に `aliases` がある場合、正式なフラグの代わりに
alias を使用できます。`import` は判別できた一般的な入力の alias を自動生成し、手書きで
追加することもできます。正式な `--<node_id>_<input>` も引き続き使用でき、両方を
指定した場合は後に指定した値が優先されます。

remote ソースについて:

- `--source remote` は `userdata/workflows` に保存された workflow（実行向け）を参照します。
- `--source remote-catalog` はテンプレートカタログ参照（明示的な上級用途）です。
- `list --source remote` で検出させるには、ComfyUI の `userdata/workflows` 配下に workflow を保存してください。
- 保存形式が ComfyUI UI 形式（`nodes`/`links`）でも、実行時に API prompt 形式へ自動変換します。
- メモ系など UI 専用ノードは変換時に無視されます。
- カタログ側は API から workflow JSON を直接取得できない項目が存在します。
- 複雑な custom node 構成で検証エラーになる場合は、ComfyUI から API JSON をエクスポートして local preset として取り込んでください。

### jobs

`run --async` は prompt を投入し、完了を待たずに job ID を返します。
`jobs wait <id>` は現在のサーバーへ再接続し、進捗を表示して、投入時に記録した
ディレクトリへ出力を保存します。同期・非同期を問わずすべての run が
`.comfy-agent/jobs/` に record を書くため、端末を閉じたり run を中断した後も再開できます。

```bash
comfy-agent run text2img_v1 --prompt "A cat" --n 2 --async
comfy-agent jobs list
comfy-agent jobs show <job_id>
comfy-agent jobs wait <job_id> --poll-interval-ms 1000
comfy-agent jobs prune --older-than-days 30 --dry-run
```

`jobs list` と `jobs show` はローカル record のみを読み、サーバーへ接続しません。
完了済み job への `jobs wait` は安全に再実行できます。global workdir には
`--global` を使いますが、job の個別検索では見つからない場合に他方 scope も検索します。

```json
{
  "ok": true,
  "async": true,
  "preset": "text2img_v1",
  "source": "local",
  "base_url": "http://127.0.0.1:8188",
  "scope": "local",
  "output_dir": "/path/to/.comfy-agent/outputs/text2img_v1/20260816_101500",
  "jobs": [
    {
      "job_id": "<job_id>",
      "prompt_id": "<job_id>",
      "batch_index": 1,
      "seed": null,
      "status": "submitted",
      "job_file": "/path/to/.comfy-agent/jobs/<job_id>.json"
    }
  ]
}
```

ComfyUI の history はメモリ上にあります。server process または Colab runtime が
再起動すると `jobs wait` は `JOB_LOST` を返すため、同じ preset を再実行してください。

### connect

ComfyUI の base URL を疎通確認して `.comfy-agent/config.yaml` に保存します。
以後のコマンドで `--base-url` や環境変数の指定が不要になります。
Colab + trycloudflare のような「セッションごとに URL が変わる」サーバー向けで、
ランタイム再起動後は新しい URL で `connect` し直すだけで復帰できます。

```bash
comfy-agent connect https://xxxx.trycloudflare.com
comfy-agent connect https://xxxx.trycloudflare.com --json
comfy-agent connect http://127.0.0.1:8188 --global
comfy-agent connect https://xxxx.trycloudflare.com --force   # 疎通失敗でも保存
```

### doctor

```bash
comfy-agent doctor
comfy-agent doctor --json
comfy-agent doctor --global
comfy-agent doctor --all-scopes
comfy-agent doctor --preset text2img_v1        # サーバーのモデル/ノード充足も検査
comfy-agent doctor --preset text2img_v1 --json
```

`--preset` を付けると `/object_info` を取得し、プリセットのワークフローが
参照するノードクラス・モデルファイルが接続先サーバーに揃っているかを検査します
（`--json` では `preflight` セクション。不足があれば exit code 3）。

### status

現在参照される設定（scope/base_url/workdir/preset数）を表示します。

```bash
comfy-agent status
comfy-agent status --json
comfy-agent status --global
```

### preset

プリセット定義をユーザー向けに見やすく表示します。

```bash
comfy-agent preset text2img_v1
comfy-agent preset text2img_v1 --json
comfy-agent preset text2img_v1 --global
comfy-agent preset text2img_v1 --source local
comfy-agent preset text2img_v1 --source remote --base-url http://127.0.0.1:8188
```

### analyze

生成画像が指示に合っているかを OpenAI の画像入力で評価します。

```bash
export OPENAI_API_KEY=...
comfy-agent analyze ./output.png --prompt "A cat on a sofa"
comfy-agent analyze ./output.png --prompt "A cat" --json
comfy-agent analyze ./output.png --prompt "A cat" --out ./analysis.json
```

## 使い方のポイント

- パラメータ指定は `--param value`（プリセットの `parameters` 名と一致）
- uploads はプリセットの `uploads.*.cli_flag` で指定（例: `--init-image`）
- `--dry-run` は API を呼ばずに上書き後の workflow JSON を出力
- 出力先は既定で `.comfy-agent/outputs/<preset>/<YYYYmmdd_HHMMSS>/`
- `run` 実行時に解決された出力ディレクトリと保存ファイルパスをログ表示
- `run` はデフォルトで WebSocket の進捗表示を使用し、進捗チャネルが切断された場合は自動的にポーリングへフォールバックして監視を継続
- 反復実行は `--n`、seed は `--seed random` または `--seed <int> --seed-step <int>`
- 接続先はプリセットに含めず、`--base-url` または `COMFY_AGENT_BASE_URL` で切替します
- 複数サーバー運用は「サーバーごとに Comfy Agent（作業ディレクトリ）を分ける」運用を推奨します
- 動画出力がある場合も `/history` の結果に従って保存します
- analyze は OpenAI の API キーが必要です（`OPENAI_API_KEY`）
- 表示言語は `--lang ja` または `COMFY_AGENT_LANG=ja` で切替できます（既定は `en`）
- remote workflow の読み取り順（ユーザー向け簡易版）は `docs/remote-workflow-resolution-quick-ja.md` を参照してください
- remote workflow の詳細仕様（開発者向け）は `docs/remote-workflow-resolution.md` を参照してください

## 生成→解析→調整の流れ（例）

1. 生成

```bash
comfy-agent run text2img_v1 --prompt "A cat on a sofa" --steps 30
```

2. 生成結果を解析  
   （保存されたファイルを指定して一致度を評価）

```bash
export OPENAI_API_KEY=...
comfy-agent analyze .comfy-agent/outputs/text2img_v1/20260203_120000/00001_123_1.png \
  --prompt "A cat on a sofa" --json
```

3. 判定に応じて再生成  
   （スコアや missing/extra を見て prompt を調整）

```bash
comfy-agent run text2img_v1 --prompt "A fluffy orange cat on a sofa" --steps 35
```

## analyze の制限

- 対応形式: PNG/JPEG/WEBP/GIF（非アニメ）
- Chat Completions の画像入力は 8MB を超えると失敗するため、8MB 以下にしてください
- `--detail low` はコストを抑えられますが精度が下がる場合があります
- 動画解析は未対応（将来: フレーム抽出で対応予定）

## プリセット定義

```yaml
version: 1
name: text2img_v1
workflow: text2img_v1.json
parameters:
  prompt:
    type: string
    target:
      node_id: 12
      input: text
    required: true
  negative:
    type: string
    target:
      node_id: 13
      input: text
    default: ""
  steps:
    type: int
    target:
      node_id: 5
      input: steps
    default: 30
uploads:
  init_image:
    kind: image
    cli_flag: --init-image
    target:
      node_id: 21
      input: image
  mask:
    kind: mask
    cli_flag: --mask
    target:
      node_id: 22
      input: mask
  audio:
    kind: audio
    cli_flag: --audio
    target:
      node_id: 23
      input: audio
```

### メタデータ項目

プリセットには、自身を人間や AI エージェントに説明するための任意メタデータを持たせられます。**以下の項目はすべて任意**で、付いていない既存プリセットもそのまま有効です。`aliases` を除き、これらはワークフローの実行内容を変えません。

プリセット直下の項目:

| 項目 | 型 | 意味 |
|---|---|---|
| `description` | string | プリセットの説明。 |
| `task` | enum | `text_to_image` / `image_to_image` / `image_edit` / `remove_background` / `inpaint` / `upscale` / `text_to_audio` / `audio_to_audio` / `audio_inpaint` / `text_to_video` / `image_to_video` / `video_to_video` / `custom` のいずれか。 |
| `tags` | string[] | 検索・分類用の自由ラベル。 |

パラメータの項目（`type` / `target` / `required` / `default` に加えて）:

| 項目 | 型 | 意味 |
|---|---|---|
| `description` | string | 人間/エージェント向けの説明。 |
| `role` | enum | `prompt` / `negative_prompt` / `seed` / `steps` / `guidance` / `width` / `height` / `sampler` / `scheduler` / `model` / `strength` / `denoise` / `advanced` / `custom` のいずれか。 |
| `aliases` | string[] | `run` で受け付ける別名フラグ。 |
| `min` / `max` | number | 参考用の数値範囲。 |
| `choices` | array | 参考用の許容値リスト。 |
| `recommended` | any | 参考用の推奨値。 |

upload の項目:

| 項目 | 型 | 意味 |
|---|---|---|
| `kind` | enum | `image` / `mask` / `audio` / `file` のいずれか。 |
| `cli_flag` | string | `run` で受け付けるCLIフラグ（例: `--image` / `--audio`）。 |
| `target` | object | アップロード後のファイル名を差し込む workflow ノード入力。 |
| `description` | string | 人間/エージェント向けの説明。 |
| `role` | enum | `init_image` / `mask` / `reference_image` / `control_image` / `input_image` / `input_audio` / `reference_audio` / `input_file` / `custom` のいずれか。 |
| `aliases` | string[] | `run` で受け付ける別名フラグ。 |
| `required` | boolean | 必須の upload かどうか。 |

補足:

- `import` は `description` を付与し、判別できる入力には `role`、数値ヒント、
  一般的な parameter alias も付けます。alias はグラフ構造を優先して推論し、
  `seed` alias は生成しません。`--seed` は前述の seed role 解決を使用します。
- `list --json` と `preset --json` はこれらの項目を出力に含めるため、AI エージェントは YAML を開かずにプリセットの意図を読み取れます。
- `aliases`（`run` が追加フラグとして解釈）を除き、これらは説明用で、実行時に値を検証・制約することはありません。

## JSON 出力

`--json` を付けると stdout に JSON のみを出力します。
`--json` をサポートする全コマンドは、成功・失敗とも `{ "ok": ... }` 封筒を
使用します。唯一の例外は `run --dry-run --json` で、ComfyUI にそのまま送れる
patched workflow の生 JSON を出力します。

成功例:

```json
{
  "ok": true,
  "preset": "text2img_v1",
  "source": "local",
  "base_url": "http://127.0.0.1:8188",
  "scope": "local",
  "output_dir": ".comfy-agent/outputs/text2img_v1/20260203_120000",
  "runs": [
    {
      "index": 1,
      "prompt_id": "xxxxxxxx",
      "seed": 123,
      "outputs": [
        {
          "filename": "00001.png",
          "subfolder": "",
          "type": "output",
          "saved_to": ".comfy-agent/outputs/text2img_v1/20260203_120000/00001_123_1.png"
        }
      ],
      "duration_ms": 12345,
      "progress_events": [
        {
          "kind": "channel_connected",
          "timestamp": 1738900000000
        },
        {
          "kind": "execution_start",
          "timestamp": 1738900000100
        },
        {
          "kind": "progress",
          "timestamp": 1738900000200,
          "node": "3",
          "value": 5,
          "max": 20,
          "percent": 25
        }
      ]
    }
  ]
}
```

失敗例:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_REQUIRED_PARAM",
    "message": "prompt is required",
    "details": {
      "param": "prompt"
    }
  }
}
```

## 終了コード

CLI が返す終了コードは `0` / `2` / `3` のみです。

- `0`: 成功
- `2`: 呼び出し・入力・ローカル環境が悪い（コマンドを直してください）
- `3`: 検査・実行した対象の状態が期待と違う（サーバー失敗・成果物不一致。
  再生成または再試行してください）

`INVALID_PARAM` は値の型・範囲が不正な場合（例: `--n abc`）、
`INVALID_USAGE` は必須オプション欠落・未知コマンド・余剰 positional など、
引数構造が不正な場合を表します。

## 典型的なエラーと対処

- `WORKDIR_NOT_FOUND`: `comfy-agent init` を先に実行してください。
- `INVALID_PRESET`: YAML の構造が不正です。`version/name/workflow` を確認してください。
- `MISSING_REQUIRED_PARAM`: 必須パラメータが不足しています。
- `JOB_NOT_FOUND`: 指定したローカル job record がありません。
- `JOB_LOST`: サーバーの history と queue に job がありません。同じ preset を
  再実行してください。
- `SERVER_UNREACHABLE`: サーバーに接続できません。`base_url` を確認するか、
  トンネル切れの場合は `comfy-agent connect <url>` で再接続してください。
- `MISSING_NODE_ON_SERVER`: ワークフローが参照するノードクラスが接続先サーバーに
  ありません（`details.missing_nodes`）。
- `MISSING_MODEL_ON_SERVER`: ワークフローが参照するモデルファイルが接続先サーバーに
  ありません（`details.missing_models`。各項目にサーバー側の `available` 一覧つき）。
  多くの場合、サーバーが別のワークフロー/キット用にセットアップされていることを意味します。
- `API_ERROR`: サーバーには接続できたものの応答エラーです。`base_url` を確認してください。
- `EXECUTION_FAILED`: ComfyUI で workflow の実行に失敗しました。
  `details.category` と `details.kind` を確認し、`oom` なら解像度または steps を下げるか
  上位 GPU を人に提案し、`interrupted` なら1回再試行してください。
- `NO_OUTPUTS`: 実行は完了しましたが保存ファイルがありません。workflow に適切な
  `Save*` node を追加してください。
- `TIMEOUT`: 完了待ちがタイムアウトしました。`--timeout-seconds` を増やしてください。

`run` は送信前にサーバープリフライト検査を行います。デバッグ等で回避したい場合は
`--no-preflight` を指定してください。
