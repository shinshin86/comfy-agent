# Colab cell: set up ComfyUI and download 10Eros (LTX-2.3 fine-tune) weights.
# A100 (40 GB+) recommended — the fp8mixed_learned checkpoint is ~34 GB on disk.
#
# 10Eros is an "uncensored" LTX-2.3 22B fine-tune by TenStrip, built on top
# of SulphurAI/Sulphur-2-base via layer-scaled merges. The
# `10Eros_v1.2_fp8mixed_learned` weights below are a FULL checkpoint (the
# fine-tune is already merged in), so the kit's workflow does NOT stack a
# separate Sulphur/10Eros LoRA on top — it only applies the LTX-2.3 1.1
# distilled LoRA (cond_safe variant) to cut sampling steps.
#
# Upstream references:
#   https://huggingface.co/TenStrip/LTX2.3-10Eros            (this model)
#   https://huggingface.co/SulphurAI/Sulphur-2-base          (parent fine-tune / distill LoRA)
#   https://huggingface.co/Lightricks/LTX-2.3                (base model / spatial upscaler)
#   https://github.com/TenStrip/10S-Comfy-nodes              (author's ComfyUI nodes)
#   https://github.com/Lightricks/ComfyUI-LTXVideo
#   https://github.com/kijai/ComfyUI-KJNodes                 (PatchSageAttentionKJ)
#   https://github.com/evanspearman/ComfyMath                (ComfyMathExpression)
#   https://github.com/aria1th/ComfyUI-LogicUtils            (ResizeImageResolution)
#   https://github.com/sipherxyz/comfyui-art-venture         (ImageScaleDownBy)
#
# License: the upstream 10Eros model card does not state an explicit
# license; the parent Lightricks/LTX-2.3 is governed by the LTX-2
# Community License Agreement. Review both before use, especially
# regarding redistribution and acceptable use.

USE_GOOGLE_DRIVE      = False
UPDATE_COMFYUI        = True
INSTALL_MANAGER       = True
RESTORE_NODE_DEPS     = True
DOWNLOAD_10EROS       = True
# "fp8mixed" (~34 GB) fits A100 40 GB with low_vram streaming.
# "bf16" (~46 GB) only makes sense on A100 80 GB or with aggressive offload.
CHECKPOINT_VARIANT    = "fp8mixed"  # "fp8mixed" | "bf16"

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

if DOWNLOAD_10EROS:
    EROS_BASE      = "https://huggingface.co/TenStrip/LTX2.3-10Eros/resolve/main"
    SULPHUR_BASE   = "https://huggingface.co/SulphurAI/Sulphur-2-base/resolve/main"
    LTX_BASE       = "https://huggingface.co/Lightricks/LTX-2.3/resolve/main"

    if CHECKPOINT_VARIANT == "fp8mixed":
        ckpt_name = "10Eros_v1.2_fp8mixed_learned.safetensors"
    elif CHECKPOINT_VARIANT == "bf16":
        ckpt_name = "10Eros_v1.2_bf16.safetensors"
    else:
        raise ValueError(f"Unknown CHECKPOINT_VARIANT: {CHECKPOINT_VARIANT!r}")

    # 10Eros merged dev checkpoint (10Eros fine-tune already baked in; the
    # full checkpoint also bundles the video + audio VAEs read by nodes 4/44).
    !wget -nc -O {WORKSPACE}/models/checkpoints/{ckpt_name} \
        {EROS_BASE}/{ckpt_name}

    # Text encoder: 10Eros ships its own abliterated Gemma 3 12B (fp8mixed,
    # ~13 GB) under text_encoders/. Used by LTXAVTextEncoderLoader (node 5).
    !wget -nc -O {WORKSPACE}/models/text_encoders/gemma-3-12b-it-ablit-norms-biproj-fp8mixed.safetensors \
        {EROS_BASE}/text_encoders/gemma-3-12b-it-ablit-norms-biproj-fp8mixed.safetensors

    # Distilled LoRA (cuts sampling steps). The 10Eros card recommends the
    # "cond_safe" LTX-2.3 1.1 distilled LoRA; this is the same cond_safe file
    # the Sulphur-2 repo ships and is reused here.
    !wget -nc -O {WORKSPACE}/models/loras/ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors \
        {SULPHUR_BASE}/distill_loras/ltx-2.3-22b-distilled-lora-1.1_fro90_ceil72_condsafe.safetensors

    # Spatial upscaler x2 (used inside the two-stage workflow).
    !wget -nc -O {WORKSPACE}/models/latent_upscale_models/ltx-2.3-spatial-upscaler-x2-1.0.safetensors \
        {LTX_BASE}/ltx-2.3-spatial-upscaler-x2-1.0.safetensors

# --- cloudflared ------------------------------------------------------------
!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"Checkpoint variant: {CHECKPOINT_VARIANT}")
