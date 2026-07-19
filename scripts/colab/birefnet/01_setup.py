# Colab cell: set up ComfyUI and BiRefNet background removal.
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = True

import os

if USE_GOOGLE_DRIVE:
    from google.colab import drive

    drive.mount("/content/drive")
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    os.chdir("/content/drive/MyDrive")
else:
    WORKSPACE = f"{os.getcwd()}/ComfyUI"

if not os.path.isdir(WORKSPACE):
    !git clone --depth 1 https://github.com/Comfy-Org/ComfyUI.git {WORKSPACE}
%cd {WORKSPACE}
if UPDATE_COMFYUI:
    !git pull --ff-only

!pip3 install -q -r {WORKSPACE}/requirements.txt

os.makedirs(f"{WORKSPACE}/models/background_removal", exist_ok=True)
!wget -nc -O {WORKSPACE}/models/background_removal/birefnet.safetensors \
    https://huggingface.co/Comfy-Org/BiRefNet/resolve/main/background_removal/birefnet.safetensors

!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
