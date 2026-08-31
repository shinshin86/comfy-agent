# Colab cell: set up experimental FastH3 T2VA support in ComfyUI.
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False

COMFYUI_REPOSITORY = "https://github.com/Comfy-Org/ComfyUI.git"
COMFYUI_PATCH_REPOSITORY = "https://github.com/kijai/ComfyUI.git"
COMFYUI_REVISION = "10febb01d7be73d1491cf5e5347b5ab8b6c2c09e"
COMFY_KITCHEN_REPOSITORY = "https://github.com/Comfy-Org/comfy-kitchen.git"
COMFY_KITCHEN_REVISION = "dae00a13d458876570804523ae045a487fd92961"
FASTH3_MODEL_REVISION = "641f2a0a2df14cf24665277d8417930b57cc7710"
H3_ASSET_REVISION = "4cc1d817b6184899b41293954329f576cb5ae86b"
SOL_NODE_URL = "https://github.com/user-attachments/files/31576773/sol_attn_minimax_v5.py"
SOL_NODE_SIZE = 27979
SOL_NODE_SHA256 = "97c9d56fdc7c9a102e59bff9ac8d79503299514d061892088a03d99dcf415b0c"
CLOUDFLARED_VERSION = "2026.7.2"
CLOUDFLARED_SHA256 = "88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a"

import hashlib
import os
from pathlib import Path
import subprocess
import sys


def run(*args, check=True, cwd=None, env=None):
    return subprocess.run(list(args), check=check, cwd=cwd, env=env)


def sha256_file(file_path):
    digest = hashlib.sha256()
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_download(url, destination, expected_size, expected_sha256):
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    if os.path.isfile(destination):
        current_size = os.path.getsize(destination)
        if current_size == expected_size:
            actual = sha256_file(destination)
            if actual == expected_sha256:
                print(f"Using verified file: {destination}")
                return
            print(f"Removing checksum-mismatched file: {destination}")
            os.remove(destination)
        elif current_size > expected_size:
            print(f"Removing oversized file: {destination}")
            os.remove(destination)
        else:
            print(f"Resuming partial download: {destination}")

    run("wget", "-c", "-O", destination, url)
    actual_size = os.path.getsize(destination)
    if actual_size != expected_size:
        raise RuntimeError(
            f"Size mismatch for {destination}: expected {expected_size}, got {actual_size}"
        )
    actual_sha256 = sha256_file(destination)
    if actual_sha256 != expected_sha256:
        raise RuntimeError(
            f"SHA-256 mismatch for {destination}: expected {expected_sha256}, got {actual_sha256}"
        )


def replace_once(source, old, new, label):
    matches = source.count(old)
    if matches != 1:
        raise RuntimeError(f"Sol node patch {label} expected one match, found {matches}")
    return source.replace(old, new, 1)


def make_sol_node_fail_closed(node_path):
    source = Path(node_path).read_text(encoding="utf-8")
    source = replace_once(
        source,
        '''            if (rope_freqs is None or x.dtype != torch.bfloat16 or x.dim() != 2
                    or x.device.type != "cuda"):
                return fallback()
''',
        '''            if (rope_freqs is None or x.dtype != torch.bfloat16 or x.dim() != 2
                    or x.device.type != "cuda"):
                if opts.get("vsa"):
                    raise RuntimeError(
                        "FastH3 VSA requires CUDA bf16 H3 self-attention with RoPE"
                    )
                return fallback()
''',
        "producer eligibility",
    )
    source = replace_once(
        source,
        '''            if _gate(transformer_options, s, opts["min_tokens"],
                     opts["sigma_start"], opts["sigma_end"]) is not None:
                return fallback()   # the override counts and logs it
''',
        '''            if _gate(transformer_options, s, opts["min_tokens"],
                     opts["sigma_start"], opts["sigma_end"]) is not None:
                if opts.get("vsa"):
                    raise RuntimeError(
                        "FastH3 VSA was configured outside its full sampling window"
                    )
                return fallback()   # the override counts and logs it
''',
        "sampling window",
    )
    source = replace_once(
        source,
        '''                if layout is None or layout.seq_len != s:
                    _h3_log_once("no layout for this call; VSA tiling inactive")
                    return fallback()
''',
        '''                if layout is None or layout.seq_len != s:
                    raise RuntimeError(
                        "FastH3 VSA requires the packed H3 layout for every producer call"
                    )
''',
        "layout requirement",
    )
    source = replace_once(
        source,
        '''        except Exception as exc:
            _stats["errors"] += 1
            _log_kernel_failure(exc)
            return fallback()
''',
        '''        except Exception as exc:
            _stats["errors"] += 1
            _log_kernel_failure(exc)
            if opts.get("vsa"):
                raise RuntimeError(
                    "FastH3 VSA kernel failed; refusing dense fallback"
                ) from exc
            return fallback()
''',
        "kernel failure",
    )
    source = replace_once(
        source,
        '''    if vsa and not is_h3:
        logging.warning("[sol_attn] VSA tiling needs MiniMax-H3; running plain top-k")
    elif vsa and blocks and not hasattr(blocks[0].attn, "to_gate_compress"):
        logging.warning("[sol_attn] VSA: checkpoint has no to_gate_compress weights; "
                        "running the fine stage only (no coarse branch)")
''',
        '''    if vsa and (not is_h3 or blocks is None or len(blocks) == 0):
        raise RuntimeError("FastH3 VSA requires a native MiniMax-H3 diffusion model")
    if vsa and not hasattr(blocks[0].attn, "to_gate_compress"):
        raise RuntimeError(
            "FastH3 checkpoint gate weights were not loaded; refusing dense fallback"
        )
''',
        "gate requirement",
    )
    source = replace_once(
        source,
        '''        if installed:
            _PRODUCER_STATS.clear()
            logging.info(f"[sol_attn] chunked qkv producer on {installed} blocks")
''',
        '''        if vsa and installed != len(blocks):
            raise RuntimeError(
                f"FastH3 VSA patched {installed}/{len(blocks)} transformer blocks"
            )
        if installed:
            _PRODUCER_STATS.clear()
            logging.info(f"[sol_attn] chunked qkv producer on {installed} blocks")
''',
        "block coverage",
    )
    Path(node_path).write_text(
        "# comfy-agent FastH3 fail-closed runtime patch\n" + source,
        encoding="utf-8",
    )


