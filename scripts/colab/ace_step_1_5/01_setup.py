# Colab cell: set up ComfyUI and ACE-Step 1.5 Turbo AIO.
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = False

COMFYUI_REVISION = "7bf8bfcd078c7f4ae50ca5149c9ff7d8613e1fb1"
MODEL_REVISION = "54b2ef4d8af5582f54c7e6b84c22b679a194bc4b"
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

checkpoint_path = f"{WORKSPACE}/models/checkpoints/ace_step_1.5_turbo_aio.safetensors"
ensure_download(
    f"https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files/resolve/{MODEL_REVISION}/checkpoints/ace_step_1.5_turbo_aio.safetensors",
    checkpoint_path,
    "67b0f43aa5c51c840bd0228e6a935d8ff416ec87e5df2fc0637da17a561252bc",
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
print(f"ACE-Step model revision = {MODEL_REVISION}")
print(f"cloudflared version = {CLOUDFLARED_VERSION}")
