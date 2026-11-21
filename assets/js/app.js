import { MILESTONES, GROUNDWORK, STABILITY, scoreEffort, overall, ladderValue } from './scoring.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Everything rendered comes from data/tracker.json, part of which is written by an
// automated scout reading untrusted repos, so every string is escaped.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const repoUrl = (repo, branch) => (REPO_RE.test(repo || '') ? `https://github.com/${repo}${branch && branch !== 'main' && branch !== 'master' ? `/tree/${encodeURIComponent(branch)}` : ''}` : '#');
const owner = (repo) => (repo || '').split('/')[0];
const avatar = (repo) => (REPO_RE.test(repo || '') ? `https://github.com/${encodeURIComponent(owner(repo))}.png?size=88` : '');
const safeHttp = (u) => (/^https:\/\//.test(u || '') ? u : '#');
const pct = (v) => `${Math.round(v * 10) / 10}`;

function ago(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 0) return 'just now';
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
const daysSince = (iso) => (Date.now() - Date.parse(iso)) / 864e5;
const fmtK = (n) => (n == null ? '-' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);

const ICON = {
  star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 .8l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.2 3.5 14.6l.9-5L.8 6.1l5-.7z"/></svg>',
  fork: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5 3.3a1.8 1.8 0 1 0-2.3 1.7v.8A2.5 2.5 0 0 0 5.2 8.3h1.9v2.7a1.8 1.8 0 1 0 1.8 0V8.3h1.9a2.5 2.5 0 0 0 2.5-2.5V5a1.8 1.8 0 1 0-1.5 0v.8a1 1 0 0 1-1 1H5.2a1 1 0 0 1-1-1V5A1.8 1.8 0 0 0 5 3.3Z"/></svg>',
  issue: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/></svg>',
  commit: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 5a3 3 0 0 1 2.9 2.2H15v1.6h-4.1a3 3 0 0 1-5.8 0H1V7.2h4.1A3 3 0 0 1 8 5Zm0 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>',
  clock: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.5V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  gh: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.5 15.6c.4 0 .5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.3 1.9.9 2.4.7 0-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-4 0-.9.3-1.6.8-2.1-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8a7.5 7.5 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.1 0 3.1-1.9 3.8-3.6 4 .3.3.6.8.6 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 0Z"/></svg>',
};

const state = { data: null, filter: 'all', sort: 'score' };

async function main() {
  const res = await fetch(`data/tracker.json?ts=${Math.floor(Date.now() / 6e4)}`, { cache: 'no-cache' });
  const data = await res.json();
  state.data = data;
  for (const e of data.efforts) Object.assign(e, { _s: scoreEffort(e) });

  renderMeta(data);
  renderHeroArt(data.site || {});
  startCountdown(data.exe || {});
  renderOverall(data);
  renderChanges(data.changes || []);
  renderRace();
  renderNews(data.news || []);
  renderWatchlist(data);
  renderTools(data.tools || []);
  renderInbox(data);
  renderFlags(data.flagged || []);
  renderMethod();
  bindControls();
  observeBars();
}

/* ---------- Meta & hero ---------- */
function renderMeta(data) {
  $('#nav-updated').textContent = `Updated ${ago(data.updated)}`;
  $('#nav-updated').title = new Date(data.updated).toLocaleString();
  const sc = data.scout || {};
  $('#scout-status').textContent = sc.lastRun
    ? `Last scout run ${ago(sc.lastRun)}${sc.lastSummary ? `: ${sc.lastSummary}` : ''}`
    : 'The scout runs every 3 hours.';
  window.addEventListener('scroll', () => $('#nav').classList.toggle('is-scrolled', window.scrollY > 8), { passive: true });
}

function renderHeroArt(site) {
  if (!site.heroImage) return;
  const img = new Image();
  img.onload = () => {
    $('#hero-photo').style.backgroundImage = `url("${encodeURI(site.heroImage)}")`;
    $('#top').classList.add('has-photo');
    if (site.heroCredit) $('#art-credit').textContent = site.heroCredit;
  };
  img.src = site.heroImage;
}

/* ---------- Countdown ---------- */
function startCountdown(exe) {
  const box = $('#countdown');
  const by = exe.by ? `${exe.by}'s executable drop` : 'Executable drop';
  const released = exe.status === 'released' && exe.releasedAt;
  const target = Date.parse(released ? exe.releasedAt : exe.expectedAt || `${exe.expected}T00:00:00Z`);
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

  $('#cd-title').textContent = released ? 'Executable released' : by;
  const src = exe.source ? ` · <a href="${esc(safeHttp(exe.source))}" target="_blank" rel="noopener">source</a>` : '';
  if (!Number.isFinite(target)) {
    $('#cd-status').textContent = 'No release date announced.';
    return;
  }
  if (released) {
    box.classList.add('is-released');
    $('#cd-foot').innerHTML = `Out since ${esc(dayFmt.format(target))}, ${esc(timeFmt.format(target))}${src}`;
  } else {
    const when = exe.timeAnnounced ? `${dayFmt.format(target)}, ${timeFmt.format(target)}` : `${dayFmt.format(target)} · exact time not announced, counting to 00:00 UTC`;
    $('#cd-foot').innerHTML = `Expected ${esc(when)}${src}`;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    let diff = released ? Date.now() - target : target - Date.now();
    const due = !released && diff <= 0;
    if (due) diff = 0;
    const d = Math.floor(diff / 864e5);
    const h = Math.floor((diff % 864e5) / 36e5);
    const m = Math.floor((diff % 36e5) / 6e4);
    const s = Math.floor((diff % 6e4) / 1e3);
    $('#cd-d').textContent = pad(d);
    $('#cd-h').textContent = pad(h);
    $('#cd-m').textContent = pad(m);
    $('#cd-s').textContent = pad(s);
    box.classList.toggle('is-due', due);
    let status;
    if (released) status = 'Time since release. Projects can now try to boot the real thing.';
    else if (!due) status = 'Left until the missing executable is due. Until then, nobody can boot GTA VI.';
    else {
      const late = (Date.now() - target) / 36e5;
      status = late < 24 ? 'Due now. Waiting for it to appear (and be readable).' : `Overdue by ${Math.floor(late / 24)}d ${Math.floor(late % 24)}h. Still not released.`;
    }
    $('#cd-status').textContent = status;
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- Overall ---------- */
function renderOverall(data) {
  const all = data.efforts;
  const ov = overall(all);
  const leader = ov.leader?.effort;
  animateNumber($('#ov-score'), ov.score);
  $('#ov-leader').innerHTML = leader
    ? `Leader: <a href="#effort-${esc(leader.id)}">${esc(leader.name)}</a> by ${esc(owner(leader.repo))}. ${esc(ov.leader.reachedLabel === 'Groundwork' ? 'Still groundwork. Nothing has run GTA VI yet.' : `Has reached “${ov.leader.reachedLabel}”.`)}`
    : 'No efforts tracked yet.';
  $('#ov-stage').textContent = ov.furthest.label;
  $('#ov-top3').textContent = `${pct(ov.top3)}%`;
  const booted = all.filter((e) => ladderValue(e.gta?.boots) >= 1).length;
  $('#ov-boot').textContent = `${booted} / ${all.length}`;
  $('#ov-count').textContent = `${all.length}`;

  const answer = { groundwork: 'Not yet.', loads: 'Not yet.', boots: 'Not yet.', menu: 'Not yet.', ingame: 'Sort of.', fps30: 'Mostly.', stable: 'Yes.' };
  $('#answer').textContent = answer[ov.furthest.key];

  // Ticks + labels
  const furthestIdx = MILESTONES.findIndex((m) => m.key === ov.furthest.key);
  $('#mega-ticks').innerHTML = MILESTONES.slice(1, -1).map((m) => `<i style="left:${m.at}%"></i>`).join('');
  $('#mega-labels').innerHTML = MILESTONES.map((m, i) => {
    const cls = i <= furthestIdx ? 'is-reached' : i === furthestIdx + 1 ? 'is-next' : '';
    return `<div class="mega-label ${cls}" style="left:${m.at}%" data-tip="${esc(m.desc)}" data-tip-title="${esc(m.label)}"><b>${m.at}%</b><span class="dot"></span>${esc(m.label)}</div>`;
  }).join('');
  $('#mega-fill').dataset.width = ov.score;

  const top = ov.ranked.slice(0, 6);
  const draw = () => drawMarkers(top, leader);
  draw();
  let raf;
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });

  renderHistory(data.history || []);
}

// Avatars sit in one row above the bar, spread apart so they never overlap,
// with a curved leader line down to each effort's true position.
function drawMarkers(ranked, leader) {
  const box = $('#mega-markers');
  const W = box.clientWidth;
  const H = box.clientHeight;
  if (!W) return;
  const GAP = 42;
  const items = ranked.map((r) => ({ r, x: (r.score / 100) * W })).sort((a, b) => a.x - b.x);
  items.forEach((it, i) => { it.a = i ? Math.max(it.x, items[i - 1].a + GAP) : it.x; });
  const shift = items.reduce((s, it) => s + (it.x - it.a), 0) / Math.max(1, items.length);
  items.forEach((it, i) => {
    it.a += shift;
    it.a = Math.max(18, i ? Math.max(it.a, items[i - 1].a + GAP) : it.a);
  });
  const overflow = items.length ? items[items.length - 1].a - (W - 18) : 0;
  if (overflow > 0) items.forEach((it) => { it.a -= overflow; });

  const avatarY = H - 66;
  const lines = items.map((it) => {
    const y0 = avatarY + 32;
    return `<path d="M${it.a} ${y0} C ${it.a} ${y0 + 18}, ${it.x} ${H - 18}, ${it.x} ${H}" fill="none" stroke="${it.r.effort === leader ? '#ff2e7e' : '#c9ccd6'}" stroke-width="1.6"/>
            <circle cx="${it.x}" cy="${H - 1}" r="3" fill="${it.r.effort === leader ? '#ff2e7e' : '#9a9eac'}"/>`;
  }).join('');
  box.innerHTML = `<svg width="${W}" height="${H}" style="position:absolute;inset:0;overflow:visible" aria-hidden="true">${lines}</svg>` +
    items.map((it) => {
      const e = it.r.effort;
      const src = avatar(e.repo);
      return `<a class="marker ${e === leader ? 'is-leader' : ''}" href="#effort-${esc(e.id)}" style="left:${it.a}px;bottom:${H - avatarY - 32}px"
                data-tip-title="${esc(e.name)} · ${pct(it.r.score)}%" data-tip="${esc(it.r.reachedLabel)} · ${esc(e.approach || '')}">
                <span class="mk-name">${esc(e.name)} · ${pct(it.r.score)}%</span>
                ${src ? `<img src="${esc(src)}" alt="" loading="lazy" data-fallback="${esc(e.name.slice(0, 2))}">` : `<span class="mk-fallback">${esc(e.name.slice(0, 2))}</span>`}
              </a>`;
    }).join('');
}

function renderHistory(history) {
  const box = $('#ov-history');
  const pts = history.filter((h) => Number.isFinite(h.leader));
  if (pts.length < 2) return;
  box.hidden = false;
  const W = 1000, H = 70, max = Math.max(30, ...pts.map((p) => p.leader)) * 1.1;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (v) => H - (v / max) * (H - 6) - 3;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.leader).toFixed(1)}`).join(' ');
  box.innerHTML = `<p>Leader's score, day by day</p>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Leader score history">
      <defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stop-color="#7a5cff"/><stop offset=".55" stop-color="#ff2e7e"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>
      <linearGradient id="hf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff2e7e" stop-opacity=".18"/><stop offset="1" stop-color="#ff2e7e" stop-opacity="0"/></linearGradient></defs>
      <path d="${d} L${W} ${H} L0 ${H} Z" fill="url(#hf)"/>
      <path d="${d}" fill="none" stroke="url(#hg)" stroke-width="3" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

