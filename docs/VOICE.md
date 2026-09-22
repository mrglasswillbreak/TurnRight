# Offline voice directions

TurnRight uses one built-in British female voice: **Kokoro v1.0, `bf_emma`**. Complete recorded sentences play locally; there is no speech API, runtime AI model, browser speech synthesis or invented landmark guidance. Search and routing remain campus-only.

## Driving additions

The pack also includes driving departure, parking arrival, and roundabout guidance. Driving uses 50–200 m advance cues and 12–35 m immediate cues according to recent speed. Missing speed uses the route estimate. Parking arrival prompts the explicit walking handoff. The current pack contains 362 phrase entries and remains within the 8 MiB budget.

## What is spoken

- Advance warnings arrive about 30 seconds ahead using the median of recent valid walking speeds, clamped to 30–60 metres. Missing or implausible speed uses 1.25 m/s.
- Immediate turn cues use 8–12 metres according to speed, only with GPS accuracy of 15 metres or better. Less accurate fixes retain advance speech and visual directions.
- Maneuvers remain eligible until five metres past their position, including turns near the destination. Consecutive turns within 25 metres share one sentence; the second advance warning is suppressed, while its immediate cue remains available.
- Routine cues are deduplicated and have an eight-second cooldown. Immediate turns and state changes bypass that cooldown. Routine speech waits for current speech; urgent state changes can interrupt it. A replacement route cancels obsolete recordings, including ones still loading.
- GPS accuracy worse than 35 metres, or no updated fix for 12 seconds, pauses turn speech. One warning plays per episode. Two distinct good fixes are required before recovery is announced. Turn speech also pauses while off route or waiting for a replacement route.
- Arrival is spoken only after the existing three-fix endpoint confirmation. A mapped entrance and an unverified nearby approach have different messages.
- Repeat describes the current navigation state. Mute, Stop and backgrounding cancel playback; foregrounding and unmuting reassess current guidance. Navigation still requires the app to remain in the foreground.

Settings includes a representative preview outside navigation. Keep device volume audible; the web app cannot override silent modes, audio routing, OS power saving or background restrictions.

## Names and offline delivery

The initial vocabulary comes from published map **`lasu-06da0dddfcf6`**: 189 source name spellings (188 names after whitespace/case normalization) and one useful road name, **LAW road**. Generic labels such as Campus path and Campus road are omitted from named-road speech. The catalogue has 359 complete recordings, including turn variants, close turns and state messages.

Name matching normalizes Unicode, whitespace and case. Recorded names use neutral complete sentences (for example, “Your destination is Faculty Of Law”) after departure/arrival guidance. Road variants contain the whole distance-and-turn sentence. New names or renamed places without recordings receive generic directions; their current original names still appear on screen. No map publication is blocked by missing voice names.

`data/voice/pronunciation.json` changes only speech input. Original names remain in the catalogue transcripts and on screen. Acronyms without an established expansion are spelled out. Local place-name pronunciation still needs a listener familiar with LASU; it is not established by successful audio decoding.

All MP3s are mono, 24 kHz, 48 kbit/s, with consistent RMS normalization and peak limiting. Content hashes form immutable filenames. The voice manifest records transcripts, durations, byte counts, checksums, source map version/hash, and model revision/checksums. The shipped pack is **6,123,717 bytes (5.84 MiB)**, under its **8 MiB** budget, including the manifest. Decoded recordings range from 1.39–6.70 seconds and −22.2 to −20.5 dBFS RMS.

Workbox precaches the complete voice pack with the application, independently of the campus-package format. Finish saving the app **and** downloading the campus map before disconnecting. No separate voice download is needed. If a natural clip or manifest fails, playback tries the original downloaded WAV recordings; if neither is available, it reports the failure and leaves visual guidance usable. Storage eviction can remove offline assets.

## Explicit regeneration

Normal deployment builds only validate and precache the checked-in audio. They do not download models or generate speech, and they do not regenerate the campus map.

