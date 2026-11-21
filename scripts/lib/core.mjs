// Source adapters and heuristics for the scout.
// Uses only fetch + Web Crypto so it runs in Node 20+ and in a browser (for local testing).

export const UA = 'PortWatchVI-scout/1.0 (+https://github.com)';
const IN_NODE = typeof window === 'undefined';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RateLimitError extends Error {
  constructor(resetEpoch) {
    super(`GitHub rate limit hit; resets at ${resetEpoch ? new Date(resetEpoch * 1000).toISOString() : 'unknown'}`);
    this.resetEpoch = resetEpoch;
  }
}

/* ---------- GitHub ---------- */
export function makeGitHub({ token } = {}) {
  let calls = 0;
  async function req(path, { accept = 'application/vnd.github+json', raw = false } = {}) {
    const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
    const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (IN_NODE) headers['User-Agent'] = UA;
    calls++;
    const res = await fetch(url, { headers });
    if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') {
      throw new RateLimitError(+res.headers.get('x-ratelimit-reset'));
    }
    // 404 = deleted/private, 451 = blocked (DMCA). Both mean "gone".
    if (res.status === 404 || res.status === 451 || res.status === 409) return { status: res.status, data: null };
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
    return { status: res.status, data: raw ? await res.text() : await res.json() };
  }

  const toMeta = (d) => ({
    fullName: d.full_name,
    name: d.name,
    owner: d.owner?.login,
    description: d.description || '',
    language: d.language || null,
    size: d.size || 0,
    stars: d.stargazers_count || 0,
    forks: d.forks_count || 0,
    openIssues: d.open_issues_count || 0,
    createdAt: d.created_at,
    pushedAt: d.pushed_at,
    defaultBranch: d.default_branch,
    fork: !!d.fork,
    archived: !!d.archived,
    topics: d.topics || [],
    url: d.html_url,
  });

  return {
    get calls() { return calls; },
    toMeta,
    async repo(full) {
      const r = await req(`/repos/${full}`);
      return r.data ? toMeta(r.data) : { missing: true, status: r.status };
    },
    async commitsSince(full, branch, sinceIso) {
      const q = new URLSearchParams({ since: sinceIso, per_page: '100' });
      if (branch) q.set('sha', branch);
      const r = await req(`/repos/${full}/commits?${q}`);
      return Array.isArray(r.data) ? r.data.length : null;
    },
    async recentCommits(full, branch, n = 25) {
      const q = new URLSearchParams({ per_page: String(n) });
      if (branch) q.set('sha', branch);
      const r = await req(`/repos/${full}/commits?${q}`);
      return Array.isArray(r.data)
        ? r.data.map((c) => ({ date: c.commit?.author?.date, message: (c.commit?.message || '').split('\n')[0].slice(0, 200) }))
        : [];
    },
    async readme(full, branch) {
      const q = branch ? `?ref=${encodeURIComponent(branch)}` : '';
      const r = await req(`/repos/${full}/readme${q}`, { accept: 'application/vnd.github.raw+json', raw: true });
      return r.data;
    },
    async search(q, perPage = 50) {
      const p = new URLSearchParams({ q, sort: 'updated', order: 'desc', per_page: String(perPage) });
      const r = await req(`/search/repositories?${p}`);
      return (r.data?.items || []).map(toMeta);
    },
  };
}

/* ---------- Hacker News (Algolia, no key) ---------- */
export async function hnSearch(query, sinceEpoch) {
  const p = new URLSearchParams({ query, tags: 'story', hitsPerPage: '50' });
  if (sinceEpoch) p.set('numericFilters', `created_at_i>${sinceEpoch}`);
  const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${p}`);
  if (!res.ok) throw new Error(`HN ${res.status}`);
  const json = await res.json();
  return (json.hits || []).map((h) => ({
    source: 'Hacker News',
    title: h.title || '',
    text: `${h.title || ''} ${h.url || ''} ${h.story_text || ''}`,
    link: `https://news.ycombinator.com/item?id=${h.objectID}`,
    score: h.points || 0,
  }));
}

/* ---------- Reddit (OAuth app-only if keys are set, else public JSON) ---------- */
export async function redditToken(clientId, clientSecret) {
  if (!clientId || !clientSecret) return null;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(IN_NODE ? { 'User-Agent': UA } : {}),
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Reddit auth ${res.status}`);
  return (await res.json()).access_token;
}

export async function redditSearch({ subreddit, query, token }) {
  const p = new URLSearchParams({ q: query, sort: 'new', t: 'week', limit: '50', raw_json: '1' });
  if (subreddit) p.set('restrict_sr', '1');
  const path = subreddit ? `/r/${subreddit}/search` : '/search';
  const url = token ? `https://oauth.reddit.com${path}?${p}` : `https://www.reddit.com${path}.json?${p}`;
  const headers = IN_NODE ? { 'User-Agent': UA } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Reddit ${res.status}`);
  const json = await res.json();
  return (json.data?.children || []).map(({ data: d }) => ({
    source: `r/${d.subreddit}`,
    title: d.title || '',
    text: `${d.title || ''} ${d.url || ''} ${d.selftext || ''}`,
    link: `https://www.reddit.com${d.permalink}`,
    score: d.score || 0,
  }));
}

