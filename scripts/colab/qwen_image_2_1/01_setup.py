# Colab cell: set up ComfyUI (master/nightly) and download Qwen-Image 2.1 weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Qwen-Image 2.1 is Alibaba's unified text-to-image + instruction-editing
# model (7B visual generation core, 32 single-stream DiT layers, native 2K
# output, alpha-channel / RGBA generation, up to 10 reference images for
# editing). ComfyUI added day-0 native support — no custom nodes required.
#
# NIGHTLY REQUIRED. Support landed on ComfyUI master on 2026-09-19
# (commit 6bfaacc6, "feat: Qwen-image 2.1 support"); the newest tagged
# release at the time this kit was written is v0.36.0 (2026-09-15) and does
# NOT contain it. This kit therefore tracks master. Desktop/Cloud builds of
# ComfyUI follow stable tags and cannot run these workflows yet.
#
# Upstream references:
#   https://docs.comfy.org/tutorials/image/qwen/qwen-image-2-1
#   https://blog.comfy.org/p/qwen-image-21-in-comfyui-open-weight
#   https://huggingface.co/Comfy-Org/Qwen-Image-2.1   (ComfyUI repack)
#   https://huggingface.co/Qwen/Qwen-Image-2.1        (original + LICENSE)
#
# License: Qwen Research License. "Non-Commercial" is defined upstream as
# research or evaluation purposes only; commercial use needs a separate
# license from the model owner. Review the terms before use. Note that this
# differs from the Apache-2.0 `qwen_image` kit — same family, different terms.
#
# Verify filenames before running (upstream occasionally renames):
#   https://huggingface.co/Comfy-Org/Qwen-Image-2.1/tree/main

USE_GOOGLE_DRIVE  = False
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True
RESTORE_NODE_DEPS = True

# Pin the ComfyUI checkout to a known-good commit instead of tracking master.
# Leave empty to follow master. Fill this in if a master regression breaks the
# kit; the kit's README records the revision each verification run used.
COMFYUI_COMMIT = ""

# Diffusion model. int8_convrot (7.3 GB) is the default and matches the
# bundled workflows; bf16 (14.2 GB) is the full-precision variant for A100.
USE_QWEN_IMAGE_2_1_INT8 = True
USE_QWEN_IMAGE_2_1_BF16 = False

# Text encoder (Qwen3-VL 8B). "int8" (9.3 GB) matches the bundled workflows.
# "bf16" (17.5 GB) is full precision; "w4a8" (6.3 GB) is the lowest-VRAM one.
# Switching this means updating `clip_name` in the workflow JSON as well.
TEXT_ENCODER_VARIANT = "int8"   # "int8" | "bf16" | "w4a8"

import os

# --- Workspace location -----------------------------------------------------
# Re-runs in the same Colab session land in `cwd/ComfyUI` from the previous
# `%cd $WORKSPACE`. The main.py check stops a re-run from nesting a fresh
# ComfyUI checkout inside the existing one and re-downloading every weight.
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

# --- ComfyUI checkout -------------------------------------------------------
if not os.path.isdir(WORKSPACE):
    !git clone https://github.com/comfyanonymous/ComfyUI {WORKSPACE}
%cd {WORKSPACE}
if UPDATE_COMFYUI:
    !git pull
if COMFYUI_COMMIT:
    !git checkout {COMFYUI_COMMIT}

# --- Nightly check ----------------------------------------------------------
# Fail loudly here rather than after a ~17 GB download: the three 2.1 nodes
# live in comfy_extras/nodes_qwen.py, so their absence means the checkout
# predates the 2026-09-19 support commit.
_qwen_nodes = os.path.join(WORKSPACE, "comfy_extras", "nodes_qwen.py")
_has_2_1 = False
if os.path.isfile(_qwen_nodes):
    with open(_qwen_nodes, encoding="utf-8") as fh:
        _has_2_1 = "TextEncodeQwenImage21" in fh.read()
if _has_2_1:
    print("ComfyUI checkout provides TextEncodeQwenImage21 / QwenImage21Cache.")
