# Colab cell: set up ComfyUI and download OOO_Anima v10 weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# OOO_Anima v10 is a community fine-tune of Anima Base v1.0 by oron1208,
# trained on ~53k images with kohya's sd-scripts. Architecture is inherited
# from Anima Base (a Cosmos-Predict2-2B-Text2Image derivative published by
# circlestone-labs), so the same Qwen 3 0.6B text encoder and Qwen-Image
# VAE are reused at inference. Total weights ~5.6 GB; fits a T4 runtime.
#
# Upstream references:
#   https://huggingface.co/oron1208/OOO_Anima            (this fine-tune)
#   https://huggingface.co/circlestone-labs/Anima        (Anima Base v1.0, encoder + VAE)
#
# License: OOO_Anima inherits the CircleStone Labs Non-Commercial License
# v1.0 from Anima Base. **Non-commercial use only.** Review the LICENSE
# files in both upstream repos before any redistribution or commercial use.

USE_GOOGLE_DRIVE  = False
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True
RESTORE_NODE_DEPS = True

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

# OOO_Anima diffusion model (4.2 GB) — the only file unique to this kit.
OOO_ANIMA = "https://huggingface.co/oron1208/OOO_Anima/resolve/main"
!wget -nc -O {WORKSPACE}/models/diffusion_models/OOO_Anima_v10.safetensors \
    {OOO_ANIMA}/model/OOO_Anima_v10.safetensors

# Text encoder + VAE come from upstream Anima Base. If you have already run
# the `anima` kit in this session these files are reused (wget -nc skips).
ANIMA_BASE = "https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files"
!wget -nc -O {WORKSPACE}/models/text_encoders/qwen_3_06b_base.safetensors \
    {ANIMA_BASE}/text_encoders/qwen_3_06b_base.safetensors
!wget -nc -O {WORKSPACE}/models/vae/qwen_image_vae.safetensors \
    {ANIMA_BASE}/vae/qwen_image_vae.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
