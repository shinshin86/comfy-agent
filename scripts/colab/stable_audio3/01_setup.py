# Colab cell: set up ComfyUI and Stable Audio 3 Medium.
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

os.makedirs(f"{WORKSPACE}/models/checkpoints", exist_ok=True)
os.makedirs(f"{WORKSPACE}/models/text_encoders", exist_ok=True)

!wget -nc -O {WORKSPACE}/models/checkpoints/stable_audio_3_medium.safetensors \
    https://huggingface.co/Comfy-Org/stable-audio-3/resolve/main/checkpoints/stable_audio_3_medium.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/t5gemma_b_b_ul2.safetensors \
    https://huggingface.co/Comfy-Org/stable-audio-3/resolve/main/text_encoders/t5gemma_b_b_ul2.safetensors

!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
