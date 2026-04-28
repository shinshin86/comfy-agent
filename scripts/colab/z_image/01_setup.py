# Colab cell: set up ComfyUI and download Z-Image turbo weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.

USE_GOOGLE_DRIVE  = False   # persist to /content/drive/MyDrive/ComfyUI
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True    # ComfyUI-Manager GUI helper (optional for headless use)
RESTORE_NODE_DEPS = True    # only applies when INSTALL_MANAGER is True

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
# Split into groups so a failure points at the right bucket.
# 1) PyTorch: use the cu121 wheels that match Colab's current GPU drivers.
!pip3 install -q torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
# 2) ComfyUI core runtime deps (kept loose; upstream tracks these in requirements.txt).
!pip3 install -q accelerate einops 'transformers>=4.28.1' 'safetensors>=0.4.2' \
    aiohttp pyyaml Pillow scipy tqdm psutil 'tokenizers>=0.13.3'
!pip3 install -q torchsde 'kornia>=0.7.1' spandrel soundfile sentencepiece av
# 3) Recent ComfyUI main.py imports these but they are missing from the upstream
#    Colab template, which causes a hard crash at server startup:
#      blake3 → content hashing
#      comfy_aimdo / comfy_kitchen → fp8 quantization backend
#      simpleeval → nodes_math.py
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

Z_BASE = "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files"
!wget -nc -O {WORKSPACE}/models/diffusion_models/z_image_turbo_bf16.safetensors {Z_BASE}/diffusion_models/z_image_turbo_bf16.safetensors
!wget -nc -O {WORKSPACE}/models/vae/ae.safetensors                              {Z_BASE}/vae/ae.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/qwen_3_4b.safetensors             {Z_BASE}/text_encoders/qwen_3_4b.safetensors

# --- cloudflared (used by 02_start_comfyui.py to expose ComfyUI publicly) ---
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
