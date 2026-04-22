# Colab cell: set up ComfyUI and download Qwen-Image weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Qwen-Image is Alibaba's open text-to-image model. The 2512 fp8 variant
# (~20 GB) is the recommended default; 2512 bf16 (~40 GB) is for VRAM-rich
# runtimes. Text encoder (Qwen2.5-VL 7B fp8 scaled, ~7.6 GB) and VAE
# (~254 MB) are shared with the `qwen_image_edit` kit.
#
# Practical GPU targets:
#   - fp8:  L4 24GB minimum (T4 16GB is tight and not recommended)
#   - bf16: A100 40GB
#
# Verify filenames before running (upstream occasionally renames):
#   https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/tree/main/split_files
# Reference workflow: https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/

USE_GOOGLE_DRIVE  = False
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True
RESTORE_NODE_DEPS = True

# Only one of these should be True. fp8 is the default.
USE_QWEN_IMAGE_2512_FP8  = True
USE_QWEN_IMAGE_2512_BF16 = False

# Optional 4-step Lightning LoRA (distilled sampler for faster generation).
DOWNLOAD_LIGHTNING_LORA = False

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
!pip3 install -q accelerate einops 'transformers>=4.45' 'safetensors>=0.4.2' \
    aiohttp pyyaml Pillow scipy tqdm psutil 'tokenizers>=0.13.3'
!pip3 install -q torchsde 'kornia>=0.7.1' spandrel soundfile sentencepiece av
# blake3 / comfy_aimdo / comfy_kitchen / simpleeval: required by recent ComfyUI main.py.
# comfy_kitchen >=0.2.0 matches the version pinned by the qwen_image_edit kit.
!pip3 install -q blake3 comfy_aimdo 'comfy_kitchen>=0.2.0' simpleeval

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
for sub in ('diffusion_models', 'vae', 'text_encoders', 'loras'):
    os.makedirs(f"{WORKSPACE}/models/{sub}", exist_ok=True)

QWEN_IMAGE_BASE = "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files"

if USE_QWEN_IMAGE_2512_BF16:
    !wget -nc -O {WORKSPACE}/models/diffusion_models/qwen_image_2512_bf16.safetensors \
        {QWEN_IMAGE_BASE}/diffusion_models/qwen_image_2512_bf16.safetensors
else:
    # Default: 2512 fp8 (~20 GB)
    !wget -nc -O {WORKSPACE}/models/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors \
        {QWEN_IMAGE_BASE}/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors

!wget -nc -O {WORKSPACE}/models/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors \
    {QWEN_IMAGE_BASE}/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/vae/qwen_image_vae.safetensors \
    {QWEN_IMAGE_BASE}/vae/qwen_image_vae.safetensors

if DOWNLOAD_LIGHTNING_LORA:
    !wget -nc -O {WORKSPACE}/models/loras/Qwen-Image-Lightning-4steps-V1.0.safetensors \
        https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Lightning-4steps-V1.0.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
