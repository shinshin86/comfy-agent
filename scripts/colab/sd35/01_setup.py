# Colab cell: set up ComfyUI and download Stable Diffusion 3.5 Large (fp8 scaled).
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Weights come from the Comfy-Org fp8 repack, which is a public repository with
# no Hugging Face gating (no access request / token needed). The fp8 scaled
# checkpoint bundles the MMDiT model + VAE; the three SD3.5 text encoders
# (clip_l / clip_g / t5xxl) are downloaded separately into models/text_encoders.
#
# License: Stability AI Community License (free for non-commercial use and for
# commercial use under <$1M annual revenue with registration). Review upstream
# terms before redistribution or commercial use.
# Weights:  https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8
# Workflow: https://comfyanonymous.github.io/ComfyUI_examples/sd3/

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
for sub in ('checkpoints', 'text_encoders'):
    os.makedirs(f"{WORKSPACE}/models/{sub}", exist_ok=True)

SD35_BASE = "https://huggingface.co/Comfy-Org/stable-diffusion-3.5-fp8/resolve/main"

# All-in-one MMDiT + VAE checkpoint (~14.9GB).
!wget -nc -O {WORKSPACE}/models/checkpoints/sd3.5_large_fp8_scaled.safetensors \
    {SD35_BASE}/sd3.5_large_fp8_scaled.safetensors

# SD3.5 text encoders (clip_l ~246MB, clip_g ~1.39GB, t5xxl fp8 scaled ~5.16GB).
!wget -nc -O {WORKSPACE}/models/text_encoders/clip_l.safetensors \
    {SD35_BASE}/text_encoders/clip_l.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/clip_g.safetensors \
    {SD35_BASE}/text_encoders/clip_g.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors \
    {SD35_BASE}/text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
