# CLI リファレンス

`comfy-agent` のコマンド、preset、出力、エラーに関する完全版リファレンスです。
AI エージェントの実行方針は [Agent Playbook](./agent-playbook.md) を参照してください。
English: [CLI reference](./cli-reference.md)。
計画中の milestone と明示的な non-goal は [Roadmap](./roadmap.md) を参照してください。

## 作業ディレクトリ

`comfy-agent init` はローカルの `.comfy-agent/` を作成します。成功した
`comfy-agent connect` も同じ構成を作るため、QuickStart では別途 `init` を
実行する必要はありません。

```text
.comfy-agent/
  config.yaml
  workflows/
  presets/
  outputs/
  jobs/
  cache/
```

- `workflows/`: 実行可能な ComfyUI API JSON。
- `presets/`: parameter と upload の対応定義。
- `outputs/`: 生成ファイルと `run.json` manifest。
- `jobs/`: 同期・非同期 run を再開するための job record。
- `cache/`: workflow import 時に使うサーバーメタデータ。

### global scope

`--global` を付けると、現在のプロジェクトの `.comfy-agent/` ではなく
`~/.config/.comfy-agent` を使います。

```bash
comfy-agent init --global
comfy-agent list --global
comfy-agent run text2img_v1 --global --prompt "A cat"
```

preset、出力、接続設定を分離したい場合は、プロジェクトごとに local workdir を
分けてください。

## `base_url` の優先順位

ComfyUI の URL は次の順で解決します。

1. `--base-url`
2. `COMFY_AGENT_BASE_URL`
3. `.comfy-agent/config.yaml` の `base_url`（`comfy-agent connect` が保存。
   指定 scope、もう一方の scope の順に確認）
4. `http://127.0.0.1:8188`

URL は preset に含めません。Colab の一時的なトンネルでは、ランタイム再起動後に
`comfy-agent connect <new-url>` を実行してください。preset、workflow、job、出力は
ローカルに残ります。

## ComfyUI 連携の流れ

- POST `/prompt` へ workflow JSON を送り、生成をキューに入れます。
- WebSocket が使える場合は進捗を受け取り、使えない場合は
  GET `/history/{prompt_id}` の polling に切り替えて完了を待ちます。
- history の `filename`、`subfolder`、`type` を読み、GET `/view` で保存します。
- 画像と mask は POST `/upload/image` または `/upload/mask` へ送ります。音声・汎用
  file も ComfyUI の input upload 経路を使い、`LoadAudio` などへ設定できます。
- `import` は利用可能な場合に GET `/object_info` を参照し、型推論の補強と ComfyUI
  subgraph template の安全な展開を行います。
- `run` は `--no-preflight` が明示されない限り、workflow の node class と model input を
  `/object_info` と照合してから送信します。

## コマンド

全コマンドで `--lang <en|ja>` を利用できます。既定言語は
`COMFY_AGENT_LANG=ja` でも変更できます。`--json` を記載したコマンドは、安定した
機械可読 envelope を返します。

### `init`

workdir を作成します。既存 directory は保持し、directory ではない競合 path は
`--force` で置き換えます。

```bash
comfy-agent init
comfy-agent init --global
comfy-agent init --json
comfy-agent init --force
```

### `connect`

ComfyUI の base URL を疎通確認し、必要なら選択 scope の workdir を初期化して、URL を
`config.yaml` に保存します。

```bash
comfy-agent connect https://xxxx.trycloudflare.com
comfy-agent connect https://xxxx.trycloudflare.com --json
comfy-agent connect http://127.0.0.1:8188 --global
comfy-agent connect https://xxxx.trycloudflare.com --force
```

`--force` が無い場合、接続できないサーバーは `SERVER_UNREACHABLE` となり保存されません。
`--force` は接続状態 `UNVERIFIED` として URL を保存します。

### `import`

ComfyUI API JSON または保存済み UI workflow JSON を取り込み、preset template を
生成します。

```bash
comfy-agent import ./workflow_api.json --name text2img_v1
comfy-agent import ./workflow_api.json --name text2img_v1 --json
comfy-agent import ./workflow_api.json --name text2img_v1 --base-url http://127.0.0.1:8188
comfy-agent import ./workflow_api.json --name text2img_v1 --global
comfy-agent import ./workflow_api.json --name text2img_v1 --force
```

