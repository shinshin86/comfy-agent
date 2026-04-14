# Colab cell 1/2 for Wan 2.2 (Alibaba) on A100.
# Downloads the Comfy-Org repack of Wan 2.2. Covers both TI2V 5B (single
# unet) and T2V 14B (dual high_noise + low_noise experts). Comment out
# the variants you do not need to save disk.
#
# Verify filenames before running (Comfy-Org occasionally renames):
#   https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged
# ComfyUI reference workflows: https://comfyanonymous.github.io/ComfyUI_examples/wan22/

OPTIONS = {
    'USE_GOOGLE_DRIVE': False,
    'UPDATE_COMFY_UI': True,
    'USE_COMFYUI_MANAGER': True,
    'INSTALL_CUSTOM_NODES_DEPENDENCIES': True,
    'DOWNLOAD_TI2V_5B': True,
    'DOWNLOAD_T2V_14B': True,
}

current_dir = !pwd
WORKSPACE = f"{current_dir[0]}/ComfyUI"

if OPTIONS['USE_GOOGLE_DRIVE']:
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    %cd /content/drive/MyDrive

![ ! -d $WORKSPACE ] && git clone https://github.com/comfyanonymous/ComfyUI
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

WAN_BASE = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files"

# Shared text encoder (umt5-xxl, used by all Wan 2.2 variants).
!wget -nc -O $WORKSPACE/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
    $WAN_BASE/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors

if OPTIONS['DOWNLOAD_TI2V_5B']:
    # TI2V 5B: single unet, uses the 2.2 VAE. Fastest, fits easily on A100.
    !wget -nc -O $WORKSPACE/models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors \
        $WAN_BASE/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors
    !wget -nc -O $WORKSPACE/models/vae/wan2.2_vae.safetensors \
        $WAN_BASE/vae/wan2.2_vae.safetensors

if OPTIONS['DOWNLOAD_T2V_14B']:
    # T2V 14B uses two expert unets (high_noise early, low_noise late) and
    # the Wan 2.1 VAE. Highest quality, heaviest VRAM/time.
    !wget -nc -O $WORKSPACE/models/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors \
        $WAN_BASE/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors
    !wget -nc -O $WORKSPACE/models/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors \
        $WAN_BASE/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors
    !wget -nc -O $WORKSPACE/models/vae/wan_2.1_vae.safetensors \
        $WAN_BASE/vae/wan_2.1_vae.safetensors

!wget -nc -P ~ https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i ~/cloudflared-linux-amd64.deb || true

print("Setup done. WORKSPACE =", WORKSPACE)
