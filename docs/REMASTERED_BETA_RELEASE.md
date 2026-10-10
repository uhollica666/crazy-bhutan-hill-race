# Remastered public beta handoff

Version: **0.4.0-beta.1**. Game: https://crazy-bhutan-hill-race.vercel.app/ · Distribution: https://crazy-bhutan-hill-race.vercel.app/download/ · Release: https://github.com/uhollica666/crazy-bhutan-hill-race/releases/tag/v0.4.0-beta.1

## Source and integration

The authoritative campaign baseline was `stage-6-integrated-validation` at `e79744b9f167ba1136ea98c407229145d5a1420c`, including `stage-6-final-three-levels` at `1992969`. The remaster was `update-2-visual-remaster` at `d2003b1`, including all Stage 8A/8B follow-ups. `stage-6-visual-remake` at `f82dffc` was already in the campaign history and was not imported twice.

The isolated candidate `codex/remastered-public-beta` merged the remaster in `9b0df91`; `3f1def3` completed camera work, cloud synchronization, packaging and release checks. Verified source `4a7285b` was promoted to main without discarding or force-pushing divergent history. Later main commits add confirmed download metadata and this handoff. The GitHub main branch contains the final source; `git rev-parse main` identifies its final commit.

All original worktrees, development branches, untracked assets and the original campaign checkout's unfinished working files were preserved. The camera implementation was copied to and finished in the release worktree at `D:/Projects/personal_projects/crazy-bhutan-hill-race-release`.

## Included behavior

Driver's Academy plus Levels 1–10; existing objectives, progression, upgrades and physics; four detailed vehicles and garage customization; remastered buildings, forests, road/ground surfaces, PBR lighting and weather; updated human/creature rigs and materials; campaign audio and music. Low graphics keeps the expensive remaster assets off. Saves retain their existing schema and safely default the new camera preferences.

Road shake follows surface type, wheel contact and speed, honors reduced motion and a saved shake setting. C, the HUD button or Gameplay settings select driver/chase views. The top-center reversing inset renders the actual rear scene, with a short hold to prevent flicker. The close view was repositioned to the front cabin and chase angular shake now applies after camera look-at.

A cloud synchronization race was fixed so an explicit flush waits for an in-progress synchronization and its follow-up. This prevents reporting pending data immediately after a requested flush.

## Validation

- Typecheck, lint and production Vite builds passed.
- Full integrated unit suite: 452 tests across 28 files passed. After the final synchronization regression was added, 35 camera/cloud tests passed; save compatibility checks also passed.
- Firebase emulator suite: all 38 tests passed.
- Browser checks passed for Route 0 entry, all ten campaign mission loads, keyboard driving/braking/reversing/pause/recover, mobile touch layout and simultaneous inputs, all four remastered garage models and saved cosmetics, Low without remaster requests, camera persistence and reversing inset, and offline PWA loading/gameplay.
- Reused the latest campaign QA completion evidence: `e2e-run.log` established the first five mission completions; `e2e-run2.log` established the remaining five and campaign completion. Older aggregate reports contained unrelated failures, so this handoff reuses only the passing mission-completion results. Stale browser expectations for party counts, dusk lighting and the new Academy entry were updated to actual campaign data.
- Actual Windows WebView2 launch loaded the bundled garage/model with no page/resource errors: `docs/release/native-windows-check.json`.
- Public production game returned HTTP 200 and loaded its detailed garage vehicle. Final deployment and download-page checks are recorded in `docs/release/public-deployment-check.json`.

## Artifacts

| Platform      | File                                    |       Bytes | Status                                        |
| ------------- | --------------------------------------- | ----------: | --------------------------------------------- |
| Windows x64   | CBHR_0.4.0-beta.1_windows_x64_setup.exe |  98,384,458 | NSIS installer, unsigned                      |
| Windows x64   | CBHR_0.4.0-beta.1_windows_x64.msi       |  98,844,672 | MSI installer, unsigned                       |
| Android ARM64 | CBHR_0.4.0-beta.1_android_arm64.apk     | 103,956,143 | Signed release APK, verified APK v2 signature |

The release includes SHA256SUMS.txt. The download manifest contains only confirmed GitHub-uploaded artifacts. Android package is `com.novarah.cbhr`, versionCode 4000, minSdk 24, targetSdk 36, only arm64-v8a, not debuggable. Signature certificate SHA-256: `dcc22ee72e828b97f95c7e29f9c99878b7c286bb10026141ea8401a6fa688159`. Details: `docs/release/android-check.json`.

## Firebase and security

With explicit user approval, the permissive production test-mode rules were replaced by the reviewed repository rules. Deployed ruleset: `ca85f07e-3717-4828-b89a-c0afc5cb96ce`; the audit confirms exact repository match, no global unconditional write and no test-mode expiry. Anonymous and email authentication are enabled. Authorized domains include the production Vercel domain and `tauri.localhost`.

Live verification passed: guest authentication; owner save write/read; another player denied save read/update; signed-out private read denied; feedback submission; another player denied feedback read. Temporary users/data were removed. Audit and live evidence are in `docs/release/firebase-audit.json` and `live-security-check.json`. Intentional public leaderboard reads remain supported.

Signing credentials stay outside Git. No admin credential or private key was committed. Public Firebase browser configuration is not an admin secret. Redistributed remaster assets have their existing CC0/original-art notices in ASSET_CREDITS.md, docs/ASSET_LICENSES.md and the download page's licenses.txt. No paid service or asset was purchased.

## Limits and developer actions

Windows installers are unsigned; SmartScreen guidance is published. The Windows application launch was checked, but installers were not installed over the user's environment. The Android APK signature/manifest were checked; no attached physical device was available, so installation and native phone performance remain untested. Browser touch emulation is not a native performance benchmark. Vite retains a large-chunk warning; expensive graphics depend on device capability. Existing stylized creature/character limitations remain documented in the Stage 8B handoff.

Back up `C:/Users/Ujwal/.cbhr-signing/cbhr-release.jks` and its private `release.json` securely for future Android updates. Reproduction commands are in docs/PACKAGING.md. No credential/security blocker remains for this release.