`definitions.subgraphs` を含む UI workflow では、対象 ComfyUI サーバーへの接続が
必要です。importer は live `/object_info` の input 順序を使って、active subgraph node を
API node へ展開します。node schema が取得できない場合や、mute/bypass mode を安全に
表現できない場合は、具体的なエラーで停止します。editor 上だけにある状態は、先に保存・
download してください。

`/object_info` を取得できた場合は推論を補強し、
`.comfy-agent/cache/object_info.json` へ cache します。生成 preset には次が付きます。

- 各 parameter の `description`。
- 判別できた `role`。例: `prompt`、`seed`、`steps`、`guidance`、`width`、`height`、
  `sampler`、`scheduler`、`denoise`、`strength`。
- 既知 role の数値ヒント。
- `--prompt`、`--negative`、`--steps`、`--cfg`、`--width`、`--height` などの安定した
  alias。動画・音声では `--length`、`--fps`、`--seconds`、`--lyrics` が付く場合もあります。

既存 preset へ生成 alias を追加する場合は `--force` で再 import します。parameter target が
同じ手書き alias は保持され、それ以外の手書き preset 編集は上書きされます。生成 alias が
操作する target は1つです。追加の連動 input には canonical な
`--<node_id>_<input>` を使ってください。

### `list`

```bash
comfy-agent list
comfy-agent list --json
comfy-agent list --global
comfy-agent list --source all
comfy-agent list --source remote --base-url http://127.0.0.1:8188
comfy-agent list --source remote-catalog --base-url http://127.0.0.1:8188
```

- `local`: 選択 workdir 内の preset。
- `remote`: 保存済み ComfyUI userdata workflow。
- `remote-catalog`: 明示した場合だけ取得する ComfyUI template catalog 項目。
- `all`: local と保存済み remote workflow。

remote catalog template の一部は API から直接実行できません。ComfyUI で一度保存し、
生成された userdata workflow を `--source remote` で使ってください。

### `run`

preset を解決し、parameter/upload を適用して server preflight を行い、workflow を投入して
完了待ちと出力 download を行います。

```bash
comfy-agent run text2img_v1 --prompt "A cat" --steps 30
comfy-agent run text2img_v1 --prompt "A cat" --json
comfy-agent run text2img_v1 --prompt "A cat" --dry-run
comfy-agent run text2img_v1 --prompt "A cat" --n 3 --seed 42 --seed-step 1
comfy-agent run text2img_v1 --prompt "A cat" --async --json
comfy-agent run text2img_v1 --out ./generated --timeout-seconds 600
comfy-agent run text2img_v1 --source local --poll-interval-ms 1000
comfy-agent run text2img_v1 --global --prompt "A cat"
```

主な option:

| option | 意味 |
|---|---|
| `--source <local|remote|remote-catalog>` | preset/workflow の取得元を選択。 |
| `--n <count>` | 複数回 submit。 |
| `--seed <int|random>` / `--seed-step <int>` | seed target の設定と増分。 |
| `--out <dir>` | 出力 directory を上書き。 |
| `--poll-interval-ms <ms>` | history polling 間隔。 |
| `--timeout-seconds <sec>` | 完了待ち timeout。 |
| `--async` | submit 後すぐ戻り、job record を保存。 |
| `--dry-run` | ComfyUI に接続せず、patch 後の workflow を表示。 |
| `--no-preflight` | debug 用に server node/model 検査を省略。 |

`--seed` は parameter 名 `seed`、alias `seed`、`role: seed` の順で最初に一致した分類を
対象にします。同じ分類に複数 target がある場合は同じ値を適用し、一緒に増分します。
`--12_noise_seed 5` のような明示 flag は、その target について優先されます。

preset parameter は生成 alias または canonical な `--<node_id>_<input>` で指定します。
両方を指定した場合は後の値を使います。upload flag は `uploads.*.cli_flag` で定義します。

```bash
comfy-agent run inpaint_v1 --prompt "fix" --init-image ./in.png --mask ./mask.png
comfy-agent run talking_v1 --image ./portrait.png --audio ./voice.mp3
```

remote source の補足:

- `--source remote` は ComfyUI `userdata/workflows` に保存した workflow を参照します。
- 保存済み UI 形式（`nodes`/`links`）は API prompt 形式へ変換します。
- note などの UI 専用 node は、安全な場合に無視します。
- custom/complex graph を変換できない場合は、ComfyUI API JSON を export して local preset
  として import してください。

#### 非同期 run

