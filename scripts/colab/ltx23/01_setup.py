# Colab cell: set up ComfyUI and download LTX-2.3 weights (A100 recommended).
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# LTX-2.3 is a 22B text+image->video model from Lightricks. The dev
# checkpoint alone is ~46 GB on disk, so Colab A100 (40 GB VRAM, 166 GB
# disk) is the minimum realistic target. ComfyUI-LTXVideo streams weights
# via its low_vram loaders when the checkpoint is larger than VRAM.
#
# Verify filenames before running (upstream occasionally renames):
#   https://huggingface.co/Lightricks/LTX-2.3
#   https://huggingface.co/Comfy-Org/ltx-2
# Reference workflow: https://github.com/Comfy-Org/workflow_templates

USE_GOOGLE_DRIVE  = False
UPDATE_COMFYUI    = True
INSTALL_MANAGER   = True
RESTORE_NODE_DEPS = True
DOWNLOAD_LTX_2_3  = True

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
# comfy_kitchen must be >=0.2.0 for LTX-2.x nodes.
!pip3 install -q blake3 comfy_aimdo 'comfy_kitchen>=0.2.0' simpleeval
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

# --- ComfyUI-LTXVideo custom node ------------------------------------------
ltx_node_dir = f"{WORKSPACE}/custom_nodes/ComfyUI-LTXVideo"
if not os.path.isdir(ltx_node_dir):
    !git clone https://github.com/Lightricks/ComfyUI-LTXVideo {ltx_node_dir}
else:
    !git -C {ltx_node_dir} pull
!pip3 install -q -r {ltx_node_dir}/requirements.txt

# --- Model weights ----------------------------------------------------------
for sub in ('checkpoints', 'text_encoders', 'latent_upscale_models', 'loras'):
    os.makedirs(f"{WORKSPACE}/models/{sub}", exist_ok=True)

if DOWNLOAD_LTX_2_3:
    LTX_BASE = "https://huggingface.co/Lightricks/LTX-2.3/resolve/main"
    COMFY_LTX_BASE = "https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files"

    # Dev checkpoint (~46 GB). Swap to ltx-2.3-22b-distilled-1.1 if you want
    # fewer sampling steps at the cost of some quality.
    !wget -nc -O {WORKSPACE}/models/checkpoints/ltx-2.3-22b-dev.safetensors \
        {LTX_BASE}/ltx-2.3-22b-dev.safetensors

    # Text encoder: Comfy-Org repackaged Gemma 3 12B (fp4-mixed, ~7 GB).
    !wget -nc -O {WORKSPACE}/models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors \
        {COMFY_LTX_BASE}/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors

    # Spatial upscaler x2 (used by the two-stage workflow).
    !wget -nc -O {WORKSPACE}/models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.0.safetensors \
        {LTX_BASE}/ltx-2.3-spatial-upscaler-x2-1.0.safetensors

    # Distilled LoRA (applies to the dev checkpoint to cut step count).
    !wget -nc -O {WORKSPACE}/models/loras/ltx-2.3-22b-distilled-lora-384.safetensors \
        {LTX_BASE}/ltx-2.3-22b-distilled-lora-384.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
