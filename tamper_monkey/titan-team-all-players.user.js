// ==UserScript==
// @name         Titan007 球队全员球员页
// @namespace    https://titan007.com/
// @version      2.1.0
// @description  info.titan007.com 球队全员球员页：排序增强、身价统计面板、位置筛选、国家队俱乐部列、身价集中度分析。
// @match        https://info.titan007.com/cn/team/Lineup/*
// @match        http://info.titan007.com/cn/team/Lineup/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'tm-titan-lineup-sort-style';
  const PANEL_ID = 'tm-titan-lineup-value-panel';
  const CONC_PANEL_ID = 'tm-titan-concentration-panel';
  const PANEL_STYLE_ID = 'tm-titan-lineup-value-panel-style';
  const CONC_PANEL_STYLE_ID = 'tm-titan-concentration-panel-style';
  const ATTR_INIT = 'data-tm-lineup-sort-init';
  const ATTR_WIRE_PENDING = 'data-tm-wire-pending';
  const ATTR_CLUB_INIT = 'data-tm-club-col-init';
  const ATTR_CLUB_LOADING = 'data-tm-club-loading';
  const CLUB_CACHE_KEY = 'tm-player-club-cache-v10';
  const CLUB_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const CLUB_BATCH_SIZE = 6;
  const CLUB_BATCH_GAP_MS = 120;
  let cachedDataJsVersion = null;
  const CHART_BAR_MAX_PX = 88;
  const CHART_BAR_WIDTH_PX = 18;
  const CHART_BAR_GAP_PX = 5;
  const CHART_GROUP_GAP_PX = 22;
  const CHART_LABEL_TOP_PX = 14;
  let panelCollapsed = false;
  let lastPanelHtml = '';
  let concPanelCollapsed = false;
  let lastConcPanelHtml = '';
  let activePositionFilter = null;
  let activeValueRankFilter = null;
  let filterTableRef = null;

  const POS_FILTER_LABELS = {
    gk: '门将',
    def: '后卫',
    mid: '中场',
    fwd: '前锋',
    other: '其他',
  };
  const SORTABLE = [
    { keys: ['号码'], type: 'jersey', label: '号码' },
    { keys: ['身高'], type: 'height', label: '身高' },
    { keys: ['体重'], type: 'weight', label: '体重' },
    { keys: ['国籍'], type: 'text', label: '国籍' },
    { keys: ['俱乐部'], type: 'text', label: '俱乐部' },
    { keys: ['预计身价'], type: 'value', label: '预计身价' },
    {
      keys: ['首发次数/进球', '首发次数', '首发'],
      type: 'starts_goals',
      label: '首发次数',
    },
    {
      keys: ['替补次数/进球', '替补次数'],
      type: 'starts_goals',
      label: '替补次数',
    },
    { keys: ['助攻'], type: 'count', label: '助攻' },
  ];

  function normalizeHeaderText(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .trim();
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      table[${ATTR_INIT}] thead th.tm-sortable,
      table[${ATTR_INIT}] tr.tm-lineup-header-row th.tm-sortable,
      table[${ATTR_INIT}] tr.tm-lineup-header-row td.tm-sortable {
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }
      table[${ATTR_INIT}] thead th.tm-sortable:hover,
      table[${ATTR_INIT}] tr.tm-lineup-header-row th.tm-sortable:hover,
      table[${ATTR_INIT}] tr.tm-lineup-header-row td.tm-sortable:hover {
        background-color: rgba(148, 163, 184, 0.12);
      }
      table[${ATTR_INIT}] th.tm-sortable .tm-sort-ind,
      table[${ATTR_INIT}] td.tm-sortable .tm-sort-ind {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        margin-left: 6px;
        vertical-align: middle;
        width: 10px;
        height: 14px;
        flex-shrink: 0;
      }
      table[${ATTR_INIT}] .tm-sort-ind .tm-scaret {
        display: block;
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        line-height: 0;
      }
      table[${ATTR_INIT}] .tm-sort-ind.tm-sort-neutral .tm-scaret-up {
        border-bottom: 4px solid rgba(100, 116, 139, 0.42);
      }
      table[${ATTR_INIT}] .tm-sort-ind.tm-sort-neutral .tm-scaret-down {
        border-top: 4px solid rgba(100, 116, 139, 0.42);
      }
      table[${ATTR_INIT}] .tm-sort-ind.tm-dir-asc .tm-scaret-up {
        border-bottom: 4px solid #334155;
      }
      table[${ATTR_INIT}] .tm-sort-ind.tm-dir-asc .tm-scaret-down {
        border-top: 4px solid rgba(148, 163, 184, 0.28);
      }
      table[${ATTR_INIT}] .tm-sort-ind.tm-dir-desc .tm-scaret-down {
        border-top: 4px solid #334155;
      }
      table[${ATTR_INIT}] .tm-sort-ind.tm-dir-desc .tm-scaret-up {
        border-bottom: 4px solid rgba(148, 163, 184, 0.28);
      }
      table[${ATTR_INIT}] th.tm-sort-active,
      table[${ATTR_INIT}] td.tm-sort-active {
        background-color: rgba(148, 163, 184, 0.14);
      }
      table[${ATTR_INIT}] .tm-sort-part-hint {
        display: inline-block;
        margin-left: 3px;
        padding: 0 3px;
        font-size: 9px;
        font-weight: 600;
        line-height: 1.3;
        color: #475569;
        background: rgba(148, 163, 184, 0.2);
        border-radius: 3px;
        vertical-align: middle;
      }
      .tm-age-suffix {
        margin-left: 0.35em;
        color: #64748b;
        font-size: 0.92em;
        white-space: nowrap;
      }
      .tm-age-suffix.tm-age-suffix-old {
        color: #c96f6f;
        font-weight: 500;
      }
      td.tm-pos-gk {
        color: #0369a1 !important;
        font-weight: 500;
      }
      td.tm-pos-def {
        color: #a16207 !important;
        font-weight: 500;
      }
      td.tm-pos-mid {
        color: #166534 !important;
        font-weight: 500;
      }
      td.tm-pos-fwd {
        color: #b91c1c !important;
        font-weight: 500;
      }
      td.tm-pos-other {
        color: #475569 !important;
        font-weight: 500;
      }
      td.tm-jersey-cell {
        position: relative;
      }
      .tm-jersey-rank {
        position: absolute;
        right: 3px;
        bottom: 2px;
        min-width: 11px;
        padding: 1px 3px;
        font-size: 9px;
        line-height: 1.15;
        font-weight: 600;
        color: #64748b;
        background: rgba(148, 163, 184, 0.16);
        border-radius: 3px;
        pointer-events: none;
        user-select: none;
      }
      td.tm-club-cell {
        font-size: 0.92em;
        max-width: 9em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      td.tm-club-cell a {
        color: #2563eb;
        text-decoration: none;
      }
      td.tm-club-cell a:hover {
        text-decoration: underline;
      }
      td.tm-club-cell.tm-club-loading {
        color: #94a3b8;
      }
      .tm-col-hidden {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function findLineupTables() {
    const out = [];
    document.querySelectorAll('table').forEach((table) => {
      const t = table.textContent || '';
      if (!t.includes('号码')) return;
      const hits = ['身高', '体重', '国籍'].filter((k) => t.includes(k)).length;
      if (hits < 2) return;
      out.push(table);
    });
    return out;
  }

  function pickHeaderRow(table) {
    if (table.tHead && table.tHead.rows.length) {
      for (let i = 0; i < table.tHead.rows.length; i++) {
        const r = table.tHead.rows[i];
        if (/号码/.test(r.textContent || '') && r.cells.length >= 5) return r;
      }
    }
    for (let i = 0; i < Math.min(5, table.rows.length); i++) {
      const r = table.rows[i];
      if (/号码/.test(r.textContent || '') && r.cells.length >= 5) return r;
    }
    return null;
  }

  function resolveColumnIndex(headerRow, spec) {
    const cells = [...headerRow.cells];
    for (let i = 0; i < cells.length; i++) {
      const nt = normalizeHeaderText(cells[i].textContent);
      for (const k of spec.keys) {
        if (nt.includes(normalizeHeaderText(k))) return i;
      }
    }
    return -1;
  }

  /** 身价列：优先「预计身价」，否则「身价」但排除「当前身价」等 */
  function resolveValueColumnIndex(headerRow) {
    const cells = [...headerRow.cells];
    for (let i = 0; i < cells.length; i++) {
      const nt = normalizeHeaderText(cells[i].textContent);
      if (nt.includes('预计身价')) return i;
    }
    for (let i = 0; i < cells.length; i++) {
      const nt = normalizeHeaderText(cells[i].textContent);
      if (nt.includes('身价') && !nt.includes('当前')) return i;
    }
    return -1;
  }

  function stripNumber(raw) {
    const s = String(raw || '')
      .replace(/,/g, '')
      .replace(/，/g, '');
    const m = s.match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }

  function parseStartsGoals(raw) {
    const s = String(raw || '')
      .replace(/\u00a0/g, ' ')
      .trim();
    const parts = s.split(/[/／]/);
    if (parts.length >= 2) {
      return {
        starts: stripNumber(parts[0]),
        goals: stripNumber(parts[1]),
      };
    }
    const n = stripNumber(s);
    return { starts: n, goals: NaN };
  }

  function parseCellValue(spec, text, part) {
    if (spec.type === 'starts_goals') {
      const { starts, goals } = parseStartsGoals(text);
      const v = part === 'goals' ? goals : starts;
      return Number.isFinite(v) ? v : NaN;
    }
    return parseCell(spec.type, text);
  }

  function sortTitleForSpec(spec) {
    if (spec.type !== 'starts_goals') {
      return `点击按「${spec.label}」排序（降序 → 升序 → 恢复身价降序）`;
    }
    return `点击排序：进球降序 → ${spec.label}降序 → 恢复身价降序`;
  }

  function sortPartHintText(spec, part) {
    if (part === 'goals') return '球';
    return spec.label.includes('替补') ? '替' : '首';
  }

  function parseCell(specType, text) {
    const raw = String(text || '').trim();
    switch (specType) {
      case 'jersey':
      case 'count':
      case 'starts_goals': {
        const { starts } = parseStartsGoals(raw);
        return Number.isFinite(starts) ? starts : NaN;
      }
      case 'height':
      case 'weight': {
        const n = stripNumber(raw);
        return Number.isFinite(n) ? n : NaN;
      }
      case 'value': {
        let n = NaN;
        const wan = raw.match(/(\d+(?:\.\d+)?)\s*万/);
        if (wan) n = parseFloat(wan[1]);
        if (!Number.isFinite(n)) n = stripNumber(raw);
        return Number.isFinite(n) ? n : NaN;
      }
      case 'text':
        return raw;
      default:
        return raw;
    }
  }

  function compareParsed(type, dir, a, b) {
    const mult = dir === 'desc' ? -1 : 1;
    if (type === 'text') {
      const sa = String(a || '').trim();
      const sb = String(b || '').trim();
      return mult * sa.localeCompare(sb, 'zh-Hans-CN');
    }
    const na = typeof a === 'number' ? a : NaN;
    const nb = typeof b === 'number' ? b : NaN;
    const fa = Number.isFinite(na);
    const fb = Number.isFinite(nb);
    if (!fa && !fb) return 0;
    if (!fa) return 1;
    if (!fb) return -1;
    if (na === nb) return 0;
    return mult * (na < nb ? -1 : 1);
  }

  function isDataRow(tr, colCount, headerRow) {
    if (!tr || tr === headerRow) return false;
    if (tr.cells.length !== colCount) return false;
    for (let i = 0; i < tr.cells.length; i++) {
      if (tr.cells[i].colSpan > 1) return false;
    }
    return true;
  }

  function parseBirthDate(text) {
    const s = String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return null;
    let m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (m) {
      return new Date(
        parseInt(m[1], 10),
        parseInt(m[2], 10) - 1,
        parseInt(m[3], 10)
      );
    }
    m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (m) {
      return new Date(
        parseInt(m[1], 10),
        parseInt(m[2], 10) - 1,
        parseInt(m[3], 10)
      );
    }
    return null;
  }

  function computeAgeYears(birthDate) {
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    const mo = today.getMonth() - birthDate.getMonth();
    if (mo < 0 || (mo === 0 && today.getDate() < birthDate.getDate())) years -= 1;
    return years;
  }

  function getCellBirthTextForParse(cell) {
    if (!cell.querySelector('.tm-age-suffix')) return cell.textContent || '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.tm-age-suffix').forEach((n) => n.remove());
    return clone.textContent || '';
  }

  function resolveBirthdayColumnIndex(headerRow) {
    for (let i = 0; i < headerRow.cells.length; i++) {
      if (normalizeHeaderText(headerRow.cells[i].textContent).includes('生日')) return i;
    }
    return -1;
  }

  function resolveNationalityColumnIndex(headerRow) {
    for (let i = 0; i < headerRow.cells.length; i++) {
      const nt = normalizeHeaderText(headerRow.cells[i].textContent);
      if (nt.includes('国籍')) return i;
    }
    return -1;
  }

  function parseTeamIdFromUrl() {
    const m = (location.pathname || '').match(/\/Lineup\/(\d+)\.html/i);
    return m ? m[1] : null;
  }

  function waitForLineupDetail(timeoutMs) {
    const limit = timeoutMs || 8000;
    return new Promise((resolve) => {
      if (window.lineupDetail && window.lineupDetail.length) {
        resolve();
        return;
      }
      const start = Date.now();
      const timer = setInterval(() => {
        if (window.lineupDetail && window.lineupDetail.length) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - start >= limit) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  }

  function readCachedClub(playerId) {
    const cache = readClubCache();
    const hit = cache[playerId];
    if (!hit) return undefined;
    if (Date.now() - hit.ts >= CLUB_CACHE_TTL_MS) return undefined;
    return hit.club;
  }

  function applyCachedClubsToTable(table, headerRow, colCount, clubCol, nameCol) {
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCount, headerRow)) continue;
        const cell = tr.cells[clubCol];
        if (!cell || cell.getAttribute('data-tm-club-loaded') === '1') continue;
        const link =
          (nameCol >= 0 ? tr.cells[nameCol] : tr)?.querySelector('a[href*="/player/"]');
        const playerId = link ? parsePlayerIdFromHref(link.getAttribute('href')) : null;
        if (!playerId) {
          renderClubCell(cell, null);
          continue;
        }
        const cached = readCachedClub(playerId);
        if (cached !== undefined) renderClubCell(cell, cached);
      }
    }
  }

  function normalizeTeamName(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .trim()
      .toLowerCase();
  }

  function isNationalTeamPage() {
    const sel = document.querySelector('select');
    if (sel && sel.options.length >= 80) return true;
    const info = document.querySelectorAll('table')[0]?.textContent || '';
    return /欧洲市值|亚洲市值|非洲市值|北美市值|南美市值|大洋洲市值/.test(info);
  }

  function readClubCache() {
    try {
      const raw = localStorage.getItem(CLUB_CACHE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch (_) {
      return {};
    }
  }

  function writeClubCache(cache) {
    try {
      localStorage.setItem(CLUB_CACHE_KEY, JSON.stringify(cache));
    } catch (_) {
      /* ignore */
    }
  }

  function getDataJsVersion() {
    if (cachedDataJsVersion) return cachedDataJsVersion;
    for (const s of document.querySelectorAll('script[src*="jsData/"]')) {
      const m = String(s.src || '').match(/[?&]version=(\d{10})\b/);
      if (m) {
        cachedDataJsVersion = m[1];
        return cachedDataJsVersion;
      }
    }
    const html = document.documentElement.innerHTML;
    const m = html.match(/[?&]version=(\d{10})\b/);
    if (m) {
      cachedDataJsVersion = m[1];
      return cachedDataJsVersion;
    }
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    cachedDataJsVersion = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}06`;
    return cachedDataJsVersion;
  }

  function isPlayerJsText(text) {
    const s = String(text || '');
    return /var\s+(nowTeamInfo|transferInfo|onceTeam)\s*=/.test(s) && !/<!DOCTYPE/i.test(s);
  }

  function extractJsArrayVar(text, varName) {
    const src = String(text || '');
    const marker = 'var ' + varName + ' = ';
    const start = src.indexOf(marker);
    if (start < 0) return null;

    let i = start + marker.length;
    while (src[i] === ' ') i += 1;
    if (src[i] !== '[') return null;

    let depth = 0;
    let inString = false;
    let stringChar = '';
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (inString) {
        if (c === '\\') {
          j += 1;
          continue;
        }
        if (c === stringChar) inString = false;
        continue;
      }
      if (c === "'" || c === '"') {
        inString = true;
        stringChar = c;
        continue;
      }
      if (c === '[') depth += 1;
      else if (c === ']') {
        depth -= 1;
        if (depth === 0) {
          try {
            return new Function('return ' + src.slice(i, j + 1))();
          } catch (_) {
            return null;
          }
        }
      }
    }
    return null;
  }

  function parsePlayerClubFromJs(jsText, excludeTeamName) {
    const transferInfo = extractJsArrayVar(jsText, 'transferInfo');
    const nowTeamInfo = extractJsArrayVar(jsText, 'nowTeamInfo');
    let clubName = pickClubNameFromNowTeam(nowTeamInfo, excludeTeamName);
    if (!clubName) clubName = pickClubNameFromTransfer(transferInfo, excludeTeamName);
    return buildClubResult(clubName, transferInfo);
  }

  async function fetchPlayerClubNetwork(playerId, excludeTeamName) {
    const version = getDataJsVersion();
    const url = `${location.origin}/jsData/playerInfo/player${playerId}.js?version=${version}`;
    try {
      const resp = await fetch(url, { credentials: 'include' });
      const jsText = await resp.text();
      if (!isPlayerJsText(jsText)) return { ok: false, club: null };
      const club = parsePlayerClubFromJs(jsText, excludeTeamName);
      return { ok: true, club };
    } catch (_) {
      return { ok: false, club: null };
    }
  }

  function storeClubCache(playerId, club) {
    const cache = readClubCache();
    cache[playerId] = { club, ts: Date.now() };
    writeClubCache(cache);
  }

  async function resolvePlayerClub(playerId, excludeTeamName) {
    const cached = readCachedClub(playerId);
    if (cached !== undefined) return { ok: true, club: cached, fromCache: true };

    const result = await fetchPlayerClubNetwork(playerId, excludeTeamName);
    if (result.ok) storeClubCache(playerId, result.club);
    return result;
  }

  async function fetchClubTasksParallel(tasks, teamName) {
    for (let i = 0; i < tasks.length; i += CLUB_BATCH_SIZE) {
      const batch = tasks.slice(i, i + CLUB_BATCH_SIZE);
      await Promise.all(
        batch.map(async ({ cell, playerId }) => {
          const result = await resolvePlayerClub(playerId, teamName);
          if (result.ok) {
            renderClubCell(cell, result.club);
          } else {
            cell.classList.remove('tm-club-loading');
            cell.textContent = '…';
          }
        })
      );
      if (i + CLUB_BATCH_SIZE < tasks.length) await sleep(CLUB_BATCH_GAP_MS);
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findTeamIdForClub(transferInfo, clubName) {
    if (!transferInfo || !transferInfo.length) return null;
    const target = normalizeTeamName(clubName);
    for (let i = transferInfo.length - 1; i >= 0; i--) {
      const row = transferInfo[i];
      if (!row || row.length < 3) continue;
      const toName = String(row[7] || row[8] || '').trim();
      if (normalizeTeamName(toName) === target) return String(row[2]);
    }
    return null;
  }

  function pickClubNameFromNowTeam(nowTeamInfo, excludeTeamName) {
    if (!nowTeamInfo || !nowTeamInfo.length) return null;
    const ex = normalizeTeamName(excludeTeamName);
    for (const row of nowTeamInfo) {
      const name = String(row[0] || '').trim();
      if (!name) continue;
      if (normalizeTeamName(name) === ex) continue;
      return name;
    }
    return null;
  }

  function pickClubNameFromTransfer(transferInfo, excludeTeamName) {
    if (!transferInfo || !transferInfo.length) return null;
    const ex = normalizeTeamName(excludeTeamName);
    for (let i = transferInfo.length - 1; i >= 0; i--) {
      const row = transferInfo[i];
      if (!row || row.length < 8) continue;
      const toName = String(row[7] || row[8] || '').trim();
      if (!toName || normalizeTeamName(toName) === ex) continue;
      return toName;
    }
    return null;
  }

  function buildClubResult(clubName, transferInfo) {
    if (!clubName) return null;
    const teamId = transferInfo ? findTeamIdForClub(transferInfo, clubName) : null;
    return {
      name: clubName,
      href: teamId ? `${location.origin}/cn/team/Summary/${teamId}.html` : null,
    };
  }

  function parsePlayerIdFromHref(href) {
    const m = String(href || '').match(/\/player\/\d+\/(\d+)\.html/i);
    return m ? m[1] : null;
  }

  function renderClubCell(cell, club) {
    cell.classList.remove('tm-club-loading');
    cell.setAttribute('data-tm-club-loaded', '1');
    if (!club || !club.name) {
      cell.textContent = '-';
      return;
    }
    if (club.href) {
      cell.innerHTML =
        '<a href="' +
        escHtml(club.href) +
        '" target="_blank" rel="noopener" title="' +
        escHtml(club.name) +
        '">' +
        escHtml(club.name) +
        '</a>';
    } else {
      cell.textContent = club.name;
    }
  }

  function applyCachedClubsForTable(table) {
    if (!isNationalTeamPage()) return;
    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;
    const colCount = headerRow.cells.length;
    const clubCol = resolveColumnIndex(headerRow, { keys: ['俱乐部'] });
    if (clubCol < 0) return;
    const nameCol = resolveNameColumnIndex(headerRow);
    applyCachedClubsToTable(table, headerRow, colCount, clubCol, nameCol);
  }

  async function loadClubsForTable(table) {
    if (!isNationalTeamPage()) return;
    if (table.hasAttribute(ATTR_CLUB_LOADING)) return;

    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;
    const colCount = headerRow.cells.length;
    const clubCol = resolveColumnIndex(headerRow, { keys: ['俱乐部'] });
    if (clubCol < 0) return;

    applyCachedClubsForTable(table);

    const teamName = guessTeamName(table);
    const nameCol = resolveNameColumnIndex(headerRow);

    function collectTasks() {
      const tasks = [];
      for (const tb of table.tBodies) {
        for (const tr of tb.rows) {
          if (!isDataRow(tr, colCount, headerRow)) continue;
          const cell = tr.cells[clubCol];
          if (!cell || cell.getAttribute('data-tm-club-loaded') === '1') continue;

          const link =
            (nameCol >= 0 ? tr.cells[nameCol] : tr)?.querySelector('a[href*="/player/"]');
          const playerId = link ? parsePlayerIdFromHref(link.getAttribute('href')) : null;
          if (!playerId) {
            renderClubCell(cell, null);
            continue;
          }
          if (readCachedClub(playerId) !== undefined) {
            renderClubCell(cell, readCachedClub(playerId));
            continue;
          }

          tasks.push({ cell, playerId });
        }
      }
      return tasks;
    }

    const tasks = collectTasks();
    if (!tasks.length) return;

    table.setAttribute(ATTR_CLUB_LOADING, '1');
    try {
      await fetchClubTasksParallel(tasks, teamName);
    } finally {
      table.removeAttribute(ATTR_CLUB_LOADING);
    }
  }

  function augmentClubColumn(table) {
    if (table.getAttribute(ATTR_CLUB_INIT) === '1') {
      applyCachedClubsForTable(table);
      if (
        !table.hasAttribute(ATTR_CLUB_LOADING) &&
        table.querySelector('.tm-club-cell:not([data-tm-club-loaded])')
      ) {
        loadClubsForTable(table);
      }
      return;
    }
    if (!isNationalTeamPage()) return;

    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;
    const natCol = resolveNationalityColumnIndex(headerRow);
    if (natCol < 0) return;

    const insertAt = natCol + 1;
    const colCountBefore = headerRow.cells.length;
    if (normalizeHeaderText(headerRow.cells[insertAt]?.textContent).includes('俱乐部')) {
      table.setAttribute(ATTR_CLUB_INIT, '1');
      loadClubsForTable(table);
      return;
    }

    const th = document.createElement('th');
    th.textContent = '俱乐部';
    if (insertAt >= headerRow.cells.length) {
      headerRow.appendChild(th);
    } else {
      headerRow.insertBefore(th, headerRow.cells[insertAt]);
    }

    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCountBefore, headerRow)) continue;
        const td = document.createElement('td');
        td.className = 'tm-club-cell tm-club-loading';
        td.textContent = '…';
        if (insertAt >= tr.cells.length) {
          tr.appendChild(td);
        } else {
          tr.insertBefore(td, tr.cells[insertAt]);
        }
      }
    }

    table.setAttribute(ATTR_CLUB_INIT, '1');
    loadClubsForTable(table);
  }

  function setColumnHidden(table, headerRow, colIndex, colCount, hidden) {
    if (colIndex < 0) return;
    const headCell = headerRow.cells[colIndex];
    if (headCell) headCell.classList.toggle('tm-col-hidden', hidden);
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCount, headerRow)) continue;
        const cell = tr.cells[colIndex];
        if (cell) cell.classList.toggle('tm-col-hidden', hidden);
      }
    }
  }

  function adjustTeamTypeColumns(table) {
    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;

    const colCount = headerRow.cells.length;
    const natCol = resolveNationalityColumnIndex(headerRow);
    const clubCol = resolveColumnIndex(headerRow, { keys: ['俱乐部'] });
    const national = isNationalTeamPage();

    if (natCol >= 0) {
      setColumnHidden(table, headerRow, natCol, colCount, national);
    }
    if (clubCol >= 0) {
      setColumnHidden(table, headerRow, clubCol, colCount, !national);
    }
  }

  function augmentBirthdayColumn(table) {
    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;
    const birthCol = resolveBirthdayColumnIndex(headerRow);
    if (birthCol < 0) return;
    const colCount = headerRow.cells.length;
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCount, headerRow)) continue;
        const cell = tr.cells[birthCol];
        if (!cell || cell.querySelector('.tm-age-suffix')) continue;
        const parsed = parseBirthDate(getCellBirthTextForParse(cell));
        if (!parsed || Number.isNaN(parsed.getTime())) continue;
        const age = computeAgeYears(parsed);
        if (!Number.isFinite(age) || age < 0 || age > 120) continue;
        const span = document.createElement('span');
        span.className = 'tm-age-suffix';
        span.textContent = `(${age}岁)`;
        if (age >= 28) span.classList.add('tm-age-suffix-old');
        cell.appendChild(span);
      }
    }
  }

  const POS_COLOR_CLASSES = ['tm-pos-gk', 'tm-pos-def', 'tm-pos-mid', 'tm-pos-fwd', 'tm-pos-other'];

  function stripPositionColorClasses(cell) {
    POS_COLOR_CLASSES.forEach((c) => cell.classList.remove(c));
  }

  function classifyPosition(raw) {
    const t = String(raw || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .trim();
    if (!t) return 'other';
    if (/^GK$/i.test(t) || /门将|守门员|守门/.test(t)) return 'gk';
    if (/^(CB|LB|RB|WB|LWB|RWB|SW)$/i.test(t)) return 'def';
    if (/后卫|中卫|边卫|左后|右后|中坚|翼卫/.test(t)) return 'def';
    if (/^(CF|ST|FW|RW|LW|SS)$/i.test(t)) return 'fwd';
    if (/前锋|中锋|边锋|影子|突前|翼锋/.test(t)) return 'fwd';
    if (/^(DM|AM|CM|CDM|CAM|RM|LM|CMF|DMF|AMF)$/i.test(t)) return 'mid';
    if (/中场|后腰|前腰|前卫|边前|攻击中场|防守中场|进攻中场|自由人/.test(t)) return 'mid';
    if (/^M$/i.test(t)) return 'mid';
    if (/^D$/i.test(t)) return 'def';
    if (/^F$/i.test(t)) return 'fwd';
    if (/^G$/i.test(t)) return 'gk';
    return 'other';
  }

  function resolvePositionColumnIndex(headerRow) {
    for (let i = 0; i < headerRow.cells.length; i++) {
      const nt = normalizeHeaderText(headerRow.cells[i].textContent);
      if (nt === '位置' || (nt.includes('位置') && !nt.includes('换位'))) return i;
    }
    return -1;
  }

  function augmentPositionColumn(table) {
    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;
    const posCol = resolvePositionColumnIndex(headerRow);
    if (posCol < 0) return;
    const colCount = headerRow.cells.length;
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCount, headerRow)) continue;
        const cell = tr.cells[posCol];
        if (!cell) continue;
        stripPositionColorClasses(cell);
        const posCat = classifyPosition(cell.textContent);
        cell.classList.add(`tm-pos-${posCat}`);
        tr.setAttribute('data-tm-pos', posCat);
      }
    }
  }

  function resolveJerseyColumnIndex(headerRow) {
    const spec = SORTABLE.find((s) => s.type === 'jersey');
    return spec ? resolveColumnIndex(headerRow, spec) : -1;
  }

  function isRowFilteredOut(tr) {
    return tr.classList.contains('tm-pos-filter-hidden') || tr.style.display === 'none';
  }

  function updateJerseyRankBadges(table, jerseyCol, headerRow) {
    if (jerseyCol < 0) return;
    const colCount = headerRow.cells.length;
    let rank = 0;
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCount, headerRow)) continue;
        if (isRowFilteredOut(tr)) continue;
        rank += 1;
        const cell = tr.cells[jerseyCol];
        if (!cell) continue;
        cell.classList.add('tm-jersey-cell');
        let badge = cell.querySelector('.tm-jersey-rank');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tm-jersey-rank';
          badge.setAttribute('aria-hidden', 'true');
          cell.appendChild(badge);
        }
        badge.textContent = String(rank);
      }
    }
  }

  function augmentJerseyRankBadges(table) {
    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;
    updateJerseyRankBadges(table, resolveJerseyColumnIndex(headerRow), headerRow);
  }

  function fillSortCarets(ind) {
    ind.replaceChildren();
    const up = document.createElement('span');
    up.className = 'tm-scaret tm-scaret-up';
    const down = document.createElement('span');
    down.className = 'tm-scaret tm-scaret-down';
    ind.appendChild(up);
    ind.appendChild(down);
  }

  function ensureNeutralHint(cell) {
    let ind = cell.querySelector('.tm-sort-ind');
    if (!ind) {
      ind = document.createElement('span');
      ind.setAttribute('aria-hidden', 'true');
      cell.appendChild(ind);
    }
    cell.classList.remove('tm-sort-active');
    ind.className = 'tm-sort-ind tm-sort-neutral';
    fillSortCarets(ind);
    cell.querySelectorAll('.tm-sort-part-hint').forEach((n) => n.remove());
  }

  function resetSortableHints(headerRow, specByCol) {
    specByCol.forEach((_, colIndex) => {
      const cell = headerRow.cells[colIndex];
      if (!cell) return;
      ensureNeutralHint(cell);
    });
  }

  function setActiveSortMark(cell, dir, part, spec) {
    cell.classList.add('tm-sort-active');
    let ind = cell.querySelector('.tm-sort-ind');
    if (!ind) {
      ind = document.createElement('span');
      ind.setAttribute('aria-hidden', 'true');
      cell.appendChild(ind);
    }
    ind.className = `tm-sort-ind tm-dir-${dir === 'asc' ? 'asc' : 'desc'}`;
    fillSortCarets(ind);

    const existingHint = cell.querySelector('.tm-sort-part-hint');
    if (spec?.type === 'starts_goals' && part) {
      let hint = existingHint;
      if (!hint) {
        hint = document.createElement('span');
        hint.className = 'tm-sort-part-hint';
        hint.setAttribute('aria-hidden', 'true');
        cell.appendChild(hint);
      }
      hint.textContent = sortPartHintText(spec, part);
    } else if (existingHint) {
      existingHint.remove();
    }
  }

  function sortTbodySection(tbody, colIndex, spec, dir, colCount, headerRow, part) {
    const rows = [...tbody.rows].filter((tr) => isDataRow(tr, colCount, headerRow));
    if (rows.length < 2) return;

    rows.sort((ra, rb) => {
      const va = parseCellValue(spec, ra.cells[colIndex]?.textContent, part);
      const vb = parseCellValue(spec, rb.cells[colIndex]?.textContent, part);
      return compareParsed(
        spec.type === 'text' ? 'text' : 'num',
        dir,
        va,
        vb
      );
    });

    if (headerRow.parentElement === tbody) {
      let ref = headerRow;
      for (const r of rows) {
        ref.insertAdjacentElement('afterend', r);
        ref = r;
      }
      return;
    }

    const prependMode =
      tbody.rows[0] && isDataRow(tbody.rows[0], colCount, headerRow);
    const frag = document.createDocumentFragment();
    rows.forEach((r) => frag.appendChild(r));
    if (prependMode) {
      tbody.insertBefore(frag, tbody.firstChild);
    } else {
      tbody.appendChild(frag);
    }
  }

  function wireTable(table, lazyAttempt) {
    if (table.getAttribute(ATTR_INIT) === '1') return;
    const attempt = lazyAttempt || 0;
    if (!lazyAttempt && table.getAttribute(ATTR_WIRE_PENDING) === '1') return;

    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;

    const colCount = headerRow.cells.length;
    let dataRowCount = 0;
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (isDataRow(tr, colCount, headerRow)) dataRowCount += 1;
      }
    }
    if (dataRowCount === 0 && attempt < 40) {
      table.setAttribute(ATTR_WIRE_PENDING, '1');
      setTimeout(() => wireTable(table, attempt + 1), 120);
      return;
    }
    table.removeAttribute(ATTR_WIRE_PENDING);

    const specByCol = new Map();
    SORTABLE.forEach((spec) => {
      const idx = resolveColumnIndex(headerRow, spec);
      if (idx >= 0) specByCol.set(idx, spec);
    });
    const valueSpec = SORTABLE.find((s) => s.type === 'value');
    const valueColResolved = resolveValueColumnIndex(headerRow);
    if (valueSpec && valueColResolved >= 0 && !specByCol.has(valueColResolved)) {
      specByCol.set(valueColResolved, valueSpec);
    }
    if (!specByCol.size) return;

    const jerseyCol = resolveJerseyColumnIndex(headerRow);

    if (!table.tHead || headerRow.parentElement !== table.tHead) {
      headerRow.classList.add('tm-lineup-header-row');
    }

    let sortState = { col: null, dir: null, part: null };
    const rowSnapshot = new WeakMap();
    for (const tb of table.tBodies) {
      rowSnapshot.set(tb, [...tb.rows]);
    }

    function restoreDomOrder() {
      for (const tb of table.tBodies) {
        const order = rowSnapshot.get(tb);
        if (!order) continue;
        order.forEach((tr) => tb.appendChild(tr));
      }
    }

    function runSort(colIndex, spec, dir, part) {
      sortState.col = colIndex;
      sortState.dir = dir;
      sortState.part = part || null;
      resetSortableHints(headerRow, specByCol);
      setActiveSortMark(headerRow.cells[colIndex], dir, part, spec);
      for (const tb of table.tBodies) {
        sortTbodySection(tb, colIndex, spec, dir, colCount, headerRow, part);
      }
      updateJerseyRankBadges(table, jerseyCol, headerRow);
    }

    function restoreDefaultSort() {
      if (valueColResolved >= 0 && valueSpec) {
        runSort(valueColResolved, valueSpec, 'desc');
        return;
      }
      sortState.col = null;
      sortState.dir = null;
      sortState.part = null;
      resetSortableHints(headerRow, specByCol);
      restoreDomOrder();
      updateJerseyRankBadges(table, jerseyCol, headerRow);
    }

    const applySort = (colIndex, spec) => {
      if (sortState.col === colIndex) {
        if (spec.type === 'starts_goals') {
          if (sortState.part === 'goals' && sortState.dir === 'desc') {
            runSort(colIndex, spec, 'desc', 'starts');
            return;
          }
          restoreDefaultSort();
          return;
        }
        if (sortState.dir === 'desc') {
          runSort(colIndex, spec, 'asc');
          return;
        }
        restoreDefaultSort();
        return;
      }
      if (spec.type === 'starts_goals') {
        runSort(colIndex, spec, 'desc', 'goals');
      } else {
        runSort(colIndex, spec, 'desc');
      }
    };

    specByCol.forEach((spec, colIndex) => {
      const cell = headerRow.cells[colIndex];
      if (!cell) return;
      cell.classList.add('tm-sortable');
      cell.title = sortTitleForSpec(spec);
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applySort(colIndex, spec);
      });
    });

    resetSortableHints(headerRow, specByCol);

    if (valueColResolved >= 0 && valueSpec) {
      runSort(valueColResolved, valueSpec, 'desc');
    }

    table.setAttribute(ATTR_INIT, '1');
  }

  function ensureRowValueRanks(table) {
    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;
    const colCount = headerRow.cells.length;
    const valueCol = resolveValueColumnIndex(headerRow);
    if (valueCol < 0) return;

    const rows = [];
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCount, headerRow)) continue;
        const val = parseCell('value', tr.cells[valueCol]?.textContent || '');
        rows.push({ tr, val: Number.isFinite(val) ? val : -Infinity });
      }
    }
    rows.sort((a, b) => b.val - a.val);
    rows.forEach(({ tr }, i) => {
      tr.setAttribute('data-tm-val-rank', String(i + 1));
    });
  }

  function applyTableFilters(table) {
    const headerRow = pickHeaderRow(table);
    if (!headerRow) return;
    const colCount = headerRow.cells.length;
    const posCol = resolvePositionColumnIndex(headerRow);

    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCount, headerRow)) continue;

        let show = true;
        if (activePositionFilter) {
          let rowPos = tr.getAttribute('data-tm-pos');
          if (!rowPos && posCol >= 0) {
            rowPos = classifyPosition(tr.cells[posCol]?.textContent || '');
            tr.setAttribute('data-tm-pos', rowPos);
          }
          show = rowPos === activePositionFilter;
        }
        if (show && activeValueRankFilter) {
          const rank = parseInt(tr.getAttribute('data-tm-val-rank') || '0', 10);
          show = rank > 0 && rank <= activeValueRankFilter;
        }

        tr.classList.toggle('tm-pos-filter-hidden', !show);
        tr.style.display = show ? '' : 'none';
      }
    }
    augmentJerseyRankBadges(table);
  }

  function getFilterBarLabel() {
    const parts = [];
    if (activePositionFilter) {
      parts.push(POS_FILTER_LABELS[activePositionFilter] || activePositionFilter);
    }
    if (activeValueRankFilter) {
      parts.push('身价前' + activeValueRankFilter);
    }
    return parts.join(' · ');
  }

  function syncValuePanelForRankFilter() {
    const valuePanel = document.getElementById(PANEL_ID);
    if (!valuePanel || valuePanel.style.display === 'none') return;
    setPanelCollapsed(valuePanel, !!activeValueRankFilter);
  }

  function clearAllTableFilters() {
    activePositionFilter = null;
    activeValueRankFilter = null;
    if (filterTableRef) applyTableFilters(filterTableRef);
    const valuePanel = document.getElementById(PANEL_ID);
    const concPanel = document.getElementById(CONC_PANEL_ID);
    syncStackFilterActiveState(valuePanel, null);
    syncConcTierFilterActiveState(concPanel, null);
    updateFilterBar(valuePanel, null);
    updateConcFilterBar(concPanel, null);
    syncValuePanelForRankFilter();
  }

  function syncStackFilterActiveState(panel, posCat) {
    if (!panel) return;
    panel.querySelectorAll('[data-tm-pos-filter]').forEach((el) => {
      const local = el.getAttribute('data-tm-filter-scope') === 'local';
      const match = local && !!posCat && el.getAttribute('data-tm-pos-filter') === posCat;
      el.classList.toggle('tm-ls-stack-active', match);
      el.classList.toggle('tm-ls-stack-leg-active', match && el.classList.contains('tm-ls-stack-leg'));
    });
  }

  function updateFilterBar(panel, _unused) {
    if (!panel) return;
    let bar = panel.querySelector('.tm-ls-filter-bar');
    const label = getFilterBarLabel();
    if (!label) {
      if (bar) bar.hidden = true;
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'tm-ls-filter-bar';
      const body = panel.querySelector('.tm-ls-body');
      if (body) body.insertBefore(bar, body.firstChild);
    }
    bar.hidden = false;
    bar.innerHTML =
      '表格筛选：<strong>' +
      escHtml(label) +
      '</strong>' +
      '<button type="button" class="tm-ls-filter-clear">清除筛选</button>';
    if (!bar.getAttribute('data-tm-clear-bound')) {
      bar.setAttribute('data-tm-clear-bound', '1');
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.tm-ls-filter-clear');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        clearAllTableFilters();
      });
    }
  }

  function updateConcFilterBar(panel, _unused) {
    if (!panel) return;
    let bar = panel.querySelector('.tm-conc-filter-bar');
    const label = getFilterBarLabel();
    if (!label) {
      if (bar) bar.hidden = true;
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'tm-conc-filter-bar';
      const body = panel.querySelector('.tm-conc-body');
      if (body) body.insertBefore(bar, body.firstChild);
    }
    bar.hidden = false;
    bar.innerHTML =
      '表格筛选：<strong>' +
      escHtml(label) +
      '</strong>' +
      '<button type="button" class="tm-conc-filter-clear">清除筛选</button>';
    if (!bar.getAttribute('data-tm-clear-bound')) {
      bar.setAttribute('data-tm-clear-bound', '1');
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('.tm-conc-filter-clear');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        clearAllTableFilters();
      });
    }
  }

  function syncConcTierFilterActiveState(panel, topN) {
    if (!panel) return;
    panel.querySelectorAll('[data-tm-val-rank-filter]').forEach((el) => {
      const local = el.getAttribute('data-tm-filter-scope') === 'local';
      const count = parseInt(el.getAttribute('data-tm-val-rank-filter') || '0', 10);
      const match = local && !!topN && count === topN;
      el.classList.toggle('tm-conc-tier-active', match);
    });
  }

  function toggleValueRankFilter(table, topN, valuePanel, concPanel) {
    if (activeValueRankFilter === topN) {
      activeValueRankFilter = null;
      filterTableRef = null;
      applyTableFilters(table);
    } else {
      activeValueRankFilter = topN;
      activePositionFilter = null;
      filterTableRef = table;
      ensureRowValueRanks(table);
      applyTableFilters(table);
    }
    syncStackFilterActiveState(valuePanel, null);
    syncConcTierFilterActiveState(concPanel, activeValueRankFilter);
    updateFilterBar(valuePanel, null);
    updateConcFilterBar(concPanel, null);
    syncValuePanelForRankFilter();
  }

  function togglePositionFilter(table, posCat, panel) {
    const concPanel = document.getElementById(CONC_PANEL_ID);
    if (activePositionFilter === posCat) {
      activePositionFilter = null;
      filterTableRef = null;
      applyTableFilters(table);
    } else {
      activePositionFilter = posCat;
      activeValueRankFilter = null;
      filterTableRef = table;
      applyTableFilters(table);
    }
    syncStackFilterActiveState(panel, activePositionFilter);
    syncConcTierFilterActiveState(concPanel, null);
    updateFilterBar(panel, null);
    updateConcFilterBar(concPanel, null);
    syncValuePanelForRankFilter();
  }

  function bindConcTierFilter(panel, table) {
    if (panel.getAttribute('data-tm-conc-filter-bound')) return;
    panel.setAttribute('data-tm-conc-filter-bound', '1');

    function onFilterClick(e) {
      const target = e.target.closest('[data-tm-val-rank-filter]');
      if (!target) return;
      if (target.getAttribute('data-tm-filter-scope') !== 'local') return;
      e.preventDefault();
      e.stopPropagation();
      const topN = parseInt(target.getAttribute('data-tm-val-rank-filter') || '0', 10);
      if (!topN) return;
      const valuePanel = document.getElementById(PANEL_ID);
      toggleValueRankFilter(table, topN, valuePanel, panel);
    }

    panel.addEventListener('click', onFilterClick);
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest(
        '[data-tm-val-rank-filter][data-tm-filter-scope="local"]'
      );
      if (!target) return;
      e.preventDefault();
      const topN = parseInt(target.getAttribute('data-tm-val-rank-filter') || '0', 10);
      if (topN) {
        const valuePanel = document.getElementById(PANEL_ID);
        toggleValueRankFilter(table, topN, valuePanel, panel);
      }
    });
  }

  function bindStackBarFilter(panel, table) {
    if (panel.getAttribute('data-tm-stack-filter-bound')) return;
    panel.setAttribute('data-tm-stack-filter-bound', '1');

    function onFilterClick(e) {
      const target = e.target.closest('[data-tm-pos-filter]');
      if (!target) return;
      if (target.getAttribute('data-tm-filter-scope') !== 'local') return;
      e.preventDefault();
      e.stopPropagation();
      const pos = target.getAttribute('data-tm-pos-filter');
      if (!pos) return;
      togglePositionFilter(table, pos, panel);
    }

    panel.addEventListener('click', onFilterClick);
    panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target.closest('[data-tm-pos-filter][data-tm-filter-scope="local"]');
      if (!target) return;
      e.preventDefault();
      const pos = target.getAttribute('data-tm-pos-filter');
      if (pos) togglePositionFilter(table, pos, panel);
    });
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function detectValueUnit(sampleText) {
    const s = String(sampleText || '');
    if (/欧元/.test(s)) return '万欧元';
    if (/英镑|英磅/.test(s)) return '万英镑';
    if (/美元|美金/.test(s)) return '万美元';
    if (/万/.test(s)) return '万';
    return '万';
  }

  function formatUnitLabel(unit) {
    const u = unit || '万';
    if (/英镑|英磅/.test(u)) return '英镑';
    if (/欧元/.test(u)) return '欧元';
    if (/美元|美金/.test(u)) return '美元';
    return u;
  }

  function formatMoney(n, unit) {
    if (!Number.isFinite(n)) return '-';
    const scale = (unit || '万').replace(/英镑|英磅|欧元|美元|美金/g, '') || '万';
    if (n >= 10000) {
      const yi = n / 10000;
      const num =
        yi >= 10
          ? yi.toFixed(1)
          : yi.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      return num + '亿';
    }
    const num = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
    return num + scale;
  }

  function resolveNameColumnIndex(headerRow) {
    for (let i = 0; i < headerRow.cells.length; i++) {
      const nt = normalizeHeaderText(headerRow.cells[i].textContent);
      if (nt.includes('球员') || nt === '姓名' || nt.includes('名字')) return i;
    }
    return -1;
  }

  function collectPlayersFromTable(table) {
    const headerRow = pickHeaderRow(table);
    if (!headerRow) return [];

    const colCount = headerRow.cells.length;
    const valueCol = resolveValueColumnIndex(headerRow);
    const posCol = resolvePositionColumnIndex(headerRow);
    const nameCol = resolveNameColumnIndex(headerRow);
    if (valueCol < 0) return [];

    const players = [];
    for (const tb of table.tBodies) {
      for (const tr of tb.rows) {
        if (!isDataRow(tr, colCount, headerRow)) continue;
        const rawVal = tr.cells[valueCol]?.textContent || '';
        const val = parseCell('value', rawVal);
        if (!Number.isFinite(val)) continue;
        const posRaw = posCol >= 0 ? tr.cells[posCol]?.textContent || '' : '';
        const posCat = classifyPosition(posRaw);
        const name =
          nameCol >= 0
            ? String(tr.cells[nameCol]?.textContent || '').trim()
            : '';
        players.push({ name, posRaw, posCat, val });
      }
    }
    return players;
  }

  function sumByPos(players) {
    const out = { gk: 0, def: 0, mid: 0, fwd: 0, other: 0 };
    players.forEach((p) => {
      const k = out[p.posCat] !== undefined ? p.posCat : 'other';
      out[k] += p.val;
    });
    return out;
  }

  /** 前17：按身价取前17，若无门将则替换第17名为身价最高门将 */
  function computeTop17(players) {
    if (!players.length) return { list: [], sum: 0, hasGk: false };

    const sorted = [...players].sort((a, b) => b.val - a.val);
    let picked = sorted.slice(0, 17);
    const hasGk = picked.some((p) => p.posCat === 'gk');

    if (!hasGk) {
      const gks = players.filter((p) => p.posCat === 'gk').sort((a, b) => b.val - a.val);
      if (gks.length) {
        picked = picked.slice(0, 16).concat(gks[0]);
        picked.sort((a, b) => b.val - a.val);
      }
    }

    return {
      list: picked,
      sum: picked.reduce((s, p) => s + p.val, 0),
      hasGk: picked.some((p) => p.posCat === 'gk'),
    };
  }

  function computeGini(values) {
    const arr = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    const n = arr.length;
    if (n === 0) return 0;
    if (n === 1) return 1;
    const sum = arr.reduce((s, v) => s + v, 0);
    if (sum <= 0) return 0;
    let diffSum = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        diffSum += Math.abs(arr[i] - arr[j]);
      }
    }
    return diffSum / (2 * n * sum);
  }

  /** 身价集中度：前N占比 + 基尼系数 → 指数与分级 */
  function computeValueConcentration(players) {
    const values = players.map((p) => p.val).filter((v) => Number.isFinite(v) && v > 0);
    const total = values.reduce((s, v) => s + v, 0);
    if (!values.length || total <= 0) {
      return {
        score: 0,
        label: '-',
        level: 'none',
        top3Pct: 0,
        top7Pct: 0,
        top17Pct: 0,
        gini: 0,
      };
    }

    const sorted = [...values].sort((a, b) => b - a);
    const sumTop = (n) =>
      sorted.slice(0, Math.min(n, sorted.length)).reduce((s, v) => s + v, 0);
    const top3Pct = (sumTop(3) / total) * 100;
    const top7Pct = (sumTop(7) / total) * 100;
    const top17Pct = (sumTop(17) / total) * 100;
    const gini = computeGini(values);
    const score = Math.round(
      Math.min(100, Math.max(0, top7Pct * 0.6 + gini * 100 * 0.4))
    );

    let level;
    let label;
    if (score <= 35) {
      level = 'low';
      label = '分散';
    } else if (score <= 50) {
      level = 'mid-low';
      label = '较分散';
    } else if (score <= 65) {
      level = 'mid';
      label = '适中';
    } else if (score <= 80) {
      level = 'mid-high';
      label = '较集中';
    } else {
      level = 'high';
      label = '高度集中';
    }

    return { score, label, level, top3Pct, top7Pct, top17Pct, gini };
  }

  function concentrationCopy(c) {
    switch (c.level) {
      case 'low':
        return { headline: '身价均衡', summary: '各球员身价差距较小，阵容厚度较好' };
      case 'mid-low':
        return { headline: '略偏集中', summary: '前几名身价略高，整体仍较均衡' };
      case 'mid':
        return { headline: '分布适中', summary: '身价较多集中在前 7 名球员' };
      case 'mid-high':
        return { headline: '偏靠球星', summary: '身价明显向前几名球员集中' };
      case 'high':
        return { headline: '高度依赖球星', summary: '极少数球员贡献了绝大部分身价' };
      default:
        return { headline: c.label || '-', summary: '' };
    }
  }

  const CONC_TIERS = [
    { key: 'top3Pct', count: 3, title: '头号球星', sub: '前 3 人' },
    { key: 'top7Pct', count: 7, title: '核心轮换', sub: '前 7 人' },
    { key: 'top17Pct', count: 17, title: '常规阵容', sub: '前 17 人' },
  ];

  function computeTeamStats(players, unit) {
    const lines = sumByPos(players);
    const top17 = computeTop17(players);
    return {
      unit,
      total: players.reduce((s, p) => s + p.val, 0),
      count: players.length,
      top17: top17.sum,
      top17Count: top17.list.length,
      top17HasGk: top17.hasGk,
      lines,
      concentration: computeValueConcentration(players),
    };
  }

  function guessTeamName(table) {
    let node = table.previousElementSibling;
    for (let i = 0; i < 6 && node; i++) {
      const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 40 && !/号码|身高|体重/.test(t)) return t;
      node = node.previousElementSibling;
    }
    const title = document.title || '';
    const m = title.match(/^(.+?)阵容/);
    if (m) return m[1].trim();
    const h1 = document.querySelector('h1, .title, #sub_menu a.on');
    if (h1) {
      const t = (h1.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return t.replace(/阵容.*$/, '').trim() || t;
    }
    return '本队';
  }

  function barHeightPx(value, max) {
    if (!Number.isFinite(value) || max <= 0) return 0;
    return Math.max(3, Math.round((value / max) * CHART_BAR_MAX_PX));
  }

  function barItemHtml(val, unit, px, kind, title) {
    return (
      '<div class="tm-ls-item" style="--bh:' +
      px +
      'px">' +
      '<span class="tm-ls-vval tm-ls-vval-' +
      kind +
      '">' +
      escHtml(formatMoney(val, unit)) +
      '</span>' +
      '<div class="tm-ls-vbar tm-ls-vbar-' +
      kind +
      '" style="height:' +
      px +
      'px" title="' +
      escHtml(title) +
      '"></div></div>'
    );
  }

  function stackedBarHtml(stats, unit) {
    const seg = [
      { key: 'gk', label: '门将', cls: 'gk' },
      { key: 'def', label: '后卫', cls: 'def' },
      { key: 'mid', label: '中场', cls: 'mid' },
      { key: 'fwd', label: '前锋', cls: 'fwd' },
    ];
    if ((stats.lines.other || 0) > 0) {
      seg.push({ key: 'other', label: '其他', cls: 'other' });
    }
    const total = seg.reduce((s, x) => s + (stats.lines[x.key] || 0), 0);
    if (total <= 0) return '';

    const segAttrs = (key) =>
      ' data-tm-pos-filter="' +
      key +
      '" data-tm-filter-scope="local" role="button" tabindex="0" title="点击筛选' +
      escHtml(POS_FILTER_LABELS[key] || key) +
      '"';

    const parts = seg
      .filter((x) => stats.lines[x.key] > 0)
      .map((x) => {
        const pct = ((stats.lines[x.key] / total) * 100).toFixed(1);
        return (
          '<div class="tm-ls-stack-seg tm-ls-stack-' +
          x.cls +
          ' tm-ls-stack-clickable"' +
          segAttrs(x.key) +
          ' style="width:' +
          pct +
          '%"></div>'
        );
      })
      .join('');

    const legend = seg
      .filter((x) => stats.lines[x.key] > 0)
      .map((x) => {
        const legClass = 'tm-ls-stack-leg tm-ls-stack-leg-' + x.cls + ' tm-ls-stack-clickable';
        return (
          '<span class="' +
          legClass +
          '" data-tm-pos-filter="' +
          x.key +
          '" data-tm-filter-scope="local" role="button" tabindex="0"><i></i>' +
          escHtml(x.label) +
          ' ' +
          escHtml(formatMoney(stats.lines[x.key], unit)) +
          '</span>'
        );
      })
      .join('');

    return (
      '<div class="tm-ls-stack-block">' +
      '<div class="tm-ls-stack-title">位置身价分布（堆叠） · 点击色块筛选球员</div>' +
      '<div class="tm-ls-stack-bar">' +
      parts +
      '</div>' +
      '<div class="tm-ls-stack-legend">' +
      legend +
      '</div></div>'
    );
  }

  function groupedChartHtml(team, unit) {
    const groups = [
      { label: '总身价', key: 'total', sub: '全员合计' },
      { label: '前17', key: 'top17', sub: '含门将' },
      { label: '前锋', line: 'fwd', sub: '锋线' },
      { label: '中场', line: 'mid', sub: '中场' },
      { label: '后卫', line: 'def', sub: '后卫线' },
    ];

    function metricVal(stats, g) {
      if (g.key) return stats[g.key];
      return stats.lines[g.line] || 0;
    }

    let globalMax = 0;
    groups.forEach((g) => {
      globalMax = Math.max(globalMax, metricVal(team.stats, g));
    });
    if (globalMax <= 0) globalMax = 1;

    const clusters = groups
      .map((g) => {
        const h = metricVal(team.stats, g);
        const bars = [barItemHtml(h, unit, barHeightPx(h, globalMax), 'a', team.name)];
        return (
          '<div class="tm-ls-cluster">' +
          '<div class="tm-ls-bars">' +
          bars.join('') +
          '</div>' +
          '<div class="tm-ls-xlabel">' +
          escHtml(g.label) +
          '<span class="tm-ls-xsub">' +
          escHtml(g.sub) +
          '</span></div></div>'
        );
      })
      .join('');

    return (
      '<div class="tm-ls-chart">' +
      '<div class="tm-ls-clusters">' +
      clusters +
      '</div></div>'
    );
  }

  function formatPct(n) {
    if (!Number.isFinite(n)) return '-';
    const num = n >= 10 ? n.toFixed(0) : n.toFixed(1);
    return num.replace(/\.0$/, '') + '%';
  }

  function concTierRowHtml(c, tier) {
    const pct = c[tier.key] || 0;
    const filterAttrs =
      ' data-tm-val-rank-filter="' +
      tier.count +
      '" data-tm-filter-scope="local" role="button" tabindex="0" title="点击筛选身价前' +
      tier.count +
      '球员"';
    return (
      '<div class="tm-conc-tier tm-conc-tier-clickable"' +
      filterAttrs +
      '>' +
      '<div class="tm-conc-tier-head">' +
      '<span class="tm-conc-tier-label">' +
      escHtml(tier.title) +
      '<em>' +
      escHtml(tier.sub) +
      '</em></span>' +
      '<span class="tm-conc-tier-val">占全队 ' +
      escHtml(formatPct(pct)) +
      '</span></div>' +
      '<div class="tm-conc-tier-bar">' +
      '<div class="tm-conc-tier-fill tm-conc-' +
      c.level +
      '" style="width:' +
      Math.min(100, Math.max(0, pct)) +
      '%"></div></div></div>'
    );
  }

  function concTeamCardHtml(stats, teamName) {
    const c = stats.concentration;
    if (!c || c.level === 'none') return '';
    const copy = concentrationCopy(c);
    const tiers = CONC_TIERS.map((t) => concTierRowHtml(c, t)).join('');

    return (
      '<div class="tm-conc-card">' +
      '<div class="tm-conc-verdict tm-conc-' +
      c.level +
      '">' +
      '<div class="tm-conc-score">' +
      c.score +
      '</div>' +
      '<div class="tm-conc-verdict-text">' +
      '<strong>' +
      escHtml(copy.headline) +
      '</strong>' +
      '<span>' +
      escHtml(copy.summary) +
      '</span></div></div>' +
      '<div class="tm-conc-scale">' +
      '<span class="tm-conc-scale-end">均衡</span>' +
      '<div class="tm-conc-scale-track">' +
      '<div class="tm-conc-scale-fill tm-conc-' +
      c.level +
      '" style="width:' +
      c.score +
      '%"></div>' +
      '<div class="tm-conc-scale-marker" style="left:' +
      c.score +
      '%" title="集中度 ' +
      c.score +
      '"></div></div>' +
      '<span class="tm-conc-scale-end">集中</span></div>' +
      '<div class="tm-conc-tiers">' +
      tiers +
      '</div>' +
      '<div class="tm-conc-tier-hint">点击条形筛选球员</div></div>'
    );
  }

  function concPanelBodyHtml(primary) {
    if (!primary.stats.concentration || primary.stats.concentration.level === 'none') {
      return '';
    }
    return (
      concTeamCardHtml(primary.stats, primary.name) +
      '<details class="tm-conc-details">' +
      '<summary>指标说明</summary>' +
      '<p>上方数字为<strong>集中度指数</strong>（0=均衡，100=高度集中），由「前7名占比」与「分布均匀度」综合得出。</p>' +
      '<p>下方条形表示：按身价排序后，前 3 / 7 / 17 名球员的身价占全队比例；点击条形可筛选表格。</p></details>'
    );
  }

  function summaryTableHtml(stats, unit, teamName) {
    const rows = [
      ['总身价', formatMoney(stats.total, unit), stats.count + ' 人'],
      [
        '前17身价',
        formatMoney(stats.top17, unit),
        stats.top17HasGk ? stats.top17Count + ' 人·含门将' : stats.top17Count + ' 人·无门将',
      ],
      ['门将', formatMoney(stats.lines.gk, unit), ''],
      ['后卫', formatMoney(stats.lines.def, unit), ''],
      ['中场', formatMoney(stats.lines.mid, unit), ''],
      ['前锋', formatMoney(stats.lines.fwd, unit), ''],
    ];
    if (stats.lines.other > 0) {
      rows.push(['其他', formatMoney(stats.lines.other, unit), '']);
    }

    const trs = rows
      .map(
        (r) =>
          '<tr><td>' +
          escHtml(r[0]) +
          '</td><td class="tm-ls-num">' +
          escHtml(r[1]) +
          '</td><td class="tm-ls-sub">' +
          escHtml(r[2]) +
          '</td></tr>'
      )
      .join('');

    return (
      '<div class="tm-ls-summary">' +
      '<div class="tm-ls-summary-title">' +
      escHtml(teamName) +
      '</div>' +
      '<table class="tm-ls-sum-table"><tbody>' +
      trs +
      '</tbody></table></div>'
    );
  }

  function panelBodyHtml(primary) {
    const unit = primary.stats.unit || '万';
    let html = summaryTableHtml(primary.stats, unit, primary.name);
    html += stackedBarHtml(primary.stats, unit);
    html += groupedChartHtml(primary, unit);
    return html;
  }

  function injectPanelStyle() {
    if (document.getElementById(PANEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PANEL_STYLE_ID;
    style.textContent =
      '#' +
      PANEL_ID +
      '{position:fixed;right:16px;bottom:20px;z-index:999998;width:min(380px,calc(100vw - 32px));border:1px solid #d8e2ec;border-radius:10px;background:linear-gradient(180deg,#f8fbff 0%,#f1f5f9 100%);overflow:hidden;font-size:12px;color:#1e293b;box-shadow:0 8px 24px rgba(15,23,42,.14);box-sizing:border-box;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#e8eef5;border-bottom:1px solid #d8e2ec;font-weight:600;font-size:12px;color:#475569;cursor:pointer;user-select:none;}' +
      '#' +
      PANEL_ID +
      '.tm-ls-collapsed .tm-ls-head{border-bottom:none;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-head-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-toggle{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;font-size:14px;color:#64748b;}' +
      '#' +
      PANEL_ID +
      '.tm-ls-collapsed .tm-ls-body{display:none;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-unit{font-weight:500;color:#64748b;font-size:11px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-body{padding:10px 12px 12px;max-height:min(70vh,520px);overflow:auto;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-summary{margin-bottom:10px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-summary-title{font-weight:600;color:#334155;margin-bottom:4px;font-size:12px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-sum-table{width:100%;border-collapse:collapse;font-size:11px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-sum-table td{padding:3px 4px;border-bottom:1px solid #e2e8f0;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-sum-table td.tm-ls-num{text-align:right;font-weight:600;color:#0f172a;white-space:nowrap;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-sum-table td.tm-ls-sub{color:#94a3b8;font-size:10px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-block{margin:10px 0;padding:8px;background:rgba(255,255,255,.72);border:1px solid #e2e8f0;border-radius:8px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-title{font-size:11px;font-weight:600;color:#475569;margin-bottom:6px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-bar{display:flex;height:16px;border-radius:6px;overflow:hidden;background:#f1f5f9;box-shadow:inset 0 1px 2px rgba(15,23,42,.06);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-seg{height:100%;min-width:3px;box-sizing:border-box;border-right:1px solid rgba(255,255,255,.55);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-seg:last-child{border-right:none;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-gk{background:linear-gradient(180deg,#bae6fd 0%,#7dd3fc 100%);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-def{background:linear-gradient(180deg,#fde68a 0%,#fbbf24 100%);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-mid{background:linear-gradient(180deg,#bbf7d0 0%,#86efac 100%);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-fwd{background:linear-gradient(180deg,#fecdd3 0%,#fb7185 100%);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-other{background:linear-gradient(180deg,#e2e8f0 0%,#cbd5e1 100%);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-clickable{cursor:pointer;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-clickable:hover{filter:brightness(1.05);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-seg.tm-ls-stack-clickable:hover{box-shadow:inset 0 0 0 1px rgba(15,23,42,.18);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-seg.tm-ls-stack-active{box-shadow:inset 0 0 0 2px #334155;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-leg.tm-ls-stack-leg-active{font-weight:600;color:#334155;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-filter-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 8px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;font-size:11px;color:#475569;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-filter-bar[hidden]{display:none!important;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-filter-clear{margin-left:auto;padding:2px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:10px;color:#64748b;cursor:pointer;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-filter-clear:hover{background:#f8fafc;color:#334155;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:7px;font-size:10px;color:#64748b;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-leg{display:inline-flex;align-items:center;gap:4px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;flex-shrink:0;box-shadow:0 0 0 1px rgba(15,23,42,.08);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-leg-gk i{background:linear-gradient(180deg,#bae6fd,#7dd3fc);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-leg-def i{background:linear-gradient(180deg,#fde68a,#fbbf24);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-leg-mid i{background:linear-gradient(180deg,#bbf7d0,#86efac);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-leg-fwd i{background:linear-gradient(180deg,#fecdd3,#fb7185);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-stack-leg-other i{background:linear-gradient(180deg,#e2e8f0,#cbd5e1);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-chart{margin-top:10px;padding:8px 10px;background:rgba(255,255,255,.72);border:1px solid #e2e8f0;border-radius:8px;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:8px;font-size:10px;color:#64748b;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-leg{display:inline-flex;align-items:center;gap:4px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-leg i{display:inline-block;width:8px;height:8px;border-radius:2px;flex-shrink:0;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-leg-a i{background:linear-gradient(180deg,#bbf7d0,#86efac);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-leg-b i{background:linear-gradient(180deg,#bae6fd,#7dd3fc);}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-clusters{display:flex;align-items:flex-end;justify-content:center;gap:' +
      CHART_GROUP_GAP_PX +
      'px;padding:' +
      CHART_LABEL_TOP_PX +
      'px 2px 0;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-cluster{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-bars{display:flex;flex-direction:row;align-items:flex-end;gap:' +
      CHART_BAR_GAP_PX +
      'px;height:' +
      CHART_BAR_MAX_PX +
      'px;border-bottom:1px solid #cbd5e1;box-sizing:border-box;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-item{position:relative;width:' +
      CHART_BAR_WIDTH_PX +
      'px;height:' +
      CHART_BAR_MAX_PX +
      'px;flex:none;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-vval{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--bh,3px) + 2px);font-size:8px;font-weight:600;line-height:1.1;white-space:nowrap;pointer-events:none;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-vval-a{color:#15803d;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-vval-b{color:#0369a1;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-vbar{position:absolute;left:0;bottom:0;width:' +
      CHART_BAR_WIDTH_PX +
      'px;border-radius:3px 3px 0 0;box-sizing:border-box;transition:height .35s ease;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-vbar-a{background:linear-gradient(180deg,#bbf7d0,#86efac);border:1px solid #4ade80;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-vbar-b{background:linear-gradient(180deg,#bae6fd,#7dd3fc);border:1px solid #38bdf8;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-xlabel{margin-top:6px;font-size:10px;font-weight:600;color:#334155;text-align:center;white-space:nowrap;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-xsub{display:block;margin-top:1px;font-size:8px;font-weight:400;color:#94a3b8;}' +
      '#' +
      PANEL_ID +
      ' .tm-ls-hint{margin-top:8px;font-size:10px;color:#94a3b8;line-height:1.4;}';
    document.head.appendChild(style);
  }

  function injectConcPanelStyle() {
    if (document.getElementById(CONC_PANEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = CONC_PANEL_STYLE_ID;
    style.textContent =
      '#' +
      CONC_PANEL_ID +
      '{position:fixed;top:112px;right:16px;z-index:999999;width:min(348px,calc(100vw - 32px));border:1px solid #d8e2ec;border-radius:10px;background:linear-gradient(180deg,#fff 0%,#f8fafc 100%);overflow:hidden;font-size:12px;color:#1e293b;box-shadow:0 8px 24px rgba(15,23,42,.12);box-sizing:border-box;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:12px;color:#475569;cursor:pointer;user-select:none;}' +
      '#' +
      CONC_PANEL_ID +
      '.tm-conc-collapsed .tm-conc-head{border-bottom:none;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-subtitle{font-weight:400;font-size:10px;color:#94a3b8;margin-left:6px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-toggle{color:#64748b;font-size:14px;}' +
      '#' +
      CONC_PANEL_ID +
      '.tm-conc-collapsed .tm-conc-body{display:none;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-body{padding:8px 12px 10px;max-height:min(60vh,420px);overflow:auto;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-card-compact{padding:6px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-card-team{font-size:11px;font-weight:600;color:#334155;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-verdict{display:flex;align-items:center;gap:8px;margin-bottom:7px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-score{flex-shrink:0;width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;line-height:1;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-verdict-text{display:flex;flex-direction:column;gap:2px;min-width:0;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-verdict-text strong{font-size:13px;color:#0f172a;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-verdict-text span{font-size:10px;color:#64748b;line-height:1.35;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-low .tm-conc-score{background:#dcfce7;color:#166534;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-mid-low .tm-conc-score{background:#ecfccb;color:#3f6212;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-mid .tm-conc-score{background:#fef9c3;color:#854d0e;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-mid-high .tm-conc-score{background:#ffedd5;color:#c2410c;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-high .tm-conc-score{background:#fee2e2;color:#b91c1c;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale{display:flex;align-items:center;gap:6px;margin-bottom:7px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-end{font-size:9px;color:#94a3b8;flex-shrink:0;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-track{position:relative;flex:1;height:6px;background:#e2e8f0;border-radius:999px;overflow:visible;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-fill{position:absolute;left:0;top:0;height:100%;border-radius:999px;opacity:.45;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-marker{position:absolute;top:50%;width:10px;height:10px;margin-left:-5px;margin-top:-5px;border-radius:50%;background:#fff;border:2px solid #475569;box-shadow:0 1px 3px rgba(15,23,42,.2);}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-fill.tm-conc-low{background:#4ade80;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-fill.tm-conc-mid-low{background:#a3e635;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-fill.tm-conc-mid{background:#facc15;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-fill.tm-conc-mid-high{background:#fb923c;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-scale-fill.tm-conc-high{background:#f87171;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tiers{display:flex;flex-direction:column;gap:5px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-head{display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-bottom:2px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-label{font-size:10px;color:#475569;font-weight:600;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-label em{font-style:normal;font-weight:400;color:#94a3b8;margin-left:4px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-val{font-size:10px;color:#64748b;white-space:nowrap;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-bar{height:4px;background:#f1f5f9;border-radius:999px;overflow:hidden;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-fill{height:100%;border-radius:999px;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-fill.tm-conc-low{background:#86efac;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-fill.tm-conc-mid-low{background:#bef264;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-fill.tm-conc-mid{background:#fde047;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-fill.tm-conc-mid-high{background:#fdba74;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-fill.tm-conc-high{background:#fca5a5;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-clickable{cursor:pointer;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-clickable:hover .tm-conc-tier-bar{box-shadow:inset 0 0 0 1px rgba(15,23,42,.12);}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-active .tm-conc-tier-bar{box-shadow:inset 0 0 0 2px #334155;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-active .tm-conc-tier-label{color:#0f172a;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-tier-hint{margin-top:4px;font-size:9px;color:#94a3b8;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-filter-bar{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:6px 8px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;font-size:11px;color:#475569;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-filter-bar[hidden]{display:none!important;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-filter-clear{margin-left:auto;padding:2px 8px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:10px;color:#64748b;cursor:pointer;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-filter-clear:hover{background:#f8fafc;color:#334155;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-compare-note{margin-top:6px;padding:5px 8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:10px;color:#1e40af;line-height:1.35;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-details{margin-top:6px;font-size:10px;color:#64748b;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-details summary{cursor:pointer;color:#475569;font-weight:600;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-details p{margin:6px 0 0;line-height:1.45;}' +
      '#' +
      CONC_PANEL_ID +
      ' .tm-conc-details strong{color:#334155;}';
    document.head.appendChild(style);
  }

  function setConcPanelCollapsed(panel, collapsed) {
    concPanelCollapsed = collapsed;
    panel.classList.toggle('tm-conc-collapsed', collapsed);
    const toggle = panel.querySelector('.tm-conc-toggle');
    if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
    const head = panel.querySelector('.tm-conc-head');
    if (head) head.title = collapsed ? '点击展开（Tab）' : '点击收起（Tab）';
  }

  function areAnyPanelsExpanded() {
    const valuePanel = document.getElementById(PANEL_ID);
    const concPanel = document.getElementById(CONC_PANEL_ID);
    const valueOpen =
      valuePanel &&
      valuePanel.style.display !== 'none' &&
      !valuePanel.classList.contains('tm-ls-collapsed');
    const concOpen =
      concPanel &&
      concPanel.style.display !== 'none' &&
      !concPanel.classList.contains('tm-conc-collapsed');
    return valueOpen || concOpen;
  }

  function toggleAllPanels() {
    const collapse = areAnyPanelsExpanded();
    const valuePanel = document.getElementById(PANEL_ID);
    const concPanel = document.getElementById(CONC_PANEL_ID);
    if (valuePanel && valuePanel.style.display !== 'none') {
      setPanelCollapsed(valuePanel, collapse);
    }
    if (concPanel && concPanel.style.display !== 'none') {
      setConcPanelCollapsed(concPanel, collapse);
    }
  }

  function isTypingElement(el) {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return !!el.isContentEditable;
  }

  function bindTabPanelToggle() {
    if (document.documentElement.getAttribute('data-tm-tab-panel-bound')) return;
    document.documentElement.setAttribute('data-tm-tab-panel-bound', '1');
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
        if (isTypingElement(document.activeElement)) return;
        const valuePanel = document.getElementById(PANEL_ID);
        const concPanel = document.getElementById(CONC_PANEL_ID);
        const hasPanel =
          (valuePanel && valuePanel.style.display !== 'none') ||
          (concPanel && concPanel.style.display !== 'none');
        if (!hasPanel) return;
        e.preventDefault();
        toggleAllPanels();
      },
      true
    );
  }

  function bindConcPanelToggle(panel) {
    if (panel.getAttribute('data-tm-conc-toggle-bound')) return;
    panel.setAttribute('data-tm-conc-toggle-bound', '1');
    const head = panel.querySelector('.tm-conc-head');
    if (!head) return;
    const toggle = () =>
      setConcPanelCollapsed(panel, !panel.classList.contains('tm-conc-collapsed'));
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  function refreshConcPanel(primary, table) {
    const concHtml = concPanelBodyHtml(primary);
    if (!concHtml) {
      const existing = document.getElementById(CONC_PANEL_ID);
      if (existing) existing.style.display = 'none';
      lastConcPanelHtml = '';
      return;
    }

    injectConcPanelStyle();
    let panel = document.getElementById(CONC_PANEL_ID);
    const collapsed = panel
      ? panel.classList.contains('tm-conc-collapsed')
      : concPanelCollapsed;

    if (!panel) {
      panel = document.createElement('div');
      panel.id = CONC_PANEL_ID;
      panel.innerHTML =
        '<div class="tm-conc-head" role="button" tabindex="0" title="点击收起">' +
        '<span class="tm-conc-title">身价集中度<span class="tm-conc-subtitle"></span></span>' +
        '<span class="tm-conc-toggle" aria-hidden="true">▾</span></div>' +
        '<div class="tm-conc-body"></div>';
      document.body.appendChild(panel);
      bindConcPanelToggle(panel);
    }

    const subEl = panel.querySelector('.tm-conc-subtitle');
    if (subEl) subEl.textContent = ' · ' + primary.name;

    if (concHtml !== lastConcPanelHtml) {
      const body = panel.querySelector('.tm-conc-body');
      if (body) body.innerHTML = concHtml;
      lastConcPanelHtml = concHtml;
    }

    if (table) bindConcTierFilter(panel, table);
    if (table && activeValueRankFilter && filterTableRef === table) {
      ensureRowValueRanks(table);
      applyTableFilters(table);
    }
    const valuePanel = document.getElementById(PANEL_ID);
    syncConcTierFilterActiveState(panel, activeValueRankFilter);
    updateConcFilterBar(panel, null);
    updateFilterBar(valuePanel, null);
    setConcPanelCollapsed(panel, collapsed);
    panel.style.display = 'block';
  }

  function setPanelCollapsed(panel, collapsed) {
    panelCollapsed = collapsed;
    panel.classList.toggle('tm-ls-collapsed', collapsed);
    const toggle = panel.querySelector('.tm-ls-toggle');
    if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
    const head = panel.querySelector('.tm-ls-head');
    if (head) head.title = collapsed ? '点击展开（Tab）' : '点击收起（Tab）';
  }

  function bindPanelToggle(panel) {
    if (panel.getAttribute('data-tm-toggle-bound')) return;
    panel.setAttribute('data-tm-toggle-bound', '1');
    const head = panel.querySelector('.tm-ls-head');
    if (!head) return;
    const toggle = () => setPanelCollapsed(panel, !panel.classList.contains('tm-ls-collapsed'));
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  function refreshValuePanel() {
    const tables = findLineupTables();
    if (!tables.length) return;

    const table = tables[0];
    const players = collectPlayersFromTable(table);
    if (!players.length) return;

    const headerRow = pickHeaderRow(table);
    const valueCol = headerRow ? resolveValueColumnIndex(headerRow) : -1;
    let unitSample = '';
    if (valueCol >= 0 && headerRow) {
      for (const tb of table.tBodies) {
        for (const tr of tb.rows) {
          if (!isDataRow(tr, headerRow.cells.length, headerRow)) continue;
          unitSample = tr.cells[valueCol]?.textContent || '';
          if (unitSample) break;
        }
        if (unitSample) break;
      }
    }
    const unit = detectValueUnit(unitSample);
    const stats = computeTeamStats(players, unit);
    const teamName = guessTeamName(table);

    const primary = { name: teamName, stats };
    const bodyHtml = panelBodyHtml(primary);
    refreshConcPanel(primary, table);
    if (bodyHtml === lastPanelHtml) return;

    injectPanelStyle();
    let panel = document.getElementById(PANEL_ID);
    const collapsed = panel ? panel.classList.contains('tm-ls-collapsed') : panelCollapsed;

    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.innerHTML =
        '<div class="tm-ls-head" role="button" tabindex="0" title="点击收起">' +
        '<span class="tm-ls-title">阵容身价统计</span>' +
        '<div class="tm-ls-head-actions">' +
        '<span class="tm-ls-unit">单位：' +
        escHtml(formatUnitLabel(unit)) +
        '</span>' +
        '<span class="tm-ls-toggle" aria-hidden="true">▾</span>' +
        '</div></div>' +
        '<div class="tm-ls-body"></div>';
      document.body.appendChild(panel);
      bindPanelToggle(panel);
    } else {
      const unitEl = panel.querySelector('.tm-ls-unit');
      if (unitEl) unitEl.textContent = '单位：' + formatUnitLabel(unit);
    }

    const body = panel.querySelector('.tm-ls-body');
    if (body) body.innerHTML = bodyHtml;
    bindStackBarFilter(panel, table);
    ensureRowValueRanks(table);
    if (filterTableRef === table && (activePositionFilter || activeValueRankFilter)) {
      applyTableFilters(table);
    }
    syncStackFilterActiveState(panel, activePositionFilter);
    syncConcTierFilterActiveState(document.getElementById(CONC_PANEL_ID), activeValueRankFilter);
    updateFilterBar(panel, null);
    updateConcFilterBar(document.getElementById(CONC_PANEL_ID), null);
    setPanelCollapsed(panel, collapsed);
    panel.style.display = 'block';
    lastPanelHtml = bodyHtml;
  }

  function isPageEnhancementReady() {
    const tables = findLineupTables();
    if (!tables.length) return false;
    return tables.every((table) => table.getAttribute(ATTR_INIT) === '1');
  }

  function init() {
    if (domObserver) domObserver.disconnect();
    try {
      injectStyle();
      bindTabPanelToggle();
      findLineupTables().forEach((table) => {
        augmentClubColumn(table);
        adjustTeamTypeColumns(table);
        augmentBirthdayColumn(table);
        augmentPositionColumn(table);
        wireTable(table);
        augmentJerseyRankBadges(table);
        ensureRowValueRanks(table);
      });
      if (filterTableRef && (activePositionFilter || activeValueRankFilter)) {
        ensureRowValueRanks(filterTableRef);
        applyTableFilters(filterTableRef);
      }
      refreshValuePanel();
    } finally {
      if (domObserver && !isPageEnhancementReady()) {
        domObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
    }
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  const debouncedInit = debounce(init, 250);
  let domObserver = null;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  domObserver = new MutationObserver(debouncedInit);
  if (!isPageEnhancementReady()) {
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
