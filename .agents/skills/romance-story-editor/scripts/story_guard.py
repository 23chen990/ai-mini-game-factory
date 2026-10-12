#!/usr/bin/env python3
"""A read-only text-only guard for r4-shaped interactive fiction JSON.

Does not approve plot logic, relationship consent, grammar, browser behavior or enjoyment.
Refuses to overwrite files or accept unknown source structure. Requires Python 3.10+.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

MAX_SOURCE_BYTES = 20 * 1024 * 1024
MAX_PATCH_EDITS = 2000
TOKEN_RE = re.compile(r"\{\{[^{}]+\}\}|\$\{[^{}]+\}|\{[A-Za-z_][A-Za-z0-9_.]*\}|%\([A-Za-z_][A-Za-z0-9_]*\)[sdf]")
# Heuristics trigger manual review, never an AI-authorship accusation or deletion.
WARNINGS = {
    "abstract_contrast": re.compile(r"(?:不是|并非).{0,22}(?:而是|只是)"),
    "generic_recognition": re.compile(r"(?:重新认识你|让我看到(?:了)?(?:另一面|不一样的))"),
    "abstract_fate": re.compile(r"(?:命运的齿轮|改变了整个世界|终于明白了什么)"),
}


class GuardError(ValueError):
    """A safety or format contract has been violated."""


def require(condition: Any, message: str) -> None:
    if not condition:
        raise GuardError(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def line_hash(speaker: str, text: str) -> str:
    return sha256((speaker + "\0" + text).encode("utf-8"))[:16]


def encode(data: Any) -> bytes:
    return (json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def parse_document(content: str) -> dict:
    def pairs(items: list) -> dict:
        output = {}
        for key, value in items:
            require(key not in output, f"Duplicate JSON key: {key}")
            output[key] = value
        return output

    def bad_constant(value: str) -> None:
        raise GuardError(f"Non-finite JSON value: {value}")

    try:
        output = json.loads(content, object_pairs_hook=pairs, parse_constant=bad_constant)
    except (ValueError, RecursionError) as exc:
        raise GuardError(str(exc)) from exc
    require(isinstance(output, dict), "JSON root must be an object")
    return output


def read_document(path: Path) -> tuple[bytes, dict]:
    require(path.is_file(), f"No source file: {path}")
    require(path.stat().st_size <= MAX_SOURCE_BYTES, "Input exceeds 20 MiB limit")
    raw = path.read_bytes()
    try:
        return raw, parse_document(raw.decode("utf-8-sig"))
    except UnicodeError as exc:
        raise GuardError("Input must be UTF-8") from exc


def ptr(tokens: tuple[str | int, ...]) -> str:
    return "/" + "/".join(str(token).replace("~", "~0").replace("/", "~1") for token in tokens)


def allowed_slots(data: dict) -> tuple[dict[str, tuple[dict, str]], dict[str, dict]]:
    """Explicit display fields ONLY. Unknown fields are preserved by structural check."""
    slots: dict[str, tuple[dict, str]] = {}
    line_hashes: dict[str, dict] = {}

    def add(obj: dict, key: str, location: tuple) -> None:
        if key in obj:
            require(type(obj[key]) is str, f"Expected text string at {ptr(location + (key,))}")
            slots[ptr(location + (key,))] = (obj, key)

    def lines(value: Any, location: tuple) -> None:
        require(isinstance(value, list), f"Expected line list at {ptr(location)}")
        for i, line in enumerate(value):
            at = location + (i,)
            require(isinstance(line, dict), f"Expected line at {ptr(at)}")
            require(all(type(line.get(key)) is str for key in ("id", "speaker", "text", "textHash")),
                    f"Unknown line fields at {ptr(at)}")
            add(line, "text", at)
            line_hashes[ptr(at + ("textHash",))] = line

    def blocks(value: Any, location: tuple) -> None:
        require(isinstance(value, list), f"Expected block list at {ptr(location)}")
        for i, block in enumerate(value):
            at = location + (i,)
            require(isinstance(block, dict) and "when" in block and "lines" in block,
                    f"Unknown conditional block at {ptr(at)}")
            lines(block["lines"], at + ("lines",))

    def unit(obj: Any, location: tuple) -> None:
        require(isinstance(obj, dict), f"Expected narrative object at {ptr(location)}")
        add(obj, "title", location)
        lines(obj.get("body", []), location + ("body",))
        blocks(obj.get("blocks", []), location + ("blocks",))
        choices = obj.get("choices", [])
        require(isinstance(choices, list), f"Expected choice list at {ptr(location + ('choices',))}")
        for i, choice in enumerate(choices):
            at = location + ("choices", i)
            require(isinstance(choice, dict), f"Expected choice at {ptr(at)}")
            add(choice, "label", at)
            lines(choice.get("reply", []), at + ("reply",))
            blocks(choice.get("replyBlocks", []), at + ("replyBlocks",))

    keys = [key for key in ("scenes", "items", "modules") if key in data]
    require(len(keys) == 1, "Unknown/ambiguous story format: expected scenes OR items OR modules")
    key = keys[0]
    value = data[key]
    if key == "scenes":
        require(isinstance(value, dict) and bool(value), "Expected nonempty scenes map")
        for scene_id, scene in value.items():
            unit(scene, ("scenes", scene_id))
    else:
        require(isinstance(value, list) and bool(value), f"Expected nonempty {key} list")
        for i, episode in enumerate(value):
            unit(episode, (key, i))
    require(bool(slots), "No recognized display fields")
    return slots, line_hashes


def validate(data: dict) -> None:
    slots, hashes = allowed_slots(data)
    for path, (owner, key) in slots.items():
        value = owner[key]
        require(bool(value.strip()), f"Empty visible text at {path}")
        require(not re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", value),
                f"Unsafe control character at {path}")
    for path, line in hashes.items():
        require(line["textHash"] == line_hash(line["speaker"], line["text"]),
                f"Incorrect derived textHash at {path}")


def structure_sha(data: dict) -> str:
    clone = copy.deepcopy(data)
    slots, hashes = allowed_slots(clone)
    for owner, key in slots.values():
        owner[key] = None
    for line in hashes.values():
        line["textHash"] = None
    return sha256(json.dumps(clone, ensure_ascii=False, allow_nan=False,
                             sort_keys=True, separators=(",", ":")).encode("utf-8"))


def compare(before: dict, after: dict) -> dict:
    validate(before)
    validate(after)
    baseline_structure = structure_sha(before)
    require(baseline_structure == structure_sha(after),
            "Protected structure changed (IDs, state, timing, effects, conditions, fields, order, speaker or endings)")
    previous, _ = allowed_slots(before)
    current, _ = allowed_slots(after)
    require(previous.keys() == current.keys(), "Display slot addresses changed")
    modified = []
    for path, (old, key) in previous.items():
        now, current_key = current[path]
        if old[key] == now[current_key]:
            continue
        require(sorted(TOKEN_RE.findall(old[key])) == sorted(TOKEN_RE.findall(now[current_key])),
                f"Runtime placeholders changed at {path}")
        modified.append({"path": path, "before": old[key], "after": now[current_key]})
    return {"status": "PASS", "scope": "TEXT_ONLY_STRUCTURE; not a semantic or player-experience verdict",
            "structureSha256": baseline_structure, "changedTextCount": len(modified), "changes": modified}


def inventory(data: dict, with_text: bool = False) -> dict:
    validate(data)
    slots, hashes = allowed_slots(data)
    warnings, speakers = [], Counter()
    for line in hashes.values():
        speakers[line["speaker"]] += 1
    for path, (owner, key) in slots.items():
        value = owner[key]
        for warning, pattern in WARNINGS.items():
            if pattern.search(value):
                warnings.append({"path": path, "candidateIssue": warning, "excerpt": value[:220],
                                 "decision": "MANUAL_REVIEW_ONLY"})
    report = {"status": "PASS", "scope": "INVENTORY; not an AI detector or editing verdict",
              "visibleTextFields": len(slots), "hashedLines": len(hashes),
              "speakerLineCounts": dict(sorted(speakers.items())),
              "structureSha256": structure_sha(data), "styleReviewCandidates": warnings}
    if with_text:
        report["displaySlots"] = [{"path": path, "text": owner[key]} for path, (owner, key) in slots.items()]
    return report


def apply_edits(source: dict, raw: bytes, edits_document: dict) -> tuple[dict, dict]:
    require(set(edits_document) == {"schemaVersion", "sourceSha256", "edits"},
            "Patch keys must be schemaVersion, sourceSha256 and edits")
    require(type(edits_document["schemaVersion"]) is int and edits_document["schemaVersion"] == 1,
            "Unknown patch schemaVersion")
    require(edits_document["sourceSha256"] == sha256(raw), "Source hash mismatch; rebase patch before editing")
    edits = edits_document["edits"]
    require(type(edits) is list and 0 < len(edits) <= MAX_PATCH_EDITS, "Invalid edits size")
    validate(source)
    target = copy.deepcopy(source)
    slots, hashes = allowed_slots(target)
    touched = set()
    for edit in edits:
        require(isinstance(edit, dict), "Each edit must be an object")
        path = edit.get("path")
        require(type(path) is str and path in slots, f"Not a display slot: {path}")
        require(path not in touched, f"Duplicate edit path: {path}")
        touched.add(path)
        owner, key = slots[path]
        is_line = key == "text" and "textHash" in owner
        required = {"path", "before", "after", "reason"}
        if is_line:
            required |= {"lineId", "speaker"}
        require(set(edit) == required, f"Unexpected/missing edit fields for {path}: {sorted(required)}")
        require(all(type(v) is str for v in edit.values()), "Edit fields must all be strings")
        if is_line:
            require(edit["speaker"] == owner["speaker"] and edit["lineId"] == owner["id"],
                    f"Line speaker/id mismatch at {path}; inspect the actual JSON row")
        require(owner[key] == edit["before"], f"Stale before text at {path}")
        require(edit["after"] != edit["before"], f"No change at {path}")
        require(bool(edit["reason"].strip()), f"No editorial reason at {path}")
        owner[key] = edit["after"]
    for line in hashes.values():
        line["textHash"] = line_hash(line["speaker"], line["text"])
    report = compare(source, target)
    report.update(sourceSha256=sha256(raw), candidateSha256=sha256(encode(target)),
                  published=False, baselineOverwritten=False)
    return target, report


def new_target(path: Path, existing: list[Path]) -> None:
    require(path.parent.is_dir() and not path.parent.is_symlink(),
            f"Output parent must already be a real directory: {path.parent}")
    require(not path.exists() and not path.is_symlink(), f"Output already exists: {path}")
    require(all(path.resolve() != previous.resolve() for previous in existing),
            f"Output path aliases an input: {path}")


def write_once(path: Path, obj: Any) -> None:
    # Binary exclusive create: never overwrite src, patch, another report or a prior candidate.
    with path.open("xb") as destination:
        destination.write(encode(obj))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="operation", required=True)
    inv = sub.add_parser("inventory", help="Identify text slots and human-review candidates")
    inv.add_argument("--source", type=Path, required=True)
    inv.add_argument("--include-text", action="store_true")
    chk = sub.add_parser("check", help="Compare a candidate with the original")
    chk.add_argument("--before", type=Path, required=True)
    chk.add_argument("--after", type=Path, required=True)
    apply = sub.add_parser("apply", help="Generate an exclusively new candidate from a reviewed patch")
    apply.add_argument("--source", type=Path, required=True)
    apply.add_argument("--patch", type=Path, required=True)
    apply.add_argument("--output", type=Path, required=True)
    for operation in (inv, chk, apply):
        operation.add_argument("--report", type=Path)
    args = parser.parse_args()
    existing = [getattr(args, key) for key in ("source", "before", "after", "patch") if hasattr(args, key)]
    try:
        if args.operation == "apply":
            new_target(args.output, existing)
            existing.append(args.output)
        if args.report:
            new_target(args.report, existing)
        if args.operation == "inventory":
            raw, source = read_document(args.source)
            report = inventory(source, args.include_text)
            report["sourceSha256"] = sha256(raw)
        elif args.operation == "check":
            old_raw, old = read_document(args.before)
            new_raw, new = read_document(args.after)
            report = compare(old, new)
            report.update(sourceSha256=sha256(old_raw), candidateSha256=sha256(new_raw))
        else:
            raw, source = read_document(args.source)
            _, edits = read_document(args.patch)
            target, report = apply_edits(source, raw, edits)
            write_once(args.output, target)
        if args.report:
            write_once(args.report, report)
        else:
            print(encode(report).decode("utf-8"), end="")
        return 0
    except (OSError, ValueError, UnicodeError, TypeError, RecursionError, KeyError) as exc:
        print(json.dumps({"status": "FAIL", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
