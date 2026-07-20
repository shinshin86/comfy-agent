# Colab cell: set up ComfyUI and Wan 2.2 S2V 14B (A100 required).
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

for subdir in ("diffusion_models", "text_encoders", "vae", "audio_encoders", "loras"):
    os.makedirs(f"{WORKSPACE}/models/{subdir}", exist_ok=True)

WAN_BASE = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files"
!wget -c -O {WORKSPACE}/models/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors \
    {WAN_BASE}/diffusion_models/wan2.2_s2v_14B_fp8_scaled.safetensors
!wget -c -O {WORKSPACE}/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
    https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors
!wget -c -O {WORKSPACE}/models/vae/wan_2.1_vae.safetensors \
    {WAN_BASE}/vae/wan_2.1_vae.safetensors
!wget -c -O {WORKSPACE}/models/audio_encoders/wav2vec2_large_english_fp16.safetensors \
    {WAN_BASE}/audio_encoders/wav2vec2_large_english_fp16.safetensors
!wget -c -O {WORKSPACE}/models/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors \
    {WAN_BASE}/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors

!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
