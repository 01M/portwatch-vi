// Anonymous discussion board. Routes: #/ (all boards), #/b/<board>, #/t/<thread-id>.
import { backendReady, getClient, trackView } from './backend.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOARD = /^[a-z0-9-]{1,40}$/;
// Mirrors the database's link check, so we can tell people up front that a post will wait for review.
const LINKISH = /(https?:\/\/|www\.|magnet:|discord\.gg|t\.me\/|[a-z0-9-]+\.(com|net|org|io|gg|me|ru|xyz|app|dev|ly|co|to|cc|link|zip|exe)(\W|$))/i;

function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s) || s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

let boards = [];
let stats = new Map();

async function loadBoards() {
  const fixed = [
    { id: 'general', name: 'General', desc: 'Anything about GTA VI on PC' },
    { id: 'news', name: 'News & leaks', desc: 'Takedowns, the executable, confirmed news' },
  ];
  try {
    const data = await (await fetch(`data/tracker.json?ts=${Math.floor(Date.now() / 6e4)}`)).json();
    const efforts = (data.efforts || [])
      .filter((e) => (e.tier === 'tracked' || e.tier === 'watchlist') && BOARD.test(e.id))
      .map((e) => ({ id: e.id, name: e.name, desc: e.approach || '', effort: true, tier: e.tier }));
    boards = [...fixed, ...efforts.filter((e) => e.tier === 'tracked'), ...efforts.filter((e) => e.tier === 'watchlist')];
  } catch { boards = fixed; }
}

function renderNav(active) {
  const item = (b) => {
    const s = stats.get(b.id);
    return `<a href="#/b/${esc(b.id)}" class="${b.id === active ? 'is-on' : ''}"><span>${esc(b.name)}</span>${s ? `<small>${s.threads}</small>` : ''}</a>`;
  };
  $('#board-nav').innerHTML = `
    <a href="#/" class="${!active ? 'is-on' : ''}"><span>All boards</span></a>
    <p class="board-nav-label">Discussion</p>${boards.filter((b) => !b.effort).map(item).join('')}
    <p class="board-nav-label">Projects</p>${boards.filter((b) => b.effort).map(item).join('')}`;
}

const boardName = (id) => boards.find((b) => b.id === id)?.name || id;

async function refreshStats(client) {
  const { data } = await client.rpc('board_stats');
  stats = new Map((data || []).map((r) => [r.board, r]));
}

/* ---------- Views ---------- */
async function viewIndex(client) {
  await refreshStats(client);
  renderNav(null);
  const { data: latest } = await client.from('threads')
    .select('id,board,title,author,reply_count,last_activity').eq('status', 'visible')
    .order('last_activity', { ascending: false }).limit(12);
  $('#board-main').innerHTML = `
    <h2 class="board-title">All boards</h2>
    <div class="board-grid">${boards.map((b) => {
      const s = stats.get(b.id);
      return `<a class="board-card" href="#/b/${esc(b.id)}"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span><small>${s ? `${s.threads} thread${s.threads === 1 ? '' : 's'} · active ${esc(ago(s.last_activity))}` : 'No threads yet'}</small></a>`;
    }).join('')}</div>
    <h3 class="mini-title board-sub">Latest activity</h3>
    ${threadList(latest || [], true)}`;
}

function threadList(rows, showBoard) {
  if (!rows.length) return '<p class="empty">No threads yet. Start the first one.</p>';
  return `<ol class="threads">${rows.map((t) => `
    <li><a href="#/t/${esc(t.id)}">
      <span class="t-title">${esc(t.title)}</span>
      <span class="t-meta">${showBoard ? `<em>${esc(boardName(t.board))}</em> · ` : ''}${esc(t.author)} · ${t.reply_count} repl${t.reply_count === 1 ? 'y' : 'ies'} · ${esc(ago(t.last_activity))}</span>
    </a></li>`).join('')}</ol>`;
}

async function viewBoard(client, board) {
  if (!BOARD.test(board)) return viewIndex(client);
  await refreshStats(client);
  renderNav(board);
  const { data, error } = await client.from('threads')
    .select('id,board,title,author,reply_count,last_activity').eq('board', board).eq('status', 'visible')
    .order('last_activity', { ascending: false }).limit(60);
  $('#board-main').innerHTML = `
    <div class="board-title-row"><h2 class="board-title">${esc(boardName(board))}</h2>
      ${boards.find((b) => b.id === board && b.effort) ? `<a class="toggle" href="./#effort-${esc(board)}">See it in the race</a>` : ''}</div>
    ${composer('thread')}
    ${error ? `<p class="empty">Couldn't load threads: ${esc(error.message)}</p>` : threadList(data || [], false)}`;
  bindComposer(client, 'thread', { board });
}

