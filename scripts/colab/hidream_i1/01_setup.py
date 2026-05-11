# Colab cell: set up ComfyUI and download HiDream-I1 weights (no HF token).
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# HiDream-I1 is a 17B-parameter open image diffusion model by HiDream.ai (MIT).
# This kit uses the Comfy-Org repack which mirrors the diffusion checkpoints
# plus all four required text encoders (CLIP-L, CLIP-G, T5-XXL fp8, Llama 3.1
# 8B Instruct fp8) and the Flux VAE — none of these require an HF access token.
#
# Default: download the Fast fp8 variant only (~17 GB UNet + ~16 GB encoders +
# ~335 MB VAE ≈ 33 GB total). Toggle DOWNLOAD_DEV / DOWNLOAD_FULL to also pull
# the higher-quality variants. The bf16 versions are ~34 GB each — only enable
# them on A100 runtimes with ample disk.
#
# Verify filenames before running (Comfy-Org occasionally renames variants):
#   https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/tree/main/split_files
# Reference workflow: https://comfyanonymous.github.io/ComfyUI_examples/hidream/

USE_GOOGLE_DRIVE   = False
UPDATE_COMFYUI     = True
INSTALL_MANAGER    = True
RESTORE_NODE_DEPS  = True
DOWNLOAD_FAST_FP8  = True   # hidream_i1_fast_fp8.safetensors (~17 GB) — recommended starter
DOWNLOAD_DEV_FP8   = False  # hidream_i1_dev_fp8.safetensors  (~17 GB)
DOWNLOAD_FULL_FP8  = False  # hidream_i1_full_fp8.safetensors (~17 GB)
DOWNLOAD_FULL_FP16 = False  # hidream_i1_full_fp16.safetensors (~34 GB) — A100 only

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
# blake3 / comfy_aimdo / comfy_kitchen / simpleeval: see z_image kit for rationale.
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

HIDREAM_BASE = "https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files"

# Shared text encoders (4 files, ~16 GB total) and VAE — required by every variant.
!wget -nc -O {WORKSPACE}/models/text_encoders/clip_l_hidream.safetensors \
    {HIDREAM_BASE}/text_encoders/clip_l_hidream.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/clip_g_hidream.safetensors \
    {HIDREAM_BASE}/text_encoders/clip_g_hidream.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors \
    {HIDREAM_BASE}/text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/llama_3.1_8b_instruct_fp8_scaled.safetensors \
    {HIDREAM_BASE}/text_encoders/llama_3.1_8b_instruct_fp8_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/vae/ae.safetensors \
    {HIDREAM_BASE}/vae/ae.safetensors

if DOWNLOAD_FAST_FP8:
    # Fast fp8: ~17 GB. 16 steps, cfg 1.0, sampler `lcm` / scheduler `normal`, shift 3.0.
    !wget -nc -O {WORKSPACE}/models/diffusion_models/hidream_i1_fast_fp8.safetensors \
        {HIDREAM_BASE}/diffusion_models/hidream_i1_fast_fp8.safetensors

if DOWNLOAD_DEV_FP8:
    # Dev fp8: ~17 GB. 28 steps, cfg 1.0, sampler `lcm` / scheduler `normal`, shift 6.0.
    !wget -nc -O {WORKSPACE}/models/diffusion_models/hidream_i1_dev_fp8.safetensors \
        {HIDREAM_BASE}/diffusion_models/hidream_i1_dev_fp8.safetensors

if DOWNLOAD_FULL_FP8:
    # Full fp8: ~17 GB. 50 steps, cfg 5.0, sampler `uni_pc` / scheduler `simple`, shift 3.0.
    !wget -nc -O {WORKSPACE}/models/diffusion_models/hidream_i1_full_fp8.safetensors \
        {HIDREAM_BASE}/diffusion_models/hidream_i1_full_fp8.safetensors

if DOWNLOAD_FULL_FP16:
    # Full fp16: ~34 GB. Highest quality — A100 only.
    !wget -nc -O {WORKSPACE}/models/diffusion_models/hidream_i1_full_fp16.safetensors \
        {HIDREAM_BASE}/diffusion_models/hidream_i1_full_fp16.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
