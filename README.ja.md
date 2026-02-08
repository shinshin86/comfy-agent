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

## 前提

- Node.js 20+
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
- `import` 実行時に GET `/object_info` を参照できる場合は型推定を補強

## base_url の優先順位

1. `--base-url`
2. 環境変数 `COMFY_AGENT_BASE_URL`
3. 既定値 `http://127.0.0.1:8188`

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
```

補足: こちらを行う場合は ComfyUI 側で workflow API JSON をエクスポートしてください。現在開いている編集状態からの直接取り込みには未対応です。

`/object_info` が取得できる場合は型推定を補強します（`.comfy-agent/cache/object_info.json` にキャッシュ）。失敗してもフォールバックします。

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

uploads がある場合の例:

```bash
comfy-agent run inpaint_v1 --prompt "fix" --init-image ./in.png --mask ./mask.png
```

remote ソースについて:

- `--source remote` は `userdata/workflows` に保存された workflow（実行向け）を参照します。
- `--source remote-catalog` はテンプレートカタログ参照（明示的な上級用途）です。
- `list --source remote` で検出させるには、ComfyUI の `userdata/workflows` 配下に workflow を保存してください。
- 保存形式が ComfyUI UI 形式（`nodes`/`links`）でも、実行時に API prompt 形式へ自動変換します。
- メモ系など UI 専用ノードは変換時に無視されます。
- カタログ側は API から workflow JSON を直接取得できない項目が存在します。
- 複雑な custom node 構成で検証エラーになる場合は、ComfyUI から API JSON をエクスポートして local preset として取り込んでください。

### doctor

```bash
comfy-agent doctor
comfy-agent doctor --json
comfy-agent doctor --global
comfy-agent doctor --all-scopes
```

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
```

## JSON 出力

`--json` を付けると stdout に JSON のみを出力します。

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

- 0: 成功
- 2: ユーザー入力エラー（不足/型不一致）
- 3: API通信/サーバーエラー

## 典型的なエラーと対処

- `WORKDIR_NOT_FOUND`: `comfy-agent init` を先に実行してください。
- `INVALID_PRESET`: YAML の構造が不正です。`version/name/workflow` を確認してください。
- `MISSING_REQUIRED_PARAM`: 必須パラメータが不足しています。
- `API_ERROR`: サーバー接続や応答エラーです。`base_url` を確認してください。
- `TIMEOUT`: 完了待ちがタイムアウトしました。`--timeout-seconds` を増やしてください。
