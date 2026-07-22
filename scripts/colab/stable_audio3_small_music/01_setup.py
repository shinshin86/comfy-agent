# Colab cell: set up ComfyUI and Stable Audio 3 Small Music.
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = False

COMFYUI_REVISION = "7bf8bfcd078c7f4ae50ca5149c9ff7d8613e1fb1"
MODEL_REVISION = "a02cbcdcd07426b0150557d0145bc894795823af"
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

checkpoint_path = f"{WORKSPACE}/models/checkpoints/stable_audio_3_small_music.safetensors"
ensure_download(
    f"https://huggingface.co/Comfy-Org/stable-audio-3/resolve/{MODEL_REVISION}/checkpoints/stable_audio_3_small_music.safetensors",
    checkpoint_path,
    "da85866b11b01d0694d990785f6abbd79c8064df1b0e6f8aea52935e0ef84b64",
)

text_encoder_path = f"{WORKSPACE}/models/text_encoders/t5gemma_b_b_ul2.safetensors"
ensure_download(
    f"https://huggingface.co/Comfy-Org/stable-audio-3/resolve/{MODEL_REVISION}/text_encoders/t5gemma_b_b_ul2.safetensors",
    text_encoder_path,
    "1e1eba25be8872edb0d3c6335c6658fd6388e7b14b60da6e454e404cfcd8150e",
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
print(f"Stable Audio model revision = {MODEL_REVISION}")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
