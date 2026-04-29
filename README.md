# Cerebral Sci-Fi Tracker — Deployment Guide

A Progressive Web App (PWA) that installs to your Android home screen as a real-feeling app.

## What's in this folder

```
index.html           ← the app
styles.css           ← styles
app.js               ← logic
manifest.json        ← PWA config
service-worker.js    ← offline support
icons/
  icon-192.png       ← Android home-screen icon
  icon-512.png       ← splash-screen icon
data/
  films.json         ← film catalog
  tv-limited.json    ← limited series catalog
  tv-ongoing.json    ← ongoing series catalog
```

To add new films or shows later, you (or Claude) edit/add JSON files in `/data/`. The app picks them up on next refresh.

---

## Step-by-step: Deploying to GitHub Pages (Android-ready)

### 1. Create a GitHub account

If you don't have one: go to **github.com**, click "Sign up", pick a username (this becomes part of your URL), confirm your email. Free tier is fine — GitHub Pages is included.

### 2. Create a new repository

- Click the **+** in the top-right → **New repository**
- Name it: `scifi-tracker` (or anything else; this becomes part of the URL)
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
- A green banner will appear with your URL: `https://YOUR-USERNAME.github.io/scifi-tracker/`

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

## Adding new content later

When Claude generates new film recommendations:

1. Claude provides updated/new JSON files
2. Save them locally
3. Go to your GitHub repo → `data/` folder
4. Either drag-drop the new file (for new files) or click an existing file → pencil icon → paste replacement → commit
5. Wait ~1 minute for GitHub Pages to redeploy
6. Pull-to-refresh in the app on your phone, or close-and-reopen

The service worker may briefly serve a cached version. If you don't see updates, close the app completely (swipe away from recents) and reopen.

---

## Sharing your progress with Claude

- Open the app
- Tap **Export** in the header
- Tap **Copy to clipboard**
- Paste into a Claude conversation
- Claude reads the JSON directly, sees what you've watched, rated, and tagged across all three tabs

---

## Troubleshooting

**"Add to Home screen" doesn't appear:**
- Make sure you're using Chrome on Android (not Samsung Internet or Firefox — those work too but UI differs)
- The site must be served over HTTPS (GitHub Pages does this automatically)
- Wait until the page fully loads before tapping the menu

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
