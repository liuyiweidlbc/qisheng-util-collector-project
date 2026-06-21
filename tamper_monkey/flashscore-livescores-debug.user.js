// ==UserScript==
// @name         Flashscore Livescores Debug
// @namespace    https://www.flashscore.com/
// @version      2.3.6
// @description  Flashscore football: top-5 leagues, UCL/UEL/UECL, World Cup, Championship + upload + extra leagues
// @match        https://www.flashscore.com/*
// @match        http://www.flashscore.com/*
// @match        https://*.flashscore.com/*
// @match        http://*.flashscore.com/*
// @exclude      *://*/news/*
// @exclude      *://*/match/*
// @exclude      *://*/match
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const LOG_PREFIX = '[Flashscore Livescores]';
  const PANEL_ID = 'fs-livescores-debug-panel';
  const SCRIPT_VER = '2.3.6';
  const EXTRA_LEAGUE_CFG_KEY = 'fs-livescores-extra-leagues';
  const LEAGUE_BAR_EXPANDED_KEY = 'fs-livescores-league-bar-expanded';
  const LEAGUE_BAR_AUTO_COLLAPSE_N = 8;
  const UPLOAD_TIMEOUT_MS = 30000;
  const AUTO_UPLOAD_DELAY_MS = 3000;
  const SOURCE_SITE = 'flashscore';
  const UPLOAD_CFG_KEY = 'fs-livescores-upload-cfg';
  const UPLOAD_API_PATH = '/api/v1/soc/match-id-mapping/ext/batch-upsert';
  const UPLOAD_ENVS = [
    { id: 'prod', label: '生产' },
    { id: 'test', label: '测试' },
    { id: 'local', label: '本地' },
  ];
  const DEFAULT_UPLOAD_URLS = {
    prod: `https://smartodds.xyz${UPLOAD_API_PATH}`,
    test: `http://socbeta.xyz${UPLOAD_API_PATH}`,
    local: `http://localhost:8080${UPLOAD_API_PATH}`,
  };
  const LOCAL_UPLOAD_HOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;
  const LEGACY_UPLOAD_URL_RE = /\/api\/match-id-mapping\/ext\/batch-upsert$/;
  const EXCLUDE_COMP_RE =
    /\b(women|woman|frauen|feminine|femenin|femminil|feminino|female|girls|u\d{2}|youth|junior|reserve|amateur)\b/i;
  /** Flashscore women's teams: "Arsenal W", "Team (W)" */
  const EXCLUDE_TEAM_EXTRA_RE = /\(\s*w\s*\)|\sW$/i;
  /** Tournament stage / group labels mis-parsed as team names */
  const EXCLUDE_FAKE_TEAM_RE =
    /^(final|relegation|promotion|championship|qualification)\s+group$|^group\s+[a-h0-9]+$/i;
  const PARSE_DEBOUNCE_MS = 350;
  const BRIDGE_POLL_MS = [60, 150, 300, 600, 1200];

  /** Livescores list only — not match detail pages like /match/football/.../?mid= */
  function isListPage() {
    return !/\/match(\/|$)/i.test(location.pathname);
  }

  let lastRows = [];
  let lastPreparedRows = [];
  let selectedExtraLeagues = loadSelectedExtraLeagues();
  let leagueBarExpanded = loadLeagueBarExpanded();
  let lastNonTargetLeagues = [];
  let lastWhitelistLeagues = [];
  let uploadInFlight = false;
  let autoUploadDone = false;
  let autoUploadTimer = null;
  let parseTimer = null;
  let lastCache = [];
  let lastDebug = '';
  let lastFingerprint = '';
  let domWatchTimer = null;
  let bridgePollGen = 0;

  function leagueFilterLabel(country, league) {
    const c = String(country || '').trim();
    const l = String(league || '').trim();
    if (c && l) return `${c} - ${l}`;
    return l || c;
  }

  function isValidRow(r) {
    return !!(r && r.home && r.away && leagueFilterLabel(r.country, r.league));
  }

  function isExcludedTeam(name) {
    const t = String(name || '').trim();
    if (!t) return false;
    if (EXCLUDE_COMP_RE.test(t)) return true;
    if (EXCLUDE_TEAM_EXTRA_RE.test(t)) return true;
    if (EXCLUDE_FAKE_TEAM_RE.test(t)) return true;
    return false;
  }

  function isExcludedMatch(r) {
    if (!r) return true;
    const label = leagueFilterLabel(r.country, r.league);
    if (label && EXCLUDE_COMP_RE.test(label)) return true;
    if (isExcludedTeam(r.home) || isExcludedTeam(r.away)) return true;
    return false;
  }

  function isSpanishLaLiga(country, league) {
    const l = String(league || '').trim();
    const n = leagueFilterLabel(country, league);
    if (!n || /La\s*Liga\s*2/i.test(n) || /cop[aá]\s+(de\s+)?la\s*liga/i.test(n)) return false;
    if (/^La\s*Liga\s*$/i.test(l) || /^LaLiga\s*$/i.test(l)) return true;
    return /^Spain\s*-\s*La\s*Liga\s*$/i.test(n) || /^Spain\s*-\s*LaLiga\s*$/i.test(n);
  }

  function isAllowedLeague(country, league) {
    const n = leagueFilterLabel(country, league);
    if (!n) return false;
    if (EXCLUDE_COMP_RE.test(n)) return false;

    if (/England/i.test(n) && /Premier\s*League/i.test(n) && !/Championship\s*Group|Relegation/i.test(n))
      return true;
    if (/England/i.test(n) && /\bChampionship\b/i.test(n) && !/Group|Playoff/i.test(n)) return true;
    if (isSpanishLaLiga(country, league)) return true;
    if (/Italy/i.test(n) && /Serie\s*A/i.test(n) && !/Serie\s*B/i.test(n)) return true;
    if (/Germany/i.test(n) && /Bundesliga/i.test(n) && !/2\.\s*Bundesliga/i.test(n)) return true;
    if (/France/i.test(n) && /Ligue\s*1/i.test(n) && !/Ligue\s*2/i.test(n)) return true;
    if (/\bChampions\s*League\b/i.test(n) && !/AFC|CAF/i.test(n)) return true;
    if (/\bEuropa\s*League\b/i.test(n) && !/Conference/i.test(n)) return true;
    if (/\b(Conference|Europa\s*Conference)\s*League\b/i.test(n)) return true;
    if (/\bWorld\s*Cup\b/i.test(n) && !/women|u\d{2}/i.test(n)) return true;
    return false;
  }

  function applyLeagueFilter(rows) {
    return rows.filter((r) => isAllowedLeague(r.country, r.league));
  }

  function loadSelectedExtraLeagues() {
    try {
      const raw = localStorage.getItem(EXTRA_LEAGUE_CFG_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function saveSelectedExtraLeagues() {
    try {
      localStorage.setItem(EXTRA_LEAGUE_CFG_KEY, JSON.stringify([...selectedExtraLeagues]));
    } catch (err) {
      console.warn(LOG_PREFIX, 'save extra leagues failed', err);
    }
  }

  function loadLeagueBarExpanded() {
    try {
      const raw = localStorage.getItem(LEAGUE_BAR_EXPANDED_KEY);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch {
      /* ignore */
    }
    return false;
  }

  function saveLeagueBarExpanded() {
    try {
      localStorage.setItem(LEAGUE_BAR_EXPANDED_KEY, leagueBarExpanded ? '1' : '0');
    } catch (err) {
      console.warn(LOG_PREFIX, 'save league bar expanded failed', err);
    }
  }

  function toggleExtraLeague(label) {
    if (selectedExtraLeagues.has(label)) selectedExtraLeagues.delete(label);
    else selectedExtraLeagues.add(label);
    saveSelectedExtraLeagues();
    updateLeagueBar(lastPreparedRows);
    rerenderFromPrepared();
  }

  function leagueSearchExtras(country, league) {
    const label = leagueFilterLabel(country, league);
    const n = `${label} ${country} ${league}`.toLowerCase();
    const extras = [];
    if (/england/.test(n) && /premier/.test(n)) extras.push('epl', 'premier', 'pl');
    if (/england/.test(n) && /championship/.test(n)) extras.push('championship', 'efl');
    if (isSpanishLaLiga(country, league)) extras.push('laliga');
    if (/italy|serie a/.test(n) && !/serie b/.test(n)) extras.push('serie a', 'seriea');
    if (/germany|bundesliga/.test(n) && !/2\.\s*bundesliga/.test(n)) extras.push('bundesliga');
    if (/france|ligue 1/.test(n) && !/ligue 2/.test(n)) extras.push('ligue 1', 'ligue1');
    if (/champions league/.test(n)) extras.push('ucl', 'champions');
    if (/europa league/.test(n) && !/conference/.test(n)) extras.push('uel', 'europa');
    if (/conference league/.test(n)) extras.push('uecl', 'conference');
    if (/world cup/.test(n)) extras.push('world cup', 'fifa');
    return extras;
  }

  function leagueLabelSearchBlob(label, country, league) {
    const extras = leagueSearchExtras(country, league);
    return [label, country, league, ...extras].filter(Boolean).join(' ').toLowerCase();
  }

  function getLeagueSearchQuery() {
    const el = document.getElementById(PANEL_ID)?.querySelector('.league-bar-search');
    return String(el?.value || '').trim().toLowerCase();
  }

  function rowLeagueSearchText(row) {
    return leagueLabelSearchBlob(leagueFilterLabel(row.country, row.league), row.country, row.league);
  }

  function rowMatchesLeagueSearch(row, q) {
    if (!q) return true;
    return rowLeagueSearchText(row).includes(q);
  }

  function applyDisplayLeagueFilter(rows) {
    const q = getLeagueSearchQuery();
    return rows.filter((r) => {
      if (isExcludedMatch(r)) return false;
      const allowed =
        isAllowedLeague(r.country, r.league) ||
        selectedExtraLeagues.has(leagueFilterLabel(r.country, r.league));
      if (!allowed) return false;
      return rowMatchesLeagueSearch(r, q);
    });
  }

  function getWhitelistLeagues(rows) {
    const map = new Map();
    for (const r of rows) {
      if (!isValidRow(r)) continue;
      if (isExcludedMatch(r)) continue;
      if (!isAllowedLeague(r.country, r.league)) continue;
      const label = leagueFilterLabel(r.country, r.league);
      const item = map.get(label) || { label, country: r.country, league: r.league, count: 0 };
      item.count += 1;
      map.set(label, item);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  function getNonTargetLeagues(rows) {
    const map = new Map();
    for (const r of rows) {
      if (!isValidRow(r)) continue;
      if (isExcludedMatch(r)) continue;
      const label = leagueFilterLabel(r.country, r.league);
      if (!label || EXCLUDE_COMP_RE.test(label) || isAllowedLeague(r.country, r.league)) continue;
      const item = map.get(label) || { label, country: r.country, league: r.league, count: 0 };
      item.count += 1;
      map.set(label, item);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  function displaySubtitle(rowCount) {
    const extraN = selectedExtraLeagues.size;
    const extraHint = extraN ? ` | +${extraN} extra league${extraN > 1 ? 's' : ''}` : '';
    const dbg = lastDebug ? ` | ${lastDebug}` : '';
    return `${rowCount} matches | filtered leagues${extraHint}${dbg}`;
  }

  function rerenderFromPrepared() {
    const rows = applyDisplayLeagueFilter(lastPreparedRows);
    if (!rows.length) {
      renderPanel([], {
        subtitle: displaySubtitle(0),
        emptyMessage: lastPreparedRows.length
          ? 'No matches for current filters. Toggle extra league buttons above or click Refresh.'
          : 'No matches for current filters. Click Refresh.',
      });
      return;
    }
    lastRows = rows;
    renderPanel(rows, { subtitle: displaySubtitle(rows.length) });
  }

  function cleanMatchLink(link) {
    return String(link || '').trim();
  }

  function rowKey(r) {
    return [r.home, r.away, r.league, r.kickoff, r.score].join('|');
  }

  function dedupeRows(rows) {
    const seen = new Set();
    return rows.filter((r) => {
      const k = rowKey(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Install feed interceptor early (page context) so AD timestamps are available before parse */
  function injectFeedHookEarly() {
    if (document.documentElement.dataset.fsFeedHook === '1') return;
    document.documentElement.dataset.fsFeedHook = '1';
    const script = document.createElement('script');
    script.textContent = `(() => {
      if (window.__fsFeedHooked) return;
      window.__fsMatchKickoff = window.__fsMatchKickoff || {};
      function mergeFeedKickoffs(text) {
        if (!text || typeof text !== 'string') return;
        if (text.indexOf('AD\\u00f7') < 0 && text.indexOf('AD÷') < 0) return;
        const map = window.__fsMatchKickoff;
        const chunks = text.split('\\u00ac');
        let cur = {};
        const flush = () => {
          const id = cur.AA || cur.AB;
          const ts = cur.AD;
          if (id && ts) map[id] = Number(ts);
        };
        for (const chunk of chunks) {
          if (!chunk) continue;
          const sep = chunk.indexOf('\\u00f7');
          if (sep < 0) continue;
          const key = chunk.slice(0, sep);
          const val = chunk.slice(sep + 1);
          if (key.charAt(0) === '~') { flush(); cur = {}; cur[key.slice(1)] = val; }
          else { cur[key] = val; }
        }
        flush();
      }
      window.__fsFeedHooked = true;
      const onText = (txt) => { try { mergeFeedKickoffs(txt); } catch (e) {} };
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (m, url) { this._fsUrl = url; return origOpen.apply(this, arguments); };
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function () {
          const u = String(this._fsUrl || '');
          if (/feed|fsds|flashscore|\\.ninja/i.test(u) && typeof this.responseText === 'string') onText(this.responseText);
        });
        return origSend.apply(this, arguments);
      };
      const origFetch = window.fetch;
      if (typeof origFetch === 'function') {
        window.fetch = function (input, init) {
          const p = origFetch.apply(this, arguments);
          try {
            const u = typeof input === 'string' ? input : (input && input.url) || '';
            if (/feed|fsds|flashscore|\\.ninja/i.test(u)) p.then((res) => { res.clone().text().then(onText).catch(() => {}); }).catch(() => {});
          } catch (e) {}
          return p;
        };
      }
    })();`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  }

  /** Run parser in PAGE context (Tampermonkey isolated world cannot see dynamic DOM) */
  function injectPageParser() {
    if (document.documentElement.dataset.fsParserVer === SCRIPT_VER) return;
    document.documentElement.dataset.fsParserVer = SCRIPT_VER;
    const script = document.createElement('script');
    script.textContent = `(() => {
      if (window.__fsParserVer === '${SCRIPT_VER}') return;
      window.__fsParserVer = '${SCRIPT_VER}';

      window.__fsMatchKickoff = window.__fsMatchKickoff || {};

      function mergeFeedKickoffs(text) {
        if (!text || typeof text !== 'string') return;
        if (text.indexOf('AD\\u00f7') < 0 && text.indexOf('AD÷') < 0) return;
        const map = window.__fsMatchKickoff;
        const chunks = text.split('\\u00ac');
        let cur = {};
        const flush = () => {
          const id = cur.AA || cur.AB;
          const ts = cur.AD;
          if (id && ts) map[id] = Number(ts);
        };
        for (const chunk of chunks) {
          if (!chunk) continue;
          const sep = chunk.indexOf('\\u00f7');
          if (sep < 0) continue;
          const key = chunk.slice(0, sep);
          const val = chunk.slice(sep + 1);
          if (key.charAt(0) === '~') {
            flush();
            cur = {};
            cur[key.slice(1)] = val;
          } else {
            cur[key] = val;
          }
        }
        flush();
      }

      function installFeedHook() {
        if (window.__fsFeedHooked) return;
        window.__fsFeedHooked = true;
        const onText = (txt) => { try { mergeFeedKickoffs(txt); } catch (e) {} };
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
          this._fsUrl = url;
          return origOpen.apply(this, arguments);
        };
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function () {
          this.addEventListener('load', function () {
            const u = String(this._fsUrl || '');
            if (/feed|fsds|flashscore|\\.ninja/i.test(u) && typeof this.responseText === 'string') {
              onText(this.responseText);
            }
          });
          return origSend.apply(this, arguments);
        };
        const origFetch = window.fetch;
        if (typeof origFetch === 'function') {
          window.fetch = function (input, init) {
            const p = origFetch.apply(this, arguments);
            try {
              const u = typeof input === 'string' ? input : (input && input.url) || '';
              if (/feed|fsds|flashscore|\\.ninja/i.test(u)) {
                p.then((res) => {
                  res.clone().text().then(onText).catch(() => {});
                }).catch(() => {});
              }
            } catch (e) {}
            return p;
          };
        }
      }
      installFeedHook();

      function slugTitle(s) {
        return String(s || '').split('-').filter(Boolean)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }

      const FS_FAKE_TEAM_RE =
        /^(final|relegation|promotion|championship|qualification)\\s+group$/i;
      const FS_GROUP_NAME_RE = /^group\\s+[a-h0-9]+$/i;
      const FS_STAGE_LABEL_RE =
        /^(qualifying|knockout|playoffs?|play-offs?|standings|fixtures|results|stats|matchday\\s+\\d+)$/i;

      function isPlausibleTeamName(name) {
        const t = String(name || '').trim();
        if (!t || t.length > 55) return false;
        if (FS_FAKE_TEAM_RE.test(t)) return false;
        if (FS_GROUP_NAME_RE.test(t)) return false;
        if (FS_STAGE_LABEL_RE.test(t)) return false;
        if (/^round\\s+of\\s+\\d+$/i.test(t)) return false;
        return true;
      }

      function parseTeams(label) {
        const t = String(label || '').replace(/\\s+/g, ' ').trim();
        const m = t.match(/^(.+?)\\s+-\\s+(.+)$/);
        if (!m) return null;
        const home = m[1].trim();
        const away = m[2].trim();
        if (!home || !away || home.length > 55 || away.length > 55) return null;
        if (/^\\d+$/.test(home) || /^\\d+$/.test(away)) return null;
        if (!isPlausibleTeamName(home) || !isPlausibleTeamName(away)) return null;
        if (/hide all|display all|add this game|flashscore news|go to news/i.test(t)) return null;
        return { home, away };
      }

      function isLeagueHref(href) {
        const h = String(href || '');
        if (/\\/match\\//i.test(h) || /\\/team\\//i.test(h)) return false;
        return /\\/football\\/[^/]+\\/[^/]+(?:\\/|$|\\?|#)/i.test(h);
      }

      function isLeagueName(label, href) {
        const t = String(label || '').trim();
        const h = String(href || '');
        if (/\\/match\\//i.test(h)) return false;
        if (isLeagueHref(h)) return true;
        if (/premier league|la liga|serie a|bundesliga|ligue 1|champions league|europa league|europa conference|world cup|championship/i.test(t)) {
          if (parseTeams(t) && !/england|spain|italy|germany|france|europe|international|south america|north /i.test(t)) return false;
          return true;
        }
        if (/^.+\\s+-\\s+(Premier League|La Liga|LaLiga|Serie A|Bundesliga|Ligue 1|Championship|Champions League|Europa League|Conference League|World Cup)/i.test(t))
          return true;
        return false;
      }

      function leagueFromHref(href) {
        const m = String(href || '').match(/\\/football\\/([^/]+)\\/([^/]+)/i);
        if (!m) return { country: '', league: '' };
        return { country: slugTitle(m[1]), league: slugTitle(m[2]) };
      }

      function leagueFromLabel(label) {
        const m = String(label || '').match(/^(.+?)\\s+-\\s+(.+)$/);
        if (m) return { country: m[1].trim(), league: m[2].trim() };
        return { country: '', league: String(label || '').trim() };
      }

      const FS_STATUS_ONLY_RE = /^(finished|fin\\.?|live|half\\s*time|full\\s*time|delayed|postponed|cancelled|abandoned|break|awarded|walkover)$/i;
      const FS_FINISHED_RE = /^(finished|fin\\.?|full\\s*time|ft)$/i;
      const FS_MATCH_STATUS_RE = /^(ft|ht|aet|pen|et|postp\\.?|\\d{1,3}['+]?)$/i;

      function isFinishedStatus(t) {
        return FS_FINISHED_RE.test(String(t || '').trim());
      }

      function formatFinishedKickoff(matchDate) {
        const d = matchDate || getPageDateFallback();
        return d ? d + ' FT' : 'FT';
      }

      function matchIdFromBox(box) {
        if (!box) return '';
        if (box.id && /^g_/.test(box.id)) {
          const mid = box.id.split('_').pop();
          if (mid && mid.length > 4) return mid;
        }
        const a = box.querySelector
          ? box.querySelector('a[href*="/match/"]')
          : (box.matches && box.matches('a[href*="/match/"]') ? box : null);
        if (a) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/\\/match\\/[^/]+\\/([^/?#]+)/i);
          if (m) return m[1];
        }
        return '';
      }

      function kickoffFromFeed(box, wantTime) {
        const mid = matchIdFromBox(box);
        if (!mid || !window.__fsMatchKickoff) return '';
        const ts = window.__fsMatchKickoff[mid];
        if (!ts) return '';
        const d = new Date(Number(ts) * 1000);
        if (Number.isNaN(d.getTime())) return '';
        const day = formatDateOnly(d);
        if (!wantTime) return day;
        return day + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      }

      function dateFromTimeElement(box) {
        if (!box || !box.querySelector) return '';
        const timeEl = box.querySelector('[class*="event__time"]');
        if (!timeEl) return '';
        const vals = [
          timeEl.getAttribute('title'),
          timeEl.getAttribute('data-title'),
          timeEl.getAttribute('data-dt'),
          timeEl.getAttribute('data-start')
        ].filter(Boolean);
        for (const v of vals) {
          const full = parseFlashscoreDateTime(String(v));
          if (full) return full.split(' ')[0];
          const d = parseFlashscoreDateLabel(String(v));
          if (d) return d;
        }
        return '';
      }

      function getMatchDate(box, root) {
        return kickoffFromFeed(box, false) || dateFromTimeElement(box) || dateBeforeElement(box, root);
      }

      function boxHasScore(box) {
        const hs = box.querySelector('[class*="participant--home"], [class*="score--home"]');
        const as = box.querySelector('[class*="participant--away"], [class*="score--away"]');
        if (hs && as) {
          const h = hs.textContent.trim();
          const a = as.textContent.trim();
          if (/^\\d+$/.test(h) && /^\\d+$/.test(a)) return true;
        }
        const blob = (box.querySelector('[class*="event__scores"], [class*="scores"]')?.textContent || '').replace(/\\s+/g, '');
        return /\\d+[-:]\\d+/.test(blob);
      }

      function boxLooksFinished(box, score) {
        if (!score && !boxHasScore(box)) return false;
        const cls = String(box.className || '');
        if (/event__match--finished/i.test(cls)) return true;
        if (/event__match--live|event__match--scheduled/i.test(cls)) return false;
        if (/event__match--static/i.test(cls) && boxHasScore(box)) return true;
        return false;
      }

      function pad2(n) { return String(n).padStart(2, '0'); }

      function formatDateOnly(d) {
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      }

      function parseFlashscoreDateLabel(text) {
        const t = String(text || '').replace(/\\s+/g, ' ').trim();
        if (!t || t.length > 80) return '';
        if (/^\\d{4}-\\d{2}-\\d{2}$/.test(t)) return t;
        let m = t.match(/\\b(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\b/);
        if (m) {
          const day = +m[1];
          const mon = +m[2];
          let year = m[3] ? +m[3] : new Date().getFullYear();
          if (year < 100) year += 2000;
          const d = new Date(year, mon - 1, day);
          if (!Number.isNaN(d.getTime())) return formatDateOnly(d);
        }
        if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\b/i.test(t) || /\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\b/i.test(t)) {
          const d = new Date(t);
          if (!Number.isNaN(d.getTime())) return formatDateOnly(d);
        }
        return '';
      }

      function getPageDateFallback() {
        try {
          if (typeof tudate !== 'undefined' && Number(tudate) > 0) {
            return formatDateOnly(new Date(Number(tudate) * 1000));
          }
        } catch (e) {}
        const combo = document.querySelector('[role="combobox"]');
        const comboText = [
          combo?.textContent,
          combo?.getAttribute('aria-label'),
          combo?.innerText,
          document.querySelector('.calendar__datepicker')?.textContent
        ].filter(Boolean).join(' ').trim();
        const fromCombo = parseFlashscoreDateLabel(comboText);
        if (fromCombo) return fromCombo;
        return formatDateOnly(new Date());
      }

      function parseFlashscoreDateTime(text) {
        const s = String(text || '').replace(/\\s+/g, ' ').trim();
        if (!s || FS_STATUS_ONLY_RE.test(s)) return '';
        let m = s.match(/^(\\d{1,2})[./](\\d{1,2})\\.?\\s+(\\d{1,2}):(\\d{2})$/);
        if (m) {
          const day = +m[1];
          const mon = +m[2];
          const year = new Date().getFullYear();
          const d = new Date(year, mon - 1, day, +m[3], +m[4]);
          if (!Number.isNaN(d.getTime())) {
            return formatDateOnly(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
          }
        }
        m = s.match(/^(\\d{4}-\\d{2}-\\d{2})\\s+(\\d{1,2}:\\d{2})$/);
        if (m) return m[1] + ' ' + m[2];
        return '';
      }

      function normalizeKickoff(raw, dateContext) {
        const s = String(raw || '').replace(/\\s+/g, ' ').trim();
        if (!s || FS_STATUS_ONLY_RE.test(s)) return '';
        const full = parseFlashscoreDateTime(s);
        if (full) return full;
        const ctx = dateContext || getPageDateFallback();
        if (/^\\d{1,2}:\\d{2}$/.test(s)) return ctx ? ctx + ' ' + s : s;
        if (FS_MATCH_STATUS_RE.test(s)) return ctx ? ctx + ' ' + s : s;
        return '';
      }

      function dateBeforeElement(el, root) {
        let node = el;
        while (node && root.contains(node)) {
          let sib = node.previousElementSibling;
          while (sib) {
            const cls = String(sib.className || '');
            const txt = (sib.textContent || '').replace(/\\s+/g, ' ').trim();
            if (/event__round|event__header|event__date/i.test(cls) ||
                (/\\d{1,2}[./]\\d{1,2}/.test(txt) && txt.length < 32) ||
                (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\b/i.test(txt) && txt.length < 32)) {
              const d = parseFlashscoreDateLabel(txt);
              if (d) return d;
            }
            sib = sib.previousElementSibling;
          }
          node = node.parentElement;
        }
        return getPageDateFallback();
      }

      function extractKickoff(box, root, score) {
        if (!box || !box.querySelector) return '';
        const matchDate = getMatchDate(box, root);
        const feedFull = kickoffFromFeed(box, true);
        const timeTxt = (box.querySelector('[class*="event__time"]')?.textContent || '').replace(/\\s+/g, ' ').trim();
        const stageTxt = (box.querySelector('[class*="event__stage"]')?.textContent || '').replace(/\\s+/g, ' ').trim();
        const hasScore = !!(score || boxHasScore(box));

        if (feedFull && (isFinishedStatus(timeTxt) || isFinishedStatus(stageTxt) || (hasScore && boxLooksFinished(box, score)))) {
          return formatFinishedKickoff(matchDate);
        }

        if (isFinishedStatus(timeTxt) || isFinishedStatus(stageTxt)) {
          return formatFinishedKickoff(matchDate);
        }

        if (feedFull) return feedFull;

        let k = normalizeKickoff(timeTxt, matchDate);
        if (k) return k;

        if (stageTxt && !FS_STATUS_ONLY_RE.test(stageTxt)) {
          k = normalizeKickoff(stageTxt, matchDate);
          if (k) return k;
        }

        const nodes = box.querySelectorAll('[class*="event__time"], [class*="event__stage"]');
        for (const n of nodes) {
          const t = (n.textContent || '').replace(/\\s+/g, ' ').trim();
          if (isFinishedStatus(t)) return formatFinishedKickoff(matchDate);
          k = normalizeKickoff(t, matchDate);
          if (k) return k;
        }

        if (/^live$/i.test(timeTxt) || /^live$/i.test(stageTxt)) {
          return matchDate ? matchDate + ' Live' : 'Live';
        }

        if (hasScore && boxLooksFinished(box, score)) {
          return formatFinishedKickoff(matchDate);
        }

        return '';
      }

      function readBox(box, root) {
        const hs = box.querySelector('[class*="participant--home"], [class*="score--home"]');
        const as = box.querySelector('[class*="participant--away"], [class*="score--away"]');
        let score = '';
        if (hs && as) {
          const h = hs.textContent.trim();
          const a = as.textContent.trim();
          if (/^\\d+$/.test(h) && /^\\d+$/.test(a)) score = h + '-' + a;
        }
        if (!score) {
          const blob = (box.querySelector('[class*="event__scores"], [class*="scores"]')?.textContent || '').replace(/\\s+/g, '');
          const sm = blob.match(/(\\d+)[-:](\\d+)/);
          if (sm) score = sm[1] + '-' + sm[2];
        }
        const kickoff = extractKickoff(box, root, score);
        let link = '';
        const ma = box.querySelector('a[href*="/match/"]');
        if (ma && ma.href) link = ma.href;
        else if (box.id) {
          const mid = box.id.split('_').pop();
          if (mid && mid.length > 4) link = location.origin + '/match/' + mid + '/';
        }
        return { score, kickoff, link };
      }

      function parsePage() {
        const rows = [];
        let league = { country: '', league: '' };
        let dbg = { boxes: 0, aria: 0, anchors: 0, leagues: 0 };

        const root = document.getElementById('live-table') || document.querySelector('.container__liveTableWrapper') || document.body;

        // 1) event match boxes
        root.querySelectorAll('[class*="event__match"], [id^="g_"]').forEach(box => {
          if (box.closest('#${PANEL_ID}')) return;
          const homeEl = box.querySelector('[class*="participant--home"]');
          const awayEl = box.querySelector('[class*="participant--away"]');
          const home = (homeEl?.textContent || '').trim();
          const away = (awayEl?.textContent || '').trim();
          if (!home || !away || home.length > 55 || away.length > 55) return;
          if (!isPlausibleTeamName(home) || !isPlausibleTeamName(away)) return;
          dbg.boxes++;
          const info = readBox(box, root);
          rows.push({ country: league.country, league: league.league, home, away, score: info.score, kickoff: info.kickoff, link: info.link });
        });

        // 2) walk anchors in document order (aria-label has "Team - Team")
        const seen = new Set(rows.map(r => r.home + '|' + r.away));
        root.querySelectorAll('a[href]').forEach(a => {
          if (a.closest('#${PANEL_ID}, footer')) return;
          const href = a.getAttribute('href') || '';
          const label = (a.getAttribute('aria-label') || a.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!label) return;

          if (isLeagueName(label, href)) {
            dbg.leagues++;
            league = leagueFromHref(href);
            if (!league.league) {
              const lf = leagueFromLabel(label);
              league = { country: lf.country || league.country, league: lf.league || label };
            }
            return;
          }

          const teams = parseTeams(label);
          if (!teams) return;
          if (isLeagueName(label, href)) return;
          const key = teams.home + '|' + teams.away;
          if (seen.has(key)) return;
          seen.add(key);
          dbg.aria++;

          const box = a.closest('[class*="event__match"], [id^="g_"]') || a.parentElement?.parentElement;
          const info = readBox(box || a, root);
          let link = info.link;
          if (!link && /\\/match\\//i.test(href)) link = new URL(href, location.origin).href;

          rows.push({
            country: league.country,
            league: league.league,
            home: teams.home,
            away: teams.away,
            score: info.score,
            kickoff: info.kickoff,
            link: link
          });
        });

        dbg.anchors = root.querySelectorAll('a[href]').length;
        const feedN = Object.keys(window.__fsMatchKickoff || {}).length;
        return { rows, debug: 'boxes ' + dbg.boxes + ', aria ' + dbg.aria + ', leagues ' + dbg.leagues + ', feed ' + feedN };
      }

      function publish(rows, debug) {
        let bridge = document.getElementById('fs-parse-bridge');
        if (!bridge) {
          bridge = document.createElement('div');
          bridge.id = 'fs-parse-bridge';
          bridge.style.display = 'none';
          document.documentElement.appendChild(bridge);
        }
        bridge.textContent = JSON.stringify({ rows, debug });
        window.dispatchEvent(new CustomEvent('fs-parse-result', { detail: { rows, debug } }));
      }

      window.addEventListener('fs-parse-request', () => {
        try {
          const result = parsePage();
          publish(result.rows, result.debug);
        } catch (e) {
          publish([], 'error ' + (e && e.message));
        }
      });

      function hookLiveTableWatch() {
        const root = document.getElementById('live-table') || document.querySelector('.container__liveTableWrapper') || document.body;
        let debounce;
        new MutationObserver(() => {
          clearTimeout(debounce);
          debounce = setTimeout(() => window.dispatchEvent(new CustomEvent('fs-parse-request')), ${PARSE_DEBOUNCE_MS});
        }).observe(root, { childList: true, subtree: true });
      }
      hookLiveTableWatch();
    })();`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  }

  function readBridge() {
    try {
      const bridge = document.getElementById('fs-parse-bridge');
      if (!bridge?.textContent) return null;
      return JSON.parse(bridge.textContent);
    } catch {
      return null;
    }
  }

  function pageFingerprint() {
    const root = document.getElementById('live-table');
    const dateLabel =
      document.querySelector('[role="combobox"]')?.textContent?.trim() ||
      document.querySelector('.calendar__datepicker')?.textContent?.trim() ||
      '';
    const matchCount = root
      ? root.querySelectorAll('[class*="event__match"], [id^="g_"]').length
      : document.querySelectorAll('[class*="event__match"], [id^="g_"]').length;
    return `${dateLabel}|${matchCount}`;
  }

  function pollBridgeResults(gen) {
    BRIDGE_POLL_MS.forEach((ms) => {
      setTimeout(() => {
        if (gen !== bridgePollGen) return;
        const data = readBridge();
        if (data) onParseResult({ detail: data });
      }, ms);
    });
  }

  function requestPageParse() {
    injectPageParser();
    bridgePollGen += 1;
    const gen = bridgePollGen;
    window.dispatchEvent(new CustomEvent('fs-parse-request'));
    pollBridgeResults(gen);
  }

  function markUpdating() {
    lastCache = [];
    lastRows = [];
    lastPreparedRows = [];
    autoUploadDone = false;
    clearTimeout(autoUploadTimer);
    ensurePanel();
    updatePanelSubtitle('Updating...');
    renderPanel([], { subtitle: 'Updating...', emptyMessage: 'Loading matches for selected date...' });
  }

  function onContentMaybeChanged(force) {
    const fp = pageFingerprint();
    if (!force && fp === lastFingerprint) return;
    lastFingerprint = fp;
    markUpdating();
    scheduleParse(80);
    setTimeout(() => scheduleParse(0), 900);
  }

  function setupBridgeObserver() {
    let bridge = document.getElementById('fs-parse-bridge');
    if (!bridge) {
      bridge = document.createElement('div');
      bridge.id = 'fs-parse-bridge';
      bridge.style.display = 'none';
      document.documentElement.appendChild(bridge);
    }
    new MutationObserver(() => {
      const data = readBridge();
      if (data?.rows) onParseResult({ detail: data });
    }).observe(bridge, { childList: true, characterData: true, subtree: true });
  }

  function updatePanelSubtitle(text) {
    const el = document.getElementById(PANEL_ID)?.querySelector('#fs-livescores-debug-count');
    if (el) el.textContent = text;
  }

  function normalizeUploadUrl(url, fallback) {
    let s = String(url || '').trim();
    if (!s) return fallback;
    if (/^https:\/\/socbeta\.xyz/i.test(s)) s = s.replace(/^https:/i, 'http:');
    if (LEGACY_UPLOAD_URL_RE.test(s)) {
      try {
        const u = new URL(s);
        return `${u.protocol}//${u.host}${UPLOAD_API_PATH}`;
      } catch {
        return fallback;
      }
    }
    return s;
  }

  function normalizeUploadEnv(env) {
    return UPLOAD_ENVS.some((e) => e.id === env) ? env : 'test';
  }

  function uploadEnvLabel(env) {
    return UPLOAD_ENVS.find((e) => e.id === env)?.label || env;
  }

  function loadUploadConfig() {
    const base = { env: 'test', ...DEFAULT_UPLOAD_URLS };
    try {
      const raw = localStorage.getItem(UPLOAD_CFG_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      let test = normalizeUploadUrl(saved.test, base.test);
      let prod = normalizeUploadUrl(saved.prod, base.prod);
      let local = normalizeUploadUrl(saved.local, base.local);
      if (/^https:\/\/socbeta\.xyz/i.test(test)) test = test.replace(/^https:/i, 'http:');
      if (/your-prod-host/i.test(prod)) prod = base.prod;
      if (!saved.local && LOCAL_UPLOAD_HOST_RE.test(String(saved.test || ''))) {
        local = normalizeUploadUrl(saved.test, base.local);
        test = base.test;
      }
      const cfg = { env: normalizeUploadEnv(saved.env), prod, test, local };
      const changed =
        cfg.env !== saved.env ||
        cfg.test !== saved.test ||
        cfg.prod !== saved.prod ||
        cfg.local !== saved.local;
      if (changed) saveUploadConfig(cfg);
      return cfg;
    } catch {
      return base;
    }
  }

  function saveUploadConfig(cfg) {
    try {
      localStorage.setItem(UPLOAD_CFG_KEY, JSON.stringify(cfg));
    } catch (err) {
      console.warn(LOG_PREFIX, 'save upload config failed', err);
    }
  }

  function getUploadUrl(cfg) {
    const env = normalizeUploadEnv(cfg.env);
    return cfg[env] || DEFAULT_UPLOAD_URLS[env];
  }

  function getDisplayRows() {
    return applyDisplayLeagueFilter(dedupeRows(lastPreparedRows.length ? lastPreparedRows : lastCache));
  }

  function getRowsForUpload() {
    return getDisplayRows();
  }

  function buildUploadPayload(rows) {
    return {
      source_site: SOURCE_SITE,
      page_url: location.href,
      script_version: SCRIPT_VER,
      items: rows
        .map((r) => ({
          match_link: cleanMatchLink(r.link),
          country: String(r.country || '').trim(),
          league: String(r.league || '').trim(),
          kickoff: String(r.kickoff || '').trim(),
          home_team: String(r.home || '').trim(),
          away_team: String(r.away || '').trim(),
          score: String(r.score || '').trim(),
        }))
        .filter((it) => it.match_link && it.home_team && it.away_team),
    };
  }

  function isUploadResponseOk(body, httpStatus) {
    if (!body || typeof body !== 'object') return httpStatus >= 200 && httpStatus < 300;
    if (body.success === true) return true;
    if (body.success === false) return false;
    const code = body.code;
    if (code == null) return httpStatus >= 200 && httpStatus < 300;
    if (code === 0 || code === 200) return true;
    if (code >= 200 && code < 300) return true;
    return false;
  }

  function formatUploadResult(data) {
    if (!data || typeof data !== 'object') return '';
    const d = data.data && typeof data.data === 'object' ? data.data : data;
    if (typeof d.received === 'number') {
      return `received ${d.received}, +${d.inserted || 0}, ~${d.updated || 0}, skip ${d.skipped || 0}, fail ${d.failed || 0}`;
    }
    if (typeof d.inserted === 'number' || typeof d.updated === 'number') {
      return `+${d.inserted || 0}, ~${d.updated || 0}`;
    }
    return data.msg || data.message || '';
  }

  /** state: true | 'error' | 'success' | false | 'info' */
  function setUploadStatus(text, state) {
    const el = document.getElementById(PANEL_ID)?.querySelector('#fs-livescores-upload-status');
    if (!el) return;
    el.textContent = text || '';
    const isError = state === true || state === 'error';
    const isSuccess = state === 'success';
    el.style.color = isError ? '#f87171' : isSuccess ? '#4ade80' : '#94a3b8';
  }

  function syncUploadControls(cfg) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const envSel = panel.querySelector('#fs-livescores-upload-env');
    const urlInp = panel.querySelector('#fs-livescores-upload-url');
    const btn = panel.querySelector('[data-action="upload"]');
    if (envSel) envSel.value = cfg.env;
    if (urlInp) urlInp.value = getUploadUrl(cfg);
    if (btn) {
      btn.disabled = uploadInFlight;
      btn.textContent = uploadInFlight ? 'Uploading...' : 'Upload';
    }
  }

  function readUploadConfigFromPanel() {
    const panel = document.getElementById(PANEL_ID);
    const cfg = loadUploadConfig();
    const envSel = panel?.querySelector('#fs-livescores-upload-env');
    const urlInp = panel?.querySelector('#fs-livescores-upload-url');
    cfg.env = normalizeUploadEnv(envSel?.value);
    const url = String(urlInp?.value || '').trim();
    if (url) cfg[cfg.env] = url;
    saveUploadConfig(cfg);
    return cfg;
  }

  function postUploadJson(url, payload) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('需要 Tampermonkey，并允许 GM_xmlhttpRequest 权限'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        data: JSON.stringify(payload),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: UPLOAD_TIMEOUT_MS,
        onload(res) {
          let body = null;
          try {
            body = res.responseText ? JSON.parse(res.responseText) : null;
          } catch {
            body = { message: String(res.responseText || '').slice(0, 200) };
          }
          resolve({ status: res.status, body });
        },
        onerror(err) {
          reject(new Error(err?.error || '网络请求失败'));
        },
        ontimeout() {
          reject(new Error('请求超时'));
        },
      });
    });
  }

  function scheduleAutoUpload() {
    if (autoUploadDone) return;
    clearTimeout(autoUploadTimer);
    autoUploadTimer = setTimeout(() => {
      if (autoUploadDone || uploadInFlight) return;
      const rows = getDisplayRows();
      if (!rows.length) return;
      autoUploadDone = true;
      console.log(LOG_PREFIX, 'auto upload', rows.length, 'matches');
      uploadRows();
    }, AUTO_UPLOAD_DELAY_MS);
  }

  async function uploadRows() {
    if (uploadInFlight) return;
    const cfg = readUploadConfigFromPanel();
    const url = getUploadUrl(cfg);
    if (!url) {
      setUploadStatus('请填写上传接口 URL', true);
      return;
    }

    const rows = getRowsForUpload();
    const payload = buildUploadPayload(rows);
    if (!payload.items.length) {
      setUploadStatus('无可上传数据（请先刷新并等待解析）', true);
      return;
    }

    uploadInFlight = true;
    syncUploadControls(cfg);
    setUploadStatus(`上传中 ${payload.items.length} 条 → ${uploadEnvLabel(cfg.env)}...`, false);
    console.log(LOG_PREFIX, 'upload', cfg.env, url, payload);

    try {
      const { status, body } = await postUploadJson(url, payload);
      if (status < 200 || status >= 300) {
        throw new Error(body?.msg || body?.message || `HTTP ${status}`);
      }
      if (!isUploadResponseOk(body, status)) {
        throw new Error(body?.msg || body?.message || `code ${body?.code}`);
      }
      const summary = formatUploadResult(body) || body?.msg || body?.message || 'ok';
      setUploadStatus(`上传成功 (${uploadEnvLabel(cfg.env)}): ${summary}`, 'success');
      console.log(LOG_PREFIX, 'upload ok', body);
    } catch (err) {
      const msg = err?.message || String(err);
      setUploadStatus(`上传失败 (${uploadEnvLabel(cfg.env)}): ${msg}`, true);
      console.warn(LOG_PREFIX, 'upload failed', err);
    } finally {
      uploadInFlight = false;
      syncUploadControls(readUploadConfigFromPanel());
    }
  }

  function scheduleParse(ms) {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(runParse, ms);
  }

  function runParse() {
    requestPageParse();
  }

  function onParseResult(e) {
    const detail = e.detail || {};
    lastCache = Array.isArray(detail.rows) ? detail.rows : [];
    lastDebug = detail.debug || '';
    if (lastCache.length) console.log(LOG_PREFIX, lastCache.length, lastDebug);

    ensurePanel();

    if (!lastCache.length) {
      lastPreparedRows = [];
      updateLeagueBar([]);
      renderPanel([], {
        subtitle: 'No data',
        emptyMessage: `Parse failed (${lastDebug || 'empty'}). Wait for page load, then Refresh.`,
      });
      return;
    }

    const prepared = dedupeRows(lastCache);
    lastPreparedRows = prepared;
    updateLeagueBar(prepared);
    const rows = applyDisplayLeagueFilter(prepared);
    if (!rows.length) {
      lastRows = [];
      const nonTarget = getNonTargetLeagues(prepared);
      renderPanel([], {
        subtitle: displaySubtitle(0),
        emptyMessage:
          nonTarget.length > 0
            ? `Parsed ${prepared.length} matches, none in whitelist. Toggle extra league buttons above. (${lastDebug})`
            : `Parsed ${prepared.length} matches, none in whitelist. (${lastDebug})`,
      });
      return;
    }

    const sig = rows.map(rowKey).join(';');
    if (sig !== lastRows.map(rowKey).join(';')) {
      lastRows = rows;
      console.groupCollapsed(`${LOG_PREFIX} ${rows.length} matches`);
      console.table(rows);
      console.groupEnd();
    }
    renderPanel(rows, { subtitle: displaySubtitle(rows.length) });
    scheduleAutoUpload();
  }

  function removeStalePanel() {
    const old = document.getElementById(PANEL_ID);
    if (old && old.dataset.fsVer !== SCRIPT_VER) old.remove();
  }

  function ensurePanel() {
    removeStalePanel();
    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      patchLeagueBarPanel(panel);
      return panel;
    }

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.dataset.fsVer = SCRIPT_VER;

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID}{
        position:fixed;right:12px;bottom:12px;z-index:2147483646;
        width:min(960px,calc(100vw - 24px));height:min(70vh,520px);
        background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:10px;
        box-shadow:0 8px 32px rgba(0,0,0,.45);font:12px/1.4 system-ui,sans-serif;
        display:flex;flex-direction:column;overflow:hidden;
      }
      #${PANEL_ID} .hdr{
        flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;
        gap:6px;padding:8px 12px;background:#1e293b;border-bottom:1px solid #334155;
      }
      #${PANEL_ID} .hdr button{
        margin-left:6px;padding:4px 10px;border-radius:6px;border:1px solid #475569;
        background:#334155;color:#fff;cursor:pointer;
      }
      #${PANEL_ID} .body{
        flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;
        -webkit-overflow-scrolling:touch;
      }
      #${PANEL_ID} table{width:100%;border-collapse:collapse;table-layout:fixed}
      #${PANEL_ID} th,#${PANEL_ID} td{padding:6px 8px;border-bottom:1px solid #1e293b;text-align:left;word-break:break-word}
      #${PANEL_ID} th{position:sticky;top:0;background:#0f172a;color:#94a3b8;z-index:1}
      #${PANEL_ID} a{color:#38bdf8}
      #${PANEL_ID} .empty{padding:16px;color:#94a3b8}
      #${PANEL_ID} .sub{font-size:11px;color:#94a3b8;margin-left:8px}
      #${PANEL_ID} .upload-bar{
        flex:0 0 auto;display:flex;align-items:center;flex-wrap:wrap;gap:6px;
        padding:6px 12px;background:#111827;border-bottom:1px solid #334155;font-size:11px;
      }
      #${PANEL_ID} .upload-bar label{color:#94a3b8}
      #${PANEL_ID} .upload-bar select,#${PANEL_ID} .upload-bar input{
        padding:3px 6px;border-radius:6px;border:1px solid #475569;background:#1f2937;color:#e5e7eb;
      }
      #${PANEL_ID} .upload-bar input{flex:1 1 200px;min-width:160px;max-width:420px}
      #${PANEL_ID} .upload-bar .upload-status{flex:1 1 100%;color:#94a3b8;word-break:break-all}
      #${PANEL_ID} .league-bar{
        flex:0 0 auto;display:none;flex-direction:column;gap:4px;
        padding:6px 12px;background:#0b1220;border-bottom:1px solid #334155;font-size:11px;
      }
      #${PANEL_ID} .league-bar-head{
        display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-height:24px;
      }
      #${PANEL_ID} .league-bar .league-bar-label{color:#94a3b8;flex:0 0 auto}
      #${PANEL_ID} .league-bar .league-bar-summary{color:#64748b;flex:0 0 auto}
      #${PANEL_ID} .league-bar .league-bar-search{
        flex:1 1 120px;min-width:100px;max-width:220px;margin:0;padding:3px 8px;
        border-radius:6px;border:1px solid #475569;background:#1f2937;color:#e5e7eb;font-size:11px;
      }
      #${PANEL_ID} .league-bar .league-bar-toggle{
        margin:0;padding:3px 10px;border-radius:6px;border:1px solid #475569;
        background:#334155;color:#f3f4f6;cursor:pointer;font-size:11px;flex:0 0 auto;
      }
      #${PANEL_ID} .league-bar-selected{
        display:flex;align-items:flex-start;flex-wrap:wrap;gap:4px;max-height:52px;overflow-y:auto;
      }
      #${PANEL_ID} .league-bar-selected:empty{display:none}
      #${PANEL_ID} .league-bar-whitelist{
        display:flex;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;
        gap:4px;max-height:72px;overflow-y:auto;
        padding:2px 0;border-top:1px solid #1e293b;
      }
      #${PANEL_ID} .league-bar-whitelist:empty{display:none}
      #${PANEL_ID} .league-bar.search-focus{
        min-height:min(200px,34vh);
        max-height:min(360px,48vh);
        overflow:hidden;
      }
      #${PANEL_ID} .league-bar.search-focus .league-bar-whitelist{
        flex:0 0 auto;
        max-height:min(120px,20vh);
      }
      #${PANEL_ID} .league-bar-list{
        display:none;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;
        gap:4px;max-height:72px;overflow-y:auto;
        padding:2px 0;border-top:1px solid #1e293b;
      }
      #${PANEL_ID} .league-bar-list.expanded{display:flex}
      #${PANEL_ID} .league-bar.search-focus .league-bar-list{
        display:flex;
        flex:1 1 auto;
        min-height:0;
        max-height:min(240px,42vh);
      }
      #${PANEL_ID} .league-bar.search-focus .league-bar-selected{
        max-height:min(120px,20vh);
      }
      #${PANEL_ID} .league-bar button.league-btn{
        margin:0;padding:3px 8px;border-radius:999px;border:1px solid #475569;
        background:#1f2937;color:#d1d5db;cursor:pointer;font-size:11px;line-height:1.3;
        flex:0 0 auto;align-self:flex-start;height:auto;
      }
      #${PANEL_ID} .league-bar button.league-btn.active{
        border-color:#2563eb;background:#1d4ed8;color:#eff6ff;
      }
      #${PANEL_ID} .league-bar button.league-btn.hidden{display:none}
      #${PANEL_ID} .league-bar button.league-btn.whitelist{
        border-color:#166534;background:#14532d;color:#dcfce7;cursor:default;
      }
      #${PANEL_ID} .league-bar button.league-btn.whitelist:hover{filter:none}
      #${PANEL_ID} .league-bar button.league-btn:hover{filter:brightness(1.08)}
      #${PANEL_ID} .hdr button:disabled{opacity:.55;cursor:not-allowed}
    `;

    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    const title = document.createElement('strong');
    title.textContent = 'Flashscore | Debug';
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.id = 'fs-livescores-debug-count';
    sub.textContent = 'Top-5 / UCL / UEL / UECL / World Cup / Championship';
    const btnWrap = document.createElement('div');
    const btnUpload = document.createElement('button');
    btnUpload.type = 'button';
    btnUpload.dataset.action = 'upload';
    btnUpload.textContent = 'Upload';
    const btnRefresh = document.createElement('button');
    btnRefresh.type = 'button';
    btnRefresh.dataset.action = 'refresh';
    btnRefresh.textContent = 'Refresh';
    const btnToggle = document.createElement('button');
    btnToggle.type = 'button';
    btnToggle.dataset.action = 'toggle';
    btnToggle.textContent = 'Collapse';
    btnWrap.append(btnUpload, btnRefresh, btnToggle);
    hdr.append(title, sub, btnWrap);

    const uploadCfg = loadUploadConfig();
    const uploadBar = document.createElement('div');
    uploadBar.className = 'upload-bar';
    const envLabel = document.createElement('label');
    envLabel.textContent = '环境';
    const envSel = document.createElement('select');
    envSel.id = 'fs-livescores-upload-env';
    envSel.innerHTML = UPLOAD_ENVS.map((e) => `<option value="${e.id}">${e.label}</option>`).join('');
    envSel.value = uploadCfg.env;
    const urlLabel = document.createElement('label');
    urlLabel.textContent = '接口';
    const urlInp = document.createElement('input');
    urlInp.id = 'fs-livescores-upload-url';
    urlInp.type = 'url';
    urlInp.placeholder = UPLOAD_API_PATH;
    urlInp.value = getUploadUrl(uploadCfg);
    urlInp.title = '可编辑；按当前环境分别保存。HTTP 外站经 Tampermonkey 直连，无需 HTTPS/CORS';
    const uploadStatus = document.createElement('span');
    uploadStatus.id = 'fs-livescores-upload-status';
    uploadStatus.className = 'upload-status';
    uploadBar.append(envLabel, envSel, urlLabel, urlInp, uploadStatus);

    const leagueBar = document.createElement('div');
    leagueBar.className = 'league-bar';
    leagueBar.id = 'fs-livescores-league-bar';

    const leagueHead = document.createElement('div');
    leagueHead.className = 'league-bar-head';
    const leagueLabel = document.createElement('span');
    leagueLabel.className = 'league-bar-label';
    leagueLabel.textContent = '联赛';
    const leagueSummary = document.createElement('span');
    leagueSummary.className = 'league-bar-summary';
    const leagueSearch = document.createElement('input');
    leagueSearch.className = 'league-bar-search';
    leagueSearch.type = 'search';
    leagueSearch.placeholder = '搜索联赛...';
    leagueSearch.autocomplete = 'off';
    const leagueToggle = document.createElement('button');
    leagueToggle.type = 'button';
    leagueToggle.className = 'league-bar-toggle';
    leagueToggle.textContent = '展开';
    leagueHead.append(leagueLabel, leagueSummary, leagueSearch, leagueToggle);

    const leagueWhitelist = document.createElement('div');
    leagueWhitelist.className = 'league-bar-whitelist';
    const leagueSelected = document.createElement('div');
    leagueSelected.className = 'league-bar-selected';

    const leagueList = document.createElement('div');
    leagueList.className = 'league-bar-list';

    leagueBar.append(leagueHead, leagueWhitelist, leagueSelected, leagueList);

    leagueSearch.addEventListener('input', () => {
      if (leagueSearch.value.trim()) {
        leagueBarExpanded = true;
        saveLeagueBarExpanded();
      }
      syncLeagueBarListFilter(leagueBar);
      syncLeagueBarToggle(leagueBar);
      rerenderFromPrepared();
    });
    bindLeagueBarSearchFocus(leagueBar, leagueSearch);
    leagueToggle.addEventListener('click', () => {
      leagueBarExpanded = !leagueBarExpanded;
      saveLeagueBarExpanded();
      syncLeagueBarToggle(leagueBar);
    });

    const body = document.createElement('div');
    body.className = 'body';

    panel.append(style, hdr, uploadBar, leagueBar, body);
    document.body.appendChild(panel);

    envSel.addEventListener('change', () => {
      const cfg = loadUploadConfig();
      const url = String(urlInp.value || '').trim();
      if (url) cfg[cfg.env] = url;
      cfg.env = normalizeUploadEnv(envSel.value);
      saveUploadConfig(cfg);
      urlInp.value = getUploadUrl(cfg);
    });
    urlInp.addEventListener('change', () => readUploadConfigFromPanel());
    urlInp.addEventListener('blur', () => readUploadConfigFromPanel());

    btnUpload.addEventListener('click', () => uploadRows());
    btnRefresh.addEventListener('click', () => scheduleParse(0));
    btnToggle.addEventListener('click', () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      uploadBar.style.display = hidden ? '' : 'none';
      if (leagueBar.dataset.hasLeagues === '1') leagueBar.style.display = hidden ? 'flex' : 'none';
      btnToggle.textContent = hidden ? 'Collapse' : 'Expand';
    });
    return panel;
  }

  let leagueBarSearchBlurTimer = null;

  function patchLeagueBarPanel(panel) {
    const leagueBar = panel?.querySelector('#fs-livescores-league-bar');
    if (!leagueBar) return;
    ensureLeagueBarWhitelistWrap(leagueBar);
    const leagueSearch = leagueBar.querySelector('.league-bar-search');
    if (leagueSearch) bindLeagueBarSearchFocus(leagueBar, leagueSearch);
  }

  function bindLeagueBarSearchFocus(leagueBar, leagueSearch) {
    if (leagueBar.dataset.focusBound === '1') return;
    leagueBar.dataset.focusBound = '1';
    leagueSearch.addEventListener('focus', () => {
      clearTimeout(leagueBarSearchBlurTimer);
      leagueBar.classList.add('search-focus');
      leagueBarExpanded = true;
      saveLeagueBarExpanded();
      const list = leagueBar.querySelector('.league-bar-list');
      if (list) list.classList.add('expanded');
      syncLeagueBarToggle(leagueBar);
    });
    leagueSearch.addEventListener('blur', () => {
      clearTimeout(leagueBarSearchBlurTimer);
      leagueBarSearchBlurTimer = setTimeout(() => {
        if (leagueBar.contains(document.activeElement)) return;
        leagueBar.classList.remove('search-focus');
      }, 150);
    });
    leagueBar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.league-bar-whitelist, .league-bar-list, .league-bar-selected, .league-btn')) {
        clearTimeout(leagueBarSearchBlurTimer);
        e.preventDefault();
      }
    });
  }

  function createWhitelistLeagueBtn(item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'league-btn whitelist';
    btn.dataset.leagueKey = item.label;
    btn.dataset.leagueCountry = item.country || '';
    btn.dataset.leagueName = item.league || '';
    btn.textContent = `${item.label} (${item.count})`;
    btn.title = item.label;
    return btn;
  }

  function createLeagueBtn(item, { selected = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'league-btn';
    btn.dataset.leagueKey = item.label;
    btn.dataset.leagueCountry = item.country || '';
    btn.dataset.leagueName = item.league || '';
    btn.textContent = `${item.label} (${item.count})`;
    btn.title = item.label;
    if (selected) btn.classList.add('active');
    btn.addEventListener('click', () => toggleExtraLeague(item.label));
    return btn;
  }

  function syncLeagueBarListFilter(leagueBar) {
    const q = String(leagueBar.querySelector('.league-bar-search')?.value || '')
      .trim()
      .toLowerCase();
    leagueBar
      .querySelectorAll('.league-bar-whitelist .league-btn, .league-bar-list .league-btn')
      .forEach((btn) => {
        const blob = leagueLabelSearchBlob(
          btn.dataset.leagueKey,
          btn.dataset.leagueCountry,
          btn.dataset.leagueName
        );
        btn.classList.toggle('hidden', q.length > 0 && !blob.includes(q));
      });
  }

  function syncLeagueBarToggle(leagueBar) {
    const list = leagueBar.querySelector('.league-bar-list');
    const toggle = leagueBar.querySelector('.league-bar-toggle');
    const searchQ = String(leagueBar.querySelector('.league-bar-search')?.value || '').trim();
    const n = lastNonTargetLeagues.length;
    if (!list || !toggle) return;

    if (n <= LEAGUE_BAR_AUTO_COLLAPSE_N || searchQ || leagueBar.classList.contains('search-focus')) {
      leagueBarExpanded = true;
      list.classList.add('expanded');
      toggle.style.display = 'none';
      return;
    }

    toggle.style.display = '';
    list.classList.toggle('expanded', leagueBarExpanded);
    toggle.textContent = leagueBarExpanded ? '收起' : `展开 (${n})`;
  }

  function syncLeagueBarSummary(leagueBar) {
    const summary = leagueBar.querySelector('.league-bar-summary');
    if (!summary) return;
    const wn = lastWhitelistLeagues.length;
    const n = lastNonTargetLeagues.length;
    const sel = selectedExtraLeagues.size;
    const parts = [];
    if (wn) parts.push(`默认 ${wn}`);
    if (n) parts.push(`其他 ${n}${sel ? ` · 已选 ${sel}` : ''}`);
    summary.textContent = parts.join(' · ');
  }

  function renderLeagueBarWhitelist(leagueBar) {
    const wrap = leagueBar.querySelector('.league-bar-whitelist');
    if (!wrap) return;
    wrap.replaceChildren();
    for (const item of lastWhitelistLeagues) {
      wrap.appendChild(createWhitelistLeagueBtn(item));
    }
    syncLeagueBarListFilter(leagueBar);
  }

  function renderLeagueBarSelected(leagueBar) {
    const selectedWrap = leagueBar.querySelector('.league-bar-selected');
    if (!selectedWrap) return;
    selectedWrap.replaceChildren();
    for (const item of lastNonTargetLeagues) {
      if (!selectedExtraLeagues.has(item.label)) continue;
      selectedWrap.appendChild(createLeagueBtn(item, { selected: true }));
    }
  }

  function renderLeagueBarList(leagueBar) {
    const list = leagueBar.querySelector('.league-bar-list');
    if (!list) return;
    list.replaceChildren();
    for (const item of lastNonTargetLeagues) {
      if (selectedExtraLeagues.has(item.label)) continue;
      list.appendChild(createLeagueBtn(item));
    }
    syncLeagueBarListFilter(leagueBar);
  }

  function syncLeagueBarVisibility(leagueBar) {
    if (!leagueBar || leagueBar.id !== 'fs-livescores-league-bar') return;
    const panel = document.getElementById(PANEL_ID);
    const bodyHidden = panel?.querySelector('.body')?.style.display === 'none';
    leagueBar.style.display = !bodyHidden && leagueBar.dataset.hasLeagues === '1' ? 'flex' : 'none';
  }

  function ensureLeagueBarWhitelistWrap(leagueBar) {
    if (leagueBar.querySelector('.league-bar-whitelist')) return;
    const wrap = document.createElement('div');
    wrap.className = 'league-bar-whitelist';
    const selected = leagueBar.querySelector('.league-bar-selected');
    if (selected) leagueBar.insertBefore(wrap, selected);
    else leagueBar.appendChild(wrap);
  }

  function updateLeagueBar(prepared) {
    const panel = document.getElementById(PANEL_ID);
    const leagueBar = panel?.querySelector('#fs-livescores-league-bar');
    if (!leagueBar) return;

    ensureLeagueBarWhitelistWrap(leagueBar);
    lastWhitelistLeagues = getWhitelistLeagues(prepared);
    lastNonTargetLeagues = getNonTargetLeagues(prepared);

    if (!lastWhitelistLeagues.length && !lastNonTargetLeagues.length) {
      leagueBar.dataset.hasLeagues = '0';
      leagueBar.style.display = 'none';
      leagueBar.querySelector('.league-bar-whitelist')?.replaceChildren();
      leagueBar.querySelector('.league-bar-selected')?.replaceChildren();
      leagueBar.querySelector('.league-bar-list')?.replaceChildren();
      syncLeagueBarSummary(leagueBar);
      return;
    }

    leagueBar.dataset.hasLeagues = '1';
    if (lastNonTargetLeagues.length <= LEAGUE_BAR_AUTO_COLLAPSE_N) leagueBarExpanded = true;

    syncLeagueBarSummary(leagueBar);
    renderLeagueBarWhitelist(leagueBar);
    renderLeagueBarSelected(leagueBar);
    renderLeagueBarList(leagueBar);
    syncLeagueBarToggle(leagueBar);
    syncLeagueBarVisibility(leagueBar);
  }

  function renderPanel(rows, opts) {
    const panel = ensurePanel();
    const body = panel.querySelector('.body');
    const subtitle = opts?.subtitle || displaySubtitle(rows.length);
    updatePanelSubtitle(subtitle);
    body.style.display = '';
    const leagueBar = panel.querySelector('#fs-livescores-league-bar');
    if (leagueBar) syncLeagueBarVisibility(leagueBar);
    body.replaceChildren();
    if (!rows.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = opts?.emptyMessage || 'Empty';
      body.appendChild(d);
      return;
    }
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Country', 'League', 'Kickoff', 'Home', 'Score', 'Away', 'Link'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      [r.country, r.league, r.kickoff, r.home, r.score, r.away].forEach((t) => {
        const td = document.createElement('td');
        td.textContent = t || '';
        tr.appendChild(td);
      });
      const tdL = document.createElement('td');
      if (r.link) {
        const a = document.createElement('a');
        a.href = r.link;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = r.link;
        tdL.appendChild(a);
      }
      tr.appendChild(tdL);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    body.appendChild(table);
  }

  function onRouteChange() {
    if (!isListPage()) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    onContentMaybeChanged(true);
  }

  function watchDateControls() {
    document.addEventListener(
      'click',
      (e) => {
        const el = e.target.closest?.('button, a, [role="option"], [role="combobox"]');
        if (!el) return;
        const label = `${el.textContent || ''} ${el.getAttribute?.('aria-label') || ''}`;
        if (/previous day|next day|today|calendar|datepicker|\d{1,2}\/\d{1,2}/i.test(label)) {
          onContentMaybeChanged(true);
        }
      },
      true
    );
  }

  function watchLiveTableDom() {
    const attach = () => {
      const root =
        document.getElementById('live-table') ||
        document.querySelector('.container__liveTableWrapper') ||
        document.querySelector('main');
      if (!root) return false;
      new MutationObserver(() => {
        clearTimeout(domWatchTimer);
        domWatchTimer = setTimeout(() => onContentMaybeChanged(false), PARSE_DEBOUNCE_MS);
      }).observe(root, { childList: true, subtree: true });
      return true;
    };
    if (!attach()) setTimeout(attach, 500);
  }

  function hookHistory() {
    const wrap = (fn) =>
      function (...args) {
        const ret = fn.apply(this, args);
        setTimeout(onRouteChange, 0);
        return ret;
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
  }

  function boot() {
    if (!isListPage()) return;

    injectFeedHookEarly();
    window.addEventListener('fs-parse-result', onParseResult);
    setupBridgeObserver();
    injectPageParser();
    watchDateControls();
    watchLiveTableDom();
    hookHistory();
    window.addEventListener('popstate', onRouteChange);
    window.addEventListener('hashchange', onRouteChange);
    setInterval(() => {
      if (!isListPage()) return;
      onContentMaybeChanged(false);
    }, 5000);

    const start = () => {
      ensurePanel();
      lastFingerprint = pageFingerprint();
      onContentMaybeChanged(true);
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
    window.addEventListener('load', () => onContentMaybeChanged(true), { once: true });
  }

  boot();
})();
