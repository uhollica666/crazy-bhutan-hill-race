# Firebase and the connected game (Stage 5)

Crazy Bhutan Hill Race is **offline-first**. Everything in this document is an optional layer on top of a game that
plays, saves and updates without a network. Firebase is never needed to open the game, drive a mission, use the garage
or change settings; if it is slow, blocked or down, the game behaves exactly as it did in Stage 4.

> **Status: implemented and verified against the local Firebase Emulator Suite only.** Nothing described here has been
> deployed to, or tested against, the live `crazy-bhutan-hill-race` project. The live Firestore is still in test mode
> until someone deploys `firestore.rules` (see "Production checklist"). The game must not be called public-release-ready
> until that is done.

## What is in the box

| Capability | Where | Notes |
| --- | --- | --- |
| Guest play (anonymous Firebase identity) | `src/cloud/CloudService.ts` | Created automatically, once per browser session; restored on reload; none if a session already exists. |
| E-mail/password accounts | `FirebaseBackend.register/signIn/signOut/sendPasswordReset/sendVerification` | Built-in Firebase Auth only: no custom password handling, the game never stores a password. |
| Guest to account upgrade | `register()` links the credential to the guest user | Same uid, same cloud progress. |
| Cloud save | `src/cloud/payload.ts`, `CloudService.syncOnce` | Revision-checked, three-way conflict handling, player-chosen resolution. |
| Leaderboards (beta) | `src/cloud/Leaderboards.ts` | One best time per player per mission; unverified, see "Leaderboard trust". |
| Feedback to Firestore | `src/cloud/feedbackTransport.ts` | Server-confirmed delivery, offline outbox, idempotent ids. |
| Optional statistics | `src/cloud/Telemetry.ts`, `privacy.ts`, `events.ts` | Off by default, aggregated, consent-gated. |
| Incident heatmap (developer) | `src/ui/Heatmap.ts` | Local/sample data only; no cross-player data. |

The SDK is the modular v13 SDK, imported **lazily** (`import()` in `FirebaseBackend`), so the application code that
starts the game contains none of it. Auth, Firestore and (only after consent, only where supported) Analytics are
separate chunks; App Check is initialised only when a site key is configured. The core bundle grew by about 28 KB
gzip for the cloud UI and logic; the SDK chunks (about 230 KB gzip together) download in the background after the menu
is up and are precached by the service worker.

## Configuration

`src/cloud/config.ts` holds the project's **public** web configuration (`apiKey`, `authDomain`, `projectId`, ...) in one
place. These values identify the project; they authorise nothing, Authentication and Security Rules do. Everything can
be overridden through `VITE_` variables (see `.env.example`); `.env.local` is git-ignored. **Never** put a
service-account key, an admin credential or a password in the repository or in any `VITE_` variable.

| Variable | Meaning |
| --- | --- |
| `VITE_CLOUD_ENABLED=0` | Build with all cloud features off (no SDK is ever loaded). Used by the automated browser tests. |
| `VITE_USE_EMULATORS=1` | Use the local emulators and the `demo-crazy-bhutan-hill-race` project id. |
| `VITE_EMULATOR_HOST` | Emulator host (default `127.0.0.1`). |
| `VITE_FIREBASE_*` | Optional overrides of the public config. |
| `VITE_APPCHECK_SITE_KEY` | reCAPTCHA site key for App Check; unset means App Check is not initialised. |

Runtime switch: add `?cloud=off` to the URL to disable the online layer for that page load. Developer tools (the heatmap)
are shown only with `?dev=1`.

## Running things locally

```bash
bun run emulators          # Auth :9099 + Firestore :8080 (needs Java; no Google login needed)
bun run dev:emulated       # the game against the emulators (http://localhost:5273)
bun run test:emulator      # Firestore rules tests + Auth/Firestore integration tests (starts and stops the emulators)
bun run test:e2e:cloud     # browser tests of the online features against the emulators (emulator-only build)
bun run test               # unit tests (includes the in-memory sync/leaderboard/feedback/telemetry tests)
bun run test:e2e           # the regular browser suite, built with cloud OFF (.env.e2e): it cannot reach the live project
```

The emulator project id starts with `demo-`, which makes it impossible for these tests to touch the real project.

## Firestore data model

