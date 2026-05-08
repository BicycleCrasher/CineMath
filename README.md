# WatchTrack — Deployment Guide

A Progressive Web App (PWA) that installs to your Android home screen as a real-feeling app. Tracks films and television across 21 genre-aware tabs with status, ratings, reaction tags, and category filtering.

## What's in this folder

```
index.html               ← the app
styles.css               ← styles
app.js                   ← logic
manifest.json            ← PWA config
service-worker.js        ← offline support
icons/
  icon-192.png           ← Android home-screen icon
  icon-512.png           ← splash-screen icon
data/
  catalogs.json          ← tab manifest (defines the 21 tabs)
  scifi.json             ← Sci-Fi films
  scifi-tv.json          ← Sci-Fi TV (limited + ongoing)
  espionage.json         ← Spy films
  spy-tv.json            ← Spy TV
  crime.json             ← Crime films
  crime-tv.json          ← Crime TV
  cons-courtroom.json    ← Cons & Courtroom films
  cons-courtroom-tv.json ← Cons & Courtroom TV
  horror.json            ← Horror films
  horror-tv.json         ← Horror TV
  fantasy.json           ← Fantasy films
  fantasy-tv.json        ← Fantasy TV
  heist.json             ← Heist films
  comedy.json            ← Comedy films
  comedy-tv.json         ← Comedy TV
  british-comedy.json    ← British Comedy (panel, sitcom, game, news, specials)
  drama.json             ← Drama films
  drama-tv.json          ← Drama TV
  foreign.json           ← Foreign / international film
  auteur.json            ← Auteur retrospectives
  pre1960.json           ← Classics
```

To add new films or shows later, you (or Claude) edit/add JSON files in `/data/`. The app picks them up on next refresh.

---

## Step-by-step: Deploying to GitHub Pages (Android-ready)

### 1. Create a GitHub account

If you don't have one: go to **github.com**, click "Sign up", pick a username (this becomes part of your URL), confirm your email. Free tier is fine — GitHub Pages is included.

### 2. Create a new repository

- Click the **+** in the top-right → **New repository**
- Name it: `WatchTrack` (or anything else; this becomes part of the URL)
- Set to **Public** (required for free GitHub Pages)
- Don't initialize with README, .gitignore, or license — leave checkboxes empty
- Click **Create repository**

### 3. Upload the files

You'll see a page with several options. Click **"uploading an existing file"** in the line that says "Quick setup".

- Drag the entire contents of this folder (not the folder itself, but everything inside) into the upload area
- **Important:** GitHub's web uploader handles subfolders. Just drag the `data/` and `icons/` folders along with the loose files, and it will preserve the structure
- Scroll down, in the "Commit changes" box, type `Initial upload`
- Click **Commit changes**

### 4. Enable GitHub Pages

- In your new repository, click **Settings** (top tab)
- In the left sidebar, scroll to find and click **Pages**
- Under "Build and deployment":
  - **Source:** Deploy from a branch
  - **Branch:** `main`, folder `/ (root)`
  - Click **Save**
- Wait 1-2 minutes
- A green banner will appear with your URL: `https://YOUR-USERNAME.github.io/WatchTrack/`

### 5. Install on your Android phone

- Open Chrome on your phone
- Navigate to the GitHub Pages URL from step 4
- Tap the three-dot menu (⋮) in the top-right
- Tap **"Add to Home screen"** or **"Install app"**
- Confirm the install
- The app icon appears on your home screen

That's it. The app:
- Opens full-screen, no browser chrome
- Works offline (after first load)
- Saves your progress locally
- Updates automatically when you push changes to GitHub

---

## Using the app

### Tabs and categories

The top nav has 25 tabs. **Watchlist** is first; the other 24 are alphabetical (Auteur, British Comedy, Classics, Comedy, Comedy TV, Cons & Courtroom, Cons & Courtroom TV, Crime, Crime TV, Drama, Drama TV, Fantasy, Fantasy TV, Foreign, Heist, Heroes & Comics, Heroes & Comics TV, Horror, Horror TV, Musicals, Sci-Fi, Sci-Fi TV, Spy, Spy TV).

**Watchlist** is the "what now" view. It aggregates across every catalog into three sections:
- **Currently Watching** — what you've marked as in-progress
- **Your Queue** — what you've marked as queued, sorted most-recently-touched first
- **System Suggestions** — items I've flagged high or medium priority that you haven't engaged with yet

Tap any item from the Watchlist and changes route back to that item's source tab.

