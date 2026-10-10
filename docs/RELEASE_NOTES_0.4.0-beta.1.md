# Crazy Bhutan Hill Race 0.4.0-beta.1

The first public beta brings the Driver's Academy and all ten campaign routes together with the complete Stage 8A/8B visual remaster.

- Four detailed playable vehicles, garage paints and accessories, improved scenery, PBR surfaces, lighting, weather, people and creatures.
- Road and speed dependent camera shake, saved driver/chase views (C or the HUD button), and a rear-view inset when reversing.
- Keyboard, gamepad and touch controls, compatible existing saves, optional private Firebase saves and in-game feedback.
- Low graphics avoids the expensive remaster models; the web game supports offline play after caching.

Play: https://crazy-bhutan-hill-race.vercel.app/
Downloads: https://crazy-bhutan-hill-race.vercel.app/download/

Windows x64: choose EXE or MSI. These installers are unsigned and may show SmartScreen. A first WebView2 installation can require internet.
Android ARM64: the release APK is signed with the Novarah release key. Allow installation from your selected browser when Android asks; keep Play Protect enabled.
Check downloaded files against SHA256SUMS.txt. Browser and native local saves are separate; optional cloud accounts can transfer compatible progress.

Validation: typecheck, lint, production build, 452 unit tests, 38 Firebase emulator tests, focused desktop/mobile and offline browser checks, four garage models, all route loading, camera persistence/reversing, and a real Windows WebView2 launch. The latest campaign QA already established completion of all ten campaign missions. Live Firebase owner access, cross-player denial and feedback checks passed after secure rules deployment.

Known limits: Windows code signing is unavailable; native installation and phone performance have not been validated on a physical Android device. Software browser rendering is slower than a typical GPU. The Vite build retains a large-chunk warning. Stylized characters and creatures remain part of the existing remaster rather than a new art pass.

Please send bugs through Feedback in the game menu, Settings or About, including your route, vehicle and device.
