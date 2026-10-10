# Voluntary support for Novarah Interactives

The game is free and stays fully playable without any contribution. The support experience exists so that, **once a real payment
channel has been verified by the developer**, players who want to help can do so. Until then it shows an honest "being set up" message
and no payment control anywhere.

## Where it appears

| Place                              | What the player sees                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| Launch site `/download/` → Support | The promises, and a box that lists active channels or says support is being set up           |
| Game main menu                     | **Support the studio** → the support screen                                                  |
| Game Settings                      | **Support Novarah** → the same screen                                                        |
| Game About & credits               | A "Support Novarah Interactives" section with **How to support us** → the same screen        |

Everywhere, the wording is the same: free to play, no ads, no unlocks for sale, no gameplay advantage, no card or bank details collected
by us, contributions are gifts and not tax-deductible donations.

## The one configuration file

`public/support.json` (served at `/support.json`, read by the game and by the launch site). It ships with every channel
`"status": "pending"`. A channel is shown as **active** only when **all** of these hold (`src/support/supportLinks.ts` for the game,
`public/download/support-core.js` for the site; `tests/support.test.ts` runs the same cases against both):

- `status` is exactly `"verified"` and `verifiedOn` is a `YYYY-MM-DD` date you set after checking the destination yourself;
- **link** channels: an `https:` URL, no credentials in it, whose host is listed in `allowedHosts` (exact match; look-alike hosts such as
  `patreon.com.evil.example`, raw IPs and other schemes are refused);
- **QR** channels: `qrImage` is a file under `public/download/support/` (png, webp or jpg) that you supply.

Anything else (missing, malformed or unverified) stays inactive and no button, link or QR is rendered. Do not invent URLs, accounts or QR
codes; do not put card, bank or personal details in this file.

### Enabling a channel (when you have a verified destination)

1. **Bhutan National QR.** Obtain the QR from your bank or other approved channel, confirm it pays the right account, save the image as
   `public/download/support/bhutan-qr.png`, then in `support.json` set the `bhutan-qr` channel to `"status": "verified"`,
   `"verifiedOn": "<today>"`, `"qrImage": "support/bhutan-qr.png"`.
2. **Patreon (international, recurring).** Only if Patreon creator registration and payouts really work for you in Bhutan (check Patreon's
   current supported-country list and your bank's payout route). Then set `patreon` to `"verified"` with its page URL
   (`https://www.patreon.com/<page>`; `patreon.com` is already allowed).
3. **One-time international gift.** If a merchant channel is approved by a Bhutanese bank, add its host to `allowedHosts`, then set `one-time`
   to `"verified"` with its URL. Providers with both options can be listed twice (monthly and one-time) with the right `recurring` / `oneTime`
   flags; never describe a provider as offering something it does not.
4. Run `bun run test` (the safety tests), then deploy. No UI change is needed.

## Windows and Android

External links go through `openExternal` (`src/support/supportLinks.ts`): in the browser a new tab with `noopener,noreferrer`; inside the
Windows and Android apps the URL is handed to Tauri's opener plugin (`plugin:opener|open_url`), because a bare `window.open` is ignored in
the app webview. Only https URLs on the allow-list are ever opened. The native capability is restricted to the same hosts
(`src-tauri/capabilities/default.json`); add a host there too when you add one to `allowedHosts`.

## What this deliberately does not do

No payment form, no card entry, no subscription billing and no checkout of our own; no accounts or receipts; nothing that checks whether
someone contributed; no perks, vehicles, currency or cosmetics tied to support; no claim of tax-deductibility.
