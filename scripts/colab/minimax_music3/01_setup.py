# Colab cell: set up ComfyUI and MiniMax Music 3.
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = False

COMFYUI_REVISION = "7fe8a6138504f90ff7be82f3babf416da32876b1"
MODEL_REVISION = "6444666eb6edfb2c7fcab5f8b81da8b84b4b17b6"
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


def ensure_download(url, destination, expected_sha256):
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    if os.path.isfile(destination):
        actual = sha256_file(destination)
        if actual == expected_sha256:
            print(f"Using verified model: {destination}")
            return
        print(f"Removing checksum-mismatched file: {destination}")
        os.remove(destination)

    run("wget", "-O", destination, url)
    actual = sha256_file(destination)
    if actual != expected_sha256:
        raise RuntimeError(
            f"SHA-256 mismatch for {destination}: expected {expected_sha256}, got {actual}"
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

model_base_url = f"https://huggingface.co/Comfy-Org/MiniMax-Music-3/resolve/{MODEL_REVISION}"
model_assets = [
    (
        "diffusion_models/minimax_music3_dit_int8_convrot.safetensors",
        "d6b959633e69899f99f3a92d6741c0fe79f26958a30811e50e372ef978b24d5f",
    ),
    (
        "text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
        "010b7416d2336a08c711bc22ee65849c9623069ddb7d89bec011a75699e52014",
    ),
    (
        "vae/minimax_music3_dav.safetensors",
        "2a32155b769be01445fcc2a8663b910fc9e1751e18dc1c3ec528064512d9ef0c",
    ),
]

for relative_path, expected_sha256 in model_assets:
    ensure_download(
        f"{model_base_url}/{relative_path}",
        f"{WORKSPACE}/models/{relative_path}",
        expected_sha256,
    )

cloudflared_deb = "/root/cloudflared-linux-amd64.deb"
ensure_download(
    f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-amd64.deb",
    cloudflared_deb,
    CLOUDFLARED_SHA256,
)
run("dpkg", "-i", cloudflared_deb)

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"ComfyUI revision = {COMFYUI_REVISION if not UPDATE_COMFYUI else 'latest master'}")
print(f"MiniMax Music 3 model revision = {MODEL_REVISION}")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
