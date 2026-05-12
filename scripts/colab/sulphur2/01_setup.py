# Colab cell: set up ComfyUI and download Sulphur-2 (LTX-2.3 fine-tune) weights.
# A100 (40 GB+) recommended — the fp8mixed checkpoint is ~29 GB on disk.
#
# Sulphur-2 is an "uncensored" LTX-2.3 fine-tune by SulphurAI. The
# `sulphur_dev_fp8mixed` weights below already contain the Sulphur
# fine-tune merged in; the kit's workflow does NOT stack the
# `sulphur_lora_rank_768` LoRA on top (the upstream LoRA loaders for
# `sulphur_final.safetensors` have been rewired out — see the kit README).
#
# Upstream references:
#   https://huggingface.co/SulphurAI/Sulphur-2-base
#   https://huggingface.co/Lightricks/LTX-2.3      (parent model)
#   https://huggingface.co/Comfy-Org/ltx-2          (Gemma text encoder repack)
#   https://github.com/Lightricks/ComfyUI-LTXVideo
#   https://github.com/kijai/ComfyUI-KJNodes        (PatchSageAttentionKJ)
#   https://github.com/evanspearman/ComfyMath       (ComfyMathExpression)
#   https://github.com/aria1th/ComfyUI-LogicUtils   (ResizeImageResolution)
#   https://github.com/sipherxyz/comfyui-art-venture (ImageScaleDownBy)
#
# License: weights are governed by the LTX-2 Community License Agreement
# bundled in the SulphurAI/Sulphur-2-base repo. Review before use,
# especially regarding redistribution and acceptable use.

USE_GOOGLE_DRIVE      = False
UPDATE_COMFYUI        = True
INSTALL_MANAGER       = True
RESTORE_NODE_DEPS     = True
DOWNLOAD_SULPHUR_2    = True
# "fp8mixed" (~29 GB) fits A100 40 GB with low_vram streaming.
# "bf16" (~46 GB) only makes sense on A100 80 GB or with aggressive offload.
CHECKPOINT_VARIANT    = "fp8mixed"  # "fp8mixed" | "bf16"
# Drop the 4 upstream Sulphur workflows (i2v/t2v × base/distilled) into
# ComfyUI/user/default/workflows/ so they're selectable in the ComfyUI
# browser UI on this Colab session. Independent of the comfy-agent CLI
# path — those workflows are NOT patched, so loading them in the UI is
# the easiest way to try the t2v / base variants.
INSTALL_UPSTREAM_WORKFLOWS_IN_UI = True

import os

# --- Workspace location -----------------------------------------------------
# Re-runs in the same Colab session land in `cwd/ComfyUI` from the previous
# `%cd $WORKSPACE`. Without the main.py check, a re-run would nest a fresh
# ComfyUI checkout inside the existing one and re-download every weight.
_cwd = os.getcwd()
if USE_GOOGLE_DRIVE:
    from google.colab import drive
    drive.mount('/content/drive')
    WORKSPACE = "/content/drive/MyDrive/ComfyUI"
    os.chdir('/content/drive/MyDrive')
elif os.path.isfile(os.path.join(_cwd, "main.py")):
    WORKSPACE = _cwd
else:
    WORKSPACE = f"{_cwd}/ComfyUI"

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
# comfy_kitchen >=0.2.0 is required for LTX-2.x nodes.
!pip3 install -q blake3 comfy_aimdo 'comfy_kitchen>=0.2.0' simpleeval
!pip3 install -q -r {WORKSPACE}/requirements.txt
# sageattention powers KJNodes' PatchSageAttentionKJ used in the workflow.
# If the wheel fails on this runtime, the node's sage_attention="auto" should
# fall back to default attention — non-fatal.
!pip3 install -q sageattention || echo "sageattention unavailable — workflow will fall back to default attention"

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

# --- ComfyUI-LTXVideo (Lightricks) -----------------------------------------
ltx_node_dir = f"{WORKSPACE}/custom_nodes/ComfyUI-LTXVideo"
if not os.path.isdir(ltx_node_dir):
    !git clone https://github.com/Lightricks/ComfyUI-LTXVideo {ltx_node_dir}
else:
    !git -C {ltx_node_dir} pull
!pip3 install -q -r {ltx_node_dir}/requirements.txt

# --- ComfyUI-KJNodes (PatchSageAttentionKJ) --------------------------------
kj_node_dir = f"{WORKSPACE}/custom_nodes/ComfyUI-KJNodes"
if not os.path.isdir(kj_node_dir):
    !git clone https://github.com/kijai/ComfyUI-KJNodes {kj_node_dir}
else:
    !git -C {kj_node_dir} pull
if os.path.isfile(f"{kj_node_dir}/requirements.txt"):
    !pip3 install -q -r {kj_node_dir}/requirements.txt

