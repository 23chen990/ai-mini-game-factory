#!/usr/bin/env python3
"""Pure standard-library unit tests; fixture is invented and not user story text."""
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import story_guard as g


def row(text="Hi, {{name}}.", speaker="P", row_id="first"):
    return {"id": row_id, "speaker": speaker, "text": text, "textHash": g.line_hash(speaker, text)}


def sample():
    return {"version": "fixture-v1", "entry": "start", "actionBudget": 10,
            "cast": {"t": "A"}, "scenes": {"start": {
                "id": "start", "title": "The first encounter", "kind": "anchor",
                "body": [row()], "blocks": [{"id": "b1", "when": {"eq": ["met", True]},
                "lines": [row("I know you.", "T", "b1")]}],
                "choices": [{"id": "meet", "label": "Introduce yourself",
                             "reply": [row("Nice to meet you.", "P", "reply")],
                             "replyBlocks": [], "effects": [{"op": "set", "key": "met", "value": True}],
                             "next": "end"},
                            {"id": "leave", "label": "Leave", "reply": [], "effects": []}],
                "next": "end"}}}


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.story = sample()

    def test_valid_inventory(self):
        inv = g.inventory(self.story)
        self.assertEqual(inv["visibleTextFields"], 6)
        self.assertEqual(inv["hashedLines"], 3)
        self.assertEqual(inv["status"], "PASS")
        self.assertEqual(g.compare(self.story, copy.deepcopy(self.story))["changedTextCount"], 0)

    def test_text_only_change_and_hash(self):
        revised = copy.deepcopy(self.story)
        original = revised["scenes"]["start"]["body"][0]
        original.update(text="Hello, {{name}}.", textHash=g.line_hash("P", "Hello, {{name}}."))
        self.assertEqual(g.compare(self.story, revised)["changedTextCount"], 1)

    def test_title_label_reply_change(self):
        revised = copy.deepcopy(self.story)
        scene = revised["scenes"]["start"]
        scene["title"] = "A new title"
        scene["choices"][0]["label"] = "Tell her your name"
        r = scene["choices"][0]["reply"][0]
        r.update(text="Let's talk.", textHash=g.line_hash("P", "Let's talk."))
        self.assertEqual(g.compare(self.story, revised)["changedTextCount"], 3)

    def test_refuse_structural_changes(self):
        mutations = [
            lambda d: d.update(version="new"),
            lambda d: d.update(actionBudget=11),
            lambda d: d.update(entry="bypass"),
            lambda d: d["scenes"]["start"].update(next="secret"),
            lambda d: d["scenes"]["start"]["body"][0].update(id="different"),
            lambda d: d["scenes"]["start"]["body"][0].update(speaker="T"),
            lambda d: d["scenes"]["start"]["blocks"][0].update(when={"eq": ["met", False]}),
            lambda d: d["scenes"]["start"]["choices"][0].update(id="secret"),
            lambda d: d["scenes"]["start"]["choices"][0]["effects"][0].update(value=False),
            lambda d: d["scenes"]["start"]["choices"].reverse(),
            lambda d: d["scenes"]["start"]["body"].append(row("Extra")),
            lambda d: d["scenes"]["start"].update(text="hidden"),
            lambda d: d.update(actionBudget=10.0),
            lambda d: d.pop("scenes"),
        ]
        for mutate in mutations:
            with self.subTest(mutation=str(mutate)):
                candidate = copy.deepcopy(self.story)
                mutate(candidate)
                with self.assertRaises(g.GuardError):
                    g.compare(self.story, candidate)

    def test_placeholder_and_whitespace(self):
        for replacement in ["No greeting", "Hello, {{friend}}.", "Hi, {{name}} and {extra}.", "  ", "Hi\x00there"]:
            with self.subTest(replacement=replacement):
                after = copy.deepcopy(self.story)
                obj = after["scenes"]["start"]["body"][0]
                obj.update(text=replacement, textHash=g.line_hash("P", replacement))
                with self.assertRaises(g.GuardError):
                    g.compare(self.story, after)

    def test_stale_hash(self):
        after = copy.deepcopy(self.story)
        after["scenes"]["start"]["body"][0]["text"] = "Changed"
        with self.assertRaises(g.GuardError):
            g.compare(self.story, after)

    def test_duplicate_keys_and_non_finite(self):
        for content in ('{"a":1,"a":2}', '{"x": NaN}', '{"x": Infinity}'):
            with self.subTest(content=content), self.assertRaises(g.GuardError):
                g.parse_document(content)

    def test_unsupported_and_sidecar(self):
        with self.assertRaises(g.GuardError):
            g.allowed_slots({"someNarrative": []})
        for key in ("items", "modules"):
            original = {key: [{"id": "sample", "when": {"eq": ["a", True]},
                               "body": [row("Start")], "title": "End"}]}
            later = copy.deepcopy(original)
            obj = later[key][0]["body"][0]
            obj.update(text="Finish", textHash=g.line_hash("P", "Finish"))
            self.assertEqual(g.compare(original, later)["changedTextCount"], 1)

    def test_escaped_pointer(self):
        scene = self.story["scenes"].pop("start")
        self.story["scenes"]["a/b~c"] = scene
        slots, _ = g.allowed_slots(self.story)
        self.assertIn("/scenes/a~1b~0c/body/0/text", slots)

    def test_patch_generation_and_readonly_cli(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "STORY.json"
            content = g.encode(self.story)
            source.write_bytes(content)
            patch_path, candidate, report = root / "patch.json", root / "candidate.json", root / "report.json"
            valid = {"schemaVersion": 1, "sourceSha256": hashlib.sha256(content).hexdigest(),
                     "edits": [{"path": "/scenes/start/body/0/text", "before": "Hi, {{name}}.",
                                "after": "Hello, {{name}}.", "reason": "Use a natural greeting.",
                                "lineId": "first", "speaker": "P"}]}
            exe = Path(g.__file__)
            def run(patch, *extra):
                patch_path.write_text(json.dumps(patch), encoding="utf-8")
                return subprocess.run([sys.executable, str(exe), "apply", "--source", str(source),
                                       "--patch", str(patch_path), "--output", str(candidate), *extra],
                                      text=True, capture_output=True)
            bad = copy.deepcopy(valid)
            bad["sourceSha256"] = "0" * 64
            self.assertNotEqual(run(bad).returncode, 0)
            bad = copy.deepcopy(valid)
            bad["edits"][0]["before"] = "stale text"
            self.assertNotEqual(run(bad).returncode, 0)
            bad = copy.deepcopy(valid)
            bad["edits"][0]["path"] = "/scenes/start/choices/0/effects/0/value"
            self.assertNotEqual(run(bad).returncode, 0)
            bad = copy.deepcopy(valid)
            bad["edits"][0]["speaker"] = "N"
            self.assertNotEqual(run(bad).returncode, 0)
            bad = copy.deepcopy(valid)
            bad["edits"][0]["lineId"] = "other-line"
            self.assertNotEqual(run(bad).returncode, 0)
            bad = copy.deepcopy(valid)
            bad["edits"].append(copy.deepcopy(bad["edits"][0]))
            self.assertNotEqual(run(bad).returncode, 0)
            self.assertFalse(candidate.exists())
            self.assertNotEqual(run(valid, "--report", str(source)).returncode, 0)
            self.assertFalse(candidate.exists())
            result = run(valid, "--report", str(report))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(report.read_text())["status"], "PASS")
            self.assertEqual(json.loads(candidate.read_text())["scenes"]["start"]["body"][0]["text"], "Hello, {{name}}.")
            self.assertNotEqual(run(valid).returncode, 0, "Must not overwrite candidate")
            self.assertEqual(source.read_bytes(), content, "Never overwrite original")


if __name__ == "__main__":
    unittest.main(verbosity=2)
