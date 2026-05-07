# WatchTrack ↔ Plex Webhook Bridge — Deployment Guide

This Cloudflare Worker receives webhooks from your Plex Media Server when you watch something, then exposes them to WatchTrack to sync the watched-status back. Free tier is plenty for personal use (you'll use ~50 of 100,000 daily requests).

## What you'll need

- Cloudflare account (free)
- The `worker.js` file in this directory
- 5 minutes

## Step 1: Generate a shared secret

This is a random string that authenticates Plex → Worker → WatchTrack so randos can't write fake events.

In your terminal (Mac/Linux), run:

```bash
openssl rand -hex 32
```

Or in your browser console, run:

```javascript
[...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('')
```

Copy the output. Save it somewhere — you'll paste it into Cloudflare AND into WatchTrack Settings AND into Plex's webhook config. Don't share it.

## Step 2: Create the KV namespaces

The Worker uses Cloudflare KV (key-value store) to hold events and config.

1. In Cloudflare dashboard → **Workers & Pages** → **KV** (left sidebar).
2. Click **Create a namespace**. Name it `WATCHTRACK_EVENTS`. Click Add.
3. Click **Create a namespace** again. Name it `WATCHTRACK_CONFIG`. Click Add.

## Step 3: Store the secret in CONFIG KV

1. Click into the `WATCHTRACK_CONFIG` namespace.
2. Click **Add entry**.
3. **Key:** `secret`
4. **Value:** paste the shared secret you generated.
5. Click Add.

## Step 4: Create the Worker

1. Cloudflare dashboard → **Workers & Pages** → **Create**.
2. Select **Create Worker**.
3. Name it `watchtrack-plex` (or anything you want — this becomes part of the URL).
4. Click Deploy. (It'll deploy the default "Hello World" worker — we'll replace the code in a moment.)
5. After deploy, click **Edit code** (top right).
6. **Replace all the code** with the contents of `worker.js` from this directory.
7. Click **Save and deploy**.

You'll see a URL like `https://watchtrack-plex.YOURNAME.workers.dev`. Save this URL. This is your **Worker URL**.

## Step 5: Bind KV namespaces to the Worker

The Worker needs to access your KV namespaces. Bindings are how Cloudflare connects the two.

1. In your Worker's page → **Settings** tab → **Variables and Secrets** (or **Bindings** in newer UIs).
2. Scroll to **KV Namespace Bindings**.
3. Click **Add binding**.
   - **Variable name:** `EVENTS`
   - **KV namespace:** select `WATCHTRACK_EVENTS`
4. Click **Add binding** again.
   - **Variable name:** `CONFIG`
   - **KV namespace:** select `WATCHTRACK_CONFIG`
5. Click **Save and deploy**.

Important: the variable names must be EXACTLY `EVENTS` and `CONFIG` — those are what the Worker code expects.

## Step 6: Test the Worker

In your browser, visit:

```
https://watchtrack-plex.YOURNAME.workers.dev/health
```

You should see: `WatchTrack-Plex bridge online`. If you do, the Worker is live.

If you get a 1042 / 1101 / 503 error, the deploy failed — check Cloudflare's Workers logs.

## Step 7: Configure Plex to send webhooks

Plex Pass required (you have lifetime, you're set).

1. Go to **app.plex.tv** → **Settings** (top-right gear icon) → in the left sidebar, scroll down and click **Webhooks** under your server name.
2. Click **Add Webhook**.
3. **URL:** `https://watchtrack-plex.YOURNAME.workers.dev/webhook/YOUR_SHARED_SECRET`
   Replace YOURNAME with your Cloudflare subdomain and YOUR_SHARED_SECRET with the secret from Step 1.
4. Click **Save Changes**.

That's it on the Plex side. Plex will now POST to your Worker every time you watch something.

## Step 8: Configure WatchTrack

1. Open WatchTrack on your phone or TV.
2. Tap **Settings**.
3. Scroll to **Plex Webhook Bridge**.
4. **Worker URL:** `https://watchtrack-plex.YOURNAME.workers.dev`
   (No trailing slash, no `/health` or `/webhook/...` — just the base URL.)
5. **Shared Secret:** paste your secret.
6. Click **Test poll**. You should see `Worker reachable, secret accepted.`
7. Click **Save**.

## Verify end-to-end

1. Open Plex on your TV (or any device) and watch a few minutes of any episode/movie that's also in WatchTrack's catalog. Let it scrobble (~90% watched is when Plex marks it watched).
2. Open WatchTrack within a few minutes. The item should now show as "Watched" automatically.

If it doesn't:
- Check WatchTrack Settings → Plex Webhook Bridge → status line. It should say "Last poll: Xm ago."
- Check the Worker logs in Cloudflare dashboard → Workers & Pages → your worker → **Logs** tab. You should see POST requests to `/webhook/...` with status 200.
- If you see 403 errors in the Worker logs, the secret in Plex's webhook URL doesn't match the secret in CONFIG KV.

## Cost & quotas

- **Workers free tier:** 100,000 requests/day. You'll use maybe 50.
- **KV free tier:** 1,000 reads + 1,000 writes per day. You'll use maybe 20.
- **No credit card required** for free tier.

## Security notes

- The shared secret is your only auth gate. If it leaks, an attacker can poison your event stream (mark items as watched). Rotate by regenerating + updating in three places: Cloudflare CONFIG KV, Plex webhook URL, WatchTrack Settings.
- Events are stored in Cloudflare's KV with a 7-day TTL — they auto-delete if WatchTrack never polls. So there's nothing long-lived in the bridge.
- The Worker accepts events only from the `/webhook/{secret}` URL. There's no public posting endpoint.

## Updating the Worker

If you need to update `worker.js`:

1. Cloudflare dashboard → your Worker → **Edit code**.
2. Replace contents.
3. Click **Save and deploy**.

KV namespaces and bindings persist across deploys.
