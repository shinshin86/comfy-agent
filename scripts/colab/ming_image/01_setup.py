# Colab cell 1/2: Ming-Image-0.1-Design INT8 (opaque image E2E verified on A100 40GB).
# Use a fresh A100 40GB+ high-RAM runtime. No Google Drive access.
# Resource guards are conservative planning limits, not measured requirements.

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

COMFYUI_REVISION = "6b747c0428c343e1417219641db93a4fb7cb69ae"  # v0.38.0
MODEL_REVISION = "53654871e47a5d2daed7b3a986cbf1010ef81c78"
CLOUDFLARED_VERSION = "2026.7.2"
WORKSPACE = "/content/ComfyUI"
MODEL_FILES = [
    (
        "diffusion_models/ming_image_0.1_design_int8_convrot.safetensors",
        6175239953,
        "0d3f5bcc6d2cb830578ea6d0925b30b9fb66058bcb651cc8633e60760dceb1d0",
    ),
    (
        "text_encoders/ming_image_0.1_ling_mini_2.0_int8_convrot.safetensors",
        19507670525,
        "9d9f31cfce37c24ae1589287f5c33bd9dda80e14ddf773b5e17a0bb69c8cc4b1",
    ),
    (
        "vae/ming_image_vae_bf16.safetensors",
        253816696,
        "7f5bed402dc8c77dc2e0ab1929a85d4df433b7cf7b599dfa8c353da98db0b90a",
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
    run("wget", "-c", "-O", str(partial), url)
    if partial.stat().st_size != expected_size or sha256_file(partial) != expected_sha256:
        raise RuntimeError(f"Downloaded file failed integrity check: {target.name}; partial file retained.")
    partial.replace(target)


def check_resources(gpu_bytes, ram_bytes, free_bytes, remaining_bytes):
    if gpu_bytes < 38 * 1024**3:
        raise RuntimeError("Kit policy: choose one GPU with at least 38 GiB usable memory (A100 40GB+).")
    if ram_bytes < 48 * 1024**3:
        raise RuntimeError("Kit policy: choose a high-RAM runtime with at least 48 GiB RAM; plan for 64GB+.")
    if free_bytes < remaining_bytes + 20_000_000_000:
        raise RuntimeError("Insufficient runtime-local disk for remaining weights plus 20GB dependency/output headroom.")


def main():
    if not Path("/content").is_dir():
        raise RuntimeError("This setup cell is for an approved Google Colab runtime only.")
    import google.colab  # noqa: F401; checks the environment without mounting Drive

    workspace = Path(WORKSPACE)
    if workspace.exists():
        revision = subprocess.check_output(
            ["git", "-C", WORKSPACE, "rev-parse", "HEAD"], text=True
        ).strip()
        dirty = subprocess.check_output(
            ["git", "-C", WORKSPACE, "status", "--porcelain", "--untracked-files=no"], text=True
        ).strip()
        if revision != COMFYUI_REVISION or dirty:
            raise RuntimeError("Existing ComfyUI checkout differs from this kit. Use a fresh runtime; no reset is performed.")

    gpu_mib = subprocess.check_output(
        ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"], text=True
    ).strip().splitlines()
    if len(gpu_mib) != 1:
        raise RuntimeError("This kit expects exactly one CUDA GPU.")
    ram_kib = next(
        int(line.split()[1]) for line in Path("/proc/meminfo").read_text().splitlines()
        if line.startswith("MemTotal:")
    )
    remaining = sum(
        size for relative, size, _ in MODEL_FILES
        if not (workspace / "models" / relative).exists()
    )
    check_resources(int(gpu_mib[0]) * 1024**2, ram_kib * 1024,
                    shutil.disk_usage("/content").free, remaining)

    if not workspace.exists():
        run("git", "clone", "--depth", "1", "--branch", "v0.38.0",
            "https://github.com/Comfy-Org/ComfyUI.git", WORKSPACE)
        actual = subprocess.check_output(["git", "-C", WORKSPACE, "rev-parse", "HEAD"], text=True).strip()
        if actual != COMFYUI_REVISION:
            raise RuntimeError("ComfyUI tag no longer matches the pinned revision; stop before downloading weights.")
    os.chdir(WORKSPACE)
    # Keep Colab's CUDA-compatible torch; install the pinned ComfyUI requirements,
    # including comfy-kitchen 0.2.36 for the convrot quantization kernels.
    run(sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt")
    run(sys.executable, "-c",
        "import comfy.supported_models, comfy.text_encoders.ming_image; "
        "assert hasattr(comfy.supported_models, 'MingImage'); "
        "import comfy_kitchen")

    for relative, size, digest in MODEL_FILES:
        ensure_download(
            f"https://huggingface.co/Comfy-Org/Ming-Image/resolve/{MODEL_REVISION}/{relative}",
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
    print(f"ComfyUI v0.38.0: {COMFYUI_REVISION}")
    print(f"Model download: {sum(item[1] for item in MODEL_FILES) / 1_000_000_000:.2f} GB (decimal)")
    print("Run the shared 02_start_comfyui.py next. Japanese text and transparency need output checks.")


if __name__ == "__main__":
    main()
