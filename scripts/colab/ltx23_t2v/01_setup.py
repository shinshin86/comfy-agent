# Colab cell: set up ComfyUI and LTX-2.3 text-to-video (A100 required).
# The downloads resume after interruption. Expect roughly 42 GB of weights.

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

for subdir in ("checkpoints", "text_encoders", "loras"):
    os.makedirs(f"{WORKSPACE}/models/{subdir}", exist_ok=True)

!wget -c -O {WORKSPACE}/models/checkpoints/ltx-2.3-22b-dev-fp8.safetensors \
    https://huggingface.co/Lightricks/LTX-2.3-fp8/resolve/main/ltx-2.3-22b-dev-fp8.safetensors
!wget -c -O {WORKSPACE}/models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors \
    https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors
!wget -c -O {WORKSPACE}/models/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors \
    https://huggingface.co/Comfy-Org/ltx-2.3/resolve/main/split_files/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors

!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
