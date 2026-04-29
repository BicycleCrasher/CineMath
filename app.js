const POSITIVE_TAGS = ["Rewatchable","Stayed with me","Visually stunning","Smart structure","Emotionally resonant","Want more like this"];
const NEGATIVE_TAGS = ["Too slow","Too bleak","Too cold","Style over substance","Premise didn't land","Dated badly"];

const STORAGE_KEY = 'scifi-tracker-state';
const TAB_KEY = 'scifi-tracker-active-tab';

// Pre-loaded ratings from the original tracker
const SEED_STATE = {
  "films": {
    "2001:-a-space-odyssey-1968": { status: "watched", rating: "loved", reactionTags: ["Rewatchable","Stayed with me","Visually stunning","Want more like this","Emotionally resonant","Smart structure"], notes: "Love this one. I've watched it many times, love it every time." },
    "blade-runner-1982": { status: "watched", rating: "liked", reactionTags: ["Visually stunning","Rewatchable"], notes: "I've always been confused by this one." },
    "timecrimes-2007": { status: "watched", rating: "loved", reactionTags: ["Rewatchable","Stayed with me","Want more like this","Smart structure"], notes: "Fantastic. Understood without subtitles." },
    "dune-1984": { status: "watched", rating: "loved" },
    "dune:-part-one-2021": { status: "watched", rating: "loved" },
    "dune:-part-two-2024": { status: "watched", rating: "loved" }
  },
  "tv-limited": {
    "frank-herbert's-dune-2000": { status: "watching" },
    "frank-herbert's-children-of-dune-2003": { status: "queued" }
  },
  "tv-ongoing": {}
};

// State organized by tab
let state = { films: {}, "tv-limited": {}, "tv-ongoing": {} };
let catalogs = { films: null, "tv-limited": null, "tv-ongoing": null };
let activeTab = 'films';
let activeFilter = 'all';
const expandedIds = new Set();

// === Storage ===
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
      // Make sure all tabs exist
      if (!state.films) state.films = {};
      if (!state["tv-limited"]) state["tv-limited"] = {};
      if (!state["tv-ongoing"]) state["tv-ongoing"] = {};
      return;
    }
  } catch (e) { console.error('Load failed:', e); }
  // First load — apply seed
  state = JSON.parse(JSON.stringify(SEED_STATE));
  saveState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { console.error('Save failed:', e); }
}

function loadActiveTab() {
  try {
    const t = localStorage.getItem(TAB_KEY);
    if (t && ['films','tv-limited','tv-ongoing'].includes(t)) activeTab = t;
  } catch (e) {}
}

function saveActiveTab() {
  try { localStorage.setItem(TAB_KEY, activeTab); } catch (e) {}
}

// === Catalog loading ===
async function loadCatalogs() {
  const tabs = ['films','tv-limited','tv-ongoing'];
  for (const tab of tabs) {
    try {
      const resp = await fetch(`data/${tab}.json`);
      catalogs[tab] = await resp.json();
      // Add IDs and order to items
      let order = 1;
      catalogs[tab].items = [];
      catalogs[tab].sections.forEach(section => {
        section.items.forEach(item => {
          item.section = section.name;
          item.sectionDesc = section.desc;
          item.order = order++;
          item.id = `${item.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${item.year}`;
          catalogs[tab].items.push(item);
        });
      });
    } catch (e) {
      console.error(`Failed to load ${tab}:`, e);
    }
  }
}

// === State helpers ===
function getEntry(id) { return (state[activeTab] && state[activeTab][id]) || {}; }
function getStatus(id) { return getEntry(id).status || 'none'; }
function getRating(id) { return getEntry(id).rating || 'none'; }
function getTags(id) { return getEntry(id).reactionTags || []; }
function getNotes(id) { return getEntry(id).notes || ''; }

function setStatus(id, status) {
  if (!state[activeTab]) state[activeTab] = {};
  if (!state[activeTab][id]) state[activeTab][id] = {};
  state[activeTab][id].status = status;
  if (status !== 'watched' && status !== 'watching') {
    delete state[activeTab][id].rating;
    delete state[activeTab][id].reactionTags;
  }
  saveState(); render();
}

function setRating(id, rating) {
  if (!state[activeTab]) state[activeTab] = {};
  if (!state[activeTab][id]) state[activeTab][id] = {};
  if (state[activeTab][id].rating === rating) {
    delete state[activeTab][id].rating;
  } else {
    state[activeTab][id].rating = rating;
  }
  saveState();
  updateItemInPlace(id);
}

function toggleTag(id, tag) {
  if (!state[activeTab]) state[activeTab] = {};
  if (!state[activeTab][id]) state[activeTab][id] = {};
  if (!state[activeTab][id].reactionTags) state[activeTab][id].reactionTags = [];
  const idx = state[activeTab][id].reactionTags.indexOf(tag);
  if (idx === -1) state[activeTab][id].reactionTags.push(tag);
  else state[activeTab][id].reactionTags.splice(idx, 1);
  saveState();
  updateItemInPlace(id);
}