/* ---------- Changes ---------- */
function renderChanges(changes) {
  const list = $('#changes-list');
  const items = [...changes].reverse().slice(0, 12);
  if (!items.length) { $('#changes').hidden = true; return; }
  const cls = { up: 'ck-up', down: 'ck-down', flag: 'ck-flag', new: 'ck-new', removed: 'ck-down', claim: 'ck-flag' };
  list.innerHTML = items.map((c) => `<li><span class="ck ${cls[c.kind] || ''}"></span><time>${esc(new Date(`${c.date}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}</time><span>${esc(c.text)}</span></li>`).join('');
}

/* ---------- Race ---------- */
function isGtaSpecific(e) { return /gta/i.test(e.target || ''); }

function renderRace() {
  const { data, filter, sort } = state;
  let list = data.efforts.filter((e) => e.tier === 'tracked');
  if (filter === 'gta') list = list.filter(isGtaSpecific);
  if (filter === 'generic') list = list.filter((e) => !isGtaSpecific(e));
  const byScore = (a, b) => b._s.score - a._s.score;
  const sorters = {
    score: byScore,
    stars: (a, b) => (b.stats?.stars || 0) - (a.stats?.stars || 0),
    active: (a, b) => Date.parse(b.stats?.pushedAt || 0) - Date.parse(a.stats?.pushedAt || 0),
  };
  const ranked = [...data.efforts.filter((e) => e.tier === 'tracked')].sort(byScore);
  list.sort(sorters[sort] || byScore);
  $('#race-list').innerHTML = list.map((e, i) => effortCard(e, ranked.indexOf(e) + 1, sort === 'score' ? i < 3 : false)).join('') ||
    '<li class="empty">No efforts match this filter yet.</li>';
  observeBars();
}

function ladderCells(e) {
  const g = e.gta || {};
  const gw = e._s.groundwork;
  const st = (v) => (v >= 1 ? 'is-reached' : v > 0 ? 'is-partial' : '');
  const fpsV = Math.min(1, (+g.fps || 0) / 30);
  const stabV = (STABILITY[g.stability] || STABILITY.unknown).value;
  const fpsLabel = g.fps ? `${Math.round(g.fps)} FPS` : '30 FPS';
  const stabLabel = g.stability && g.stability !== 'unknown' ? STABILITY[g.stability].label : 'Stable';
  return `
    <span class="${st(gw)}" title="${esc(MILESTONES[0].desc)}">Groundwork ${Math.round(gw * 100)}%</span>
    <span class="${st(ladderValue(g.loads))}">Exe runs</span>
    <span class="${st(ladderValue(g.boots))}">First frame</span>
    <span class="${st(ladderValue(g.menu))}">Main menu</span>
    <span class="${st(ladderValue(g.ingame))}">In-game</span>
    <div><span class="${st(fpsV)}">${esc(fpsLabel)}</span><span class="${st(stabV)}">${esc(stabLabel)}</span></div>`;
}

function effortCard(e, rank, open) {
  const s = e._s;
  const st = e.stats || {};
  const ticks = MILESTONES.slice(1, -1).map((m) => `<i style="left:${m.at}%"></i>`).join('');
  const stale = st.pushedAt && daysSince(st.pushedAt) > 3;
  const tags = [
    e.approach && `<span class="tag">${esc(e.approach)}</span>`,
    e.target && `<span class="tag ${isGtaSpecific(e) ? 'tag-gta' : ''}">${esc(e.target)}</span>`,
    e.verification === 'reproduced' ? '<span class="tag tag-ok">Independently reproduced</span>' : '<span class="tag tag-self" title="Based on the project\'s own README; not yet reproduced by others">Self-reported</span>',
    e.provenOn && ladderValue(e.groundwork?.proven) > 0 && `<span class="tag tag-proven" title="Runs another game">Runs: ${esc(e.provenOn)}</span>`,
    stale && `<span class="tag tag-stale">Quiet for ${Math.floor(daysSince(st.pushedAt))}d</span>`,
    st.missing && '<span class="tag tag-stale">Repo gone (404)</span>',
  ].filter(Boolean).join('');
  const gwRows = GROUNDWORK.map((g) => {
    const v = Math.max(0, Math.min(1, +(e.groundwork?.[g.key]) || 0));
    return `<div class="gw-row" title="${esc(g.desc)}"><span>${esc(g.label)}</span><b>${Math.round(v * 100)}%</b><div class="gw-bar"><i data-width="${v * 100}"></i></div></div>`;
  }).join('');
  const claims = (e.claims || []).slice(0, 2).map((c) => `<div class="claim"><b>Unverified claim in README:</b> “${esc(c.text)}”, which may mean <em>${esc((MILESTONES.find((m) => m.key === c.milestone) || {}).label || c.milestone)}</em>. Awaiting review.</div>`).join('');
  const src = avatar(e.repo);
  return `
  <li class="effort ${rank <= 3 ? 'is-top' : ''}" id="effort-${esc(e.id)}">
    <div class="e-rank">${rank}</div>
    <div class="e-main">
      <div class="e-top">
        ${src ? `<img class="e-avatar" src="${esc(src)}" alt="" loading="lazy" data-hide-on-error>` : ''}
        <div class="e-title">
          <h3><a href="${esc(repoUrl(e.repo, e.branch))}" target="_blank" rel="noopener">${esc(e.name)}</a></h3>
          <p class="e-by">${esc(e.repo)}${e.branch && !['main', 'master'].includes(e.branch) ? ` · branch ${esc(e.branch)}` : ''}</p>
        </div>
        <div class="e-score"><b>${pct(s.score)}<span>%</span></b><small>${esc(s.reachedLabel)}</small></div>
      </div>
      <div class="tags">${tags}</div>
      <p class="e-summary">${esc(e.summary)}</p>
      <div class="bar" aria-label="${esc(e.name)} progress ${pct(s.score)} percent">
        <div class="bar-track"><div class="bar-fill" data-width="${s.score}"></div><div class="bar-ticks">${ticks}</div></div>
        <div class="ladder">${ladderCells(e)}</div>
      </div>
      ${claims}
      <div class="e-details" ${open ? '' : 'hidden'}>
        <div class="gw">
          <h4>Groundwork breakdown</h4>
          ${gwRows}
          ${e.provenOn ? `<p class="gw-proven">Proven on: ${esc(e.provenOn)}</p>` : ''}
        </div>
        <div class="notes">
          <div class="works"><h4>What works</h4><ul>${(e.highlights || []).map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
          <div class="blocks"><h4>What's blocking</h4><ul>${(e.blockers || []).map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
        </div>
      </div>
      <div class="e-foot">
        <span class="stat-i" title="Stars">${ICON.star}${fmtK(st.stars)}</span>
        <span class="stat-i" title="Forks">${ICON.fork}${fmtK(st.forks)}</span>
        <span class="stat-i" title="Open issues">${ICON.issue}${fmtK(st.openIssues)}</span>
        ${st.commits7d != null ? `<span class="stat-i" title="Commits in the last 7 days">${ICON.commit}${st.commits7d >= 100 ? '100+' : st.commits7d} commits / 7d</span>` : ''}
        <span class="stat-i" title="Last push">${ICON.clock}pushed ${esc(ago(st.pushedAt))}</span>
        <span class="spacer"></span>
        <span class="w-muted" title="When this score was last reviewed">${e.assessedBy === 'claude' ? 'Assessed by Claude' : 'Reviewed'} ${esc(e.assessedAt || '')}</span>
        <button class="toggle" data-toggle aria-expanded="${open}">${open ? 'Hide details' : 'Details'}</button>
        <a class="gh-link" href="${esc(repoUrl(e.repo, e.branch))}" target="_blank" rel="noopener">${ICON.gh}GitHub</a>
      </div>
    </div>
  </li>`;
}

/* ---------- Watchlist ---------- */
function renderWatchlist(data) {
  const rows = data.efforts.filter((e) => e.tier === 'watchlist').sort((a, b) => b._s.score - a._s.score);
  if (!rows.length) { $('#watchlist').hidden = true; return; }
  $('#watch-list').innerHTML = `
    <div class="w-row w-head" role="row"><span>Project</span><span>Approach</span><span>Progress</span><span>Stars</span><span>Last push</span></div>` +
    rows.map((e) => `
    <div class="w-row" role="row" id="effort-${esc(e.id)}">
      <div class="w-name"><a href="${esc(repoUrl(e.repo, e.branch))}" target="_blank" rel="noopener">${esc(e.name)}</a><p>${esc(e.summary)}</p></div>
      <span class="w-muted">${esc(e.approach)}${e.target && /gta|ps5/i.test(e.target) ? ` · ${esc(e.target)}` : ''}</span>
      <div class="w-bar"><div class="bar-track"><div class="bar-fill" data-width="${e._s.score}"></div></div><b>${pct(e._s.score)}%</b></div>
      <span class="w-muted">★ ${fmtK(e.stats?.stars)}</span>
      <span class="w-muted">${esc(ago(e.stats?.pushedAt))}</span>
    </div>`).join('');
}

/* ---------- Toolkit ---------- */
function renderTools(tools) {
  $('#tools-list').innerHTML = tools.map((t) => `
    <a class="tool" href="${esc(repoUrl(t.repo))}" target="_blank" rel="noopener">
      <span class="t-kind">${esc(t.kind)}</span>
      <h3>${esc(t.name)}</h3>
      <p>${esc(t.desc)}</p>
      <span class="t-meta">★ ${fmtK(t.stats?.stars)} · pushed ${esc(ago(t.stats?.pushedAt))}</span>
    </a>`).join('');
}

/* ---------- Inbox ---------- */
function renderInbox(data) {
  const c = (data.candidates || []).filter((x) => x.status !== 'rejected');
  if (!c.length) {
    $('#inbox-list').innerHTML = `<div class="empty">Nothing waiting for review. ${data.scout?.lastRun ? `The scout last ran ${esc(ago(data.scout.lastRun))}.` : 'The scout runs every 3 hours.'}</div>`;
    return;
  }
  // Deliberately plain text: unreviewed repos can be copies or lures, so we don't link them.
  $('#inbox-list').innerHTML = c.slice(0, 12).map((x) => `
    <div class="cand">
      <div>
        <b>${esc(x.repo)}</b> <span class="tag tag-self">Unreviewed · not linked</span>
        <p>${esc(x.description || 'No description')}</p>
        <p>Found via ${esc((x.sources || [x.source]).filter(Boolean).join(', '))} · ${esc(ago(x.foundAt))} · ★ ${fmtK(x.stars)}${x.signals?.length ? ` · ${esc(x.signals.slice(0, 4).join(', '))}` : ''}</p>
      </div>
      <div class="c-score"><b>${Math.round(x.substance || 0)}</b>substance</div>
    </div>`).join('');
}

/* ---------- News ---------- */
const COVER_ICON = {
  Leak: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2h8l5 5v8.5l-2-2V8h-4V4H6v16h7.5l2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm12.5 13.5L21 18l-3 4-3-4 2.5-2.5Z"/></svg>',
  Takedown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 2a8 8 0 0 0-6.3 12.9L16.9 5.7A8 8 0 0 0 12 4Zm6.3 3.1L7.1 18.3A8 8 0 0 0 18.3 7.1Z"/></svg>',
  Security: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1 6h2v6h-2V8Zm0 8h2v2h-2v-2Z"/></svg>',
  Legal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 3h2v2h6v2h-1.2l2.7 6.3A3.5 3.5 0 0 1 17 16a3.5 3.5 0 0 1-3.5-2.7L16.2 7H13v12h4v2H7v-2h4V7H7.8l2.7 6.3A3.5 3.5 0 0 1 7 16a3.5 3.5 0 0 1-3.5-2.7L6.2 7H5V5h6V3Zm-4 6.2L5.6 12.5h2.8L7 9.2Zm10 0-1.4 3.3h2.8L17 9.2Z"/></svg>',
  Safety: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1.2 13.6L7 11.8l1.4-1.4 2.4 2.4 4.8-4.8L17 9.4l-6.2 6.2Z"/></svg>',
};
const coverHtml = (cat) => `<div class="cover cover-${esc(cat)}">${COVER_ICON[cat] || COVER_ICON.Leak}</div>`;
const safeLink = (u) => (/^#[\w-]+$/.test(u || '') ? u : safeHttp(u));
const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function storyMedia(n) {
  const img = n.image && /^https:\/\//.test(n.image.url || '')
    ? `<img src="${esc(n.image.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-cover="${esc(n.category)}">`
    : coverHtml(n.category);
  return `<div class="story-media">${img}<span class="story-cat">${esc(n.category)}</span></div>`;
}

function renderNews(news) {
  const items = [...news].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!items.length) { $('#news').hidden = true; return; }
  const card = (n, small) => `
    <button class="story ${small ? 'is-small' : ''}" data-story="${esc(n.id)}">
      ${storyMedia(n)}
      <div class="story-body">
        <time>${esc(fmtDay(n.date))}</time>
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.dek)}</p>
        ${!small && n.image?.credit ? `<span class="story-credit">Image: ${esc(n.image.credit)}</span>` : ''}
      </div>
    </button>`;
  $('#news-list').innerHTML = card(items[0], false) + `<div class="news-list">${items.slice(1, 7).map((n) => card(n, true)).join('')}</div>`;

  const dlg = $('#reader');
  $('#news-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-story]');
    if (!btn) return;
    const n = items.find((x) => x.id === btn.dataset.story);
    if (!n) return;
    $('#reader-body').innerHTML = `
      ${storyMedia(n)}
      <div class="reader-inner">
        <p class="meta">${esc(n.category)} · ${esc(fmtDay(n.date))}</p>
        <h2 id="reader-title">${esc(n.title)}</h2>
        <p class="dek">${esc(n.dek)}</p>
        <div class="article">${(n.body || []).map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        <div class="sources">
          <h4>Sources</h4>
          <ul>${(n.sources || []).map((s) => `<li><a href="${esc(safeLink(s.url))}" ${s.url?.startsWith('#') ? '' : 'target="_blank" rel="noopener"'}>${esc(s.outlet)}: ${esc(s.title)}</a></li>`).join('')}</ul>
          <p class="fine">${n.image?.credit ? `Image: <a href="${esc(safeHttp(n.image.link || n.image.url))}" target="_blank" rel="noopener">${esc(n.image.credit)}</a>. ` : ''}${n.by === 'claude' ? 'Written automatically by Claude from the linked sources.' : 'Written by PortWatch from the linked sources.'}</p>
        </div>
      </div>`;
    dlg.showModal();
    dlg.scrollTop = 0;
  });
  $('#reader-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
  $('#reader-body').addEventListener('click', (ev) => { if (ev.target.closest('a[href^="#"]')) dlg.close(); });
}

