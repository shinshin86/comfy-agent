# Starter Colab cell: isolated MiniMax H3 768p Turbo T2V/I2V + SageAttention.
# Paste this file into one Colab cell and run once per session.


COMFYUI_REVISION = "e01fb4c56b7a88149d469b99cbbfe3223d715054"
MODEL_REVISION = "4cc1d817b6184899b41293954329f576cb5ae86b"
CLOUDFLARED_VERSION = "2026.7.2"
CLOUDFLARED_SHA256 = "88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a"

import hashlib
import os
import subprocess
import sys
import socket
import time
import site
from pathlib import Path


SETUP_LOG = Path("/content/h3_turbo_setup.log")


def run(*args, check=True, env=None):
    # Notebook bridges can omit inherited subprocess output. Keep a durable
    # runtime log and print Python-level heartbeats instead of appearing hung.
    command = " ".join(map(str, args))
    started = time.monotonic()
    print(f"Starting: {command}", flush=True)
    with SETUP_LOG.open("a") as log:
        log.write(f"\nStarting: {command}\n")
        log.flush()
        process = subprocess.Popen(list(args), stdout=log, stderr=subprocess.STDOUT, env=env)
        while True:
            try:
                returncode = process.wait(timeout=30)
                break
            except subprocess.TimeoutExpired:
                print(f"Still running ({time.monotonic() - started:.0f}s): {args[0]}; log: {SETUP_LOG}", flush=True)
    if returncode and check:
        with SETUP_LOG.open("rb") as log:
            log.seek(max(0, SETUP_LOG.stat().st_size - 8000))
            print(log.read().decode("utf-8", errors="replace"), flush=True)
        raise subprocess.CalledProcessError(returncode, list(args))
    print(f"Finished ({time.monotonic() - started:.1f}s): {args[0]}", flush=True)
    return subprocess.CompletedProcess(list(args), returncode)


def sha256_file(file_path):
    digest = hashlib.sha256()
    next_report = time.monotonic() + 30
    checked = 0
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
            checked += len(chunk)
            if time.monotonic() >= next_report:
                print(f"Verifying {Path(file_path).name}: {checked / 1e9:.1f} GB read", flush=True)
                next_report = time.monotonic() + 30
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


# Never follow cwd into another kit or modify a running ComfyUI.
WORKSPACE = "/content/comfy-agent-h3-turbo/ComfyUI"
with socket.socket() as sock:
    if sock.connect_ex(("127.0.0.1", 8188)) == 0:
        raise RuntimeError("ComfyUI is running. Use a fresh runtime for the Turbo kit.")
if Path(WORKSPACE).is_symlink():
    raise RuntimeError("Refusing a symlinked Turbo workspace")
if os.path.exists(WORKSPACE):
    origin = subprocess.check_output(["git", "-C", WORKSPACE, "remote", "get-url", "origin"], text=True).strip()
    head = subprocess.check_output(["git", "-C", WORKSPACE, "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", WORKSPACE, "status", "--porcelain", "--untracked-files=no"], text=True).strip()
    if origin != "https://github.com/Comfy-Org/ComfyUI.git" or head != COMFYUI_REVISION or dirty:
        raise RuntimeError("Refusing to replace a different or modified Turbo checkout")
os.makedirs(os.path.dirname(WORKSPACE), exist_ok=True)

if not os.path.isdir(WORKSPACE):
    run("git", "clone", "--filter=blob:none", "https://github.com/Comfy-Org/ComfyUI.git", WORKSPACE)

os.chdir(WORKSPACE)
run("git", "fetch", "--depth", "1", "origin", COMFYUI_REVISION)
run("git", "checkout", "--detach", COMFYUI_REVISION)

# ComfyUI's pinned kitchen backend disables optimized NVIDIA kernels on cu128.
# Install matching official wheels and a matching compiler before building Sage.
run(sys.executable, "-m", "pip", "install", "torch==2.11.0+cu130",
    "torchvision==0.26.0+cu130", "torchaudio==2.11.0+cu130",
    "--index-url", "https://download.pytorch.org/whl/cu130")
run(sys.executable, "-m", "pip", "install", "-q", "-r", f"{WORKSPACE}/requirements.txt")
run("apt-get", "update", "-qq")
run("apt-get", "install", "-y", "--no-install-recommends",
    "cuda-nvcc-13-0", "cuda-cudart-dev-13-0")
os.environ["CUDA_HOME"] = "/usr/local/cuda-13.0"
os.environ["PATH"] = os.environ["CUDA_HOME"] + "/bin:" + os.environ["PATH"]

