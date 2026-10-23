# Rendering layer isolation - continued repair

Target qq-speed, PR65, runs/h5-qq-mobile-20261013/workspace/game.

The b5daa32 warm layer-isolation run39047036629, artifact12106606571, measured native step below1ms but extremely slow canvas-presented frames. With game.render disabled ONLY in the diagnostic page, RAF recovered to26.9ms. A minimal empty scene with zero draw calls still averaged1655.7ms. This is not a human gameplay test and does not certify a production workaround.

The low-material Lambert experiment did not resolve the desktop failure, so it is withdrawn together with its six experimental tests. Restore exact session blob938d38b72114f0d875fa40aa4a7c9686dafeded0, retaining the proven completion fix and countdown severe-lag protection. Do not lower resolution or discard physical scenery.

Next controlled experiment compares Chromium's documented modes: --use-angle=swiftshader (whole browser driver) and --use-angle=swiftshader-webgl (WebGL fallback). Both keep the same native game, viewport, regular inputs and45s deadline. A fresh blank WebGL control is measured before the game, avoiding old queued rendering work. Official primary source: https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md . No Chromium security policy is bypassed; this uses the already explicit software-WebGL opt-in only on the trusted local QA page in GitHub Actions.

Stage03 real entry geometry fix remains. Physical handset and human experience QA remain NOT_RUN.
