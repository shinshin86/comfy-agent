"""Local, one-clip-at-a-time H3 chain runner; uses comfy-agent, never /prompt.

Motion latents live on the Colab runtime disk; a runtime reset prevents resume.
Inspect each returned clip before calling next again. No UI Chain node is used.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import uuid


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    os.replace(temporary, path)


def validate_plan(plan):
    allowed = {"preset", "width", "height", "length", "seed", "prompts", "image", "audio"}
    if set(plan) - allowed:
        raise ValueError("Unknown plan fields: " + str(sorted(set(plan) - allowed)))
    preset = plan.get("preset", "minimax_h3_motion_t2v")
    if preset not in {"minimax_h3_motion_t2v", "minimax_h3_motion_r2v"}:
        raise ValueError("Use a bundled motion preset with its original name")
    result = {"preset": preset, "width": 864, "height": 480, "length": 124, "seed": 42, **plan}
    for key in ["width", "height", "length", "seed"]:
        if type(result[key]) is not int:
            raise ValueError(f"{key} must be an integer")
    if any(result[k] <= 0 or result[k] % 32 for k in ["width", "height"]):
        raise ValueError("Width and height must be positive multiples of 32")
    if not 124 <= result["length"] <= 362 or (result["length"] - 5) % 17:
        raise ValueError("Length must follow 17k+5, between 124 and 362 frames")
    prompts = result.get("prompts")
    if not isinstance(prompts, list) or not 1 <= len(prompts) <= 9999:
        raise ValueError("Provide 1–9999 prompts")
    if any(not isinstance(p, str) or not p.strip() for p in prompts):
        raise ValueError("Every prompt must be a nonempty string")
    if not 0 <= result["seed"] <= 2**53 - len(prompts):
        raise ValueError("Seed and derived clip seeds must be nonnegative safe integers")
    result["references"] = {}
    for name in ["image", "audio"]:
        if preset.endswith("r2v"):
            if not isinstance(result.get(name), str):
                raise ValueError("R2V requires image and audio paths")
            file = Path(result[name]).resolve()
            result[name] = str(file)
            result["references"][name] = hashlib.sha256(file.read_bytes()).hexdigest()
        elif name in result:
            raise ValueError("T2V does not accept image/audio references")
    return result


def command_json(argv, result_file=None):
    run = subprocess.run(argv, text=True, capture_output=True)
    if result_file:
        result_file.with_suffix(".stderr.log").write_text(run.stderr)
        result_file.with_suffix(".stdout.log").write_text(run.stdout)
    if run.returncode:
        raise RuntimeError(f"Command failed ({run.returncode}): {run.stderr[-2000:]} {run.stdout[-2000:]}")
    payload = json.loads(run.stdout)
    if payload.get("ok") is False:
        raise RuntimeError(str(payload))
    if result_file:
        write_json(result_file, payload)
    return payload


def video_from_result(payload):
    videos = [Path(o["saved_to"]) for r in payload.get("runs", [])
              for o in r.get("outputs", []) if str(o.get("saved_to", "")).lower().endswith(".mp4")]
    if len(videos) != 1 or not videos[0].is_file() or not videos[0].stat().st_size:
        raise RuntimeError("Expected exactly one downloaded, nonempty MP4; state was not advanced")
    return videos[0]


def preset_fingerprint(cli, preset):
    payload = command_json([cli, "preset", preset, "--source", "local", "--json"])
    info = payload["preset"]
    return {key: hashlib.sha256(Path(info[key]).read_bytes()).hexdigest()
            for key in ["preset_path", "workflow_path"]}


def next_clip(state_path, state, cli, retry_pending=False):
    plan = state["plan"]
    index = len(state["clips"])
    if index >= len(plan["prompts"]):
        return {"complete": True, "clips": len(state["clips"])}
    if preset_fingerprint(cli, plan["preset"]) != state["preset_fingerprint"]:
        raise ValueError("Preset or workflow changed during chain; start a new chain")
    for name, expected in plan["references"].items():
        if hashlib.sha256(Path(plan[name]).read_bytes()).hexdigest() != expected:
            raise ValueError("Reference changed during chain; start a new chain")
    directory = state_path.parent / "runs" / f"{index+1:05d}"
    result_file = directory / "result.json"
    if state.get("pending") is not None and not result_file.exists() and not retry_pending:
        raise RuntimeError("Previous run is uncertain. Inspect its stdout/stderr and comfy-agent jobs first. "
                           "Only after checking/stopping the old job, use --retry-pending to reroll this slot.")
    if not result_file.exists():
        directory.mkdir(parents=True, exist_ok=True)
        state["pending"] = index + 1
        write_json(state_path, state)
        args = [cli, "run", plan["preset"], "--104_prompt", plan["prompts"][index],
                "--104_width", str(plan["width"]), "--104_height", str(plan["height"]),
                "--104_length", str(plan["length"]), "--15_noise_seed", str(plan["seed"] + index),
                "--120_latent_path", state["latent_folder"], "--120_clip_index", str(index),
                "--122_filename_prefix", state["latent_folder"] + "/clip", "--122_clip_index", str(index+1),
                "--121_context_length", "22", "--121_audio_context_length", "24",
                "--out", str(directory), "--timeout-seconds", "3600", "--json"]
        for name in plan["references"]:
            args += ["--" + name, plan[name]]
        result = command_json(args, result_file)
    else:
        result = json.loads(result_file.read_text())
    video = video_from_result(result)
    duration = (plan["length"] - (22 if index else 0)) / 24
    verification = command_json([cli, "verify", str(video), "--expect-kind", "video",
                                 "--expect-count", "1", "--min-duration", str(duration - 0.05), "--json"])
    write_json(directory / "verification.json", verification)
    state["clips"].append({"index": index+1, "video": str(video),
                           "result": str(result_file), "expected_duration": duration,
                           "latent": state["latent_folder"] + f"/clip_{index+1:05d}.safetensors"})
    state["pending"] = None
    write_json(state_path, state)
    return {"clip": state["clips"][-1], "next_action": "Inspect frames and listen to audio before running next again.",
            "verified_visually": False}


def assemble(state, destination):
    if state.get("pending") or len(state["clips"]) != len(state["plan"]["prompts"]):
        raise ValueError("Finish all clips before assembling")
    if destination.exists():
        raise ValueError("Output already exists; choose a new path")
    entries = []
    for clip in state["clips"]:
        file = Path(clip["video"]).resolve()
        if not file.is_file() or "\n" in str(file) or "\r" in str(file):
            raise ValueError("Missing or invalid video path")
        entries.append("file '" + str(file).replace("'", "'\\''") + "'\n")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        listing = Path(directory) / "concat.txt"
        listing.write_text("".join(entries))
        subprocess.run(["ffmpeg", "-nostdin", "-n", "-f", "concat", "-safe", "0", "-i", str(listing),
                        "-map", "0:v:0", "-map", "0:a:0", "-c:v", "libx264", "-crf", "18",
                        "-c:a", "aac", "-ar", "32000", "-ac", "2", "-movflags", "+faststart", str(destination)], check=True)
    return {"video": str(destination), "verified_visually": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init", "next", "status", "assemble"])
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--cli", default="comfy-agent")
    parser.add_argument("--retry-pending", action="store_true")
    args = parser.parse_args()
    state_path = args.state.resolve()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    # Serialize local callers. OS releases this lock even after a crash.
    with state_path.with_suffix(".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.action == "init":
            if state_path.exists() or args.plan is None:
                raise ValueError("init requires --plan and a new --state path")
            plan = validate_plan(json.loads(args.plan.read_text()))
            state = {"version": 1, "plan": plan,
                     "preset_fingerprint": preset_fingerprint(args.cli, plan["preset"]),
                     "latent_folder": "h3_context/" + uuid.uuid4().hex,
                     "clips": [], "pending": None}
            write_json(state_path, state)
            result = state
        else:
            state = json.loads(state_path.read_text())
            if state.get("version") != 1:
                raise ValueError("Unsupported chain state version")
            if args.action == "next":
                result = next_clip(state_path, state, args.cli, args.retry_pending)
            elif args.action == "assemble":
                if args.output is None:
                    raise ValueError("assemble requires --output")
                result = assemble(state, args.output.resolve())
            else:
                result = state
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
