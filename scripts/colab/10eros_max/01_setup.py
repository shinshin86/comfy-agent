# Colab cell: set up native MiniMax H3 support for 10Eros-Max in ComfyUI.
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = False

COMFYUI_REVISION = "14b05228cef127ce529bc0c08660770d4af3e9a8"
BASE_MODEL_REVISION = "fd70b39279d1ae6eb214c903f53e1bec3af19a77"
EROS_MODEL_REVISION = "a563c82845b456e7e7c7f284a2d9644c2dd968cc"
CLOUDFLARED_VERSION = "2026.7.2"
CLOUDFLARED_SHA256 = "88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a"

import hashlib
import os
import subprocess
import sys


def run(*args, check=True):
    return subprocess.run(list(args), check=check)


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

# The upstream 10Eros-Max card links this INT8 ConvRot conversion. The FL2VA
# Beta2 variant matches ComfyUI's native H3 first/last-frame workflow while
# keeping the diffusion-model download practical for an A100 40 GB runtime.
MODEL_FILES = [
    (
        "https://huggingface.co/cicalooo/10Eros-Max-h3-int8-convrot/resolve/"
        f"{EROS_MODEL_REVISION}/10Eros_Max_h3_fl2va_beta2_pruned_int8_convrot.safetensors",
        "diffusion_models/10Eros_Max_h3_fl2va_beta2_pruned_int8_convrot.safetensors",
        20197375168,
        "b158940fedae336085b322e5a0de93e6294e63713b4ee174d39b32550d9692da",
    ),
    (
        "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/"
        f"{BASE_MODEL_REVISION}/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
        15687142551,
        "35a88d51044231fe332301d7a62aa81e3f2cba62febeb446e2c1e3e0ef76f2c6",
    ),
    (
        "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/"
        f"{BASE_MODEL_REVISION}/vae/minimax_h3_video_vae_fp16.safetensors",
        "vae/minimax_h3_video_vae_fp16.safetensors",
        5207808496,
        "7c1f131492e7eddacaac9069a61b81bdd39de5cc96561e677c5eab1cdce5e522",
    ),
    (
        "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/"
        f"{BASE_MODEL_REVISION}/vae/minimax_h3_audio_vae_fp32.safetensors",
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
print(f"10Eros-Max INT8 revision = {EROS_MODEL_REVISION}")
print(f"MiniMax H3 support-model revision = {BASE_MODEL_REVISION}")
print("Model download size = 41.70 GB (decimal)")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
