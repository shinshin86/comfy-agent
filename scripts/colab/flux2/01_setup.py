# Colab cell: set up ComfyUI and download Flux 2 [dev] weights (A100 recommended).
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Flux 2 [dev] is distributed under a non-commercial license by BFL. Verify
# the current filenames on the Comfy-Org HF repo before running — BFL/Comfy-Org
# occasionally rename quantized variants:
#   https://huggingface.co/Comfy-Org/flux2-dev/tree/main
# Reference workflow: https://comfyanonymous.github.io/ComfyUI_examples/flux2/

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
# blake3 / comfy_aimdo / comfy_kitchen / simpleeval: see z_image kit for rationale.
# Flux 2 specifically requires comfy_kitchen (fp8mixed quantization).
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

FLUX2_BASE = "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files"
!wget -nc -O {WORKSPACE}/models/diffusion_models/flux2_dev_fp8mixed.safetensors   {FLUX2_BASE}/diffusion_models/flux2_dev_fp8mixed.safetensors
!wget -nc -O {WORKSPACE}/models/vae/flux2-vae.safetensors                         {FLUX2_BASE}/vae/flux2-vae.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/mistral_3_small_flux2_fp8.safetensors {FLUX2_BASE}/text_encoders/mistral_3_small_flux2_fp8.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