function setNotes(id, notes) {
  if (!state[activeTab]) state[activeTab] = {};
  if (!state[activeTab][id]) state[activeTab][id] = {};
  state[activeTab][id].notes = notes;
  saveState();
}

function cycleStatus(id) {
  const cur = getStatus(id);
  const next = cur === 'none' ? 'queued'
             : cur === 'queued' ? 'watching'
             : cur === 'watching' ? 'watched'
             : cur === 'watched' ? 'skip'
             : 'none';
  setStatus(id, next);
}

// === In-place DOM updates ===
function updateItemInPlace(id) {
  const itemEl = document.querySelector(`.item[data-id="${id}"]`);
  if (!itemEl) return;
  const rating = getRating(id);
  const reactionTags = getTags(id);

  itemEl.querySelectorAll('.rating-btn').forEach(btn => {
    btn.classList.remove('active-loved','active-liked','active-mixed','active-disliked');
    if (btn.dataset.rating === rating) btn.classList.add(`active-${rating}`);
  });

  let badge = itemEl.querySelector('.rating-badge');
  if (rating !== 'none') {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'rating-badge';
      const badgeRow = itemEl.querySelector('.badge-row');
      if (badgeRow) badgeRow.appendChild(badge);
    }
    badge.className = `rating-badge ${rating}`;
    badge.textContent = ratingLabel(rating);
  } else if (badge) {
    badge.remove();
  }

  itemEl.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.remove('active-pos','active-neg');
    if (reactionTags.includes(btn.dataset.tag)) {
      const isPos = POSITIVE_TAGS.includes(btn.dataset.tag);
      btn.classList.add(isPos ? 'active-pos' : 'active-neg');
    }
  });

  updateStats();
}

function updateStats() {
  if (!catalogs[activeTab]) return;
  const items = catalogs[activeTab].items;
  const watched = items.filter(f => getStatus(f.id) === 'watched').length;
  const watching = items.filter(f => getStatus(f.id) === 'watching').length;
  const rated = items.filter(f => getRating(f.id) !== 'none').length;
  const queued = items.filter(f => getStatus(f.id) === 'queued').length;
  document.getElementById('watched-count').textContent = watched;
  document.getElementById('watching-count').textContent = watching;
  document.getElementById('rated-count').textContent = rated;
  document.getElementById('queued-count').textContent = queued;
  document.getElementById('total-count').textContent = items.length;
  document.getElementById('progress').style.width = `${(watched / items.length) * 100}%`;
}

// === Filter logic ===
function buildFilters() {
  const isFilms = activeTab === 'films';
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'priority-high', label: 'High priority' },
    { key: 'priority-med', label: 'Med priority' },
    { key: 'watching', label: 'Watching' },
    { key: 'unwatched', label: 'Unseen' },
    { key: 'queued', label: 'Queued' },
    { key: 'watched', label: 'Watched' },
    { key: 'loved', label: 'Loved' },
    { key: 'liked', label: 'Liked+' }
  ];
  if (isFilms) {
    filters.push({ key: 'foundational', label: 'Foundational' });
    filters.push({ key: 'modern', label: 'Modern' });
    filters.push({ key: 'under', label: 'Under-radar' });
    filters.push({ key: 'intl', label: 'International' });
    filters.push({ key: 'adjacent', label: 'Adjacent' });
  } else {
    filters.push({ key: 'short', label: 'Short' });
    filters.push({ key: 'medium', label: 'Medium' });
    filters.push({ key: 'long', label: 'Long' });
  }

  const container = document.getElementById('filters');
  container.innerHTML = filters.map(f =>
    `<button class="filter-btn ${activeFilter === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>`
  ).join('');

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      render();
    });
  });
}

function itemMatchesFilter(item) {
  const status = getStatus(item.id);
  const rating = getRating(item.id);
  switch (activeFilter) {
    case 'all': return true;
    case 'priority-high': return item.priority === 'high';
    case 'priority-med': return item.priority === 'med';
    case 'watching': return status === 'watching';
    case 'unwatched': return status === 'none' || status === 'queued';
    case 'queued': return status === 'queued';
    case 'watched': return status === 'watched';
    case 'loved': return rating === 'loved';
    case 'liked': return rating === 'loved' || rating === 'liked';
    case 'short': return item.commitmentTag === 'short';
    case 'medium': return item.commitmentTag === 'medium';
    case 'long': return item.commitmentTag === 'long';
    case 'foundational': return item.tags && item.tags.includes('foundational');
    case 'modern': return item.tags && item.tags.includes('modern');
    case 'under': return item.tags && item.tags.includes('under');
    case 'intl': return item.tags && item.tags.includes('intl');
    case 'adjacent': return item.tags && item.tags.includes('adjacent');
    default: return true;
  }
}