Inside each genre tab, two pill rows above the content:
- **Top row (warm coral):** category filter — narrow to a sub-genre (e.g., Drama TV → "Sorkin", Foreign → "Korean", Auteur → "Coens"). Tap "All" to clear.
- **Bottom row (gold):** status filter — All / Queued / Watching / Watched / Skipped / Rated. The first item on this row is a **Sort dropdown** (Default / Recently updated / Year / Title / My rating).

Category filters remember your selection per tab as you switch between tabs. They auto-clear after 30 seconds away from a tab and after 5 minutes of the app being backgrounded — never affecting ratings or status.

### Header buttons

- **Search** — search by title, director, country, section, or pitch text across every tab
- **Notes** — full-text search across your saved notes
- **Stats** — read-only dashboard with status counts, rating distribution, activity, top tags, per-tab progress
- **Triage Queue** — focused single-item review of your queued items
- **Triage Suggested** — focused review of system suggestions
- **Settings** — display mode (Auto / Phone / TV) and Plex Media Server connection
- **Reset / Export / Import** — same as before. Import now shows a diagnostic summary instead of a generic confirmation.

### TV mode

WatchTrack auto-detects TV displays (Sony Bravia, Google TV, Chromecast) and switches to a TV-optimized layout with larger fonts, focus rings, and D-pad navigation. Use the arrow keys (or TV remote D-pad) to move between items, Enter to select, Backspace/Escape to close modals. Notes editing is hidden in TV mode since D-pad typing is impractical — edit notes from the phone.

You can override auto-detection in Settings → Display. Choose Auto, Phone, or TV.

### Plex integration

Settings → Plex Integration accepts your Plex auth token, server URL, and (optionally) server identifier. Once configured:

- Items in your Plex library show a `⊕ Plex` badge
- Each matched item gets a **▶ Play on Plex** button that launches the Plex Android TV app to that exact item
- Marking "watching" via Play on Plex automatically updates your status

Your token is stored only in localStorage on the device that accepts it. It never goes through GitHub Pages or any third party.

To get a Plex auth token: log in to app.plex.tv on a desktop, open dev tools console (F12), and paste `localStorage.getItem('myPlexAccessToken')`.

### Reaction tags

When you rate something, the tag bar adapts to what you're rating. Films use one set, prestige TV uses another, sitcoms another, panel shows and game shows their own. The system resolves the right set automatically based on the tab and the item's metadata.

---

## Adding new content later

When Claude generates new recommendations:

1. Claude provides updated/new JSON files
2. Save them locally
3. Go to your GitHub repo → `data/` folder
4. Either drag-drop the new file (for new files) or click an existing file → pencil icon → paste replacement → commit
5. Wait ~1 minute for GitHub Pages to redeploy
6. Pull-to-refresh in the app on your phone, or close-and-reopen

The service worker may briefly serve a cached version. If you don't see updates, close the app completely (swipe away from recents) and reopen.

When Claude updates `app.js`, `service-worker.js`, or the catalog manifest, you'll usually need to bump the cache version inside `service-worker.js` (e.g., `scifi-tracker-v10` → `v11`) so old caches evict on next load.

---

## Sharing your progress with Claude

- Open the app
- Tap **Export** in the header
- Tap **Copy to clipboard**
- Paste into a Claude conversation
- Claude reads the JSON directly, sees what you've watched, rated, and tagged across all 21 tabs

---

## Troubleshooting

**"Add to Home screen" doesn't appear:**
- Make sure you're using Chrome on Android (not Samsung Internet or Firefox — those work too but UI differs)
- The site must be served over HTTPS (GitHub Pages does this automatically)
- Wait until the page fully loads before tapping the menu

**App still says the old name after update:**
- The PWA caches its name from `manifest.json` at install time
- Long-press the icon → uninstall → reopen the URL in Chrome → reinstall from the menu

**Icons look generic:**
- Replace `icons/icon-192.png` and `icons/icon-512.png` with your own designs (same dimensions, PNG)
- Reinstall the app on your phone (long-press icon → uninstall, then reinstall from Chrome)

**Progress not saving:**
- Make sure you're using the installed app, not in a private/incognito tab
- localStorage is per-domain — uninstalling and reinstalling preserves data; clearing browser data wipes it
- Use Export periodically as a backup

**Updates not showing:**
- Service workers cache aggressively. Close the app completely (swipe up to remove from recents) and reopen.
- For stubborn cases: in Chrome, go to your GitHub Pages URL, tap menu → settings → site settings → clear & reset

**Tab is empty or category pills don't appear:**
- A catalog file may have failed to load. Hard-refresh the PWA. If a specific tab stays empty after that, the JSON for that tab probably has a syntax error — re-pull the latest from the repo.
