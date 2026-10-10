# Brand system (Pass 5.5)

Two identities share the screen and must stay distinct:

- **Crazy Bhutan Hill Race (CBHR)** is the game. Its logo (`cbhr-logo.png`, a red SUV under a snow peak with prayer
  flags, orange and yellow lettering) is the hero of the menu, the loading screen, the title card and About.
- **Novarah Interactives** is the studio. Its mark (magenta symbol, white wordmark, magenta "ACTIVES") appears on the
  studio card, in About, and as a small symbol beside "A Novarah Interactives game" on the menu and results.

The interface is built so that neither logo fights the UI: charcoal surfaces let the CBHR orange and the Novarah
magenta read as the two accent colours instead of competing with a third (the old brown/parchment/amber).

## Colour

The old token names (`--indigo`, `--maroon`, `--saffron`, `--parchment`, `--ink`, `--cream`, `--gold`) were kept so
every screen picked up the new palette in one place (`:root` in `src/ui/styles.css`, with `brand.css` loaded last for
the set pieces). Their meaning changed:

| Token | Value | Role |
| ----- | ----- | ---- |
| `--indigo-deep` | `#0b0d13` | page and deepest surface |
| `--indigo` | `#141722` | raised surface |
| `--parchment` / `--parchment-dark` | `#151926` / `#232938` | panel glass / inset wells (no longer paper) |
| `--ink`, `--cream` | `#eef0f7`, `#f6f7fb` | text on panels, text on dark |
| `--muted-ink` | `#9aa3b8` | secondary text (4.5:1 or better on every panel) |
| `--maroon` (magenta) | `#d12c88` | Novarah magenta: focus rings, selection, panel hairlines, cast portraits |
| `--saffron` (orange) | `#ff8a2a` | CBHR orange: primary buttons, rewards, route, instruments |
| `--steel` / `--blue` | `#5b8def` | quiet cool secondary (rivers, informational chips); never a main surface |
| `--green`, `--red` | `#2fd37a`, `#ff4d6a` | status only: success, goal, failure, danger |
| `--gold` | `rgba(255,255,255,.28)` | neutral hairline for borders (the name is historical) |

Rules: charcoal and slate for surfaces; white and off-white for text; magenta for "you are here" (focus, selected,
hover); orange for "go" and "reward" (primary button, credits, route); steel blue only where something is physically
water or informational; green and red only for status. No brown overlays, parchment panels, sepia or amber gradients
in the interface. `tests/pass55.test.ts` fails if the old palette creeps back into any stylesheet.

The 3D world keeps its warm natural light (late-morning Himalayan documentary, see `VISUAL_DIRECTION.md`): the brand
change is about the interface, not about repainting the mountains. The garage showroom is the exception: it is a
UI-adjacent room, so it was rebuilt in charcoal with a magenta rim light and a magenta trim band.

## Type and shape

- One voice: a condensed display face (`Bahnschrift`, falling back to `Arial Narrow`/system sans) in capitals with wide
  tracking for headings, buttons and eyebrows; a system sans for body text. The old serif is aliased to the display
  face (`--serif: var(--display)`) so no heading is left in a different voice.
- Panels are dark glass with a magenta hairline; buttons are charcoal with a white hairline, and the single primary
  action on a screen is the orange button. Callouts use a slanted left edge (magenta bar) instead of boxed borders.
- Motion is short (about 0.4 to 0.6 s), eases out, and is removed by `prefers-reduced-motion` and the Settings
  "reduce motion" switch.

## Start-up sequence

1. **Studio card** (first launch on a device only, about 1.9 s): Novarah logo, "Novarah Interactives", "A creative
   studio of Novarah Technologies".
2. **Title card** (about 2.2 s first launch, 1.7 s later launches, 0.9 s on a reload in the same session): CBHR logo
   rising out of a magenta/orange streak sweep, tagline.
3. **Menu** builds in once per launch (logo, tagline, journey card, buttons slide in), with a short soft sting if the
   browser has already allowed audio (it has when the player skipped by tap or key).

Any key, click or tap skips straight to the menu. Reduced motion shows still cards with no streaks and finishes in
about 3 s on first launch. Nothing waits on the network.

