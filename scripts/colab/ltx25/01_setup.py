# Colab cell: set up native LTX-2.5 support in ComfyUI.
# Paste this file into one Colab cell and run once per fresh A100 session.
#
# Before running:
#   1. Accept the gated model terms at https://huggingface.co/Lightricks/LTX-2.5
#   2. Add a Hugging Face Read token to Colab Secrets as HF_TOKEN
#      and grant this notebook access to it.
#
# The token is read through google.colab.userdata and is never printed.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = False

COMFYUI_REVISION = "c2bcbecd82ec5ae66594340b395c24ef0217b238"  # v0.32.0
LTX25_REPO = "Lightricks/LTX-2.5"
LTX25_REVISION = "28dac7acdc1f78a70e98687db261a949754f8941"
GEMMA4_REPO = "Comfy-Org/gemma-4"
GEMMA4_REVISION = "fb53025d538a4d19de09e37d01ee49b41f18e486"
WORKFLOW_REVISION = "96a8cab7fa7b4c201910cd59cdd94dcc3c2d2deb"
CLOUDFLARED_VERSION = "2026.7.2"
CLOUDFLARED_SHA256 = "88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a"

import hashlib
import os
import shutil
import subprocess
import sys


def run(*args):
    return subprocess.run(list(args), check=True)


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
        if current_size == expected_size and sha256_file(destination) == expected_sha256:
            print(f"Using verified file: {destination}")
            return
        os.remove(destination)

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


if USE_GOOGLE_DRIVE:
    from google.colab import drive

    drive.mount("/content/drive")
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
else:
    current_dir = os.getcwd()
    WORKSPACE = current_dir if os.path.isfile(os.path.join(current_dir, "main.py")) else f"{current_dir}/ComfyUI"

if not os.path.isdir(WORKSPACE):
    run("git", "clone", "--filter=blob:none", "https://github.com/Comfy-Org/ComfyUI.git", WORKSPACE)

os.chdir(WORKSPACE)
if UPDATE_COMFYUI:
    run("git", "fetch", "--depth", "1", "origin", "master")
    run("git", "checkout", "--detach", "FETCH_HEAD")
else:
    run("git", "fetch", "--depth", "1", "origin", COMFYUI_REVISION)
    run("git", "checkout", "--detach", COMFYUI_REVISION)

run(sys.executable, "-m", "pip", "install", "-q", "-r", f"{WORKSPACE}/requirements.txt")
run(sys.executable, "-m", "pip", "install", "-q", "huggingface_hub>=0.34.0", "hf_xet>=1.1.5")

from google.colab import userdata
from huggingface_hub import HfApi, hf_hub_download

try:
    hf_token = userdata.get("HF_TOKEN")
except Exception:
    hf_token = None

if not hf_token:
    raise RuntimeError(
        "HF_TOKEN is unavailable. Accept the LTX-2.5 model terms, add a Hugging Face "
        "Read token to Colab Secrets as HF_TOKEN, and grant this notebook access."
    )

try:
    HfApi().model_info(LTX25_REPO, revision=LTX25_REVISION, token=hf_token)
except Exception as error:
    raise RuntimeError(
        "LTX-2.5 access check failed. Confirm that the model terms are accepted and "
        "HF_TOKEN can read gated repositories."
    ) from error

MODEL_FILES = [
    (
        LTX25_REPO,
        LTX25_REVISION,
        "diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors",
        21504034224,
        True,
    ),
    (
        LTX25_REPO,
        LTX25_REVISION,
        "text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors",
        15372971786,
        True,
    ),
    (
        GEMMA4_REPO,
        GEMMA4_REVISION,
        "text_encoders/gemma4_e2b_it_bf16.safetensors",
        10278774160,
        False,
    ),
    (
        LTX25_REPO,
        LTX25_REVISION,
        "vae/ltx-2.5-video-vae-bf16.safetensors",
        1472223346,
        True,
    ),
    (
        LTX25_REPO,
        LTX25_REVISION,
        "vae/ltx-2.5-audio-vae-bf16.safetensors",
        364866540,
        True,
    ),
    (
        LTX25_REPO,
        LTX25_REVISION,
        "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
        995778752,
        True,
    ),
]

required_bytes = sum(item[3] for item in MODEL_FILES) + 8_000_000_000
free_bytes = shutil.disk_usage(WORKSPACE).free
if free_bytes < required_bytes:
    raise RuntimeError(
        f"Insufficient free disk: need at least {required_bytes / 1e9:.1f} GB, "
        f"found {free_bytes / 1e9:.1f} GB. Use a fresh high-RAM runtime or Google Drive."
    )

model_root = f"{WORKSPACE}/models"
for repo_id, revision, relative_path, expected_size, gated in MODEL_FILES:
    destination = f"{model_root}/{relative_path}"
    if os.path.isfile(destination) and os.path.getsize(destination) == expected_size:
        print(f"Using size-verified file: {destination}")
        continue
    if os.path.isfile(destination):
        os.remove(destination)

    downloaded = hf_hub_download(
        repo_id=repo_id,
        filename=relative_path,
        revision=revision,
        local_dir=model_root,
        token=hf_token if gated else None,
    )
    actual_size = os.path.getsize(downloaded)
    if actual_size != expected_size:
        raise RuntimeError(
            f"Size mismatch for {relative_path}: expected {expected_size}, got {actual_size}"
        )

cloudflared_deb = "/root/cloudflared-linux-amd64.deb"
ensure_download(
    f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-amd64.deb",
    cloudflared_deb,
    18887572,
    CLOUDFLARED_SHA256,
)
run("dpkg", "-i", cloudflared_deb)

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"ComfyUI revision = {COMFYUI_REVISION if not UPDATE_COMFYUI else 'latest master'}")
print(f"LTX-2.5 model revision = {LTX25_REVISION}")
print(f"Workflow template revision = {WORKFLOW_REVISION}")
print("Model download size = 49.99 GB (decimal)")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
