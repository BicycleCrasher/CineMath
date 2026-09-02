// Golden tests for lib/launch.js — the platform ladder behind every "play" press.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectLaunchPlatform, intentUrl, buildLaunchCandidates, LAUNCH_LABELS } from '../lib/launch.js';
import { PROVIDER_BY_ID, PROVIDERS } from '../lib/providers.js';

const fx = JSON.parse(
  readFileSync(new URL('./fixtures/launch-cases.json', import.meta.url), 'utf8'),
);

// --- platform detection --------------------------------------------------

test('detectLaunchPlatform goldens', () => {
  fx.platform.forEach((c, i) => {
    assert.equal(detectLaunchPlatform(c), fx.expected.platform[i], JSON.stringify(c));
  });
});

test('detectLaunchPlatform needs Android before it will say TV', () => {
  assert.equal(detectLaunchPlatform({ ua: 'Mozilla/5.0 (Web0S; SmartTV)', isTV: true }), 'web');
  assert.equal(detectLaunchPlatform({ ua: 'Android 12; Pixel', isTV: true }), 'android-tv');
  assert.equal(detectLaunchPlatform({ ua: 'Android 12; Pixel' }), 'android');
  assert.equal(detectLaunchPlatform({}), 'web');
  assert.equal(detectLaunchPlatform(), 'web');
});

test('detectLaunchPlatform does not mistake "TV" inside a word for a TV', () => {
  assert.equal(detectLaunchPlatform({ ua: 'Mozilla/5.0 (Linux; Android 11; TVision-phone)' }), 'android');
});

// --- intent urls ---------------------------------------------------------

test('intentUrl builds an https intent with an encoded browser fallback', () => {
  assert.equal(
    intentUrl('https://www.netflix.com/search?q=Heat%20Wave', 'com.netflix.ninja'),
    'intent://www.netflix.com/search?q=Heat%20Wave'
    + '#Intent;scheme=https;package=com.netflix.ninja;'
    + 'S.browser_fallback_url=https%3A%2F%2Fwww.netflix.com%2Fsearch%3Fq%3DHeat%2520Wave;end',
  );
});

test('intentUrl refuses anything that is not https', () => {
  for (const bad of ['http://x.example', 'intent://x', 'javascript:alert(1)', 'plex://play', '', null]) {
    assert.throws(() => intentUrl(bad, 'com.example'), /https/, JSON.stringify(bad));
  }
});

// --- candidate ladders ---------------------------------------------------

fx.cases.forEach((c, i) => {
  test(`buildLaunchCandidates golden — ${c.name}`, () => {
    const entry = c.id ? PROVIDER_BY_ID.get(c.id) : null;
    assert.deepEqual(buildLaunchCandidates(entry, c.ctx), fx.expected.cases[i]);
  });
});

