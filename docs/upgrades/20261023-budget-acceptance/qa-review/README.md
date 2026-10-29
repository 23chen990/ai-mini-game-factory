# Rejected absence claims

The four PNGs are unedited frames decoded from the subject's own first-run videos, not new gameplay. The original stills missed transient world-local `+1`; review did not change the original QA output.

Reproduce with the Playwright-bundled ffmpeg (or compatible ffmpeg):

```sh
ffmpeg -ss 24.8 -i '<blind-output>/video-390-run1/page@7f561af4f071005e20a6a6863a30aa60.webm' -t 3 -r 8 -frames:v 24 frame-%02d.png
# Published portrait frames: 03 and 04
ffmpeg -ss 34.3 -i '<blind-output>/video-1100-run1/page@235dcec036b9a559eda3ee08d4eacd1c.webm' -t 3 -r 8 -frames:v 24 frame-%02d.png
# Published desktop frames: 02 and 03
```

Seek/sample times are approximate video positions, not measured simulation timestamps. Source-video hashes and frame hashes are in `../blind-adjudication.json`. Local full extraction/contact sheets are retained under the exact run's `blind-qa-v2/controller-review/`. No inference about the implementation root cause or full reward event order is accepted from these frames.
