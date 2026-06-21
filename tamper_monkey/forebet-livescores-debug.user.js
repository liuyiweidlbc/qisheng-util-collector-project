// ==UserScript==
// @name         Forebet Predictions Debug
// @namespace    https://www.forebet.com/
// @version      1.4.3
// @description  Forebet predictions: top-5, UCL/UEL/UECL, WC, Championship + upload + extra leagues
// @match        https://www.forebet.com/*
// @match        http://www.forebet.com/*
// @exclude      *://*/football/matches/*
// @exclude      *://*/football-match-previews/*
// @exclude      *://*/news-about-the-site/*
// @exclude      *://*/contact-us*
// @exclude      *://*/terms-of-use*
// @exclude      *://*/privacy-policy*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  const LOG_PREFIX = '[Forebet Debug]';
  const PANEL_ID = 'fb-livescores-debug-panel';
  const SCRIPT_VER = '1.4.3';
  const KAZAKH_TEAM_HINT_RE =
    /\b(turan|ekibastuz|kairat|astana|ordabasy|aktobe|tobol|atyrau|shakhter|kaisar|okzhetpes|zetysu|altai|akbulak|taraz|elimai|kaspiy)\b/i;
  /** Non-England countries that also use "Premier League" in the name */
  const NON_ENGLAND_COUNTRY_HINT_RE =
    /\b(egypt|saudi|uae|emirates|qatar|kuwait|bahrain|oman|jordan|lebanon|syria|iraq|iran|israel|turkey|türkiye|malaysia|india|pakistan|bangladesh|thailand|vietnam|indonesia|singapore|china|japan|korea|australia|canada|usa|united\s*states|mexico|brazil|argentina|colombia|chile|peru|ecuador|venezuela|uruguay|paraguay|bolivia|russia|ukraine|poland|czech|romania|hungary|greece|portugal|netherlands|belgium|scotland|wales|ireland|northern\s*ireland|austria|switzerland|denmark|sweden|norway|finland|iceland|cyprus|malta|albania|serbia|croatia|slovenia|slovakia|bulgaria|bosnia|georgia|armenia|azerbaijan|kazakhstan|uzbekistan|kyrgyzstan|tajikistan|turkmenistan|mongolia|ghana|nigeria|kenya|south\s*africa|morocco|tunisia|algeria|senegal|ivory\s*coast|cameroon|uganda|tanzania|zambia|zimbabwe|angola|mozambique|ethiopia|sudan|libya|congo|rwanda|botswana|namibia|mauritania|gambia|guinea|haiti|jamaica|trinidad|costa\s*rica|panama|honduras|guatemala|el\s*salvador|nicaragua|belize|cuba|puerto\s*rico|dominican)\b/i;
  const ENGLAND_COUNTRY_RE = /^(england|uk|united\s*kingdom|great\s*britain|gb|eng)$/i;
  const EXTRA_LEAGUE_CFG_KEY = 'fb-livescores-extra-leagues';
  const LEAGUE_BAR_EXPANDED_KEY = 'fb-livescores-league-bar-expanded';
  const LEAGUE_BAR_AUTO_COLLAPSE_N = 8;
  const UPLOAD_TIMEOUT_MS = 30000;
  const AUTO_UPLOAD_DELAY_MS = 3000;
  const SOURCE_SITE = 'forebet';
  const UPLOAD_CFG_KEY = 'fb-livescores-upload-cfg';
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
  /** Forebet row/column league badges only */
  const SHORT_TAG_SEL =
    '.shortag, .lshort, .lnschema, .stscr, [class*="shortag"], [class*="lshort"], [class*="lnschema"]';
  /** UEFA/WC tags on badge text (UECL before ECL; EL = Europa League on Forebet) */
  const FB_LETTER_CODES_RE =
    /^(UECL|UCL|UEL|EL|EPL|ECL|CH|WC)(?=(?:[A-Z][a-z]|[A-Z]{2,}|\d{1,2}\/|[^A-Za-z]|$))/i;
  /** Forebet uses De1/Es1/Fr1 (not \\b-safe in JS — digit follows letters) */
  const FB_SHORT_CODE_RE =
    /(?:^|[^A-Za-z0-9])(UECL|UCL|UEL|EL|EPL|ECL|CH|WC|ES1|ES2|FR1|FR2|IT1|IT2|GE1|GE2|DE1|DE2|EN1|EN2|SP1)(?![A-Za-z0-9])/i;
  /** Forebet row short tags (EPL, Es1, UCL, …) → canonical country/league */
  const FB_SHORT_CODES = {
    EPL: { country: 'England', league: 'Premier League' },
    EN1: { country: 'England', league: 'Premier League' },
    CH: { country: 'England', league: 'Championship' },
    EN2: { country: 'England', league: 'Championship' },
    UCL: { country: 'Europe', league: 'Champions League' },
    CL: { country: 'Europe', league: 'Champions League' },
    UEL: { country: 'Europe', league: 'Europa League' },
    EL: { country: 'Europe', league: 'Europa League' },
    UECL: { country: 'Europe', league: 'Europa Conference League' },
    ECL: { country: 'Europe', league: 'Europa Conference League' },
    ES1: { country: 'Spain', league: 'La Liga' },
    ES2: { country: 'Spain', league: 'La Liga 2' },
    SP1: { country: 'Spain', league: 'La Liga' },
    SPA: { country: 'Spain', league: 'La Liga' },
    IT1: { country: 'Italy', league: 'Serie A' },
    IT2: { country: 'Italy', league: 'Serie B' },
    GE1: { country: 'Germany', league: 'Bundesliga' },
    GE2: { country: 'Germany', league: '2. Bundesliga' },
    DE1: { country: 'Germany', league: 'Bundesliga' },
    DE2: { country: 'Germany', league: '2. Bundesliga' },
    FR1: { country: 'France', league: 'Ligue 1' },
    FR2: { country: 'France', league: 'Ligue 2' },
    WC: { country: 'World', league: 'World Cup' },
  };
  const EXCLUDE_COMP_RE =
    /\b(women|woman|frauen|feminine|femenin|femminil|feminino|female|girls|u19|u20|u21|u23|youth|junior|reserve|amateur)\b/i;
  /** Women's teams: "Barcelona W", "Team (W)" */
  const EXCLUDE_TEAM_EXTRA_RE = /\(\s*w\s*\)|\sW$/i;
  const PARSE_DEBOUNCE_MS = 350;
  const MATCH_HREF_RE = /\/football\/matches\//i;
  const ROW_SEL =
    'div.rcnt, [class*="rcnt"], tr.schema, tr[class*="schema"], .tnms, .tnmsf';

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
  let leagueBarSearchBlurTimer = null;

  function isListPage() {
    return !/\/football\/matches\//i.test(location.pathname);
  }

  function leagueFromShortCode(code) {
    const key = String(code || '')
      .replace(/\s+/g, '')
      .toUpperCase();
    if (FB_SHORT_CODES[key]) return { ...FB_SHORT_CODES[key] };
    const m = key.match(/^([A-Z]{2})(\d)$/);
    if (m && FB_SHORT_CODES[`${m[1]}${m[2]}`]) return { ...FB_SHORT_CODES[`${m[1]}${m[2]}`] };
    return null;
  }

  function extractForebetShortCode(text, { badgeOnly = false } = {}) {
    const raw = String(text || '').trim();
    if (!raw || raw.length > 20) return '';

    const compact = raw.replace(/\s+/g, '');
    const letterTag = compact.match(FB_LETTER_CODES_RE);
    if (letterTag && leagueFromShortCode(letterTag[1])) return letterTag[1];

    if (badgeOnly) return '';

    const atStart = compact.match(/^([A-Za-z]{2}\d)/i);
    if (atStart && leagueFromShortCode(atStart[1])) return atStart[1];

    const blob = raw.replace(/\s+/g, ' ');
    const m = blob.match(FB_SHORT_CODE_RE);
    if (m && leagueFromShortCode(m[1])) return m[1];

    const m2 = blob.match(/(?:^|[^A-Za-z0-9])([A-Za-z]{2}\d)(?![A-Za-z0-9])/i);
    if (m2 && leagueFromShortCode(m2[1])) return m2[1];

    const m3 = blob.match(/(?:^|[^A-Za-z0-9])(UECL|UCL|UEL|EL|EPL|ECL|CH|WC)(?![A-Za-z0-9])/i);
    if (m3 && leagueFromShortCode(m3[1])) return m3[1];
    return '';
  }

  function shortCodeFromBadgeEl(el) {
    if (!el?.matches) return '';
    if (!el.matches(SHORT_TAG_SEL) && !el.closest?.(SHORT_TAG_SEL)) {
      const t = (el.textContent || '').trim();
      if (t.length > 16) return '';
    }
    const badge = el.matches?.(SHORT_TAG_SEL) ? el : el.querySelector?.(SHORT_TAG_SEL);
    const text = (badge || el).textContent || '';
    return extractForebetShortCode(text, { badgeOnly: true }) || extractForebetShortCode(text);
  }

  function leagueFromShortBadge(container) {
    if (!container?.querySelectorAll) return null;
    for (const el of container.querySelectorAll(SHORT_TAG_SEL)) {
      const code = shortCodeFromBadgeEl(el);
      const mapped = code ? leagueFromShortCode(code) : null;
      if (mapped?.league) return mapped;
    }
    return null;
  }

  function isEnglandCountry(country) {
    const c = String(country || '').trim();
    if (!c) return false;
    if (NON_ENGLAND_COUNTRY_HINT_RE.test(c)) return false;
    return ENGLAND_COUNTRY_RE.test(c);
  }

  /** Only true English EPL — not Egypt/Saudi/etc. "Premier League" */
  function isEnglishPremierLeague(country, league) {
    const l = String(league || '').trim();
    if (!/premier\s*league/i.test(l)) return false;
    const c = String(country || '').trim();
    const blob = `${c} ${l}`.trim();
    if (NON_ENGLAND_COUNTRY_HINT_RE.test(blob)) return false;
    if (/\bEPL\b/i.test(blob) || /\bEN1\b/i.test(blob)) return true;
    if (isEnglandCountry(c)) return true;
    if (/england/i.test(blob)) return true;
    return false;
  }

  function isUefaClubCompetition(country, league) {
    const l = String(league || '').trim();
    if (!/champions\s*league|europa\s*league|europa\s*conference|conference\s*league/i.test(l)) return false;
    const c = String(country || '').trim();
    return !c || /europe|uefa/i.test(c);
  }

  function isUefaShortCode(code) {
    return /^(UCL|UEL|EL|UECL|ECL)$/i.test(String(code || '').trim());
  }

  function parseCountryOnlyHeader(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 48 || t.length < 3) return '';
    if (/\d|\/|@|1x2|predictions|round|group|vs\b/i.test(t)) return '';
    if (/league|cup|division|liga|serie|bundesliga|championship|conference|europa|champions/i.test(t))
      return '';
    if (NON_ENGLAND_COUNTRY_HINT_RE.test(t)) return t;
    if (/^(england|spain|italy|germany|france|netherlands|portugal|belgium|scotland|wales|turkey|türkiye)$/i.test(t))
      return t;
    return '';
  }

  function inferDomesticLeagueFromTeams(home, away) {
    const blob = `${home} ${away}`;
    if (KAZAKH_TEAM_HINT_RE.test(blob)) {
      return { country: 'Kazakhstan', league: 'Premier League' };
    }
    return null;
  }

  function sanitizeLeagueForMatch(home, away, resolved, row, root) {
    const r = resolved || { country: '', league: '' };
    if (!isUefaClubCompetition(r.country, r.league)) return r;

    let rowCode = '';
    for (const el of row?.querySelectorAll?.(SHORT_TAG_SEL) || []) {
      const c = shortCodeFromBadgeEl(el);
      if (c) {
        rowCode = c;
        break;
      }
    }
    if (isUefaShortCode(rowCode)) return r;

    const domestic = inferDomesticLeagueFromTeams(home, away);
    if (domestic) return domestic;

    const section = leagueFromSectionHeader(row, root);
    if (section?.country && !isUefaClubCompetition(section.country, section.league)) return section;

    return { country: '', league: '' };
  }

  function isEnglishChampionship(country, league) {
    const l = String(league || '').trim();
    if (!/\bchampionship\b/i.test(l) || /league\s*(one|two)/i.test(l)) return false;
    const blob = `${country} ${league}`;
    if (NON_ENGLAND_COUNTRY_HINT_RE.test(blob)) return false;
    return isEnglandCountry(country) || /england/i.test(blob);
  }

  function normalizeLeague(country, league) {
    const fromShort = leagueFromShortCode(league) || leagueFromShortCode(country);
    if (fromShort) return fromShort;

    let c = String(country || '').trim();
    let l = String(league || '').trim();
    const blob = `${c} ${l}`.trim();

    if (/\bEPL\b/i.test(blob) && !NON_ENGLAND_COUNTRY_HINT_RE.test(blob))
      return { country: 'England', league: 'Premier League' };
    if (/\bUCL\b/i.test(blob)) return { country: 'Europe', league: 'Champions League' };
    if (/\bUEL\b/i.test(blob)) return { country: 'Europe', league: 'Europa League' };
    if (/\bEL\b/i.test(blob) && /europa/i.test(blob)) return { country: 'Europe', league: 'Europa League' };
    if (/\b(UECL|ECL)\b/i.test(blob)) return { country: 'Europe', league: 'Europa Conference League' };
    if (/uefa[\s-]?champions[\s-]?league/i.test(blob) && !/women|afc|caf|youth|u19|u20|u21/i.test(blob))
      return { country: 'Europe', league: 'Champions League' };
    if (/uefa[\s-]?europa[\s-]?league/i.test(blob) && !/conference/i.test(blob))
      return { country: 'Europe', league: 'Europa League' };
    if (/uefa[\s-]?europa[\s-]?conference|europa[\s-]?conference[\s-]?league/i.test(blob))
      return { country: 'Europe', league: 'Europa Conference League' };
    if (/\bEs1\b/i.test(blob)) return { country: 'Spain', league: 'La Liga' };
    if (/\bIt1\b/i.test(blob)) return { country: 'Italy', league: 'Serie A' };
    if (/\b(De1|Ge1)\b/i.test(blob)) return { country: 'Germany', league: 'Bundesliga' };
    if (/\bFr1\b/i.test(blob)) return { country: 'France', league: 'Ligue 1' };
    if (/\bWC\b/i.test(blob)) return { country: 'World', league: 'World Cup' };
    if (/world[\s-]?cup/i.test(blob) && !/women|u20|u17|qual|club/i.test(blob))
      return { country: 'World', league: 'World Cup' };

    if (isEnglishPremierLeague(c, l)) return { country: 'England', league: 'Premier League' };
    if (/premier[\s-]?league/i.test(l) && c) return { country: c, league: l };
    if (isEnglishChampionship(c, l)) return { country: 'England', league: 'Championship' };
    if (/la[\s-]?liga/i.test(l) && !/2|segunda/i.test(l))
      return { country: c || 'Spain', league: 'La Liga' };
    if (/serie[\s-]?a/i.test(l) && !/serie[\s-]?b/i.test(blob))
      return { country: c || 'Italy', league: 'Serie A' };
    if (/bundesliga/i.test(l) && !/2\.?\s*bundesliga/i.test(blob))
      return { country: c || 'Germany', league: 'Bundesliga' };
    if (/ligue[\s-]?1/i.test(l)) return { country: c || 'France', league: 'Ligue 1' };

    if (/^premier[\s-]?league$/i.test(l)) {
      if (isEnglishPremierLeague(c, l)) return { country: 'England', league: 'Premier League' };
      return { country: c, league: l };
    }
    if (/^championship$/i.test(l) && !/league\s*(one|two)/i.test(blob)) {
      if (isEnglishChampionship(c, l)) return { country: 'England', league: 'Championship' };
      return { country: c, league: l };
    }

    return { country: c, league: l };
  }

  function isAllowedLeague(country, league) {
    const norm = normalizeLeague(country, league);
    country = norm.country;
    league = norm.league;
    const n = [country, league].filter(Boolean).join(' - ');
    if (!n) return false;
    if (EXCLUDE_COMP_RE.test(n)) return false;

    if (isEnglishPremierLeague(country, league) && !/Championship\s*Group|Relegation/i.test(n)) return true;
    if (isEnglishChampionship(country, league) && !/Group|Playoff|League\s*One|League\s*Two/i.test(n))
      return true;
    if (/(Spain|La\s*Liga)/i.test(n) && /La\s*Liga/i.test(n) && !/La\s*Liga\s*2/i.test(n)) return true;
    if (/Italy/i.test(n) && /Serie\s*A/i.test(n) && !/Serie\s*B/i.test(n)) return true;
    if (/Germany/i.test(n) && /Bundesliga/i.test(n) && !/2\.\s*Bundesliga/i.test(n)) return true;
    if (/France/i.test(n) && /Ligue\s*1/i.test(n) && !/Ligue\s*2/i.test(n)) return true;
    if (/\bChampions\s*League\b/i.test(n) && !/AFC|CAF/i.test(n)) return true;
    if (/\bEuropa\s*League\b/i.test(n) && !/Conference/i.test(n)) return true;
    if (/\b(Conference|Europa\s*Conference)\s*League\b/i.test(n)) return true;
    if (/\bWorld\s*Cup\b/i.test(n) && !/women|u20|u17|qual|club/i.test(n)) return true;
    return false;
  }

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
    return false;
  }

  function isExcludedMatch(r) {
    if (!r) return true;
    const label = leagueFilterLabel(r.country, r.league);
    if (label && EXCLUDE_COMP_RE.test(label)) return true;
    if (isExcludedTeam(r.home) || isExcludedTeam(r.away)) return true;
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
      if (!isValidRow(r) || isExcludedMatch(r) || !isAllowedLeague(r.country, r.league)) continue;
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
      if (!isValidRow(r) || isExcludedMatch(r)) continue;
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

  function rowKey(r) {
    return [r.home, r.away, r.league, r.kickoff, r.prob, r.pred, r.predScore, r.ft].join('|');
  }

  function matchRowBox(row) {
    if (!row) return null;
    if (row.matches?.(ROW_SEL) || row.classList?.contains('rcnt')) return row;
    return row.closest(ROW_SEL) || row;
  }

  /** Prob.% 1/X/2 — from .fprc or concatenated digits in row */
  function parseProb(row) {
    const box = matchRowBox(row);
    if (!box) return '';

    const fprc = box.querySelector?.('.fprc, [class*="fprc"]');
    if (fprc) {
      const nums = [...fprc.querySelectorAll('span, b, strong, i, div')]
        .map((el) => el.textContent.trim())
        .filter((t) => /^\d{1,3}$/.test(t));
      if (nums.length >= 3) return `${nums[0]}/${nums[1]}/${nums[2]}`;

      const raw = fprc.textContent.replace(/\s+/g, '');
      const m6 = raw.match(/^(\d{2})(\d{2})(\d{1,2})$/);
      if (m6) return `${m6[1]}/${m6[2]}/${m6[3]}`;
    }

    return '';
  }

  /** Combined Forebet token like 12-0, X1-1, 21-2 → pick + predicted score */
  function parsePredCombo(box) {
    for (const el of box.querySelectorAll('span, div')) {
      if (el.querySelector?.('a[href*="/football/matches/"]')) continue;
      const t = (el.textContent || '').replace(/\s+/g, '');
      const m = t.match(/^([12X])(\d+)[\u2013-](\d+)$/i);
      if (m) return { pick: m[1].toUpperCase(), score: `${m[2]}-${m[3]}` };
    }
    return null;
  }

  /** Pred 1/X/2 */
  function parsePred(row) {
    const box = matchRowBox(row);
    if (!box) return '';

    const combo = parsePredCombo(box);
    if (combo?.pick) return combo.pick;

    const pickEl = box.querySelector?.(
      '.predict, .prw, [class*="predict"], span[class*="prcol"], [class*="fpr-p"]'
    );
    if (pickEl) {
      const t = pickEl.textContent.replace(/\s+/g, '').trim();
      if (/^[12X]$/i.test(t)) return t.toUpperCase();
    }

    for (const el of box.querySelectorAll('span, div')) {
      if (el.children.length) continue;
      const t = el.textContent.trim();
      if (/^[12X]$/i.test(t)) return t.toUpperCase();
    }
    return '';
  }

  /** Predicted score (forepr), not FT result */
  function parsePredScore(row) {
    const box = matchRowBox(row);
    if (!box) return '';

    const combo = parsePredCombo(box);
    if (combo?.score) return combo.score;

    const fore = box.querySelector?.('.forepr, span.forepr, [class*="forepr"]');
    if (fore) {
      const m = fore.textContent.match(/(\d+)\s*[-\u2013]\s*(\d+)/);
      if (m) return `${m[1]}-${m[2]}`;
    }

    for (const el of box.querySelectorAll('.ex_sc, [class*="ex_sc"]')) {
      const t = el.textContent.replace(/\s+/g, ' ').trim();
      const m = t.match(/^(\d+)\s*[-\u2013]\s*(\d+)/);
      if (m) return `${m[1]}-${m[2]}`;
    }
    return '';
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

  function slugTitle(s) {
    return String(s || '')
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  function leagueFromHref(href) {
    const h = String(href || '');
    let m = h.match(/football-tips-and-predictions-for-([^/]+)\/([^/?#]+)/i);
    if (m) return { country: slugTitle(m[1]), league: slugTitle(m[2]) };
    m = h.match(/tips-and-predictions-for-([^/]+)\/([^/?#]+)/i);
    if (m) return { country: slugTitle(m[1]), league: slugTitle(m[2]) };
    m = h.match(/predictions-([^/]+)\/([^/?#]+)/i);
    if (m) return { country: slugTitle(m[1]), league: slugTitle(m[2]) };
    m = h.match(
      /\/(south-america|north-central-america|predictions-world|predictions-europe|predictions-asia|predictions-africa)\/([^/?#]+)/i
    );
    if (m) return { country: slugTitle(m[1]), league: slugTitle(m[2]) };
    return { country: '', league: '' };
  }

  function leagueFromLabel(label) {
    const t = String(label || '').replace(/\s+/g, ' ').trim();
    if (!t) return { country: '', league: '' };
    const known = [
      'Premier League',
      'Championship',
      'La Liga',
      'Serie A',
      'Serie B',
      'Bundesliga',
      'Ligue 1',
      'Ligue 2',
      'Champions League',
      'Europa League',
      'Europa Conference League',
      'Conference League',
      'World Cup',
    ];
    for (const name of known) {
      const re = new RegExp(`^(.+?)\\s+${name.replace(/\s/g, '\\s*')}$`, 'i');
      const m = t.match(re);
      if (m) return { country: m[1].trim(), league: name };
    }
    if (/^(Champions|Europa|Conference)\s+League/i.test(t)) {
      return { country: 'Europe', league: t };
    }
    if (/world\s*cup/i.test(t)) return { country: 'World', league: t };
    return { country: '', league: t };
  }

  function leagueFromPageMeta() {
    const fromUrl = leagueFromHref(location.pathname);
    if (fromUrl.league) return fromUrl;
    const h1 = (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim();
    if (h1 && !/predictions?\s+for|today|tomorrow|weekend|all football/i.test(h1)) {
      const lf = leagueFromLabel(h1);
      if (lf.league) return lf;
    }
    return { country: '', league: '' };
  }

  function isInSidebar(el) {
    return !!el.closest(
      '#menu, #nav, .menu, .mnu, #mnu, .sidebar, #sidebar, #left, .left, .left_block, .countries, .country_list, #countries, .league_nav, .my_leagues, .favleagues, #header, .header, nav, .nav_menu'
    );
  }

  function isLeagueHeaderLink(a) {
    const h = a.getAttribute('href') || '';
    if (!h || MATCH_HREF_RE.test(h) || /\/teams\//i.test(h)) return false;
    if (
      !/(football-tips-and-predictions-for|tips-and-predictions-for|predictions-europe|predictions-world|predictions-asia|predictions-africa|predictions-aruba|south-america|north-central-america)\//i.test(
        h
      )
    )
      return false;
    const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 90 || /^preview$/i.test(t)) return false;
    return true;
  }

  function isContentLeagueHeaderLink(a, root) {
    if (isInSidebar(a)) return false;
    if (root && !root.contains(a)) return false;
    return isLeagueHeaderLink(a);
  }

  function parseShortCodeFromRow(row) {
    if (!row) return '';

    for (const el of row.querySelectorAll(SHORT_TAG_SEL)) {
      const c = shortCodeFromBadgeEl(el);
      if (c) return c;
    }

    const tr = row.closest('tr');
    if (tr?.cells?.length) {
      for (let i = 0; i < Math.min(3, tr.cells.length); i++) {
        const c = shortCodeFromBadgeEl(tr.cells[i]);
        if (c) return c;
      }
    }

    return '';
  }

  function isLeagueSpecificPage() {
    return /football-tips-and-predictions-for|tips-and-predictions-for|predictions-europe|predictions-world|predictions-asia|predictions-africa/i.test(
      location.pathname
    );
  }

  function leagueHeaderFromAnchor(a, root) {
    if (!a || !isContentLeagueHeaderLink(a, root)) return null;
    const lf = leagueFromHref(a.href);
    const ll = leagueFromLabel(a.textContent);
    const norm = normalizeLeague(
      lf.country || ll.country || '',
      lf.league || ll.league || ''
    );
    return norm.league ? norm : null;
  }

  function leagueFromSectionHeader(el, root) {
    if (!el) return null;
    let node = el;
    while (node && node !== root && node !== document.body) {
      let prev = node.previousElementSibling;
      while (prev) {
        if (isInSidebar(prev)) {
          prev = prev.previousElementSibling;
          continue;
        }
        const fromBadge = leagueFromShortBadge(prev);
        if (fromBadge) {
          if (!isUefaClubCompetition(fromBadge.country, fromBadge.league)) return fromBadge;
          const isHeading =
            prev.matches?.('[class*="heading"], [class*="head_ln"], .headln, h2, h3, h4') ||
            !!prev.querySelector?.('[class*="heading"], h2, h3, h4');
          const uefaHref = prev.querySelector?.(
            'a[href*="uefa-europa"], a[href*="uefa-champions"], a[href*="predictions-europe/uefa"]'
          );
          if (isHeading && uefaHref) return fromBadge;
        }

        if (prev.tagName === 'A') {
          const hit = leagueHeaderFromAnchor(prev, root);
          if (hit) return hit;
        }
        const links = prev.querySelectorAll?.(
          'a[href*="football-tips-and-predictions-for"], a[href*="tips-and-predictions-for"], a[href*="predictions-europe"], a[href*="predictions-world"], a[href*="predictions-asia"], a[href*="predictions-africa"]'
        );
        if (links?.length) {
          for (let i = links.length - 1; i >= 0; i--) {
            const hit = leagueHeaderFromAnchor(links[i], root);
            if (hit) return hit;
          }
        }

        const leagueSlugLink = prev.querySelector?.(
          'a[href*="premier-league"], a[href*="premier_league"], a[href*="football-tips-and-predictions-for-"], a[href*="tips-and-predictions-for-"]'
        );
        if (leagueSlugLink?.href) {
          const lf = leagueFromHref(leagueSlugLink.href);
          if (lf.league) {
            const norm = normalizeLeague(lf.country, lf.league);
            if (norm.league) return norm;
          }
        }

        const headerText = (prev.textContent || '').replace(/\s+/g, ' ').trim();
        if (
          headerText.length > 2 &&
          headerText.length < 100 &&
          !prev.querySelector?.('a[href*="/football/matches/"]')
        ) {
          const countryOnly = parseCountryOnlyHeader(headerText);
          if (countryOnly) {
            const subLink = prev.querySelector?.(
              'a[href*="football-tips-and-predictions-for-"], a[href*="tips-and-predictions-for-"]'
            );
            if (subLink?.href) {
              const lf = leagueFromHref(subLink.href);
              if (lf.league) {
                const norm = normalizeLeague(lf.country || countryOnly, lf.league);
                if (norm.league) return norm;
              }
            }
            return { country: countryOnly, league: '' };
          }
          const ll = leagueFromLabel(headerText);
          if (ll.league) {
            const norm = normalizeLeague(ll.country, ll.league);
            if (norm.league) return norm;
          }
        }

        if (prev.querySelector?.('a[href*="/football/matches/"]') || prev.matches?.(ROW_SEL)) break;
        prev = prev.previousElementSibling;
      }
      node = node.parentElement;
    }
    return null;
  }

  function resolveLeagueForRow(row, league, root, teams) {
    const fromRowBadge = leagueFromShortBadge(row);
    if (fromRowBadge?.league) {
      return sanitizeLeagueForMatch(teams?.home, teams?.away, fromRowBadge, row, root);
    }

    const short = parseShortCodeFromRow(row);
    if (short) {
      const mapped = leagueFromShortCode(short);
      if (mapped) {
        return sanitizeLeagueForMatch(teams?.home, teams?.away, mapped, row, root);
      }
    }

    const section = leagueFromSectionHeader(row, root);
    if (section?.league) {
      return sanitizeLeagueForMatch(teams?.home, teams?.away, section, row, root);
    }
    if (section?.country && !isUefaClubCompetition(section.country, section.league)) {
      const walkedDom = normalizeLeague(section.country, league.league);
      if (walkedDom.league && !isUefaClubCompetition(walkedDom.country, walkedDom.league)) {
        return sanitizeLeagueForMatch(teams?.home, teams?.away, walkedDom, row, root);
      }
      return sanitizeLeagueForMatch(
        teams?.home,
        teams?.away,
        { country: section.country, league: league.league || '' },
        row,
        root
      );
    }

    const walked = normalizeLeague(league.country, league.league);
    if (walked.country && walked.league) {
      if (isUefaClubCompetition(walked.country, walked.league)) {
        /* do not inherit UEFA league from earlier sections without row badge */
      } else if (
        !/premier\s*league/i.test(walked.league) ||
        isEnglishPremierLeague(walked.country, walked.league)
      ) {
        return sanitizeLeagueForMatch(teams?.home, teams?.away, walked, row, root);
      }
    }

    const domestic = inferDomesticLeagueFromTeams(teams?.home, teams?.away);
    if (domestic) return domestic;

    if (isLeagueSpecificPage()) {
      const meta = leagueFromPageMeta();
      if (meta.league) {
        const norm = normalizeLeague(meta.country, meta.league);
        if (norm.league) {
          return sanitizeLeagueForMatch(teams?.home, teams?.away, norm, row, root);
        }
      }
    }
    return sanitizeLeagueForMatch(teams?.home, teams?.away, walked, row, root);
  }

  function countMatches(root) {
    if (!root) return 0;
    return root.querySelectorAll('a[href*="/football/matches/"]').length;
  }

  function rootLabel(el) {
    if (!el) return 'none';
    if (el.id) return `#${el.id}`;
    if (el.classList?.length) return `${el.tagName.toLowerCase()}.${el.classList[0]}`;
    return el.tagName?.toLowerCase() || 'node';
  }

  /** Prefer container that actually holds match rows (empty #content is common). */
  function findParseRoot(doc) {
    const d = doc || document;
    const body = d.body;
    if (!body) return null;

    const firstMatch = d.querySelector('a[href*="/football/matches/"]');
    if (firstMatch) {
      const near =
        firstMatch.closest(
          '#main, #maincontent, #main-content, .contentmiddle, .content-middle, .predict, .predictions, article, main, [role="main"]'
        ) || firstMatch.closest('#content');
      if (near && countMatches(near) > 0) return near;
    }

    const candidates = d.querySelectorAll(
      '#main, #maincontent, #main-content, .contentmiddle, .content-middle, .predict, .predictions, article, main, [role="main"], #content'
    );
    let best = body;
    let bestScore = countMatches(body);
    candidates.forEach((el) => {
      if (el.closest(`#${PANEL_ID}`)) return;
      const score = countMatches(el);
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    });
    return best;
  }

  function parseKickoff(row, linkEl) {
    const dateEl = row.querySelector?.('.date_bah');
    if (dateEl) {
      const d = dateEl.textContent.replace(/\s+/g, ' ').trim();
      if (d) return d;
    }
    const blob = (linkEl?.textContent || '').replace(/\s+/g, ' ');
    const m = blob.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i);
    if (m) return `${m[1]} ${m[2]}`;
    const m2 = blob.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    return m2 ? m2[1] : '';
  }

  /** FT / live result (not prediction) */
  function parseFtScore(row) {
    const box = matchRowBox(row) || row;
    const ft = box.querySelector?.('.l_min.ftscr, .l_min.l_scr.ftscr, .l_scr.ftscr');
    if (ft) {
      const t = ft.textContent.replace(/\s+/g, ' ').trim();
      const m = t.match(/(\d+)\s*[-\u2013]\s*(\d+)/);
      if (m) return `${m[1]}-${m[2]}`;
    }
    const sc = box.querySelector?.('.l_scr.ftscr, .l_min.l_scr');
    if (sc) {
      const t = sc.textContent.replace(/\s+/g, ' ').trim();
      const m = t.match(/(\d+)\s*[-\u2013]\s*(\d+)/);
      if (m) return `${m[1]}-${m[2]}`;
    }
    const blob = (box.textContent || '').replace(/\s+/g, ' ');
    const ftm = blob.match(/FT\s*(\d+)\s*[-\u2013]\s*(\d+)/i);
    if (ftm) return `${ftm[1]}-${ftm[2]}`;
    return '';
  }

  function teamsFromLink(a) {
    const home = (a.querySelector?.('.homeTeam')?.textContent || '').replace(/\s+/g, ' ').trim();
    const away = (a.querySelector?.('.awayTeam')?.textContent || '').replace(/\s+/g, ' ').trim();
    if (home && away) return { home, away };

    const row = a.closest(ROW_SEL) || a.parentElement;
    const h2 = (row?.querySelector?.('.homeTeam')?.textContent || '').replace(/\s+/g, ' ').trim();
    const a2 = (row?.querySelector?.('.awayTeam')?.textContent || '').replace(/\s+/g, ' ').trim();
    if (h2 && a2) return { home: h2, away: a2 };

    const blob = (a.textContent || '').replace(/\s+/g, ' ').trim();
    const m = blob.match(/^(.+?)\s+(.+?)\s+\d{1,2}\/\d{1,2}\/\d{2,4}/);
    if (m) return { home: m[1].trim(), away: m[2].trim() };

    const slug = (a.pathname || '').split('/').pop() || '';
    const parts = slug.replace(/-\d+$/, '').split('-').filter(Boolean);
    if (parts.length >= 4) {
      const mid = Math.floor(parts.length / 2);
      return {
        home: slugTitle(parts.slice(0, mid).join('-')),
        away: slugTitle(parts.slice(mid).join('-')),
      };
    }
    return null;
  }

  function readMatchRow(row, league, root) {
    const linkEl = row.querySelector?.('a.tnmscn, a[href*="/football/matches/"]');
    if (!linkEl?.href) return null;

    const teams = teamsFromLink(linkEl);
    if (!teams) return null;
    const { home, away } = teams;
    if (!home || !away || home.length > 60 || away.length > 60) return null;
    if (/^\d+$/.test(home) || /^\d+$/.test(away)) return null;
    if (isExcludedTeam(home) || isExcludedTeam(away)) return null;

    const resolved = resolveLeagueForRow(row, league, root, { home, away });
    return {
      country: resolved.country,
      league: resolved.league,
      home,
      away,
      prob: parseProb(row),
      pred: parsePred(row),
      predScore: parsePredScore(row),
      ft: parseFtScore(row),
      kickoff: parseKickoff(row, linkEl),
      link: linkEl.href,
    };
  }

  function readMatchLink(a, league, root) {
    if (!a?.href || !MATCH_HREF_RE.test(a.href)) return null;
    const teams = teamsFromLink(a);
    if (!teams) return null;
    const { home, away } = teams;
    if (!home || !away || home.length > 60 || away.length > 60) return null;
    if (isExcludedTeam(home) || isExcludedTeam(away)) return null;
    const row = a.closest(ROW_SEL) || a.parentElement?.parentElement;
    const resolved = resolveLeagueForRow(row, league, root, { home, away });
    return {
      country: resolved.country,
      league: resolved.league,
      home,
      away,
      prob: row ? parseProb(row) : '',
      pred: row ? parsePred(row) : '',
      predScore: row ? parsePredScore(row) : '',
      ft: row ? parseFtScore(row) : '',
      kickoff: parseKickoff(row || a, a),
      link: a.href,
    };
  }

  function isMatchRow(el) {
    if (!el?.querySelector) return false;
    if (el.matches?.(ROW_SEL)) return true;
    if (el.classList?.contains('rcnt')) return true;
    return !!el.querySelector('a[href*="/football/matches/"], .homeTeam');
  }

  function updateLeagueFromNode(el, league, root) {
    if (isInSidebar(el)) return league;

    if (el.matches?.(SHORT_TAG_SEL)) {
      const code = shortCodeFromBadgeEl(el);
      const mapped = code ? leagueFromShortCode(code) : null;
      if (mapped?.league) return mapped;
    }

    const shortOnly = (el.textContent || '').trim();
    if (shortOnly.length <= 12 && el.matches?.(SHORT_TAG_SEL)) {
      const code = shortCodeFromBadgeEl(el);
      const mapped = code ? leagueFromShortCode(code) : null;
      if (mapped?.league) return mapped;
    }

    if (el.tagName === 'A' && isContentLeagueHeaderLink(el, root)) {
      const lf = leagueFromHref(el.href);
      const ll = leagueFromLabel(el.textContent);
      return normalizeLeague(
        lf.country || ll.country || league.country,
        lf.league || ll.league || league.league
      );
    }

    const countryOnly = parseCountryOnlyHeader(shortOnly);
    if (countryOnly && !el.querySelector?.('a[href*="/football/matches/"]')) {
      return { country: countryOnly, league: '' };
    }

    const headingLike =
      el.matches?.('[class*="heading"], [class*="head_ln"], .headln, .league_name, h2, h3, h4') ||
      (shortOnly.length > 3 &&
        shortOnly.length < 80 &&
        /league|division|cup|liga|serie|bundesliga|premier|championship/i.test(shortOnly) &&
        !el.querySelector?.('a[href*="/football/matches/"]'));
    if (headingLike) {
      const fromBadge = leagueFromShortBadge(el);
      if (fromBadge?.league) return fromBadge;
      const ll = leagueFromLabel(shortOnly);
      if (ll.league) {
        const norm = normalizeLeague(ll.country, ll.league);
        if (norm.league) return norm;
      }
    }

    return league;
  }

  function walkParseNode(el, league, root, rows, seen, dbg) {
    if (!el || el.nodeType !== 1) return league;
    if (el.closest(`#${PANEL_ID}`)) return league;

    league = updateLeagueFromNode(el, league, root);

    if (el.tagName === 'A' && isContentLeagueHeaderLink(el, root)) {
      dbg.headers++;
    }

    if (el.tagName === 'A' && MATCH_HREF_RE.test(el.href) && !isInSidebar(el)) {
      const row = readMatchLink(el, league, root);
      if (row) {
        const key = row.link || `${row.home}|${row.away}`;
        if (!seen.has(key)) {
          seen.add(key);
          dbg.links++;
          rows.push(row);
        }
      }
    } else if (isMatchRow(el) && !isInSidebar(el)) {
      dbg.rcnt++;
      const row = readMatchRow(el, league, root);
      if (row) {
        const key = row.link || `${row.home}|${row.away}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push(row);
        }
      }
    }

    for (const child of el.children) {
      league = walkParseNode(child, league, root, rows, seen, dbg);
    }
    return league;
  }

  function parseDocument(doc) {
    const rows = [];
    const dbg = { rcnt: 0, headers: 0, links: 0, root: '', bodyLinks: 0 };

    const root = findParseRoot(doc);
    dbg.root = rootLabel(root);
    dbg.bodyLinks = doc.body ? doc.body.querySelectorAll('a[href*="/football/matches/"]').length : 0;
    if (!root) return { rows, debug: formatDebug(dbg) };

    const seen = new Set();
    let league = isLeagueSpecificPage() ? leagueFromPageMeta() : { country: '', league: '' };
    walkParseNode(root, league, root, rows, seen, dbg);

    return { rows, debug: formatDebug(dbg) };
  }

  function formatDebug(dbg) {
    return `root ${dbg.root}, rcnt ${dbg.rcnt}, links ${dbg.links}, headers ${dbg.headers}, bodyLinks ${dbg.bodyLinks}`;
  }

  function parseAllDocuments() {
    let merged = [];
    let debugParts = [];

    const main = parseDocument(document);
    merged = main.rows;
    debugParts.push(`doc:${main.debug}`);

    document.querySelectorAll('iframe').forEach((frame, i) => {
      try {
        if (frame.offsetParent === null && frame.clientWidth < 2) return;
        const doc = frame.contentDocument;
        if (!doc) return;
        const sub = parseDocument(doc);
        if (!sub.rows.length) return;
        const mainKeys = new Set(merged.map((r) => r.link || `${r.home}|${r.away}`));
        const extra = sub.rows.filter((r) => !mainKeys.has(r.link || `${r.home}|${r.away}`));
        if (extra.length) {
          merged = merged.concat(extra);
          debugParts.push(`iframe${i}:+${extra.length}`);
        }
      } catch {
        debugParts.push(`iframe${i}:blocked`);
      }
    });

    return { rows: merged, debug: debugParts.join(' | ') };
  }

  function pageFingerprint() {
    const h1 = document.querySelector('h1')?.textContent?.trim() || '';
    const links = document.body?.querySelectorAll('a[href*="/football/matches/"]').length || 0;
    return `${location.pathname}|${h1}|${links}`;
  }

  function cleanMatchLink(link) {
    return String(link || '').trim();
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
          score: String(r.ft || r.predScore || '').trim(),
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
    const el = document.getElementById(PANEL_ID)?.querySelector('#fb-livescores-upload-status');
    if (!el) return;
    el.textContent = text || '';
    const isError = state === true || state === 'error';
    const isSuccess = state === 'success';
    el.style.color = isError ? '#f87171' : isSuccess ? '#4ade80' : '#94a3b8';
  }

  function syncUploadControls(cfg) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const envSel = panel.querySelector('#fb-livescores-upload-env');
    const urlInp = panel.querySelector('#fb-livescores-upload-url');
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
    const envSel = panel?.querySelector('#fb-livescores-upload-env');
    const urlInp = panel?.querySelector('#fb-livescores-upload-url');
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

  function markUpdating() {
    lastCache = [];
    lastRows = [];
    autoUploadDone = false;
    clearTimeout(autoUploadTimer);
    ensurePanel();
    updatePanelSubtitle('Updating...');
    renderPanel([], { subtitle: 'Updating...', emptyMessage: 'Loading predictions...' });
  }

  function updatePanelSubtitle(text) {
    const el = document.getElementById(PANEL_ID)?.querySelector('#fb-livescores-debug-count');
    if (el) el.textContent = text;
  }

  function scheduleParse(ms) {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(runParse, ms);
  }

  function runParse() {
    try {
      const result = parseAllDocuments();
      lastCache = result.rows;
      lastDebug = result.debug;
      if (lastCache.length) console.log(LOG_PREFIX, lastCache.length, lastDebug);
      applyParseResult();
    } catch (e) {
      lastCache = [];
      lastDebug = `error ${e?.message || e}`;
      applyParseResult();
    }
  }

  function applyParseResult() {
    ensurePanel();

    if (!lastCache.length) {
      lastPreparedRows = [];
      updateLeagueBar([]);
      const hint =
        lastDebug.includes('bodyLinks 0') || /bodyLinks 0/.test(lastDebug)
          ? ' No match list on this page — open Today / By league / a league page.'
          : '';
      renderPanel([], {
        subtitle: 'No data',
        emptyMessage: `Parse failed (${lastDebug || 'empty'}).${hint} Wait for load, then Refresh.`,
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

  function onContentMaybeChanged(force) {
    const fp = pageFingerprint();
    if (!force && fp === lastFingerprint) return;
    lastFingerprint = fp;
    markUpdating();
    scheduleParse(80);
    setTimeout(() => scheduleParse(0), 600);
    setTimeout(() => scheduleParse(0), 2000);
  }

  function removeStalePanel() {
    const old = document.getElementById(PANEL_ID);
    if (old && old.dataset.fbVer !== SCRIPT_VER) old.remove();
  }

  function patchLeagueBarPanel(panel) {
    const leagueBar = panel?.querySelector('#fb-livescores-league-bar');
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
    if (!leagueBar || leagueBar.id !== 'fb-livescores-league-bar') return;
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
    const leagueBar = panel?.querySelector('#fb-livescores-league-bar');
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

  function ensurePanel() {
    removeStalePanel();
    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      patchLeagueBarPanel(panel);
      return panel;
    }

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.dataset.fbVer = SCRIPT_VER;

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID}{position:fixed;right:12px;bottom:12px;z-index:2147483646;
        width:min(1180px,calc(100vw - 24px));height:min(70vh,560px);
        background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:10px;
        box-shadow:0 8px 32px rgba(0,0,0,.45);font:12px/1.4 system-ui,sans-serif;
        display:flex;flex-direction:column;overflow:hidden}
      #${PANEL_ID} .hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;
        gap:6px;padding:8px 12px;background:#1e293b;border-bottom:1px solid #334155}
      #${PANEL_ID} .hdr button{margin-left:6px;padding:4px 10px;border-radius:6px;
        border:1px solid #475569;background:#334155;color:#fff;cursor:pointer}
      #${PANEL_ID} .body{flex:1 1 auto;min-height:0;overflow:auto}
      #${PANEL_ID} table{width:100%;border-collapse:collapse;table-layout:fixed}
      #${PANEL_ID} th,#${PANEL_ID} td{padding:6px 8px;border-bottom:1px solid #1e293b;text-align:left;word-break:break-word}
      #${PANEL_ID} th{position:sticky;top:0;background:#0f172a;color:#94a3b8;z-index:1}
      #${PANEL_ID} a{color:#38bdf8}
      #${PANEL_ID} .empty{padding:16px;color:#94a3b8}
      #${PANEL_ID} .sub{font-size:11px;color:#94a3b8;margin-left:8px}
      #${PANEL_ID} .upload-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 12px;
        background:#1e293b;border-bottom:1px solid #334155;font-size:11px}
      #${PANEL_ID} .upload-bar label{color:#94a3b8}
      #${PANEL_ID} .upload-bar select,#${PANEL_ID} .upload-bar input{
        padding:3px 6px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0}
      #${PANEL_ID} .upload-bar input{flex:1 1 200px;min-width:160px;max-width:420px}
      #${PANEL_ID} .upload-bar .upload-status{flex:1 1 100%;color:#94a3b8;word-break:break-all}
      #${PANEL_ID} .league-bar{display:flex;flex-direction:column;gap:4px;padding:6px 12px;
        background:#172033;border-bottom:1px solid #334155;font-size:11px}
      #${PANEL_ID} .league-bar-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
      #${PANEL_ID} .league-bar .league-bar-label{color:#94a3b8}
      #${PANEL_ID} .league-bar .league-bar-summary{color:#64748b}
      #${PANEL_ID} .league-bar .league-bar-search{
        flex:1 1 120px;min-width:100px;padding:3px 6px;border-radius:4px;
        border:1px solid #475569;background:#0f172a;color:#e2e8f0}
      #${PANEL_ID} .league-bar .league-bar-toggle{
        padding:2px 8px;border-radius:4px;border:1px solid #475569;background:#334155;color:#fff;cursor:pointer}
      #${PANEL_ID} .league-bar-selected{display:flex;flex-wrap:wrap;gap:4px}
      #${PANEL_ID} .league-bar-selected:empty{display:none}
      #${PANEL_ID} .league-bar-whitelist{display:flex;flex-wrap:wrap;gap:4px}
      #${PANEL_ID} .league-bar-whitelist:empty{display:none}
      #${PANEL_ID} .league-bar-list{display:none;flex-wrap:wrap;gap:4px;max-height:120px;overflow:auto}
      #${PANEL_ID} .league-bar-list.expanded{display:flex}
      #${PANEL_ID} .league-bar button.league-btn{
        padding:2px 8px;border-radius:4px;border:1px solid #475569;background:#334155;color:#e2e8f0;cursor:pointer;font-size:10px}
      #${PANEL_ID} .league-bar button.league-btn.active{background:#2563eb;border-color:#3b82f6}
      #${PANEL_ID} .league-bar button.league-btn.whitelist{opacity:.85;cursor:default}
      #${PANEL_ID} .league-bar button.league-btn.hidden{display:none}
    `;

    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    const title = document.createElement('strong');
    title.textContent = 'Forebet | Debug';
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.id = 'fb-livescores-debug-count';
    sub.textContent = `v${SCRIPT_VER}`;
    const btnUpload = document.createElement('button');
    btnUpload.type = 'button';
    btnUpload.dataset.action = 'upload';
    btnUpload.textContent = 'Upload';
    const btnR = document.createElement('button');
    btnR.textContent = 'Refresh';
    const btnT = document.createElement('button');
    btnT.textContent = 'Collapse';
    const btnWrap = document.createElement('span');
    btnWrap.append(btnUpload, btnR, btnT);
    hdr.append(title, sub, btnWrap);

    const uploadCfg = loadUploadConfig();
    const uploadBar = document.createElement('div');
    uploadBar.className = 'upload-bar';
    const envLabel = document.createElement('label');
    envLabel.textContent = '环境';
    const envSel = document.createElement('select');
    envSel.id = 'fb-livescores-upload-env';
    UPLOAD_ENVS.forEach((e) => {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.label;
      envSel.appendChild(o);
    });
    envSel.value = uploadCfg.env;
    const urlLabel = document.createElement('label');
    urlLabel.textContent = 'URL';
    const urlInp = document.createElement('input');
    urlInp.id = 'fb-livescores-upload-url';
    urlInp.type = 'url';
    urlInp.spellcheck = false;
    urlInp.value = getUploadUrl(uploadCfg);
    const uploadStatus = document.createElement('span');
    uploadStatus.id = 'fb-livescores-upload-status';
    uploadStatus.className = 'upload-status';
    uploadBar.append(envLabel, envSel, urlLabel, urlInp, uploadStatus);

    const leagueBar = document.createElement('div');
    leagueBar.className = 'league-bar';
    leagueBar.id = 'fb-livescores-league-bar';
    leagueBar.style.display = 'none';
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
      cfg.env = normalizeUploadEnv(envSel.value);
      saveUploadConfig(cfg);
      urlInp.value = getUploadUrl(cfg);
    });
    urlInp.addEventListener('change', () => readUploadConfigFromPanel());
    urlInp.addEventListener('blur', () => readUploadConfigFromPanel());
    btnUpload.addEventListener('click', () => uploadRows());
    btnR.onclick = () => scheduleParse(0);
    btnT.onclick = () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      uploadBar.style.display = hidden ? '' : 'none';
      if (leagueBar.dataset.hasLeagues === '1') leagueBar.style.display = hidden ? 'flex' : 'none';
      btnT.textContent = hidden ? 'Collapse' : 'Expand';
    };
    syncUploadControls(uploadCfg);
    return panel;
  }

  function renderPanel(rows, opts) {
    const panel = ensurePanel();
    const body = panel.querySelector('.body');
    const subtitle = opts?.subtitle || displaySubtitle(rows.length);
    updatePanelSubtitle(subtitle);
    body.style.display = '';
    const leagueBar = panel.querySelector('#fb-livescores-league-bar');
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
    ['Country', 'League', 'Kickoff', 'Home', 'Away', 'Prob.%', 'Pred', 'Score', 'FT', 'Link'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    for (const r of rows) {
      const tr = document.createElement('tr');
      [r.country, r.league, r.kickoff, r.home, r.away, r.prob, r.pred, r.predScore, r.ft].forEach((t) => {
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

  function watchNavClicks() {
    document.addEventListener(
      'click',
      (e) => {
        const el = e.target.closest?.('a, button');
        if (!el) return;
        const href = el.getAttribute?.('href') || '';
        const label = `${el.textContent || ''} ${href}`;
        if (
          /predictions|football-tips|by-league|today|tomorrow|weekend|\d{4}-\d{2}-\d{2}/i.test(label) ||
          el.closest?.('.calendar, .date_nav, [class*="calendar"]')
        ) {
          onContentMaybeChanged(true);
        }
      },
      true
    );
  }

  function watchMainDom() {
    const attach = () => {
      const root = findParseRoot() || document.body;
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

    ensurePanel();
    lastFingerprint = pageFingerprint();
    watchNavClicks();
    watchMainDom();
    hookHistory();
    onContentMaybeChanged(true);
    window.addEventListener('load', () => onContentMaybeChanged(true), { once: true });
    window.addEventListener('popstate', onRouteChange);
    setInterval(() => {
      if (!isListPage()) return;
      onContentMaybeChanged(false);
    }, 5000);
  }

  boot();
})();
