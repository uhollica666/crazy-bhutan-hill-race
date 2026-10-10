# Reproducing the public beta

Use Bun 1.3.14, run `bun install --frozen-lockfile`, then `bun run build` for the web/PWA. The game is served at `/`; the distribution page is at `/download/`. Vercel uses the same build command and `dist` output. Native builds embed that production output, including runtime assets and music.

## Windows

Install Rust stable for x86_64-pc-windows-msvc, Visual Studio C++ Build Tools and WebView2. Ensure both the Cargo and Rust toolchain bin directories are on PATH. Run `bun run build:windows`. Outputs are under `src-tauri/target/release/bundle/{nsis,msi}`. The beta uses application version 0.4.0-beta.1 and numeric MSI version 0.4.0.1. No Windows signing certificate is configured; warn users about SmartScreen.

## Android ARM64

This build used Android Studio's JBR, Android SDK platform/build-tools 36 and NDK 28.2.13676358, Rust's aarch64-linux-android target, and the generated Gradle wrapper. Set JAVA_HOME, ANDROID_HOME, NDK_HOME and the Rust/Cargo PATH before building.

The release signing key is outside Git at `C:\Users\Ujwal\.cbhr-signing\cbhr-release.jks`; its companion `release.json` holds the store file, alias and passwords. Back up both privately and retain them for future Android updates. Never upload either file or print the passwords.

For this workstation, load the private configuration into environment variables in PowerShell, then build:

```powershell
$signing = Get-Content -LiteralPath 'C:/Users/Ujwal/.cbhr-signing/release.json' | ConvertFrom-Json
$env:CBHR_ANDROID_KEYSTORE = $signing.storeFile
$env:CBHR_ANDROID_STORE_PASSWORD = $signing.password
$env:CBHR_ANDROID_KEY_PASSWORD = $signing.password
$env:CBHR_ANDROID_KEY_ALIAS = $signing.alias
bun run build:android
```

The Gradle release signing configuration consumes those variables. Verify the resulting APK with Android build-tools `apksigner verify --verbose --print-certs`; check the manifest version, ARM64 ABI and absence of `application-debuggable` with `aapt dump badging`. A debug APK or an unsigned APK must never be distributed as the public release. No physical Android device was attached during release engineering.

## Publication and security

Publish binaries and SHA256SUMS.txt through the GitHub prerelease. Populate `public/download/release.json` from confirmed uploaded GitHub assets, then redeploy Vercel. The page renders platform buttons only for confirmed manifest entries.

Firestore rules are owner-scoped. `scripts/audit-firebase-production.mjs` reads the deployed rules and Auth configuration; its optional domain mutation must be explicitly authorized. `scripts/run-live-release-probe.mjs --confirm-production-check` creates two temporary anonymous test users, verifies owner access/cross-player denial and feedback, and removes its temporary data/users. Emulator tests remain the default security test workflow.