`run --async` は prompt を submit し、`.comfy-agent/jobs/<job_id>.json` を保存してすぐに
戻ります。JSON payload には `async: true`、出力 directory、各 job の `job_id`、
`prompt_id`、batch index、seed、status、record path が入ります。後で `jobs wait` を
使って download を完了します。

同期 run も job record を書くため、ローカルコマンドが中断されても再開できます。
ComfyUI history はメモリ上にあり、server process や Colab runtime が再起動すると
`JOB_LOST` になり、再 submit が必要な場合があります。

### `jobs`

local job record の確認、再開、整理を行います。

```bash
comfy-agent jobs list
comfy-agent jobs list --status completed --limit 20 --json
comfy-agent jobs show <job_id> --json
comfy-agent jobs wait <job_id> --poll-interval-ms 1000
comfy-agent jobs wait <job_id> <another_job_id> --base-url <url> --json
comfy-agent jobs prune --older-than-days 30 --dry-run --json
```

`jobs list` と `jobs show` は server に接続しません。`show` と `wait` では完全な ID または
4文字以上の一意な prefix を使えます。prefix が複数に一致すると `JOB_AMBIGUOUS_ID` です。
個別検索ではもう一方の workdir scope も確認します。完了済み job に対する `wait` は安全に
再実行できます。`prune` は指定日数より古い終端 record だけを削除し、生成物は削除しません。

### `doctor`

workdir 設定と server 疎通を確認します。

```bash
comfy-agent doctor
comfy-agent doctor --json
comfy-agent doctor --global
comfy-agent doctor --all-scopes
comfy-agent doctor --preset text2img_v1
comfy-agent doctor --preset text2img_v1 --json
```

`--preset` を付けると `/object_info` を取得し、参照 node class と model file が server に
揃っているか検査します。不足時は exit 3 です。通常の接続失敗は doctor の通常 payload 内に
`connection: { ok: false, error: { code, message, details } }` として表現されます。

### `status`

scope、base URL と取得元、workdir 状態、preset 数など、解決済み runtime 設定を表示します。

```bash
comfy-agent status
comfy-agent status --json
comfy-agent status --global
comfy-agent status --base-url <url>
```

### `preset`

人間と AI エージェントが読みやすい preset 定義を表示します。

```bash
comfy-agent preset text2img_v1
comfy-agent preset text2img_v1 --json
comfy-agent preset text2img_v1 --global
comfy-agent preset text2img_v1 --source local
comfy-agent preset text2img_v1 --source remote --base-url http://127.0.0.1:8188
```

同じ名前が local と remote の両方にある場合は、`--source` で明示してください。

### `verify`

生成物のメタデータをオフラインで検査し、目視・音声確認を補助する file を作ります。
directory では `run.json` があればそれを使い、なければ直下の出力 file を走査します。
API key は不要です。

```bash
comfy-agent verify .comfy-agent/outputs/text2img_v1/<timestamp> --json
comfy-agent verify ./clip.mp4 --expect-kind video --min-duration 4
comfy-agent verify ./images --expect-kind image --expect-count 4 --expect-size 1280x704
comfy-agent verify ./audio.flac --hash --no-ffmpeg
comfy-agent verify ./clip.mp4 --frames 6 --sheet contact.png --out ./inspection
```

built-in probe は主要な画像・動画・音声について、形式、寸法、duration、frame 数、音声情報を
返し、animated WEBP にも対応します。`ffmpeg` が使える場合は `<run-dir>/verify/` に動画
frame、contact sheet、音声 waveform も作れます。`--no-sheet` は既定 sheet を無効化し、
`--no-ffmpeg` は built-in probe だけを実行します。

期待値に合わない場合は `VERIFY_CHECKS_FAILED`（exit 3）となり、完全な report を
`verify/verify.json` に保存します。`summary.verified_visually` は常に `false` です。
内容を確認済みと報告する前に、生成された sheet/frame を開くか画像を `analyze` してください。

### `analyze`

OpenAI の画像入力を使い、生成画像が指示に合うか評価します。

```bash
export OPENAI_API_KEY=...
comfy-agent analyze ./output.png --prompt "A cat on a sofa"
comfy-agent analyze ./output.png --prompt "A cat" --json
comfy-agent analyze ./output.png --prompt "A cat" --out ./analysis.json
comfy-agent analyze ./output.png --prompt "A cat" --detail low --threshold 0.8
```

`--model`、`--detail <low|high|auto>`、`--threshold`、`--temperature`、
`--max-output-tokens`、`--api-key` も指定できます。

### `playbook`