/* ---------- X (needs a paid API bearer token) ---------- */
export async function xSearch(query, bearer) {
  if (!bearer) return [];
  const p = new URLSearchParams({ query, max_results: '100', 'tweet.fields': 'entities,public_metrics,created_at' });
  const res = await fetch(`https://api.x.com/2/tweets/search/recent?${p}`, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!res.ok) throw new Error(`X ${res.status}`);
  const json = await res.json();
  return (json.data || []).map((t) => ({
    source: 'X',
    title: (t.text || '').slice(0, 120),
    text: `${t.text || ''} ${(t.entities?.urls || []).map((u) => u.expanded_url).join(' ')}`,
    link: `https://x.com/i/status/${t.id}`,
    score: (t.public_metrics?.like_count || 0) + (t.public_metrics?.retweet_count || 0),
  }));
}

/* ---------- Helpers ---------- */
const RESERVED_OWNERS = new Set(['features', 'topics', 'sponsors', 'orgs', 'settings', 'marketplace', 'apps', 'login', 'about', 'pricing', 'collections', 'trending', 'search', 'notifications', 'explore', 'issues', 'pulls', 'site', 'contact', 'enterprise', 'readme']);

export function extractGithubRepos(text) {
  const out = new Set();
  const re = /github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]{1,100})/g;
  for (const m of String(text || '').matchAll(re)) {
    const ownerName = m[1];
    let repo = m[2].replace(/\.git$/i, '').replace(/[.,;:)!?]+$/, '');
    if (!repo || RESERVED_OWNERS.has(ownerName.toLowerCase())) continue;
    out.add(`${ownerName}/${repo}`);
  }
  return [...out];
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const normDesc = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const SPAM_NAME = /(switch[-_ ]?version|pc[-_ ]?emulator[-_ ]?20\d\d|free[-_ ]?download|crack(ed)?\b|installer|torrent|\bapk\b|keygen|repack|full[-_ ]?game|unlocked)/i;
const SPAM_DESC = /(free download|download (now|free|here|link)|installer hub|full version|no survey|cracked|unlock(ed)? all|working 100%|pc installer)/i;

export function spamCheck(meta, descCounts) {
  const name = `${meta.name || ''}`;
  if (/switch[-_ ]?version.*emulator/i.test(name)) return { cluster: 'switch-emulator-network', reason: 'Clone of the "Switch Version PC Emulator" network' };
  if (SPAM_NAME.test(name)) return { cluster: 'auto-download-lures', reason: 'Name matches a download-lure pattern' };
  const d = normDesc(meta.description);
  if (d.length > 25 && (descCounts.get(d) || 0) >= 3) return { cluster: 'auto-clone-networks', reason: 'Same description as 3+ other new repos' };
  if (SPAM_DESC.test(meta.description || '')) return { cluster: 'auto-download-lures', reason: 'Description promotes a download' };
  return null;
}

const TECH = ['pe loader', 'pe32+', 'imports', 'd3d12', 'd3d12_xs', 'xgameruntime', 'kernelx', 'xmem', 'gdk', 'rdna2', 'rdna 2', 'spir-v', 'spirv', 'dxil', 'hlsl', 'shader', 'recompil', 'relink', 'vulkan', 'directstorage', 'bcpack', 'xma2', 'swizzle', 'tiling', 'unicorn', 'hle', 'iat', 'tls', 'relocation', 'command list', 'descriptor', 'pipeline', 'rpf9', 'ttpf', 'awc', 'bink'];
const RELEVANT = /(gta ?(vi|6)|grand theft auto|scarlett|xbox series|series x\|s|series x|gdk|rpf9|leonida|game ?core|d3d12_xs|xgameruntime|gen9)/i;
const TOOLISH = /(extract|explorer|archive|viewer|asset|rpf9|ttpf|awc|texture|decoder|format notes)/i;
const RUNTIMEISH = /(loader|d3d12_xs|xgameruntime|kernelx|compatibility layer|translation layer|emulat|recompil|relink|runtime|hle)/i;

