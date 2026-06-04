# Colab cell: set up ComfyUI and download Ideogram 4.0 (fp8) weights.
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and `wget -nc` skips existing files.
#
# Ideogram 4.0 is Ideogram's first open-weight text-to-image model (9.3B,
# native 2K, structured-JSON prompting). ComfyUI added day-0 native support
# in 0.24.0 — no custom nodes are needed; the Comfy-Org repack below is
# publicly downloadable (no HF token).
#
# Upstream references:
#   https://blog.comfy.org/p/ideogram-4-day-0-support-in-comfyui
#   https://huggingface.co/Comfy-Org/Ideogram-4   (diffusion models)
#   https://huggingface.co/Comfy-Org/Qwen3-VL      (text encoder)
#   https://huggingface.co/Comfy-Org/flux2-dev     (VAE)
#   https://github.com/ideogram-oss/ideogram4      (model card / prompting)
#
# A100 (40 GB) recommended. The t2i workflow uses ASYMMETRIC CFG: both a
# conditional and an unconditional diffusion model are loaded (9.28 GB each
# in fp8), plus the 10.6 GB Qwen3-VL text encoder. That is ~29.5 GB of
# weights and ~18.6 GB of diffusion resident during sampling — too much for
# a T4 (15 GB); L4 (24 GB) may work only with aggressive offload.
#
# License: ideogram-non-commercial-model-agreement (NON-COMMERCIAL).
# The model also carries its own safety training; "Image blocked by safety
# filter" comes from the weights, not ComfyUI. Review terms before use.
#
# Verify filenames before running (upstream occasionally renames):
#   https://huggingface.co/Comfy-Org/Ideogram-4/tree/main

USE_GOOGLE_DRIVE   = False
UPDATE_COMFYUI     = True
INSTALL_MANAGER    = True
RESTORE_NODE_DEPS  = True
DOWNLOAD_IDEOGRAM4 = True
# The optional Gemma 4 "JSON Prompt Builder" (turns a short idea into a
# schema-compliant JSON prompt) is NOT needed for image generation — the
# kit's workflow encodes the JSON prompt directly. Flip to True only if you
# plan to wire up that helper yourself (~9 GB extra text encoder).
DOWNLOAD_GEMMA4_PROMPT_BUILDER = False

import os

# --- Workspace location -----------------------------------------------------
# Re-runs in the same Colab session land in `cwd/ComfyUI` from the previous
# `%cd $WORKSPACE`. The main.py check stops a re-run from nesting a fresh
# ComfyUI checkout inside the existing one and re-downloading every weight.
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
# Ideogram 4 nodes (Ideogram4Scheduler / DualModelGuider / CFGOverride /
# EmptyFlux2LatentImage / CLIPLoader type "ideogram4") require ComfyUI
# 0.24.0+. A fresh clone or `git pull` of master satisfies this.
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

if DOWNLOAD_IDEOGRAM4:
    IDEOGRAM4 = "https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main"
    QWEN3VL   = "https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main"
    FLUX2     = "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files"

    # Conditional diffusion model (positive pass) — 9.28 GB.
    !wget -nc -O {WORKSPACE}/models/diffusion_models/ideogram4_fp8_scaled.safetensors \
        {IDEOGRAM4}/diffusion_models/ideogram4_fp8_scaled.safetensors

    # Unconditional diffusion model (negative/text-free pass) — 9.28 GB.
    # Required: the workflow's DualModelGuider runs asymmetric CFG across both.
    !wget -nc -O {WORKSPACE}/models/diffusion_models/ideogram4_unconditional_fp8_scaled.safetensors \
        {IDEOGRAM4}/diffusion_models/ideogram4_unconditional_fp8_scaled.safetensors

    # Text encoder: Qwen3-VL 8B (fp8 scaled) — 10.6 GB.
    !wget -nc -O {WORKSPACE}/models/text_encoders/qwen3vl_8b_fp8_scaled.safetensors \
        {QWEN3VL}/text_encoders/qwen3vl_8b_fp8_scaled.safetensors

    # VAE: shared Flux 2 VAE — 0.34 GB.
    !wget -nc -O {WORKSPACE}/models/vae/flux2-vae.safetensors \
        {FLUX2}/vae/flux2-vae.safetensors

if DOWNLOAD_GEMMA4_PROMPT_BUILDER:
    GEMMA4 = "https://huggingface.co/Comfy-Org/gemma-4/resolve/main"
    !wget -nc -O {WORKSPACE}/models/text_encoders/gemma4_e4b_it_fp8_scaled.safetensors \
        {GEMMA4}/text_encoders/gemma4_e4b_it_fp8_scaled.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