npm package に同梱した方針 document を読みます。

```text
comfy-agent playbook [agent-playbook|minimax-h3-prompting]
  [--section <n|slug>] [--list] [--path] [--json]
```

- selector 無しでは document 全体を表示します。
- `--section` は番号または slug で1つの `##` section を表示します。
- `--list` は document 内の section を一覧表示します。
- `--path` は install 済み package 内の解決 path を表示します。
- 既定 document は `agent-playbook` です。

### `skill`

package 同梱の agent skill を一覧表示または install します。

```text
comfy-agent skill list [--json]
comfy-agent skill install [<name>...]
  --agent <claude|codex|cursor|gemini|openclaw>
  [--global|--project|--dir <path>] [--force] [--dry-run] [--json]
```

既定 install scope は現在の project です。skill 名を省略すると同梱 skill をすべて
install します。install 先には書き換え済み `SKILL.md`、local `references/`、所有 marker
`.comfy-agent-skill.json` が入ります。marker 付き install は同じコマンドで更新できます。
marker の無い既存 directory は `--force` が必要です。`--dry-run` で file 操作を確認できます。

### `colab`

同梱した機械可読 kit catalog の取得、互換 workflow の順位付け、1 kit の install file
path 解決を行います。

```bash
comfy-agent colab catalog --json
comfy-agent colab suggest "fast image generation on a T4" --json
comfy-agent colab suggest "anime video" --task text_to_video --output video --gpu A100 --limit 5
comfy-agent colab kit z_image
comfy-agent colab kit z_image --json
```

`colab suggest` は task、output、音声機能、GPU 要件が合わない候補を除外し、目的適合度と
信頼度で互換 workflow を並べます。`catalog --json` と `suggest --json` は持ち運べる
catalog 相対 path だけを返します。

`colab kit <name>` は kit directory、`01_setup.py`、共通 `02_start_comfyui.py`、workflow
JSON の install path を表示します。JSON envelope は次の形です。

```json
{
  "ok": true,
  "kit": { "name": "z_image" },
  "paths": {
    "dir": "/path/to/package/scripts/colab/z_image",
    "setup": "/path/to/package/scripts/colab/z_image/01_setup.py",
    "launcher": "/path/to/package/scripts/colab/02_start_comfyui.py",
    "workflows": {
      "z_image_turbo.json": "/path/to/package/scripts/colab/z_image/z_image_turbo.json"
    }
  }
}
```

`kit` object には選択した catalog entry 全体が入ります。path がローカルなのは仕様です。

## 使い方のポイント

- dynamic parameter は `--param value` で、preset parameter または alias と一致させます。
- upload flag は `uploads.*.cli_flag` で定義します。
- `--dry-run` は API を呼ばずに patch 後の workflow JSON を表示します。
- 既定出力先は `.comfy-agent/outputs/<preset>/<YYYYmmdd_HHMMSS>/` です。
- 完了 run は `run.json` に metadata を投影し、`verify` は `verify/` subdirectory に
  確認用 file と `verify.json` を保存します。
- `run` は解決した出力 directory と各保存 file path を log に出します。
- WebSocket progress が使えない、または切れた場合は polling へ移行します。
- 反復は `--n`、seed は `--seed random` または
  `--seed <int> --seed-step <int>` を使います。
- 複数 server では project workdir を分けるか、切替前に再 `connect` してください。
- 動画も画像・音声と同じく `/history` metadata から保存します。
- `analyze` には `OPENAI_API_KEY` が必要ですが、`verify` には不要です。

## 生成 → 解析 → 調整

1. 生成:

   ```bash
   comfy-agent run text2img_v1 --prompt "A cat on a sofa" --steps 30
   ```

2. 保存画像を解析:

   ```bash
   export OPENAI_API_KEY=...
   comfy-agent analyze .comfy-agent/outputs/text2img_v1/20260203_120000/00001_123_1.png \
     --prompt "A cat on a sofa" --json
   ```

3. prompt または parameter を調整して再生成:

   ```bash
   comfy-agent run text2img_v1 --prompt "A fluffy orange cat on a sofa" --steps 35
   ```

動画・音声では先に `verify` で metadata と確認用成果物を作り、実物を確認してから次の
run を調整してください。

## analyze の制限

- 対応画像形式: PNG、JPEG、WEBP、非 animated GIF。
- この API 経路では 8 MiB より大きい画像を拒否します。
- `--detail low` は安価ですが精度が下がる場合があります。
- 動画の直接解析には未対応です。先に `verify` で frame を抽出してください。