test('every ladder ends with a reachable https candidate', () => {
  const ctxs = [
    { platform: 'web', title: 'Heat' },
    { platform: 'android', title: 'Heat' },
    { platform: 'android-tv', title: 'Heat' },
    { platform: 'android-tv', title: 'Heat', launchApps: false },
    { platform: 'android-tv', title: 'Heat', plex: { ratingKey: '1' } },
  ];
  for (const entry of PROVIDERS.concat([null])) {
    for (const ctx of ctxs) {
      const out = buildLaunchCandidates(entry, ctx);
      assert.ok(out.length >= 1, `${entry && entry.id}: empty ladder`);
      const https = out.filter(c => c.kind === 'https');
      assert.ok(https.length >= 1, `${entry && entry.id}: no https candidate`);
      for (const c of https) assert.match(c.url, /^https:\/\//, `${entry && entry.id}`);
      assert.equal(out[out.length - 1].kind, 'https', `${entry && entry.id}: ladder must end on https`);
      for (const c of out) assert.ok(Object.values(LAUNCH_LABELS).includes(c.label), c.label);
    }
  }
});

test('android-tv prefers the TV package, android the mobile one', () => {
  const netflix = PROVIDER_BY_ID.get('netflix');
  const tv = buildLaunchCandidates(netflix, { platform: 'android-tv', title: 'Heat' });
  const phone = buildLaunchCandidates(netflix, { platform: 'android', title: 'Heat' });
  assert.match(tv[0].url, /package=com\.netflix\.ninja;/);
  assert.match(phone[0].url, /package=com\.netflix\.mediaclient;/);
  assert.equal(tv[0].kind, 'intent');
  assert.equal(tv[0].label, LAUNCH_LABELS.app);
});

test('a missing TV package falls back to the mobile package on android-tv', () => {
  const out = buildLaunchCandidates(PROVIDER_BY_ID.get('fandango'), { platform: 'android-tv', title: 'Heat' });
  assert.match(out[0].url, /package=air\.com\.vudu\.air\.DownloaderTablet;/);
});

test('no intent candidate on web, without packages, or with app launching off', () => {
  const netflix = PROVIDER_BY_ID.get('netflix');
  const noIntent = (out) => assert.equal(out.some(c => c.kind === 'intent'), false);
  noIntent(buildLaunchCandidates(netflix, { platform: 'web', title: 'Heat' }));
  noIntent(buildLaunchCandidates(netflix, { platform: 'android-tv', title: 'Heat', launchApps: false }));
  noIntent(buildLaunchCandidates(PROVIDER_BY_ID.get('shudder'), { platform: 'android-tv', title: 'Heat' }));
  noIntent(buildLaunchCandidates(null, { platform: 'android-tv', title: 'Heat' }));
});

test('a deep URL is used first, with the search URL kept as a last resort', () => {
  const out = buildLaunchCandidates(PROVIDER_BY_ID.get('netflix'), {
    platform: 'android-tv', title: 'Heat', deepUrl: 'https://www.netflix.com/title/60021793',
  });
  assert.deepEqual(out.map(c => c.kind), ['intent', 'https', 'https']);
  assert.equal(out[1].url, 'https://www.netflix.com/title/60021793');
  assert.equal(out[2].url, 'https://www.netflix.com/search?q=Heat');
  assert.match(out[0].url, /^intent:\/\/www\.netflix\.com\/title\/60021793#/);
  assert.match(out[0].url, /S\.browser_fallback_url=https%3A%2F%2Fwww\.netflix\.com%2Ftitle%2F60021793;end$/);
});

test('non-https deep URLs are dropped rather than launched', () => {
  for (const bad of ['http://evil.example/x', 'javascript:alert(1)', 'plex://play?x=1', '']) {
    const out = buildLaunchCandidates(PROVIDER_BY_ID.get('netflix'), {
      platform: 'android-tv', title: 'Heat', deepUrl: bad,
    });
    assert.deepEqual(out.map(c => c.url).filter(u => !u.startsWith('intent://')),
      ['https://www.netflix.com/search?q=Heat'], JSON.stringify(bad));
  }
});

test('uncurated providers still get a Google search ladder', () => {
  const out = buildLaunchCandidates(null, { platform: 'android-tv', title: 'Heat' });
  assert.deepEqual(out, [
    { kind: 'https', url: 'https://www.google.com/search?q=Heat', label: LAUNCH_LABELS.web },
  ]);
});

test('Plex candidates come first and skip the provider ladder', () => {
  const out = buildLaunchCandidates(PROVIDER_BY_ID.get('netflix'), {
    platform: 'android-tv',
    title: 'Heat',
    plex: { ratingKey: '4242', serverUrl: 'https://plex.example.com:32400', clientId: 'abc123' },
  });
  assert.deepEqual(out.map(c => c.kind), ['plex', 'https', 'https']);
  assert.equal(out[0].label, LAUNCH_LABELS.plex);
  assert.equal(out[0].url,
    'plex://play?metadataKey=/library/metadata/4242&server=https%3A%2F%2Fplex.example.com%3A32400');
  assert.equal(out[1].url,
    'https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F4242');
  assert.equal(out[2].url,
    'https://plex.example.com:32400/web/index.html#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F4242');
  assert.equal(out.some(c => c.url.includes('netflix.com')), false);
});

test('Plex without a client id drops the app.plex.tv candidate', () => {
  const out = buildLaunchCandidates(null, {
    platform: 'web', title: 'Heat', plex: { ratingKey: '4242', serverUrl: 'https://plex.example.com:32400' },
  });
  assert.deepEqual(out.map(c => c.kind), ['plex', 'https']);
  assert.equal(out.some(c => c.url.includes('app.plex.tv')), false);
});

test('Plex with only a rating key still offers a website', () => {
  const out = buildLaunchCandidates(PROVIDER_BY_ID.get('netflix'), {
    platform: 'web', title: 'Heat', plex: { ratingKey: '4242' },
  });
  assert.deepEqual(out.map(c => c.kind), ['plex', 'https']);
  assert.equal(out[1].url, 'https://www.netflix.com/search?q=Heat');
});
