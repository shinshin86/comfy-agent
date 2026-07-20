# Colab cell: set up ComfyUI and the latest MOSS-SoundEffect v2.0 pipeline.
# Paste this file into one Colab cell and run once per session.

USE_GOOGLE_DRIVE = False
UPDATE_COMFYUI = True

import os
import sys
from pathlib import Path

if sys.version_info < (3, 12):
    raise RuntimeError("MOSS-SoundEffect v2.0 requires Python 3.12 or newer.")

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

# OpenMOSS explicitly requires a clean Python 3.12 environment. A dedicated
# venv also prevents its NumPy/Protobuf pins from changing Colab's base runtime.
VENV_DIR = "/content/moss-soundeffect-v2-venv"
VENV_PYTHON = f"{VENV_DIR}/bin/python"
VENV_PIP = f"{VENV_DIR}/bin/pip"

if not os.path.isfile(VENV_PIP):
    !python -m pip install -q virtualenv
    !python -m virtualenv --clear {VENV_DIR}

!{VENV_PIP} install -q --upgrade pip setuptools wheel
!{VENV_PIP} install -q -r {WORKSPACE}/requirements.txt

# MOSS-SoundEffect v2.0 has its own Python package and pinned runtime. Keep the
# official source outside custom_nodes, install only inference dependencies,
# and avoid the optional Gradio/fine-tuning stack.
MOSS_SOURCE_REVISION = "ad99ec5f26debf1d6c1a4dc8461b2bcb787ec9af"
MOSS_SOURCE_ROOT = f"/content/MOSS-TTS-{MOSS_SOURCE_REVISION}"
MOSS_ARCHIVE = f"/content/MOSS-TTS-{MOSS_SOURCE_REVISION}.tar.gz"

if not os.path.isdir(MOSS_SOURCE_ROOT):
    !wget -q -O {MOSS_ARCHIVE} https://github.com/OpenMOSS/MOSS-TTS/archive/{MOSS_SOURCE_REVISION}.tar.gz
    !tar -xzf {MOSS_ARCHIVE} -C /content

!{VENV_PIP} install -q --extra-index-url https://download.pytorch.org/whl/cu128 \
    torch==2.9.0+cu128 torchaudio==2.9.0+cu128 torchvision==0.24.0+cu128
!{VENV_PIP} install -q \
    numpy==1.26.4 einops==0.8.2 pillow==12.2.0 tqdm==4.67.3 \
    safetensors==0.7.0 transformers==4.57.1 diffusers==0.37.1 \
    ftfy==6.3.1 regex==2026.4.4 soundfile==0.13.1 imageio==2.37.3 \
    "typing-extensions>=4.10" descript-audiotools==0.7.2
!{VENV_PIP} install -q --no-deps -e {MOSS_SOURCE_ROOT}/moss_soundeffect_v2

CUSTOM_NODE_DIR = Path(WORKSPACE) / "custom_nodes" / "ComfyUI-MOSS-SoundEffect-v2"
CUSTOM_NODE_DIR.mkdir(parents=True, exist_ok=True)

# This is an original thin adapter around OpenMOSS's public Python API. It does
# not copy the independent v1 ComfyUI wrapper, whose architecture is different.
node_source = r'''
import os

os.environ.setdefault("TORCHDYNAMO_DISABLE", "1")
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("USE_TF", "0")

import torch

import comfy.model_management as model_management
import folder_paths
from moss_soundeffect_v2 import MossSoundEffectPipeline


MODEL_ID = "OpenMOSS-Team/MOSS-SoundEffect-v2.0"
MODEL_REVISION = "e35df4d82fbe87fcd5d14e5d100e349c0c3c076d"
_PIPELINE = None


def _load_pipeline():
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE

    if not torch.cuda.is_available():
        raise RuntimeError("MOSS-SoundEffect v2.0 requires a CUDA GPU for this kit.")

    model_management.unload_all_models()
    model_management.soft_empty_cache()

    cache_dir = os.path.join(folder_paths.models_dir, "moss_soundeffect_v2")
    os.makedirs(cache_dir, exist_ok=True)
    _PIPELINE = MossSoundEffectPipeline.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        cache_dir=cache_dir,
        torch_dtype=torch.bfloat16,
        device="cuda",
    )
    return _PIPELINE


class MossSoundEffectV2:
    DESCRIPTION = (
        "Generate up to 30 seconds of 48 kHz mono sound effects with "
        "OpenMOSS MOSS-SoundEffect v2.0."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": (
                    "STRING",
                    {
                        "default": "Heavy rain on a metal roof with distant rolling thunder.",
                        "multiline": True,
                    },
                ),
                "seconds": ("FLOAT", {"default": 5.0, "min": 1.0, "max": 30.0, "step": 0.1}),
                "steps": ("INT", {"default": 100, "min": 1, "max": 200}),
                "cfg_scale": ("FLOAT", {"default": 4.0, "min": 0.0, "max": 20.0, "step": 0.1}),
                "sigma_shift": ("FLOAT", {"default": 5.0, "min": 0.0, "max": 20.0, "step": 0.1}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "negative_prompt": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "generate"
    CATEGORY = "audio/MOSS-SoundEffect"

    def generate(self, prompt, seconds, steps, cfg_scale, sigma_shift, seed, negative_prompt):
        if not prompt.strip():
            raise ValueError("prompt must not be empty")

        pipeline = _load_pipeline()
        audio = pipeline(
            prompt=prompt,
            seconds=seconds,
            num_inference_steps=steps,
            cfg_scale=cfg_scale,
            sigma_shift=sigma_shift,
            seed=seed,
            negative_prompt=negative_prompt,
            num_channels=1,
        )
        waveform = audio.detach().to(device="cpu", dtype=torch.float32).contiguous()
        return ({"waveform": waveform, "sample_rate": pipeline.sample_rate},)


NODE_CLASS_MAPPINGS = {"MossSoundEffectV2": MossSoundEffectV2}
NODE_DISPLAY_NAME_MAPPINGS = {"MossSoundEffectV2": "MOSS-SoundEffect v2.0"}
'''

(CUSTOM_NODE_DIR / "__init__.py").write_text(node_source, encoding="utf-8")

MODEL_ID = "OpenMOSS-Team/MOSS-SoundEffect-v2.0"
MODEL_REVISION = "e35df4d82fbe87fcd5d14e5d100e349c0c3c076d"
MODEL_CACHE = f"{WORKSPACE}/models/moss_soundeffect_v2"
os.makedirs(MODEL_CACHE, exist_ok=True)

import subprocess

download_code = f'''
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id={MODEL_ID!r},
    revision={MODEL_REVISION!r},
    cache_dir={MODEL_CACHE!r},
)
'''
subprocess.run([VENV_PYTHON, "-c", download_code], check=True)

# The shared launcher resolves `python` from PATH, so this makes the ComfyUI
# subprocess use the isolated environment without changing the common script.
os.environ["PATH"] = f"{VENV_DIR}/bin:{os.environ['PATH']}"

!wget -nc -P /root https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
!dpkg -i /root/cloudflared-linux-amd64.deb || true

print(f"Setup complete. WORKSPACE = {WORKSPACE}")
print(f"Isolated Python = {VENV_PYTHON}")
print("Installed custom node: MOSS-SoundEffect v2.0 (48 kHz mono)")