## preset 定義

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

### metadata 項目

以下はすべて任意です。metadata の無い既存 preset も有効です。`aliases` を除き、metadata は
意図を説明するだけで workflow 実行を変えません。

preset 直下の項目:

| 項目 | 型 | 意味 |
|---|---|---|
| `description` | string | preset の説明。 |
| `task` | enum | `text_to_image`、`image_to_image`、`image_edit`、`remove_background`、`inpaint`、`upscale`、`text_to_audio`、`audio_to_audio`、`audio_inpaint`、`text_to_video`、`image_to_video`、`video_to_video`、`custom`。 |
| `tags` | string[] | 検索・分類用の自由 label。 |

`type`、`target`、`required`、`default` に加えられる parameter 項目:

| 項目 | 型 | 意味 |
|---|---|---|
| `description` | string | 人間/agent 向けの説明。 |
| `role` | enum | `prompt`、`negative_prompt`、`seed`、`steps`、`guidance`、`width`、`height`、`sampler`、`scheduler`、`model`、`strength`、`denoise`、`advanced`、`custom`。 |
| `aliases` | string[] | `run` が受け付ける別名 CLI flag。 |
| `min` / `max` | number | 参考用の数値範囲。 |
| `choices` | array | 参考用の許容値一覧。 |
| `recommended` | any | 参考用の推奨値。 |

upload 項目:

| 項目 | 型 | 意味 |
|---|---|---|
| `kind` | enum | `image`、`mask`、`audio`、`file`。 |
| `cli_flag` | string | `--image`、`--audio` など `run` が受け付ける flag。 |
| `target` | object | upload 後の file 名を受け取る workflow node input。 |
| `description` | string | 人間/agent 向けの説明。 |
| `role` | enum | `init_image`、`mask`、`reference_image`、`control_image`、`input_image`、`input_audio`、`reference_audio`、`input_file`、`custom`。 |
| `aliases` | string[] | `run` が受け付ける別名 CLI flag。 |
| `required` | boolean | 必須 upload かどうか。 |

`import` は description、判別できた role、数値ヒント、一般的な alias を設定します。
input 名より先に graph 構造を考慮します。`seed` alias は生成せず、専用 `--seed` 解決が
seed role を使います。`list --json` と `preset --json` は全 metadata を含みます。

## JSON 出力