export function substance(meta, readme = '', commits7d = null) {
  const text = String(readme || '').toLowerCase();
  const signals = [];
  let score = 0;
  if (meta.language) { score += 10; signals.push(meta.language); }
  if (meta.size > 300) score += 8;
  if (meta.size > 2000) score += 6;
  if (text.length > 1500) score += 8;
  if (text.length > 6000) score += 6;
  const hits = TECH.filter((k) => text.includes(k));
  score += Math.min(30, hits.length * 3);
  if (hits.length >= 3) signals.push(`${hits.length} technical terms`);
  if (/✅|❌|🟡|\|\s*(status|state|progress)\s*\|/i.test(readme)) { score += 8; signals.push('status table'); }
  if (/(\d+\s*\/\s*\d+\s*(tests|checks|passing))|tests? passing|ctest|cargo test|pytest|unit tests/i.test(readme)) { score += 7; signals.push('tests'); }
  if (commits7d != null) { score += Math.min(15, commits7d); if (commits7d) signals.push(`${commits7d >= 100 ? '100+' : commits7d} commits/7d`); }
  if (/(download|installer)/i.test(text) && hits.length < 3) score -= 25;
  if (/(ai hallucination|doesn'?t work|does not work|joke repo|meme)/i.test(text)) score -= 20;
  const blob = `${meta.name} ${meta.description} ${readme}`;
  const relevant = RELEVANT.test(blob);
  const kind = TOOLISH.test(blob) && !RUNTIMEISH.test(blob) ? 'tool' : 'effort';
  return { score: Math.max(0, Math.min(100, score)), signals, relevant, kind };
}

// Spot new milestone claims for GTA VI in a README, ignoring negated or future-tense lines.
const GTA = '(gta ?(vi|6)|grand theft auto (vi|6))';
const CLAIMS = [
  { milestone: 'stable', re: new RegExp(`${GTA}[^\\n]{0,140}(stable|no crashes|hours without crash)`, 'i') },
  { milestone: 'fps30', re: new RegExp(`${GTA}[^\\n]{0,140}\\b([3-9]\\d|1\\d\\d)\\s?fps`, 'i') },
  { milestone: 'ingame', re: new RegExp(`${GTA}[^\\n]{0,140}(in[- ]game|gameplay|story mode|playable|driving|walk(ing)? around)`, 'i') },
  { milestone: 'menu', re: new RegExp(`${GTA}[^\\n]{0,140}(main menu|title screen|pause menu)`, 'i') },
  { milestone: 'boots', re: new RegExp(`${GTA}[^\\n]{0,140}(boots|first frame|intro|logos|loading screen|splash)`, 'i') },
  { milestone: 'loads', re: new RegExp(`${GTA}[^\\n]{0,140}(entry ?point (runs|reached)|executable (loads|runs)|imports resolve)`, 'i') },
];
const NEGATED = /(\bno\b|\bnot\b|n't\b|\bnever\b|❌|blocked|\buntil\b|\bonce\b|\bwhen\b|\bwill\b|\bplan|todo|\bgoal\b|\bwaiting\b|\bmissing\b|\bif\b|\bcan(not)?\b)/i;
const ORDER = ['groundwork', 'loads', 'boots', 'menu', 'ingame', 'fps30', 'stable'];

export function detectClaims(readme, reachedKey = 'groundwork') {
  const reachedIdx = ORDER.indexOf(reachedKey);
  const out = [];
  for (const line of String(readme || '').split('\n')) {
    if (line.length > 400 || NEGATED.test(line)) continue;
    for (const c of CLAIMS) {
      if (ORDER.indexOf(c.milestone) <= reachedIdx) continue;
      if (c.re.test(line)) {
        out.push({ milestone: c.milestone, text: line.replace(/[#*|`>_[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220) });
        break;
      }
    }
  }
  return out.slice(0, 3);
}

// README similarity: share of 5-word shingles in common, relative to the shorter text.
// Catches re-uploads of tracked projects even when renamed or lightly edited.
export function shingles(text) {
  const w = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
  const s = new Set();
  for (let i = 0; i + 5 <= w.length; i++) s.add(w.slice(i, i + 5).join(' '));
  return s;
}
export function overlap(a, b) {
  if (!a?.size || !b?.size) return 0;
  let n = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) n++;
  return n / small.size;
}

// Original fan-made games (e.g. AI-agent game bounties) mention GTA 6 but aren't ports.
// (Deliberately narrow: ports routinely say "original game files", so generic phrases don't count.)
const FAN_GAME = /(open[- ]world crime game|bounty entry|make\.fun|built by an ai agent|three\.js[^\n]{0,60}\bgame\b|\bgame\b[^\n]{0,60}three\.js)/i;
export function isFanGame(meta, readme = '') {
  return FAN_GAME.test(`${meta.description || ''} ${String(readme).slice(0, 1500)}`);
}

export { sleep };
