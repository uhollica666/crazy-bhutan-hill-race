# Crazy Bhutan Hill Race 0.4.0-beta.2

A polish release: the game goes quiet when you leave it, the soundtrack leads the mix, and the download page is rebuilt from scratch.

- **Silent in the background.** Every sound (engine, effects, interface, ambience, weather and music) stops the moment the game loses focus: tab switch, minimised window, another window on top, phone screen lock or app switch, and the Windows and Android apps' own window focus. Sounds return once, at your saved volumes, when you come back. No stacked loops, no duplicate music, no replayed clicks. Mute, Music mute and master volume are untouched.
- **Music first.** The soundtrack is now the primary layer: engine and effects sit under it, and the default Environment level is substantially lower. If you have ever moved a volume slider yourself, your settings are kept exactly as you left them. Settings explains each slider.
- **New launch page** at `/download/`: routes, garage, weather and wildlife, the soundtrack, downloads with checksums, controls, changelog, community and support.
- **Community.** Feedback, bug reports and suggestions from the game and the site; a "join the team" interest form; a GitHub star link (stars endorse the repository, they are not game ratings).
- **Voluntary support** screen in the main menu, Settings and About. Support channels are being verified and are not active yet. The game stays free, with no ads and nothing for sale, and contributions never unlock anything.
- **Developer tools.** A local feedback analytics report (private data never leaves the developer's machine).

Play: https://crazy-bhutan-hill-race.vercel.app/
Downloads: https://crazy-bhutan-hill-race.vercel.app/download/

Windows x64: choose EXE or MSI. These installers are unsigned and may show SmartScreen. A first WebView2 installation can require internet.
Android ARM64: the release APK is signed with the same Novarah release key as beta.1, so it installs over beta.1 as an update. Allow installation from your selected browser when Android asks; keep Play Protect enabled.
Check downloaded files against SHA256SUMS.txt. Saves from beta.1 carry over.

Known limits: Windows code signing is unavailable; native installation and phone performance have not been validated on a physical Android device. The Vite build retains a large-chunk warning.
