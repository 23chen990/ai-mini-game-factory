"""Reproducible QA delivery, NOT the factory RELEASE stage or a platform RC."""
import hashlib
import json
import pathlib
import shutil
import zipfile

ROOT = pathlib.Path.cwd()
RUN = ROOT / "runs/h5-qq-mobile-20261013"
OUT = RUN / "artifacts/final-20261020/delivery"
DOC = ROOT / "docs/lean-pilot/racing-final-20261020/evidence"
SOURCE = "042c21168f0ac433b721e7b95b01d2bcbfce64e1"
VERSION = "racing-web-qa-20261020.1"
build = json.loads((RUN / "artifacts/build-racing.json").read_text())
assert build["attempt"] == 16
assert build["buildHash"] == "40cf9871719d1154d7d855a805f157f5c00a88b23d6700f90c119717772c7542"
OUT.mkdir(parents=True, exist_ok=True)

# Runtime payload only. Frozen acceptance tests remain unchanged in the run
# and are tested separately; neither tests nor their thresholds are deleted.
names = ["LICENSE.three.txt", "candidate.json", "engine.mjs", "index.html",
         "main.mjs", "platform.json", "style.css", "themes.mjs"]
payload = {name: (RUN / "workspace/game" / name).read_bytes() for name in names}
ci = RUN / "artifacts/final-20261020/ci-bde/artifacts/racing-v3-delivery/qq-speed-v3-h5.zip"
with zipfile.ZipFile(ci) as archive:
    for name, data in payload.items():
        assert archive.read(name) == data, name


def digest(data):
    return hashlib.sha256(data).hexdigest()


def zip_payload(file, prefix):
    with zipfile.ZipFile(file, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in payload.items():
            entry = zipfile.ZipInfo(prefix + name, date_time=(2026, 10, 20, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, data, compresslevel=9)
    with zipfile.ZipFile(file) as archive:
        assert archive.testzip() is None
        for name, data in payload.items():
            assert archive.read(prefix + name) == data


web = OUT / (VERSION + ".zip")
staging = OUT / "taptap-h5-staging-20261020.1.zip"
standalone = OUT / (VERSION + ".html")
zip_payload(web, "")
zip_payload(staging, "jisu-feichi/")
shutil.copyfile(RUN / build["trialName"], standalone)
assert digest(standalone.read_bytes()) == build["trialSha256"]


def entry(file):
    data = file.read_bytes()
    return {"path": file.name, "bytes": len(data), "sha256": digest(data)}


manifest = {
    "schemaVersion": 1, "version": VERSION, "status": "BLOCKED",
    "runtimeSourceCommit": SOURCE, "buildHash": build["buildHash"],
    "inputHash": build["inputHash"], "platformPackage": None,
    "WEB_RC": "BLOCKED_PRODUCT_ACCEPTANCE", "PLATFORM_RC": "NOT_BUILT",
    "READY_TO_SUBMIT": False,
    "files": [entry(web), entry(standalone)],
    "gameEntries": [{"path": name, "bytes": len(data), "sha256": digest(data)}
                    for name, data in payload.items()],
    "tests": "Excluded only from shipping archive; frozen workspace tests unchanged; source 420/420 and builder 28/28 executed separately.",
    "ciComparison": {
        "runId": 39380767821, "sourceCommit": "bde813d6f78f44809ae7d475c3dda4efda972823",
        "allShippedRuntimeEntriesByteIdentical": True,
        "limitation": "This is the earlier cold CI reference, not the final evidence-commit CI. Attempt16 fixes warm-build compatibility sync; default HTML/style already identical.",
    },
    "platformStagingPackage": {
        **entry(staging),
        "status": "LOCAL_PREFLIGHT_ONLY_NOT_PLATFORM_RC",
        "onlyChangeFromWebZip": "single game directory prefix; identical inner runtime files",
        "officialInspection": "evidence/taptap-h5-preflight.json",
    },
}
text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
(OUT / "delivery-manifest.json").write_text(text)
(DOC / "delivery-manifest.json").write_text(text)
print(text)
