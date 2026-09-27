# Colab cell: Qwen-Image 2.1 GGUF (abenzerps base Q4_K_M) on ComfyUI.
# Paste this into one Colab cell; then run ../02_start_comfyui.py.
# This kit uses ComfyUI nightly plus the leejet/ComfyUI-GGUF custom node.
# Base GGUF weights are hosted on the publisher's base branch.
# Qwen Research License: research/evaluation use only without a separate
# commercial license. Review Colab's Acceptable Use Policy for your prompts.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = True
INSTALL_MANAGER = True
RESTORE_NODE_DEPS = True
COMFYUI_COMMIT = ""  # Pin a known-good ComfyUI revision if master regresses.

import hashlib
import os
import subprocess

_cwd = os.getcwd()
if USE_GOOGLE_DRIVE:
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    os.chdir('/content/drive/MyDrive')
elif os.path.isfile(os.path.join(_cwd, "main.py")):
    WORKSPACE = _cwd
else:
    WORKSPACE = f"{_cwd}/ComfyUI"

if not os.path.isdir(WORKSPACE):
    !git clone https://github.com/comfyanonymous/ComfyUI {WORKSPACE}
%cd {WORKSPACE}
if UPDATE_COMFYUI:
    !git pull
if COMFYUI_COMMIT:
    !git checkout {COMFYUI_COMMIT}

# Check native 2.1 support before downloading ~14.6 GB of weights.
_qwen_nodes = os.path.join(WORKSPACE, "comfy_extras", "nodes_qwen.py")
if not os.path.isfile(_qwen_nodes) or "TextEncodeQwenImage21" not in open(_qwen_nodes, encoding="utf-8").read():
    raise SystemExit("ComfyUI lacks Qwen-Image 2.1 nodes. Update ComfyUI master/nightly first.")

!pip3 install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
!pip3 install -q accelerate einops 'transformers>=4.45' 'safetensors>=0.4.2' \
    aiohttp pyyaml Pillow scipy tqdm psutil 'tokenizers>=0.13.3'
!pip3 install -q torchsde 'kornia>=0.7.1' spandrel soundfile sentencepiece av
!pip3 install -q blake3 comfy_aimdo comfy_kitchen simpleeval
!pip3 install -q -r {WORKSPACE}/requirements.txt

if INSTALL_MANAGER:
    manager_dir = f"{WORKSPACE}/custom_nodes/ComfyUI-Manager"
    if not os.path.isdir(manager_dir):
        !git clone https://github.com/ltdrdata/ComfyUI-Manager {manager_dir}
    else:
        !git -C {manager_dir} pull
    if RESTORE_NODE_DEPS:
        !pip3 install -q GitPython
        !python {manager_dir}/cm-cli.py restore-dependencies

gguf_dir = f"{WORKSPACE}/custom_nodes/ComfyUI-GGUF"
gguf_repo = "https://github.com/leejet/ComfyUI-GGUF"
if os.path.isdir(gguf_dir):
    origin = subprocess.check_output(
        ["git", "-C", gguf_dir, "remote", "get-url", "origin"], text=True
    ).strip().removesuffix(".git").rstrip("/")
    if origin != gguf_repo:
        raise SystemExit(
            f"{gguf_dir} comes from {origin}; this kit requires {gguf_repo}. "
            "Resolve the custom-node conflict before continuing."
        )
    !git -C {gguf_dir} pull
else:
    !git clone {gguf_repo} {gguf_dir}
!pip3 install -q -r {gguf_dir}/requirements.txt

for subdir in ("diffusion_models", "text_encoders", "vae"):
    os.makedirs(f"{WORKSPACE}/models/{subdir}", exist_ok=True)

GGUF_NAME = "qwen-image-2.1-Q4_K_M.gguf"
GGUF_SHA256 = "833439e91bc1152d28f37aa198c7f6f4218b7de95754c2f7a318a2422ab4b2f8"
GGUF_URL = "https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF/resolve/base"
gguf_path = f"{WORKSPACE}/models/diffusion_models/{GGUF_NAME}"
if not os.path.isfile(gguf_path):
    !wget -c -O {gguf_path} {GGUF_URL}/{GGUF_NAME}

# Pin the base-branch file; stop if its bytes change. SHA256SUMS is published
# in the same repository's main branch.
digest = hashlib.sha256()
with open(gguf_path, "rb") as model_file:
    for chunk in iter(lambda: model_file.read(8 * 1024 * 1024), b""):
        digest.update(chunk)
if digest.hexdigest() != GGUF_SHA256:
    raise SystemExit(
        f"Checksum mismatch for {GGUF_NAME}. Check the publisher's SHA256SUMS "
        "and update this kit only after validating the new weights."
    )

QWEN_2_1 = "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main"
CLIP_NAME = "qwen3vl_8b_int8_convrot.safetensors"
VAE_NAME = "qwen_image_2.1_vae_bf16.safetensors"
!wget -nc -O {WORKSPACE}/models/text_encoders/{CLIP_NAME} \
    {QWEN_2_1}/text_encoders/{CLIP_NAME}
!wget -nc -O {WORKSPACE}/models/vae/{VAE_NAME} \
    {QWEN_2_1}/vae/{VAE_NAME}

!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"Diffusion: {GGUF_NAME}; text encoder: {CLIP_NAME}; VAE: {VAE_NAME}")
