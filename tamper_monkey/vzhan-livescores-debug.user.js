// ==UserScript==
// @name         Vzhan Livescores Debug
// @namespace    https://www.vzhan310.com/
// @version      2.3.13
// @description  V站：五大联赛、英冠德乙荷甲澳超日职法乙、瑞典/挪威/芬兰/韩K、欧冠欧联欧协 + 上传 + 其他联赛
// @match        https://www.vzhan310.com/current
// @match        https://www.vzhan310.com/current/
// @match        https://www.vzhan310.com/current*
// @match        https://www.vzhan310.com/finish*
// @match        https://www.vzhan310.com/future*
// @match        http://www.vzhan310.com/current*
// @match        http://www.vzhan310.com/finish*
// @match        http://www.vzhan310.com/future*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const LOG_PREFIX = '[Vzhan Livescores]';
  const PANEL_ID = 'vz-livescores-debug-panel';
  const SCRIPT_VER = '2.3.13';
  const EXTRA_LEAGUE_CFG_KEY = 'vz-livescores-extra-leagues';
  const LEAGUE_BAR_EXPANDED_KEY = 'vz-livescores-league-bar-expanded';
  const LEAGUE_BAR_AUTO_COLLAPSE_N = 8;
  const UPLOAD_TIMEOUT_MS = 30000;
  const AUTO_UPLOAD_DELAY_MS = 3000;
  const SOURCE_SITE = 'vzhan';
  const UPLOAD_CFG_KEY = 'vz-livescores-upload-cfg';
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

  let matchInfoCache = '';
  /** /finish、/future 接口 JSON 解析出的比赛行 */
  let apiFollowRows = [];
  const MATCH_LIST_ROOT_SEL =
    '.currentlist, .finishlist, .futurelist, .endlist, .footMatchList, #nuxtMain';
  /** 各国「X超」简称（非英超）；避免 tourId 错绑到英超 */
  const CN_OTHER_SUPER_RE = /^.{1,3}超$/;
  const PARSE_DEBOUNCE_MS = 500;
  /** 页面慢加载：多次重试解析（毫秒） */
  const LOAD_RETRY_MS = [0, 800, 2000, 4000, 7000, 11000, 16000];
  let lastPathname = '';
  let bestParseScore = -1;
  let loadRetryGen = 0;
  const EXCLUDE_COMP_RE =
    /\b(women|woman|frauen|feminine|femenin|femminil|feminino|female|girls|u19|u20|u21|u23|youth|junior|reserve|amateur|女足|女)\b/i;

  /** V站中文简称 → 标准 country/league（仅精确匹配键名，不用前缀/模糊） */
  const VZ_CN_LEAGUES = {
    英超: { country: 'England', league: 'Premier League' },
    英冠: { country: 'England', league: 'Championship' },
    西甲: { country: 'Spain', league: 'La Liga' },
    意甲: { country: 'Italy', league: 'Serie A' },
    德甲: { country: 'Germany', league: 'Bundesliga' },
    德乙: { country: 'Germany', league: '2. Bundesliga' },
    法甲: { country: 'France', league: 'Ligue 1' },
    法乙: { country: 'France', league: 'Ligue 2' },
    荷甲: { country: 'Netherlands', league: 'Eredivisie' },
    澳超: { country: 'Australia', league: 'A-League' },
    日职联: { country: 'Japan', league: 'J1 League' },
    瑞典超: { country: 'Sweden', league: 'Allsvenskan' },
    挪威超: { country: 'Norway', league: 'Eliteserien' },
    芬超: { country: 'Finland', league: 'Veikkausliiga' },
    韩K联: { country: 'South Korea', league: 'K League 1' },
    欧冠: { country: 'Europe', league: 'Champions League' },
    欧冠杯: { country: 'Europe', league: 'Champions League' },
    欧联: { country: 'Europe', league: 'Europa League' },
    欧联杯: { country: 'Europe', league: 'Europa League' },
    欧协: { country: 'Europe', league: 'Europa Conference League' },
    欧协杯: { country: 'Europe', league: 'Europa Conference League' },
    欧会杯: { country: 'Europe', league: 'Europa Conference League' },
    欧洲杯: { country: 'Europe', league: 'European Championship' },
    世界杯: { country: 'World', league: 'World Cup' },
    美加墨: { country: 'World', league: 'World Cup' },
    世预赛: { country: 'World', league: 'World Cup' },
  };

  /** 中文全称/变体 → VZ_CN_LEAGUES 键 */
  const VZ_CN_LEAGUE_ALIASES = [
    [/意甲|意大利.*甲级/i, '意甲'],
    [/英超|英格兰.*(超级|Premier)/i, '英超'],
    [/英冠|英格兰.*冠军/i, '英冠'],
    [/西甲|西班牙.*甲级/i, '西甲'],
    [/德甲|德国.*甲级|Bundesliga/i, '德甲'],
    [/德乙|德国.*乙级/i, '德乙'],
    [/法甲|法国.*甲级/i, '法甲'],
    [/法乙|法国.*乙级/i, '法乙'],
    [/荷甲|荷兰.*甲级/i, '荷甲'],
    [/澳超|澳大利亚.*超/i, '澳超'],
    [/日职联|日职(?!乙|丙|[2-3])|日本.*职/i, '日职联'],
    [/瑞典超|瑞典.*超级/i, '瑞典超'],
    [/挪威超|挪威.*超级/i, '挪威超'],
    [/芬兰超|芬超|芬兰.*超级/i, '芬超'],
    [/韩K联|韩K|韩国.*K/i, '韩K联'],
    [/欧冠/i, '欧冠'],
    [/欧联(?!合)/i, '欧联'],
    [/欧协|欧会/i, '欧协'],
    [/欧洲杯/i, '欧洲杯'],
    [/世界杯|世预赛|美加墨/i, '世界杯'],
  ];
  const BLOCKED_LEAGUE_CN_RE =
    /女足|女子|女超|女甲|女乙|女联|J2|J3|U19|U20|U21|U23|青年|预备|业余|发展联盟|中甲|中乙|中超/i;
  /** 队名含女足/女子等 → 即使联赛标为瑞典超等也排除 */
  const BLOCKED_TEAM_CN_RE = /女足|女子|\(女\)|（女）|\(w\)|（w）/i;

  /** 白名单：仅展示这些标准联赛 */
  const WHITELIST_KEYS = new Set(
    Object.values(VZ_CN_LEAGUES).map((x) => `${x.country}|${x.league}`)
  );

  /** country|league → 中文简称（同联赛多别名时取优先键） */
  const CN_BY_WHITELIST_KEY = {};
  const CN_KEY_PRIORITY = [
    '英超', '英冠', '西甲', '意甲', '德甲', '德乙', '法甲', '法乙', '荷甲', '澳超', '日职联',
    '瑞典超', '挪威超', '芬超', '韩K联', '欧冠', '欧联', '欧协', '欧洲杯', '世界杯',
  ];
  for (const cn of CN_KEY_PRIORITY) {
    const meta = VZ_CN_LEAGUES[cn];
    if (!meta) continue;
    const k = `${meta.country}|${meta.league}`;
    if (!CN_BY_WHITELIST_KEY[k]) CN_BY_WHITELIST_KEY[k] = cn;
  }
  for (const [cn, meta] of Object.entries(VZ_CN_LEAGUES)) {
    const k = `${meta.country}|${meta.league}`;
    if (!CN_BY_WHITELIST_KEY[k]) CN_BY_WHITELIST_KEY[k] = cn;
  }

  /** 默认联赛搜索别名（搜索框 / 表格筛选） */
  const WHITELIST_SEARCH_ALIASES = {
    英超: ['英格兰'],
    英冠: ['英格兰'],
    西甲: ['西班牙'],
    意甲: ['意大利'],
    德甲: ['德国'],
    德乙: ['德国'],
    法甲: ['法国'],
    法乙: ['法国'],
    荷甲: ['荷兰'],
    澳超: ['澳大利亚', '澳洲'],
    日职联: ['日职', '日本'],
    瑞典超: ['瑞典'],
    挪威超: ['挪威'],
    芬超: ['芬兰超', '芬兰'],
    韩K联: ['韩K', '韩国', 'K联赛'],
    欧冠: ['欧冠杯'],
    欧联: ['欧联杯'],
    欧协: ['欧协杯', '欧会杯'],
    世界杯: ['美加墨'],
    美加墨: ['世界杯'],
    世预赛: ['世界杯', '美加墨'],
  };

  /** 无中文名时，英文全称须整行匹配（避免 “CHN Champions League” 误判） */
  const VZ_EN_LEAGUE_RULES = [
    [/^UEFA\s+Champions\s+League$/i, { country: 'Europe', league: 'Champions League' }],
    [/^(?:UCL|UEFA|Europe)\s+Champions\s+League$/i, { country: 'Europe', league: 'Champions League' }],
    [/^UEFA\s+Europa\s+League$/i, { country: 'Europe', league: 'Europa League' }],
    [/^(?:UEL|UEFA|Europe)\s+Europa\s+League$/i, { country: 'Europe', league: 'Europa League' }],
    [/^UEFA\s+Europa\s+Conference\s+League$/i, { country: 'Europe', league: 'Europa Conference League' }],
    [/^(?:ENG|England)\s+Premier\s+League$/i, { country: 'England', league: 'Premier League' }],
    [/^Premier\s+League$/i, { country: 'England', league: 'Premier League' }],
    [/^(?:ENG|England)\s+Championship$/i, { country: 'England', league: 'Championship' }],
    [/^(?:ESP|Spain)\s+La\s+Liga$/i, { country: 'Spain', league: 'La Liga' }],
    [/^La\s+Liga$/i, { country: 'Spain', league: 'La Liga' }],
    [/^(?:ITA|Italy)\s+Serie\s+A$/i, { country: 'Italy', league: 'Serie A' }],
    [/^Serie\s+A$/i, { country: 'Italy', league: 'Serie A' }],
    [/^(?:GER|Germany)\s+2\.?\s*Bundesliga$/i, { country: 'Germany', league: '2. Bundesliga' }],
    [/^(?:GER|Germany)\s+Bundesliga$/i, { country: 'Germany', league: 'Bundesliga' }],
    [/^Bundesliga$/i, { country: 'Germany', league: 'Bundesliga' }],
    [/^(?:NED|Netherlands|Holland)\s+Eredivisie$/i, { country: 'Netherlands', league: 'Eredivisie' }],
    [/^(?:AUS|Australia)\s+A-?League$/i, { country: 'Australia', league: 'A-League' }],
    [/^(?:FRA|France)\s+Ligue\s+2$/i, { country: 'France', league: 'Ligue 2' }],
    [/^(?:FRA|France)\s+Ligue\s+1$/i, { country: 'France', league: 'Ligue 1' }],
    [/^Ligue\s+1$/i, { country: 'France', league: 'Ligue 1' }],
    [/^(?:JPN|Japan)\s+J1\s+League$/i, { country: 'Japan', league: 'J1 League' }],
    [/^J1\s+League$/i, { country: 'Japan', league: 'J1 League' }],
    [/^(?:SWE|Sweden)\s+Allsvenskan$/i, { country: 'Sweden', league: 'Allsvenskan' }],
    [/^Allsvenskan$/i, { country: 'Sweden', league: 'Allsvenskan' }],
    [/^(?:NOR|Norway)\s+Eliteserien$/i, { country: 'Norway', league: 'Eliteserien' }],
    [/^Eliteserien$/i, { country: 'Norway', league: 'Eliteserien' }],
    [/^(?:FIN|Finland)\s+Veikkausliiga$/i, { country: 'Finland', league: 'Veikkausliiga' }],
    [/^Veikkausliiga$/i, { country: 'Finland', league: 'Veikkausliiga' }],
    [/^(?:KOR|Korea|South\s+Korea)\s+K\s+League\s+1$/i, { country: 'South Korea', league: 'K League 1' }],
    [/^K\s+League\s+1$/i, { country: 'South Korea', league: 'K League 1' }],
    [/^K\s+League$/i, { country: 'South Korea', league: 'K League 1' }],
    [/^UEFA\s+European\s+Championship$/i, { country: 'Europe', league: 'European Championship' }],
    [/^(?:UEFA\s+)?Euro(?:\s+\d{4})?$/i, { country: 'Europe', league: 'European Championship' }],
    [/^European\s+Championship$/i, { country: 'Europe', league: 'European Championship' }],
    [/^(?:FIFA\s+)?World\s+Cup(?:\s+Qualif\w*)?$/i, { country: 'World', league: 'World Cup' }],
    [/^World\s+Cup\s+Qualif\w*/i, { country: 'World', league: 'World Cup' }],
  ];

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
  let domObserver = null;
  let observedRoot = null;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatDateOnly(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function hasKickoffClock(kickoff) {
    return /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(String(kickoff || '').trim());
  }

  /** 已完赛且无开赛时刻 → YYYY-MM-DD FT；有时间则保留 HH:mm */
  function formatFinishedKickoff(kickoff) {
    const s = String(kickoff || '').trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/);
    if (m?.[2]) return `${m[1]} ${m[2]}`;
    return m?.[1] ? `${m[1]} FT` : 'FT';
  }

  function pickKickoff(preferred, fallback) {
    if (hasKickoffClock(preferred)) return preferred;
    if (hasKickoffClock(fallback)) return fallback;
    return preferred || fallback || '';
  }

  function formatKickoffFromTs(ts) {
    if (!ts || Number.isNaN(ts)) return '';
    const d = new Date(ts * 1000);
    if (Number.isNaN(d.getTime())) return '';
    const day = formatDateOnly(d);
    const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return `${day} ${time}`;
  }

  function resolveLeagueFromEnglish(en) {
    const t = String(en || '').trim();
    if (!t) return null;
    if (/Syria|Syrian|\bSYR\b|叙/i.test(t)) return null;
    for (const [re, meta] of VZ_EN_LEAGUE_RULES) {
      if (re.test(t)) return { ...meta };
    }
    return null;
  }

  function isOtherCnSuperLeague(cn) {
    if (VZ_CN_LEAGUES[cn]) return false;
    return CN_OTHER_SUPER_RE.test(cn) && cn !== '英超' && cn !== '澳超';
  }

  function isBlockedLeagueLabel(cn) {
    const t = String(cn || '').trim();
    if (!t) return false;
    const key = normalizeCnLeagueKey(t);
    if (VZ_CN_LEAGUES[key]) return false;
    if (BLOCKED_LEAGUE_CN_RE.test(t)) return true;
    if (/日职/.test(t) && key !== '日职联') return true;
    if (/英超/.test(t) && key !== '英超') return true;
    if (/德甲/.test(t) && key !== '德甲') return true;
    if (/法甲/.test(t) && key !== '法甲' && key !== '法乙') return true;
    if (/欧冠/.test(t) && key !== '欧冠' && key !== '欧冠杯') return true;
    if (/欧联/.test(t) && key !== '欧联' && key !== '欧联杯') return true;
    return false;
  }

  function isBlockedMatchRow(r) {
    if (!r) return false;
    if (isBlockedLeagueLabel(r.cnLabel || r.league)) return true;
    const teamBlob = [r.home, r.away, r.homeCn, r.awayCn].filter(Boolean).join(' ');
    if (BLOCKED_TEAM_CN_RE.test(teamBlob)) return true;
    if (EXCLUDE_COMP_RE.test(teamBlob)) return true;
    return false;
  }

  function normalizeCnLeagueKey(cn) {
    const t = String(cn || '').trim();
    if (!t) return '';
    if (VZ_CN_LEAGUES[t]) return t;
    if (t.endsWith('杯')) {
      const short = t.replace(/杯$/, '');
      if (VZ_CN_LEAGUES[short]) return short;
    }
    for (const [re, key] of VZ_CN_LEAGUE_ALIASES) {
      if (re.test(t)) return key;
    }
    return t;
  }

  /**
   * 联赛解析唯一入口：
   * 1. 有中文简称 → 仅查 VZ_CN_LEAGUES 精确表；未命中则保留原文，不用英文推断
   * 2. 无中文 → 英文整行严格匹配
   */
  function resolveLeague(cnRaw, enRaw) {
    const cn = String(cnRaw || '').trim();
    const en = String(enRaw || '').trim();
    if (/叙|叙利亚|Syria|Syrian|\bSYR\b/i.test(`${cn} ${en}`)) {
      return { country: '', league: cn || en, cnLabel: cn || '' };
    }
    if (cn) {
      if (isBlockedLeagueLabel(cn)) return { country: '', league: cn, cnLabel: cn };
      const cnKey = normalizeCnLeagueKey(cn);
      if (VZ_CN_LEAGUES[cnKey]) return { ...VZ_CN_LEAGUES[cnKey], cnLabel: cnKey === cn ? cn : cnKey };
      const fromCnEn = resolveLeagueFromEnglish(cn);
      if (fromCnEn) return { ...fromCnEn, cnLabel: cnKey || cn };
      const displayCn = cnKey !== cn ? cnKey : cn;
      if (isOtherCnSuperLeague(displayCn)) return { country: '', league: displayCn, cnLabel: displayCn };
      return { country: '', league: displayCn, cnLabel: displayCn };
    }
    const fromEn = resolveLeagueFromEnglish(en);
    if (fromEn) return { ...fromEn, cnLabel: '' };
    if (en) return { country: '', league: en, cnLabel: '' };
    return { country: '', league: '', cnLabel: '' };
  }

  function parseTournamentInfo(raw) {
    const map = {};
    if (!raw) return map;
    raw.split('!!').forEach((chunk) => {
      const p = chunk.split('^');
      const id = p[0];
      const cn = (p[1] || '').trim();
      if (!id || !cn) return;
      map[id] = resolveLeague(cn, '');
    });
    return map;
  }

  function leagueFromLabel(label) {
    return resolveLeague(label, '');
  }

  function isAllowedLeague(country, league) {
    if (!country || !league) return false;
    if (EXCLUDE_COMP_RE.test(`${country} ${league}`)) return false;
    return WHITELIST_KEYS.has(`${country}|${league}`);
  }

  function applyLeagueFilter(rows) {
    return applyDisplayLeagueFilter(rows);
  }

  function readLeagueFromVue(item) {
    let el = item;
    for (let i = 0; i < 10 && el; i++) {
      const vm = el.__vue__ || el.__vueParentComponent?.proxy;
      const objs = [vm?.item, vm?.match, vm?.$props?.item, vm?.$props?.match, vm?.$data?.item, vm?.$data?.match];
      for (const o of objs) {
        if (!o || typeof o !== 'object') continue;
        const cn = String(
          o.tournament_name_cn ?? o.league_cn ?? o.tournament_cn ?? o.saishi_cn ?? o.leagueNameCn ?? ''
        ).trim();
        if (cn) return cn;
        const en = String(
          o.tournament_name ?? o.league_name ?? o.tournament ?? o.leagueName ?? o.saishi ?? ''
        ).trim();
        if (en) return en;
      }
      el = el.parentElement;
    }
    return '';
  }

  function readLeagueLabelFromItem(item) {
    const vueLabel = readLeagueFromVue(item);
    if (vueLabel) return vueLabel;

    const row = item.querySelector('.item') || item;
    const directSels = ['.tournament', '.league', '.ls', '.saishi', '[class*="tournament"]'];
    for (const sel of directSels) {
      for (const root of [row, item]) {
        const el = root.querySelector?.(sel);
        if (!el || el.closest?.('.team, .time, .status, .score')) continue;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length <= 40) return t;
      }
    }

    if (row) {
      for (const el of row.querySelectorAll('span, div, td, a, p, em, strong, i')) {
        if (el.closest('.team, .time, .status, .score, .team.home, .team.away')) continue;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 16 || t.length < 2) continue;
        const key = normalizeCnLeagueKey(t);
        if (VZ_CN_LEAGUES[key]) return key;
        if (resolveLeagueFromEnglish(t)) return t;
      }
    }

    for (const child of item.children || []) {
      if (child.matches?.('.item')) break;
      const t = (child.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 16) continue;
      if (VZ_CN_LEAGUES[t] || VZ_CN_LEAGUES[normalizeCnLeagueKey(t)]) return normalizeCnLeagueKey(t) || t;
      for (const key of Object.keys(VZ_CN_LEAGUES)) {
        if (t === key || t.endsWith(key)) return key;
      }
    }
    return '';
  }

  function leagueFilterLabel(country, league, cnLabel) {
    const c = String(country || '').trim();
    const l = String(league || '').trim();
    const cn = String(cnLabel || '').trim();
    if (c && l) return `${c} - ${l}`;
    if (cn) return cn;
    return l || c;
  }

  /** 其他联赛按钮分组键：全称/别名归到同一简称（如 瑞典超级联赛→瑞典超） */
  function extraLeagueDisplayKey(row) {
    const fin = finalizeRowLeague(row);
    if (isAllowedLeague(fin.country, fin.league)) return '';
    const raw = String(fin.cnLabel || fin.league || '').trim();
    if (fin.country && fin.league) return leagueFilterLabel(fin.country, fin.league, fin.cnLabel);
    const key = normalizeCnLeagueKey(raw);
    return key || raw;
  }

  function isValidRow(r) {
    return !!(r && r.home && r.away && leagueFilterLabel(r.country, r.league, r.cnLabel));
  }

  function finalizeRowLeague(r) {
    if (!r) return r;
    let { country, league, cnLabel } = r;
    cnLabel = String(cnLabel || '').trim();
    country = String(country || '').trim();
    league = String(league || '').trim();

    const tryResolve = (label) => {
      const info = leagueFromLabel(label);
      if (info.country && info.league) {
        return {
          ...r,
          country: info.country,
          league: info.league,
          cnLabel: info.cnLabel || cnLabel || label,
        };
      }
      return null;
    };

    if (country && league && WHITELIST_KEYS.has(`${country}|${league}`)) {
      return { ...r, country, league, cnLabel: cnLabel || league };
    }
    if (cnLabel) {
      const resolved = tryResolve(cnLabel);
      if (resolved) return resolved;
    }
    if (league && (!country || !WHITELIST_KEYS.has(`${country}|${league}`))) {
      const resolved = tryResolve(league);
      if (resolved) return resolved;
    }
    return { ...r, country, league, cnLabel };
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

  function leagueLabelSearchBlob(label) {
    const cn = String(label || '').trim();
    const alts = WHITELIST_SEARCH_ALIASES[cn] || [];
    return [cn, ...alts].join(' ').toLowerCase();
  }

  function whitelistLeagueLabel(country, league) {
    const k = `${country}|${league}`;
    return CN_BY_WHITELIST_KEY[k] || leagueFilterLabel(country, league, '');
  }

  function getLeagueSearchQuery() {
    const el = document.getElementById(PANEL_ID)?.querySelector('.league-bar-search');
    return String(el?.value || '').trim().toLowerCase();
  }

  function rowLeagueSearchText(row) {
    const fin = finalizeRowLeague(row);
    const wl = whitelistLeagueLabel(fin.country, fin.league);
    const extra = extraLeagueDisplayKey(fin);
    const wlAlts = WHITELIST_SEARCH_ALIASES[wl] || [];
    return [wl, ...wlAlts, extra, fin.cnLabel, fin.league, fin.country].filter(Boolean).join(' ').toLowerCase();
  }

  function rowMatchesLeagueSearch(row, q) {
    if (!q) return true;
    return rowLeagueSearchText(row).includes(q);
  }

  function applyDisplayLeagueFilter(rows) {
    const q = getLeagueSearchQuery();
    return rows
      .filter((r) => {
        const row = finalizeRowLeague(r);
        if (isBlockedMatchRow(row)) return false;
        let allowed = false;
        if (isAllowedLeague(row.country, row.league)) allowed = true;
        else {
          const extraKey = extraLeagueDisplayKey(row);
          allowed = extraKey && selectedExtraLeagues.has(extraKey);
        }
        if (!allowed) return false;
        return rowMatchesLeagueSearch(row, q);
      })
      .map(finalizeRowLeague);
  }

  function getWhitelistLeagues(rows) {
    const map = new Map();
    for (const r of rows) {
      const row = finalizeRowLeague(r);
      if (!isValidRow(row)) continue;
      if (isBlockedMatchRow(row)) continue;
      if (!isAllowedLeague(row.country, row.league)) continue;
      const label = whitelistLeagueLabel(row.country, row.league);
      const item = map.get(label) || { label, country: row.country, league: row.league, count: 0 };
      item.count += 1;
      map.set(label, item);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  }

  function getNonTargetLeagues(rows) {
    const map = new Map();
    for (const r of rows) {
      const row = finalizeRowLeague(r);
      if (!isValidRow(row)) continue;
      if (isBlockedMatchRow(row)) continue;
      if (isAllowedLeague(row.country, row.league)) continue;
      const label = extraLeagueDisplayKey(row);
      if (!label || EXCLUDE_COMP_RE.test(label)) continue;
      const item = map.get(label) || { label, country: row.country, league: row.league, cnLabel: label, count: 0 };
      item.count += 1;
      map.set(label, item);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  function displaySubtitle(rowCount) {
    const extraN = selectedExtraLeagues.size;
    const extraHint = extraN ? ` | +${extraN} extra league${extraN > 1 ? 's' : ''}` : '';
    const dbg = lastDebug ? ` | ${lastDebug}` : '';
    return `${rowCount} matches | ${readActiveDateLabel() || 'date?'} | filtered${extraHint}${dbg}`;
  }

  function cleanMatchLink(link) {
    return String(link || '').trim().replace(/#.*$/, '');
  }

  function linkDisplayLabel(link) {
    const s = cleanMatchLink(link);
    if (!s) return '';
    if (/\/football-match\/report-/i.test(s)) return '情报';
    if (/\/football-match\/data-/i.test(s)) return '析';
    return 'link';
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
    return applyDisplayLeagueFilter(lastPreparedRows).map(finalizeRowLeague);
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
    const el = document.getElementById(PANEL_ID)?.querySelector('#vz-livescores-upload-status');
    if (!el) return;
    el.textContent = text || '';
    const isError = state === true || state === 'error';
    const isSuccess = state === 'success';
    el.style.color = isError ? '#f87171' : isSuccess ? '#4ade80' : '#94a3b8';
  }

  function syncUploadControls(cfg) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const envSel = panel.querySelector('#vz-livescores-upload-env');
    const urlInp = panel.querySelector('#vz-livescores-upload-url');
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
    const envSel = panel?.querySelector('#vz-livescores-upload-env');
    const urlInp = panel?.querySelector('#vz-livescores-upload-url');
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
        throw new Error(`HTTP ${status}: ${body?.message || body?.msg || 'error'}`);
      }
      if (!isUploadResponseOk(body, status)) {
        throw new Error(body?.message || body?.msg || `业务失败 code=${body?.code}`);
      }
      const summary = formatUploadResult(body) || body?.msg || body?.message || 'ok';
      setUploadStatus(`上传成功 (${uploadEnvLabel(cfg.env)}): ${summary}`, 'success');
      console.log(LOG_PREFIX, 'upload ok', body);
    } catch (err) {
      const msg = String(err?.message || err);
      setUploadStatus(`上传失败 (${uploadEnvLabel(cfg.env)}): ${msg}`, true);
      console.warn(LOG_PREFIX, 'upload failed', err);
    } finally {
      uploadInFlight = false;
      syncUploadControls(readUploadConfigFromPanel());
    }
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

  function hasCjk(text) {
    return /[\u4e00-\u9fff]/.test(String(text || ''));
  }

  function isTeamIdToken(s) {
    return /^\d{1,7}$/.test(String(s || '').trim());
  }

  function isTeamNameToken(s) {
    const t = String(s || '').trim();
    if (!t || t.length > 80) return false;
    if (isTeamIdToken(t)) return false;
    return /[A-Za-z\u4e00-\u9fff]/.test(t);
  }

  function looksLikeBadTeamName(name) {
    const t = String(name || '').trim();
    if (!t || isTeamIdToken(t)) return true;
    return /\\u[0-9a-fA-F]{4}/.test(t);
  }

  /** match_info / API 字符串里的 \\uXXXX → 实际字符（最多两轮，兼容双重转义） */
  function decodeUnicodeEscapes(raw) {
    let s = String(raw || '');
    for (let i = 0; i < 2; i++) {
      const next = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      if (next === s) break;
      s = next;
    }
    return s;
  }

  function sanitizeTeamName(name) {
    return decodeUnicodeEscapes(String(name || '').trim());
  }

  /** match_info 标准段：主队ID^主中文^主英文^客队ID^客中文^客英文 */
  function extractTeamsFromParts(p) {
    for (let i = 6; i < p.length - 5; i++) {
      const a = (p[i] || '').trim();
      const b = (p[i + 1] || '').trim();
      const c = (p[i + 2] || '').trim();
      const d = (p[i + 3] || '').trim();
      const e = (p[i + 4] || '').trim();
      const f = (p[i + 5] || '').trim();
      if (
        isTeamIdToken(a) &&
        isTeamNameToken(b) &&
        isTeamNameToken(c) &&
        isTeamIdToken(d) &&
        isTeamNameToken(e) &&
        isTeamNameToken(f)
      ) {
        const homeCn = hasCjk(b) ? b : hasCjk(c) ? c : b;
        const homeEn = hasCjk(b) ? c : b;
        const awayCn = hasCjk(e) ? e : hasCjk(f) ? f : e;
        const awayEn = hasCjk(e) ? f : e;
        return { homeCn, homeEn, awayCn, awayEn, afterIdx: i + 6 };
      }
    }
    return null;
  }

  function extractTeamsLegacy(p) {
    if (p.length < 17) return null;
    const homeCn = (p[12] || '').trim();
    const homeEn = (p[13] || '').trim();
    const awayCn = (p[15] || '').trim();
    const awayEn = (p[16] || '').trim();
    if (isTeamIdToken(homeCn) || isTeamIdToken(awayCn)) return null;
    if (!isTeamNameToken(homeCn) && !isTeamNameToken(homeEn)) return null;
    if (!isTeamNameToken(awayCn) && !isTeamNameToken(awayEn)) return null;
    return {
      homeCn: hasCjk(homeCn) ? homeCn : hasCjk(homeEn) ? homeEn : homeCn,
      homeEn: hasCjk(homeCn) ? homeEn : homeCn,
      awayCn: hasCjk(awayCn) ? awayCn : hasCjk(awayEn) ? awayEn : awayCn,
      awayEn: hasCjk(awayCn) ? awayEn : awayCn,
      afterIdx: 17,
    };
  }

  function extractTeamsFromChunk(p) {
    return extractTeamsFromParts(p) || extractTeamsLegacy(p);
  }

  /** match_info 结构异常时，从分段中捞取队名 */
  function extractNamesLoose(p) {
    const names = [];
    for (let i = 8; i < p.length; i++) {
      const t = (p[i] || '').trim();
      if (isTeamNameToken(t)) names.push(t);
    }
    if (names.length < 2) return null;
    const h0 = names[0];
    const h1 = names[1] || h0;
    const a0 = names.length >= 4 ? names[2] : names[1];
    const a1 = names.length >= 4 ? names[3] : names[1];
    return {
      homeCn: hasCjk(h0) ? h0 : hasCjk(h1) ? h1 : h0,
      homeEn: hasCjk(h0) ? h1 : h0,
      awayCn: hasCjk(a0) ? a0 : hasCjk(a1) ? a1 : a0,
      awayEn: hasCjk(a0) ? a1 : a0,
      afterIdx: 16,
    };
  }

  function teamLookupKeys(home, away, homeCn, awayCn, score) {
    const keys = [];
    const sc = String(score || '').trim();
    const add = (h, a) => {
      if (!h || !a) return;
      keys.push(`${normalizeTeamKey(h)}|${normalizeTeamKey(a)}|${sc}`);
      keys.push(`${normalizeTeamKey(h)}|${normalizeTeamKey(a)}`);
    };
    add(home, away);
    add(homeCn, awayCn);
    return keys;
  }

  function isPlaceholderScore(score) {
    return /^0-0$/.test(String(score || '').trim());
  }

  function isLiveOrFinishedStatus(status, kickoff) {
    const k = String(kickoff || '').trim();
    if (/\sFT$/i.test(k)) return true;
    const st = String(status || '').trim();
    return /已完赛|完场|完赛|结束|\bFT\b|上半场|下半场|进行中|补时|\d+['']|^\d+\+|加时|点球/i.test(st);
  }

  function isScheduledStatus(status) {
    const st = String(status || '').trim();
    if (!st) return /\/future(?:\/|$|\?)/i.test(location.pathname);
    return /未开赛|未开始|未踢|vs|赛程|推迟|待定|^-$|^—$/i.test(st);
  }

  function isFutureKickoff(kickoff) {
    const m = String(kickoff || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
    if (!m) return false;
    const dt = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
    return dt.getTime() > Date.now() + 5 * 60 * 1000;
  }

  /** 未开赛占位 0-0 不展示；进行中/已结束保留真实 0-0 */
  function finalizeScore(score, ctx = {}) {
    const s = String(score || '').trim();
    if (!s) return '';
    if (!isPlaceholderScore(s)) return s;
    const status = ctx.status || '';
    const kickoff = ctx.kickoff || '';
    if (isLiveOrFinishedStatus(status, kickoff)) return s;
    if (isScheduledStatus(status)) return '';
    if (isFutureKickoff(kickoff)) return '';
    return '';
  }

  function extractScoreFromParts(p, startIdx, kickoffTs) {
    for (let i = startIdx; i < p.length - 1 && i < startIdx + 12; i++) {
      const a = (p[i] || '').trim();
      const b = (p[i + 1] || '').trim();
      if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
        const score = `${a}-${b}`;
        if (score === '0-0' && kickoffTs && kickoffTs * 1000 > Date.now() + 5 * 60 * 1000) return '';
        return score;
      }
    }
    return '';
  }

  function sanitizeRowScores(rows) {
    return rows.map((r) => {
      const score = finalizeScore(r.score, { status: r.status, kickoff: r.kickoff });
      return score === r.score ? r : { ...r, score };
    });
  }

  function pickDisplayFromSources(...candidates) {
    for (const c of candidates) {
      const t = sanitizeTeamName(c);
      if (t && !looksLikeBadTeamName(t)) return t;
    }
    for (const c of candidates) {
      const t = sanitizeTeamName(c);
      if (t) return t;
    }
    return '';
  }

  /** 面板显示队名：优先中文（与 V站页面一致），无中文时再取英文 */
  function pickDisplayTeamName(...candidates) {
    for (const c of candidates) {
      const t = sanitizeTeamName(c);
      if (t && hasCjk(t) && !looksLikeBadTeamName(t)) return t;
    }
    for (const c of candidates) {
      const t = sanitizeTeamName(c);
      if (t && !looksLikeBadTeamName(t)) return t;
    }
    return '';
  }

  /** 详情链接 slug 用中文队名（与 V站 URL 一致） */
  function pickLinkTeamName(...candidates) {
    for (const c of candidates) {
      const t = String(c || '').trim();
      if (t && hasCjk(t)) return t;
    }
    return pickDisplayTeamName(...candidates);
  }

  function matchLink(homeSlug, awaySlug, matchId, kind = 'report') {
    if (!matchId || !homeSlug || !awaySlug) return '';
    const page = kind === 'data' ? 'data' : 'report';
    const slug = `${encodeURIComponent(homeSlug)}-vs-${encodeURIComponent(awaySlug)}-${matchId}`;
    return `https://www.vzhan310.com/football-match/${page}-${slug}`;
  }

  /** /current 列表项 Vue：$props.data */
  function readVueMatchItemData(item) {
    let el = item;
    for (let i = 0; i < 8 && el; i++) {
      const vm = el.__vue__ || el.__vueParentComponent?.proxy;
      const d = vm?.$props?.data;
      if (d && typeof d === 'object') {
        const id = String(d.match_id || d.matchId || '').trim();
        if (isLikelyMatchId(id)) return d;
      }
      el = el.parentElement;
    }
    return null;
  }

  function itemHasReportButton(item) {
    if (!item) return false;
    if (item.querySelector('span.report, span.hasb.report')) return true;
    const d = readVueMatchItemData(item);
    if (!d) return false;
    return Number(d.report_num || 0) > 0 || Number(d.article_num || 0) > 0;
  }

  function buildLinkFromVueData(data, preferReport = true) {
    if (!data || typeof data !== 'object') return '';
    const matchId = String(data.match_id || data.matchId || '').trim();
    const home = String(
      data.home_team_name || data.homeTeamName || data.home_cn || data.homeCn || ''
    ).trim();
    const away = String(
      data.away_team_name || data.awayTeamName || data.away_cn || data.awayCn || ''
    ).trim();
    if (!isLikelyMatchId(matchId) || !home || !away) return '';
    return matchLink(home, away, matchId, preferReport ? 'report' : 'data');
  }

  function isLikelyMatchId(id) {
    return /^[1-9]\d{6,9}$/.test(String(id || '').trim());
  }

  /** SSR：/finish 的 match_info 在 __NUXT__.data[].originnData */
  function getSsrOriginnData() {
    try {
      const data = window.__NUXT__?.data;
      if (Array.isArray(data)) {
        for (const block of data) {
          const od = block?.originnData || block?.originData;
          if (od?.match_info) return od;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function getMatchListBranchKeys() {
    const kind = getPageListKind();
    if (kind === 'finish') return ['Follow', 'end'];
    if (kind === 'future') return ['future', 'Follow'];
    return ['current'];
  }

  function rowFromApiMatch(m) {
    if (!m || typeof m !== 'object') return null;
    const matchId = String(
      m.match_id ?? m.matchId ?? m.matchID ?? m.id ?? m.mid ?? m.game_id ?? ''
    ).trim();
    if (!isLikelyMatchId(matchId)) return null;

    const homeCn = sanitizeTeamName(
      m.home_team_name_cn ?? m.home_cn ?? m.host_name_cn ?? m.homeTeamCn ?? m.home_cn_name ?? ''
    );
    const awayCn = sanitizeTeamName(
      m.away_team_name_cn ?? m.away_cn ?? m.guest_name_cn ?? m.awayTeamCn ?? m.away_cn_name ?? ''
    );
    const homeEn = sanitizeTeamName(
      m.home_team_name ?? m.home_name ?? m.host_name ?? m.homeTeam ?? m.home_en ?? ''
    );
    const awayEn = sanitizeTeamName(
      m.away_team_name ?? m.away_name ?? m.guest_name ?? m.awayTeam ?? m.away_en ?? ''
    );
    const home = pickDisplayTeamName(homeEn, homeCn);
    const away = pickDisplayTeamName(awayEn, awayCn);
    if (!home || !away) return null;

    const ts = Number(m.match_time ?? m.start_time ?? m.kickoff_time ?? m.time ?? 0);
    const kickoff = ts > 1e9 ? formatKickoffFromTs(ts) : '';
    const hs = m.home_score ?? m.host_score ?? m.homeScore;
    const as = m.away_score ?? m.guest_score ?? m.awayScore;
    let score = '';
    if (hs != null && as != null && `${hs}` !== '' && `${as}` !== '') {
      score = finalizeScore(`${hs}-${as}`, { kickoff });
    } else {
      score = finalizeScore(m.score ?? m.full_score ?? '', { kickoff });
    }

    const cnLabel = String(m.tournament_name_cn ?? m.league_cn ?? m.tournament_cn ?? '').trim();
    const leagueInfo = cnLabel ? leagueFromLabel(cnLabel) : { country: '', league: '', cnLabel: '' };
    const homeSlug = pickLinkTeamName(homeCn, homeEn, home);
    const awaySlug = pickLinkTeamName(awayCn, awayEn, away);

    return {
      country: leagueInfo.country,
      league: leagueInfo.league,
      cnLabel: leagueInfo.cnLabel || cnLabel,
      kickoff,
      home,
      away,
      homeCn: homeCn || (hasCjk(home) ? home : ''),
      awayCn: awayCn || (hasCjk(away) ? away : ''),
      homeSlug,
      awaySlug,
      score,
      matchId,
      link: buildRowLink({ matchId, homeCn, awayCn, homeSlug, awaySlug, home, away }),
    };
  }

  function parseApiFollowResponse(text) {
    let root;
    try {
      root = JSON.parse(text);
    } catch {
      return [];
    }
    if (root?.code != null && root.code !== 0) return [];

    const rows = [];
    const seen = new Set();
    const add = (m) => {
      const r = rowFromApiMatch(m);
      if (!r || seen.has(r.matchId)) return;
      seen.add(r.matchId);
      rows.push(r);
    };

    const looksLikeMatch = (o) =>
      o &&
      typeof o === 'object' &&
      isLikelyMatchId(o.match_id ?? o.matchId ?? o.id ?? o.mid) &&
      (o.home_team_name ||
        o.home_name ||
        o.host_name ||
        o.home_cn ||
        o.home_team_name_cn ||
        o.homeTeam);

    const walk = (node, depth) => {
      if (!node || depth > 12) return;
      if (Array.isArray(node)) {
        node.forEach((item) => {
          if (looksLikeMatch(item)) add(item);
          else walk(item, depth + 1);
        });
        return;
      }
      if (typeof node === 'object') {
        if (looksLikeMatch(node)) add(node);
        for (const k of Object.keys(node)) walk(node[k], depth + 1);
      }
    };

    walk(root.data ?? root.result ?? root, 0);
    return rows;
  }

  function rememberMatchInfo(raw) {
    const s = decodeMatchInfoStr(raw);
    if (s.length > 200 && s.includes('^')) matchInfoCache = s;
  }

  function decodeMatchInfoStr(raw) {
    return decodeUnicodeEscapes(raw).replace(/\\\^/g, '^');
  }

  function kickoffDatePart(kickoff) {
    const s = String(kickoff || '').trim();
    const m = s.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const dm = s.match(/(\d{1,2}):(\d{2})/);
    if (dm) {
      const y = new Date().getFullYear();
      const parts = s.match(/(\d{1,2})-(\d{1,2})/);
      if (parts) return `${y}-${pad2(+parts[1])}-${pad2(+parts[2])}`;
    }
    return '';
  }

  function normalizeKickoffKey(kickoff) {
    return String(kickoff || '')
      .replace(/\s+FT$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function kickoffKeysMatch(a, b) {
    const x = normalizeKickoffKey(a);
    const y = normalizeKickoffKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const tx = x.match(/(\d{1,2}:\d{2})$/);
    const ty = y.match(/(\d{1,2}:\d{2})$/);
    if (tx && ty && tx[1] === ty[1]) {
      const d1 = kickoffDatePart(a);
      const d2 = kickoffDatePart(b);
      return !d1 || !d2 || d1 === d2;
    }
    return false;
  }

  function rowHasBadDomNames(row) {
    return looksLikeBadTeamName(row?.home) || looksLikeBadTeamName(row?.away);
  }

  function lookupNuxtByKickoff(lookup, row) {
    const k = normalizeKickoffKey(row.kickoff);
    if (!k || !lookup?.size) return null;
    if (lookup.has(`kick|${k}`)) return lookup.get(`kick|${k}`);
    const pool = listLookupEntries(lookup).filter((e) => kickoffKeysMatch(e.kickoff, row.kickoff));
    if (pool.length === 1) return pool[0];
    if (pool.length > 1 && row.score) {
      const byScore = pool.filter((e) => e.score === row.score);
      if (byScore.length === 1) return byScore[0];
    }
    return null;
  }

  function lookupNuxtByScoreDate(lookup, row) {
    const sc = String(row.score || '').trim();
    if (!sc || !lookup?.size) return null;
    const d = kickoffDatePart(row.kickoff);
    const pool = listLookupEntries(lookup).filter((e) => {
      if (e.score !== sc) return false;
      if (!d) return true;
      return kickoffDatePart(e.kickoff) === d;
    });
    if (pool.length !== 1) return null;
    const e = pool[0];
    return e;
  }

  function resolveNuxtForDomRow(row, nuxtRows, lookup) {
    const id = String(row.matchId || '').trim();
    if (id && lookup?.has(id)) return lookup.get(id);
    const direct =
      lookupNuxtRow(indexNuxtRows(nuxtRows), row) ||
      lookupNuxtEntry(lookup, row) ||
      lookupNuxtEntryFuzzy(lookup, row);
    if (direct) return direct;
    if (rowHasBadDomNames(row) || !id) {
      const byKick = lookupNuxtByKickoff(lookup, row);
      if (byKick) return byKick;
      const byScore = lookupNuxtByScoreDate(lookup, row);
      if (byScore) return byScore;
    }
    return bestLookupEntry(lookup, row);
  }

  function teamNamesMatch(a, b) {
    const x = normalizeTeamKey(a);
    const y = normalizeTeamKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) return true;
    return false;
  }

  function homeAwayMatchScore(row, entry) {
    if (!entry) return 0;
    let s = 0;
    const homeHit =
      teamNamesMatch(row.home, entry.home) ||
      teamNamesMatch(row.home, entry.homeCn) ||
      teamNamesMatch(row.homeCn, entry.home) ||
      teamNamesMatch(row.homeCn, entry.homeCn);
    const awayHit =
      teamNamesMatch(row.away, entry.away) ||
      teamNamesMatch(row.away, entry.awayCn) ||
      teamNamesMatch(row.awayCn, entry.away) ||
      teamNamesMatch(row.awayCn, entry.awayCn);
    if (homeHit) s += 2;
    if (awayHit) s += 2;
    if (row.score && entry.score && row.score === entry.score) s += 4;
    const d1 = kickoffDatePart(row.kickoff);
    const d2 = kickoffDatePart(entry.kickoff);
    if (d1 && d2 && d1 === d2) s += 1;
    return s;
  }

  function listLookupEntries(lookup) {
    const out = [];
    const seen = new Set();
    if (!lookup?.size) return out;
    for (const entry of lookup.values()) {
      const id = String(entry?.matchId || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(entry);
    }
    return out;
  }

  function bestLookupEntry(lookup, row) {
    const pool = listLookupEntries(lookup);
    let best = null;
    let bestScore = 0;
    for (const e of pool) {
      const s = homeAwayMatchScore(row, e);
      if (s > bestScore) {
        bestScore = s;
        best = e;
      }
    }
    if (bestScore >= 4) return best;
    if (bestScore >= 5 && row.score) return best;
    return null;
  }

  function lookupUniqueByScore(lookup, row) {
    const sc = String(row.score || '').trim();
    if (!sc) return null;
    const pool = listLookupEntries(lookup).filter((e) => e.score === sc);
    if (pool.length !== 1) return null;
    const e = pool[0];
    const s = homeAwayMatchScore(row, e);
    return s >= 2 ? e : null;
  }

  function readInlineNuxtPayloads() {
    const out = [];
    const scripts = document.querySelectorAll('script');
    scripts.forEach((node) => {
      const t = node.textContent || '';
      if (!t.includes('match_info')) return;
      const mi = t.match(/match_info:"((?:\\.|[^"\\])+)"/);
      const ti = t.match(/tournament_info:"((?:\\.|[^"\\])+)"/);
      if (mi) {
        out.push({
          match_info: decodeMatchInfoStr(mi[1]),
          tournament_info: ti ? decodeMatchInfoStr(ti[1]) : '',
        });
      }
    });
    return out;
  }

  function getVueMatchListPayload() {
    const ssr = getSsrOriginnData();
    if (ssr?.match_info) return ssr;
    try {
      const ml = window.__NUXT__?.state?.matchList;
      if (!ml) return null;
      for (const key of getMatchListBranchKeys()) {
        const branch = ml[key];
        const candidates = [
          branch?.originList,
          branch?.originnData,
          branch?.originData,
          branch?.list,
          branch,
        ];
        for (const c of candidates) {
          if (c?.match_info) return c;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function absMatchLink(href) {
    const s = String(href || '').trim();
    if (!s) return '';
    try {
      const url = s.startsWith('http') ? s : new URL(s, location.origin).href;
      return url.replace(/#.*$/, '');
    } catch {
      return s.replace(/#.*$/, '');
    }
  }

  function parseReportLink(link) {
    const url = absMatchLink(link);
    if (!url || !/football-match\/(?:report|data)-/i.test(url)) return null;
    const m = url.match(/football-match\/(?:report|data)-(.+)-vs-(.+)-(\d{6,})(?:\?|#|$)/i);
    if (!m) {
      const id = extractMatchIdFromText(url);
      return id ? { matchId: id, link: url, homeSlug: '', awaySlug: '' } : null;
    }
    let homeSlug = m[1];
    let awaySlug = m[2];
    try {
      homeSlug = decodeURIComponent(homeSlug);
      awaySlug = decodeURIComponent(awaySlug);
    } catch {
      /* keep encoded */
    }
    return { homeSlug, awaySlug, matchId: m[3], link: url };
  }

  function readMatchLinkFromVue(item) {
    const data = readVueMatchItemData(item);
    if (data) {
      const link = buildLinkFromVueData(data, itemHasReportButton(item));
      if (link) return link;
    }
    let el = item;
    for (let i = 0; i < 10 && el; i++) {
      const vm = el.__vue__ || el.__vueParentComponent?.proxy;
      const objs = [vm?.item, vm?.match, vm?.$props?.item, vm?.$props?.match, vm?.$data?.item, vm?.$data?.match];
      for (const o of objs) {
        if (!o || typeof o !== 'object') continue;
        for (const k of ['link', 'url', 'match_url', 'matchUrl', 'report_url', 'reportUrl', 'href']) {
          const u = String(o[k] || '').trim();
          if (/football-match/i.test(u)) return absMatchLink(u);
        }
      }
      el = el.parentElement;
    }
    return '';
  }

  function readMatchLinkFromItem(item) {
    if (!item) return '';
    const fromVue = readMatchLinkFromVue(item);
    if (fromVue) return fromVue;
    const nodes = [
      item,
      item.querySelector?.('.item'),
      ...(item.querySelectorAll?.('a[href*="football-match"], [href*="football-match"], [to*="football-match"], [data-href*="football-match"]') || []),
    ].filter(Boolean);
    for (const el of nodes) {
      for (const attr of ['href', 'to', 'data-href', 'data-url']) {
        const raw = el.getAttribute?.(attr);
        if (!raw || !/football-match/i.test(raw)) continue;
        const url = absMatchLink(raw);
        if (/football-match\/(?:report|data)-/i.test(url)) return url;
      }
    }
    return '';
  }

  function extractMatchIdFromText(text) {
    const s = String(text || '');
    let m = s.match(/football-match\/(?:data|report)-[^"'\\]+-(\d{6,})/i);
    if (m && isLikelyMatchId(m[1])) return m[1];
    m = s.match(/(?:data|report)-[^"'\\]+-(\d{6,})(?:\?|#|["']|$)/i);
    if (m && isLikelyMatchId(m[1])) return m[1];
    const ids = s.match(/\b([1-9]\d{6,9})\b/g);
    if (ids?.length) return ids[ids.length - 1];
    return '';
  }

  function extractMatchIdFromChunk(p) {
    for (let i = 0; i < Math.min(p.length, 6); i++) {
      const t = String(p[i] || '').trim();
      if (isLikelyMatchId(t)) return t;
    }
    for (let i = 0; i < p.length; i++) {
      const t = String(p[i] || '').trim();
      if (isLikelyMatchId(t)) return t;
    }
    return '';
  }

  function linkSlugForTeam(row, side) {
    const cn = side === 'home' ? row.homeCn : row.awayCn;
    const slug = side === 'home' ? row.homeSlug : row.awaySlug;
    const name = side === 'home' ? row.home : row.away;
    if (cn && hasCjk(cn)) return cn;
    if (slug && !looksLikeBadTeamName(slug)) return slug;
    const picked = pickLinkTeamName(cn, name) || String(name || '').trim();
    return looksLikeBadTeamName(picked) ? '' : picked;
  }

  function buildRowLink(row, { preferReport = true } = {}) {
    const matchId = String(row.matchId || '').trim();
    if (!matchId) return '';
    let homeSlug = linkSlugForTeam(row, 'home');
    let awaySlug = linkSlugForTeam(row, 'away');
    if (!homeSlug) homeSlug = String(row.homeCn || row.home || '').trim();
    if (!awaySlug) awaySlug = String(row.awayCn || row.away || '').trim();
    if (!homeSlug || !awaySlug || looksLikeBadTeamName(homeSlug) || looksLikeBadTeamName(awaySlug)) {
      return '';
    }
    return matchLink(homeSlug, awaySlug, matchId, preferReport ? 'report' : 'data');
  }

  function attachLinkMeta(row, nuxtRows, lookup) {
    const nr =
      resolveNuxtForDomRow(row, nuxtRows, lookup) ||
      lookupUniqueByScore(lookup, row) ||
      bestLookupEntry(lookup, row);
    const matchId = String(row.matchId || nr?.matchId || '').trim();
    const merged = {
      ...row,
      matchId,
      homeCn: nr?.homeCn || row.homeCn || '',
      awayCn: nr?.awayCn || row.awayCn || '',
      homeSlug: nr?.homeSlug || row.homeSlug || pickLinkTeamName(nr?.homeCn, row.home) || '',
      awaySlug: nr?.awaySlug || row.awaySlug || pickLinkTeamName(nr?.awayCn, row.away) || '',
      home: pickDisplayFromSources(row.home, nr?.home),
      away: pickDisplayFromSources(row.away, nr?.away),
    };
    const built = buildRowLink(merged, { preferReport: true });
    merged.link = row.link || nr?.link || built || '';
    if (!merged.link && merged.matchId) {
      const dataLink = buildRowLink(merged, { preferReport: false });
      if (dataLink) merged.link = dataLink;
    }
    return merged;
  }

  function kickScoreKey(kickoff, score) {
    return `${String(kickoff || '').replace(/\s+FT$/i, '').trim()}|${String(score || '').trim()}`;
  }

  function indexNuxtRows(nuxtRows) {
    const byId = new Map();
    const byNorm = new Map();
    const byKickScore = new Map();
    const addNorm = (h, a, nr) => {
      if (!h || !a) return;
      byNorm.set(`${normalizeTeamKey(h)}|${normalizeTeamKey(a)}`, nr);
    };
    nuxtRows.forEach((nr) => {
      if (nr.matchId) byId.set(String(nr.matchId), nr);
      addNorm(nr.home, nr.away, nr);
      addNorm(nr.homeCn, nr.awayCn, nr);
      addNorm(nr.home, nr.awayCn, nr);
      addNorm(nr.homeCn, nr.away, nr);
      const kk = kickScoreKey(nr.kickoff, nr.score);
      if (nr.kickoff || nr.score) byKickScore.set(kk, nr);
    });
    return { byId, byNorm, byKickScore };
  }

  function lookupNuxtRow(index, row) {
    if (!index) return null;
    const id = String(row.matchId || '').trim();
    if (id && index.byId.has(id)) return index.byId.get(id);
    const byTeam = index.byNorm.get(`${normalizeTeamKey(row.home)}|${normalizeTeamKey(row.away)}`);
    if (byTeam) return byTeam;
    if (row.homeCn && row.awayCn) {
      const byCn = index.byNorm.get(
        `${normalizeTeamKey(row.homeCn)}|${normalizeTeamKey(row.awayCn)}`
      );
      if (byCn) return byCn;
    }
    if (row.score) {
      const ks = kickScoreKey(row.kickoff, row.score);
      if (index.byKickScore.has(ks)) return index.byKickScore.get(ks);
    }
    return index.byKickScore.get(kickScoreKey(row.kickoff, row.score)) || null;
  }

  function buildNuxtLookup(payload) {
    const lookup = new Map();
    if (!payload?.match_info) return lookup;
    const chunks = String(payload.match_info).split('!!').filter(Boolean);
    chunks.forEach((chunk) => {
      const p = chunk.split('^');
      const matchId = extractMatchIdFromChunk(p);
      if (!matchId) return;
      const ts = Number(p[2]);
      const teams = extractTeamsFromChunk(p) || extractNamesLoose(p);
      if (!teams) {
        lookup.set(matchId, { matchId, home: '', away: '', homeCn: '', awayCn: '', kickoff: '', score: '' });
        return;
      }
      const kickoff = formatKickoffFromTs(ts);
      const score = finalizeScore(extractScoreFromParts(p, teams.afterIdx, ts), { kickoff });
      const home = pickDisplayTeamName(teams.homeEn, teams.homeCn);
      const away = pickDisplayTeamName(teams.awayEn, teams.awayCn);
      const entry = {
        matchId,
        home,
        away,
        homeCn: teams.homeCn,
        awayCn: teams.awayCn,
        homeSlug: pickLinkTeamName(teams.homeCn, teams.homeEn, home),
        awaySlug: pickLinkTeamName(teams.awayCn, teams.awayEn, away),
        kickoff,
        score,
      };
      lookup.set(matchId, entry);
      for (const k of teamLookupKeys(home, away, teams.homeCn, teams.awayCn, score)) {
        if (!lookup.has(k)) lookup.set(k, entry);
      }
      const kk = normalizeKickoffKey(kickoff);
      if (kk && !lookup.has(`kick|${kk}`)) lookup.set(`kick|${kk}`, entry);
      if (kk && score) {
        const sk = `ks|${kk}|${score}`;
        if (!lookup.has(sk)) lookup.set(sk, entry);
      }
    });
    return lookup;
  }

  function lookupNuxtEntry(lookup, row) {
    if (!lookup?.size) return null;
    const id = String(row.matchId || '').trim();
    if (id && lookup.has(id)) return lookup.get(id);
    const kk = normalizeKickoffKey(row.kickoff);
    if (kk) {
      if (lookup.has(`kick|${kk}`)) return lookup.get(`kick|${kk}`);
      if (row.score) {
        const sk = `ks|${kk}|${row.score}`;
        if (lookup.has(sk)) return lookup.get(sk);
      }
    }
    for (const k of teamLookupKeys(row.home, row.away, row.homeCn, row.awayCn, row.score)) {
      if (lookup.has(k)) return lookup.get(k);
    }
    for (const k of teamLookupKeys(row.home, row.away, row.homeCn, row.awayCn, '')) {
      if (lookup.has(k)) return lookup.get(k);
    }
    return null;
  }

  function lookupNuxtEntryFuzzy(lookup, row) {
    const direct = lookupNuxtEntry(lookup, row);
    if (direct) return direct;
    const sh = normalizeTeamKey(row.home);
    const sa = normalizeTeamKey(row.away);
    const sch = normalizeTeamKey(row.homeCn);
    const sca = normalizeTeamKey(row.awayCn);
    const seen = new Set();
    let best = null;
    let bestScore = 0;
    for (const entry of lookup.values()) {
      const mid = String(entry?.matchId || '');
      if (!mid || seen.has(mid)) continue;
      seen.add(mid);
      let s = homeAwayMatchScore(row, entry);
      if (row.score && entry.score && row.score === entry.score) s += 1;
      if (s > bestScore) {
        bestScore = s;
        best = entry;
      }
    }
    if (bestScore >= 4) return best;
    if (bestScore >= 3) return best;
    if (bestScore >= 2 && best && row.kickoff && best.kickoff) {
      const d1 = kickoffDatePart(row.kickoff);
      const d2 = kickoffDatePart(best.kickoff);
      if (d1 && d1 === d2) return best;
    }
    return null;
  }

  function scrapeMatchInfoRaw() {
    const chunks = [];
    const ssr = getSsrOriginnData();
    if (ssr?.match_info) chunks.push(String(ssr.match_info));
    collectNuxtPayloads().forEach((p) => {
      if (p?.match_info) chunks.push(String(p.match_info));
    });
    const vue = getVueMatchListPayload();
    if (vue?.match_info) chunks.push(String(vue.match_info));
    if (matchInfoCache) chunks.push(matchInfoCache);
    if (chunks.length) {
      const merged = chunks.join('!!');
      rememberMatchInfo(merged);
      return merged;
    }
    const html = document.documentElement?.innerHTML || '';
    const re = /match_info[^1-9]{0,20}([1-9]\d{6,9}(?:\^[\s\S]*?)(?=!!|match_info|$))/g;
    let m;
    while ((m = re.exec(html))) {
      const raw = decodeMatchInfoStr(m[1]);
      if (raw.includes('^')) chunks.push(raw);
    }
    return chunks.join('!!');
  }

  function collectNuxtPayloads() {
    const out = [];
    const seen = new Set();
    const add = (p) => {
      if (!p?.match_info) return;
      rememberMatchInfo(p.match_info);
      const sig = `${String(p.match_info).length}:${String(p.match_info).slice(0, 64)}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      out.push(p);
    };
    try {
      const nuxt = window.__NUXT__;
      if (!nuxt) return out;
      if (Array.isArray(nuxt.data)) {
        for (const block of nuxt.data) {
          add(block?.originnData || block?.originData);
        }
      }
      const state = nuxt.state || nuxt.payload?.state;
      if (state) {
        for (const key of Object.keys(state)) {
          const v = state[key];
          add(v?.originnData);
          add(v?.originList);
        }
      }
      const walk = (obj, depth) => {
        if (!obj || depth > 14) return;
        if (typeof obj !== 'object') return;
        if (obj.match_info) add(obj);
        if (Array.isArray(obj)) {
          obj.forEach((item) => walk(item, depth + 1));
          return;
        }
        for (const k of Object.keys(obj)) walk(obj[k], depth + 1);
      };
      walk(nuxt, 0);
      const ml = nuxt.state?.matchList;
      if (ml) {
        for (const key of ['Follow', 'end', 'future', 'current']) {
          add(ml[key]?.originList);
          add(ml[key]?.originnData);
          add(ml[key]?.originData);
        }
      }
      const vuePayload = getVueMatchListPayload();
      if (vuePayload) add(vuePayload);
      readInlineNuxtPayloads().forEach(add);
    } catch {
      /* ignore */
    }
    return out;
  }

  function buildNuxtLookupMerged() {
    const lookup = new Map();
    const merge = (part) => {
      part.forEach((entry, key) => {
        if (!lookup.has(key)) lookup.set(key, entry);
      });
    };
    for (const payload of collectNuxtPayloads()) {
      merge(buildNuxtLookup(payload));
    }
    const scraped = scrapeMatchInfoRaw();
    if (scraped) merge(buildNuxtLookup({ match_info: scraped }));
    return lookup;
  }

  function resolveNuxtForRow(row, nuxtRows, lookup) {
    const index = indexNuxtRows(nuxtRows);
    return (
      lookupNuxtRow(index, row) ||
      lookupNuxtEntry(lookup, row) ||
      lookupNuxtEntryFuzzy(lookup, row) ||
      bestLookupEntry(lookup, row)
    );
  }

  function ensureRowLinks(rows, nuxtRows) {
    const lookup = buildNuxtLookupMerged();
    const nuxt = nuxtRows?.length ? nuxtRows : parseFromNuxt().rows;
    return rows.map((r) => attachLinkMeta(r, nuxt, lookup));
  }

  function normalizeScore(raw) {
    const t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t || t === '-') return '';
    const m = t.match(/(\d+)\s*[-:]\s*(\d+)/);
    if (m) return `${m[1]}-${m[2]}`;
    return '';
  }

  function getNuxtPayload() {
    const vue = getVueMatchListPayload();
    if (vue?.match_info) return vue;
    const all = collectNuxtPayloads();
    if (!all.length) return null;
    if (all.length === 1) return all[0];
    const domCount = collectMatchItems().length || document.querySelectorAll('.matchItem').length;
    let best = all[0];
    let bestScore = -Infinity;
    for (const p of all) {
      const n = String(p.match_info).split('!!').filter(Boolean).length;
      const score = domCount ? -Math.abs(n - domCount) : n;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  function scrapeTournamentInfoRaw() {
    for (const node of document.querySelectorAll('script')) {
      const t = node.textContent || '';
      const m = t.match(/tournament_info:"((?:\\.|[^"\\])+)"/);
      if (m?.[1]) {
        const raw = decodeMatchInfoStr(m[1]);
        if (raw.includes('^')) return raw;
      }
    }
    return '';
  }

  function buildTournamentMap() {
    const merged = {};
    const ingest = (raw) => {
      if (!raw) return;
      Object.assign(merged, parseTournamentInfo(raw));
    };
    const ssr = getSsrOriginnData();
    ingest(ssr?.tournament_info);
    ingest(scrapeTournamentInfoRaw());
    for (const p of collectNuxtPayloads()) ingest(p.tournament_info);
    readInlineNuxtPayloads().forEach((p) => ingest(p.tournament_info));
    ingest(getNuxtPayload()?.tournament_info);
    return merged;
  }

  function getTournamentInfoRaw() {
    const ssr = getSsrOriginnData();
    if (ssr?.tournament_info) return ssr.tournament_info;
    const scraped = scrapeTournamentInfoRaw();
    if (scraped) return scraped;
    const vue = getVueMatchListPayload();
    if (vue?.tournament_info) return vue.tournament_info;
    for (const p of collectNuxtPayloads()) {
      if (p?.tournament_info) return p.tournament_info;
    }
    return getNuxtPayload()?.tournament_info || '';
  }

  function parseMatchInfoToRows(matchInfo, tournamentInfo) {
    const tourMap = buildTournamentMap();
    if (tournamentInfo && String(tournamentInfo).includes('^')) {
      Object.assign(tourMap, parseTournamentInfo(String(tournamentInfo)));
    }
    const rows = [];
    const chunks = String(matchInfo || '').split('!!').filter(Boolean);

    chunks.forEach((chunk) => {
      const p = chunk.split('^');
      if (p.length < 10) return;

      const matchId = extractMatchIdFromChunk(p);
      if (!matchId) return;
      const tourId = p[1];
      const ts = Number(p[2]);
      const teams = extractTeamsFromChunk(p) || extractNamesLoose(p);
      if (!teams) return;

      const homeCn = sanitizeTeamName(teams.homeCn);
      const homeEn = sanitizeTeamName(teams.homeEn);
      const awayCn = sanitizeTeamName(teams.awayCn);
      const awayEn = sanitizeTeamName(teams.awayEn);
      const home = pickDisplayTeamName(homeEn, homeCn);
      const away = pickDisplayTeamName(awayEn, awayCn);
      if (!home || !away || looksLikeBadTeamName(home) || looksLikeBadTeamName(away)) return;
      const tour = tourMap[tourId] || { country: '', league: '', cnLabel: '' };
      if (isBlockedMatchRow({ home, away, homeCn, awayCn, cnLabel: tour.cnLabel, country: tour.country, league: tour.league })) {
        return;
      }

      const kickoff = formatKickoffFromTs(ts);
      const score = extractScoreFromParts(p, teams.afterIdx, ts);
      const homeSlug = pickLinkTeamName(homeCn, homeEn, home);
      const awaySlug = pickLinkTeamName(awayCn, awayEn, away);
      rows.push({
        country: tour.country,
        league: tour.league,
        cnLabel: tour.cnLabel || '',
        kickoff,
        home,
        away,
        homeCn,
        awayCn,
        homeSlug,
        awaySlug,
        score: finalizeScore(score, { kickoff }),
        matchId,
        link: buildRowLink({ homeCn, awayCn, homeSlug, awaySlug, home, away, matchId }),
      });
    });
    return rows;
  }

  function getAllNuxtRows() {
    const matchInfo = scrapeMatchInfoRaw() || getVueMatchListPayload()?.match_info || getNuxtPayload()?.match_info;
    const fromInfo = matchInfo ? parseMatchInfoToRows(matchInfo, getTournamentInfoRaw()) : [];
    const kind = getPageListKind();
    const fromApi = kind !== 'current' && apiFollowRows?.length ? apiFollowRows : [];
    return dedupeRows([...fromInfo, ...fromApi]);
  }

  function parseFromNuxt() {
    const rows = getAllNuxtRows();
    return { rows, debug: `nuxt ${rows.length}${apiFollowRows.length ? ` api${apiFollowRows.length}` : ''}` };
  }

  /** finish/future：DOM 与 NUXT 列表顺序一致时按索引对齐 matchId */
  function zipDomWithNuxtRows(domRows, nuxtRows) {
    if (!domRows.length || !nuxtRows.length) return null;
    if (domRows.length !== nuxtRows.length) return null;
    const lookup = buildNuxtLookupMerged();
    return domRows.map((dr, i) => {
      const nr = nuxtRows[i];
      const row = nr ? mergePair(nr, dr) : { ...dr };
      row.matchId = String(row.matchId || nr?.matchId || '').trim();
      return attachLinkMeta(row, nuxtRows, lookup);
    });
  }

  function parseKickoffFromDom(timeEl, status) {
    const ems = timeEl?.querySelectorAll?.('em') || [];
    const parts = [...ems].map((e) => (e.textContent || '').trim()).filter(Boolean);
    let day = '';
    let time = '';
    if (parts.length >= 2) {
      day = parts[0];
      time = parts[1];
    } else if (parts.length === 1) {
      if (/^\d{1,2}:\d{2}$/.test(parts[0])) time = parts[0];
      else day = parts[0];
    }
    const year = new Date().getFullYear();
    let dateStr = '';
    const dm = day.match(/^(\d{1,2})-(\d{1,2})$/);
    if (dm) dateStr = `${year}-${pad2(+dm[1])}-${pad2(+dm[2])}`;
    if (dateStr && time) return `${dateStr} ${time}`;
    const st = String(status || '').trim();
    if (/已完赛|完场|完赛|FT/i.test(st)) return dateStr ? `${dateStr} FT` : 'FT';
    return dateStr || time || '';
  }

  function readTeamNames(teamEl) {
    const nameEl = teamEl?.querySelector('.name');
    const cn = (nameEl?.textContent || teamEl?.textContent || '').trim();
    const en =
      nameEl?.getAttribute('title')?.trim() ||
      teamEl?.getAttribute('title')?.trim() ||
      teamEl?.querySelector('.name_en, .en, [class*="english"]')?.textContent?.trim() ||
      '';
    const cnName = hasCjk(cn) ? cn : hasCjk(en) ? en : '';
    return {
      display: pickDisplayTeamName(cn, en),
      link: pickLinkTeamName(cn, en),
      cnName,
    };
  }

  function getPageListKind() {
    const path = location.pathname || '';
    if (/\/future(?:\/|$|\?)/i.test(path)) return 'future';
    if (/\/finish(?:\/|$|\?)/i.test(path)) return 'finish';
    if (/\/current(?:\/|$|\?)/i.test(path)) return 'current';
    return 'other';
  }

  function getPageListSelectors() {
    const kind = getPageListKind();
    if (kind === 'future') {
      return ['.futurelist', '#nuxtMain .futurelist', '[class*="futurelist"]'];
    }
    if (kind === 'finish') {
      return [
        '.finishs',
        '.finishlist',
        '.endlist',
        '.channel.finish',
        '.channel.other',
        '.currentlist .finishs',
        '#nuxtMain .finishs',
        '#nuxtMain .finishlist',
      ];
    }
    if (kind === 'current') {
      return ['.currentlist', '#nuxtMain .currentlist', '[class*="currentlist"]'];
    }
    return MATCH_LIST_ROOT_SEL.split(',').map((s) => s.trim());
  }

  function isMatchItemVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function isExcludedListAncestor(el) {
    if (!el?.closest) return false;
    const kind = getPageListKind();
    if (kind === 'finish') {
      return !!el.closest('.futurelist');
    }
    if (kind === 'future') {
      return !!(el.closest('.finishlist') || el.closest('.endlist') || el.closest('.finishs'));
    }
    if (kind === 'current') {
      return !!(el.closest('.finishlist') || el.closest('.endlist') || el.closest('.futurelist'));
    }
    return false;
  }

  /** 加载中时可见项常少于实际节点：优先取容器内全部 .matchItem */
  function pickMatchItemNodes(nodes) {
    if (!nodes.length) return nodes;
    const vis = nodes.filter(isMatchItemVisible);
    if (!vis.length) return nodes;
    if (nodes.length > vis.length + 1) return nodes;
    return vis;
  }

  /** 收集当前页 .matchItem */
  function collectMatchItems() {
    const kind = getPageListKind();

    if (kind === 'finish') {
      const finishItems = [
        ...document.querySelectorAll('.finishs .channel.other .matchItem, .finishs .matchItem'),
      ];
      if (finishItems.length) return pickMatchItemNodes(finishItems);
    }

    if (kind === 'future') {
      for (const sel of ['.futurelist', '#nuxtMain .futurelist']) {
        const any = [...document.querySelectorAll(`${sel} .matchItem`)];
        if (any.length) return pickMatchItemNodes(any);
      }
    }

    for (const sel of getPageListSelectors()) {
      const any = [...document.querySelectorAll(`${sel} .matchItem`)];
      if (any.length) return pickMatchItemNodes(any);
    }

    const all = [...document.querySelectorAll('.matchItem')];
    if (!all.length) return [];

    const pool = pickMatchItemNodes(all);
    if (kind === 'other') return pool;

    const filtered = pool.filter((el) => !isExcludedListAncestor(el));
    return filtered.length ? filtered : pool;
  }

  function hasMatchDataSource() {
    if (matchInfoCache?.includes('^')) return true;
    if (getSsrOriginnData()?.match_info) return true;
    if (apiFollowRows.length) return true;
    if (getVueMatchListPayload()?.match_info) return true;
    return false;
  }

  function isPageReadyForParse() {
    if (!document.body) return false;
    const items = collectMatchItems().length;
    if (items > 0) return true;
    return hasMatchDataSource();
  }

  function scoreParseResult(rows) {
    if (!rows?.length) return 0;
    const links = rows.filter((r) => r.link).length;
    return rows.length * 10000 + links * 500 + (rows.filter((r) => r.matchId).length || 0);
  }

  function isLiveMatchRow(row) {
    const st = String(row?.status || '').trim();
    return /进行中|上半场|下半场|补时|\d+['']|^\d+\+|加时中/i.test(st);
  }

  function filterNuxtRowsForPageKind(nuxtRows) {
    const kind = getPageListKind();
    if (kind === 'finish') {
      return nuxtRows.filter((r) => !isLiveMatchRow(r));
    }
    if (kind === 'future') {
      return nuxtRows.filter((r) => {
        if (isLiveMatchRow(r)) return false;
        if (/\sFT$/i.test(r.kickoff || '') || /已完赛|完场|完赛/i.test(r.status || '')) {
          return false;
        }
        if (r.score && !isPlaceholderScore(r.score)) return false;
        return true;
      });
    }
    return nuxtRows;
  }

  function getMatchListRoot() {
    const items = collectMatchItems();
    if (items.length) {
      return (
        items[0].closest('.finishlist, .endlist, .futurelist, .currentlist, .footMatchList') ||
        document.querySelector('#nuxtMain') ||
        document.body
      );
    }
    for (const sel of getPageListSelectors()) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return document.querySelector('#nuxtMain');
  }

  function normalizeTeamKey(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[\s\u00a0._\-–—'']/g, '')
      .replace(/(fc|sc|cf|ac|fk|bk)$/i, '');
  }

  function teamPairKey(home, away) {
    return `${home}|${away}`;
  }

  function readMatchIdFromVue(item) {
    const data = readVueMatchItemData(item);
    if (data) {
      const id = String(data.match_id || data.matchId || '').trim();
      if (isLikelyMatchId(id)) return id;
    }
    let el = item;
    for (let i = 0; i < 8 && el; i++) {
      const vm = el.__vue__ || el.__vueParentComponent?.proxy;
      const cand = [
        vm?.matchId,
        vm?.match_id,
        vm?.match?.id,
        vm?.match?.matchId,
        vm?.item?.matchId,
        vm?.item?.match_id,
        vm?.item?.id,
        vm?.$props?.matchId,
        vm?.$props?.match?.id,
        vm?.$props?.item?.matchId,
        vm?.$data?.matchId,
        vm?.$data?.match?.id,
        vm?.$data?.item?.matchId,
      ];
      for (const c of cand) {
        const id = String(c || '').trim();
        if (isLikelyMatchId(id)) return id;
      }
      el = el.parentElement;
    }
    return '';
  }

  function readMatchIdFromItem(item) {
    if (!item) return '';
    const vueId = readMatchIdFromVue(item);
    if (vueId) return vueId;
    const anchors = item.querySelectorAll?.('a[href*="/football-match/"]') || [];
    for (const a of anchors) {
      const id = extractMatchIdFromText(a.href || a.getAttribute('href'));
      if (id) return id;
    }
    const nodes = [item, item.querySelector('.item'), ...(item.querySelectorAll?.('*') || [])].filter(
      Boolean
    );
    const attrNames = [
      'href',
      'data-href',
      'data-url',
      'to',
      'data-to',
      'data-matchid',
      'data-match-id',
      'data-id',
      'data-mid',
      'data-gameid',
    ];
    for (const el of nodes) {
      for (const name of attrNames) {
        const raw = el.getAttribute?.(name);
        if (!raw) continue;
        const id =
          extractMatchIdFromText(raw) ||
          (/^\d{6,}$/.test(String(raw).trim()) ? String(raw).trim() : '');
        if (id) return id;
      }
    }
    const html = item.outerHTML || '';
    const m = html.match(/(?:match[Ii]d|match_id|gameId)["']?\s*[:=]\s*["']?([1-9]\d{6,9})/);
    return m && isLikelyMatchId(m[1]) ? m[1] : '';
  }

  function indexDomRows(domRows) {
    const byId = new Map();
    const byTeam = new Map();
    const byNorm = new Map();
    const byKickScore = new Map();
    domRows.forEach((r) => {
      if (r.matchId) byId.set(r.matchId, r);
      byTeam.set(teamPairKey(r.home, r.away), r);
      const nk = `${normalizeTeamKey(r.home)}|${normalizeTeamKey(r.away)}`;
      byNorm.set(nk, r);
      const kk = `${(r.kickoff || '').replace(/\s+FT$/i, '').trim()}|${r.score || ''}`;
      if (r.kickoff) byKickScore.set(kk, r);
    });
    return { byId, byTeam, byNorm, byKickScore };
  }

  function lookupDomRow(index, row) {
    if (!index) return null;
    if (row.matchId && index.byId.has(row.matchId)) return index.byId.get(row.matchId);
    const exact = index.byTeam.get(teamPairKey(row.home, row.away));
    if (exact) return exact;
    const norm = index.byNorm.get(`${normalizeTeamKey(row.home)}|${normalizeTeamKey(row.away)}`);
    if (norm) return norm;
    const kk = `${(row.kickoff || '').replace(/\s+FT$/i, '').trim()}|${row.score || ''}`;
    if (row.kickoff && index.byKickScore.has(kk)) return index.byKickScore.get(kk);
    return null;
  }

  function applyDomLeague(row, dom) {
    if (!dom || !(dom.cnLabel || dom.league)) return row;
    return finalizeRowLeague({
      ...row,
      country: dom.country,
      league: dom.league,
      cnLabel: dom.cnLabel || dom.league,
    });
  }

  function parseFromDom() {
    const rows = [];
    const items = collectMatchItems();
    if (!items.length) return { rows, debug: `dom items 0 (${getPageListKind()})` };

    items.forEach((item) => {
      const row = item.querySelector('.item');
      if (!row) return;

      const vueData = readVueMatchItemData(item);
      const hasReport = itemHasReportButton(item);
      const matchId = readMatchIdFromItem(item);
      const domLink = readMatchLinkFromItem(item);
      const linkMeta = parseReportLink(domLink);
      const leagueLabel = readLeagueLabelFromItem(item);
      const { country, league, cnLabel } = leagueFromLabel(leagueLabel);
      const status = (row.querySelector('.status')?.textContent || '').trim();
      const kickoff = parseKickoffFromDom(row.querySelector('.time'), status);
      const homeT = readTeamNames(row.querySelector('.team.home'));
      const awayT = readTeamNames(row.querySelector('.team.away'));
      const homeDisplay = vueData?.home_team_name || homeT.display;
      const awayDisplay = vueData?.away_team_name || awayT.display;
      if (!homeDisplay || !awayDisplay) return;
      if (isBlockedMatchRow({ home: homeDisplay, away: awayDisplay, cnLabel: leagueLabel, league, country })) {
        return;
      }

      const score = finalizeScore(normalizeScore(row.querySelector('.score')?.textContent), {
        status,
        kickoff,
      });

      const resolvedId = matchId || linkMeta?.matchId || String(vueData?.match_id || vueData?.matchId || '').trim();
      const builtLink =
        domLink ||
        (vueData ? buildLinkFromVueData(vueData, hasReport) : '') ||
        (resolvedId ? buildRowLink({
          matchId: resolvedId,
          home: homeDisplay,
          away: awayDisplay,
          homeCn: homeDisplay,
          awayCn: awayDisplay,
        }, { preferReport: hasReport }) : '');

      rows.push(finalizeRowLeague({
        country,
        league,
        kickoff,
        status,
        home: homeDisplay,
        away: awayDisplay,
        homeCn: homeDisplay,
        awayCn: awayDisplay,
        homeSlug: homeT.link || linkMeta?.homeSlug || homeDisplay,
        awaySlug: awayT.link || linkMeta?.awaySlug || awayDisplay,
        score,
        link: builtLink,
        matchId: resolvedId,
        cnLabel: cnLabel || leagueLabel,
      }));
    });

    return { rows, debug: `dom ${rows.length}` };
  }

  function mergePair(nr, dom) {
    const domLinkMeta = parseReportLink(dom?.link);
    const kickoff = dom ? pickKickoff(dom.kickoff, nr.kickoff) : nr.kickoff;
    const status = dom?.status || nr.status || '';
    const row = {
      ...nr,
      home: pickDisplayFromSources(dom?.home, nr.home),
      away: pickDisplayFromSources(dom?.away, nr.away),
      homeCn: dom?.homeCn || nr.homeCn || '',
      awayCn: dom?.awayCn || nr.awayCn || '',
      homeSlug: dom?.homeSlug || nr.homeSlug || domLinkMeta?.homeSlug || '',
      awaySlug: dom?.awaySlug || nr.awaySlug || domLinkMeta?.awaySlug || '',
      kickoff,
      status,
      score: dom
        ? finalizeScore(nr.score || dom.score, { status, kickoff })
        : finalizeScore(nr.score, { status, kickoff }),
      matchId: String(nr.matchId || dom?.matchId || domLinkMeta?.matchId || '').trim(),
      link: dom?.link || nr.link || domLinkMeta?.link || '',
    };
    row.link = row.link || buildRowLink(row);
    return dom ? applyDomLeague(row, dom) : row;
  }

  function mergeAllSources(domRows, nuxtRows) {
    const lookup = buildNuxtLookupMerged();
    const allNuxt = nuxtRows?.length ? nuxtRows : getAllNuxtRows();
    const sortedNuxt = [...allNuxt].sort((a, b) =>
      String(a.kickoff || '').localeCompare(String(b.kickoff || ''))
    );

    /** 列表页以 DOM 为准 */
    if (domRows.length) {
      return domRows.map((dr, idx) => {
        let nr = resolveNuxtForDomRow(dr, allNuxt, lookup);
        if (!nr && sortedNuxt[idx]) nr = sortedNuxt[idx];
        const row = nr ? mergePair(nr, dr) : { ...dr };
        return attachLinkMeta(row, allNuxt, lookup);
      });
    }
    if (!allNuxt.length) return [];
    return allNuxt.map((nr) => attachLinkMeta({ ...nr }, allNuxt, lookup));
  }

  function enrichLeagueFromDom(rows, domRows) {
    if (!domRows?.length) return rows;
    const idx = indexDomRows(domRows);
    let out = rows.map((r) => applyDomLeague(r, lookupDomRow(idx, r)));
    out = out.map((r, i) => {
      if (isAllowedLeague(finalizeRowLeague(r).country, finalizeRowLeague(r).league)) return r;
      const dom = domRows[i];
      return dom ? applyDomLeague(r, dom) : r;
    });
    return out;
  }

  function enrichKickoffFromDom(rows) {
    const items = collectMatchItems();
    if (!items.length) return rows;

    const statusByTeam = new Map();
    const kickoffByTeam = new Map();
    items.forEach((item) => {
      const row = item.querySelector('.item');
      if (!row) return;
      const home = readTeamNames(row.querySelector('.team.home')).display;
      const away = readTeamNames(row.querySelector('.team.away')).display;
      const status = (row.querySelector('.status')?.textContent || '').trim();
      const kickoff = parseKickoffFromDom(row.querySelector('.time'), status);
      if (home && away) {
        statusByTeam.set(`${home}|${away}`, status);
        if (kickoff) kickoffByTeam.set(`${home}|${away}`, kickoff);
      }
    });

    return rows.map((r) => {
      const key = `${r.home}|${r.away}`;
      const status = statusByTeam.get(key) || r.status || '';
      const domKick = kickoffByTeam.get(key) || '';
      let kickoff = pickKickoff(domKick, r.kickoff);
      if (/已完赛|完场|完赛/i.test(status)) {
        kickoff = hasKickoffClock(kickoff) ? kickoff : formatFinishedKickoff(kickoff);
      }
      const score = finalizeScore(r.score, { status, kickoff });
      const changed = kickoff !== r.kickoff || score !== r.score || status !== r.status;
      return changed ? { ...r, status, kickoff, score } : r;
    });
  }

  function isStaleNuxt(domRows, nuxtRows) {
    if (!nuxtRows.length || !domRows.length) return false;
    const domIds = new Set(domRows.map((r) => r.matchId).filter(Boolean));
    const nuxtIds = nuxtRows.map((r) => r.matchId).filter(Boolean);
    if (domIds.size && nuxtIds.length) {
      const overlap = nuxtIds.filter((id) => domIds.has(id)).length;
      if (overlap / nuxtIds.length < 0.25) return true;
    }
    const diff = Math.abs(domRows.length - nuxtRows.length);
    return diff >= Math.max(3, Math.floor(domRows.length * 0.35));
  }


  function readActiveDateLabel() {
    const active = document.querySelector(
      '.tabs strong.active, .tabs .active, .tabs .on, .date-tab.active, [class*="date"].active, [class*="calendar"].active'
    );
    if (active?.textContent?.trim()) return active.textContent.trim();
    const bar = document.querySelector('[class*="date"], [class*="calendar"], [class*="picker"]');
    return bar?.textContent?.trim() || '';
  }

  function pageFingerprint() {
    const n = collectMatchItems().length;
    const qs = location.search || '';
    const date = readActiveDateLabel();
    return `${location.pathname}|${qs}|${date}|${n}`;
  }

  function resetPageCaches() {
    apiFollowRows = [];
    matchInfoCache = '';
    bestParseScore = -1;
    lastRows = [];
    lastPreparedRows = [];
    autoUploadDone = false;
    clearTimeout(autoUploadTimer);
    autoUploadTimer = null;
  }

  function scheduleLoadRetries() {
    const gen = ++loadRetryGen;
    LOAD_RETRY_MS.forEach((ms) => {
      setTimeout(() => {
        if (gen !== loadRetryGen) return;
        onContentMaybeChanged(true);
      }, ms);
    });
  }

  function onContentMaybeChanged(force) {
    const path = location.pathname || '';
    if (path !== lastPathname) {
      lastPathname = path;
      resetPageCaches();
      scheduleLoadRetries();
    }

    const fp = pageFingerprint();
    if (!force && fp === lastFingerprint) return;
    lastFingerprint = fp;
    scheduleParse(force ? 150 : PARSE_DEBOUNCE_MS);
  }

  function parseAll() {
    const dom = parseFromDom();
    const nuxt = parseFromNuxt();
    let rows = mergeAllSources(dom.rows, nuxt.rows);
    const kind = getPageListKind();
    if (!rows.length && nuxt.rows.length) {
      let fallback = kind === 'current' ? nuxt.rows : filterNuxtRowsForPageKind(nuxt.rows);
      if (!fallback.length) fallback = nuxt.rows.filter((r) => !isLiveMatchRow(r));
      rows = fallback.map((nr) => ({
        ...nr,
        link: nr.link || buildRowLink(nr) || '',
      }));
    }
    const enriched = sanitizeRowScores(
      ensureRowLinks(enrichLeagueFromDom(enrichKickoffFromDom(rows), dom.rows), nuxt.rows)
    ).map(finalizeRowLeague);
    const stale = isStaleNuxt(dom.rows, nuxt.rows) ? ' stale-nuxt' : '';
    const linkN = enriched.filter((r) => r.link).length;
    const lookupN = buildNuxtLookupMerged().size;
    const debug = `${nuxt.debug} | ${dom.debug} | ${getPageListKind()} | link ${linkN}/${enriched.length} | idx ${lookupN}${stale}`;
    return { rows: dedupeRows(enriched), debug };
  }

  function updatePanelSubtitle(text) {
    const el = document.getElementById(PANEL_ID)?.querySelector('#vz-livescores-debug-count');
    if (el) el.textContent = text;
  }

  function scheduleParse(ms) {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(runParse, ms);
  }

  function runParse() {
    try {
      if (!isPageReadyForParse()) {
        lastDebug = `waiting | dom ${collectMatchItems().length} | src ${hasMatchDataSource() ? 1 : 0}`;
        if (!lastCache.length) {
          applyParseResult();
        }
        return;
      }

      const result = parseAll();
      const sc = scoreParseResult(result.rows);

      if (sc < bestParseScore && lastCache.length) {
        lastDebug = `${result.debug} | keep ${lastCache.length}`;
        applyParseResult();
        return;
      }

      bestParseScore = sc;
      lastCache = result.rows;
      lastDebug = result.debug;
      if (lastCache.length) console.log(LOG_PREFIX, lastCache.length, lastDebug);
      applyParseResult();
    } catch (e) {
      if (!lastCache.length) {
        lastCache = [];
        lastDebug = `error ${e?.message || e}`;
        applyParseResult();
      }
    }
  }

  function applyParseResult() {
    ensurePanel();

    if (!lastCache.length) {
      lastPreparedRows = [];
      updateLeagueBar([]);
      renderPanel([], {
        subtitle: lastDebug?.startsWith('waiting') ? 'Loading…' : 'No data',
        emptyMessage: lastDebug?.startsWith('waiting')
          ? `页面仍在加载（${lastDebug}），脚本会自动重试；也可点 Refresh。`
          : `未解析到比赛（${lastDebug || 'empty'}）。请等待页面加载后点 Refresh。`,
      });
      return;
    }

    lastPreparedRows = lastCache.map(finalizeRowLeague);
    updateLeagueBar(lastPreparedRows);
    const rows = applyDisplayLeagueFilter(lastPreparedRows);
    if (!rows.length) {
      lastRows = [];
      const nonTarget = getNonTargetLeagues(lastPreparedRows);
      renderPanel([], {
        subtitle: displaySubtitle(0),
        emptyMessage:
          nonTarget.length > 0
            ? `已解析 ${lastPreparedRows.length} 场，白名单内为 0。可点上方「其他联赛」按钮显示。（${lastDebug}）`
            : `已解析 ${lastPreparedRows.length} 场，白名单内为 0。（${lastDebug}）`,
      });
      return;
    }

    const sig = rows.map(rowKey).join(';');
    if (sig !== lastRows.map(rowKey).join(';')) {
      lastRows = rows;
      console.groupCollapsed(`${LOG_PREFIX} ${rows.length} matches | ${lastFingerprint}`);
      console.table(rows);
      console.groupEnd();
    }
    renderPanel(rows, { subtitle: displaySubtitle(rows.length) });
    scheduleAutoUpload();
  }

  function removeStalePanel() {
    const old = document.getElementById(PANEL_ID);
    if (old && old.dataset.vzVer !== SCRIPT_VER) old.remove();
  }

  function ensurePanel() {
    removeStalePanel();
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.dataset.vzVer = SCRIPT_VER;

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
      #${PANEL_ID} th.col-link,#${PANEL_ID} td.col-link{
        width:52px;max-width:52px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        word-break:normal;text-align:center;
      }
      #${PANEL_ID} td.col-link a{
        display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      }
      #${PANEL_ID} th{position:sticky;top:0;background:#0f172a;color:#94a3b8;z-index:1}
      #${PANEL_ID} a{color:#38bdf8}
      #${PANEL_ID} .empty{padding:16px;color:#94a3b8}
      #${PANEL_ID} .sub{font-size:11px;color:#94a3b8;margin-left:8px}
      #${PANEL_ID} .upload-bar{
        flex:0 0 auto;display:flex;align-items:center;flex-wrap:wrap;gap:6px;
        padding:6px 12px;background:#0b1220;border-bottom:1px solid #334155;font-size:11px;
      }
      #${PANEL_ID} .upload-bar label{color:#94a3b8}
      #${PANEL_ID} .upload-bar select,#${PANEL_ID} .upload-bar input{
        margin:0;padding:3px 8px;border-radius:6px;border:1px solid #475569;background:#1f2937;color:#e5e7eb;font-size:11px;
      }
      #${PANEL_ID} .upload-bar input{flex:1 1 200px;min-width:160px;max-width:420px}
      #${PANEL_ID} .upload-bar .upload-status{flex:1 1 100%;color:#94a3b8;word-break:break-all}
      #${PANEL_ID} .hdr button:disabled{opacity:.55;cursor:not-allowed}
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
    `;

    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    const title = document.createElement('strong');
    title.textContent = 'Vzhan | Debug';
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.id = 'vz-livescores-debug-count';
    sub.textContent = '五大+英冠德乙荷甲澳超日职法乙+瑞典/挪威/芬兰/韩K+欧冠欧联欧协';
    const btnWrap = document.createElement('div');
    const btnUpload = document.createElement('button');
    btnUpload.type = 'button';
    btnUpload.dataset.action = 'upload';
    btnUpload.textContent = 'Upload';
    const btnR = document.createElement('button');
    btnR.type = 'button';
    btnR.dataset.action = 'refresh';
    btnR.textContent = 'Refresh';
    const btnT = document.createElement('button');
    btnT.type = 'button';
    btnT.dataset.action = 'toggle';
    btnT.textContent = 'Collapse';
    btnWrap.append(btnUpload, btnR, btnT);
    hdr.append(title, sub, btnWrap);

    const uploadCfg = loadUploadConfig();
    const uploadBar = document.createElement('div');
    uploadBar.className = 'upload-bar';
    const envLabel = document.createElement('label');
    envLabel.textContent = '环境';
    const envSel = document.createElement('select');
    envSel.id = 'vz-livescores-upload-env';
    envSel.innerHTML = UPLOAD_ENVS.map((e) => `<option value="${e.id}">${e.label}</option>`).join('');
    envSel.value = uploadCfg.env;
    const urlLabel = document.createElement('label');
    urlLabel.textContent = '接口';
    const urlInp = document.createElement('input');
    urlInp.id = 'vz-livescores-upload-url';
    urlInp.type = 'url';
    urlInp.placeholder = UPLOAD_API_PATH;
    urlInp.value = getUploadUrl(uploadCfg);
    urlInp.title = '可编辑；按当前环境分别保存。HTTP 外站经 Tampermonkey 直连，无需 HTTPS/CORS';
    const uploadStatus = document.createElement('span');
    uploadStatus.id = 'vz-livescores-upload-status';
    uploadStatus.className = 'upload-status';
    uploadBar.append(envLabel, envSel, urlLabel, urlInp, uploadStatus);

    const leagueBar = document.createElement('div');
    leagueBar.className = 'league-bar';
    leagueBar.id = 'vz-livescores-league-bar';

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
    btnR.addEventListener('click', () => {
      bestParseScore = -1;
      autoUploadDone = false;
      clearTimeout(autoUploadTimer);
      autoUploadTimer = null;
      onContentMaybeChanged(true);
    });
    btnT.addEventListener('click', () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      uploadBar.style.display = hidden ? '' : 'none';
      if (leagueBar.dataset.hasLeagues === '1') leagueBar.style.display = hidden ? 'flex' : 'none';
      btnT.textContent = hidden ? 'Collapse' : 'Expand';
    });
    return panel;
  }

  let leagueBarSearchBlurTimer = null;

  function bindLeagueBarSearchFocus(leagueBar, leagueSearch) {
    leagueSearch.addEventListener('focus', () => {
      clearTimeout(leagueBarSearchBlurTimer);
      leagueBar.classList.add('search-focus');
      leagueBarExpanded = true;
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
    btn.textContent = `${item.label} (${item.count})`;
    btn.title = item.label;
    return btn;
  }

  function createLeagueBtn(item, { selected = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'league-btn';
    btn.dataset.leagueKey = item.label;
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
        const blob = leagueLabelSearchBlob(btn.dataset.leagueKey);
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
    if (!leagueBar || leagueBar.id !== 'vz-livescores-league-bar') return;
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
    const leagueBar = panel?.querySelector('#vz-livescores-league-bar');
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
    const leagueBar = panel.querySelector('#vz-livescores-league-bar');
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
      if (h === 'Link') th.className = 'col-link';
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      [r.country, r.cnLabel || r.league, r.kickoff, r.home, r.score, r.away].forEach((t) => {
        const td = document.createElement('td');
        td.textContent = t || '';
        tr.appendChild(td);
      });
      const tdL = document.createElement('td');
      tdL.className = 'col-link';
      if (r.link) {
        const a = document.createElement('a');
        a.href = r.link;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = linkDisplayLabel(r.link);
        a.title = r.link;
        tdL.appendChild(a);
      }
      tr.appendChild(tdL);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    body.appendChild(table);
  }

  function watchDom() {
    const attach = () => {
      const root = document.querySelector('#nuxtMain') || document.body;
      if (!root) return false;
      if (observedRoot === root && domObserver) return true;
      if (domObserver) domObserver.disconnect();
      observedRoot = root;
      domObserver = new MutationObserver(() => {
        clearTimeout(domWatchTimer);
        domWatchTimer = setTimeout(() => onContentMaybeChanged(false), PARSE_DEBOUNCE_MS);
      });
      domObserver.observe(root, { childList: true, subtree: true });
      return true;
    };
    if (!attach()) setTimeout(attach, 800);
  }

  function watchDateControls() {
    document.addEventListener(
      'click',
      (e) => {
        if (e.target.closest?.(`#${PANEL_ID}`)) return;
        const hit = e.target.closest?.(
          '.tabs strong, .tabs button, .tabs li, .tabs span, .tabs a, ' +
            '[class*="date"], [class*="calendar"], [class*="picker"], ' +
            '[class*="day"], .prev, .next, .arrow'
        );
        if (!hit) return;
        const label = `${hit.textContent || ''} ${hit.className || ''}`;
        if (
          /date|calendar|picker|day|tab|今天|昨天|明天|前天|后天|prev|next|arrow|周|月/i.test(label) ||
          /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(label) ||
          /^\d{1,2}-\d{1,2}$/.test((hit.textContent || '').trim())
        ) {
          onContentMaybeChanged(true);
        }
      },
      true
    );
  }

  function hookHistory() {
    const wrap = (fn) =>
      function (...args) {
        const ret = fn.apply(this, args);
        setTimeout(() => onContentMaybeChanged(true), 0);
        return ret;
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
  }

  function hookMatchInfoNetwork() {
    const save = (url, text) => {
      if (typeof text !== 'string' || text.length < 80) return;
      const u = String(url || '');

      if (/mapi\.shemen365\.com|api\.shemen365\.com/i.test(u) && text.includes('match_info')) {
        const m = text.match(/"match_info"\s*:\s*"((?:\\.|[^"\\])+)"/);
        if (m?.[1]) rememberMatchInfo(m[1]);
      }

      if (/football-follow\/(end|future|current|live)/i.test(u)) {
        const parsed = parseApiFollowResponse(text);
        if (parsed.length) {
          apiFollowRows = parsed;
          scheduleParse(300);
        }
      }

      if (text.includes('match_info')) {
        const m = text.match(/"match_info"\s*:\s*"((?:\\.|[^"\\])+)"/);
        if (m?.[1]) rememberMatchInfo(m[1]);
        else if (text.includes('!!') && text.includes('^')) rememberMatchInfo(text);
        scheduleParse(300);
        return;
      }

      if (/[1-9]\d{6,9}\^/.test(text) && text.includes('!!')) {
        rememberMatchInfo(text);
        scheduleParse(300);
      }
    };

    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        return origFetch.apply(this, args).then((res) => {
          try {
            const clone = res.clone();
            clone
              .text()
              .then((t) => save(url, t))
              .catch(() => {});
          } catch {
            /* ignore */
          }
          return res;
        });
      };
    }

    const XHR = window.XMLHttpRequest;
    if (XHR?.prototype) {
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function (method, url, ...rest) {
        this.__vzUrl = String(url || '');
        return open.call(this, method, url, ...rest);
      };
      XHR.prototype.send = function (...args) {
        this.addEventListener('load', function () {
          try {
            save(this.__vzUrl || '', String(this.responseText || ''));
          } catch {
            /* ignore */
          }
        });
        return send.apply(this, args);
      };
    }
  }

  hookMatchInfoNetwork();

  function boot() {
    lastPathname = location.pathname || '';
    const ssr = getSsrOriginnData();
    if (ssr?.match_info) rememberMatchInfo(ssr.match_info);
    ensurePanel();
    watchDom();
    watchDateControls();
    hookHistory();
    lastFingerprint = '';
    scheduleLoadRetries();
    window.addEventListener('load', () => onContentMaybeChanged(true), { once: true });
    window.addEventListener('popstate', () => {
      resetPageCaches();
      scheduleLoadRetries();
    });
    setInterval(() => {
      if (isPageReadyForParse()) onContentMaybeChanged(false);
    }, 5000);
  }

  boot();
})();
