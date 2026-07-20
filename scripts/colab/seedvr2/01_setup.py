# Colab cell: set up ComfyUI and native SeedVR2 3B Int8 upscaling.
# The downloads resume after interruption.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = True

import os

if USE_GOOGLE_DRIVE:
    from google.colab import drive

    drive.mount("/content/drive")
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    os.chdir("/content/drive/MyDrive")
else:
    current_dir = os.getcwd()
    if os.path.isfile(os.path.join(current_dir, "main.py")):
        WORKSPACE = current_dir
    else:
        WORKSPACE = f"{current_dir}/ComfyUI"

if not os.path.isdir(WORKSPACE):
    !git clone --depth 1 https://github.com/Comfy-Org/ComfyUI.git {WORKSPACE}
%cd {WORKSPACE}
if UPDATE_COMFYUI:
    !git pull --ff-only

!pip3 install -q -r {WORKSPACE}/requirements.txt

for subdir in ("diffusion_models", "vae"):
    os.makedirs(f"{WORKSPACE}/models/{subdir}", exist_ok=True)

!wget -c -O {WORKSPACE}/models/diffusion_models/seedvr2_3b_int8_convrot.safetensors \
    https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/diffusion_models/seedvr2_3b_int8_convrot.safetensors
!wget -c -O {WORKSPACE}/models/vae/ema_vae_fp16.safetensors \
    https://huggingface.co/Comfy-Org/SeedVR2/resolve/main/vae/ema_vae_fp16.safetensors

!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
