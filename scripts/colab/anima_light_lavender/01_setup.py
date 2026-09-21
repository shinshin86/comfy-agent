# Colab cell: set up ComfyUI and download Anima-Light-Lavender weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Anima-Light-Lavender is a post-train of Anima Base v1.0 by Johnny-Z, aimed
# at natural-language descriptions at the 512-token scale. The architecture
# is unchanged from Anima Base (~2B, 28-layer DiT, itself a derivative of
# NVIDIA Cosmos-Predict2-2B-Text2Image), so the same Qwen 3 0.6B text encoder
# and Qwen-Image VAE are reused at inference. Total weights ~5.6 GB; fits a
# T4 runtime.
#
# Upstream references:
#   https://huggingface.co/Johnny-Z/Anima-Light-Lavender   (this post-train)
#   https://huggingface.co/circlestone-labs/Anima          (Anima Base v1.0, encoder + VAE)
#
# License: inherits the CircleStone Labs Non-Commercial License v1.0 from
# Anima Base, and as a Cosmos-Predict2 derivative it is also subject to the
# NVIDIA Open Model License Agreement. **Non-commercial use only.** Review
# the LICENSE files in both upstream repos before redistribution.

USE_GOOGLE_DRIVE  = False
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True
RESTORE_NODE_DEPS = True

# Weight variant. BF16 (4.18 GB) is the default and what the bundled workflow
# references. The MXFP8 file (2.84 GB) is smaller but buys nothing on Colab:
# ComfyUI's supports_mxfp8_compute() requires an NVIDIA GPU of compute
# capability 10.0+ (Blackwell) and torch >= 2.10, and Colab's T4 (7.5),
# L4 (8.9) and A100 (8.0) all fall short. Flip only on Blackwell hardware,
# and update `unet_name` in the workflow JSON to match.
USE_ANIMA_LIGHT_LAVENDER_BF16  = True
USE_ANIMA_LIGHT_LAVENDER_MXFP8 = False

import os

# --- Workspace location -----------------------------------------------------
# Re-runs in the same Colab session land in `cwd/ComfyUI` from the previous
# `%cd $WORKSPACE`. Without the main.py check, a re-run would nest a fresh
# ComfyUI checkout inside the existing one and re-download every weight.
_cwd = os.getcwd()
if USE_GOOGLE_DRIVE:
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    os.chdir('/content/drive/MyDrive')
elif os.path.isfile(os.path.join(_cwd, "main.py")):
    WORKSPACE = _cwd
else:
    WORKSPACE = f"{_cwd}/ComfyUI"

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

# Anima-Light-Lavender diffusion model — the only file unique to this kit.
LIGHT_LAVENDER = "https://huggingface.co/Johnny-Z/Anima-Light-Lavender/resolve/main"

if USE_ANIMA_LIGHT_LAVENDER_BF16:
    !wget -nc -O {WORKSPACE}/models/diffusion_models/anima-light-lavender.safetensors \
        {LIGHT_LAVENDER}/anima-light-lavender.safetensors

if USE_ANIMA_LIGHT_LAVENDER_MXFP8:
    !wget -nc -O {WORKSPACE}/models/diffusion_models/anima-light-lavender_mxfp8.safetensors \
        {LIGHT_LAVENDER}/anima-light-lavender_mxfp8.safetensors

# Text encoder + VAE come from upstream Anima Base. If you have already run
# the `anima`, `ooo_anima` or `anima_pencil` kit in this session these files
# are reused (wget -nc skips).
ANIMA_BASE = "https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files"
!wget -nc -O {WORKSPACE}/models/text_encoders/qwen_3_06b_base.safetensors \
    {ANIMA_BASE}/text_encoders/qwen_3_06b_base.safetensors
!wget -nc -O {WORKSPACE}/models/vae/qwen_image_vae.safetensors \
    {ANIMA_BASE}/vae/qwen_image_vae.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