# --- ComfyMath (ComfyMathExpression) ---------------------------------------
math_node_dir = f"{WORKSPACE}/custom_nodes/ComfyMath"
if not os.path.isdir(math_node_dir):
    !git clone https://github.com/evanspearman/ComfyMath {math_node_dir}
else:
    !git -C {math_node_dir} pull
if os.path.isfile(f"{math_node_dir}/requirements.txt"):
    !pip3 install -q -r {math_node_dir}/requirements.txt

# --- ComfyUI-LogicUtils (ResizeImageResolution) ----------------------------
logicutils_dir = f"{WORKSPACE}/custom_nodes/ComfyUI-LogicUtils"
if not os.path.isdir(logicutils_dir):
    !git clone https://github.com/aria1th/ComfyUI-LogicUtils {logicutils_dir}
else:
    !git -C {logicutils_dir} pull
if os.path.isfile(f"{logicutils_dir}/requirements.txt"):
    !pip3 install -q -r {logicutils_dir}/requirements.txt

# --- comfyui-art-venture (ImageScaleDownBy) --------------------------------
artventure_dir = f"{WORKSPACE}/custom_nodes/comfyui-art-venture"
if not os.path.isdir(artventure_dir):
    !git clone https://github.com/sipherxyz/comfyui-art-venture {artventure_dir}
else:
    !git -C {artventure_dir} pull
if os.path.isfile(f"{artventure_dir}/requirements.txt"):
    !pip3 install -q -r {artventure_dir}/requirements.txt

# --- Model weights ----------------------------------------------------------
for sub in ('checkpoints', 'text_encoders', 'latent_upscale_models', 'loras'):
    os.makedirs(f"{WORKSPACE}/models/{sub}", exist_ok=True)

if DOWNLOAD_SULPHUR_2:
    SULPHUR_BASE   = "https://huggingface.co/SulphurAI/Sulphur-2-base/resolve/main"
    COMFY_LTX_BASE = "https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files"
    LTX_BASE       = "https://huggingface.co/Lightricks/LTX-2.3/resolve/main"

    if CHECKPOINT_VARIANT == "fp8mixed":
        ckpt_name = "sulphur_dev_fp8mixed.safetensors"
    elif CHECKPOINT_VARIANT == "bf16":
        ckpt_name = "sulphur_dev_bf16.safetensors"
    else:
        raise ValueError(f"Unknown CHECKPOINT_VARIANT: {CHECKPOINT_VARIANT!r}")

    # Sulphur-2 merged dev checkpoint (Sulphur fine-tune already baked in).
    !wget -nc -O {WORKSPACE}/models/checkpoints/{ckpt_name} \
        {SULPHUR_BASE}/{ckpt_name}

    # Distilled LoRA (cuts sampling steps; referenced by the kit's workflow).
    !wget -nc -O {WORKSPACE}/models/loras/ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors \
        {SULPHUR_BASE}/distill_loras/ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors

    # Text encoder: Comfy-Org repack of Gemma 3 12B (fp4-mixed, ~7 GB).
    !wget -nc -O {WORKSPACE}/models/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors \
        {COMFY_LTX_BASE}/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors

    # Spatial upscaler x2 (used inside the two-stage workflow).
    !wget -nc -O {WORKSPACE}/models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.0.safetensors \
        {LTX_BASE}/ltx-2.3-spatial-upscaler-x2-1.0.safetensors

# --- Upstream workflows into ComfyUI UI workflow dir ------------------------
# These are the original Sulphur HF workflows, unmodified. They reference
# `ltx-2.3-22b-dev-fp8.safetensors` and `sulphur_final.safetensors` which
# do not match any file the setup downloads — you'll need to either edit
# the node widget values inside ComfyUI before queueing, or use the
# kit's patched `video_sulphur2_i2v_distilled.json` through comfy-agent.
if INSTALL_UPSTREAM_WORKFLOWS_IN_UI:
    ui_workflows = f"{WORKSPACE}/user/default/workflows"
    os.makedirs(ui_workflows, exist_ok=True)
    # Filenames on HF contain spaces; URL-encode them and rename locally
    # so they're shell-friendly.
    upstream_workflows = [
        ("ltx23_i2v%20base.json",      "sulphur2_i2v_base.json"),
        ("ltx23_i2v%20distilled.json", "sulphur2_i2v_distilled.json"),
        ("ltx23_t2v%20base.json",      "sulphur2_t2v_base.json"),
        ("ltx23_t2v%20distilled.json", "sulphur2_t2v_distilled.json"),
    ]
    for remote, local in upstream_workflows:
        url = f"https://huggingface.co/SulphurAI/Sulphur-2-base/resolve/main/workflows/{remote}"
        !wget -nc -O {ui_workflows}/{local} "{url}"

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"Checkpoint variant: {CHECKPOINT_VARIANT}")
