# Developer feedback reporting

Players submit structured feedback to the private Firestore `feedback` collection (see `src/services/feedback.ts`,
`src/cloud/feedbackTransport.ts` and `firestore.rules`). The rules allow **create only**: nobody can list, read (other than an author
fetching their own submission by id), edit or delete feedback from the app or the website. This document is about reading it as the
developer, locally, without weakening that.

## What you get

`node scripts/feedback-report.mjs` (or `bun run feedback:report`) writes a dated folder under `reports/feedback/` (git-ignored) and a
`reports/feedback/latest.html` shortcut:

| File                       | Contents                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `report.html`              | Self-contained dashboard: KPIs, charts, topic tables, individual comments, live filters, export buttons |
| `summary.json`             | Every aggregate the dashboard shows, plus the filters used                                           |
| `feedback.csv`             | One row per submission, with comments (emails and phone numbers scrubbed)                             |
| `feedback-stats-only.csv`  | The same without any free text: safe to share with anyone                                             |
| `feedback.json`            | Records and summary; contact replaced by `[provided]`, user-agent strings dropped                     |

The dashboard covers: total submissions, average rating and distribution, submissions over time, app-version breakdown (count and
average), graphics / performance / controls / gameplay feedback (as ranked topics), difficulty preference, common bugs, requested
features, what players love, willingness to play a larger version, to consider buying one (with price range), and to support future
games voluntarily, and the platform / device split **for players who opted in to share device details** (everyone else is counted as
"Not shared", never guessed). Filters: version, platform, where the form was opened, topic, difficulty, star range, dates and free
text. Every filter re-computes all charts and tables; the export buttons export the filtered view.

### How topics are found

Transparent, local keyword rules, nothing else. `TOPICS` in `scripts/feedback/core.mjs` is the whole model: each rule has a label, a
kind (complaint, request or praise), the answer fields it may read, and its patterns. A complaint is only looked for in the fields
that can state one (what hurt, bugs, performance, controls, graphics), requests in "what should we add", praise in "what you loved".
A submission can match several topics; the counts are submissions, not mentions. No AI service or network call is involved. To add or
tune a topic, edit the table and run `bun run test` (`tests/feedback-report.test.ts`).

## Running it

### 1. One-time: create a read-only service account (outside the repo)

1. Firebase console → Project settings → Service accounts → **Generate new private key** (or create a dedicated account in Google
   Cloud IAM with only the **Cloud Datastore Viewer** role, which is enough to read documents).
2. Save the JSON **outside this repository**, for example `C:\Users\<you>\.cbhr-signing\firebase-feedback-reader.json`, and never commit
   or upload it. The tool refuses a key that sits inside the repo folder.
3. Point the tool at it, either per run or once in your shell profile:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\Users\<you>\.cbhr-signing\firebase-feedback-reader.json'
bun run feedback:report -- --open
```

The key is read from disk only, signs a short-lived token request in memory (RS256, Node's built-in `crypto`; no extra packages) and is
never printed or written anywhere. The tool only reads: it never writes to Firebase.

### 2. Everyday use

```powershell
bun run feedback:report -- --open                                  # everything, opens the dashboard
bun run feedback:report -- --version 0.4.0-beta.2 --min-rating 1 --max-rating 2 --open   # unhappy players on the new build
bun run feedback:report -- --from 2026-10-01 --to 2026-10-31 --os Android
bun run feedback:report -- --include-contacts --open               # only when you want to reply to people
```

Other sources: `--input file.json` (an export from the console), `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` (the local emulator), and
`--sample` (150 made-up submissions, clearly labelled, to try the dashboard before there is real data).

## Privacy and security rules this tool follows

- Feedback stays private. Nothing is published, nothing is added to the website, and `reports/` is git-ignored. Do not upload report
  files anywhere public; the HTML carries a confidentiality banner.
- **Contact addresses are never in aggregates or exports** unless you pass `--include-contacts`. Emails, phone-like numbers and
  `@handles` are scrubbed from every exported comment either way. The stats-only CSV has no free text at all.
- Individual comments exist only in the local HTML (and `feedback.csv` / `feedback.json`, redacted). That is the developer's own machine.
- No Firebase admin credential or token is ever embedded in browser code, the website or the game. There is **no hosted admin dashboard**:
  a public page cannot authorise "the developer" without a server you operate, so the local tool is the secure option. If a hosted
  dashboard is ever wanted, build it behind Firebase Authentication with an admin custom claim and security rules checked in the
  emulator first.
- CSV cells that start like a spreadsheet formula (`=`, `+`, `-`, `@`) are prefixed with an apostrophe so opening an export in a
  spreadsheet cannot run player-supplied formulas.

## Reading the data without the tool

The Firebase console (Firestore → `feedback`) still works and bypasses the rules for project owners. The fields are documented in
`toFeedbackDoc` (`src/cloud/feedbackTransport.ts`): `rating` (1–5), the eight free-text answers, `difficulty`, `interest`
(`playLargerVersion`, `considerPurchasingFullGame`, `priceRange`, `voluntarySupport`), optional `contact`, optional `device`, `appVersion`,
`origin`, `uid`, `createdAt`.

## Tests

`tests/feedback-report.test.ts`: redaction (emails, phones, handles; nothing leaks into CSV/JSON/HTML), HTML cannot break out of its own
script tags, CSV formula neutralising, classification rules, totals/average/distribution/time series/version/platform/interest
aggregates, every filter, Firestore REST value conversion, tolerance of junk documents, the repo-key refusal, and that the generated
dashboard script parses.
