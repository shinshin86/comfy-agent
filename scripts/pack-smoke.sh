#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
smoke_root="$(mktemp -d)"
trap 'rm -rf "$smoke_root"' EXIT

pack_dir="$smoke_root/pack"
prefix_dir="$smoke_root/prefix"
work_dir="$smoke_root/work"
home_dir="$smoke_root/home"
mkdir -p "$pack_dir" "$prefix_dir" "$work_dir" "$home_dir"

cd "$repo_root"
npm run build
pack_json="$(npm pack --json --pack-destination "$pack_dir")"
tarball_name="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value[0].filename)' "$pack_json")"
tarball="$pack_dir/$tarball_name"
npm install --global --offline --ignore-scripts --prefix "$prefix_dir" \
  "$tarball" \
  "$repo_root/node_modules/commander" \
  "$repo_root/node_modules/yaml" \
  "$repo_root/node_modules/zod"

export PATH="$prefix_dir/bin:$PATH"
cd "$work_dir"

comfy-agent colab suggest "fast image on T4" --json > suggest.json
node -e 'const value=require(process.argv[1]); if(value.ok!==true) process.exit(1)' "$work_dir/suggest.json"
comfy-agent colab kit z_image --json > kit.json
node -e 'const value=require(process.argv[1]); if(value.ok!==true) process.exit(1)' "$work_dir/kit.json"
comfy-agent playbook --list > playbook.txt
HOME="$home_dir" comfy-agent skill install --agent claude --global --json > claude-skill.json
node -e 'const value=require(process.argv[1]); if(value.ok!==true) process.exit(1)' "$work_dir/claude-skill.json"
comfy-agent skill install --agent codex --json > codex-skill.json
node -e 'const value=require(process.argv[1]); if(value.ok!==true) process.exit(1)' "$work_dir/codex-skill.json"

test -f "$home_dir/.claude/skills/comfy-agent/SKILL.md"
test -f "$work_dir/.agents/skills/comfy-agent/SKILL.md"

node -e '
const value=JSON.parse(process.argv[1])[0];
process.stdout.write(JSON.stringify({
  ok: true,
  filename: value.filename,
  files: value.totalFiles ?? value.entryCount ?? value.files?.length,
  packed_bytes: value.size,
  unpacked_bytes: value.unpackedSize
}, null, 2) + "\n");
' "$pack_json"
