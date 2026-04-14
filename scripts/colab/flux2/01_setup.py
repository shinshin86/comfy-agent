# Colab cell 1/2 for Flux 2 (black-forest-labs/flux2) on A100.
# Installs ComfyUI + downloads Flux 2 dev weights from the Comfy-Org repack.
# Paste into a Colab cell. Idempotent-ish (wget -nc).
#
# IMPORTANT: Verify filenames against the current Comfy-Org HF repo before
# running, since BFL/Comfy-Org periodically rename quantized variants:
#   https://huggingface.co/Comfy-Org/flux2_ComfyUI_repackaged/tree/main
# ComfyUI reference workflow: https://comfyanonymous.github.io/ComfyUI_examples/flux2/

OPTIONS = {
    'USE_GOOGLE_DRIVE': False,
    'UPDATE_COMFY_UI': True,
    'USE_COMFYUI_MANAGER': True,
    'INSTALL_CUSTOM_NODES_DEPENDENCIES': True,
}

current_dir = !pwd
WORKSPACE = f"{current_dir[0]}/ComfyUI"

if OPTIONS['USE_GOOGLE_DRIVE']:
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    %cd /content/drive/MyDrive

![ ! -d $WORKSPACE ] && echo -= Initial setup ComfyUI =- && git clone https://github.com/comfyanonymous/ComfyUI
%cd $WORKSPACE

if OPTIONS['UPDATE_COMFY_UI']:
    !git pull


!pip3 install accelerate einops 'transformers>=4.45' 'safetensors>=0.4.2' aiohttp pyyaml Pillow scipy tqdm psutil 'tokenizers>=0.13.3'
!pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
!pip3 install torchsde 'kornia>=0.7.1' spandrel soundfile sentencepiece av
!pip install blake3 comfy_aimdo comfy_kitchen simpleeval

if OPTIONS['USE_COMFYUI_MANAGER']:
    %cd custom_nodes
    ![ ! -d ComfyUI-Manager ] && git clone https://github.com/ltdrdata/ComfyUI-Manager
    %cd ComfyUI-Manager
    !git pull
%cd $WORKSPACE

if OPTIONS['INSTALL_CUSTOM_NODES_DEPENDENCIES']:
    !pip install GitPython
    !python custom_nodes/ComfyUI-Manager/cm-cli.py restore-dependencies

!mkdir -p $WORKSPACE/models/diffusion_models $WORKSPACE/models/vae $WORKSPACE/models/text_encoders

# --- Flux 2 dev weights (Comfy-Org fp8 repack; matches the official ComfyUI example) ---
FLUX2_BASE = "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files"
!wget -nc -O $WORKSPACE/models/diffusion_models/flux2_dev_fp8mixed.safetensors    $FLUX2_BASE/diffusion_models/flux2_dev_fp8mixed.safetensors
!wget -nc -O $WORKSPACE/models/vae/flux2-vae.safetensors                          $FLUX2_BASE/vae/flux2-vae.safetensors
!wget -nc -O $WORKSPACE/models/text_encoders/mistral_3_small_flux2_fp8.safetensors \
    $FLUX2_BASE/text_encoders/mistral_3_small_flux2_fp8.safetensors

!wget -nc -P ~ https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i ~/cloudflared-linux-amd64.deb || true

print("Setup done. WORKSPACE =", WORKSPACE)
