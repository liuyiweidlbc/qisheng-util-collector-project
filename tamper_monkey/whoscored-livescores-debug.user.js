// ==UserScript==
// @name         WhoScored Livescores Debug
// @namespace    https://www.whoscored.com/
// @version      1.10.15
// @description  WhoScored livescores: top-5, UCL, UEL, UECL(欧协,含决赛阶段), World Cup, Championship + extra leagues
// @match        https://www.whoscored.com/livescores*
// @match        http://www.whoscored.com/livescores*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const LOG_PREFIX = '[WhoScored Livescores]';
  const PANEL_ID = 'ws-livescores-debug-panel';
  const SCRIPT_VER = '1.10.15';
  const EXTRA_LEAGUE_CFG_KEY = 'ws-livescores-extra-leagues';
  const LEAGUE_BAR_EXPANDED_KEY = 'ws-livescores-league-bar-expanded';
  const LEAGUE_BAR_AUTO_COLLAPSE_N = 8;
  const UPLOAD_TIMEOUT_MS = 30000;
  const AUTO_UPLOAD_DELAY_MS = 3000;
  const SOURCE_SITE = 'whoscored';
  const UPLOAD_CFG_KEY = 'ws-livescores-upload-cfg';
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
    /\b(women|woman|frauen|feminine|femenin|femminil|feminino|female|girls|u19|u20|u21|u23|youth|junior|reserve|amateur)\b/i;
  const MAX_FIELD_LEN = 100;
  const MAX_LINK_LEN = 512;
  const REFRESH_RE = /Refreshing\s*in/i;
  const PAGE_DUMP_RE = /AllIn\s*Play|UpcomingOdds|Refreshing\s*in/i;
  const SCORE_RE = /^\s*(\d+)\s*[-\u2013]\s*(\d+)\s*$|^\s*(\d+)\s+(\d+)\s*$/;
  const TIME_RE = /^\s*(FT|HT|AET|Pen|Postp\.?|\d{1,2}:\d{2}|\d{1,3}'?)\s*$/i;
  const NOISE_RE = /refreshing|today\s*\u25bc|all\s*in\s*play|upcoming|odds|1x2/i;
  const KICKOFF_NOISE_RE = /[Pp]remier|[Ll]eague|Copa|England\s*-|Spain\s*-|Germany\s*-|Italy\s*-|France\s*-/;

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
  let lastApiCache = [];
  let lastApiVersion = '0';
  let lastLoadedDate = '';
  /** 上次与地址栏同步的 d=；<> 换日时 URL 常不变，不能一直信 urlDate */
  let lastSyncedUrlDate = '';
  let lastHookedRequestDate = '';
  /** matchId -> 最完整 link（slug），避免 API 刷新把长链接盖回 /show */
  const bestLinkByMatchId = new Map();
  const FULL_SNAPSHOT_MIN = 15;
  /** 默认白名单必须包含欧协 / UECL（含 Conference League Final Stage 等） */
  const UECL_LEAGUE_RE =
    /\b(UECL|Europa\s*Conference|Conference\s*League)\b/i;
  const UECL_LABEL_RE = /Europe\s*-\s*.*\bConference\b/i;

  function leagueFilterLabel(country, league) {
    const c = String(country || '').trim();
    const l = String(league || '').trim();
    if (c && l) return `${c} - ${l}`;
    return l || c;
  }

  function isUeclLeague(country, league) {
    const n = leagueFilterLabel(country, league);
    if (!n) return false;
    if (UECL_LEAGUE_RE.test(n)) return true;
    if (UECL_LABEL_RE.test(n)) return true;
    const c = String(country || '').trim();
    const l = String(league || '').trim();
    if (/^Europe$/i.test(c) && /\bConference\b/i.test(l)) return true;
    return false;
  }

  function isAllowedLeague(country, league) {
    const n = leagueFilterLabel(country, league);
    if (!n) return false;
    if (EXCLUDE_COMP_RE.test(n)) return false;

    if (/England\s*-\s*Premier\s*League/i.test(n)) return true;
    if (/England\s*-\s*Championship/i.test(n)) return true;
    if (/Spain\s*-\s*La\s*Liga/i.test(n) && !/La\s*Liga\s*2/i.test(n)) return true;
    if (/Italy\s*-\s*Serie\s*A/i.test(n) && !/Serie\s*B/i.test(n)) return true;
    if (/Germany\s*-\s*Bundesliga/i.test(n) && !/2\.\s*Bundesliga/i.test(n)) return true;
    if (/France\s*-\s*Ligue\s*1/i.test(n) && !/Ligue\s*2/i.test(n)) return true;
    if (/\bChampions\s*League\b/i.test(n) && !/AFC|CAF/i.test(n)) return true;
    if (/\bEuropa\s*League\b/i.test(n) && !/Conference/i.test(n)) return true;
    if (isUeclLeague(country, league)) return true;
    if (/\bWorld\s*Cup\b/i.test(n) && !/women|u20|u17/i.test(n)) return true;
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
    if (/spain|la liga/.test(n) && /la liga/.test(n) && !/la liga 2/.test(n)) extras.push('laliga');
    if (/italy|serie a/.test(n) && !/serie b/.test(n)) extras.push('serie a', 'seriea');
    if (/germany|bundesliga/.test(n) && !/2\.\s*bundesliga/.test(n)) extras.push('bundesliga');
    if (/france|ligue 1/.test(n) && !/ligue 2/.test(n)) extras.push('ligue 1', 'ligue1');
    if (/champions league/.test(n)) extras.push('ucl', 'champions');
    if (/europa league/.test(n) && !/conference/.test(n)) extras.push('uel', 'europa');
    if (/conference league|europa conference|uecl/i.test(n)) extras.push('uecl', 'conference', '欧协', '欧协联');
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
    return `${rowCount} matches | ${formatDateParamLabel(lastLoadedDate)} | filtered leagues${extraHint}`;
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

  function splitCountryLeague(combined) {
    const s = String(combined || '').trim();
    if (!s) return { country: '', league: '' };
    const m = s.match(/^(.+?)\s*-\s*(.+)$/);
    if (m) return { country: m[1].trim(), league: m[2].trim() };
    return { country: '', league: s };
  }

  function parseTournamentMeta(block, parentMeta) {
    if (!block || typeof block !== 'object') return { country: '', league: '' };
    const country =
      pickString(block.regionName, block.RegionName) || String(parentMeta?.country || '').trim();
    const tournament = pickString(block.tournamentName, block.TournamentName, block.name, block.Name);
    const stage = pickString(block.stageName, block.StageName);
    let league = tournament || stage || '';

    const blob = `${parentMeta?.country || ''} ${parentMeta?.league || ''} ${country} ${tournament} ${stage}`.toLowerCase();
    const ueclContext = /conference|uecl|europa\s*conference/.test(blob);

    if (tournament && stage && !tournament.includes(stage)) league = `${tournament} ${stage}`.trim();
    else if (!tournament && stage) league = stage;

    if (ueclContext && league && !/conference/i.test(league)) {
      const parentLeague = String(parentMeta?.league || '').trim();
      if (/conference\s*league/i.test(parentLeague)) {
        league = `${parentLeague} ${stage || league}`.replace(/\s+/g, ' ').trim();
      } else {
        league = `Conference League ${league}`.replace(/\s+/g, ' ').trim();
      }
    }

    return { country, league };
  }

  function isValidTeamName(name) {
    const s = String(name || '').trim();
    if (!s || s.length > 60) return false;
    if (NOISE_RE.test(s)) return false;
    if (/^\d+(\.\d+)?$/.test(s)) return false;
    if (/^[-\u2013\s]+$/.test(s)) return false;
    if (s.includes('\u25bc')) return false;
    return true;
  }

  function formatDateOnly(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function getPageDateFallback() {
    try {
      const d = new URL(location.href).searchParams.get('d');
      if (d && /^\d{8}$/.test(d)) {
        return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      }
    } catch {
      /* ignore */
    }
    return formatDateOnly(new Date());
  }

  function tryParseDateHeader(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 80 || NOISE_RE.test(t)) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(t) || (/\b\d{4}\b/.test(t) && /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t))) {
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) return formatDateOnly(d);
    }
    return '';
  }

  /** Kickoff: YYYY-MM-DD HH:MM or YYYY-MM-DD status */
  function normalizeKickoff(raw, dateContext) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.length > 40 || REFRESH_RE.test(s) || PAGE_DUMP_RE.test(s)) return '';
    if (KICKOFF_NOISE_RE.test(s) && !/^\d{4}-\d{2}-\d{2}/.test(s)) return '';

    const full = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})$/);
    if (full) return `${full[1]} ${full[2]}`;

    const fullStatus = s.match(/^(\d{4}-\d{2}-\d{2})\s+(FT|HT|AET|\d{1,3}'?)$/i);
    if (fullStatus) return `${fullStatus[1]} ${fullStatus[2]}`;

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const embedded = tryParseDateHeader(s);
    if (embedded) {
      const tm = s.match(/\b(\d{1,2}:\d{2})\b/);
      if (tm) return `${embedded} ${tm[1]}`;
      if (/^(FT|HT|AET|\d{1,3}'?)$/i.test(s)) return `${embedded} ${s}`;
      return embedded;
    }

    const ctx = dateContext || '';

    if (/^\d{1,2}:\d{2}$/.test(s)) return ctx ? `${ctx} ${s}` : s;

    if (/^(FT|HT|AET|\d{1,3}'?)$/i.test(s)) return ctx ? `${ctx} ${s}` : s;

    const tm = s.match(/\b(\d{1,2}:\d{2})\b/);
    if (tm && ctx) return `${ctx} ${tm[1]}`;

    return '';
  }

  function isValidKickoff(k) {
    if (!k) return true;
    return /^\d{4}-\d{2}-\d{2}(\s+\S+)?$/.test(k) || /^\d{1,2}:\d{2}$/.test(k) || /^(FT|HT|AET|\d{1,3}'?)$/i.test(k);
  }

  function trimField(value, maxLen) {
    const s = String(value || '').trim();
    if (!s || s.length > maxLen || PAGE_DUMP_RE.test(s)) return '';
    return s;
  }

  function normalizeCountryLeague(r) {
    let country = trimField(r.country, 60);
    let league = trimField(r.league, 120);
    if (!country && league && /\s-\s/.test(league)) {
      const split = splitCountryLeague(league);
      country = trimField(split.country, 60);
      league = trimField(split.league, 120);
    }
    return { country, league };
  }

  function isValidRow(r) {
    const { country, league } = normalizeCountryLeague(r);
    const home = String(r.home || '');
    const away = String(r.away || '');
    const kickoff = String(r.kickoff || '');
    const score = String(r.score || '');
    if (PAGE_DUMP_RE.test(country + league + home + away + kickoff + score)) return false;
    if (/PlayUpcoming|UpcomingOdds|AllIn\s*Play/i.test(league + country)) return false;
    return (
      isValidTeamName(home) &&
      isValidTeamName(away) &&
      league.length > 0 &&
      league.length <= 80 &&
      country.length <= 60 &&
      !NOISE_RE.test(league) &&
      !NOISE_RE.test(country) &&
      isValidKickoff(kickoff) &&
      isValidScore(score) &&
      [country, league, home, away, kickoff, score].every((f) => String(f || '').length <= MAX_FIELD_LEN) &&
      String(r.link || '').length <= MAX_LINK_LEN
    );
  }

  function sanitizeRows(rows) {
    return rows
      .map((r) => {
        const { country, league } = normalizeCountryLeague(r);
        return {
          ...r,
          country,
          league,
          kickoff: normalizeKickoff(r.kickoff),
          home: trimField(r.home, 60),
          away: trimField(r.away, 60),
          score: normalizeScore(r.score),
          link: cleanMatchLink(trimField(r.link, MAX_LINK_LEN)),
        };
      })
      .filter(isValidRow);
  }

  function rowKey(row) {
    return [row.country, row.league, row.kickoff, row.home, row.score, row.away, row.link].join('|');
  }

  function matchIdFromRow(row) {
    const m = String(row.link || '').match(/\/matches\/(\d+)/i);
    return m ? m[1] : '';
  }

  function rowsSignature(rows) {
    return rows.map((r) => matchIdFromRow(r) + ':' + r.score + ':' + r.kickoff + ':' + r.home).join(';');
  }

  function dedupeRows(rows) {
    const seen = new Set();
    return rows.filter((r) => {
      const k = matchIdFromRow(r) || [r.country, r.league, r.home, r.away].join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function absUrl(href) {
    try {
      return new URL(href, location.origin).href;
    } catch {
      return href || '';
    }
  }

  /** 比赛详情 link 去掉 #comments-panel 等 hash，避免 UPSERT 键不一致 */
  function cleanMatchLink(href) {
    const url = absUrl(href);
    if (!url || !/\/matches\/\d+/i.test(url)) return url;
    try {
      const u = new URL(url);
      u.hash = '';
      return u.href;
    } catch {
      return url.replace(/#.*$/, '');
    }
  }

  function parseDotNetDate(value) {
    if (value == null || value === '') return null;
    const m = String(value).match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
    if (m) return new Date(Number(m[1]));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatKickoff(date) {
    if (!date) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function parseScoreText(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 12) return null;
    if (PAGE_DUMP_RE.test(t) || NOISE_RE.test(t)) return null;
    if (t === '-' || t === '- -' || t === '\u2013' || t === '--') return '';
    const m = t.match(SCORE_RE);
    if (!m) return null;
    if (m[1] != null) return `${m[1]}-${m[2]}`;
    return `${m[3]}-${m[4]}`;
  }

  /** Score: empty or short forms like 0-0, 1-2 */
  function normalizeScore(raw) {
    const parsed = parseScoreText(raw);
    if (parsed !== null) return parsed;
    return '';
  }

  function isValidScore(s) {
    return normalizeScore(s) === String(s || '').trim();
  }

  /** Match countdown refresh text only; do not scan full page */
  function isPageRefreshing() {
    const head = (document.body?.innerText || '').slice(0, 600);
    return REFRESH_RE.test(head);
  }

  function isFullSnapshot(rows) {
    return rows.length >= FULL_SNAPSHOT_MIN;
  }

  function rowsLookCorrupt(rows) {
    return rows.some((r) => {
      const blob = [r.country, r.league, r.kickoff, r.home, r.away, r.score, r.link].join(' ');
      return PAGE_DUMP_RE.test(blob) || REFRESH_RE.test(blob) || String(r.score || '').length > 12;
    });
  }

  function filterDisplayRows(rows) {
    return rows.filter((r) => isValidRow(r) && !rowsLookCorrupt([r]));
  }

  function pickString(...vals) {
    for (const v of vals) {
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (v && typeof v === 'object' && typeof v.name === 'string' && v.name.trim()) return v.name.trim();
    }
    return '';
  }

  function pickNumber(...vals) {
    for (const v of vals) {
      if (v === 0 || (v != null && v !== '' && !Number.isNaN(Number(v)))) return Number(v);
    }
    return null;
  }

  function slugFromMatchUrl(url) {
    const m = String(url || '').match(/\/matches\/\d+\/(?:show|live)\/([^/?#]+)/i);
    return m ? m[1] : '';
  }

  function matchLinkScore(link) {
    const s = String(link || '');
    if (!/\/matches\/\d+/i.test(s)) return 0;
    if (/\/matches\/\d+\/show\/[^/?#]+/i.test(s)) return 1000 + s.length;
    if (/\/matches\/\d+\/live\/[^/?#]+/i.test(s)) return 900 + s.length;
    if (/\/matches\/\d+\/show\/?$/i.test(s)) return 100 + s.length;
    return s.length;
  }

  function pickBetterMatchLink(a, b) {
    a = cleanMatchLink(a);
    b = cleanMatchLink(b);
    const sa = matchLinkScore(a);
    const sb = matchLinkScore(b);
    if (sb > sa) return b || a || '';
    if (sa > sb) return a || b || '';
    return a || b || '';
  }

  function rememberBestLinks(rows) {
    for (const r of rows) {
      const id = matchIdFromRow(r);
      if (!id || !r.link) continue;
      bestLinkByMatchId.set(id, pickBetterMatchLink(r.link, bestLinkByMatchId.get(id)));
    }
  }

  function applyPersistedLinks(rows) {
    return rows.map((r) => {
      const id = matchIdFromRow(r);
      if (!id) return r;
      const best = bestLinkByMatchId.get(id);
      if (!best) return r;
      const link = pickBetterMatchLink(r.link, best);
      return link !== r.link ? { ...r, link } : r;
    });
  }

  function mergeRowWithDom(apiRow, domRow) {
    const apiLabel = leagueFilterLabel(apiRow.country, apiRow.league);
    const domLabel = leagueFilterLabel(domRow.country, domRow.league);
    const preferDomLeague = isUeclLeague(domRow.country, domRow.league) && !isUeclLeague(apiRow.country, apiRow.league);
    const preferDomMeta =
      preferDomLeague ||
      (domLabel.length > apiLabel.length && (isUeclLeague(domRow.country, domRow.league) || /final\s*stage/i.test(domLabel)));

    return {
      country: preferDomMeta ? domRow.country || apiRow.country : apiRow.country || domRow.country,
      league: preferDomMeta ? domRow.league || apiRow.league : apiRow.league || domRow.league,
      kickoff: normalizeKickoff(apiRow.kickoff) || domRow.kickoff || '',
      home: apiRow.home || domRow.home || '',
      away: apiRow.away || domRow.away || '',
      score: normalizeScore(apiRow.score) || normalizeScore(domRow.score) || '',
      link: pickBetterMatchLink(apiRow.link, domRow.link),
      source: apiRow.source || domRow.source || 'api',
    };
  }

  /** API 漏掉的场次（尤其欧协决赛）从页面 DOM 补全 */
  function mergeMissingDomRows(rows) {
    const domRows = parseFromDom();
    if (!domRows.length) return rows;
    const map = new Map();
    rows.forEach((r) => map.set(matchIdFromRow(r) || rowKey(r), r));
    let added = 0;
    let ueclPatched = 0;
    for (const dom of domRows) {
      const key = matchIdFromRow(dom) || rowKey(dom);
      if (!key) continue;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...dom, source: dom.source || 'dom' });
        added += 1;
        if (isUeclLeague(dom.country, dom.league)) ueclPatched += 1;
        continue;
      }
      const merged = mergeRowWithDom(prev, dom);
      if (merged.league !== prev.league || merged.country !== prev.country) {
        if (isUeclLeague(merged.country, merged.league)) ueclPatched += 1;
        map.set(key, merged);
      }
    }
    if (added || ueclPatched) {
      console.log(LOG_PREFIX, 'DOM merge', { added, ueclPatched, total: map.size });
    }
    return [...map.values()];
  }

  function prepareRowsFromCache(rows) {
    return applyPersistedLinks(enrichRowsWithDomLinks(mergeMissingDomRows(rows)));
  }

  function finalizeCacheRows(rows) {
    const out = sanitizeRows(prepareRowsFromCache(rows));
    rememberBestLinks(out);
    return out;
  }

  function matchUrlFromId(id, slug) {
    if (!id) return '';
    const base = `${location.origin}/matches/${id}/show`;
    const s = String(slug || '')
      .trim()
      .replace(/^\/+|\/+$/g, '');
    return s ? `${base}/${s}` : base;
  }

  function normalizeMatchLink(rawUrl, id, slug) {
    const raw = String(rawUrl || '').trim();
    if (raw && /\/matches\/\d+\/show\/[^/?#]+/i.test(raw)) return cleanMatchLink(raw);
    if (raw && /\/matches\/\d+\/live\/[^/?#]+/i.test(raw)) {
      return cleanMatchLink(raw.replace(/\/live\//i, '/show/'));
    }
    const sid = id || (raw.match(/\/matches\/(\d+)/i) || [])[1];
    const sl = String(slug || '').trim() || slugFromMatchUrl(raw);
    if (sid) return matchUrlFromId(sid, sl);
    if (raw) return cleanMatchLink(raw);
    return '';
  }

  function enrichRowsWithDomLinks(rows) {
    const root = getLivescoreRoot();
    if (!root || !rows.length) return applyPersistedLinks(rows);
    const linkById = new Map();
    root.querySelectorAll('a[href*="/matches/"]').forEach((a) => {
      const href = cleanMatchLink(a.getAttribute('href') || a.href || '');
      const m = href.match(/\/matches\/(\d+)/i);
      if (!m) return;
      linkById.set(m[1], pickBetterMatchLink(href, linkById.get(m[1])));
    });
    return rows.map((r) => {
      const id = matchIdFromRow(r);
      if (!id) return r;
      const domLink = linkById.get(id);
      const persisted = bestLinkByMatchId.get(id);
      const link = pickBetterMatchLink(r.link, pickBetterMatchLink(domLink, persisted));
      return link !== r.link ? { ...r, link } : r;
    });
  }

  function pushEventRow(rows, country, league, ev) {
    if (!ev || typeof ev !== 'object') return;
    const id = pickNumber(ev.id, ev.Id, ev.eventId, ev.EventId, ev.matchId, ev.MatchId);
    const home = pickString(ev.homeTeamName, ev.HomeTeamName, ev.homeTeam, ev.HomeTeam);
    const away = pickString(ev.awayTeamName, ev.AwayTeamName, ev.awayTeam, ev.AwayTeam);
    if (!isValidTeamName(home) || !isValidTeamName(away)) return;

    const hs = pickNumber(ev.homeScore, ev.HomeScore, ev.homeGoals, ev.HomeGoals);
    const as = pickNumber(ev.awayScore, ev.AwayScore, ev.awayGoals, ev.AwayGoals);
    let score =
      hs != null && as != null
        ? normalizeScore(`${hs}-${as}`)
        : normalizeScore(ev.scoreText || ev.ScoreText || '');

    const startDate = parseDotNetDate(
      ev.startTimeUtc || ev.StartTimeUtc || ev.startTime || ev.StartTime || ev.kickOffTime
    );
    let kickoff = normalizeKickoff(
      formatKickoff(startDate) || pickString(ev.kickOff, ev.KickOff, ev.startTimeText)
    );
    if (!kickoff) {
      const elapsed = pickString(ev.elapsed, ev.Elapsed);
      const day = startDate ? formatDateOnly(startDate) : getPageDateFallback();
      if (elapsed) kickoff = normalizeKickoff(`${day} ${elapsed}`);
    }

    const rawUrl = pickString(ev.url, ev.Url, ev.link, ev.Link, ev.matchUrl, ev.MatchUrl);
    const slug = pickString(ev.slug, ev.Slug, ev.matchSlug, ev.MatchSlug, ev.eventSlug) || slugFromMatchUrl(rawUrl);
    const link = normalizeMatchLink(rawUrl, id, slug);

    rows.push({
      country: country || '',
      league: league || '',
      kickoff,
      home,
      score,
      away,
      link: cleanMatchLink(link),
      source: 'api',
    });
  }

  function nestedTournamentLists(block) {
    const out = [];
    for (const key of ['stages', 'Stages', 'children', 'Children', 'groups', 'Groups', 'tournaments', 'Tournaments']) {
      const v = block[key];
      if (Array.isArray(v)) out.push(v);
    }
    return out;
  }

  function parseTournamentBlock(block, rows, parentMeta) {
    if (!block || typeof block !== 'object') return;
    const meta = parseTournamentMeta(block, parentMeta);
    const events = block.events || block.Events || block.matches || block.Matches || block.fixtures || [];
    if (Array.isArray(events)) {
      events.forEach((ev) => pushEventRow(rows, meta.country, meta.league, ev));
    }
    for (const list of nestedTournamentLists(block)) {
      for (const child of list) parseTournamentBlock(child, rows, meta);
    }
  }

  function parseFromApiPayload(data) {
    const rows = [];
    const list = Array.isArray(data)
      ? data
      : data?.tournaments || data?.Tournaments || data?.stages || data?.Stages || [];

    if (!Array.isArray(list)) return [];

    for (const block of list) parseTournamentBlock(block, rows, null);
    return sanitizeRows(dedupeRows(rows));
  }

  function isLivescoreDataUrl(url) {
    return /livescores\/data/i.test(String(url || ''));
  }

  function parseFromDom() {
    const root = getLivescoreRoot();
    if (!root) return [];
    const rows = [];
    const seen = new Set();
    root.querySelectorAll('a[href*="/matches/"]').forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      const m = href.match(/\/matches\/(\d+)/i);
      if (!m || seen.has(m[1])) return;
      const row = parseMatchBox(anchor, root);
      if (!row) return;
      seen.add(m[1]);
      rows.push(row);
    });
    return sanitizeRows(dedupeRows(rows));
  }

  function tryDomFallback() {
    if (lastApiCache.length) return false;
    const domRows = parseFromDom();
    if (!domRows.length) return false;
    lastApiCache = finalizeCacheRows(domRows);
    console.log(LOG_PREFIX, 'DOM fallback', domRows.length, 'rows');
    return true;
  }

  function getLivescoreRoot() {
    const h1 = [...document.querySelectorAll('h1')].find((el) =>
      /live\s*scores/i.test(el.textContent || '')
    );
    return (
      document.querySelector('#livescore') ||
      document.querySelector('[data-testid="livescores"]') ||
      h1?.parentElement ||
      document.querySelector('main') ||
      null
    );
  }

  function leagueBeforeElement(el, root) {
    const tournaments = [...root.querySelectorAll('a[href*="/tournaments/"][href*="/show/"]')];
    let league = '';
    for (const t of tournaments) {
      if (t.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) {
        league = (t.textContent || '').trim();
      }
    }
    return league;
  }

  function dateBeforeElement(el, root) {
    let node = el;
    while (node && root.contains(node)) {
      let sib = node.previousElementSibling;
      while (sib) {
        const d = tryParseDateHeader(sib.textContent);
        if (d) return d;
        for (const child of sib.querySelectorAll?.('h2, h3, h4, span, div') || []) {
          const cd = tryParseDateHeader(child.textContent);
          if (cd) return cd;
        }
        sib = sib.previousElementSibling;
      }
      node = node.parentElement;
    }
    return getPageDateFallback();
  }

  function collectKickoffCandidates(el, out) {
    if (!el) return;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 12) return;
    if (/^\d{1,2}:\d{2}$/.test(t)) out.push(t);
    else if (/^(FT|HT|AET|\d{1,3}'?)$/i.test(t)) out.push(t);
    else if (TIME_RE.test(t)) out.push(t);
  }

  function extractKickoffFromBox(box, root) {
    const dateCtx = dateBeforeElement(box, root);
    const candidates = [];

    box.querySelectorAll('a, span, time').forEach((node) => collectKickoffCandidates(node, candidates));

    let sib = box.previousElementSibling;
    for (let i = 0; i < 5 && sib; i++) {
      collectKickoffCandidates(sib, candidates);
      sib.querySelectorAll?.('a, span, time').forEach((n) => collectKickoffCandidates(n, candidates));
      sib = sib.previousElementSibling;
    }

    sib = box.nextElementSibling;
    for (let i = 0; i < 3 && sib; i++) {
      collectKickoffCandidates(sib, candidates);
      sib.querySelectorAll?.('a, span, time').forEach((n) => collectKickoffCandidates(n, candidates));
      sib = sib.nextElementSibling;
    }

    for (const c of candidates) {
      const k = normalizeKickoff(c, dateCtx);
      if (k) return k;
    }
    return '';
  }

  function findTwoTeamBox(startLink, root) {
    let el = startLink.parentElement;
    while (el && root.contains(el)) {
      const teams = [...el.querySelectorAll('a[href*="/teams/"], a[href*="/Teams/"]')].filter((a) =>
        isValidTeamName((a.textContent || '').trim())
      );
      if (teams.length === 2) {
        if ((el.textContent || '').length > 500) {
          el = el.parentElement;
          continue;
        }
        return { box: el, teams };
      }
      if (teams.length > 2) return null;
      el = el.parentElement;
    }
    return null;
  }

  function parseMatchBox(anchor, root) {
    const found = findTwoTeamBox(anchor, root);
    if (!found) return null;

    const { box: teamBox, teams } = found;
    const home = (teams[0].textContent || '').trim();
    const away = (teams[1].textContent || '').trim();
    if (!isValidTeamName(home) || !isValidTeamName(away)) return null;

    const { country, league } = splitCountryLeague(leagueBeforeElement(teamBox, root));
    let score = '';
    let matchLink = '';

    teamBox.querySelectorAll('a[href*="/matches/"]').forEach((a) => {
      const href = a.getAttribute('href') || a.href || '';
      if (/\/matches\/\d+/i.test(href)) matchLink = pickBetterMatchLink(cleanMatchLink(href), matchLink);
      const label = (a.textContent || '').trim();
      if (label.length > 12) return;
      const sc = parseScoreText(label);
      if (sc !== null && sc !== undefined) score = sc;
    });

    return {
      country,
      league,
      kickoff: extractKickoffFromBox(teamBox, root),
      home,
      score,
      away,
      link: matchLink,
      source: 'dom',
    };
  }

  function buildRowsFromApi() {
    return lastApiCache;
  }

  function mergeRowsByMatchId(incoming, prev) {
    if (!prev.length) return incoming;
    const map = new Map();
    prev.forEach((r) => {
      map.set(matchIdFromRow(r) || rowKey(r), r);
    });
    return incoming.map((r) => {
      const key = matchIdFromRow(r) || rowKey(r);
      const p = map.get(key);
      if (!p) return r;
      return {
        country: r.country || p.country || '',
        league: r.league || p.league || '',
        kickoff: normalizeKickoff(r.kickoff) || p.kickoff || '',
        home: r.home || p.home || '',
        away: r.away || p.away || '',
        score: normalizeScore(r.score) || normalizeScore(p.score) || '',
        link: pickBetterMatchLink(r.link, p.link),
        source: 'api',
      };
    });
  }

  /** 增量合并：保留旧场次，只更新/追加 incoming 里有的 matchId */
  function mergeApiCache(incoming) {
    if (!incoming.length) return lastApiCache;
    if (!lastApiCache.length) return finalizeCacheRows(incoming);

    const map = new Map();
    lastApiCache.forEach((r) => {
      map.set(matchIdFromRow(r) || rowKey(r), r);
    });
    incoming.forEach((r) => {
      const key = matchIdFromRow(r) || rowKey(r);
      const prev = map.get(key);
      map.set(key, {
        country: r.country || prev?.country || '',
        league: r.league || prev?.league || '',
        kickoff: normalizeKickoff(r.kickoff) || prev?.kickoff || '',
        home: r.home || prev?.home || '',
        away: r.away || prev?.away || '',
        score: normalizeScore(r.score) || normalizeScore(prev?.score) || '',
        link: pickBetterMatchLink(r.link, prev?.link),
        source: 'api',
      });
    });
    return finalizeCacheRows([...map.values()]);
  }

  function todayParam() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }

  function urlDateParam() {
    try {
      const d = new URL(location.href).searchParams.get('d');
      if (d && /^\d{8}$/.test(d)) return d;
    } catch {
      /* ignore */
    }
    return null;
  }

  function syncUrlDate() {
    lastSyncedUrlDate = urlDateParam() || '';
  }

  function livescoreDateParam() {
    const fromUrl = urlDateParam();
    if (fromUrl && fromUrl !== lastSyncedUrlDate) return fromUrl;
    if (lastLoadedDate && /^\d{8}$/.test(lastLoadedDate)) return lastLoadedDate;
    if (fromUrl) return fromUrl;
    return todayParam();
  }

  function dateParamFromUrl(url) {
    const m = String(url || '').match(/[?&]d=(\d{8})\b/);
    return m ? m[1] : null;
  }

  function formatDateParamLabel(dateParam) {
    const d = String(dateParam || '');
    if (!/^\d{8}$/.test(d)) return d || 'today';
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }

  function clearCacheForDate(dateParam) {
    lastLoadedDate = dateParam;
    lastApiCache = [];
    lastRows = [];
    lastApiVersion = '0';
    bestLinkByMatchId.clear();
    autoUploadDone = false;
    clearTimeout(autoUploadTimer);
    autoUploadTimer = null;
  }

  /** Single API entry: trust request d=; ignore only background "today" poll while on another day */
  function acceptApiData(data, requestUrl) {
    if (!data || typeof data !== 'object') return;

    const reqDate = dateParamFromUrl(requestUrl);
    if (reqDate) lastHookedRequestDate = reqDate;
    const viewingDate = livescoreDateParam();
    if (reqDate && reqDate === todayParam() && viewingDate !== todayParam()) return;

    const incoming = parseFromApiPayload(data);
    if (!incoming.length) {
      console.warn(LOG_PREFIX, 'API 0 rows after parse', requestUrl);
      return;
    }

    const effectiveDate = reqDate || viewingDate;

    if (reqDate && reqDate !== lastLoadedDate) {
      console.log(LOG_PREFIX, 'date', formatDateParamLabel(lastLoadedDate), '->', formatDateParamLabel(reqDate));
      clearCacheForDate(reqDate);
      if (data?.version != null) lastApiVersion = String(data.version);
      lastApiCache = finalizeCacheRows(incoming);
      console.log(LOG_PREFIX, 'API', incoming.length, 'rows, cache', lastApiCache.length, formatDateParamLabel(reqDate));
      scheduleParse(80);
      return;
    }

    if (effectiveDate !== lastLoadedDate) {
      console.log(LOG_PREFIX, 'date', formatDateParamLabel(lastLoadedDate), '->', formatDateParamLabel(effectiveDate));
      clearCacheForDate(effectiveDate);
    }

    if (data?.version != null) lastApiVersion = String(data.version);

    const canReplaceCache =
      incoming.length >= FULL_SNAPSHOT_MIN &&
      incoming.length >= lastApiCache.length * 0.85;

    if (!lastApiCache.length) {
      lastApiCache = finalizeCacheRows(incoming);
    } else if (canReplaceCache) {
      lastApiCache = finalizeCacheRows(mergeRowsByMatchId(incoming, lastApiCache));
    } else {
      lastApiCache = mergeApiCache(incoming);
    }
    console.log(LOG_PREFIX, 'API', incoming.length, 'rows, cache', lastApiCache.length, formatDateParamLabel(effectiveDate));
    scheduleParse(80);
  }

  function reloadForDateParam(d) {
    if (!d || !/^\d{8}$/.test(d)) return reloadForCurrentDate();
    clearCacheForDate(d);
    const url = new URL(`/livescores/data?d=${d}&v=${lastApiVersion}`, location.origin).href;
    return fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        acceptApiData(data, url);
        return lastApiCache;
      })
      .catch((err) => {
        console.warn(LOG_PREFIX, 'API failed:', err.message || err);
        scheduleParse(0);
        return [];
      });
  }

  function reloadForCurrentDate() {
    return reloadForDateParam(livescoreDateParam());
  }

  function parseDateFromCalendarLabel(text) {
    const t = String(text || '').replace(/▼/g, '').trim();
    if (!t) return '';
    if (/^today$/i.test(t)) return todayParam();
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }

  function readCalendarDisplayDate() {
    const el = document.querySelector(
      'button[class*="toggleCalendar"], button[class*="toggleDatePicker"]'
    );
    return parseDateFromCalendarLabel(el?.textContent);
  }

  function isCalendarControl(el) {
    const btn = el?.closest?.('button');
    if (!btn) return false;
    if (/dayChangeBtn|toggleCalendar|toggleDatePicker/i.test(btn.className || '')) return true;
    return !!btn.closest('[class*="Calendar-module_controller"]');
  }

  function resolveDateAfterCalendarAction(beforeHooked) {
    if (lastHookedRequestDate && lastHookedRequestDate !== beforeHooked) return lastHookedRequestDate;
    const fromUi = readCalendarDisplayDate();
    if (fromUi && fromUi !== lastLoadedDate) return fromUi;
    return lastHookedRequestDate || fromUi || '';
  }

  function afterCalendarInteraction() {
    const before = lastHookedRequestDate;
    let tries = 0;
    const attempt = () => {
      const d = resolveDateAfterCalendarAction(before);
      if (d && d !== lastLoadedDate) {
        console.log(LOG_PREFIX, 'calendar', formatDateParamLabel(lastLoadedDate), '->', formatDateParamLabel(d));
        reloadForDateParam(d);
        return;
      }
      if (d && d === lastLoadedDate) {
        scheduleParse(0);
        return;
      }
      if (++tries < 30) setTimeout(attempt, 100);
      else scheduleParse(0);
    };
    setTimeout(attempt, 80);
  }

  let dateWatchTimer = null;
  function watchDatePickerClicks() {
    document.addEventListener(
      'click',
      (e) => {
        if (!isCalendarControl(e.target)) return;
        afterCalendarInteraction();
      },
      true
    );
  }

  function watchDateChanges() {
    const check = () => {
      clearTimeout(dateWatchTimer);
      dateWatchTimer = setTimeout(() => {
        const cur = livescoreDateParam();
        if (cur !== lastLoadedDate) reloadForCurrentDate();
        syncUrlDate();
      }, 300);
    };
    const wrapHistory = (fn) =>
      function (...args) {
        const ret = fn.apply(this, args);
        check();
        return ret;
      };
    if (!history.__wsLivescoreHook) {
      history.pushState = wrapHistory(history.pushState);
      history.replaceState = wrapHistory(history.replaceState);
      history.__wsLivescoreHook = true;
    }
    window.addEventListener('popstate', check);
    window.addEventListener('hashchange', check);
    setInterval(check, 1500);
  }

  function fetchLivescoresApi() {
    return reloadForCurrentDate();
  }

  function updatePanelSubtitle(text) {
    const countEl = document.getElementById(PANEL_ID)?.querySelector('#ws-livescores-debug-count');
    if (countEl) countEl.textContent = text;
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

      const cfg = {
        env: normalizeUploadEnv(saved.env),
        prod,
        test,
        local,
      };
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
    const enriched = sanitizeRows(prepareRowsFromCache(lastApiCache));
    rememberBestLinks(enriched);
    return applyDisplayLeagueFilter(enriched);
  }

  function getRowsForUpload() {
    return getDisplayRows();
  }

  /** POST /api/v1/soc/match-id-mapping/ext/batch-upsert */
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
    const el = document.getElementById(PANEL_ID)?.querySelector('#ws-livescores-upload-status');
    if (!el) return;
    el.textContent = text || '';
    const isError = state === true || state === 'error';
    const isSuccess = state === 'success';
    el.style.color = isError ? '#f87171' : isSuccess ? '#4ade80' : '#94a3b8';
  }

  function syncUploadControls(cfg) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const envSel = panel.querySelector('#ws-livescores-upload-env');
    const urlInp = panel.querySelector('#ws-livescores-upload-url');
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
    const envSel = panel?.querySelector('#ws-livescores-upload-env');
    const urlInp = panel?.querySelector('#ws-livescores-upload-url');
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

  function scheduleParse(delayMs) {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(runParse, delayMs);
  }

  let ueclDomRetryCount = 0;

  /** 页面上已有欧协但缓存未并入时，延迟再解析 */
  function scheduleUeclDomRetryIfNeeded(prepared) {
    if (prepared.some((r) => isUeclLeague(r.country, r.league))) {
      ueclDomRetryCount = 0;
      return;
    }
    const domHasUecl = parseFromDom().some((r) => isUeclLeague(r.country, r.league));
    if (!domHasUecl || ueclDomRetryCount >= 5) return;
    ueclDomRetryCount += 1;
    scheduleParse(350 + ueclDomRetryCount * 350);
  }

  function runParse() {
    try {
      ensurePanel();
      tryDomFallback();

      if (!lastApiCache.length) {
        renderPanel([], {
          subtitle: `Waiting for data | ${formatDateParamLabel(livescoreDateParam())}`,
          emptyMessage: 'Loading from API... click Refresh if this stays empty.',
        });
        return;
      }

      const prepared = sanitizeRows(prepareRowsFromCache(lastApiCache));
      lastPreparedRows = prepared;
      updateLeagueBar(prepared);
      const rows = applyDisplayLeagueFilter(prepared);
      if (!rows.length) {
        lastRows = [];
        const rawN = lastApiCache.length;
        const nonTarget = getNonTargetLeagues(prepared);
        console.log(LOG_PREFIX, 'no display rows, raw', rawN, 'prepared', prepared.length, 'extra leagues', nonTarget.length);
        if (prepared.length) {
          console.table(
            prepared.map((r) => ({
              League: leagueFilterLabel(r.country, r.league),
              Home: r.home,
              Away: r.away,
              Whitelist: isAllowedLeague(r.country, r.league) ? 'yes' : 'no',
            }))
          );
        }
        renderPanel([], {
          subtitle: displaySubtitle(0),
          emptyMessage:
            prepared.length === 0 && rawN > 0
              ? 'Rows dropped after parse (e.g. link too long). Click Refresh.'
              : nonTarget.length > 0
                ? 'No matches for current filters. Toggle extra league buttons above.'
                : 'No matches in whitelist for this date. Try another date or Refresh.',
        });
        scheduleUeclDomRetryIfNeeded(prepared);
        return;
      }

      const sig = rowsSignature(rows);
      if (sig !== rowsSignature(lastRows)) {
        lastRows = rows;
        console.groupCollapsed(`${LOG_PREFIX} ${rows.length} matches | ${formatDateParamLabel(lastLoadedDate)}`);
        console.table(
          rows.map((r) => ({
            Country: r.country,
            League: r.league,
            Kickoff: r.kickoff,
            Home: r.home,
            Score: r.score,
            Away: r.away,
            Link: r.link,
          }))
        );
        console.groupEnd();
      }
      renderPanel(rows, {
        subtitle: displaySubtitle(rows.length),
      });
      scheduleAutoUpload();
      scheduleUeclDomRetryIfNeeded(prepared);
    } catch (err) {
      console.error(LOG_PREFIX, err);
      renderPanel([], {
        subtitle: 'Parse error',
        emptyMessage: String(err?.message || err),
      });
    }
  }

  function removeStalePanel() {
    const old = document.getElementById(PANEL_ID);
    if (old && old.dataset.wsVer !== SCRIPT_VER) old.remove();
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
    panel.dataset.wsVer = SCRIPT_VER;

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID}{
        position:fixed;right:12px;bottom:12px;z-index:2147483646;
        width:min(960px,calc(100vw - 24px));height:min(70vh,520px);
        background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:10px;
        box-shadow:0 8px 32px rgba(0,0,0,.45);font:12px/1.4 system-ui,sans-serif;
        display:flex;flex-direction:column;overflow:hidden;
      }
      #${PANEL_ID} .hdr{
        flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;
        flex-wrap:wrap;gap:6px;padding:8px 12px;background:#1f2937;border-bottom:1px solid #374151;
      }
      #${PANEL_ID} .hdr button{
        margin-left:6px;padding:4px 10px;border-radius:6px;border:1px solid #4b5563;
        background:#374151;color:#f3f4f6;cursor:pointer;
      }
      #${PANEL_ID} .body{
        flex:1 1 auto;min-height:0;overflow-x:hidden;overflow-y:auto;
        -webkit-overflow-scrolling:touch;
      }
      #${PANEL_ID} table{display:table!important;width:100%;border-collapse:collapse;table-layout:fixed}
      #${PANEL_ID} thead{display:table-header-group!important}
      #${PANEL_ID} tbody{display:table-row-group!important}
      #${PANEL_ID} tr{display:table-row!important}
      #${PANEL_ID} th,#${PANEL_ID} td{
        display:table-cell!important;
        padding:6px 8px;border-bottom:1px solid #1f2937;text-align:left;vertical-align:top;
        word-break:break-word;overflow-wrap:anywhere;
      }
      #${PANEL_ID} th{position:sticky;top:0;background:#111827;color:#9ca3af;z-index:1}
      #${PANEL_ID} col.c-country{width:10%} #${PANEL_ID} col.c-league{width:14%}
      #${PANEL_ID} col.c-time{width:12%} #${PANEL_ID} col.c-home{width:14%}
      #${PANEL_ID} col.c-score{width:6%} #${PANEL_ID} col.c-away{width:14%} #${PANEL_ID} col.c-link{width:30%}
      #${PANEL_ID} a{color:#60a5fa}
      #${PANEL_ID} .empty{padding:16px;color:#9ca3af}
      #${PANEL_ID} .sub{font-size:11px;color:#9ca3af;margin-left:8px}
      #${PANEL_ID} .upload-bar{
        flex:0 0 auto;display:flex;align-items:center;flex-wrap:wrap;gap:6px;
        padding:6px 12px;background:#111827;border-bottom:1px solid #374151;font-size:11px;
      }
      #${PANEL_ID} .upload-bar label{color:#9ca3af}
      #${PANEL_ID} .upload-bar select,#${PANEL_ID} .upload-bar input{
        padding:3px 6px;border-radius:6px;border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;
      }
      #${PANEL_ID} .upload-bar input{flex:1 1 200px;min-width:160px;max-width:420px}
      #${PANEL_ID} .upload-bar .upload-status{flex:1 1 100%;color:#9ca3af;word-break:break-all}
      #${PANEL_ID} .league-bar{
        flex:0 0 auto;display:none;flex-direction:column;gap:4px;
        padding:6px 12px;background:#0f172a;border-bottom:1px solid #374151;font-size:11px;
      }
      #${PANEL_ID} .league-bar-head{
        display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-height:24px;
      }
      #${PANEL_ID} .league-bar .league-bar-label{color:#9ca3af;flex:0 0 auto}
      #${PANEL_ID} .league-bar .league-bar-summary{color:#6b7280;flex:0 0 auto}
      #${PANEL_ID} .league-bar .league-bar-search{
        flex:1 1 120px;min-width:100px;max-width:220px;margin:0;padding:3px 8px;
        border-radius:6px;border:1px solid #4b5563;background:#1f2937;color:#e5e7eb;font-size:11px;
      }
      #${PANEL_ID} .league-bar .league-bar-toggle{
        margin:0;padding:3px 10px;border-radius:6px;border:1px solid #4b5563;
        background:#374151;color:#f3f4f6;cursor:pointer;font-size:11px;flex:0 0 auto;
      }
      #${PANEL_ID} .league-bar-selected{
        display:flex;align-items:flex-start;flex-wrap:wrap;gap:4px;max-height:52px;overflow-y:auto;
      }
      #${PANEL_ID} .league-bar-selected:empty{display:none}
      #${PANEL_ID} .league-bar-whitelist{
        display:flex;flex-wrap:wrap;align-items:flex-start;align-content:flex-start;
        gap:4px;max-height:72px;overflow-y:auto;
        padding:2px 0;border-top:1px solid #374151;
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
        padding:2px 0;border-top:1px solid #1f2937;
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
        margin:0;padding:3px 8px;border-radius:999px;border:1px solid #4b5563;
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
    title.textContent = 'WhoScored Livescores | Debug';
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.id = 'ws-livescores-debug-count';
    sub.textContent = 'Top-5 / UCL / UEL / UECL(欧协) / World Cup / Championship';
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
    envSel.id = 'ws-livescores-upload-env';
    envSel.innerHTML = UPLOAD_ENVS.map((e) => `<option value="${e.id}">${e.label}</option>`).join('');
    envSel.value = uploadCfg.env;
    const urlLabel = document.createElement('label');
    urlLabel.textContent = '接口';
    const urlInp = document.createElement('input');
    urlInp.id = 'ws-livescores-upload-url';
    urlInp.type = 'url';
    urlInp.placeholder = UPLOAD_API_PATH;
    urlInp.value = getUploadUrl(uploadCfg);
    urlInp.title = '可编辑；按当前环境分别保存。HTTP 外站经 Tampermonkey 直连，无需 HTTPS/CORS';
    const uploadStatus = document.createElement('span');
    uploadStatus.id = 'ws-livescores-upload-status';
    uploadStatus.className = 'upload-status';
    uploadBar.append(envLabel, envSel, urlLabel, urlInp, uploadStatus);

    const leagueBar = document.createElement('div');
    leagueBar.className = 'league-bar';
    leagueBar.id = 'ws-livescores-league-bar';

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
    if (document.body) document.body.appendChild(panel);

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
    btnRefresh.addEventListener('click', () => {
      clearCacheForDate(livescoreDateParam());
      reloadForCurrentDate().finally(() => scheduleParse(0));
    });
    btnToggle.addEventListener('click', () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      uploadBar.style.display = hidden ? '' : 'none';
      leagueBar.style.display = hidden && leagueBar.dataset.hasLeagues === '1' ? 'flex' : 'none';
      btnToggle.textContent = hidden ? 'Collapse' : 'Expand';
    });
    return panel;
  }

  let leagueBarSearchBlurTimer = null;

  function patchLeagueBarPanel(panel) {
    const leagueBar = panel?.querySelector('#ws-livescores-league-bar');
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
    if (!leagueBar || leagueBar.id !== 'ws-livescores-league-bar') return;
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
    const leagueBar = panel?.querySelector('#ws-livescores-league-bar');
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

  function renderPanel(rows, options) {
    const panel = ensurePanel();
    const displayRows = Array.isArray(rows) ? rows : [];
    const subtitle = options?.subtitle || displaySubtitle(displayRows.length);
    updatePanelSubtitle(subtitle);
    const body = panel.querySelector('.body');
    if (!body) return;
    body.style.display = '';
    const leagueBar = panel.querySelector('#ws-livescores-league-bar');
    if (leagueBar) syncLeagueBarVisibility(leagueBar);
    body.replaceChildren();

    if (!displayRows.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = options?.emptyMessage || 'No matches for current filters. Click Refresh.';
      body.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    const colgroup = document.createElement('colgroup');
    ['c-country', 'c-league', 'c-time', 'c-home', 'c-score', 'c-away', 'c-link'].forEach((cls) => {
      const col = document.createElement('col');
      col.className = cls;
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);

    const thead = document.createElement('thead');
    const headTr = document.createElement('tr');
    ['Country', 'League', 'Kickoff', 'Home', 'Score', 'Away', 'Link'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headTr.appendChild(th);
    });
    thead.appendChild(headTr);

    const tbody = document.createElement('tbody');
    for (const r of displayRows) {
      const tr = document.createElement('tr');
      [r.country, r.league, r.kickoff, r.home, r.score, r.away].forEach((text) => {
        const td = document.createElement('td');
        td.textContent = text || '';
        tr.appendChild(td);
      });
      const linkTd = document.createElement('td');
      if (r.link) {
        const a = document.createElement('a');
        a.href = r.link;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = r.link;
        linkTd.appendChild(a);
      }
      tr.appendChild(linkTd);
      tbody.appendChild(tr);
    }

    table.append(thead, tbody);
    body.appendChild(table);
  }

  function onApiJson(data, requestUrl) {
    acceptApiData(data, requestUrl);
  }

  function hookNetwork() {
    if (window.fetch && !window.fetch.__wsLivescoreHook) {
      const origFetch = window.fetch.bind(window);
      const hookedFetch = function (...args) {
        const ret = origFetch(...args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
          if (isLivescoreDataUrl(url)) {
            ret
              .then((res) => res.clone().json().then((data) => onApiJson(data, url)).catch(() => {}))
              .catch(() => {});
          }
        } catch {
          /* ignore */
        }
        return ret;
      };
      hookedFetch.__wsLivescoreHook = true;
      window.fetch = hookedFetch;
    }

    if (!XMLHttpRequest.prototype.__wsLivescoreOpen) {
      const XO = XMLHttpRequest.prototype.open;
      const XS = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__wsUrl = url;
        return XO.call(this, method, url, ...rest);
      };
      XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
          try {
            if (isLivescoreDataUrl(this.__wsUrl) && this.responseText) {
              onApiJson(JSON.parse(this.responseText), this.__wsUrl);
            }
          } catch {
            /* ignore */
          }
        });
        return XS.apply(this, args);
      };
      XMLHttpRequest.prototype.__wsLivescoreOpen = true;
    }
  }

  function boot() {
    removeStalePanel();
    syncUrlDate();
    lastLoadedDate = urlDateParam() || todayParam();
    ensurePanel();
    runParse();
    watchDateChanges();
    watchDatePickerClicks();
    reloadForCurrentDate();
    [800, 2500, 5000].forEach((ms) => setTimeout(reloadForCurrentDate, ms));
    setInterval(() => {
      hookNetwork();
      if (!lastApiCache.length) {
        reloadForCurrentDate();
        if (tryDomFallback()) scheduleParse(0);
      } else if (livescoreDateParam() === lastLoadedDate) {
        reloadForCurrentDate();
      }
    }, 20000);
  }

  hookNetwork();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
