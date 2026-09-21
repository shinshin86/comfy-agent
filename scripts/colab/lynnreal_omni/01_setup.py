# Colab cell 1/2: LynnReal-Omni Standard INT8, isolated A100 setup.
COMFYUI_REVISION = "40c4fcdf513a4523e39d54a9d391908af8df8171"  # v0.35.0
MODEL_REVISION = "ef06e618f44a6cb0f2ed111645052098c4b7364a"
CLOUDFLARED_VERSION = "2026.7.2"
CLOUDFLARED_SHA256 = "88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a"
WORKSPACE = "/content/comfy-agent-lynnreal/ComfyUI"

import hashlib
import os
import subprocess
import sys
import time


def run(*args, check=True):
    return subprocess.run(list(args), check=check)


def sha256_file(file_path):
    digest = hashlib.sha256()
    checked = 0
    next_report = time.monotonic() + 30
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
            checked += len(chunk)
            if time.monotonic() >= next_report:
                print(f"Verifying {os.path.basename(file_path)}: {checked / 1e9:.1f} GB read", flush=True)
                next_report = time.monotonic() + 30
    return digest.hexdigest()


def ensure_download(url, destination, expected_size, expected_sha256):
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    control_file = destination + ".aria2"
    if os.path.isfile(destination):
        current_size = os.path.getsize(destination)
        if current_size == expected_size and not os.path.exists(control_file):
            actual = sha256_file(destination)
            if actual == expected_sha256:
                print(f"Using verified file: {destination}")
                return
            print(f"Removing checksum-mismatched file: {destination}")
            os.remove(destination)
        elif current_size > expected_size:
            print(f"Removing oversized file: {destination}")
            os.remove(destination)
            if os.path.exists(control_file):
                os.remove(control_file)
        else:
            print(f"Resuming partial download: {destination}")

    run("aria2c", "--continue=true", "--max-connection-per-server=16",
        "--split=16", "--min-split-size=16M", "--file-allocation=none",
        "--summary-interval=30", "--console-log-level=warn",
        "--dir", os.path.dirname(destination), "--out", os.path.basename(destination), url)
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


import socket

with socket.socket() as sock:
    if sock.connect_ex(("127.0.0.1", 8188)) == 0:
        raise RuntimeError("Port 8188 is occupied; use a fresh runtime")
if os.path.exists(WORKSPACE):
    origin = subprocess.check_output(["git", "-C", WORKSPACE, "remote", "get-url", "origin"], text=True).strip()
    head = subprocess.check_output(["git", "-C", WORKSPACE, "rev-parse", "HEAD"], text=True).strip()
    dirty = subprocess.check_output(["git", "-C", WORKSPACE, "status", "--porcelain", "--untracked-files=no"], text=True).strip()
    if origin != "https://github.com/Comfy-Org/ComfyUI.git" or head != COMFYUI_REVISION or dirty:
        raise RuntimeError("Refusing to replace a different or modified checkout")
else:
    os.makedirs(os.path.dirname(WORKSPACE), exist_ok=True)
    run("git", "clone", "--filter=blob:none", "https://github.com/Comfy-Org/ComfyUI.git", WORKSPACE)
os.chdir(WORKSPACE)
run("git", "fetch", "--depth", "1", "origin", COMFYUI_REVISION)
run("git", "checkout", "--detach", COMFYUI_REVISION)
run(sys.executable, "-m", "pip", "install", "torch==2.11.0+cu130",
    "torchvision==0.26.0+cu130", "torchaudio==2.11.0+cu130",
    "--index-url", "https://download.pytorch.org/whl/cu130")
run(sys.executable, "-m", "pip", "install", "-r", "requirements.txt")
run(sys.executable, "-c", """
import torch
assert torch.cuda.is_available() and torch.cuda.is_bf16_supported(), 'BF16 GPU required'
p = torch.cuda.get_device_properties(0)
assert p.total_memory >= 39 * 1024**3, 'A100 40GB or larger required'
print('GPU:', p.name, 'VRAM GiB:', p.total_memory / 1024**3, 'torch:', torch.__version__)
""")

run("apt-get", "update", "-qq")
run("apt-get", "install", "-y", "--no-install-recommends", "aria2")

MODEL_FILES = [
    ("diffusion_models/lynnreal_omni_standard_int8.safetensors", 47795349048,
     "18b66fc10a4707ffbe26bfba442b5318a1d8fbbfd4ffbd015852edc4335290fb"),
    ("text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", 15687142551,
     "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6"),
    ("vae/minimax_h3_video_vae_fp16.safetensors", 5207808496,
     "7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522"),
    ("vae/minimax_h3_audio_vae_fp32.safetensors", 605254808,
     "8e505d95dd1561d47abd43d4238fd40d9bb1ae9e147ed0a4cba778d76ae4db48"),
]
for relative_path, expected_size, expected_sha256 in MODEL_FILES:
    ensure_download(
        f"https://huggingface.co/stdstu123/LynnReal-Onmi-beta-0.1/resolve/{MODEL_REVISION}/comfyui/models/{relative_path}",
        f"{WORKSPACE}/models/{relative_path}", expected_size, expected_sha256,
    )
cloudflared_deb = "/content/lynnreal-cloudflared.deb"
ensure_download(
    f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-amd64.deb",
    cloudflared_deb, 18887572, CLOUDFLARED_SHA256,
)
run("dpkg", "-i", cloudflared_deb)
print(f"Setup complete: {WORKSPACE}; model downloads = {sum(x[1] for x in MODEL_FILES)/1e9:.2f} GB")
print(f"ComfyUI revision = {COMFYUI_REVISION}; model revision = {MODEL_REVISION}")
