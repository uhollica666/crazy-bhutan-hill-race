# Testing on a real phone (no hosting, no firewall changes beyond your own LAN)

Everything the project reports about phones so far comes from desktop Chrome and Pixel 7 _emulation_. Emulation
cannot tell you frame rate, thermal throttling, touch feel, or GPU driver quirks. This is the recommended loop for
real hardware.

## 1. Serve on your local network (private Wi-Fi only)

```bash
bun run dev:lan        # hot-reload dev server (Vite prints "Network: http://192.168.x.x:5273/")
# or, to test the production bundle (closer to what players get):
bun run build && bun run preview:lan   # http://192.168.x.x:4173/
```

- The default `bun run dev` listens on **localhost only**. Only the `:lan` scripts bind the network, so nothing is
  exposed unless you ask for it.
- Phone and computer must be on the **same private Wi-Fi** (not a guest network with client isolation).
- Windows will ask whether to allow the app through the firewall: choose **Private networks only**; do not tick
  Public. Stop the server (Ctrl+C) when finished.
- Do not port-forward or tunnel this to the internet.

## 2. Open it on the phone

Visit the printed `Network:` URL. Add `?debug=1` to show the live overlay (fps, CPU ms per frame, physics ms, draw
calls, triangles, geometry/texture counts, render scale, JS heap where available). Useful extras:
`?quality=low|medium|high` forces a preset, `?noadapt` (also implied by `?debug`) freezes the adaptive-resolution
controller so numbers are comparable between runs.

Note: service workers and "install to home screen" need a **secure context** (https or localhost), so the PWA and
offline mode cannot be tested over plain `http://192.168...`. To test those on a phone, use the Chrome DevTools
USB port-forward below.

## 3. Optional: remote inspection over USB (Android + Chrome)

1. Enable Developer options and USB debugging on the phone, connect it, accept the prompt.
2. On the computer open `chrome://inspect/#devices`, tick "Discover USB devices", and add a **port forwarding** rule
   `4173 -> localhost:4173` (or `5273`).
3. Browse to `http://localhost:4173` **on the phone**: that origin is a secure context, so the service worker and
   install prompt work, and you can open DevTools (Performance, Network offline, Application > Service Workers).

## 4. What to record

For each device and each preset (Low / Medium / High) on each level, note: device model, Android/iOS + browser
version, average and worst-case fps from the overlay over a full run, whether the adaptive scale dropped
(`res xN` in the overlay), touch comfort (steering bar reach, two-thumb use, accidental taps), whether audio starts
after the first tap, battery temperature/throttling after ~5 minutes, and any visual glitches. Add the results to
`DEVELOPMENT_LOG.md` under a "Real-device results" heading; until then the project claims nothing about phone
performance.
