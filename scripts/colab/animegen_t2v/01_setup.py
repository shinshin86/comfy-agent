# Colab cell: set up ComfyUI and download AnimeGen-T2V weights (A100 required).
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# AnimeGen-T2V (aidealab/AnimeGen-T2V) is an anime-style fine-tune of
# Wan 2.2 T2V A14B. It ships the two expert unets ONLY, as full bf16
# weights (~28.6 GB each, ~57 GB total). It reuses the standard Wan 2.2
# text encoder (umt5-xxl) and the Wan 2.1 VAE, which we pull from the
# Comfy-Org repack (no HF token needed).
#
# Two workflows are provided:
#   - animegen_t2v.json           : plain dual-expert, 20 steps (no LoRA)
#   - animegen_t2v_lightning.json : + lightx2v 4-step Lightning LoRA, 8 steps
# Set DOWNLOAD_LIGHTNING_LORA below to fetch the LoRA for the fast path.
#
# Verify filenames before running (upstream occasionally renames):
#   https://huggingface.co/aidealab/AnimeGen-T2V
#   https://huggingface.co/lightx2v/Wan2.2-Lightning
#   https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged

USE_GOOGLE_DRIVE       = False
UPDATE_COMFYUI         = True
INSTALL_MANAGER        = True
RESTORE_NODE_DEPS      = True
DOWNLOAD_LIGHTNING_LORA = True

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
for sub in ('diffusion_models', 'vae', 'text_encoders', 'loras'):
    os.makedirs(f"{WORKSPACE}/models/{sub}", exist_ok=True)

ANIMEGEN_BASE = "https://huggingface.co/aidealab/AnimeGen-T2V/resolve/main"
WAN_REPACK    = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files"
LIGHTNING     = "https://huggingface.co/lightx2v/Wan2.2-Lightning/resolve/main/Wan2.2-T2V-A14B-4steps-lora-250928"

# AnimeGen expert unets (full bf16, ~28.6 GB each). high_noise = early steps,
# low_noise = late steps. These are the fine-tuned weights.
!wget -nc -O {WORKSPACE}/models/diffusion_models/animegen_t2v_high_noise.safetensors \
    {ANIMEGEN_BASE}/high_noise.safetensors
!wget -nc -O {WORKSPACE}/models/diffusion_models/animegen_t2v_low_noise.safetensors \
    {ANIMEGEN_BASE}/low_noise.safetensors

# Shared Wan 2.2 text encoder (umt5-xxl) + Wan 2.1 VAE (Comfy-Org repack).
!wget -nc -O {WORKSPACE}/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
    {WAN_REPACK}/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/vae/wan_2.1_vae.safetensors \
    {WAN_REPACK}/vae/wan_2.1_vae.safetensors

if DOWNLOAD_LIGHTNING_LORA:
    # lightx2v 4-step Lightning LoRA for Wan 2.2 T2V A14B. Enables the
    # 8-step fast path (animegen_t2v_lightning.json). Small (~1-2.5 GB each).
    !wget -nc -O {WORKSPACE}/models/loras/wan2.2_t2v_lightning_4steps_high_noise.safetensors \
        {LIGHTNING}/high_noise_model.safetensors
    !wget -nc -O {WORKSPACE}/models/loras/wan2.2_t2v_lightning_4steps_low_noise.safetensors \
        {LIGHTNING}/low_noise_model.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
