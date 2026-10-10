# Stage 7F handoff: public beta polish (0.4.0-beta.2)

Branch `stage-7f-public-beta-polish` (pushed), based on `main` / `v0.4.0-beta.1`. Release tag `v0.4.0-beta.2` points at `0edeb21`.

## What changed

- **Background audio.** `src/audio/focus.ts` tracks visibility, blur/focus, pagehide/pageshow, freeze/resume and Tauri window focus. `AudioEngine` has a gate gain between master and limiter plus a context suspend; music decks pause with it. Everything restores once, at saved volumes; manual mute and Music mute are preserved. Fixed a real bug where music did not restart if the scene changed while away.
- **Mixer.** Music is the primary layer (trim 0.9, default 0.7); environment default 0.4 with lower ambience/weather trims. A one-time settings migration (`mixRev`) only changes users who never touched the old defaults. Settings hints explain each slider.
- **Website.** `/download/` rebuilt: hero with real screenshot and prayer-flag bunting, route book (10 routes), garage, weather and wildlife, soundtrack, downloads (from `release.json` only, with SHA-256), controls, changelog, community and team form, support box, fine print. All images are real game screenshots (`public/download/media`). Screenshots of production: `docs/release/site-0.4.0-beta.2/` (desktop and mobile, no horizontal overflow). The service worker no longer caches or replaces the game shell for `/download/`; dev and preview servers serve `/download/` correctly.
- **Feedback analytics.** `docs/FEEDBACK_REPORTING.md`. Local tool only, service account kept outside the repo, contacts redacted, CSV/JSON export, HTML dashboard.
- **Community.** Feedback, bug and suggestion routes, a join-the-team form (GitHub issue prefill; email option only when `public/community.json` `teamEmail` is set), GitHub star link with the note that stars endorse the repository and are not game ratings.
- **Support.** `docs/SUPPORT.md`. Shown in the site, main menu, Settings and About. Every channel is **pending**; nothing payable is shown. Links open through the Tauri opener on Windows/Android and `noopener` tabs in browsers; the native capability is scoped to the allowed hosts.
- **Repository privacy.** `docs/REPO_MIGRATION.md` (proposal only; the repository visibility was not changed).

## Verification

- `tsc --noEmit`, ESLint: clean. Vitest: 32 files, 522 tests passed (audio focus, music, save migration, feedback report, support safety including site/game parity and the Tauri scope).
- Browser audio regression (`e2e/audio-focus.spec.ts`) passed earlier in real Chrome: gate 0 and context suspended on blur, hidden and freeze; restored once; manual mute preserved. It was not re-run after the final commits.
- Production build and both native builds succeeded. Not run this stage: Firebase emulator suites (no rules or cloud code changed) and the full Playwright suite. Two older e2e failures noted earlier (camera settings tab, pass45 map test) are unrelated and unresolved.
- Not tested on a physical Android device; Windows installers were built but not installed here.

## Release

- GitHub prerelease: https://github.com/uhollica666/crazy-bhutan-hill-race/releases/tag/v0.4.0-beta.2 (APK, MSI, EXE, `SHA256SUMS.txt`). `v0.4.0-beta.1` untouched.
- Android: versionCode 4001, signed with the same Novarah key as beta.1 (certificate SHA-256 `dcc22ee7…8159`), arm64-v8a, not debuggable. Windows MSI version 0.4.0.2.
- Web: deployed to production through the existing Vercel project, https://crazy-bhutan-hill-race.vercel.app/ (game at `/`, new site at `/download/`; download links all return 200).

## Needed from the developer

1. Verify and supply a Bhutan National QR image and/or Patreon page, then flip the channel to `verified` per `docs/SUPPORT.md`.
2. Set `teamEmail` in `public/community.json` if you want an email route for the team form.
3. Create the read-only Firebase service-account key outside the repo for `bun run feedback:report`.
4. Back up `C:\Users\Ujwal\.cbhr-signing` privately.
5. Decide on the repository migration in `docs/REPO_MIGRATION.md`.
6. Merge `stage-7f-public-beta-polish` into `main` when satisfied (not done).