if USE_GOOGLE_DRIVE:
    from google.colab import drive

    drive.mount("/content/drive")
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
else:
    current_dir = os.getcwd()
    WORKSPACE = current_dir if os.path.isfile(os.path.join(current_dir, "main.py")) else f"{current_dir}/ComfyUI"

if not os.path.isdir(WORKSPACE):
    run("git", "clone", "--filter=blob:none", COMFYUI_REPOSITORY, WORKSPACE)

os.chdir(WORKSPACE)
run("git", "fetch", "--depth", "1", COMFYUI_PATCH_REPOSITORY, COMFYUI_REVISION)
run("git", "checkout", "--detach", COMFYUI_REVISION)
actual_comfyui_revision = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], cwd=WORKSPACE, text=True
).strip()
if actual_comfyui_revision != COMFYUI_REVISION:
    raise RuntimeError(
        f"ComfyUI revision mismatch: expected {COMFYUI_REVISION}, got {actual_comfyui_revision}"
    )

required_source_markers = {
    "comfy/ldm/minimax/model.py": "gate_compress=False",
    "comfy/model_detection.py": "blocks.0.attn.to_gate_compress.weight",
}
for relative_path, marker in required_source_markers.items():
    source = Path(WORKSPACE, relative_path).read_text(encoding="utf-8")
    if marker not in source:
        raise RuntimeError(f"Pinned ComfyUI source lacks FastH3 marker {marker}: {relative_path}")

run(sys.executable, "-m", "pip", "install", "-q", "-r", f"{WORKSPACE}/requirements.txt")
run(
    sys.executable,
    "-m",
    "pip",
    "install",
    "-q",
    "cmake>=3.26",
    "ninja",
    "nanobind<3",
    "setuptools",
    "wheel",
)

gpu_capability = subprocess.check_output(
    [
        sys.executable,
        "-c",
        "import torch; print('.'.join(map(str, torch.cuda.get_device_capability())))",
    ],
    text=True,
).strip()
gpu_major, gpu_minor = (int(part) for part in gpu_capability.split(".", 1))
if (gpu_major, gpu_minor) < (8, 0):
    raise RuntimeError(
        f"FastH3 VSA requires NVIDIA compute capability 8.0+, got {gpu_capability}"
    )

KITCHEN_DIR = "/content/comfy-kitchen-fasth3"
if not os.path.isdir(os.path.join(KITCHEN_DIR, ".git")):
    run("git", "clone", "--filter=blob:none", "--no-checkout", COMFY_KITCHEN_REPOSITORY, KITCHEN_DIR)
run("git", "fetch", "--depth", "1", "origin", COMFY_KITCHEN_REVISION, cwd=KITCHEN_DIR)
run("git", "checkout", "--detach", COMFY_KITCHEN_REVISION, cwd=KITCHEN_DIR)
run("git", "submodule", "update", "--init", "--recursive", "--depth", "1", cwd=KITCHEN_DIR)
actual_kitchen_revision = subprocess.check_output(
    ["git", "rev-parse", "HEAD"], cwd=KITCHEN_DIR, text=True
).strip()
if actual_kitchen_revision != COMFY_KITCHEN_REVISION:
    raise RuntimeError(
        f"comfy-kitchen revision mismatch: expected {COMFY_KITCHEN_REVISION}, got {actual_kitchen_revision}"
    )

