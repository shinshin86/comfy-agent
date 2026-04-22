# Colab cell: set up ComfyUI and download Qwen-Image-Edit weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Qwen-Image-Edit is Alibaba's image-editing variant of Qwen-Image. The
# 2511 bf16 checkpoint (~40 GB) is the latest and highest quality; 2509
# fp8 (~20 GB) is lighter. Text encoder (Qwen2.5-VL 7B fp8 scaled) and
# VAE are shared with the `qwen_image` kit.
#
# Practical GPU targets:
#   - 2511 bf16:  A100 40GB minimum
#   - 2509 fp8:   L4 24GB
#
# Verify filenames before running (upstream occasionally renames):
#   https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/tree/main/split_files
# Reference workflow: https://comfyanonymous.github.io/ComfyUI_examples/qwen_image/

USE_GOOGLE_DRIVE  = False
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True
RESTORE_NODE_DEPS = True

# Only one of these should be True. 2511 bf16 is the latest and highest
# quality; 2509 fp8 is lighter; "default" is the original fp8 release.
USE_QWEN_IMAGE_EDIT_2511_BF16 = True
USE_QWEN_IMAGE_EDIT_2509_FP8  = False
USE_QWEN_IMAGE_EDIT_DEFAULT   = False

# Optional LoRAs.
DOWNLOAD_LIGHTNING_LORA_2511  = False  # 4-step Lightning LoRA for 2511
DOWNLOAD_ANYTHING2REAL_LORA   = False  # stylized->realistic LoRA for Edit 2511
DOWNLOAD_MULTIPLE_ANGLES_LORA = False  # multi-angle LoRA (pulls ComfyUI-qwenmultiangle node)

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
# comfy_kitchen >=0.2.0 is required for Qwen-Image-Edit nodes.
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

EDIT_BASE   = "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files"
SHARED_BASE = "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files"

if USE_QWEN_IMAGE_EDIT_2509_FP8:
    !wget -nc -O {WORKSPACE}/models/diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors \
        {EDIT_BASE}/diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors
elif USE_QWEN_IMAGE_EDIT_DEFAULT:
    !wget -nc -O {WORKSPACE}/models/diffusion_models/qwen_image_edit_fp8_e4m3fn.safetensors \
        {EDIT_BASE}/diffusion_models/qwen_image_edit_fp8_e4m3fn.safetensors
else:
    # Default: 2511 bf16 (~40 GB, A100 recommended)
    !wget -nc -O {WORKSPACE}/models/diffusion_models/qwen_image_edit_2511_bf16.safetensors \
        {EDIT_BASE}/diffusion_models/qwen_image_edit_2511_bf16.safetensors

# Text encoder + VAE are shared with plain Qwen-Image.
!wget -nc -O {WORKSPACE}/models/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors \
    {SHARED_BASE}/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/vae/qwen_image_vae.safetensors \
    {SHARED_BASE}/vae/qwen_image_vae.safetensors

# --- Optional LoRAs --------------------------------------------------------
if DOWNLOAD_LIGHTNING_LORA_2511:
    !wget -nc -O {WORKSPACE}/models/loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors \
        https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors

if DOWNLOAD_ANYTHING2REAL_LORA:
    !wget -nc -O {WORKSPACE}/models/loras/anything2real_2601.safetensors \
        https://huggingface.co/lrzjason/Anything2Real_2601/resolve/main/anything2real_2601.safetensors

if DOWNLOAD_MULTIPLE_ANGLES_LORA:
    angles_node_dir = f"{WORKSPACE}/custom_nodes/ComfyUI-qwenmultiangle"
    if not os.path.isdir(angles_node_dir):
        !git clone https://github.com/jtydhr88/ComfyUI-qwenmultiangle {angles_node_dir}
    else:
        !git -C {angles_node_dir} pull
    !wget -nc -O {WORKSPACE}/models/loras/qwen-image-edit-2511-multiple-angles-lora.safetensors \
        https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA/resolve/main/qwen-image-edit-2511-multiple-angles-lora.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
