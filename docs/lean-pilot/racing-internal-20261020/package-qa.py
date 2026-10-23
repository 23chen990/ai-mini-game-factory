"""Package the exact QA runtime, not a platform submission or factory RELEASE."""
import hashlib
import json
import os
import pathlib
import shutil
import zipfile

ROOT = pathlib.Path.cwd()
RUN = ROOT / 'runs/h5-qq-mobile-20261013'
DOC = ROOT / 'docs/lean-pilot/racing-internal-20261020'
OUT = RUN / 'artifacts/internal-experience-20261020/delivery'
VERSION = 'racing-web-rc19-20261020'
SOURCE = '6196faa085e18ac38b484fcfc1d6909c2bf22882'
build = json.loads((RUN / 'artifacts/build-racing.json').read_text())
assert build['attempt'] == 19
assert build['buildHash'] == '811e05f4f6207050a63939680de93b4b3b262904663a103048d310f1466e37d6'
OUT.mkdir(parents=True, exist_ok=True)
(DOC / 'evidence').mkdir(exist_ok=True)
names = ['LICENSE.three.txt', 'candidate.json', 'engine.mjs', 'index.html',
         'main.mjs', 'platform.json', 'style.css', 'themes.mjs']
payload = {name: (RUN / 'workspace/game' / name).read_bytes() for name in names}
# A real external CI archive is mandatory; absence or a byte mismatch is an error.
ci = pathlib.Path(os.environ['RACE_CI_WEB_ZIP']).resolve()
with zipfile.ZipFile(ci) as archive:
    for name, data in payload.items():
        assert archive.read(name) == data, name


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pack(file, prefix):
    with zipfile.ZipFile(file, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in payload.items():
            entry = zipfile.ZipInfo(prefix + name, date_time=(2026, 10, 20, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            archive.writestr(entry, data, compresslevel=9)
    with zipfile.ZipFile(file) as archive:
        assert archive.testzip() is None
        for name, data in payload.items():
            assert archive.read(prefix + name) == data


def entry(file):
    data = file.read_bytes()
    return {'path': file.name, 'bytes': len(data), 'sha256': digest(data)}


web = OUT / (VERSION + '.zip')
staging = OUT / 'taptap-h5-staging-rc19-20261020.zip'
standalone = OUT / (VERSION + '.html')
pack(web, '')
pack(staging, 'jisu-feichi/')
shutil.copyfile(RUN / build['trialName'], standalone)
assert digest(standalone.read_bytes()) == build['trialSha256']
manifest = {
    'schemaVersion': 1, 'version': VERSION, 'status': 'BLOCKED',
    'runtimeSourceCommit': SOURCE, 'buildHash': build['buildHash'], 'inputHash': build['inputHash'],
    'WEB_RC': 'BROWSER_CANDIDATE_WITH_DEVICE_ACCEPTANCE_PENDING',
    'PLATFORM_RC': 'NOT_BUILT', 'READY_TO_SUBMIT': False, 'platformPackage': None,
    'files': [entry(web), entry(standalone)],
    'gameEntries': [{'path': name, 'bytes': len(data), 'sha256': digest(data)} for name, data in payload.items()],
    'ciComparison': {'sourceCommit': SOURCE, 'archive': str(ci.relative_to(ROOT)),
                     'allEightRuntimeEntriesByteIdentical': True},
    'platformStagingPackage': {**entry(staging), 'status': 'LOCAL_PREFLIGHT_ONLY_NOT_PLATFORM_RC',
                              'onlyChangeFromWebZip': 'single directory prefix; identical inner runtime bytes'},
    'scope': 'Same tested browser runtime. Human/phone, live platform SDK, account and rights clearance remain separate. Tests are executed, not removed; they are not shipped as player assets.',
}
text = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
(OUT / 'delivery-manifest.json').write_text(text)
(DOC / 'evidence/delivery-manifest.json').write_text(text)
print(text)
