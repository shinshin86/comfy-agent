# Colab cell 1/2: P-H3-Image INT8 text-to-image and image editing.
# Use a fresh A100 40GB+ high-RAM runtime. No Google Drive access.
# Resource guards are conservative planning limits, not measured requirements.
#
# License: MiniMax H3 Community License (territory-restricted; see README).
# The setup does not geolocate you or block execution. Downloading or using the
# weights may constitute acceptance of the upstream terms.

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

COMFYUI_TAG = "v0.44.0"
COMFYUI_REVISION = "2c75dc1b379a59e0880619d029607af5169a62ef"
MODEL_REPO = "PrunaAI/P-H3-Image-Comfy"
MODEL_REVISION = "44a0fb73f299da1bb715bdb5ff59ce3fd3c6f543"
CLOUDFLARED_VERSION = "2026.7.2"
WORKSPACE = "/content/ComfyUI"
MODEL_FILES = [
    (
        "diffusion_models/p-h3-image_int8_convrot.safetensors",
        21213068840,
        "b156fd4fe9d169e58cb2b07f9594ec740ff8f0e052d62b009e6dd034de5865e7",
    ),
    (
        "text_encoders/p-h3-image_text_encoder_int8_convrot.safetensors",
        5120870504,
        "fb42c9ff0597e61729475d0b48b69b591ffe06d0b442a79dde22b14fadbe1c0f",
    ),
    (
        "text_encoders/p-h3-image_prompt_upsampler_bf16.safetensors",
        19306305552,
        "122b4a8cc63ab4ef21d81e54e761dcc8613ef55b3ad7205ac3a9d47d2414c94f",
    ),
    (
        "vae/p-h3-image_vae_int8_convrot.safetensors",
        3146996440,
        "583e0d43354b6b833aa9a0815a5fac831b1ef6d0c19a7eaa0616980a3dab5ffe",
    ),
]


def run(*args):
    return subprocess.run(list(args), check=True)


def sha256_file(file_path):
    digest = hashlib.sha256()
    with open(file_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_download(url, destination, expected_size, expected_sha256):
    target = Path(destination)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.stat().st_size == expected_size and sha256_file(target) == expected_sha256:
            print(f"Using verified file: {target.name}")
            return
        raise RuntimeError(f"Existing file failed integrity check: {target.name}; inspect it before retrying.")
    partial = Path(str(target) + ".part")
    run("wget", "-q", "-c", "-O", str(partial), url)
    if partial.stat().st_size != expected_size or sha256_file(partial) != expected_sha256:
        raise RuntimeError(f"Downloaded file failed integrity check: {target.name}; partial file retained.")
    partial.replace(target)


def check_resources(gpu_bytes, free_bytes, remaining_bytes):
    if gpu_bytes < 38 * 1024**3:
        raise RuntimeError("Kit policy: choose one GPU with at least 38 GiB usable memory (A100 40GB+).")
    if free_bytes < remaining_bytes + 20_000_000_000:
        raise RuntimeError("Insufficient runtime-local disk for remaining weights plus 20GB dependency/output headroom.")


def main():
    if not Path("/content").is_dir():
        raise RuntimeError("This setup cell is for a Google Colab runtime only.")
    import google.colab  # noqa: F401; checks the environment without mounting Drive

    workspace = Path(WORKSPACE)
    if workspace.exists():
        revision = subprocess.check_output(
            ["git", "-C", WORKSPACE, "rev-parse", "HEAD"], text=True
        ).strip()
        if revision != COMFYUI_REVISION:
            raise RuntimeError("Existing ComfyUI checkout differs from this kit. Use a fresh runtime; no reset is performed.")

    gpu_mib = subprocess.check_output(
        ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"], text=True
    ).strip().splitlines()
    if len(gpu_mib) != 1:
        raise RuntimeError("This kit expects exactly one CUDA GPU.")
    remaining = sum(
        size for relative, size, _ in MODEL_FILES
        if not (workspace / "models" / relative).exists()
    )
    check_resources(int(gpu_mib[0]) * 1024**2, shutil.disk_usage("/content").free, remaining)

    if not workspace.exists():
        run("git", "clone", "--depth", "1", "--branch", COMFYUI_TAG,
            "https://github.com/Comfy-Org/ComfyUI.git", WORKSPACE)
        actual = subprocess.check_output(["git", "-C", WORKSPACE, "rev-parse", "HEAD"], text=True).strip()
        if actual != COMFYUI_REVISION:
            raise RuntimeError("ComfyUI tag no longer matches the pinned revision; stop before downloading weights.")
    os.chdir(WORKSPACE)
    # Keep Colab's CUDA-compatible torch; requirements.txt pins comfy-kitchen,
    # which supplies the int8 convrot quantized kernels.
    run(sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt")
    nodes = Path("comfy_extras/nodes_minimax_h3.py").read_text(encoding="utf-8")
    if "PH3ImageConditioning" not in nodes:
        raise RuntimeError("This ComfyUI checkout has no PH3ImageConditioning node.")

    for relative, size, digest in MODEL_FILES:
        ensure_download(
            f"https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_REVISION}/{relative}",
            str(workspace / "models" / relative), size, digest,
        )
    cloudflared_deb = "/content/cloudflared-linux-amd64.deb"
    ensure_download(
        f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-amd64.deb",
        cloudflared_deb, 18887572,
        "88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a",
    )
    run("dpkg", "-i", cloudflared_deb)
    print(f"Setup complete. WORKSPACE = {WORKSPACE}")
    print(f"ComfyUI {COMFYUI_TAG}: {COMFYUI_REVISION}")
    print(f"Model download: {sum(item[1] for item in MODEL_FILES) / 1_000_000_000:.2f} GB (decimal)")
    print("Run the shared 02_start_comfyui.py next.")


if __name__ == "__main__":
    main()
