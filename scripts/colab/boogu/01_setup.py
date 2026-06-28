# Colab cell: set up ComfyUI and download Boogu-Image Turbo weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Boogu-Image is an image generation/editing model, not a video model.
# ComfyUI supports it natively in recent builds, so this kit does not install
# the legacy ComfyUI-Boogu custom node.
#
# This starter downloads the official Boogu Turbo fp8 text-to-image stack:
#   - boogu_image_turbo_fp8_scaled.safetensors
#   - qwen3vl_8b_fp8_scaled.safetensors
#   - ae.safetensors (Flux VAE used by the official workflow template)
# Verified on Colab L4 for 1024x1024, 4 steps, batch 1.
#
# Verify filenames before running (upstream may rename):
#   https://huggingface.co/Comfy-Org/Boogu-Image/tree/main
#   https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_boogu_image_0_1_turbo_t2i.json

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
!pip3 install -q accelerate einops 'transformers>=4.57.0' 'safetensors>=0.4.2' \
    aiohttp pyyaml Pillow scipy tqdm psutil 'tokenizers>=0.13.3'
!pip3 install -q torchsde 'kornia>=0.7.1' spandrel soundfile sentencepiece av
# blake3 / comfy_aimdo / comfy_kitchen / simpleeval: required by recent ComfyUI main.py.
!pip3 install -q blake3 comfy_aimdo 'comfy_kitchen>=0.2.0' simpleeval
# ComfyUI 0.20+ requires comfyui-workflow-templates / comfyui-embedded-docs from
# its requirements.txt - without this the server fails to start.
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

BOOGU = "https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main"
HIDREAM = "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files"

!wget -nc -O {WORKSPACE}/models/diffusion_models/boogu_image_turbo_fp8_scaled.safetensors \
    {BOOGU}/diffusion_models/boogu_image_turbo_fp8_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/qwen3vl_8b_fp8_scaled.safetensors \
    {BOOGU}/text_encoders/qwen3vl_8b_fp8_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/vae/ae.safetensors \
    {HIDREAM}/vae/ae.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
