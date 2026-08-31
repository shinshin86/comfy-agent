# Colab cell: set up native MiniMax H3 support in ComfyUI.
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = False
DOWNLOAD_FL2VA = True
DOWNLOAD_REF2VA = False
DOWNLOAD_REF2V_TURBO_LORA = False

COMFYUI_REVISION = "e01fb4c56b7a88149d469b99cbbfe3223d715054"
MODEL_REVISION = "4cc1d817b6184899b41293954329f576cb5ae86b"
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

if not DOWNLOAD_FL2VA and not DOWNLOAD_REF2VA:
    raise ValueError("Enable DOWNLOAD_FL2VA, DOWNLOAD_REF2VA, or both")

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

if DOWNLOAD_REF2VA:
    MODEL_FILES.insert(
        0,
        (
            "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
            20970379616,
            "9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779",
        ),
    )

if DOWNLOAD_FL2VA:
    MODEL_FILES.insert(
        0,
        (
            "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
            20970379616,
            "e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a",
        ),
    )

if DOWNLOAD_REF2V_TURBO_LORA:
    MODEL_FILES.append(
        (
            "loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors",
            1956193000,
            "5b9ab5ade15d0775676d01a907268a69a1468dc6033b3b0d3ded5502f3ebb84c",
        )
    )

for relative_path, expected_size, expected_sha256 in MODEL_FILES:
    ensure_download(
        f"https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/{MODEL_REVISION}/{relative_path}",
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
print(f"MiniMax H3 model revision = {MODEL_REVISION}")
print(f"DOWNLOAD_FL2VA = {DOWNLOAD_FL2VA}")
print(f"DOWNLOAD_REF2VA = {DOWNLOAD_REF2VA}")
print(f"DOWNLOAD_REF2V_TURBO_LORA = {DOWNLOAD_REF2V_TURBO_LORA}")
download_size_gb = sum(item[1] for item in MODEL_FILES) / 1_000_000_000
print(f"Model download size = {download_size_gb:.2f} GB (decimal)")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
