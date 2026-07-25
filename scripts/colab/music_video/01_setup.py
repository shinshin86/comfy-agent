# Colab cell: set up ComfyUI for the music-video combo kit (A100 required).
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: git checkout is idempotent and `wget -nc` skips
# existing files.
#
# One runtime, three capabilities — everything the music-video recipe
# (recipes/music-video/RECIPE.md) needs:
#   - ACE-Step 1.5 Turbo AIO ......... full songs with lyrics/vocals (audio)
#   - Z-Image turbo .................. fast keyframe images (image)
#   - Wan 2.2 TI2V 5B ................ image-to-video clips (video)
#
# ComfyUI is pinned to the same revision the ace_step_1_5 kit verified
# (ACE-Step 1.5 is the newest of the three model families, so a revision
# that supports it also supports Z-Image and Wan 2.2).
# Total downloads: ~49 GB. Colab local disk (~200 GB) is fine; expect
# roughly 15-20 minutes on a fast runtime.

USE_GOOGLE_DRIVE = False
COMFYUI_REVISION = "7bf8bfcd078c7f4ae50ca5149c9ff7d8613e1fb1"
CLOUDFLARED_VERSION = "2026.7.2"
CLOUDFLARED_SHA256 = "88195157a136199a86977c122a22084dae6907480bbe3640222b7b55834afc3a"

import hashlib
import os

# --- Workspace location -----------------------------------------------------
# Re-run safe: if the kernel cwd is already a ComfyUI checkout (cell 1 ends
# with `%cd`), reuse it instead of nesting ComfyUI/ComfyUI.
if USE_GOOGLE_DRIVE:
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    os.chdir('/content/drive/MyDrive')
else:
    current_dir = os.getcwd()
    WORKSPACE = current_dir if os.path.isfile(os.path.join(current_dir, "main.py")) else f"{current_dir}/ComfyUI"

# --- ComfyUI checkout (pinned) ----------------------------------------------
if not os.path.isdir(WORKSPACE):
    !git clone --filter=blob:none https://github.com/Comfy-Org/ComfyUI.git {WORKSPACE}
%cd {WORKSPACE}
!git fetch --depth 1 origin {COMFYUI_REVISION}
!git checkout --detach {COMFYUI_REVISION}

# --- Python dependencies ----------------------------------------------------
# Same dependency path the ace_step_1_5 kit verified at this exact revision:
# Colab's preinstalled torch + ComfyUI's requirements.txt. Do NOT add a
# pinned-index torch install here — the cu121 wheels are stale and would
# downgrade the runtime's torch.
!pip3 install -q -r {WORKSPACE}/requirements.txt

# --- Model weights ----------------------------------------------------------
for sub in ('checkpoints', 'diffusion_models', 'vae', 'text_encoders'):
    os.makedirs(f"{WORKSPACE}/models/{sub}", exist_ok=True)

# ACE-Step 1.5 Turbo AIO (audio: full songs, lyrics, vocals) — ~10 GB
ACE_REV = "54b2ef4d8af5582f54c7e6b84c22b679a194bc4b"
!wget -nc -O {WORKSPACE}/models/checkpoints/ace_step_1.5_turbo_aio.safetensors \
    https://huggingface.co/Comfy-Org/ace_step_1.5_ComfyUI_files/resolve/{ACE_REV}/checkpoints/ace_step_1.5_turbo_aio.safetensors

# Z-Image turbo (image keyframes) — ~20.6 GB
Z_BASE = "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files"
!wget -nc -O {WORKSPACE}/models/diffusion_models/z_image_turbo_bf16.safetensors {Z_BASE}/diffusion_models/z_image_turbo_bf16.safetensors
!wget -nc -O {WORKSPACE}/models/vae/ae.safetensors                              {Z_BASE}/vae/ae.safetensors
!wget -nc -O {WORKSPACE}/models/text_encoders/qwen_3_4b.safetensors             {Z_BASE}/text_encoders/qwen_3_4b.safetensors

# Wan 2.2 TI2V 5B (image/text to video) — ~18.1 GB
WAN_BASE = "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files"
!wget -nc -O {WORKSPACE}/models/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors \
    {WAN_BASE}/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors
!wget -nc -O {WORKSPACE}/models/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors \
    {WAN_BASE}/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors
!wget -nc -O {WORKSPACE}/models/vae/wan2.2_vae.safetensors \
    {WAN_BASE}/vae/wan2.2_vae.safetensors

# --- cloudflared (pinned + checksum, same as ace_step_1_5) -------------------
cloudflared_deb = "/root/cloudflared-linux-amd64.deb"
!wget -nc -O {cloudflared_deb} https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/cloudflared-linux-amd64.deb
digest = hashlib.sha256(open(cloudflared_deb, "rb").read()).hexdigest()
if digest != CLOUDFLARED_SHA256:
    raise RuntimeError(f"cloudflared SHA-256 mismatch: {digest}")
!dpkg -i {cloudflared_deb}

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"ComfyUI revision = {COMFYUI_REVISION}")
print("Next: run scripts/colab/02_start_comfyui.py in a new cell.")