function statusIcon(status) {
  switch (status) {
    case 'watched': return '✓';
    case 'watching': return '▸';
    case 'queued': return '◐';
    case 'skip': return '✕';
    default: return '';
  }
}

function ratingLabel(rating) {
  return { loved: 'Loved', liked: 'Liked', mixed: 'Mixed', disliked: 'Disliked' }[rating] || '';
}

function priorityLabel(p) {
  return { high: 'High Priority', med: 'Med Priority' }[p] || '';
}

// === Render ===
function render() {
  if (!catalogs[activeTab]) return;
  const catalog = catalogs[activeTab];

  document.getElementById('tab-subtitle').textContent = catalog.subtitle;

  const container = document.getElementById('items-container');
  container.innerHTML = '';
  let lastSection = null;

  catalog.items.forEach(item => {
    if (item.section !== lastSection) {
      const sectionItems = catalog.items.filter(f => f.section === item.section);
      const visibleCount = sectionItems.filter(itemMatchesFilter).length;
      if (visibleCount > 0) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'section-header';
        const parts = item.section.split('.');
        sectionEl.innerHTML = `
          <div class="ornament">· · ·</div>
          <div class="section-num">${parts[0]}</div>
          <h2 class="section-title">${parts.slice(1).join('.').trim()}</h2>
          <p class="section-desc">${item.sectionDesc}</p>
        `;
        container.appendChild(sectionEl);
      }
      lastSection = item.section;
    }

    if (!itemMatchesFilter(item)) return;

    const status = getStatus(item.id);
    const rating = getRating(item.id);
    const reactionTags = getTags(item.id);
    const notes = getNotes(item.id);
    const itemEl = document.createElement('div');
    let priorityClass = '';
    if (item.priority === 'high') priorityClass = ' priority-high';
    if (item.priority === 'med') priorityClass = ' priority-med';
    itemEl.className = 'item' + priorityClass;
    itemEl.dataset.id = item.id;
    itemEl.dataset.status = status;
    if (expandedIds.has(item.id)) itemEl.classList.add('expanded');

    const criticsHtml = (item.critics || []).map(c => `
      <div class="critic-block">
        <div class="critic-label"><span class="crit">${c.who}</span></div>
        <p>${c.quote}</p>
      </div>
    `).join('');

    const priorityBadge = item.priority ? `<span class="priority-badge ${item.priority}">${priorityLabel(item.priority)}</span>` : '';
    const ratingBadge = rating !== 'none' ? `<span class="rating-badge ${rating}">${ratingLabel(rating)}</span>` : '';
    const commitmentBadge = item.commitment ? `<span class="commitment">${item.commitment}</span>` : '';

    const whyHtml = item.whyPriority ? `<div class="why-priority"><strong>Why this priority:</strong> ${item.whyPriority}</div>` : '';

    const posTagsHtml = POSITIVE_TAGS.map(t => {
      const active = reactionTags.includes(t);
      return `<button class="tag-btn ${active ? 'active-pos' : ''}" data-tag="${t}">${t}</button>`;
    }).join('');

    const negTagsHtml = NEGATIVE_TAGS.map(t => {
      const active = reactionTags.includes(t);
      return `<button class="tag-btn ${active ? 'active-neg' : ''}" data-tag="${t}">${t}</button>`;
    }).join('');

    // Build meta line - films vs TV
    let metaLine = `${item.year}`;
    if (item.dir) metaLine += `<span class="dot">·</span>${item.dir}`;
    if (item.network) metaLine += `<span class="dot">·</span>${item.network}`;
    if (item.country) metaLine += `<span class="dot">·</span>${item.country}`;
    if (item.runtime) metaLine += `<span class="dot">·</span>${item.runtime}`;
    const seasonsLine = item.seasons ? `<div class="item-meta" style="margin-top:2px">${item.seasons}</div>` : '';

    itemEl.innerHTML = `
      <div class="item-head">
        <div class="order-num">${String(item.order).padStart(2, '0')}</div>
        <div class="item-info">
          <h3 class="item-title">${item.title}</h3>
          <div class="item-meta">${metaLine}</div>
          ${seasonsLine}
          <div class="badge-row">${commitmentBadge}${priorityBadge}${ratingBadge}</div>
        </div>
        <div class="status-pill ${status === 'none' ? '' : status}">${statusIcon(status)}</div>
      </div>
      <div class="item-body">
        ${whyHtml}
        <p class="pitch">${item.pitch || ''}</p>
        ${criticsHtml}
        <div class="actions">
          <button class="action-btn ${status === 'queued' ? 'active-queued' : ''}" data-action="queued">Queue</button>
          <button class="action-btn ${status === 'watching' ? 'active-watching' : ''}" data-action="watching">Watching</button>
          <button class="action-btn ${status === 'watched' ? 'active-watched' : ''}" data-action="watched">Watched</button>
          <button class="action-btn ${status === 'skip' ? 'active-skip' : ''}" data-action="skip">Pass</button>
          <button class="action-btn" data-action="none">Clear</button>
        </div>
        <div class="rating-section">
          <div class="rating-label">Your reaction</div>
          <div class="rating-buttons">
            <button class="rating-btn ${rating === 'loved' ? 'active-loved' : ''}" data-rating="loved">Loved</button>
            <button class="rating-btn ${rating === 'liked' ? 'active-liked' : ''}" data-rating="liked">Liked</button>
            <button class="rating-btn ${rating === 'mixed' ? 'active-mixed' : ''}" data-rating="mixed">Mixed</button>
            <button class="rating-btn ${rating === 'disliked' ? 'active-disliked' : ''}" data-rating="disliked">Disliked</button>
          </div>
          <div class="tag-group-label">What worked</div>
          <div class="tag-cloud">${posTagsHtml}</div>
          <div class="tag-group-label">What didn't</div>
          <div class="tag-cloud">${negTagsHtml}</div>
        </div>
        <textarea class="notes-input" placeholder="Notes after viewing..." data-id="${item.id}">${notes}</textarea>
      </div>
    `;

    itemEl.querySelector('.item-head').addEventListener('click', (e) => {
      if (e.target.classList.contains('status-pill')) return;
      if (expandedIds.has(item.id)) {
        expandedIds.delete(item.id);
        itemEl.classList.remove('expanded');
      } else {
        expandedIds.add(item.id);
        itemEl.classList.add('expanded');
      }
    });

    itemEl.querySelector('.status-pill').addEventListener('click', (e) => {
      e.stopPropagation();
      cycleStatus(item.id);
    });

    itemEl.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setStatus(item.id, btn.dataset.action);
      });
    });

    itemEl.querySelectorAll('.rating-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setRating(item.id, btn.dataset.rating);
      });
    });

    itemEl.querySelectorAll('.tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTag(item.id, btn.dataset.tag);
      });
    });

    itemEl.querySelector('.notes-input').addEventListener('blur', (e) => {
      setNotes(item.id, e.target.value);
    });

    container.appendChild(itemEl);
  });

  updateStats();
}

