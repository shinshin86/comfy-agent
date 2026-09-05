# Starter: no Colab E2E claim. Run on a fresh A100 high-RAM runtime.
# The existing minimax_h3 and minimax_h3_fast kits are not modified.
import hashlib
import os
from pathlib import Path
import socket
import subprocess
import urllib.request

BASE_REPO_REVISION = '79c0228f81c1e459c66b229bb6d34abfc9d92063'
BASE_SETUP_SHA256 = 'b224ae3c177e453480b5dd90d47b9862ae19432aaf05641816853bf6b2d3fd18'
MOTION_REVISION = 'a12a50ce7b34922198ec51665936da9220c67768'
VDN_REVISION = 'b49130c26a70d12c542601c5bc4f7ee0f112ee2e'
LORA_REVISION = '0152857b305ff23691bb749321bd23567cf770c2'
VDN_MODEL_REVISION = '18be6bcc4ee72585eee322ba28b5ccac2cf85ef0'


def install_node(repository, revision, destination):
    if destination.exists():
        actual = subprocess.check_output(["git", "-C", str(destination), "rev-parse", "HEAD"], text=True).strip()
        dirty = subprocess.check_output(["git", "-C", str(destination), "status", "--porcelain"], text=True).strip()
        if actual != revision or dirty:
            raise RuntimeError(f"Refusing to replace different/modified custom node: {destination}")
        return
    subprocess.run(["git", "clone", "--no-checkout", "--filter=blob:none", f"https://github.com/{repository}.git", str(destination)], check=True)
    subprocess.run(["git", "-C", str(destination), "checkout", "--detach", revision], check=True)


def setup(profile, ref2va=False):
    if profile not in {"guide", "sns", "motion", "vdn"}:
        raise ValueError("PROFILE must be guide, sns, motion, or vdn")
    if profile == "vdn" and ref2va:
        raise ValueError("The VDN starter only provides T2V")
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", 8188)) == 0:
            raise RuntimeError("ComfyUI is already running. Use a fresh runtime for this isolated kit.")
    # Fix the location: never follow cwd into the user's ordinary H3 checkout.
    base_dir = Path("/content/comfy-agent-h3-" + profile)
    base_dir.mkdir(parents=True, exist_ok=True)
    workspace = base_dir / "ComfyUI"
    if workspace.exists():
        origin = subprocess.check_output(["git", "-C", str(workspace), "remote", "get-url", "origin"], text=True).strip()
        dirty = subprocess.check_output(["git", "-C", str(workspace), "status", "--porcelain", "--untracked-files=no"], text=True).strip()
        if origin != "https://github.com/Comfy-Org/ComfyUI.git" or dirty:
            raise RuntimeError("Refusing to update an unexpected or modified ComfyUI checkout")
    drive_latents = None
    if profile == "motion":
        # Persist only AV latents. Model downloads stay on the runtime disk.
        from google.colab import drive
        drive.mount("/content/drive")
        drive_latents = Path("/content/drive/MyDrive/comfy-agent-h3/latents")
        drive_latents.mkdir(parents=True, exist_ok=True)
    url = f"https://raw.githubusercontent.com/shinshin86/comfy-agent/{BASE_REPO_REVISION}/scripts/colab/minimax_h3/01_setup.py"
    source_bytes = urllib.request.urlopen(url, timeout=60).read()
    if hashlib.sha256(source_bytes).hexdigest() != BASE_SETUP_SHA256:
        raise RuntimeError("Base H3 setup checksum mismatch")
    source = source_bytes.decode("utf-8")
    if ref2va:
        source = source.replace("DOWNLOAD_FL2VA = True", "DOWNLOAD_FL2VA = False", 1)
        source = source.replace("DOWNLOAD_REF2VA = False", "DOWNLOAD_REF2VA = True", 1)
    os.chdir(base_dir)
    namespace = {"__name__": "__main__"}
    exec(compile(source, "pinned_minimax_h3_setup.py", "exec"), namespace)
    os.environ["COMFY_WORKSPACE"] = str(workspace)
    download = namespace["ensure_download"]
    if profile == "sns":
        download(f"https://huggingface.co/vpakarinen/insta-tiktok-aesthetics-h3-lora/resolve/{LORA_REVISION}/ig_tiktok_aesthetic_h3_lora_v1_500.safetensors",
                 str(workspace / "models/loras/ig_tiktok_aesthetic_h3_lora_v1_500.safetensors"),
                 310168824, "e9d1ffc380a6abaca39d92ce717e2ead22d05eadbeb6cd526db04aea3226f758")
    elif profile == "motion":
        install_node("NikoDemon80/ComfyUI-H3-Motion-Context", MOTION_REVISION,
                     workspace / "custom_nodes/ComfyUI-H3-Motion-Context")
        target = workspace / "output/h3_context"
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.is_symlink():
            if target.resolve() != drive_latents.resolve():
                raise RuntimeError("Existing latent symlink points elsewhere")
        elif target.exists():
            raise RuntimeError("Existing h3_context directory: preserve/migrate it before rerunning setup")
        else:
            target.symlink_to(drive_latents, target_is_directory=True)
    elif profile == "vdn":
        install_node("Saganaki22/ComfyUI-VDN-H3", VDN_REVISION,
                     workspace / "custom_nodes/ComfyUI-VDN-H3")
        for relative_path, size, sha256 in VDN_FILES:
            download(f"https://huggingface.co/OpenVDN/vdn-minimax-h3/resolve/{VDN_MODEL_REVISION}/{relative_path}",
                     str(workspace / "models/vdn" / relative_path), size, sha256)
    print(f"Starter profile={profile}, ref2va={ref2va}. Start ../02_start_comfyui.py next.")
    print("After connection, import the selected workflow and run doctor --preset locally.")

VDN_FILES = [['stage-dmd-step-250/adapters/default/adapter_config.json',
  415,
  '89e0ff8920b9629b826eb99ab6150cce6924a53aa445186d1b493225fd091b96'],
 ['stage-dmd-step-250/adapters/default/adapter_model.safetensors',
  334026912,
  '58558fef506f88bb41649242de9b9b3a365da806b51b2e96afbbe1625222058a'],
 ['stage-dmd-step-250/adapters/turbo/adapter_config.json',
  22264,
  '627968f670747c29cd7a0d3f8c75166e501d70f9e829b5cd3242a8f14cefbc18'],
 ['stage-dmd-step-250/adapters/turbo/adapter_model.safetensors',
  851452696,
  '24fc93c82fe84dc45d0627f4e72c637bc387d282ba18f60ed3b7f8c81089392c'],
 ['stage-dmd-step-250/linear_branch/config.json',
  465,
  'decb06ac7e664610f677fb445318502b3c51f9c1b8603a2cdd00b16042be5bc8'],
 ['stage-dmd-step-250/linear_branch/model.safetensors',
  4279428112,
  'dec6981c7874f5b3bc92d1a02e256b673a3b3499dc1a124714bb3b19da602855'],
 ['stage-dmd-step-250/metadata.json',
  463,
  '54054ceb1c91b3fdf7fa0278e4a8841c127e8cf666b5e240d69613661f9d3e9e'],
 ['stage-dmd-step-250/model_spec.json',
  25705,
  '4171f4384e952f1f73467981a893440c03298af4956b947e2c8a857ba9f5a62b']]

if __name__ == "__main__":
    setup("vdn")