All documents carry `schema: 1`. Security Rules validate every field (names, types, ranges, sizes); the tests in
`tests/emulator/rules.test.ts` exercise them against the real rules.

```
players/{uid}                         private profile {schema, displayName, accountType: guest|registered, createdAt, updatedAt}
players/{uid}/saves/current           private cloud save (below)
leaderboards/{levelId}/entries/{uid}  public best time of one player on one mission
feedback/{submissionId}               create-only player feedback (an author may GET their own by id; nobody can list, edit or delete)
telemetrySessions/{sessionId}         create-only aggregated session summary (never readable by clients)
```

No document stores an e-mail address, a password or a token. The profile holds only the display name and the account
type. The e-mail address lives in Firebase Authentication, where only the player and Firebase administrators can see it.

### `players/{uid}/saves/current`

```
schema, uid, revision, updatedAt (server), clientUpdatedAt, deviceId, appVersion,
progress.levels.{levelId}: { completions, medal, vehicles.{vehicleId}: { bestTime, bestScore, bestComfort, medal, completions } }
garage: { owned: [vehicleId], upgrades.{vehicleId}.{upgradeId}: level }
wallet.credits, stats: { missionsPlayed, creditsEarned, campaignCompleted }, story.seen, prefs: { hudMode, reducedMotion }
```

Not synchronised: graphics quality, volumes, touch layout, the selection, the run history, anything per-frame or large.
A document is about 3 to 8 KB.

### `leaderboards/{levelId}/entries/{uid}`

`{schema, uid, levelId, timeMs, vehicleId, conditions, displayName, medal, comfort, appVersion, clientAt, submittedAt}`.
The document id is the player's uid: one best entry per player per mission. Anyone can read a bounded page (the rules
refuse lists with a limit above 100); only the owner can write, only a faster time than the stored one, only inside
plausible bounds (a per-mission floor, mirrored in `src/cloud/limits.ts` and checked against the rules file by
`tests/cloud-limits.test.ts`), and only for vehicles and missions that exist.

### `feedback/{submissionId}`

The existing feedback form's payload plus a new "graphics" answer, the author's uid and a server timestamp. The id is
generated on the device (`fb-<random>`) and is the idempotency key: the rules allow only `create`, so a second write
with the same id is refused and an edit or delete is impossible, even for the author. The author (and only the author)
can `get` their own document by id: that is how the game finds out for certain whether a submission whose confirmation
was lost on the way back did arrive, instead of guessing. Nobody can list feedback. Novarah reads feedback in the
Firebase Console. There is intentionally **no** admin dashboard in the game (see "Staff access").

### `telemetrySessions/{sessionId}`

`{schema, uid, sessionId, startedAt, endedAt, appVersion, platform, qualityTier, perfTier, counters, vehicles, levels, upgrades, incidents[]}`
with at most 12 incidents per document (a longer session writes `...-2`, `...-3`). An incident is
`{type, levelId, at, vehicleId, severity}` where `at` is a fraction 0..1 of the mission's road. Written only after the
player opted in. See "Analytics and privacy".

## Authentication flows

1. **Start-up.** The game opens straight to its menu. After the menu is up and the page is idle, the SDK loads and the
   identity listener starts. If a session exists (Firebase persists it) it is restored; otherwise, once, an anonymous
   user is created. Failure is silent: the chip says "Offline" and the game carries on.
2. **Guest to account.** *Profile, Create account* links an e-mail credential to the current guest user
   (`linkWithCredential`). The uid, and so the cloud progress and leaderboard entries, stay. A verification e-mail is
   sent. If the address already has an account, the player is told so and the guest session is untouched.
3. **Sign in.** *Profile, Sign in* replaces the session. A copy of this device's save is kept first, the remembered
   sync baseline is discarded (it belonged to the other identity), and the normal comparison runs. If both sides have
   progress the player is asked which to keep (below). Nothing is merged by changing a uid.
4. **Sign out.** Returns to offline play and keeps the local data. No new guest is created until the player asks
   ("Play online as a guest"), so progress cannot silently fork onto another identity.
5. **Password reset** uses Firebase's e-mail flow. Errors are mapped to plain language (`mapError` in
   `FirebaseBackend.ts`): offline is never reported as "wrong password".

## Cloud save strategy and conflict handling