**Third-party credit policy.** Tools and services (TypeScript, Vite, Bun, Three.js, Blender, glTF Transform, Firebase,
GitHub) and the AI assistants that helped build the game (Claude by Anthropic, ChatGPT by OpenAI) are named as text in
**About & credits**, with a line that names are credited, not endorsed. They are never shown as splash logos: that
would need each owner's brand permission, would pad the start-up, and would make the first thirty seconds about the
tools instead of the game. If a platform or store later *requires* a logo, add it to About only, using the owner's
published brand guidelines.

## Story delivery

Every mission briefing is the same reusable card (`BriefingScreen`, data in `src/data/story`):

- a hero strip: the mission type and name, the headline;
- who is on board (portrait, name, one line);
- three one-liners with an icon each: **The problem**, **The job**, **The challenge** (`LevelStory.quick`, each at
  most 72 characters; a unit test enforces it);
- "Read the full story" (collapsed): the longer text and the checklist, for people who want it;
- **Start the drive** (orange) and **Skip story**. Replays and restarts never show it again.

In the mission: a **dispatch card** (mission headline plus the one-line job) appears while the lights count down and
fades 3 seconds after GO; callouts (checkpoints, guests aboard, service stops, hazards) use the slanted banner; the
countdown is large italic type with a magenta shadow; the results screen opens with a **MISSION COMPLETE / MISSION
FAILED** stamp and a one-line ending from the story (`LevelStory.ending`).

To add a mission or language: copy an entry in `src/data/story/en.ts`, fill `quick` and `ending`, done. No UI code.

## Assets

`public/brand/cbhr-logo.webp`, `novarah-logo.webp`, `novarah-symbol.webp` are resized WebP derivatives of the supplied
PNGs. The originals (`cbhr-logo.png`, `novarah-logo.png`) are left untouched at the repository root. The `@2x`
Novarah PNGs that used to sit at the root were deleted by the owner and are not restored.

**Game logo derivatives (`node scripts/branding.mjs`, from the master `cbhr-logo.png`).** The menu, splash, loading screen and About use
`brand/cbhr-logo.webp` (720 px, background removed by a border flood fill so the dark tyres and shadows keep their colour). Small
places cannot carry the wordmark, so favicons (16/32/48 and `favicon.ico`), the Apple touch icon (180), the PWA icons (192/512,
rounded) and the maskable icons (192/512, emblem inside the 80% safe zone on a fiery dark ground) use a crop of the vehicle, peak and
sun disc. `og-image.png` (1200x630) is the social card; its `og:image` URL in `index.html` is relative, so set it to the absolute
URL of the deployed site when publishing.

Known gaps: no horizontal/stacked lock-up of the two logos exists, so they are never shown together as one mark; the
studio card uses the logo as supplied (magenta on dark works; it has not been tested on light backgrounds because the
interface has none).

## Stage 6 preparation (documentation only: nothing here has been built)

- **Website and GitHub Releases.** The same two logos, the charcoal/magenta/orange palette and the display face carry
  over. A press kit needs: the logos as PNG/SVG at several sizes (request vector sources from the owner), five
  screenshots (`scripts/pass55-shots.mjs`), the tagline and a 50-word description.
- **Tauri 2 (Windows exe/msi, Android apk).** Window icon and installer art need square PNG/ICO/ICNS exports of the
  CBHR mark (the supplied PNG is not square-safe with the lettering; a badge crop will be needed) and Android adaptive
  icons (foreground on `#0b0d13`). The splash maps directly to a Tauri/Android launch screen background of `#0b0d13`.
  The intro, menu and briefing are DOM and CSS only, so they need no changes inside a webview; the audio sting relies on
  the first user gesture, which a webview also requires.
- **Credits** will need the Tauri, Rust and Android toolchain licences added to the "Built with" list when they ship.
- **Store/ratings.** The AI-assistance acknowledgement should be reviewed against each store's disclosure rules before
  release.

## Review screenshots

Curated captures from `scripts/pass55-shots.mjs`, `pass55-intro.mjs`, `pass55-finish.mjs` and `pass55-screens.mjs` are in
`docs/visual/pass55/` (start-up cards, menu, mission map, garage, briefing, countdown dispatch, results, About, settings; phone
landscape and portrait). They were taken in headless Chrome with software rendering, so frame rates and fonts are not
representative of a real device.
