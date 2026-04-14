# Colab cell 1/2: Install ComfyUI and download Z-Image turbo models.
# Run this once per Colab session. Safe to re-run (idempotent-ish).
# Paste this into a Colab notebook cell as-is (contains ! and % magics).

from pathlib import Path

OPTIONS = {
    'USE_GOOGLE_DRIVE': False,
    'UPDATE_COMFY_UI': True,
    'USE_COMFYUI_MANAGER': True,
    'INSTALL_CUSTOM_NODES_DEPENDENCIES': True,
}

current_dir = !pwd
WORKSPACE = f"{current_dir[0]}/ComfyUI"

if OPTIONS['USE_GOOGLE_DRIVE']:
    !echo "Mounting Google Drive..."
    %cd /
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    %cd /content/drive/MyDrive

![ ! -d $WORKSPACE ] && echo -= Initial setup ComfyUI =- && git clone https://github.com/comfyanonymous/ComfyUI
%cd $WORKSPACE

if OPTIONS['UPDATE_COMFY_UI']:
    !echo -= Updating ComfyUI =-
    !git pull

!echo -= Install dependencies =-
!pip3 install accelerate
!pip3 install einops transformers>=4.28.1 safetensors>=0.4.2 aiohttp pyyaml Pillow scipy tqdm psutil tokenizers>=0.13.3
!pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
!pip3 install torchsde
!pip3 install kornia>=0.7.1 spandrel soundfile sentencepiece
!pip install av
# Required by recent ComfyUI main.py; missing from the upstream Colab template.
# blake3/comfy_aimdo: base runtime. comfy_kitchen: fp8 quantization support.
# simpleeval: nodes_math.py import.
!pip install blake3 comfy_aimdo comfy_kitchen simpleeval

if OPTIONS['USE_COMFYUI_MANAGER']:
    %cd custom_nodes
    ![ ! -d ComfyUI-Manager ] && echo -= Initial setup ComfyUI-Manager =- && git clone https://github.com/ltdrdata/ComfyUI-Manager
    %cd ComfyUI-Manager
    !git pull
%cd $WORKSPACE

if OPTIONS['INSTALL_CUSTOM_NODES_DEPENDENCIES']:
    !echo -= Install custom nodes dependencies =-
    !pip install GitPython
    !python custom_nodes/ComfyUI-Manager/cm-cli.py restore-dependencies

!mkdir -p $WORKSPACE/models/diffusion_models
!mkdir -p $WORKSPACE/models/vae
!mkdir -p $WORKSPACE/models/text_encoders

!wget -nc -O $WORKSPACE/models/diffusion_models/z_image_turbo_bf16.safetensors https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors
!wget -nc -O $WORKSPACE/models/vae/ae.safetensors https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors
!wget -nc -O $WORKSPACE/models/text_encoders/qwen_3_4b.safetensors https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors

!wget -nc -P ~ https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i ~/cloudflared-linux-amd64.deb || true

print("Setup done. WORKSPACE =", WORKSPACE)