build_env = os.environ.copy()
build_env["COMFY_CUDA_ARCHS"] = f"{gpu_major}{gpu_minor}"
build_env["COMFY_KITCHEN_BUILD_NO_HIP"] = "1"
run(
    sys.executable,
    "-m",
    "pip",
    "install",
    "--force-reinstall",
    "--no-deps",
    "--no-build-isolation",
    ".",
    cwd=KITCHEN_DIR,
    env=build_env,
)

kernel_test = r'''
import torch
import comfy_kitchen as ck
from comfy_kitchen.backends import cuda as ck_cuda

assert callable(ck.sol_attn), "comfy_kitchen.sol_attn is unavailable"
assert callable(ck_cuda.sol_attn), "native comfy-kitchen CUDA Sol-Attn is unavailable"
q, k, v = [
    torch.randn((1, 256, 1, 128), device="cuda", dtype=torch.bfloat16)
    for _ in range(3)
]
out = ck_cuda.sol_attn(q, k, v, tau=1.3)
torch.cuda.synchronize()
assert out.shape == q.shape
assert out.dtype == torch.bfloat16
assert torch.isfinite(out).all()
print("FastH3 VSA native kernel self-test: OK")
'''
run(sys.executable, "-c", kernel_test)

MODEL_FILES = [
    (
        f"https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/{FASTH3_MODEL_REVISION}/minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors",
        "diffusion_models/minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors",
        22898594920,
        "7221ae65d78780354d51e5048d29728d9f1f8fb9baf50b1dd3df85f5101413d3",
    ),
    (
        f"https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/{H3_ASSET_REVISION}/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        15687142551,
        "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6",
    ),
    (
        f"https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/{H3_ASSET_REVISION}/vae/minimax_h3_video_vae_fp16.safetensors",
        "vae/minimax_h3_video_vae_fp16.safetensors",
        5207808496,
        "7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522",
    ),
    (
        f"https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/{H3_ASSET_REVISION}/vae/minimax_h3_audio_vae_fp32.safetensors",
        "vae/minimax_h3_audio_vae_fp32.safetensors",
        605254808,
        "8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48",
    ),
]

for url, relative_path, expected_size, expected_sha256 in MODEL_FILES:
    ensure_download(
        url,
        f"{WORKSPACE}/models/{relative_path}",
        expected_size,
        expected_sha256,
    )

fasth3_model_path = (
    f"{WORKSPACE}/models/diffusion_models/"
    "minimax_h3_fastvideo_vsa_datafree_1300step_4step_int8_convrot.safetensors"
)
from safetensors import safe_open

with safe_open(fasth3_model_path, framework="pt", device="cpu") as checkpoint:
    gate_keys = [
        key for key in checkpoint.keys() if key.endswith("attn.to_gate_compress.weight")
    ]
if len(gate_keys) != 50:
    raise RuntimeError(
        f"FastH3 checkpoint must contain 50 gate-compress weights, found {len(gate_keys)}"
    )
print("FastH3 checkpoint gate-compress self-test: OK (50/50 blocks)")

sol_node_path = f"{WORKSPACE}/custom_nodes/sol_attn_minimax_v5.py"
ensure_download(SOL_NODE_URL, sol_node_path, SOL_NODE_SIZE, SOL_NODE_SHA256)
make_sol_node_fail_closed(sol_node_path)

cloudflared_deb = "/root/cloudflared-linux-amd64.deb"
ensure_download(
    f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-amd64.deb",
    cloudflared_deb,
    18887572,
    CLOUDFLARED_SHA256,
)
run("dpkg", "-i", cloudflared_deb)

download_size_gb = sum(item[2] for item in MODEL_FILES) / 1_000_000_000
print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"ComfyUI FastH3 revision = {COMFYUI_REVISION}")
print(f"comfy-kitchen VSA revision = {COMFY_KITCHEN_REVISION}")
print(f"FastH3 model revision = {FASTH3_MODEL_REVISION}")
print(f"Shared H3 asset revision = {H3_ASSET_REVISION}")
print(f"CUDA compute capability = {gpu_capability}")
print(f"Model download size = {download_size_gb:.2f} GB (decimal)")
print(f"SolAttnMiniMax source SHA-256 = {SOL_NODE_SHA256} (fail-closed runtime patch applied)")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