The local save (`SaveStore`, localStorage) stays the source of truth the game plays from. The cloud copy is reconciled
with it by `decide()` (in `src/cloud/payload.ts`) using three things: this device's current data, the cloud document,
and **the last state both agreed on** (kept in `cbhr.v1.cloud` as the common ancestor).

| Situation | Outcome |
| --- | --- |
| no cloud copy, real progress locally | upload as revision 1 |
| no cloud copy, nothing played | nothing is written |
| identical | in sync |
| only this device changed since the last sync | upload, revision + 1 |
| only the cloud changed | download (a backup is saved first, the player gets a notice) |
| no shared history, one side empty | the other side wins |
| both changed, or no shared history and both have progress | **the player chooses** |
| cloud document unreadable (corrupt or written by a newer game) | left alone; the player may keep it or replace it |

Writes are optimistic-concurrency checked twice: client-side in a transaction (`expected revision`), and server-side by
the rules (`revision == resource.revision + 1`), so a stale device can never overwrite newer progress. A lost race is
re-read and re-decided up to three times.

**The choice.** The conflict screen shows both sides (missions, medals, credits, vehicles, upgrades) and offers *Use my
account's progress*, *Use this device's progress*, *Combine both* or *Decide later*. A copy of this device's save is
stored (up to 3 copies, restorable from the profile) before any replacement.

