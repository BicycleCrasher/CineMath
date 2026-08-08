# Versioning

CinéMath currently has **three independent version tracks** (plus a deploy
counter) that have drifted apart. This page documents what each file actually
says as of 2026-08-08 (main @ `542bd83`), so a future unification has a
starting point. **Nothing has been renumbered** — that is a deliberate,
separate decision.

## The three tracks

| Track | Source of truth | Current value | Notes |
|---|---|---|---|
| App changelog | `CHANGELOG.md` | **8.0.0** (top entry, dated 2026-05-13) | Semantic-ish `major.moderate.minor` scheme defined at the top of the file. |
| npm package | `package.json` | **5.36.0** | Never shipped to a registry; effectively vestigial. |
| Worker | `worker/worker.js` line 1 header comment | **v5.12** ("adds /chat endpoint backed by Workers AI") | The body of the same file contains newer `v9.0.0` section markers (CORS lockdown, multi-user identity/auth, pair-session SSE, UUID migration, rate limiting) and older `v5.4` endpoint comments — the header was simply never bumped. |

Additional sightings of a **v9.0.0** track: `.github/workflows/release-apk.yml`
(header comment) and the former `install.apk` pseudo-redirect (removed in this
branch) both labeled themselves v9.0.0, aligning with the worker's v9.0.0
section comments rather than with any of the three headline numbers above.

Separately, `service-worker.js` uses a **deploy counter**, not a semantic
version: `CACHE_NAME = 'cinemath-v11'`, bumped whenever cached assets change
(managed by the `sw-cache-bump` GitHub Action — do not edit by hand). Per
`CHANGELOG.md`, the cache was namespaced `scifi-tracker-vN` before 7.0.0.

## Recommendation (for Lincoln to decide — not applied)

1. Make `CHANGELOG.md` the single user-facing version track; it is the only
   one with a written scheme and dated history.
2. On the next release, sync `package.json` to the changelog version and keep
   it synced (a one-line check in CI or the build script would prevent drift).
3. Drop per-file version numbers from `worker/worker.js`'s header comment
   (or update it in the same commit as the changelog); the inline
   `vN.N.N —` section comments are useful as history markers and can stay.
4. Keep the service-worker cache counter as-is — it tracks deployments, not
   versions, and is automated.
5. Release tags (`v*`, which trigger `release-apk.yml`) should use the
   changelog number.
