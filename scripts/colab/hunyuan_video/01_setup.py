# Colab cell: set up ComfyUI and download Hunyuan Video T2V weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# The diffusion model ships only as bf16 (~25.6GB); ComfyUI quantizes it to
# fp8 at load via `weight_dtype: "fp8_e4m3fn"` in the workflow's UNETLoader,
# so VRAM usage drops to ~13GB and fits on L4 24GB. Total disk is ~35GB.
#
# Verify filenames before running (Comfy-Org occasionally renames):
#   https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged
# Reference workflow: https://comfyanonymous.github.io/ComfyUI_examples/hunyuan_video/

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

HV_BASE = "https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files"

# Diffusion model: bf16, ~25.6GB on disk; loaded as fp8 via UNETLoader weight_dtype.
!wget -nc -O {WORKSPACE}/models/diffusion_models/hunyuan_video_t2v_720p_bf16.safetensors \
    {HV_BASE}/diffusion_models/hunyuan_video_t2v_720p_bf16.safetensors
# VAE
!wget -nc -O {WORKSPACE}/models/vae/hunyuan_video_vae_bf16.safetensors \
    {HV_BASE}/vae/hunyuan_video_vae_bf16.safetensors
# Text encoders: clip_l + llava_llama3_fp8_scaled (DualCLIPLoader type=hunyuan_video).
!wget -nc -O {WORKSPACE}/models/text_encoders/clip_l.safetensors \
    {HV_BASE}/text_encoders/clip_l.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/llava_llama3_fp8_scaled.safetensors \
    {HV_BASE}/text_encoders/llava_llama3_fp8_scaled.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