**Combine** (never invents or erases credits):
* progress moves forward only: faster best times, higher medals, larger counts;
* the garage is the union of vehicles and the higher level of every upgrade;
* credits use a *wealth* ledger: `wealth = credits + value of everything bought`. Buying moves value between wallet and
  garage and never changes wealth; earning raises it. With a common ancestor, wealth is `local + cloud - ancestor` (both
  sides' independent earnings, counted once); without one, the **larger** is kept, never the sum;
* credits after combining = wealth minus the cost of the combined garage. If that would be negative, Combine is
  **refused** and the player must pick a side.

**Offline.** Changes are saved locally at once and marked pending (persisted across reloads). Writes are debounced
(5 s) and batched; nothing is written per frame, and settings-only changes write nothing. Failures retry with backoff
(30 s, 2 min, 10 min); the network coming back triggers an immediate attempt. The UI shows a quiet status chip (never a
modal) and the profile shows the detail.

## Leaderboard trust

This is a browser game: the physics runs on the player's device, so **a determined player can submit a fabricated time**.
Security Rules cannot prove a race happened. What Stage 5 does, honestly:

* only completed missions are submitted, only with a vehicle the mission allows, only above a per-mission floor (about
  half the autopilot's flat-out time), only as an improvement, never twice;
* the rules re-check the same floor and bounds, ownership, schema and "faster only";
* the board is labelled **beta** and **not verified** in the game;
* a player can delete their own entry (profile, Privacy, *Remove my online data*).

What it does **not** do, and what would be needed: server-side verification (Cloud Functions or another trusted
service) that replays a recorded input stream through the same deterministic physics, or signs results, plus rate
limiting and moderation. That needs Blaze billing or other infrastructure and is deferred to a later stage; no fake
anti-cheat is claimed.

Reads are bounded (25 per page, up to 100), cached for a minute per mission and replaced by the last cached page when
offline. Rank is a server-side count capped at 100 ("beyond 100" is shown beyond that).

## Feedback

*Share feedback* now really reaches Novarah when the online service is available, and tells the truth about each state:

| State shown | Meaning |
| --- | --- |
| "Thank you! Delivered" | the **server** accepted the document (`setDoc` resolves only on server acknowledgement; the in-memory cache is used, never a persistent one, so a cache write cannot be mistaken for delivery) |
| "Saved, not delivered yet" | offline, timeout or a transient error: stored on the device and sent **automatically** when the connection returns |
| "Not delivered" | the service refused it; the player can export it or send a fresh copy |
| "Saved on this device only" | no service in this build (the previous Stage 3 behaviour) |

If a write times out, or is refused because the id already exists, the game asks the server directly whether *its own*
submission is there (the author-only `get`) and reports "delivered" only if it is; otherwise it stays queued or failed.
The copy is written to the device **before** the first attempt, so nothing the player wrote can be lost. A submission id
makes retries idempotent. Export (download, copy, mail draft) remains available in every state. Payment information is
never asked for; the optional research questions (larger version, willingness to buy, price range, support) are
unchanged.

## Analytics and privacy

Two things are kept apart:

* **Needed for features** the player asked for: sign-in, the cloud save, leaderboard posting, feedback. These work whether
  or not statistics are on.
* **Optional statistics** (anonymous gameplay statistics). **Off until the player turns them on** (one-time card on the
  menu, and *Settings, Privacy*); can be turned off at any time, which discards anything not yet sent.

With consent, events (`src/cloud/events.ts`: `game_session_started`, `mission_selected`, `mission_started`,
`mission_completed`, `mission_failed`, `vehicle_selected`, `vehicle_unlocked`, `vehicle_purchased`, `upgrade_purchased`,
`feedback_submitted`, `setting_changed`, `incident`) are folded into **one small summary per session**, uploaded when
12 incidents have accumulated, every 5 minutes while active (at most once a minute), and when the page is hidden. The
same semantic events (not incidents) also go to Google Analytics for Firebase, loaded lazily and only where
`isSupported()` is true, with ad personalisation and Google signals off.

Never collected: e-mail addresses, names, passwords, IP addresses by the game, keyboard or touch input, free text,
coordinates, GPS, device model or user agent (only "desktop, phone or tablet" and a coarse performance class).

Heatmap data: incidents (`collision`, `recovered`, `fuel_exhausted`, `stuck`, `hazard`, `abandoned`, `failed`) with
`at`, the position along the mission as a 0..1 fraction (3 decimals, about 3 m), a vehicle id and a severity bucket
(never raw speeds). `at` maps back onto the level's road (`Course`), so no real-world location is involved.

**Developer heatmap** (`?dev=1`, Settings, Privacy, *Open the incident heatmap*): draws a mission's route coloured by
incident density, with hot spots and per-type markers, from this device's own log or a clearly labelled deterministic
sample. It has no way to load other players' data. **A trustworthy cross-player heatmap needs a secured aggregation
step**: the rules make `telemetrySessions` unreadable by clients (correct: it is raw player data), so Novarah would run
an export from the Console or a small admin script with service-account credentials *outside* the browser, or a Cloud
Function that rolls sessions up into per-mission buckets (needs Blaze). The schema is ready for either; nothing is
faked.

## Security Rules summary

`firestore.rules` is deny-by-default. See the file's header comments for the reasoning. Highlights:

* `players/{uid}` and its saves: owner only; validated shape; revision must increase by one.
* `leaderboards/.../entries/{uid}`: public get, bounded list (`limit <= 100`); owner create/update/delete; faster only;
  plausible bounds; known mission and vehicle ids.
* `feedback`: create-only for signed-in users with strict schemas and size limits; the author can `get` their own by id;
  nobody can list, update or delete. `telemetrySessions`: create-only; nobody can read, update or delete.
* every other path: closed.

Verified by 24 emulator tests (unauthenticated, owner, other user, invalid and oversized payloads, forbidden deletes,
leaderboard reads, feedback privacy, unsupported paths, malformed requests) plus integration tests of the real client
code against the rules. **Live rules have not been deployed or tested.**

## Abuse and the limits of Stage 5

| Threat | Mitigation in Stage 5 | Remaining risk / needs a server |
| --- | --- | --- |
| Reading or changing another player's data | rules: owner only | none known |
| Anonymous-account spam | none beyond Firebase defaults | an attacker can create unlimited anonymous users; mitigate with App Check, Auth quotas and blocking functions (Blaze) |
| Feedback spam | strict schema, size caps, create-only, unique ids | one anonymous user can still write many documents; rate limiting needs a Cloud Function or App Check enforcement |
| Excessive reads | bounded queries (<= 100), 1 min cache, no live listeners | a hostile client can still read public boards repeatedly (cost); App Check helps |
| Leaderboard flooding | one doc per player per mission, faster-only | unlimited anonymous accounts can each post one entry per mission |
| Fabricated scores | plausible floor, labelled unverified | cannot be prevented client-side; see above |
| Telemetry spam | caps (12 incidents, map sizes), create-only | per-field value sizes inside maps are not validated by the rules; a document is capped at 1 MiB; use App Check |

### App Check

App Check (reCAPTCHA v3 on the web) attests that requests come from the real site rather than a script. It **does not
replace the rules**. It is suitable for this static-hosted PWA once the production domain is known. Steps (not done,
needs the Console): Firebase Console, App Check, register the web app with reCAPTCHA v3 (or Enterprise), copy the
**site key** into `VITE_APPCHECK_SITE_KEY`, start in **monitor** mode, confirm that legitimate traffic is verified, then
enforce for Firestore and Authentication. The client code initialises App Check only when the key is set and never in
emulator mode; no key is invented here. Emulator development is unaffected.

## Staff access

Nothing in the game grants special treatment to an account because of its e-mail address, display name or custom claim.
The pre-existing e-mail/password user in the project is an **ordinary player account** until a proper authorization
model exists. A future internal review tool should use verified custom claims set by a trusted server (not from the
browser), with its own rules; until then use the Firebase Console.

## Free-tier discipline and expected usage

Firestore free quota (Spark): 50k reads, 20k writes, 20k deletes per day; 1 GiB stored. Rough per-player cost:

| Action | Reads | Writes |
| --- | --- | --- |
| a session (sign-in profile check, one save compare) | about 3 | 0 to 1 |
| each completed mission | 1 (save compare) | 1 save + at most 1 leaderboard entry |
| viewing a leaderboard | 25 to 100 + 2 (own entry, count) | 0 |
| a feedback submission | 0 | 1 |
| statistics (opted in) | 0 | 1 to 3 per session |

At 500 daily players with 5 missions each that is roughly 8k writes and 15k reads a day, well inside the free quota.
Designed around it: debounce and batching, no per-frame or per-event writes, no live listeners (leaderboards refresh on
demand), bounded queries, a 60 s cache, no persistent Firestore cache, small documents.

**Cost-monitoring checklist** (Firebase Console, Usage and billing): check daily reads/writes against the quotas; set a
budget alert even on Spark (it protects a later upgrade); watch `telemetrySessions` and `feedback` growth; check for
unexpected spikes in leaderboard reads (a script hitting the public boards); review Authentication's anonymous-user
count weekly and delete stale anonymous accounts (Auth settings, automatic clean-up needs the Identity Platform upgrade,
otherwise do it from the Console or Admin SDK). **Do not enable Blaze billing or any paid Google Cloud service without
an explicit decision.**

## Offline and the PWA

Firebase network traffic is cross-origin, so the service worker (which handles same-origin requests only) never
intercepts or caches it. The lazily loaded SDK chunks are precached like the rest of the build, so a returning offline
player simply gets a game whose cloud layer reports "Offline". Three storage concerns are deliberately separate:

* the **game save** (`cbhr.v3.save`, localStorage): the reliable foundation;
* **auth persistence** (Firebase's own, IndexedDB): only the session;
* **Firestore's cache**: in-memory only, never relied on.

Sync bookkeeping lives in `cbhr.v1.cloud`, the leaderboard queue in `cbhr.v1.board`, feedback copies in
`cbhr.feedback.drafts`, privacy choices in `cbhr.v1.privacy`, the on-device incident log in `cbhr.v1.incidents`.

## Production checklist (nothing here has been done)

1. **Console:** confirm Authentication providers (Anonymous, Email/Password) and authorised domains for the production
   hostname. Optionally enable e-mail enumeration protection.
2. **Rules:** review `firestore.rules`, then deploy (only with explicit authorization):
   `bunx firebase deploy --only firestore:rules,firestore:indexes --project crazy-bhutan-hill-race`.
   Take a note of the current test-mode rules first; they expire and are insecure.
3. **Verify live:** with the production site, create a guest, check a `players/{uid}/saves/current` document appears and
   that reading another uid's path (e.g. from the Console's Rules Playground, simulating an authenticated user with a
   different uid) is denied; post a time; submit feedback and see it in the Console; confirm a signed-out request to
   `players/*` is refused.
4. **App Check:** register, monitor, then enforce (above).
5. **Budget alerts** and the checklist above.
6. **Retention:** decide how long feedback and telemetry are kept and delete older documents on a schedule; update the
   privacy statement shown in the game if the policy differs.
7. Re-run `bun run test:emulator` and `bun run test:e2e:cloud` against the exact rules you deploy.
8. Only then call the connected game release-ready.

## Manual console actions still required

* Deploy the rules (above). Until then the live database is in test mode.
* Optional: App Check, budget alerts, authorised domains for the production host, e-mail templates (verification and
  password reset wording and the Novarah sender name) in Authentication, Templates.
