# Proposal: private source, public releases

**Status: proposal only. Nothing has been changed on GitHub.** The repository `uhollica666/crazy-bhutan-hill-race` is, and during Stage 7F
remains, public. No visibility change, deletion, transfer or force-push is made without the developer's explicit approval.

## Why consider it

The gameplay source, art pipeline and Firebase rules are the studio's work. A public source repository lets anyone read, fork or reuse
them (subject to the licences in `ASSET_CREDITS.md`). Players only need binaries, the website and a place to report problems.

## What depends on the repository being public today

| Thing                                   | Today                                                                            | If the source repo becomes private                              |
| --------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Download links on `/download/`          | `github.com/uhollica666/crazy-bhutan-hill-race/releases/download/...`            | **Break** (releases of a private repo are not public)           |
| `release.json` checks in the site code  | Only accepts URLs under this repo's `/releases/`                                 | Must be pointed at the new releases repo                        |
| In-game / site "Report a bug" links     | Pre-filled GitHub issues on this repo                                            | Anonymous reporters can no longer open them                     |
| GitHub stars                            | Visible endorsement of this repo                                                 | Stars on the old repo stop being visible to non-members         |
| Vercel production deploys               | CLI deploys using the linked project (`.vercel/`), plus the GitHub integration   | Keep working: Vercel can build from a private repo              |
| Issues and discussions                  | On this repo                                                                     | Stay private to collaborators                                   |

## Recommended structure

1. **`novarah/crazy-bhutan-hill-race` (private): source of truth.** All development, the Firebase rules, the art pipeline, CI. Vercel
   keeps deploying the game and `/download/` from here (connect the Vercel project to the private repo; the GitHub integration supports
   private repositories on every plan). Signing keys remain outside Git as now.
2. **`novarah/cbhr-releases` (public): binaries only.** Each release carries the Windows EXE and MSI, the Android APK and
   `SHA256SUMS.txt`, with the same tag names (`v0.4.0-beta.2`, ...). A tiny README links to the website. No source.
3. **`novarah/cbhr-community` (public, optional): the community front door.** Issue forms for bugs, features and "join the team"; a
   Discussions board; the roadmap. It can hold the public star button: a star there endorses the project without exposing the code.

### Mechanics (when approved)

- Create the two public repos first; publish the next release (`v0.4.0-beta.3`) to `cbhr-releases`; update `release.json` and the URL check in
  `public/download/site.js` to the new releases path; point the site's issue links at `cbhr-community`; redeploy; verify every link with
  `scripts/public-release-smoke.mjs`.
- Only then make the old repo private. **Preserve existing download links:** GitHub does not redirect release assets between
  repositories, so for the existing `v0.4.0-beta.1` / `beta.2` URLs either (a) re-upload the same files to `cbhr-releases` under the same tag
  names and add a redirect page on the site for the old paths, or (b) keep the old repo public until those releases are mirrored. Checksums
  prove the mirrored files are identical.
- Transferring the repository to an organisation keeps the URL redirecting for git and web (not for release downloads), which is
  not a substitute for the mirror.

## Consequences to accept

- **Stars:** the existing star count stays on the old repo (visible only to members once private). A new public repo starts at zero.
  Be clear on the site that a star endorses a repository and is not a game rating (already stated in the community section).
- **Issues and discussions:** historic public issues become private with the repo; migrate any worth keeping to the community repo first.
- **Open-source claims:** the README and licences must not imply the source is open once it is private. Third-party attributions still
  apply to shipped binaries (they stay in `licenses.txt` and About).
- **Forks:** anything already forked or cloned remains public and cannot be recalled.
- **Contributors:** nobody gets source access automatically; the team-interest form only collects interest. Invite collaborators to the
  private repo individually, after you have spoken to them.

## Decision checklist for the developer

- [ ] Do you want to keep any public source at all (community repo with docs/tools only)?
- [ ] Which GitHub account or organisation should own the three repos?
- [ ] Approve the mirror plan for existing release URLs.
- [ ] Confirm Vercel's GitHub integration (or CLI deploy) should follow the private repo.