else:
    raise SystemExit(
        "This ComfyUI checkout has no Qwen-Image 2.1 nodes. Re-run with "
        "UPDATE_COMFYUI = True and COMFYUI_COMMIT = \"\" to track master, "
        "or update the pinned commit."
    )

# --- Python dependencies ----------------------------------------------------
!pip3 install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
!pip3 install -q accelerate einops 'transformers>=4.45' 'safetensors>=0.4.2' \
    aiohttp pyyaml Pillow scipy tqdm psutil 'tokenizers>=0.13.3'
!pip3 install -q torchsde 'kornia>=0.7.1' spandrel soundfile sentencepiece av
# blake3 / comfy_aimdo / comfy_kitchen / simpleeval: required by recent ComfyUI main.py.
!pip3 install -q blake3 comfy_aimdo comfy_kitchen simpleeval
# ComfyUI 0.20+ requires comfyui-workflow-templates / comfyui-embedded-docs from
# its requirements.txt — without this the server fails to start. It also pins
# the comfy-kitchen build that supplies the int8 convrot quantized kernels, so
# this install must come AFTER the loose comfy_kitchen line above.
!pip3 install -q -r {WORKSPACE}/requirements.txt

# --- ComfyUI-Manager (optional) --------------------------------------------
if INSTALL_MANAGER:
    manager_dir = f"{WORKSPACE}/custom_nodes/ComfyUI-Manager"
    if not os.path.isdir(manager_dir):
        !git clone https://github.com/ltdrdata/ComfyUI-Manager {manager_dir}
    else:
        !git -C {manager_dir} pull
    if RESTORE_NODE_DEPS:
        !pip3 install -q GitPython
        !python {manager_dir}/cm-cli.py restore-dependencies

# --- Model weights ----------------------------------------------------------
for sub in ('diffusion_models', 'vae', 'text_encoders'):
    os.makedirs(f"{WORKSPACE}/models/{sub}", exist_ok=True)

QWEN_2_1 = "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main"

TEXT_ENCODERS = {
    "int8": "qwen3vl_8b_int8_convrot.safetensors",   #  9.35 GB
    "bf16": "qwen3vl_8b_bf16.safetensors",           # 17.53 GB
    "w4a8": "qwen3vl_8b_w4a8.safetensors",           #  6.31 GB
}
if TEXT_ENCODER_VARIANT not in TEXT_ENCODERS:
    raise SystemExit(f"TEXT_ENCODER_VARIANT must be one of {sorted(TEXT_ENCODERS)}")
CLIP_NAME = TEXT_ENCODERS[TEXT_ENCODER_VARIANT]

# Diffusion model — int8 convrot (7.26 GB), the workflows' default.
if USE_QWEN_IMAGE_2_1_INT8:
    !wget -nc -O {WORKSPACE}/models/diffusion_models/qwen_image_2.1_int8_convrot.safetensors \
        {QWEN_2_1}/diffusion_models/qwen_image_2.1_int8_convrot.safetensors

# Diffusion model — bf16 (14.23 GB), full precision.
if USE_QWEN_IMAGE_2_1_BF16:
    !wget -nc -O {WORKSPACE}/models/diffusion_models/qwen_image_2.1_bf16.safetensors \
        {QWEN_2_1}/diffusion_models/qwen_image_2.1_bf16.safetensors

# Text encoder — Qwen3-VL 8B, loaded through CLIPLoader with type "qwen_image".
!wget -nc -O {WORKSPACE}/models/text_encoders/{CLIP_NAME} \
    {QWEN_2_1}/text_encoders/{CLIP_NAME}

# VAE — 0.68 GB, four channels (this is what carries the alpha channel).
!wget -nc -O {WORKSPACE}/models/vae/qwen_image_2.1_vae_bf16.safetensors \
    {QWEN_2_1}/vae/qwen_image_2.1_vae_bf16.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"Text encoder: {CLIP_NAME}")
if TEXT_ENCODER_VARIANT != "int8" or USE_QWEN_IMAGE_2_1_BF16:
    print("Non-default variant selected — update `unet_name` / `clip_name` in "
          "the kit's workflow JSON to match the filenames above.")
