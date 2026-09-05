"""Offline orchestration tests: fake CLI results, not GPU/E2E verification."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import sys
sys.dont_write_bytecode = True
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("chain", Path(__file__).resolve().parents[1] / "scripts/colab/minimax_h3_extensions/chain.py")
chain = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chain)


class ChainTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state_path = self.root / "state.json"
        self.state = {"version": 1, "plan": chain.validate_plan({"prompts": ["a", "b", "c"]}),
                      "preset_fingerprint": {"a": "b"}, "latent_folder": "h3_context/test",
                      "clips": [], "pending": None}
        chain.write_json(self.state_path, self.state)
        self.calls = []

    def command(self, args, result_file=None):
        self.calls.append(args)
        if args[1] == "verify":
            return {"ok": True}
        file = result_file.parent / "clip.mp4"
        file.write_bytes(b"fake media; not a perceptual test")
        result = {"ok": True, "runs": [{"outputs": [{"saved_to": str(file)}]}]}
        chain.write_json(result_file, result)
        return result

    def run_next(self, **kwargs):
        with patch.object(chain, "preset_fingerprint", return_value={"a": "b"}), patch.object(chain, "command_json", side_effect=self.command):
            return chain.next_clip(self.state_path, self.state, "comfy-agent", **kwargs)

    def test_numbered_slots_and_trim_budget(self):
        for _ in range(3):
            self.run_next()
        runs = [c for c in self.calls if c[1] == "run"]
        for index, args in enumerate(runs):
            self.assertEqual(args[args.index("--120_clip_index")+1], str(index))
            self.assertEqual(args[args.index("--122_clip_index")+1], str(index+1))
            self.assertEqual(args[args.index("--15_noise_seed")+1], str(42+index))
            self.assertNotIn("--121_context_length", args)
        self.assertAlmostEqual(sum(c["expected_duration"] for c in self.state["clips"]), 328/24)
        self.assertEqual(self.run_next(), {"complete": True, "clips": 3})
        self.assertEqual(len([c for c in self.calls if c[1] == "run"]), 3)

    def test_failure_does_not_advance_and_blocks_automatic_retry(self):
        with patch.object(chain, "preset_fingerprint", return_value={"a": "b"}), patch.object(chain, "command_json", side_effect=RuntimeError("lost transport")):
            with self.assertRaises(RuntimeError):
                chain.next_clip(self.state_path, self.state, "comfy-agent")
        self.assertEqual(self.state["clips"], [])
        self.assertEqual(json.loads(self.state_path.read_text())["pending"], 1)
        with self.assertRaisesRegex(RuntimeError, "uncertain"):
            self.run_next()
        self.run_next(retry_pending=True)
        self.assertEqual(len(self.state["clips"]), 1)

    def test_completed_result_recovers_without_regeneration(self):
        file = self.root / "runs/00001/result.json"
        file.parent.mkdir(parents=True)
        self.command(["cli", "run"], file)
        self.calls.clear()
        self.state["pending"] = 1
        self.run_next()
        self.assertEqual([c[1] for c in self.calls], ["verify"])
        self.assertEqual(len(self.state["clips"]), 1)

    def test_verification_failure_keeps_result_for_recheck(self):
        original = self.command
        def fail_verify(args, result_file=None):
            if args[1] == "verify":
                raise RuntimeError("duration mismatch")
            return original(args, result_file)
        with patch.object(chain, "preset_fingerprint", return_value={"a": "b"}), patch.object(chain, "command_json", side_effect=fail_verify):
            with self.assertRaises(RuntimeError):
                chain.next_clip(self.state_path, self.state, "cli")
        self.assertEqual(self.state["clips"], [])
        self.calls.clear()
        self.run_next()
        self.assertEqual([c[1] for c in self.calls], ["verify"])

    def test_changed_preset_stops_before_render(self):
        with patch.object(chain, "preset_fingerprint", return_value={"a": "changed"}), patch.object(chain, "command_json") as command:
            with self.assertRaisesRegex(ValueError, "Preset or workflow changed"):
                chain.next_clip(self.state_path, self.state, "cli")
            command.assert_not_called()

    def test_changed_reference_stops_before_render(self):
        file = self.root / "voice.wav"
        file.write_bytes(b"changed")
        self.state["plan"]["audio"] = str(file)
        self.state["plan"]["references"] = {"audio": hashlib.sha256(b"original").hexdigest()}
        with self.assertRaisesRegex(ValueError, "Reference changed"):
            self.run_next()
        self.assertEqual(self.calls, [])

    def test_reject_invalid_plan(self):
        for change in [{"length": 125}, {"width": 720}, {"seed": -1}, {"seed": True},
                       {"preset": "minimax_h3_vdn_t2v"}, {"prompts": []},
                       {"prompts": [""]}, {"unknown": "x"}, {"image": "x"}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                chain.validate_plan({"prompts": ["a"], **change})

    def test_assembly_requires_completed_chain_and_preserves_existing_file(self):
        with self.assertRaisesRegex(ValueError, "Finish all clips"):
            chain.assemble(self.state, self.root / "out.mp4")
        self.state["clips"] = [{}]*3
        output = self.root / "out.mp4"
        output.write_bytes(b"keep")
        with self.assertRaisesRegex(ValueError, "already exists"):
            chain.assemble(self.state, output)
        self.assertEqual(output.read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