async function viewThread(client, id) {
  if (!UUID.test(id)) return viewIndex(client);
  const { data: t } = await client.from('threads').select('id,board,title,body,author,created_at,reply_count').eq('id', id).maybeSingle();
  if (!t) { $('#board-main').innerHTML = '<p class="empty">This thread doesn\'t exist or was removed. <a href="#/">Back to the boards</a></p>'; return; }
  renderNav(t.board);
  const { data: posts } = await client.from('posts').select('id,body,author,created_at').eq('thread_id', id).eq('status', 'visible').order('created_at').limit(500);
  $('#board-main').innerHTML = `
    <p class="crumbs"><a href="#/b/${esc(t.board)}">← ${esc(boardName(t.board))}</a></p>
    <article class="post post-op">
      <h2>${esc(t.title)}</h2>
      <p class="p-meta"><b>${esc(t.author)}</b> · ${esc(ago(t.created_at))}</p>
      <div class="p-body">${esc(t.body)}</div>
    </article>
    ${(posts || []).map((p, i) => `
      <article class="post" id="p-${esc(p.id)}">
        <p class="p-meta"><b>${esc(p.author)}</b> · ${esc(ago(p.created_at))} <span class="p-no">#${i + 1}</span></p>
        <div class="p-body">${esc(p.body)}</div>
      </article>`).join('')}
    ${composer('reply')}`;
  bindComposer(client, 'reply', { thread: id });
}

/* ---------- Posting ---------- */
function composer(kind) {
  const isThread = kind === 'thread';
  return `
  <details class="composer" ${isThread ? '' : 'open'}>
    <summary>${isThread ? 'Start a new thread' : 'Reply'}</summary>
    <form id="composer" novalidate>
      <div class="c-row">
        <input name="author" maxlength="32" placeholder="Name (optional, shows as Anonymous)" autocomplete="off">
      </div>
      ${isThread ? '<input name="title" required minlength="3" maxlength="120" placeholder="Thread title">' : ''}
      <textarea name="body" required maxlength="4000" rows="${isThread ? 6 : 4}" placeholder="${isThread ? 'What do you want to talk about?' : 'Write a reply'}"></textarea>
      <div class="c-foot">
        <span class="c-note" id="c-note">Plain text. Posts with links wait for review.</span>
        <span class="c-count" id="c-count">0 / 4000</span>
        <button class="gh-link" type="submit">${isThread ? 'Post thread' : 'Post reply'}</button>
      </div>
    </form>
  </details>`;
}

function bindComposer(client, kind, target) {
  const form = $('#composer');
  if (!form) return;
  const body = form.elements.body;
  const note = $('#c-note');
  const update = () => {
    $('#c-count').textContent = `${body.value.length} / 4000`;
    const text = `${form.elements.title?.value || ''} ${body.value}`;
    note.textContent = LINKISH.test(text) ? 'This contains a link, so it will wait for review before it appears.' : 'Plain text. Posts with links wait for review.';
    note.classList.toggle('is-warn', LINKISH.test(text));
  };
  form.addEventListener('input', update);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button');
    const author = form.elements.author.value.trim();
    const title = form.elements.title?.value.trim();
    const text = body.value.trim();
    if (kind === 'thread' && (!title || title.length < 3)) { note.textContent = 'Give the thread a title (3+ characters).'; note.classList.add('is-warn'); return; }
    if (!text) { note.textContent = 'Write something first.'; note.classList.add('is-warn'); return; }
    btn.disabled = true;
    btn.textContent = 'Posting…';
    const { data, error } = kind === 'thread'
      ? await client.rpc('create_thread', { p_board: target.board, p_title: title, p_body: text, p_author: author })
      : await client.rpc('create_post', { p_thread: target.thread, p_body: text, p_author: author });
    btn.disabled = false;
    btn.textContent = kind === 'thread' ? 'Post thread' : 'Post reply';
    if (error) { note.textContent = error.message || 'Something went wrong. Try again.'; note.classList.add('is-warn'); return; }
    if (data?.status === 'pending') {
      form.reset(); update();
      note.textContent = 'Thanks. Your post contains a link, so it will appear once it has been reviewed.';
      note.classList.add('is-warn');
      return;
    }
    if (kind === 'thread' && data?.id) location.hash = `#/t/${data.id}`;
    else route();
  });
}

/* ---------- Router ---------- */
async function route() {
  const client = await getClient();
  const [, kind, arg] = (location.hash.match(/^#\/(b|t)\/([\w-]+)/) || []);
  window.scrollTo(0, 0);
  try {
    if (kind === 'b') await viewBoard(client, arg);
    else if (kind === 't') await viewThread(client, arg);
    else await viewIndex(client);
  } catch (err) {
    $('#board-main').innerHTML = `<p class="empty">Couldn't reach the board right now. ${esc(err.message || '')}</p>`;
  }
  trackView(`/board${kind ? `/${kind}` : ''}${kind === 'b' ? `/${arg}` : ''}`);
}

async function main() {
  await loadBoards();
  if (!backendReady()) {
    renderNav(null);
    $('#board-main').innerHTML = '<p class="empty">The board is launching soon.</p>';
    return;
  }
  window.addEventListener('hashchange', route);
  route();
}
main();
