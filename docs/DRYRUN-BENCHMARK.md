# Plex Watch History — Dry-Run Benchmark (2026-05-07)

Snapshot of analysis before bulk-sync was implemented. Useful as a baseline for measuring matcher quality in future versions.

## Source data

- File: `watched_so_far.txt` (Plex `/status/sessions/history/all` export)
- Total `<Video>` entries: 372
- Library whitelist applied (sections 1 = movies, 2 = TV; section 3 excluded)
- Retained after whitelist: **340 entries**

## Breakdown after filter

- Movies: 66 plays / 63 distinct movies
- Episodes: 274 plays / 270+ distinct episodes across 15 shows

## Catalog (at v5.3 baseline, before House/Blacklist/etc additions)

- Total catalog items: 650
- Movies in catalog: 401
- TV shows in catalog: 249

## Match rate (v5.3 matcher with aliases + apostrophe handling + paren-stripping)

### Movies
- Plex movies matching catalog: **4 / 63** (6%)
- Plex movies NOT in catalog (orphans): 59
- Notable orphans: *Inception, Django Unchained, Beetlejuice, Casino Royale, Gladiator, Avatar, Deadpool & Wolverine, Operation Fortune, Extract, Constantine, Cruella, Friday, Harriet, GoldenEye, A.I., Alien: Romulus, Guardians of the Galaxy Vol. 3, The Terminator*

### TV
- Plex shows matching catalog: **7 / 15** (47%)
  - Matched: It's Always Sunny in Philadelphia, QI, QI XL (via alias), Vicious, 8 Out of 10 Cats Does Countdown, Taskmaster, Top Gear (likely)
- Plex shows NOT in catalog: 8
  - Significant: *House* (110 distinct episodes), *The Blacklist* (66), *Boston Legal* (10), *Will & Grace* (6), *Matlock 2024* (4), *RuPaul's Drag Race* (1), *Mafia: Most Wanted* (3), *Dune* (1)

## Loved-trigger analysis

Per the bulk-sync rules, ≥5 distinct episodes = loved. Shows that would qualify:

- 110 distinct — House (will be added to catalog → triggers loved)
- 66 distinct — The Blacklist (will be added → triggers loved)
- 39 distinct — It's Always Sunny in Philadelphia (already in catalog → triggers loved)
- 10 distinct — Boston Legal (will be added → triggers loved)
- 9 distinct — QI (already in catalog → triggers loved)
- 9 distinct — Vicious (already in catalog → triggers loved)
- 6 distinct — Will & Grace (will be added → triggers loved)

Below threshold: 8 Out of 10 Cats Does Countdown (4), Taskmaster (4), Matlock (4) — would not trigger loved on bulk-sync, but these are episodic shows where ≥5 will arrive naturally.

## Catalog gaps identified for v5.3 → v5.3.1 update

Added to catalog before bulk-sync:
- *House MD* → Drama TV (`tvCompletionMode: 'flexible'`)
- *The Blacklist* → Crime TV (`tvCompletionMode: 'flexible'`)
- *Matlock (2024)* → Crime TV (`tvCompletionMode: 'episodic'`)
- *Boston Legal* → Cons & Courtroom TV (`tvCompletionMode: 'flexible'`)
- *Will & Grace* → Comedy TV (`tvCompletionMode: 'flexible'`)
- *QI XL* → alias on existing QI item

Still orphan (would land in VIEWED KV but not catalog):
- *RuPaul's Drag Race* (1 episode — too sparse to add)
- *Mafia: Most Wanted* (3 episodes)
- *Dune* (1 — likely the 2024 series)

## Movie orphans (59) for future review

The bulk-sync writes all to VIEWED KV. WatchTrack's future Plex History modal will surface these for triage / promotion to catalog. Notable for follow-up addition:

- *Inception* (already a candidate for Sci-Fi tab)
- *Django Unchained, Casino Royale, GoldenEye* (Spy/Crime canon)
- *Avatar, Avatar: The Way of Water, Alien: Romulus, A.I., Constantine, The Terminator, Guardians of the Galaxy Vol. 3, Deadpool & Wolverine* (Sci-Fi canon)
- *Gladiator, Beetlejuice, Cruella, Operation Fortune, Friday* (need decisions)
- *Harriet, Extract* (Drama / Comedy)

## What this benchmark tells us

1. The catalog covers a small slice of actual viewing — **the orphan-storage layer is essential, not optional**.
2. TV match rate (47%) is much higher than movie match rate (6%) — TV-watching is more concentrated on a few shows that the catalog tracks; movies are a long tail.
3. After 5 catalog additions for this round, TV match rate jumps to 13/15 = 87%.
4. The "5 distinct episodes = loved" rule fires on 7 shows, all of which will be in the catalog after this update. That's appropriate signal density.