/* ---------- Safety ---------- */
function renderFlags(flags) {
  $('#flag-list').innerHTML = flags.map((f) => `
    <li><b>${esc(f.pattern)}<span>${esc(f.members?.length ? `${f.members.length} seen` : f.label || '')}</span></b><p>${esc(f.reason)}</p></li>`).join('');
}

/* ---------- Method ---------- */
function renderMethod() {
  $('#ladder-explain').innerHTML = MILESTONES.map((m, i) => `
    <li><span class="le-at">${i === 0 ? '0–25' : m.at}</span><div><h4>${esc(m.label)}</h4><p>${esc(m.desc)}</p></div></li>`).join('');
  $('#gw-explain').innerHTML = GROUNDWORK.map((g) => `<li><b>${esc(g.label)}<span>${Math.round(g.weight * 25 * 10) / 10} pts</span></b>${esc(g.desc)}</li>`).join('');
}

/* ---------- Interaction ---------- */
function bindControls() {
  $$('.chip[data-filter]').forEach((b) => b.addEventListener('click', () => {
    $$('.chip[data-filter]').forEach((x) => x.classList.toggle('is-on', x === b));
    state.filter = b.dataset.filter;
    renderRace();
  }));
  $('#sort').addEventListener('change', (ev) => { state.sort = ev.target.value; renderRace(); });
  $('#race-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-toggle]');
    if (!btn) return;
    const det = btn.closest('.effort').querySelector('.e-details');
    det.hidden = !det.hidden;
    btn.setAttribute('aria-expanded', String(!det.hidden));
    btn.textContent = det.hidden ? 'Details' : 'Hide details';
    observeBars();
  });

  // Avatar fallbacks without inline handlers.
  document.addEventListener('error', (ev) => {
    const img = ev.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.cover != null) {
      img.insertAdjacentHTML('afterend', coverHtml(img.dataset.cover));
      img.remove();
    } else if (img.dataset.fallback != null) {
      const span = document.createElement('span');
      span.className = 'mk-fallback';
      span.textContent = img.dataset.fallback;
      img.replaceWith(span);
    } else if (img.hasAttribute('data-hide-on-error')) {
      img.style.visibility = 'hidden';
    }
  }, true);

  const tip = $('#tooltip');
  document.addEventListener('pointerover', (ev) => {
    const t = ev.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.innerHTML = `${t.dataset.tipTitle ? `<b>${esc(t.dataset.tipTitle)}</b>` : ''}${esc(t.dataset.tip)}`;
    tip.hidden = false;
  });
  document.addEventListener('pointermove', (ev) => {
    if (tip.hidden) return;
    const x = Math.min(ev.clientX + 14, window.innerWidth - tip.offsetWidth - 10);
    tip.style.left = `${x}px`;
    tip.style.top = `${ev.clientY + 16}px`;
  });
}

let io;
function observeBars() {
  // Watch each bar's track, not the fill: a fill clipped to 0% counts as invisible.
  io ??= new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      for (const el of en.target.querySelectorAll('[data-width]')) reveal(el);
      io.unobserve(en.target);
    }
  }, { threshold: 0.2 });
  $$('[data-width]:not([data-seen])').forEach((el) => { el.dataset.seen = '1'; io.observe(el.parentElement); });
}
function reveal(el) {
  el.style.setProperty('--p', `${Math.max(0, Math.min(100, +el.dataset.width || 0))}%`);
}

function animateNumber(node, to) {
  const start = performance.now();
  const dur = 1600;
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - (1 - p) ** 3;
    node.textContent = (to * eased).toFixed(to % 1 ? 1 : 0);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', `<p style="padding:12px 20px;background:#fff3f3;color:#b4262b;margin:0">Couldn't load tracker data: ${esc(err.message)}</p>`);
});
