"""Archive this run's evidence only; never include account/private responses."""
import hashlib
import json
import pathlib
import subprocess
import zipfile

ROOT = pathlib.Path.cwd()
RUN = ROOT / "runs/h5-qq-mobile-20261013"
FINAL = RUN / "artifacts/final-20261020"
DOC = ROOT / "docs/lean-pilot/racing-final-20261020"
OUTPUT = FINAL / "delivery/racing-qa-evidence-20261020.1.zip"
files = set(DOC.rglob("*"))
files.update([RUN / "artifacts/build-racing.json", RUN / "artifacts/repair-history.json"])

# Deliberate allowlist: no recursive inclusion of the account-response folder.
for pattern in ["*.tap", "*.log", "*.png"]:
    files.update(FINAL.glob(pattern))
for name in [
    "baseline-build.json", "baseline-ai-150.json", "baseline-geometry-30.json",
    "baseline-preview.json", "baseline-preview.mjs", "baseline-to-final-ai-comparison.json",
    "attempt15-build.json", "attempt16-build.json", "source-production-audit.json",
    "yaw-experiment.mjs", "yaw-experiment.json", "braking-experiment.mjs",
    "braking-experiment.json", "curvature-braking-experiment.mjs",
    "curvature-braking-experiment.json", "materials-inspect.json", "taptap-h5-preflight.json",
    "course-metrics.json", "main-merge-tree.txt", "preview-http.txt",
    "final-ci.json", "final-preview-provenance.txt", "final-commit-binding.json",
]:
    files.add(FINAL / name)
for name in ["final-ci.json", "final-preview-provenance.txt", "final-commit-binding.json"]:
    assert (FINAL / name).is_file(), name
for name in [
    "browser", "package-browser", "fuel-recovery", "attempt14",
    "attempt15/browser", "attempt15/documented-evidence",
    "ci-bde/artifacts/car-garage-ci", "ci-bde/artifacts/next-stage-ad-browser",
]:
    files.update((FINAL / name).rglob("*"))
files.add(FINAL / "attempt15/build-racing.json")
for name in [
    "final-baseline-natural", "final-natural-stage01", "final-natural-campaign",
    "rc15-natural-stage01", "rc15-natural-campaign",
    "rc16-natural-stage01", "rc16-natural-campaign", "rc16-natural-resume11",
]:
    files.update((RUN / "evidence" / name).rglob("*"))

files = sorted(file for file in files
               if file.is_file() and not file.name.startswith("page@")
               and "__pycache__" not in file.parts)
inventory = []
for file in files:
    assert file.name != "taptap-account-private.json"
    data = file.read_bytes()
    inventory.append({"path": str(file.relative_to(ROOT)), "bytes": len(data),
                      "sha256": hashlib.sha256(data).hexdigest()})

manifest = {
    "schemaVersion": 1,
    "gameId": "qq-speed",
    "deliveryCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "buildHash": json.loads((RUN / "artifacts/build-racing.json").read_text())["buildHash"],
    "status": "BLOCKED",
    "exclusions": [
        "Private TapTap account response and authentication state",
        "Duplicate Playwright page@ recordings; canonical natural-career.webm retained",
        "Obsolete delivery ZIP/HTML bytes (archived manifests/hashes retained)",
        "Reconstructible source node_modules and other games",
    ],
    "files": inventory,
}
with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    archive.writestr("EVIDENCE_MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    for file in files:
        archive.write(file, str(file.relative_to(ROOT)))
with zipfile.ZipFile(OUTPUT) as archive:
    assert archive.testzip() is None
result = {"path": OUTPUT.name, "bytes": OUTPUT.stat().st_size,
          "sha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(), "entries": len(files)}
(FINAL / "delivery/evidence-archive-manifest.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