`--json` は stdout に JSON だけを出します。対応する全コマンドは成功・失敗とも
`{ "ok": ... }` envelope を使います。唯一の例外は `run --dry-run --json` で、ComfyUI へ
そのまま送れる patch 後の workflow 生 JSON を返します。

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
      "progress_events": []
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
    "details": { "param": "prompt" }
  }
}
```

人向け stdout を parse せず、`ok`、`error.code`、document 済み `details` で分岐してください。

## 終了コード

CLI が返す終了コードは `0`、`2`、`3` のみです。

- `0`: 成功。
- `2`: 呼び出し、入力、local environment が不正。コマンドまたは local file を修正。
- `3`: server failure や成果物不一致など、検査・実行した対象の状態が期待と異なる。
  再生成または再試行。

`INVALID_PARAM` は値の型・範囲が不正な場合です。`INVALID_USAGE` は必須 option 欠落、
未知 command、余剰 positional など、引数構造が不正な場合です。

## 典型的なエラー

| code | exit | 意味と対処 |
|---|---:|---|
| `INVALID_USAGE` | 2 | command 構造が不正。必須/未知引数や余剰 positional を修正。Commander failure は `details.commander_code` を含みます。 |
| `INVALID_PARAM` | 2 | option 値または範囲が不正。 |
| `UNSUPPORTED_RUNTIME` | 2 | 必須 Node.js runtime global がありません。Node.js 22 以上を使用。details は `node`、`required`、`missing`。 |
| `WORKDIR_NOT_FOUND` | 2 | workdir 必須 command で workdir がありません。`init` または成功する `connect` を実行。 |
| `WORKDIR_NOT_WRITABLE` | 2 | jobs directory を作成・書込できません。`details.path` と `details.cause` を確認。 |
| `WORKDIR_CONFLICT` | 2 | workdir path が directory ではありません。確認後、必要なら `init --force`。 |
| `FILE_NOT_FOUND` | 2 | input workflow、upload、analyze/verify 対象がありません。 |
| `FILE_EXISTS` | 2 | import 先または marker の無い skill directory が存在。対象確認後に限り `--force`。 |
| `INVALID_PRESET` | 2 | preset YAML が必要構造に一致しません。 |
| `PRESET_NOT_FOUND` | 2 | 選択 source に指定 preset がありません。 |
| `PRESET_SOURCE_AMBIGUOUS` | 2 | 同名 preset が local/remote 両方にあります。`--source` を指定。 |
| `MISSING_REQUIRED_PARAM` | 2 | 必須 preset parameter が不足。`details.param` を確認。 |
| `MISSING_REQUIRED_UPLOAD` | 2 | 必須 upload flag が不足。 |
| `UNKNOWN_PARAM` | 2 | dynamic `run` flag が preset に未定義。 |
| `SERVER_UNREACHABLE` | 3 | server に接続不能。`base_url`、server 起動、期限切れ tunnel の再接続を確認。 |
| `API_ERROR` | 3 | server 到達後に request が失敗。path/status details を確認。 |
| `MISSING_NODE_ON_SERVER` | 3 | workflow node class が不足。`details.missing_nodes` を確認。 |
| `MISSING_MODEL_ON_SERVER` | 3 | model file が不足。`details.missing_models[].value` を `colab catalog --json` の asset と照合。 |
| `EXECUTION_FAILED` | 3 | ComfyUI の実行失敗・中断。`category`、`kind`、node/exception、partial output、output directory を確認。`oom` は解像度/steps を下げ、中断は1回再試行。 |
| `NO_OUTPUTS` | 2 | 実行完了後に保存 file がありません。適切な `Save*` node を追加。 |
| `TIMEOUT` | 3 | `--timeout-seconds` を超過。適切に増やして1回再試行。 |
| `JOB_NOT_FOUND` | 2 | 指定 job ID/prefix に一致する local record がありません。 |
| `JOB_AMBIGUOUS_ID` | 2 | job prefix が複数 record に一致。長い ID または完全 ID を使用。 |
| `INVALID_JOB_RECORD` | 2 | local job JSON record が不正または安全でありません。 |
| `JOB_LOST` | 3 | server history/queue の両方に job がありません。runtime 再起動後など。保存引数で preset を再実行。 |
| `VERIFY_CHECKS_FAILED` | 3 | 明示した成果物期待値の一部が不一致。`details.failed` と `details.report` を確認。 |
| `MISSING_TOOL` | 2 | 明示要求した verify 成果物に ffmpeg が必要。install するか frames/sheet 指定を外す。 |
| `UNSUPPORTED_FORMAT` | 2 | 単一 verify 対象を built-in probe/ffprobe で解釈できません。 |
| `RESOURCE_NOT_FOUND` | 2 | 同梱 package resource が不足。details は `resource` と `path`。package を再 install。 |
| `PLAYBOOK_NOT_FOUND` | 2 | 未知 playbook。`details.available` に候補。 |
| `PLAYBOOK_SECTION_NOT_FOUND` | 2 | 未知 playbook section。`details.available` に section。 |
| `SKILL_AGENT_UNSUPPORTED` | 2 | 未知 install target。`details.supported` に agent 名。 |
| `SKILL_NOT_FOUND` | 2 | 未知同梱 skill。`details.available` に skill。 |
| `SKILL_SCOPE_CONFLICT` | 2 | `--global`、`--project`、`--dir` を複数選択。 |
| `SKILL_INSTALL_FAILED` | 2 | local skill install 失敗。`details.path` と `details.cause` を確認。 |
| `COLAB_KIT_NOT_FOUND` | 2 | 未知 kit 名。`details.available` に catalog entry。 |
| `COLAB_CATALOG_UNAVAILABLE` | 2 | 同梱 catalog が見つかりません。package を再 install。 |
| `COLAB_CATALOG_READ_FAILED` | 2 | 同梱 catalog を読めません。 |
| `INVALID_COLAB_CATALOG` | 2 | 同梱 catalog が schema validation に失敗。 |
| `MISSING_API_KEY` | 2 | `analyze` に `OPENAI_API_KEY` または `--api-key` が必要。 |
| `UNSUPPORTED_IMAGE` | 2 | `analyze` に未対応画像形式を指定。 |
| `OPENAI_API_ERROR` | 3 | OpenAI request が失敗。 |

`run` は submit 前に server preflight を行います。`--no-preflight` は node/model 不足の
検出を ComfyUI 側まで遅らせるため、限定的な debug にだけ使ってください。
