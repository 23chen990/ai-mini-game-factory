"""Archive only this racing run and its provenance, never account state or other games."""
import hashlib
import json
import pathlib
import subprocess
import zipfile
ROOT=pathlib.Path.cwd()
RUN=ROOT/'runs/h5-qq-mobile-20261013'
RAW=RUN/'artifacts/internal-experience-20261020'
DOC=ROOT/'docs/lean-pilot/racing-internal-20261020'
OUT=RAW/'delivery/racing-qa-evidence-rc19-20261020.zip'
files=set(DOC.rglob('*'))
files.update([RUN/'artifacts/build-racing.json',RUN/'artifacts/repair-history.json'])
for file in RAW.iterdir():
    if file.is_file() and file.suffix in ['.json','.txt','.log','.tap','.png']:
        files.add(file)
for directory in RAW.iterdir():
    if directory.is_dir() and directory.name.startswith(('browser','touch-','touch19-','material-','finish-','package-browser','recorded-item','preview-browser')):
        files.update(directory.rglob('*'))
for directory in (RUN/'evidence').iterdir():
    if directory.is_dir() and directory.name.startswith(('rc17-','rc18-','rc19-')):
        files.update(directory.rglob('*'))
# Cross-version evidence is provenance only, never credited as final19 wins.
for name in ['rc16-natural-stage01','rc16-natural-campaign','rc16-natural-resume11']:
    for file in (RUN/'evidence'/name).glob('*.json'):
        files.add(file)
for name in ['build-racing.json','natural-summary.json','ai-150.json']:
    files.add(ROOT/'docs/lean-pilot/racing-final-20261020/evidence'/name)
ci=RAW/'ci19/racing-v3-h5-6196faa085e18ac38b484fcfc1d6909c2bf22882/artifacts'
for name in ['car-garage-ci','next-stage-ad-browser']:
    files.update((ci/name).rglob('*'))
files=sorted(f for f in files if f.is_file() and not f.name.startswith('page@') and '__pycache__' not in f.parts)
for file in files:
    assert not any(word in file.name.lower() for word in ['account-private','access-token','auth-state']), file
inventory=[{'path':str(f.relative_to(ROOT)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in files]
manifest={'schemaVersion':1,'gameId':'qq-speed','workspace':'runs/h5-qq-mobile-20261013/workspace','deliveryCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'buildHash':json.loads((RUN/'artifacts/build-racing.json').read_text())['buildHash'],'status':'BLOCKED','exclusions':['Account/auth responses and unrelated games','Duplicate page@ videos; canonical natural-career.webm retained','Reconstructible node_modules/source and duplicate delivery archives'],'handlingIncident':'touch19-preservation-incident/preservation-note.txt discloses overwritten initial full touch report; original failed output touch19.log retained. Canonical final acceptance is separately labelled foreground-check.','files':inventory}
with zipfile.ZipFile(OUT,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    archive.writestr('EVIDENCE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    for file in files:
        archive.write(file,str(file.relative_to(ROOT)))
with zipfile.ZipFile(OUT) as archive:
    assert archive.testzip() is None
result={'path':OUT.name,'bytes':OUT.stat().st_size,'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'entries':len(files)}
(RAW/'delivery/evidence-archive-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
