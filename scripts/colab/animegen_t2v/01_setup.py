# Colab cell: set up ComfyUI and download AnimeGen-T2V weights (A100 required).
# Paste this into a single Colab cell and run once per session.
# Re-running is safe: `git pull` updates and completed model files are skipped.
#
# AnimeGen-T2V (aidealab/AnimeGen-T2V) is an anime-style fine-tune of
# Wan 2.2 T2V A14B. It ships the two expert unets ONLY, as full bf16
# weights (~28.6 GB each, ~57 GB total). It reuses the standard Wan 2.2
# text encoder (umt5-xxl) and the Wan 2.1 VAE, which we pull from the
# Comfy-Org repack (no HF token needed).
#
# Two workflows are provided:
#   - animegen_t2v.json           : plain dual-expert, 20 steps (no LoRA)
#   - animegen_t2v_lightning.json : + lightx2v 4-step Lightning LoRA, 8 steps
# Set DOWNLOAD_LIGHTNING_LORA below to fetch the LoRA for the fast path.
#
# Verify filenames before running (upstream occasionally renames):
#   https://huggingface.co/aidealab/AnimeGen-T2V
#   https://huggingface.co/lightx2v/Wan2.2-Lightning
#   https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged

USE_GOOGLE_DRIVE       = False
UPDATE_COMFYUI         = True
INSTALL_MANAGER        = False
RESTORE_NODE_DEPS      = False
DOWNLOAD_LIGHTNING_LORA = True

import os
from pathlib import Path

# --- Workspace location -----------------------------------------------------
if USE_GOOGLE_DRIVE:
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    os.chdir('/content/drive/MyDrive')
else:
    WORKSPACE = f"{os.getcwd()}/ComfyUI"

# --- ComfyUI checkout -------------------------------------------------------
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
for sub in ('diffusion_models', 'vae', 'text_encoders', 'loras'):
    os.makedirs(f"{WORKSPACE}/models/{sub}", exist_ok=True)

!pip3 install -q "huggingface_hub>=0.32.0" "hf_xet>=1.1.5"

from huggingface_hub import hf_hub_download

ANIMEGEN_REPO = "aidealab/AnimeGen-T2V"
ANIMEGEN_REVISION = "ea04305bca418d988e4924a92a1e8ff67cb29a68"
WAN_REPACK_REPO = "Comfy-Org/Wan_2.2_ComfyUI_Repackaged"
WAN_REPACK_REVISION = "fb1388adc906ab39ffc26ee40e96b22886b56bc4"
LIGHTNING_REPO = "lightx2v/Wan2.2-Lightning"
LIGHTNING_REVISION = "18bccf8884ec0a078eed79785eb4ef13ea16ce1e"
HF_STAGING = Path(WORKSPACE) / ".cache" / "huggingface-downloads"


def hf_get(repo_id, filename, revision, dest_dir, out):
    """Download through the Hub's Xet-aware client, then atomically install."""
    target = Path(dest_dir) / out
    aria2_control = Path(f"{target}.aria2")
    if target.is_file() and target.stat().st_size > 0 and not aria2_control.exists():
        print(f"Already downloaded: {target}")
        return target

    staging_dir = HF_STAGING / repo_id.replace("/", "--")
    staged = Path(
        hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            revision=revision,
            local_dir=staging_dir,
        )
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    os.replace(staged, target)
    aria2_control.unlink(missing_ok=True)
    print(f"Downloaded: {target}")
    return target

# AnimeGen expert unets (full bf16, ~28.6 GB each). high_noise = early steps,
# low_noise = late steps. These are the fine-tuned weights.
hf_get(ANIMEGEN_REPO, "high_noise.safetensors", ANIMEGEN_REVISION,
       f"{WORKSPACE}/models/diffusion_models", "animegen_t2v_high_noise.safetensors")
hf_get(ANIMEGEN_REPO, "low_noise.safetensors", ANIMEGEN_REVISION,
       f"{WORKSPACE}/models/diffusion_models", "animegen_t2v_low_noise.safetensors")

# Shared Wan 2.2 text encoder (umt5-xxl) + Wan 2.1 VAE (Comfy-Org repack).
hf_get(WAN_REPACK_REPO, "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
       WAN_REPACK_REVISION, f"{WORKSPACE}/models/text_encoders",
       "umt5_xxl_fp8_e4m3fn_scaled.safetensors")
hf_get(WAN_REPACK_REPO, "split_files/vae/wan_2.1_vae.safetensors",
       WAN_REPACK_REVISION, f"{WORKSPACE}/models/vae", "wan_2.1_vae.safetensors")

if DOWNLOAD_LIGHTNING_LORA:
    # lightx2v 4-step Lightning LoRA for Wan 2.2 T2V A14B. Enables the
    # 8-step fast path (animegen_t2v_lightning.json). Small (~1-2.5 GB each).
    hf_get(LIGHTNING_REPO,
           "Wan2.2-T2V-A14B-4steps-lora-250928/high_noise_model.safetensors",
           LIGHTNING_REVISION, f"{WORKSPACE}/models/loras",
           "wan2.2_t2v_lightning_4steps_high_noise.safetensors")
    hf_get(LIGHTNING_REPO,
           "Wan2.2-T2V-A14B-4steps-lora-250928/low_noise_model.safetensors",
           LIGHTNING_REVISION, f"{WORKSPACE}/models/loras",
           "wan2.2_t2v_lightning_4steps_low_noise.safetensors")

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
