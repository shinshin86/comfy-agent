# Colab cell: set up ComfyUI and download Z-Anime weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Z-Anime is an anime-style full fine-tune of Z-Image (S3-DiT 6B) by SeeSee21:
#   https://huggingface.co/SeeSee21/Z-Anime
# Apache 2.0. Same Qwen 3 4B text encoder + Z-Image VAE as the upstream
# `z_image` kit — the architecture is identical, only the UNet differs.
#
# Defaults to fp8 variants so the kit fits on a T4 runtime (~10 GB total
# weights: 6 GB UNet + 4 GB encoder + 168 MB VAE). Toggle DOWNLOAD_DISTILL_8STEP
# to also pull the 8-step distilled checkpoint for fast iterations (cfg 1.0).
#
# Verify filenames before running (upstream occasionally renames):
#   https://huggingface.co/SeeSee21/Z-Anime/tree/main

USE_GOOGLE_DRIVE       = False
UPDATE_COMFYUI         = True
INSTALL_MANAGER        = True
RESTORE_NODE_DEPS      = True
DOWNLOAD_BASE          = True   # z-anime-base-fp8 (~6 GB) — recommended starter
DOWNLOAD_DISTILL_8STEP = False  # z-anime-distill-8step-fp8 (~6 GB extra), 8-step

import os

# --- Workspace location -----------------------------------------------------
if USE_GOOGLE_DRIVE:
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    os.chdir('/content/drive/MyDrive')
else:
    WORKSPACE = f"{os.getcwd()}/ComfyUI"

# --- ComfyUI checkout -------------------------------------------------------
if not os.path.isdir(WORKSPACE):
    !git clone https://github.com/comfyanonymous/ComfyUI {WORKSPACE}
%cd {WORKSPACE}
if UPDATE_COMFYUI:
    !git pull

# --- Python dependencies ----------------------------------------------------
!pip3 install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
!pip3 install -q accelerate einops 'transformers>=4.28.1' 'safetensors>=0.4.2' \
    aiohttp pyyaml Pillow scipy tqdm psutil 'tokenizers>=0.13.3'
!pip3 install -q torchsde 'kornia>=0.7.1' spandrel soundfile sentencepiece av
# blake3 / comfy_aimdo / comfy_kitchen / simpleeval: required by recent ComfyUI main.py.
!pip3 install -q blake3 comfy_aimdo comfy_kitchen simpleeval
# ComfyUI 0.20+ requires comfyui-workflow-templates / comfyui-embedded-docs from
# its requirements.txt — without this the server fails to start.
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

Z_ANIME_BASE = "https://huggingface.co/SeeSee21/Z-Anime/resolve/main"

# Shared text encoder (qwen_3_4b fp8) and VAE — used by every Z-Anime variant.
!wget -nc -O {WORKSPACE}/models/text_encoders/qwen_3_4b-fp8.safetensors \
    {Z_ANIME_BASE}/text_encoder/qwen_3_4b-fp8.safetensors
!wget -nc -O {WORKSPACE}/models/vae/ae.safetensors \
    {Z_ANIME_BASE}/vae/ae.safetensors

if DOWNLOAD_BASE:
    # Z-Anime base fp8: ~6 GB. Recommended starter (28–50 steps, cfg 3.0–5.0).
    !wget -nc -O {WORKSPACE}/models/diffusion_models/z-anime-base-fp8.safetensors \
        {Z_ANIME_BASE}/diffusion_models/z-anime-base-fp8.safetensors

if DOWNLOAD_DISTILL_8STEP:
    # Distilled 8-step fp8: ~6 GB. Fast iterations (8 steps, cfg 1.0).
    !wget -nc -O {WORKSPACE}/models/diffusion_models/z-anime-distill-8step-fp8.safetensors \
        {Z_ANIME_BASE}/diffusion_models/z-anime-distill-8step-fp8.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