// === Tab switching ===
function switchTab(tab) {
  activeTab = tab;
  activeFilter = 'all';
  expandedIds.clear();
  saveActiveTab();
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  buildFilters();
  render();
}

// === Modal handlers ===
function setupModals() {
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm(`Reset ${activeTab} progress? This restores seed data for this tab only.`)) return;
    state[activeTab] = JSON.parse(JSON.stringify(SEED_STATE[activeTab] || {}));
    saveState();
    render();
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    const out = JSON.stringify(state, null, 2);
    document.getElementById('export-text').value = out;
    document.getElementById('export-modal').classList.add('active');
  });

  document.getElementById('export-close').addEventListener('click', () => {
    document.getElementById('export-modal').classList.remove('active');
  });

  document.getElementById('export-copy').addEventListener('click', () => {
    const ta = document.getElementById('export-text');
    ta.select();
    ta.setSelectionRange(0, 99999);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(
          () => alert('Copied to clipboard.'),
          () => { document.execCommand('copy'); alert('Copied via fallback.'); }
        );
      } else {
        document.execCommand('copy');
        alert('Copied.');
      }
    } catch (e) {
      alert('Manually select and copy the text above.');
    }
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-text').value = '';
    document.getElementById('import-modal').classList.add('active');
  });

  document.getElementById('import-close').addEventListener('click', () => {
    document.getElementById('import-modal').classList.remove('active');
  });

  document.getElementById('import-confirm').addEventListener('click', () => {
    const input = document.getElementById('import-text').value;
    if (!input.trim()) { alert('Nothing to import.'); return; }
    try {
      const parsed = JSON.parse(input);
      // Detect old format (single tab) vs new (multi-tab)
      if (parsed.films || parsed["tv-limited"] || parsed["tv-ongoing"]) {
        state = parsed;
        if (!state.films) state.films = {};
        if (!state["tv-limited"]) state["tv-limited"] = {};
        if (!state["tv-ongoing"]) state["tv-ongoing"] = {};
      } else {
        // Old format - import into current tab
        state[activeTab] = parsed;
      }
      saveState();
      render();
      document.getElementById('import-modal').classList.remove('active');
      alert('Progress restored.');
    } catch (e) {
      alert('Invalid format.');
    }
  });
}

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// === Init ===
(async () => {
  loadActiveTab();
  loadState();
  await loadCatalogs();
  setupTabs();
  setupModals();
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
  buildFilters();
  render();
})();