# Validate/build the attention path before downloading tens of GB of weights.
# Use CUDA 13.0 for both PyTorch and Sage's compiler.
SAGE_REVISION = "eb615cf6cf4d221338033340ee2de1c37fbdba4a"  # v2.2.0
LORA_REVISION = "2f015e66b37c585cea9dc4ae6f1850ea8788e742"
LORA_FILE = "minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors"
probe = subprocess.check_output([sys.executable, "-c", """
import json, torch
assert torch.cuda.is_available(), 'Select a GPU runtime'
assert torch.cuda.is_bf16_supported(), 'BF16-capable GPU required'
assert torch.version.cuda == '13.0', 'Pinned CUDA 13.0 PyTorch required'
p = torch.cuda.get_device_properties(0)
assert p.total_memory >= 39 * 1024**3, 'Use A100 40GB or G4 96GB; T4/L4 are unsupported'
print(json.dumps({'gpu': p.name, 'vram_gib': p.total_memory / 1024**3,
                  'capability': torch.cuda.get_device_capability(), 'torch': torch.__version__,
                  'cuda': torch.version.cuda}))
"""], text=True)
print(probe)
run("nvcc", "--version")
run(sys.executable, "-m", "pip", "install", "ninja", "packaging", "wheel", "setuptools")
# Reuse only a build tested against this exact GPU/torch/CUDA configuration.
build_env = os.environ.copy()
build_env["MAX_JOBS"] = "4"
build_env["EXT_PARALLEL"] = "2"
# cu130 wheels place cuBLAS/cuSPARSE/cuSOLVER headers outside CUDA_HOME.
# Use those matching installed headers rather than mixing in CUDA 12.8 ones.
cuda_headers = next((Path(p) / "nvidia/cu13/include" for p in site.getsitepackages()
                     if (Path(p) / "nvidia/cu13/include/cusparse.h").is_file()), None)
if cuda_headers is None:
    raise RuntimeError("Missing CUDA 13 wheel development headers (cusparse.h)")
build_env["CXX_APPEND_FLAGS"] = f"-I{cuda_headers}"
build_env["NVCC_APPEND_FLAGS"] = f"-I{cuda_headers}"
sage_stamp = Path("/content/comfy-agent-h3-turbo/sage-build.txt")
sage_build_key = SAGE_REVISION + "\n" + probe.strip()
if not sage_stamp.exists() or sage_stamp.read_text() != sage_build_key:
    run(sys.executable, "-m", "pip", "install", "-v", "--no-build-isolation", "--no-cache-dir", "--force-reinstall", "--no-deps",
        f"git+https://github.com/thu-ml/SageAttention.git@{SAGE_REVISION}", env=build_env)
else:
    print("Reusing Sage build for this GPU/torch/CUDA; checking kernel again", flush=True)
run(sys.executable, "-c", """
import torch
from sageattention import sageattn
q, k, v = [torch.randn(1, 56, 256, 128, device='cuda', dtype=torch.bfloat16) for _ in range(3)]
y = sageattn(q, k, v, tensor_layout='HND', is_causal=False)
torch.cuda.synchronize()
assert y.shape == q.shape and torch.isfinite(y).all(), 'Sage kernel self-test failed'
print('Native BF16 SageAttention self-test passed (not H3 E2E verification)')
""")
sage_stamp.write_text(sage_build_key)

MODEL_FILES = [
    (
        "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        15687142551,
        "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6",
    ),
    (
        "vae/minimax_h3_video_vae_fp16.safetensors",
        5207808496,
        "7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522",
    ),
    (
        "vae/minimax_h3_audio_vae_fp32.safetensors",
        605254808,
        "8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48",
    ),
]

MODEL_FILES.insert(
    0,
    (
        "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
        20970379616,
        "e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a",
    ),
)


for relative_path, expected_size, expected_sha256 in MODEL_FILES:
    ensure_download(
        f"https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/{MODEL_REVISION}/{relative_path}",
        f"{WORKSPACE}/models/{relative_path}",
        expected_size,
        expected_sha256,
    )

ensure_download(
    f"https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/{LORA_REVISION}/{LORA_FILE}",
    f"{WORKSPACE}/models/loras/{LORA_FILE}", 1956192992,
    "c396a9a06f58399e9df9754b18299818d84a2ddd371724ba48fe4a41221437dc",
)
os.environ["COMFY_WORKSPACE"] = WORKSPACE

cloudflared_deb = "/root/cloudflared-linux-amd64.deb"
ensure_download(
    f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-amd64.deb",
    cloudflared_deb,
    18887572,
    CLOUDFLARED_SHA256,
)
run("dpkg", "-i", cloudflared_deb)

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"ComfyUI revision = {COMFYUI_REVISION}")
print(f"MiniMax H3 model revision = {MODEL_REVISION}")
print(f"Turbo LoRA revision = {LORA_REVISION}")
download_size_gb = (sum(item[1] for item in MODEL_FILES) + 1956192992) / 1_000_000_000
print(f"Model download size = {download_size_gb:.2f} GB (decimal)")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
