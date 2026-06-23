# Colab cell: set up ComfyUI and download Krea 2 (Turbo, fp8) weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Krea 2 is an image generation model by Krea.ai, trained from scratch and
# released under a permissive community license:
#   https://huggingface.co/buckets/krea-community/krea-2
# ComfyUI 0.25.0+ supports Krea 2 natively (no custom nodes). Krea 2 is
# built on the Qwen-Image stack: it pairs a Qwen3-VL text encoder
# (CLIPLoader type "krea2") with the Qwen-Image VAE.
#
# This kit uses the community fp8 Turbo repack (8-step distilled, ~12.9 GB)
# so it fits an L4 24 GB runtime. Verify filenames before running
# (upstream occasionally renames):
#   https://huggingface.co/AlperKTS/Krea2_FP8/tree/main

USE_GOOGLE_DRIVE  = False
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True
RESTORE_NODE_DEPS = True

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

# Diffusion model: Krea 2 Turbo, fp8 community repack (~12.9 GB).
!wget -nc -O {WORKSPACE}/models/diffusion_models/krea2_turbo_fp8.safetensors \
    https://huggingface.co/AlperKTS/Krea2_FP8/resolve/main/krea2_turbo_fp8.safetensors
# Text encoder: Qwen3-VL 4B, fp8 scaled (Comfy-Org repack, no HF token).
!wget -nc -O {WORKSPACE}/models/text_encoders/qwen3vl_4b_fp8_scaled.safetensors \
    https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors
# VAE: Qwen-Image VAE (Comfy-Org repack, 254 MB, no HF token).
!wget -nc -O {WORKSPACE}/models/vae/qwen_image_vae.safetensors \
    https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
