# Colab cell: set up Krea 2 keyframes and MiniMax H3 I2V/R2V (A100 required).
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False
DOWNLOAD_FL2VA = True
DOWNLOAD_REF2VA = True

COMFYUI_REVISION = "e01fb4c56b7a88149d469b99cbbfe3223d715054"
H3_MODEL_REVISION = "4cc1d817b6184899b41293954329f576cb5ae86b"
KREA2_MODEL_REVISION = "e5ea8b4dd7f38f348b138eb0fe29f92c0e367e96"
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
run("git", "fetch", "--depth", "1", "origin", COMFYUI_REVISION)
run("git", "checkout", "--detach", COMFYUI_REVISION)

# Use Colab's preinstalled torch plus ComfyUI's requirements at this pin.
# A pinned-index torch install can downgrade the runtime's newer torch build.
run(sys.executable, "-m", "pip", "install", "-q", "-r", f"{WORKSPACE}/requirements.txt")

if not DOWNLOAD_FL2VA and not DOWNLOAD_REF2VA:
    raise ValueError("Enable DOWNLOAD_FL2VA, DOWNLOAD_REF2VA, or both")

KREA2_MODEL_FILES = [
    (
        "diffusion_models/krea2_turbo_fp8_scaled.safetensors",
        13141730784,
        "eb4dd8c612cfd10f64f25b057e6e6bbcb5737c94a7372177e456dbf7579502f1",
    ),
    (
        "text_encoders/qwen3vl_4b_fp8_scaled.safetensors",
        5242467968,
        "54bd5144df0bbc25dd6ccadfcb826b521445a1b06ae5a42570bdd2974ca87094",
    ),
    (
        "vae/qwen_image_vae.safetensors",
        253806246,
        "a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f",
    ),
]

H3_MODEL_FILES = [
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
    H3_MODEL_FILES.insert(
        0,
        (
            "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors",
            20970379616,
            "9255f52b6677845ad238f20dfaafa94727053694127ab7f255c048f0f9365779",
        ),
    )

if DOWNLOAD_FL2VA:
    H3_MODEL_FILES.insert(
        0,
        (
            "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors",
            20970379616,
            "e889202c41dafb67b10d67b97f0d8541508036a6090af23425a5c2615d03c47a",
        ),
    )

for relative_path, expected_size, expected_sha256 in KREA2_MODEL_FILES:
    ensure_download(
        f"https://huggingface.co/Comfy-Org/Krea-2/resolve/{KREA2_MODEL_REVISION}/{relative_path}",
        f"{WORKSPACE}/models/{relative_path}",
        expected_size,
        expected_sha256,
    )

for relative_path, expected_size, expected_sha256 in H3_MODEL_FILES:
    ensure_download(
        f"https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/{H3_MODEL_REVISION}/{relative_path}",
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
print(f"ComfyUI revision = {COMFYUI_REVISION}")
print(f"Krea 2 model revision = {KREA2_MODEL_REVISION}")
print(f"MiniMax H3 model revision = {H3_MODEL_REVISION}")
print(f"DOWNLOAD_FL2VA = {DOWNLOAD_FL2VA}")
print(f"DOWNLOAD_REF2VA = {DOWNLOAD_REF2VA}")
download_size_gb = sum(item[1] for item in KREA2_MODEL_FILES + H3_MODEL_FILES) / 1_000_000_000
print(f"Model download size = {download_size_gb:.2f} GB (decimal)")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
