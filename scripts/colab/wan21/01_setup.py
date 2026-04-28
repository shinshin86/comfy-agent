# Colab cell: set up ComfyUI and download Wan 2.1 T2V weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Covers both T2V 1.3B fp16 (lightweight, fits on T4/L4) and T2V 14B fp8_scaled
# (higher quality, fits on L4 24GB). Toggle the DOWNLOAD_* flags to skip
# variants you don't need.
#
# Verify filenames before running (Comfy-Org occasionally renames):
#   https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged
# Reference workflows: https://comfyanonymous.github.io/ComfyUI_examples/wan/

USE_GOOGLE_DRIVE  = False
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True
RESTORE_NODE_DEPS = True
DOWNLOAD_T2V_1_3B = True
DOWNLOAD_T2V_14B  = False   # ~14GB extra; flip on if you have L4+ headroom

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

WAN_BASE = "https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files"

# Shared text encoder (umt5-xxl) and VAE — used by every Wan 2.1 variant.
!wget -nc -O {WORKSPACE}/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
    {WAN_BASE}/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/vae/wan_2.1_vae.safetensors \
    {WAN_BASE}/vae/wan_2.1_vae.safetensors

if DOWNLOAD_T2V_1_3B:
    # T2V 1.3B fp16: ~2.8GB. The lightest Wan 2.1 model — runs on T4/L4
    # comfortably and is the recommended first test.
    !wget -nc -O {WORKSPACE}/models/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors \
        {WAN_BASE}/diffusion_models/wan2.1_t2v_1.3B_fp16.safetensors

if DOWNLOAD_T2V_14B:
    # T2V 14B fp8_scaled: ~14GB. Higher quality, fits on L4 24GB or larger.
    # fp8_scaled is the best fp8 variant per upstream quality ranking.
    !wget -nc -O {WORKSPACE}/models/diffusion_models/wan2.1_t2v_14B_fp8_scaled.safetensors \
        {WAN_BASE}/diffusion_models/wan2.1_t2v_14B_fp8_scaled.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