Use Node 22 and Python **3.12** with an isolated environment. The hash-locked dependency file includes the CPU PyTorch build, Kokoro/Misaki, the English pronunciation model, eSpeak NG loader, MP3 encoder and decoding dependencies. With [uv](https://docs.astral.sh/uv/):

```sh
uv venv --python 3.12 .venv-voice
uv pip sync scripts/voice-requirements.txt --python .venv-voice --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match --require-hashes
node scripts/voice-catalogue.mjs
uv run --no-project --python .venv-voice python scripts/generate-voice.py
uv run --no-project --python .venv-voice python scripts/check-voice.py
node scripts/voice-catalogue.mjs --report
```

The catalogue command fetches and verifies the current published campus package. `PUBLISHED_MAP_URL` can select another approved HTTPS origin. Review vocabulary/pronunciations before generation. `--report` prints missing destination/road names relative to the current publication and exits nonzero when any are missing; it never changes the map or recordings.

Generation downloads the pinned model/voice/config to the system temporary directory (`turnright-voice-model`), verifying their SHA-256 hashes before loading. `--cache PATH` chooses another maintenance cache. The generator resumes from a cache keyed by text, model checksums and audio settings. `--limit 13` performs a smoke check without writing a complete pack manifest; do not release partial output. Models and the virtual environment must not be committed or shipped.

The model revision is `f3ff3571791e39611d31c381e3a41a3af07b4987`:

| File | SHA-256 |
| --- | --- |
| `kokoro-v1_0.pth` | `496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4` |
| `voices/bf_emma.pt` | `d0a423deabf4a52b4f49318c51742c54e21bb89bbbe9a12141e7758ddb5da701` |
| `config.json` | `5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f` |

The model declares Apache 2.0. See the [model card](https://huggingface.co/hexgrad/Kokoro-82M), [voice documentation](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md), [retained license](../data/voice/KOKORO-LICENSE.txt) and [project attribution](../data/ATTRIBUTION.md). Maintenance libraries keep their respective upstream licenses; only generated audio ships to phones.

## Verification and remaining device checks

Unit tests cover slow/fast walking, accuracy thresholds, missed fixes, nearby turns, backtracking, repeated GPS outages, rerouting, arrival, name fallback, serial playback, interruptions, loading cancellation, mute, preview and failures. Asset tests verify every transcript/hash, catalogue coverage, durations and the total budget. The build additionally checks that every voice asset is in the production precache. `scripts/check-voice.py` decodes all recordings and checks mono sample rate, duration, RMS level, finite samples and peaks.

For repeatable in-app-browser walks, start Vite and open `/tests/fixtures/voice-check.html`. This local-only page uses the real guidance hook and real recorded audio with synthetic GPS controls and a playback event log. It is not part of the production build. Exercise the turn/GPS/arrival buttons, Repeat, Mute, Stop, and tab background/foreground changes. Start a fresh walk between independent cases. The separate public Settings preview verifies application integration.

For offline acceptance, use a production preview, finish downloading the campus map, wait for app readiness, stop its server and reload. Play the Settings preview and inspect audio requests: recordings must resolve from the same-origin precache without external audio requests. Check mobile and desktop controls.

**18 September 2026 acceptance:** 378 unit/asset tests passed across the regression and final voice runs; all recordings decoded and all published names were covered. The in-app browser exercised actual audio playback on desktop and mobile, combined turns, GPS recovery, rerouting, mute, Repeat during arrival, preview cancellation and simulated visibility changes. A fixed production preview downloaded the campus package, reloaded with its server stopped, and completed the natural-voice preview on mobile and desktop. All 358 distinct voice files (357 MP3 files reused by 359 phrase entries, plus the manifest) were present in the app precache. No external speech service was requested.

Keep a production preview's build directory fixed while testing. Rebuilding it repeatedly while service-worker updates were waiting produced a local cache with missing changed app files; the fresh, fixed-build check was run separately. A controlled update between two fixed app versions also activated successfully and reopened offline; the earlier failure was confined to the repeatedly overwritten local preview.

**Remaining physical checks:** listen to the preview, left/right/U-turn and close-turn sentences, GPS/arrival messages, LAW road, LASU and unfamiliar campus names; verify intelligibility and pronunciation with a campus user. This agent environment can decode and exercise playback but cannot hear audio, so it does not establish subjective audio quality. Check iPhone Safari/installed PWA and Android speaker/headphones, silent mode, interruptions, device locking, weak reception and outdoor timing. Browser simulation does not replace a real walk or establish the safety of mapped entrance connections.
