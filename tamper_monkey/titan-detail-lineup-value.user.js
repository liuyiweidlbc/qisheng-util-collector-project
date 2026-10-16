// ==UserScript==
// @name         Titan007 阵容身价统计
// @namespace    https://titan007.com/
// @version      1.8.65
// @description  在 detail 阵容页解析并展示两队总身价、首发身价、上场身价（首发+换入替补）、首发平均年龄，并显示主客身价倍数与各线（门将/后卫/中场/前锋）身价；首发/替补标注身价·年龄·身高，点击循环；国家队比赛可再切到俱乐部名；悬停球员卡片在生日右侧显示年龄；「预计阵容」或「首发阵容」旁小图标点击切换显示球员国籍（取自悬停提示），右侧足球图标点击后在有进球球员上方显示进球图标和进球数，替补和伤停标在姓名后面，两队总进球显示在首发图左上角和右上角；换人开关默认把已换上的替补放到首发位置，可切回网页原始首发并记住；收起为小方块，Esc 打开/折叠；进球换人图标移到头像旁；点击主教练在新页面打开。右侧快捷栏在「球员身价」上方增加「主教练」（F2，先客后主）。嵌入窗口从主教练标题行开始。首发/上场身价在中场线最上方；主队、客队各线身价细堆叠条分别在首发图左下角、右下角。替补换入箭头右侧用浅色标出被换下球员的号码和名字。
// @match        https://live.titan007.com/detail/*
// @match        http://live.titan007.com/detail/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      info.titan007.com
// ==/UserScript==

(function () {
  'use strict';

  const pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const inFrame = pageWin.top !== pageWin.self;

  const PANEL_ID = 'tm-lineup-value-panel';
  const STYLE_ID = 'tm-lineup-value-style';
  const SCRIPT_VERSION = '1.8.65';
  const METRIC_STORAGE_KEY = 'tm-lv-starter-metric-mode';
  const VALUE_AGE_STORAGE_KEY = 'tm-lv-starter-value-with-age';
  const NAT_STORAGE_KEY = 'tm-lv-show-nat';
  const GOAL_STORAGE_KEY = 'tm-lv-show-goals';
  const GOAL_LEAGUE_KEY = 'tm-lv-goal-league';
  const PITCH_SUBS_KEY = 'tm-lv-pitch-subs';
  const BALL_ICON = '⚽';
  const PITCH_SUBS_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 8h12.2M13.2 5.1L16.6 8l-3.4 2.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '<path d="M20 16H7.8M10.8 13.1L7.4 16l3.4 2.9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>' +
    '</svg>';
  const NAT_ICON_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"></circle>' +
    '<ellipse cx="12" cy="12" rx="4.2" ry="9" fill="none" stroke="currentColor" stroke-width="1.6"></ellipse>' +
    '<path d="M3.2 12h17.6M5.2 8.2h13.6M5.2 15.8h13.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"></path>' +
    '</svg>';
  const CLUB_CACHE_KEY = 'tm-player-club-cache-v10';
  const FORCE_NATIONAL_KEY = 'tm-lv-force-national';
  const FORCE_NAT_TITLE =
    '自动判断未认出国家队时，把本场标为国家队。之后点到「俱乐部」才会请求球员资料。';
  const CLUB_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const BASE_METRIC_MODES = [
    { key: 'value', label: '身价' },
    { key: 'age', label: '年龄' },
    { key: 'height', label: '身高' },
  ];
  const CLUB_METRIC_MODE = { key: 'club', label: '俱乐部' };
  let lineupObserver = null;
  let observedBox = null;
  let lastHtml = '';
  let lastMetricSig = '';
  let refreshing = false;
  let panelCollapsed = false;
  let refreshTimer = null;
  let metricModeKey = 'value';
  let valueWithAge = false;
  let showNat = false;
  let showGoals = false;
  let goalLeagueOnly = false;
  let showPitchSubs = true;
  let pitchSuppress = 0;
  let goalLoading = false;
  let goalPack = null;
  let goalReq = 0;
  let nationalMatch = null;
  let nationalPromise = null;
  let nationalForced = false;
  const clubState = {};
  let clubQueue = Promise.resolve();
  let coachNewPageBound = false;
  let quickCoachOwned = false;

  function playBlob(playEl) {
    const ul = playEl.querySelector('ul');
    const src = ul || playEl;
    return (src.textContent || '').replace(/\u00a0/g, ' ');
  }

  /** 页面格式：身价：600(万欧元) 或 身价：60(万英磅) */
  function parseValueWan(playEl) {
    const blob = playBlob(playEl);
    let m = blob.match(/身价[：:]\s*(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
    m = blob.match(/(\d+(?:\.\d+)?)\([^)]*万/);
    return m ? parseFloat(m[1]) : null;
  }

  function parseValueUnit(playEl) {
    const blob = playBlob(playEl);
    if (blob.indexOf('身价') === -1) return '';
    if (/欧元/.test(blob)) return '万欧元';
    if (/英镑|英磅/.test(blob)) return '万英镑';
    if (/美元|美金/.test(blob)) return '万美元';
    if (/万/.test(blob)) return '万';
    return '';
  }

  function birthdayFromText(text) {
    const m = String(text || '').match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
    if (!m) return null;
    return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
  }

  function birthdayKey(bday) {
    return bday ? bday.y + '-' + bday.m + '-' + bday.d : '';
  }

  function parseBirthday(playEl) {
    const cached = playEl && playEl.dataset && playEl.dataset.tmBday;
    if (cached) {
      const fromCache = birthdayFromText(cached);
      if (fromCache) return fromCache;
    }
    const m = playBlob(playEl).match(/生日[：:]\s*(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
    if (!m) return null;
    return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
  }

  function stampBirthday(playEl, sourceEl) {
    if (!playEl) return;
    const blob = playBlob(sourceEl || playEl);
    const m = blob.match(/生日[：:]\s*(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
    const bday = m
      ? { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) }
      : null;
    const key = birthdayKey(bday);
    if (key) playEl.dataset.tmBday = key;
    else delete playEl.dataset.tmBday;
  }

  function parseHeightCm(playEl) {
    const m = playBlob(playEl).match(/身高[：:]\s*(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function matchAsOfDate() {
    if (pageWin.matchTime instanceof Date && !isNaN(pageWin.matchTime.getTime())) {
      return pageWin.matchTime;
    }
    if (typeof pageWin.strTime === 'string' && pageWin.strTime) {
      const d = new Date(String(pageWin.strTime).replace(/-/g, '/'));
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  function calcAge(bday, asOf) {
    if (!bday || !asOf) return null;
    let age = asOf.getFullYear() - bday.y;
    const md = asOf.getMonth() + 1;
    const dd = asOf.getDate();
    if (md < bday.m || (md === bday.m && dd < bday.d)) age -= 1;
    return age >= 0 && age < 80 ? age : null;
  }

  function activeMetricModes() {
    return nationalMatch ? BASE_METRIC_MODES.concat([CLUB_METRIC_MODE]) : BASE_METRIC_MODES.slice();
  }

  function loadMetricModeKey() {
    try {
      const saved = localStorage.getItem(METRIC_STORAGE_KEY);
      if (saved === 'value' || saved === 'age' || saved === 'height' || saved === 'club') return saved;
    } catch (e) {}
    return 'value';
  }

  function saveMetricModeKey() {
    try {
      localStorage.setItem(METRIC_STORAGE_KEY, metricModeKey);
    } catch (e) {}
  }

  function currentMetricMode() {
    const modes = activeMetricModes();
    for (let i = 0; i < modes.length; i++) {
      if (modes[i].key === metricModeKey) return modes[i];
    }
    return modes[0];
  }

  function nextMetricMode() {
    const modes = activeMetricModes();
    const cur = currentMetricMode();
    const i = modes.findIndex(function (m) {
      return m.key === cur.key;
    });
    return modes[(i + 1) % modes.length];
  }

  function modeCycleText() {
    return activeMetricModes()
      .map(function (m) {
        return m.label;
      })
      .join(' → ');
  }

  function loadValueWithAge() {
    try {
      return localStorage.getItem(VALUE_AGE_STORAGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function saveValueWithAge() {
    try {
      localStorage.setItem(VALUE_AGE_STORAGE_KEY, valueWithAge ? '1' : '0');
    } catch (e) {}
  }

  function formatAgeText(playEl) {
    const age = calcAge(parseBirthday(playEl), matchAsOfDate());
    return Number.isFinite(age) ? age + '岁' : '-';
  }

  function findBirthdayLi(playEl) {
    const ul = playEl && playEl.querySelector('ul');
    if (!ul) return null;
    const lis = ul.querySelectorAll('li');
    for (let i = 0; i < lis.length; i++) {
      if (/生日[：:]/.test((lis[i].textContent || '').replace(/\u00a0/g, ' '))) {
        return lis[i];
      }
    }
    return null;
  }

  function annotateHoverAge(playEl) {
    const li = findBirthdayLi(playEl);
    if (!li) return;
    const age = calcAge(parseBirthday(playEl), matchAsOfDate());
    if (!Number.isFinite(age)) return;
    const text = '（' + age + '岁）';
    li.classList.add('tm-lv-bday');
    let span = li.querySelector('.tm-lv-hover-age');
    if (!span) {
      span = document.createElement('span');
      span.className = 'tm-lv-hover-age';
      li.appendChild(span);
    }
    if (span.textContent !== text) span.textContent = text;
  }

  function widenHoverCard(playEl) {
    const ul = playEl && playEl.querySelector('ul');
    if (!ul) return;
    ul.style.setProperty('width', '250px', 'important');
    ul.style.setProperty('min-width', '250px', 'important');
    const lis = ul.children;
    for (let i = 0; i < lis.length; i++) {
      const li = lis[i];
      if (!li || li.tagName !== 'LI') continue;
      if (li.classList && li.classList.contains('icon')) continue;
      li.style.setProperty('width', '160px', 'important');
      li.style.setProperty('max-width', 'none', 'important');
      li.style.setProperty('overflow', 'visible', 'important');
      li.style.setProperty('text-overflow', 'clip', 'important');
    }
  }

  function annotateAllHoverAges(box) {
    if (!box) return;
    const prevRefreshing = refreshing;
    refreshing = true;
    try {
      box.querySelectorAll('.play').forEach(function (playEl) {
        widenHoverCard(playEl);
        annotateHoverAge(playEl);
      });
    } finally {
      refreshing = prevRefreshing;
    }
  }

  function loadShowNat() {
    try {
      return localStorage.getItem(NAT_STORAGE_KEY) === '1';
    } catch (e) {}
    return false;
  }

  function saveShowNat() {
    try {
      localStorage.setItem(NAT_STORAGE_KEY, showNat ? '1' : '0');
    } catch (e) {}
  }

  function parseNationality(playEl) {
    const ul = playEl && playEl.querySelector('ul');
    if (!ul) return '';
    const lis = ul.querySelectorAll('li');
    for (let i = 0; i < lis.length; i++) {
      const text = (lis[i].textContent || '').replace(/\u00a0/g, ' ').trim();
      const m = text.match(/国籍[：:]\s*(.+)/);
      if (m && m[1]) return m[1].trim();
    }
    return '';
  }

  function lineupTitleEl() {
    const box = document.getElementById('matchBox2');
    const parent = box && box.parentElement;
    if (!parent) return null;
    const titles = parent.querySelectorAll(':scope > .title');
    for (let i = 0; i < titles.length; i++) {
      const text = titles[i].textContent || '';
      if (text.indexOf('预计阵容') !== -1 || text.indexOf('首发阵容') !== -1) return titles[i];
    }
    return null;
  }

  function syncNatToggle() {
    const btn = document.querySelector('.tm-lv-nat-btn');
    if (!btn) return;
    btn.classList.toggle('tm-lv-nat-on', showNat);
    btn.title = showNat ? '点击隐藏国籍' : '点击显示国籍';
    btn.setAttribute('aria-pressed', showNat ? 'true' : 'false');
  }

  function toggleShowNat(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    showNat = !showNat;
    saveShowNat();
    syncNatToggle();
    renderNationality(document.getElementById('matchBox2'));
  }

  function ensureNatToggle() {
    const title = lineupTitleEl();
    if (!title) return;
    let btn = title.querySelector('.tm-lv-nat-btn');
    if (!btn) {
      btn = document.createElement('span');
      btn.className = 'tm-lv-nat-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', '显示国籍');
      btn.innerHTML = NAT_ICON_SVG;
      title.appendChild(btn);
      btn.addEventListener('click', toggleShowNat);
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        toggleShowNat(e);
      });
    }
    syncNatToggle();
  }

  function renderNationality(box) {
    if (!box) return;
    const prevRefreshing = refreshing;
    refreshing = true;
    try {
      box.querySelectorAll('.play').forEach(function (playEl) {
        let el = playEl.querySelector('.tm-lv-nat');
        if (!showNat) {
          if (el) el.remove();
          return;
        }
        const nat = parseNationality(playEl);
        if (!nat) {
          if (el) el.remove();
          return;
        }
        if (!el) {
          el = document.createElement('b');
          el.className = 'tm-lv-nat';
          const metric = playEl.querySelector('.tm-lv-metric');
          const nameEl = playEl.querySelector('.name');
          const anchor = metric || nameEl;
          if (anchor) anchor.insertAdjacentElement('afterend', el);
          else playEl.appendChild(el);
        }
        if (el.textContent !== nat) el.textContent = nat;
        el.title = nat;
      });
    } finally {
      refreshing = prevRefreshing;
    }
  }

  function loadShowGoals() {
    try {
      return localStorage.getItem(GOAL_STORAGE_KEY) === '1';
    } catch (e) {}
    return false;
  }

  function loadGoalLeagueOnly() {
    try {
      return localStorage.getItem(GOAL_LEAGUE_KEY) === '1';
    } catch (e) {}
    return false;
  }

  function saveShowGoals() {
    try {
      localStorage.setItem(GOAL_STORAGE_KEY, showGoals ? '1' : '0');
      localStorage.setItem(GOAL_LEAGUE_KEY, showGoals && goalLeagueOnly ? '1' : '0');
    } catch (e) {}
  }

  function gmGetText(url) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('需要允许 GM_xmlhttpRequest 才能读取球员进球'));
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        timeout: 15000,
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        onload: function (res) {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText || '');
          else reject(new Error('读取失败 HTTP ' + res.status));
        },
        onerror: function () {
          reject(new Error('读取球员数据失败'));
        },
        ontimeout: function () {
          reject(new Error('读取球员数据超时'));
        },
      });
    });
  }

  function seasonFromTitle() {
    const m = String(document.title || '').match(/(\d{4}(?:-\d{4})?)\s*赛季/);
    return m ? m[1] : '';
  }

  function matchLeagueName() {
    const a = document.querySelector('a.LName');
    return a ? String(a.textContent || '').replace(/\s+/g, '') : '';
  }

  function matchSclassId() {
    const a = document.querySelector('a.LName');
    const href = (a && a.getAttribute('href')) || '';
    let m = href.match(/[?&]sclassid=(\d+)/i);
    if (!m) m = href.match(/\/(?:SubLeague|subleague|League|CupMatch|cupmatch)\/(\d+)\.html/i);
    return m ? m[1] : '';
  }

  function goalCacheKey(ids, season, sclassId, leagueName) {
    return [ids.home || '', ids.away || '', season || '', sclassId || '', leagueName || '', 'both'].join('|');
  }

  function readGoalTable(table) {
    const byId = {};
    let total = 0;
    if (!table) return { byId: byId, total: 0 };
    const rows = table.querySelectorAll('tr');
    let header = null;
    for (let r = 0; r < rows.length; r++) {
      const text = String(rows[r].textContent || '').replace(/\s+/g, '');
      if (text.indexOf('总进球') !== -1 && text.indexOf('球员') !== -1) {
        header = rows[r];
        break;
      }
    }
    if (!header) return { byId: byId, total: 0 };
    const heads = header.cells || header.children;
    let goalIdx = -1;
    let nameIdx = -1;
    for (let i = 0; i < heads.length; i++) {
      const text = String(heads[i].textContent || '').replace(/\s+/g, '');
      if (nameIdx < 0 && text.indexOf('球员') !== -1) nameIdx = i;
      if (goalIdx < 0 && text.indexOf('总进球') !== -1) goalIdx = i;
    }
    if (goalIdx < 0 || nameIdx < 0) return { byId: byId, total: 0 };
    const headerIndex = Array.prototype.indexOf.call(rows, header);
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const cells = rows[r].cells || rows[r].children;
      if (!cells || cells.length <= goalIdx || cells.length <= nameIdx) continue;
      const link = cells[nameIdx].querySelector && cells[nameIdx].querySelector('a');
      const href = (link && link.getAttribute('href')) || '';
      const idm = href.match(/playerid=(\d+)/i) || href.match(/\/player\/\d+\/(\d+)\.html/i);
      const goals = parseInt(String(cells[goalIdx].textContent || '').replace(/\s+/g, ''), 10);
      if (!idm || !isFinite(goals) || goals <= 0) continue;
      byId[idm[1]] = goals;
      total += goals;
    }
    return { byId: byId, total: total };
  }

  function addGoalMap(target, part) {
    Object.keys((part && part.byId) || {}).forEach(function (id) {
      target[id] = (target[id] || 0) + part.byId[id];
    });
  }

  function sameLeagueTable(doc) {
    const menu = doc.querySelector('#menuContent [id^="menu_"]');
    const idm = menu && String(menu.id || '').match(/menu_(\d+)/);
    const name = menu ? String(menu.textContent || '').replace(/\s+/g, '') : '';
    return {
      table: idm ? doc.getElementById('tb_' + idm[1]) : null,
      name: name,
    };
  }

  function parseGoalTable(html) {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const byId = {};
    let total = 0;
    doc.querySelectorAll('table[id^="tb_"]').forEach(function (table) {
      const part = readGoalTable(table);
      addGoalMap(byId, part);
      total += part.total;
    });
    const league = sameLeagueTable(doc);
    const leagueParsed = readGoalTable(league.table);
    return {
      byId: byId,
      total: total,
      leagueById: leagueParsed.byId,
      leagueTotal: leagueParsed.total,
      leagueName: league.name || '',
    };
  }

  function resolveGoalSeason(teamId) {
    const fromTitle = seasonFromTitle();
    if (fromTitle) return Promise.resolve(fromTitle);
    return gmGetText('https://info.titan007.com/cn/team/PlayerData/' + teamId + '.html').then(function (html) {
      const m = String(html || '').match(/currMatchSeason\s*=\s*['"]([^'"]+)['"]/);
      if (!m) throw new Error('未能识别当前赛季');
      return m[1];
    });
  }

  function loadSideGoals(teamId, season) {
    const url =
      'https://info.titan007.com/cn/team/PlayerDataAjax.aspx?SclassID=0&matchSeason=' +
      encodeURIComponent(season) +
      '&teamID=' +
      teamId +
      '&_=' +
      Date.now();
    return gmGetText(url).then(function (html) {
      if (!/menuContent|id=["']tb_/.test(html)) throw new Error('球员进球数据为空');
      return parseGoalTable(html);
    });
  }

  function ensureGoalData() {
    const ids = matchTeamIds();
    if (!ids.home || !ids.away) return Promise.reject(new Error('未能识别两队，无法读取进球'));
    const sclassId = matchSclassId();
    const leagueName = matchLeagueName();
    return resolveGoalSeason(ids.home).then(function (season) {
      const key = goalCacheKey(ids, season, sclassId, leagueName);
      if (goalPack && goalPack.key === key && goalPack.leagueById) return goalPack;
      return Promise.all([
        loadSideGoals(ids.home, season),
        loadSideGoals(ids.away, season),
      ]).then(function (pair) {
        const byId = {};
        const leagueById = {};
        addGoalMap(byId, pair[0]);
        addGoalMap(byId, pair[1]);
        addGoalMap(leagueById, { byId: pair[0].leagueById });
        addGoalMap(leagueById, { byId: pair[1].leagueById });
        goalPack = {
          key: key,
          leagueName: pair[0].leagueName || pair[1].leagueName || leagueName || '',
          homeLeagueName: pair[0].leagueName || leagueName || '',
          awayLeagueName: pair[1].leagueName || leagueName || '',
          homeTotal: pair[0].total,
          awayTotal: pair[1].total,
          homeLeague: pair[0].leagueTotal,
          awayLeague: pair[1].leagueTotal,
          byId: byId,
          leagueById: leagueById,
        };
        return goalPack;
      });
    });
  }

  function syncGoalToggle() {
    const btn = document.querySelector('.tm-lv-goal-btn');
    if (!btn) return;
    btn.classList.toggle('tm-lv-goal-on', showGoals && !goalLeagueOnly);
    btn.classList.toggle('tm-lv-goal-league', showGoals && goalLeagueOnly);
    btn.classList.toggle('tm-lv-goal-loading', goalLoading);
    let title = '点击显示全部赛事进球，右击只显示本场相同联赛';
    if (goalLoading) title = '正在读取进球';
    else if (showGoals && goalLeagueOnly) title = '当前只显示相同联赛进球，右击隐藏；点击改为全部赛事';
    else if (showGoals) title = '当前显示全部赛事进球，点击隐藏；右击改为相同联赛';
    btn.title = title;
    btn.setAttribute('aria-pressed', showGoals ? 'true' : 'false');
  }

  function renderGoalMarks() {
    document.querySelectorAll('.tm-lv-goal, .tm-lv-goal-sum').forEach(function (el) {
      el.remove();
    });
    syncGoalToggle();
    if (!showGoals || !goalPack) return;
    const box = document.getElementById('matchBox2');
    if (!box) return;
    const prevRefreshing = refreshing;
    refreshing = true;
    try {
      const goalMap = goalLeagueOnly ? goalPack.leagueById || {} : goalPack.byId || {};
      box.querySelectorAll('.play').forEach(function (playEl) {
        const id = playerId(playEl);
        const goals = id && goalMap[String(id)];
        if (!goals) return;
        const badge = document.createElement('span');
        badge.className = 'tm-lv-goal';
        badge.title = goals + '球';
        badge.innerHTML = BALL_ICON + '<span>' + goals + '</span>';
        if (playEl.closest('.plays')) {
          const host = playEl.querySelector('span') || playEl;
          host.appendChild(badge);
          return;
        }
        const nameEl = playEl.querySelector('.name');
        if (nameEl) nameEl.insertAdjacentElement('afterend', badge);
        else playEl.appendChild(badge);
      });
      const plays = box.querySelector('.plays');
      if (plays) {
        [
          { side: 'home', total: goalLeagueOnly ? goalPack.homeLeague : goalPack.homeTotal },
          { side: 'away', total: goalLeagueOnly ? goalPack.awayLeague : goalPack.awayTotal },
        ].forEach(function (item) {
          const sum = document.createElement('span');
          sum.className = 'tm-lv-goal-sum tm-lv-goal-sum-' + item.side;
          const leagueLabel =
            item.side === 'home' ? goalPack.homeLeagueName : goalPack.awayLeagueName;
          const comp = goalLeagueOnly ? leagueLabel || goalPack.leagueName || '相同联赛' : '全部赛事';
          sum.title = comp + '总进球';
          sum.innerHTML = BALL_ICON + '<span>' + item.total + '</span>';
          plays.appendChild(sum);
        });
      }
    } finally {
      refreshing = prevRefreshing;
    }
  }

  function refreshGoalMarks(alertOnError) {
    ensureGoalToggle();
    if (!showGoals) {
      renderGoalMarks();
      return;
    }
    const ids = matchTeamIds();
    const season = seasonFromTitle();
    const parts = goalPack ? String(goalPack.key || '').split('|') : [];
    const samePack =
      goalPack &&
      ids.home &&
      ids.away &&
      parts[0] === ids.home &&
      parts[1] === ids.away &&
      (!season || parts[2] === season) &&
      parts[3] === (matchSclassId() || '') &&
      parts[4] === (matchLeagueName() || '') &&
      parts[5] === 'both';
    if (samePack) {
      renderGoalMarks();
      return;
    }
    if (goalLoading) return;
    goalLoading = true;
    syncGoalToggle();
    const req = ++goalReq;
    ensureGoalData()
      .then(function () {
        if (req !== goalReq || !showGoals) return;
        goalLoading = false;
        renderGoalMarks();
      })
      .catch(function (err) {
        if (req !== goalReq) return;
        goalLoading = false;
        showGoals = false;
        saveShowGoals();
        syncGoalToggle();
        renderGoalMarks();
        if (alertOnError) alert((err && err.message) || '读取球员进球失败');
      });
  }

  function applyGoalMode(show, leagueOnly) {
    if (goalLoading) return;
    showGoals = show;
    goalLeagueOnly = !!leagueOnly && show;
    saveShowGoals();
    if (!showGoals) {
      goalReq += 1;
      renderGoalMarks();
      return;
    }
    refreshGoalMarks(true);
  }

  function toggleShowGoals(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.button === 2) return;
    }
    if (showGoals && !goalLeagueOnly) applyGoalMode(false, false);
    else applyGoalMode(true, false);
  }

  function toggleGoalLeague(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (showGoals && goalLeagueOnly) applyGoalMode(false, false);
    else applyGoalMode(true, true);
  }

  function ensureGoalToggle() {
    const title = lineupTitleEl();
    if (!title) return;
    let btn = title.querySelector('.tm-lv-goal-btn');
    if (!btn) {
      btn = document.createElement('span');
      btn.className = 'tm-lv-goal-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', '显示进球');
      btn.textContent = BALL_ICON;
      title.appendChild(btn);
      btn.addEventListener('click', toggleShowGoals);
      btn.addEventListener('contextmenu', toggleGoalLeague);
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        toggleShowGoals(e);
      });
    }
    syncGoalToggle();
  }

  function loadPitchSubs() {
    try {
      return localStorage.getItem(PITCH_SUBS_KEY) !== '0';
    } catch (e) {}
    return true;
  }

  function savePitchSubs() {
    try {
      localStorage.setItem(PITCH_SUBS_KEY, showPitchSubs ? '1' : '0');
    } catch (e) {}
  }

  function withPitchSuppress(fn) {
    pitchSuppress += 1;
    const prevRefreshing = refreshing;
    refreshing = true;
    try {
      fn();
    } finally {
      refreshing = prevRefreshing;
      Promise.resolve().then(function () {
        pitchSuppress = Math.max(0, pitchSuppress - 1);
      });
    }
  }

  function pagePlayHtml(playEl) {
    const clone = playEl.cloneNode(true);
    clone.querySelectorAll('.tm-lv-hover-age').forEach(function (n) {
      n.remove();
    });
    clone.querySelectorAll('.tm-lv-bday').forEach(function (n) {
      n.classList.remove('tm-lv-bday');
    });
    clone
      .querySelectorAll('.tm-lv-metric, .tm-lv-subout, .tm-lv-nat, .tm-lv-goal')
      .forEach(function (n) {
        n.remove();
      });
    return clone.innerHTML;
  }

  function capturePlayOrig(box) {
    if (!box) return;
    box.querySelectorAll('.play').forEach(function (playEl) {
      const mouse = playEl.getAttribute('onmouseover') || '';
      const curId = playerId(playEl);
      const known = playEl.dataset.tmLvOrig != null;
      if (known && (!curId || curId !== origPlayId(playEl))) return;
      playEl.dataset.tmLvOrig = pagePlayHtml(playEl);
      playEl.dataset.tmLvMouse = mouse;
      playEl.dataset.tmLvClass = playEl.className;
    });
  }

  function origPlayId(playEl) {
    const mouse = (playEl && playEl.dataset && playEl.dataset.tmLvMouse) || '';
    let m = mouse.match(/setImgUrl\((\d+)\)/);
    if (m) return m[1];
    const html = (playEl && playEl.dataset && playEl.dataset.tmLvOrig) || '';
    m = html.match(/playerTech_(\d+)/) || html.match(/\/player\/\d+\/(\d+)\.html/i);
    return m ? m[1] : '';
  }

  function restorePlayOrig(playEl) {
    if (!playEl || playEl.dataset.tmLvOrig == null) return;
    if (String(playerId(playEl) || '') === String(origPlayId(playEl) || '')) return;
    lastMetricSig = '';
    playEl.innerHTML = playEl.dataset.tmLvOrig;
    const mouse = playEl.dataset.tmLvMouse || '';
    if (mouse) playEl.setAttribute('onmouseover', mouse);
    else playEl.removeAttribute('onmouseover');
    if (playEl.dataset.tmLvClass) playEl.className = playEl.dataset.tmLvClass;
    stampBirthday(playEl);
  }

  const PITCH_NOPHOTO =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e5e7eb"/>' +
        '<circle cx="32" cy="24" r="12" fill="#9ca3af"/>' +
        '<path d="M12 58c4-12 12-18 20-18s16 6 20 18" fill="#9ca3af"/></svg>'
    );

  function playerPhotoSrc(id) {
    const data = String((pageWin && pageWin.playerImgData) || '');
    const m = data.match(new RegExp('(?:^|\\^)' + id + ',(images/[^\\^]*)'));
    if (!m || !m[1]) return PITCH_NOPHOTO;
    return '//zq.titan007.com/Image/player/' + m[1];
  }

  function latestSubId(starterId, replacedBy) {
    let cur = starterId;
    const seen = {};
    while (replacedBy[cur] && !seen[cur]) {
      seen[cur] = 1;
      cur = replacedBy[cur];
    }
    return cur;
  }

  function pitchSubPairs(box) {
    const inToOut = subInToOutMap();
    const replacedBy = {};
    Object.keys(inToOut).forEach(function (inId) {
      replacedBy[inToOut[inId]] = inId;
    });
    const byId = {};
    box.querySelectorAll('.play').forEach(function (playEl) {
      const id = playerId(playEl);
      if (id && !byId[id]) byId[id] = playEl;
    });
    const pairs = [];
    box.querySelectorAll('.plays .play').forEach(function (pitchEl) {
      const starterId = playerId(pitchEl);
      const subId = latestSubId(starterId, replacedBy);
      if (!starterId || !subId || subId === starterId) return;
      const benchEl = byId[subId];
      if (!benchEl || (benchEl.closest && benchEl.closest('.plays'))) return;
      pairs.push({ pitch: pitchEl, bench: benchEl });
    });
    return pairs;
  }

  function fillPitchFromBench(pitchEl, benchEl) {
    const pitch = pitchEl.cloneNode(true);
    const bench = benchEl.cloneNode(true);
    const subId = playerId(bench);
    const subLink = bench.querySelector('.name a');
    const subNum = shirtNo(bench);
    const subTech = bench.querySelector('.eventicon, [id^="playerTech_"]');
    pitch.setAttribute('onmouseover', 'setImgUrl(' + subId + ')');
    const num = pitch.querySelector('.num');
    if (num) num.textContent = subNum ? subNum + ' ' : '';
    const img = pitch.querySelector('.headpic img');
    if (img) {
      img.setAttribute('src', playerPhotoSrc(subId));
      if (img.id && /^playerImg_\d+$/.test(img.id)) img.id = 'playerImg_' + subId;
    }
    const link = pitch.querySelector('.name a');
    if (link && subLink) {
      link.textContent = subLink.textContent;
      link.setAttribute('href', subLink.getAttribute('href') || '');
      const title = subLink.getAttribute('title');
      if (title) link.setAttribute('title', title);
      else link.removeAttribute('title');
    }
    const ul = pitch.querySelector('ul');
    const subUl = bench.querySelector('ul');
    if (ul && subUl) ul.innerHTML = subUl.innerHTML;
    stampBirthday(pitch, bench);
    let tech = pitch.querySelector('[id^="playerTech_"]');
    if (!tech) {
      tech = document.createElement('div');
      pitch.appendChild(tech);
    }
    tech.id = 'playerTech_' + subId;
    tech.innerHTML = eventIconHtml(subTech);
    const captain = pitch.querySelector('.captain');
    if (captain) captain.remove();
    return pitch;
  }

  function fillBenchFromPitch(benchEl, pitchEl) {
    const bench = benchEl.cloneNode(true);
    const pitch = pitchEl.cloneNode(true);
    const starterId = playerId(pitch);
    const starterLink = pitch.querySelector('.name a');
    const starterNum = shirtNo(pitch);
    const starterTech = pitch.querySelector('[id^="playerTech_"]');
    bench.setAttribute('onmouseover', 'setImgUrl(' + starterId + ')');
    const num = bench.querySelector('.name i');
    if (num) num.textContent = starterNum ? starterNum + ' ' : '';
    const link = bench.querySelector('.name a');
    if (link && starterLink) {
      link.textContent = starterLink.textContent;
      link.setAttribute('href', starterLink.getAttribute('href') || '');
      const title = starterLink.getAttribute('title');
      if (title) link.setAttribute('title', title);
      else link.removeAttribute('title');
    }
    const ul = bench.querySelector('ul');
    const starterUl = pitch.querySelector('ul');
    if (ul && starterUl) ul.innerHTML = starterUl.innerHTML;
    stampBirthday(bench, pitch);
    let tech = bench.querySelector('.eventicon, [id^="playerTech_"]');
    if (!tech) {
      tech = document.createElement('div');
      tech.className = 'eventicon';
      const name = bench.querySelector('.name');
      if (name) name.insertAdjacentElement('afterend', tech);
      else bench.appendChild(tech);
    }
    tech.id = 'playerTech_' + starterId;
    if (!tech.classList.contains('eventicon')) tech.classList.add('eventicon');
    tech.innerHTML = eventIconHtml(starterTech);
    return bench;
  }

  function assignPlayView(playEl, view) {
    lastMetricSig = '';
    playEl.innerHTML = view.innerHTML;
    const mouse = view.getAttribute('onmouseover');
    if (mouse) playEl.setAttribute('onmouseover', mouse);
    else playEl.removeAttribute('onmouseover');
    if (view.dataset && view.dataset.tmBday) playEl.dataset.tmBday = view.dataset.tmBday;
    else delete playEl.dataset.tmBday;
  }

  function restoreOriginalLineup(box) {
    if (!box) return;
    capturePlayOrig(box);
    withPitchSuppress(function () {
      box.querySelectorAll('.play').forEach(restorePlayOrig);
    });
  }

  function placeSubsOnPitch(box) {
    if (!box || !showPitchSubs) return;
    const pairs = pitchSubPairs(box);
    if (!pairs.length) return;
    const jobs = pairs.map(function (pair) {
      return {
        pitch: pair.pitch,
        bench: pair.bench,
        pitchView: fillPitchFromBench(pair.pitch, pair.bench),
        benchView: fillBenchFromPitch(pair.bench, pair.pitch),
      };
    });
    withPitchSuppress(function () {
      jobs.forEach(function (job) {
        assignPlayView(job.pitch, job.pitchView);
        job.pitch.classList.remove('captain');
        assignPlayView(job.bench, job.benchView);
      });
    });
  }

  function syncPitchSubsToggle() {
    const btn = document.querySelector('.tm-lv-pitch-btn');
    if (!btn) return;
    btn.classList.toggle('tm-lv-pitch-on', showPitchSubs);
    btn.title = showPitchSubs
      ? '换上的替补在首发位置。点击恢复网页原始首发'
      : '当前是网页原始首发。点击把换上的替补放到首发图';
    btn.setAttribute('aria-pressed', showPitchSubs ? 'true' : 'false');
  }

  function togglePitchSubs(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    showPitchSubs = !showPitchSubs;
    savePitchSubs();
    syncPitchSubsToggle();
    refresh();
  }

  function ensurePitchSubsToggle() {
    const title = lineupTitleEl();
    if (!title) return;
    let btn = title.querySelector('.tm-lv-pitch-btn');
    if (!btn) {
      btn = document.createElement('span');
      btn.className = 'tm-lv-pitch-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', '切换换上替补');
      btn.innerHTML = PITCH_SUBS_ICON;
      title.appendChild(btn);
      btn.addEventListener('click', togglePitchSubs);
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        togglePitchSubs(e);
      });
    }
    syncPitchSubsToggle();
  }

  function shirtNo(playEl) {
    const el = playEl && (playEl.querySelector('.num') || playEl.querySelector('.name i'));
    return el ? String(el.textContent || '').replace(/\s+/g, '') : '';
  }

  function shortName(playEl) {
    const a = playEl && playEl.querySelector('.name a');
    if (!a) return '';
    return (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function playerIdFromHref(a) {
    const m = ((a && a.getAttribute('href')) || '').match(/\/(\d+)\.html/i);
    return m ? m[1] : '';
  }

  /** 重要事件里的换人：4 换入、5 换出。主队图标在名字前，客队图标在名字后。 */
  function subInToOutMap() {
    const root = document.getElementById('teamEventDiv');
    const map = {};
    if (!root) return map;
    root.querySelectorAll('li').forEach(function (li) {
      if (!li.querySelector('img[src*="bf_img2/11.png"]')) return;
      li.querySelectorAll('.data > span').forEach(function (span) {
        const role = {};
        let pendingIcon = '';
        let pendingId = '';
        for (let i = 0; i < span.childNodes.length; i++) {
          const n = span.childNodes[i];
          if (!n || n.nodeType !== 1) continue;
          if (n.tagName === 'IMG') {
            const m = (n.getAttribute('src') || '').match(/bf_img2\/(\d+)\.png/);
            const kind = m && (m[1] === '4' || m[1] === '5') ? m[1] : '';
            if (!kind) continue;
            if (pendingId && !role[pendingId]) {
              role[pendingId] = kind;
              pendingId = '';
            } else {
              pendingIcon = kind;
            }
            continue;
          }
          if (n.tagName !== 'A') continue;
          const id = playerIdFromHref(n);
          if (!id) continue;
          if (pendingIcon) {
            role[id] = pendingIcon;
            pendingIcon = '';
          } else {
            pendingId = id;
          }
        }
        let inId = '';
        let outId = '';
        Object.keys(role).forEach(function (id) {
          if (role[id] === '4') inId = id;
          if (role[id] === '5') outId = id;
        });
        if (inId && outId) map[inId] = outId;
      });
    });
    return map;
  }

  function lineupPlayerIndex(box) {
    const map = {};
    box.querySelectorAll('.play').forEach(function (playEl) {
      const id = playerId(playEl);
      if (!id) return;
      map[id] = { num: shirtNo(playEl), name: shortName(playEl) };
    });
    return map;
  }

  function eventIconHtml(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.tm-lv-subout').forEach(function (n) {
      n.remove();
    });
    return clone.innerHTML;
  }

  /** 替补换入箭头右侧，浅色标出被换下的号码和名字。换上首发时不再标，避免白字盖住身价。 */
  function annotateSubOut(box) {
    if (!box) return;
    if (showPitchSubs) {
      box.querySelectorAll('.tm-lv-subout').forEach(function (el) {
        el.remove();
      });
      return;
    }
    const index = lineupPlayerIndex(box);
    const inToOut = subInToOutMap();
    const prevRefreshing = refreshing;
    refreshing = true;
    try {
      box.querySelectorAll('.backupPlay2 .eventicon img[src*="bf_img2/4.png"]').forEach(function (img) {
        const title = (img.getAttribute('title') || '') + (img.getAttribute('alt') || '');
        if (title && title.indexOf('换入') < 0) return;
        const playEl = img.closest && img.closest('.play');
        const inId = playEl && playerId(playEl);
        const outId = inId && inToOut[inId];
        const meta = outId && index[outId];
        let label = img.nextElementSibling;
        if (!(label && label.classList && label.classList.contains('tm-lv-subout'))) label = null;
        if (!meta || (!meta.num && !meta.name)) {
          if (label) label.remove();
          return;
        }
        const html =
          (meta.num ? '<span class="tm-lv-subout-num">' + escHtml(meta.num) + '</span>' : '') +
          '<span class="tm-lv-subout-name">' +
          escHtml(meta.name || '') +
          '</span>';
        if (!label) {
          label = document.createElement('span');
          label.className = 'tm-lv-subout';
          img.insertAdjacentElement('afterend', label);
        }
        if (label.getAttribute('data-out') !== outId || !label.querySelector('.tm-lv-subout-name')) {
          label.innerHTML = html;
          label.setAttribute('data-out', outId);
          label.title = '换下 ' + (meta.num ? meta.num + ' ' : '') + (meta.name || '');
        }
      });
    } finally {
      refreshing = prevRefreshing;
    }
  }

  function formatPlayerMetric(playEl, modeKey, unit) {
    const money = formatMoney(parseValueWan(playEl), unit);
    if (modeKey === 'age') {
      return formatAgeText(playEl);
    }
    if (modeKey === 'height') {
      const h = parseHeightCm(playEl);
      return Number.isFinite(h) ? Math.round(h) + 'cm' : '-';
    }
    if (modeKey === 'club') {
      const id = playerId(playEl);
      if (!id) return '-';
      const hit = clubState[id];
      if (!hit || hit.pending) return '…';
      return hit.name || '-';
    }
    if (valueWithAge) {
      return money + '/' + formatAgeText(playEl);
    }
    return money;
  }

  function normalizeTeamName(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .replace(/\./g, '')
      .trim()
      .toLowerCase();
  }

  function isContinentAddr(addr) {
    return /^(欧洲|亚洲|非洲|北美洲|南美洲|大洋洲|中北美洲|中美洲)$/.test(
      String(addr || '').trim()
    );
  }

  function sideTeamId(selectors) {
    for (let i = 0; i < selectors.length; i++) {
      const a = document.querySelector(selectors[i]);
      if (!a) continue;
      const m = (a.getAttribute('href') || '').match(/\/Summary\/(\d+)\.html/i);
      if (m) return m[1];
    }
    return '';
  }

  function matchTeamIds() {
    return {
      home: sideTeamId([
        '.homeN a[href*="Summary/"]',
        '.home a[href*="Summary/"]',
        '#content .title .homeN a[href*="Summary/"]',
      ]),
      away: sideTeamId([
        '.guestN a[href*="Summary/"]',
        '.guest a[href*="Summary/"]',
        '#content .title .guestN a[href*="Summary/"]',
      ]),
    };
  }

  /** info 站球员 js 不带当前小时版本号会 404。 */
  function dataJsVersion(hourOffset) {
    const d = new Date(Date.now() + (hourOffset || 0) * 3600000);
    const p = function (n) {
      return (n < 10 ? '0' : '') + n;
    };
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours());
  }

  function playerJsUrl(playerId, hourOffset) {
    return (
      'https://info.titan007.com/jsData/playerInfo/player' +
      playerId +
      '.js?version=' +
      dataJsVersion(hourOffset)
    );
  }

  /** 在空白 iframe 里执行跨域 js，避免污染详情页全局变量。 */
  function loadJsInFrame(url, timeoutMs) {
    return new Promise(function (resolve) {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;';
      iframe.src = 'about:blank';
      document.documentElement.appendChild(iframe);
      let done = false;
      const timer = window.setTimeout(function () {
        finish(null);
      }, timeoutMs || 12000);
      function finish(val) {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        iframe.remove();
        resolve(val);
      }
      function start() {
        try {
          const doc = iframe.contentDocument;
          const script = doc.createElement('script');
          script.src = url;
          script.onload = function () {
            let snap = null;
            try {
              const w = iframe.contentWindow;
              snap = {
                teamDetail: (w && w.teamDetail) || null,
                nowTeamInfo: (w && w.nowTeamInfo) || null,
                transferInfo: (w && w.transferInfo) || null,
              };
            } catch (e) {}
            finish(snap);
          };
          script.onerror = function () {
            finish(null);
          };
          (doc.head || doc.documentElement).appendChild(script);
        } catch (e) {
          finish(null);
        }
      }
      start();
    });
  }

  function currentScheduleId() {
    if (typeof pageWin.scheduleID !== 'undefined' && pageWin.scheduleID) return String(pageWin.scheduleID);
    const m = location.pathname.match(/(\d{5,})/);
    return m ? m[1] : '';
  }

  function readForcedNationalIds() {
    try {
      const arr = JSON.parse(localStorage.getItem(FORCE_NATIONAL_KEY) || '[]');
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch (e) {
      return [];
    }
  }

  function isRememberedNational() {
    const id = currentScheduleId();
    return !!(id && readForcedNationalIds().indexOf(id) >= 0);
  }

  function rememberForceNational() {
    const id = currentScheduleId();
    if (!id) return;
    const arr = readForcedNationalIds().filter(function (x) {
      return x !== id;
    });
    arr.push(id);
    while (arr.length > 40) arr.shift();
    try {
      localStorage.setItem(FORCE_NATIONAL_KEY, JSON.stringify(arr));
    } catch (e) {}
  }

  function forceNationalMatch() {
    if (nationalForced && nationalMatch === true) return;
    nationalForced = true;
    nationalMatch = true;
    rememberForceNational();
    updatePanelModeChip();
    lastMetricSig = '';
    renderStarterMetrics();
  }

  function detectNationalMatch() {
    if (nationalForced) return Promise.resolve(true);
    if (nationalMatch !== null) return Promise.resolve(nationalMatch);
    if (nationalPromise) return nationalPromise;
    const ids = matchTeamIds();
    if (!ids.home || !ids.away) return Promise.resolve(false);
    nationalPromise = Promise.all([
      loadJsInFrame('https://info.titan007.com/jsData/teamInfo/teamDetail/tdl' + ids.home + '.js'),
      loadJsInFrame('https://info.titan007.com/jsData/teamInfo/teamDetail/tdl' + ids.away + '.js'),
    ])
      .then(function (wins) {
        if (nationalForced) return true;
        const flags = wins.map(function (w) {
          const td = w && w.teamDetail;
          return !!(td && isContinentAddr(td[15]));
        });
        if (wins.some(function (w) { return !w; })) {
          nationalPromise = null;
          return false;
        }
        nationalMatch = flags[0] && flags[1];
        return nationalMatch;
      })
      .catch(function () {
        nationalPromise = null;
        return false;
      });
    return nationalPromise;
  }

  function sideExcludeName(playEl) {
    const names = teamNames();
    if (playEl.closest && playEl.closest('.guest')) return names.away;
    if (playEl.closest && playEl.closest('.home')) return names.home;
    return '';
  }

  function pickClubName(nowTeamInfo, transferInfo, excludeTeamName) {
    const ex = normalizeTeamName(excludeTeamName);
    if (nowTeamInfo && nowTeamInfo.length) {
      for (let i = 0; i < nowTeamInfo.length; i++) {
        const name = String((nowTeamInfo[i] && nowTeamInfo[i][0]) || '').trim();
        if (!name || normalizeTeamName(name) === ex) continue;
        return name;
      }
    }
    if (transferInfo && transferInfo.length) {
      for (let i = transferInfo.length - 1; i >= 0; i--) {
        const row = transferInfo[i];
        if (!row || row.length < 8) continue;
        const toName = String(row[7] || row[8] || '').trim();
        if (!toName || normalizeTeamName(toName) === ex) continue;
        return toName;
      }
    }
    return '';
  }

  function readClubCacheMap() {
    try {
      const raw = localStorage.getItem(CLUB_CACHE_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function readCachedClubName(playerId) {
    const hit = readClubCacheMap()[playerId];
    if (!hit || Date.now() - hit.ts >= CLUB_CACHE_TTL_MS) return undefined;
    if (!hit.club || !hit.club.name) return undefined;
    return String(hit.club.name);
  }

  function writeCachedClubName(playerId, name) {
    try {
      const cache = readClubCacheMap();
      cache[playerId] = {
        club: name ? { name: name, href: null } : null,
        ts: Date.now(),
      };
      localStorage.setItem(CLUB_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {}
  }

  function playerPageUrl(playEl, id) {
    const link = playEl.querySelector('a[href*="/player/"]');
    if (link) {
      let href = link.getAttribute('href') || '';
      if (href.indexOf('//') === 0) return 'https:' + href;
      if (href.indexOf('http') === 0) return href;
      if (href.charAt(0) === '/') return 'https://info.titan007.com' + href;
    }
    const ids = matchTeamIds();
    const teamId = playEl.closest && playEl.closest('.guest') ? ids.away : ids.home;
    if (!teamId || !id) return '';
    return 'https://info.titan007.com/cn/team/player/' + teamId + '/' + id + '.html';
  }

  function lineupClubTasks(box) {
    const tasks = [];
    const seen = {};
    if (!box) return tasks;
    box.querySelectorAll('.play').forEach(function (playEl) {
      const id = playerId(playEl);
      if (!id || seen[id] || clubState[id]) return;
      seen[id] = true;
      tasks.push({
        id: id,
        exclude: sideExcludeName(playEl),
        starter: !!(playEl.closest && playEl.closest('.plays')),
        away: !!(playEl.closest && playEl.closest('.guest')),
        pageUrl: playerPageUrl(playEl, id),
      });
    });
    return tasks;
  }

  function applyCachedClubs(tasks) {
    const pending = [];
    tasks.forEach(function (task) {
      const cached = readCachedClubName(task.id);
      if (cached === undefined) {
        clubState[task.id] = { pending: true, name: '' };
        pending.push(task);
        return;
      }
      clubState[task.id] = { pending: false, name: cached };
    });
    return pending;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function paintClubsIfNeeded() {
    if (currentMetricMode().key !== 'club') return;
    lastMetricSig = '';
    renderStarterMetrics();
  }

  function storeClubName(task, name) {
    if (!name) return false;
    clubState[task.id] = { pending: false, name: name };
    writeCachedClubName(task.id, name);
    paintClubsIfNeeded();
    return true;
  }

  function readClubFromWin(task, w) {
    const name = w ? pickClubName(w.nowTeamInfo, w.transferInfo, task.exclude) : '';
    return storeClubName(task, name);
  }

  /** 球员 js 在对应资料页被访问前会 404。no-cors 把页面请求发出去即可，读不到正文。 */
  function warmPlayerPage(url) {
    if (!url) return Promise.resolve();
    return new Promise(function (resolve) {
      const timer = window.setTimeout(resolve, 8000);
      fetch(url, { mode: 'no-cors', credentials: 'include' }).then(
        function () {
          window.clearTimeout(timer);
          resolve();
        },
        function () {
          window.clearTimeout(timer);
          resolve();
        }
      );
    });
  }

  function fetchClubOnce(task) {
    return loadJsInFrame(playerJsUrl(task.id, 0), 8000).then(function (w) {
      if (readClubFromWin(task, w)) return true;
      if (task.warmed) return false;
      task.warmed = true;
      return warmPlayerPage(task.pageUrl).then(function () {
        return loadJsInFrame(playerJsUrl(task.id, 0), 8000);
      }).then(function (w2) {
        return readClubFromWin(task, w2);
      });
    }, function () {
      return false;
    });
  }

  function clubsStillMissing(tasks) {
    return tasks.filter(function (task) {
      const hit = clubState[task.id];
      return !hit || !hit.name;
    });
  }

  /** 固定数量同时请求。谁先返回谁先显示，失败的先留着，交给后面补请求。 */
  function fetchPool(tasks, size, gapMs) {
    if (!tasks.length) return Promise.resolve(0);
    let index = 0;
    let filled = 0;
    function next() {
      if (index >= tasks.length) return Promise.resolve();
      const task = tasks[index];
      index += 1;
      const wait = index > size ? sleep(gapMs || 0) : Promise.resolve();
      return wait.then(function () {
        return fetchClubOnce(task);
      }).then(function (ok) {
        if (ok) filled += 1;
        return next();
      }, function () {
        return next();
      });
    }
    const workers = [];
    const n = Math.min(size, tasks.length);
    for (let i = 0; i < n; i++) workers.push(next());
    return Promise.all(workers).then(function () {
      return filled;
    });
  }

  function giveUpClubs(tasks) {
    tasks.forEach(function (task) {
      if (clubState[task.id] && clubState[task.id].name) return;
      clubState[task.id] = { pending: false, name: '' };
    });
    paintClubsIfNeeded();
  }

  /** 被限流的球员隔开再要。连续一轮一个都没补上就停，避免越请求越被拦。 */
  function refillClubs(tasks, round) {
    const left = clubsStillMissing(tasks);
    if (!left.length) return Promise.resolve();
    if (round >= 3) {
      giveUpClubs(left);
      return Promise.resolve();
    }
    return sleep(round ? 1500 : 800).then(function () {
      return fetchPool(left, 1, 450);
    }).then(function (filled) {
      if (!filled && round >= 1) {
        giveUpClubs(clubsStillMissing(tasks));
        return;
      }
      return refillClubs(tasks, round + 1);
    });
  }

  function zipSides(list) {
    const home = [];
    const away = [];
    list.forEach(function (task) {
      if (task.away) away.push(task);
      else home.push(task);
    });
    const out = [];
    const n = Math.max(home.length, away.length);
    for (let i = 0; i < n; i++) {
      if (home[i]) out.push(home[i]);
      if (away[i]) out.push(away[i]);
    }
    return out;
  }

  function fetchClubBatches(tasks) {
    const starters = [];
    const rest = [];
    tasks.forEach(function (task) {
      if (task.starter) starters.push(task);
      else rest.push(task);
    });
    const ordered = zipSides(starters).concat(zipSides(rest));
    return fetchPool(ordered, 1, 160).then(function () {
      return refillClubs(ordered, 0);
    });
  }

  function ensureClubs() {
    const box = document.getElementById('matchBox2');
    const tasks = lineupClubTasks(box);
    const pending = applyCachedClubs(tasks);
    if (currentMetricMode().key === 'club') {
      lastMetricSig = '';
      renderStarterMetrics();
    }
    if (!pending.length) return clubQueue;
    clubQueue = clubQueue
      .then(function () {
        return fetchClubBatches(pending);
      })
      .catch(function () {});
    return clubQueue;
  }

  function refreshNationalClubMode() {
    detectNationalMatch().then(function (isNational) {
      updatePanelModeChip();
      if (!isNational) return;
      if (metricModeKey === 'club') ensureClubs();
    });
  }

  function playerId(playEl) {
    const onmouseover = playEl.getAttribute('onmouseover') || '';
    let m = onmouseover.match(/setImgUrl\((\d+)\)/);
    if (m) return m[1];

    const link = playEl.querySelector('a[href*="/player/"]');
    if (link) {
      m = (link.getAttribute('href') || '').match(/\/player\/\d+\/(\d+)\.html/i);
      if (m) return m[1];
    }

    const tech = playEl.querySelector('[id^="playerTech_"]');
    if (tech) {
      m = tech.id.match(/playerTech_(\d+)/);
      if (m) return m[1];
    }

    const img = playEl.querySelector('[id^="playerImg_"]');
    if (img) {
      m = img.id.match(/playerImg_(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  function hasSubIn(playEl) {
    return !!playEl.querySelector('img[src*="bf_img2/4.png"]');
  }

  function collectPlayers(root) {
    if (!root) return [];
    const out = [];
    root.querySelectorAll('.play').forEach(function (playEl) {
      const val = parseValueWan(playEl);
      const id = playerId(playEl);
      if (!Number.isFinite(val) || !id) return;
      out.push({ id: id, val: val, subIn: hasSubIn(playEl) });
    });
    return out;
  }

  function dedupePlayers(list) {
    const map = new Map();
    list.forEach(function (p) {
      map.set(p.id, p);
    });
    return Array.from(map.values());
  }

  function sumValues(list) {
    return list.reduce(function (s, p) {
      return s + p.val;
    }, 0);
  }

  /** 首发平均年龄：按比赛日计整岁，无生日的不计。 */
  function starterAgeStat(root) {
    const asOf = matchAsOfDate();
    let sum = 0;
    let n = 0;
    if (root) {
      root.querySelectorAll('.play').forEach(function (playEl) {
        const age = calcAge(parseBirthday(playEl), asOf);
        if (!Number.isFinite(age)) return;
        sum += age;
        n += 1;
      });
    }
    return { avg: n ? sum / n : null, n: n };
  }

  function formatAvgAge(stat) {
    if (!stat || !Number.isFinite(stat.avg)) return '-';
    return stat.avg.toFixed(1);
  }

  function detectUnit(box) {
    const sample = box.querySelector('.play');
    if (sample) {
      const unit = parseValueUnit(sample);
      if (unit) return unit;
    }
    return '万英镑';
  }

  function parseFormationStr(isHome) {
    const box = document.getElementById('matchBox2');
    const scope = box
      ? box.closest('#matchData, #content, .content') || document
      : document;
    const el = scope.querySelector(isHome ? '.homeN' : '.guestN');
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.coach').forEach(function (c) {
      c.remove();
    });
    const m = (clone.textContent || '').replace(/\s+/g, ' ').match(/(\d(?:-\d){1,5})/);
    return m ? m[1] : '';
  }

  /** 源站主教练链接无 target，点击会离开当前 detail 页。改为新开页面。 */
  function coachPageUrl(a) {
    const href = (a.getAttribute('href') || '').trim();
    if (!href || href === '#' || /^javascript:/i.test(href)) return '';
    try {
      return new URL(href, location.href).href;
    } catch (e) {
      return '';
    }
  }

  function stampCoachNewPage(root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('a.coach[href]').forEach(function (a) {
      if (!coachPageUrl(a)) return;
      if (a.getAttribute('target') !== '_blank') a.setAttribute('target', '_blank');
      const rel = a.getAttribute('rel') || '';
      if (!/\bnoopener\b/.test(rel)) {
        a.setAttribute('rel', (rel + ' noopener noreferrer').trim());
      }
    });
  }

  function bindCoachNewPage() {
    if (coachNewPageBound) return;
    coachNewPageBound = true;
    document.addEventListener(
      'click',
      function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target && e.target.closest && e.target.closest('a.coach');
        if (!a) return;
        const url = coachPageUrl(a);
        if (!url) return;
        e.preventDefault();
        e.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
      },
      true
    );
  }

  const QUICK_PANEL_ID = 'tm-team-quick-panel';

  function firstSideCoachUrl(selectors) {
    for (let i = 0; i < selectors.length; i++) {
      const url = coachPageUrl(document.querySelector(selectors[i]));
      if (url && /\/team\/coach\//i.test(url)) return url;
    }
    return '';
  }

  function openBothCoachPages() {
    const awayUrl = firstSideCoachUrl([
      '.guestN a.coach',
      '.guest a.coach',
      '#content .title .guestN a.coach',
    ]);
    const homeUrl = firstSideCoachUrl([
      '.homeN a.coach',
      '.home a.coach',
      '#content .title .homeN a.coach',
    ]);
    const urls = [];
    if (awayUrl) urls.push(awayUrl);
    if (homeUrl && homeUrl !== awayUrl) urls.push(homeUrl);
    if (urls.length < 2) {
      alert('未能识别两队主教练链接，无法打开主教练页面。');
      return;
    }
    urls.forEach(function (url) {
      window.open(url, '_blank');
    });
  }

  function quickButtonLabel(btn) {
    const label = btn.querySelector('.label');
    return label ? (label.textContent || '').replace(/\s+/g, '') : '';
  }

  /** 右侧快捷栏来自另一支旧脚本时，把主教练插到球员身价上面，并重排 F1–F5。 */
  function installQuickCoachButton() {
    const panel = document.getElementById(QUICK_PANEL_ID);
    if (!panel) return false;
    if (panel.getAttribute('data-tm-lv-coach') === '1') return true;

    const buttons = panel.querySelectorAll('.tm-btn');
    if (!buttons.length) return false;

    let hasCoach = false;
    let valueBtn = null;
    for (let i = 0; i < buttons.length; i++) {
      const label = quickButtonLabel(buttons[i]);
      if (label === '主教练') hasCoach = true;
      if (label === '球员身价') valueBtn = buttons[i];
    }
    if (hasCoach) {
      panel.setAttribute('data-tm-lv-coach', '1');
      return true;
    }
    if (!valueBtn) return false;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tm-btn';
    btn.title = '先打开客队、再打开主队主教练 (F2)';
    btn.innerHTML = '<span class="hotkey">F2</span><span class="label">主教练</span>';
    btn.addEventListener('click', openBothCoachPages);
    valueBtn.parentNode.insertBefore(btn, valueBtn);

    const order = ['历史排名', '主教练', '球员身价', '球员数据', '联赛排名'];
    const byLabel = {};
    panel.querySelectorAll('.tm-btn').forEach(function (b) {
      byLabel[quickButtonLabel(b)] = b;
    });
    order.forEach(function (label, i) {
      const b = byLabel[label];
      if (!b) return;
      const key = 'F' + (i + 1);
      const hotkey = b.querySelector('.hotkey');
      if (hotkey) hotkey.textContent = key;
      const title = b.getAttribute('title') || '';
      if (/\(F\d\)/.test(title)) b.title = title.replace(/\(F\d\)/, '(' + key + ')');
      panel.appendChild(b);
    });

    panel.setAttribute('data-tm-lv-coach', '1');
    quickCoachOwned = true;
    return true;
  }

  function bindQuickCoachHotkey() {
    document.addEventListener(
      'keydown',
      function (e) {
        if (!quickCoachOwned) return;
        if (!/^F[1-5]$/.test(e.key)) return;
        if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        const el = e.target;
        const tag = el && el.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (el && el.isContentEditable)
        ) {
          return;
        }
        const panel = document.getElementById(QUICK_PANEL_ID);
        if (!panel) return;
        const buttons = panel.querySelectorAll('.tm-btn');
        let target = null;
        for (let i = 0; i < buttons.length; i++) {
          const hotkey = buttons[i].querySelector('.hotkey');
          if (hotkey && (hotkey.textContent || '').trim() === e.key) {
            target = buttons[i];
            break;
          }
        }
        if (!target) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        target.click();
      },
      true
    );
  }

  function watchQuickCoachButton() {
    bindQuickCoachHotkey();
    let tries = 0;
    const timer = window.setInterval(function () {
      tries += 1;
      if (installQuickCoachButton() || tries >= 40) window.clearInterval(timer);
    }, 300);
  }

  function sidePlayBoxes(sideRoot) {
    if (!sideRoot) return [];
    const out = [];
    for (let i = 0; i < sideRoot.children.length; i++) {
      const el = sideRoot.children[i];
      if (
        el.classList &&
        el.classList.contains('playBox') &&
        el.querySelector('.play')
      ) {
        out.push(el);
      }
    }
    return out;
  }

  function sameSizeList(a, b) {
    return (
      a.length === b.length &&
      a.every(function (v, i) {
        return v === b[i];
      })
    );
  }

  function shouldReverseLineBoxes(boxes, isHome, formationStr) {
    const sizes = boxes.map(function (b) {
      return b.querySelectorAll('.play').length;
    });
    const parts = String(formationStr || '')
      .split('-')
      .map(function (n) {
        return parseInt(n, 10);
      })
      .filter(function (n) {
        return n > 0;
      });
    if (parts.length && sizes.length === parts.length + 1) {
      const fromBack = [1].concat(parts);
      const fromFront = fromBack.slice().reverse();
      if (sameSizeList(sizes, fromFront) && !sameSizeList(sizes, fromBack)) {
        return true;
      }
      if (sameSizeList(sizes, fromBack)) return false;
    }
    return !isHome;
  }

  /** 主队 playBox 从左到右：门将 → 后卫 → [中场…] → 前锋；客队相反。多列中场合并为一条中场线。 */
  function groupLineBoxes(sideRoot, isHome, formationStr) {
    const boxes = sidePlayBoxes(sideRoot);
    const ordered = shouldReverseLineBoxes(boxes, isHome, formationStr)
      ? boxes.slice().reverse()
      : boxes.slice();
    const g = { gk: [], def: [], mid: [], fw: [] };
    if (!ordered.length) return g;
    g.gk = [ordered[0]];
    if (ordered.length === 1) return g;
    g.fw = [ordered[ordered.length - 1]];
    if (ordered.length === 2) return g;
    if (ordered.length === 3) {
      g.def = [ordered[1]];
      return g;
    }
    g.def = [ordered[1]];
    g.mid = ordered.slice(2, -1);
    return g;
  }

  function packLineBoxes(boxes) {
    const players = [];
    let n = 0;
    (boxes || []).forEach(function (b) {
      n += b.querySelectorAll('.play').length;
      players.push.apply(players, collectPlayers(b));
    });
    return { val: sumValues(dedupePlayers(players)), n: n };
  }

  function summarizeLines(sideRoot, isHome) {
    const formation = parseFormationStr(isHome);
    const grouped = groupLineBoxes(sideRoot, isHome, formation);
    return {
      formation: formation,
      gk: packLineBoxes(grouped.gk),
      def: packLineBoxes(grouped.def),
      mid: packLineBoxes(grouped.mid),
      fw: packLineBoxes(grouped.fw),
    };
  }

  /** 柱顶数值：只显示数量级（亿/万），不重复货币名；货币见标题栏「单位」 */
  function formatMoney(n, unit) {
    if (!Number.isFinite(n)) return '-';
    const scale = (unit || '万英镑').replace(/英镑|英磅|欧元|美元|美金/g, '') || '万';

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

  /** 柱顶数字：「亿」单独缩小，其余场合仍用纯文本 */
  function moneyLabelHtml(n, unit) {
    const text = formatMoney(n, unit);
    const m = /^(.+?)(亿)$/.exec(text);
    if (!m) return escHtml(text);
    return escHtml(m[1]) + '<span class="tm-lv-unit">亿</span>';
  }

  /** 标题栏单位：显示货币（如英镑），而非单独的「万」 */
  function formatUnitLabel(unit) {
    const u = unit || '万英镑';
    if (/英镑|英磅/.test(u)) return '英镑';
    if (/欧元/.test(u)) return '欧元';
    if (/美元|美金/.test(u)) return '美元';
    return u;
  }

  function formatDiff(home, away, unit) {
    if (!Number.isFinite(home) || !Number.isFinite(away)) return '-';
    const d = home - away;
    if (Math.abs(d) < 0.05) return '持平';
    const sign = d > 0 ? '+' : '-';
    return sign + formatMoney(Math.abs(d), unit);
  }

  /** 身价倍数：较高一方相对较低一方，如「主 1.8倍」「客 3.2倍」 */
  function formatRatio(home, away) {
    if (!Number.isFinite(home) || !Number.isFinite(away)) {
      return { text: '-', side: '' };
    }
    if (home <= 0 && away <= 0) return { text: '-', side: '' };
    if (home <= 0) return { text: '客 ∞', side: 'a' };
    if (away <= 0) return { text: '主 ∞', side: 'h' };

    const lo = Math.min(home, away);
    const hi = Math.max(home, away);
    const r = hi / lo;
    if (r < 1.02) return { text: '持平', side: '' };

    const num =
      r >= 100
        ? r.toFixed(0)
        : r >= 10
          ? r.toFixed(1).replace(/\.0$/, '')
          : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    if (home >= away) return { text: '主 ' + num + '倍', side: 'h' };
    return { text: '客 ' + num + '倍', side: 'a' };
  }

  function teamNames() {
    const box = document.getElementById('matchBox2');
    const scope = box ? box.closest('#matchData, #content, .content') || document : document;
    const homeEl = scope.querySelector(
      '.homeN a[href*="team/Summary"], .homeN a[href*="team/summary"]'
    );
    const awayEl = scope.querySelector(
      '.guestN a[href*="team/Summary"], .guestN a[href*="team/summary"]'
    );
    return {
      home:
        (homeEl && homeEl.textContent.trim()) ||
        (typeof pageWin.homeTeamName === 'string' && pageWin.homeTeamName) ||
        '主队',
      away:
        (awayEl && awayEl.textContent.trim()) ||
        (typeof pageWin.guestTeamName === 'string' && pageWin.guestTeamName) ||
        '客队',
    };
  }

  function computeStats() {
    const box = document.getElementById('matchBox2');
    if (!box) return null;

    const homeStarters = collectPlayers(box.querySelector('.plays .home'));
    const awayStarters = collectPlayers(box.querySelector('.plays .guest'));
    const homeBench = collectPlayers(box.querySelector('.backupPlay2 .home'));
    const awayBench = collectPlayers(box.querySelector('.backupPlay2 .guest'));
    const homeInjured = collectPlayers(box.querySelector('.hurtPlay .home'));
    const awayInjured = collectPlayers(box.querySelector('.hurtPlay .guest'));

    if (!homeStarters.length && !awayStarters.length) return null;

    const homeTotal = dedupePlayers(homeStarters.concat(homeBench, homeInjured));
    const awayTotal = dedupePlayers(awayStarters.concat(awayBench, awayInjured));
    const homeOnField = dedupePlayers(
      homeStarters.concat(homeBench.filter(function (p) {
        return p.subIn;
      }))
    );
    const awayOnField = dedupePlayers(
      awayStarters.concat(awayBench.filter(function (p) {
        return p.subIn;
      }))
    );

    return {
      unit: detectUnit(box),
      home: {
        total: sumValues(homeTotal),
        starter: sumValues(homeStarters),
        onField: sumValues(homeOnField),
        lines: summarizeLines(box.querySelector('.plays .home'), true),
        counts: {
          total: homeTotal.length,
          starter: homeStarters.length,
          onField: homeOnField.length,
        },
        age: starterAgeStat(box.querySelector('.plays .home')),
      },
      away: {
        total: sumValues(awayTotal),
        starter: sumValues(awayStarters),
        onField: sumValues(awayOnField),
        lines: summarizeLines(box.querySelector('.plays .guest'), false),
        counts: {
          total: awayTotal.length,
          starter: awayStarters.length,
          onField: awayOnField.length,
        },
        age: starterAgeStat(box.querySelector('.plays .guest')),
      },
    };
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  const CHART_BAR_MAX_PX = 96;
  const CHART_BAR_WIDTH_PX = 20;
  const CHART_BAR_GAP_PX = 4;
  const CHART_GROUP_GAP_PX = 8;
  const CHART_LABEL_TOP_PX = 16;

  function barHeightPx(value, max) {
    if (!Number.isFinite(value) || max <= 0) return 0;
    return Math.max(3, Math.round((value / max) * CHART_BAR_MAX_PX));
  }

  function barItemHtml(val, unit, px, kind, title) {
    const money = formatMoney(val, unit);
    const label = moneyLabelHtml(val, unit);
    const tip = title ? title + ' ' + money : money;
    return (
      '<div class="tm-lv-item">' +
      '<span class="tm-lv-vval-sizer" aria-hidden="true">' +
      label +
      '</span>' +
      '<div class="tm-lv-slot">' +
      '<span class="tm-lv-vval tm-lv-vval-' +
      kind +
      '" style="--bh:' +
      px +
      'px" title="' +
      escHtml(tip) +
      '">' +
      label +
      '</span>' +
      '<div class="tm-lv-vbar tm-lv-vbar-' +
      kind +
      '" style="height:' +
      px +
      'px" title="' +
      escHtml(tip) +
      '"></div></div></div>'
    );
  }

  function panelBodyHtml(stats) {
    const names = teamNames();
    const unit = stats.unit;
    const groups = [
      { label: '首发', key: 'starter', sub: '主首发 · 客首发' },
      { label: '上场', key: 'onField', sub: '首发+换入' },
      { label: '总身价', key: 'total', sub: '名单合计' },
    ];

    let globalMax = 0;
    groups.forEach(function (g) {
      globalMax = Math.max(globalMax, stats.home[g.key], stats.away[g.key]);
    });
    if (globalMax <= 0) globalMax = 1;

    const clusters = groups
      .map(function (g) {
        const h = stats.home[g.key];
        const a = stats.away[g.key];
        const hPx = barHeightPx(h, globalMax);
        const aPx = barHeightPx(a, globalMax);
        const ratio = formatRatio(h, a);
        const ratioClass =
          ratio.side === 'h'
            ? ' tm-lv-ratio-h'
            : ratio.side === 'a'
              ? ' tm-lv-ratio-a'
              : '';
        return (
          '<div class="tm-lv-cluster">' +
          '<div class="tm-lv-bars">' +
          barItemHtml(h, unit, hPx, 'h', names.home) +
          barItemHtml(a, unit, aPx, 'a', names.away) +
          '</div>' +
          '<div class="tm-lv-xlabel">' +
          escHtml(g.label) +
          '<span class="tm-lv-xsub">' +
          escHtml(g.sub) +
          '</span>' +
          '<span class="tm-lv-ratio' +
          ratioClass +
          '" title="身价倍数（较高方 / 较低方）">' +
          escHtml(ratio.text) +
          '</span></div></div>'
        );
      })
      .join('');

    return (
      '<div class="tm-lv-chart">' +
      '<div class="tm-lv-legend">' +
      '<span class="tm-lv-leg tm-lv-leg-home"><i></i>' +
      escHtml(names.home) +
      '（主）</span>' +
      '<span class="tm-lv-leg tm-lv-leg-away"><i></i>' +
      escHtml(names.away) +
      '（客）</span></div>' +
      ageLineHtml(stats, names) +
      '<div class="tm-lv-clusters">' +
      clusters +
      '</div></div>' +
      linesBlockHtml(stats, names, unit)
    );
  }

  function linesBlockHtml(stats, names, unit) {
    const h = stats.home && stats.home.lines;
    const a = stats.away && stats.away.lines;
    if (!h || !a) return '';

    const LINE_SEGS = [
      { key: 'gk', label: '门将', cls: 'gk' },
      { key: 'def', label: '后卫', cls: 'def' },
      { key: 'mid', label: '中场', cls: 'mid' },
      { key: 'fw', label: '前锋', cls: 'fw' },
    ];

    function segsOf(lines) {
      return LINE_SEGS.map(function (s) {
        const cell = lines[s.key] || { val: 0, n: 0 };
        return {
          key: s.key,
          label: s.label,
          cls: s.cls,
          val: cell.val || 0,
          n: cell.n || 0,
        };
      }).filter(function (s) {
        return s.n > 0 || s.val > 0;
      });
    }

    function sumSegs(segs) {
      return segs.reduce(function (t, s) {
        return t + s.val;
      }, 0);
    }

    const homeSegs = segsOf(h);
    const awaySegs = segsOf(a);
    if (!homeSegs.length && !awaySegs.length) return '';

    const homeTotal = sumSegs(homeSegs);
    const awayTotal = sumSegs(awaySegs);
    const maxTotal = Math.max(homeTotal, awayTotal, 1);

    const LINE_COLORS = {
      gk: '#fbbf24',
      def: '#34d399',
      mid: '#60a5fa',
      fw: '#fb7185',
    };

    function stackRowHtml(segs, total, kind, teamName) {
      const vbW = 1000;
      const vbH = 18;
      const barW = total > 0 ? Math.round((total / maxTotal) * vbW) : 0;
      let x = 0;
      const titles = [];
      const rects = segs
        .map(function (s) {
          if (!(s.val > 0) || !total) return '';
          let w = Math.round((s.val / total) * barW);
          if (w < 1) w = 1;
          if (x + w > barW) w = Math.max(0, barW - x);
          const left = x;
          x += w;
          const pct = (s.val / total) * 100;
          const title =
            (teamName || '') +
            ' ' +
            s.label +
            ' ' +
            formatMoney(s.val, unit) +
            '（' +
            s.n +
            '人，' +
            (pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)) +
            '%）';
          titles.push(s.label + ' ' + formatMoney(s.val, unit));
          return (
            '<rect x="' +
            left +
            '" y="0" width="' +
            w +
            '" height="' +
            vbH +
            '" fill="' +
            LINE_COLORS[s.cls] +
            '"><title>' +
            escHtml(title) +
            '</title></rect>'
          );
        })
        .join('');
      return (
        '<div class="tm-lv-stack-row">' +
        '<div class="tm-lv-stack-side tm-lv-stack-side-' +
        kind +
        '">' +
        (kind === 'h' ? '主' : '客') +
        '</div>' +
        '<div class="tm-lv-stack-track" title="' +
        escHtml((teamName || '') + ' ' + titles.join(' · ')) +
        '">' +
        '<svg class="tm-lv-stack-svg" viewBox="0 0 ' +
        vbW +
        ' ' +
        vbH +
        '" width="100%" height="' +
        vbH +
        '" preserveAspectRatio="none" style="display:block;width:100%;height:' +
        vbH +
        'px">' +
        '<rect x="0" y="0" width="' +
        vbW +
        '" height="' +
        vbH +
        '" fill="#eef2f7"></rect>' +
        rects +
        '</svg></div>' +
        '<div class="tm-lv-stack-total tm-lv-stack-total-' +
        kind +
        '">' +
        escHtml(formatMoney(total, unit)) +
        '</div></div>'
      );
    }

    const formH = h.formation || '';
    const formA = a.formation || '';
    const formText =
      formH && formA && formH !== formA
        ? formH + ' / ' + formA
        : formH || formA || '';

    const legend = LINE_SEGS.map(function (s) {
      return (
        '<span class="tm-lv-stack-leg"><b class="tm-lv-stack-' +
        s.cls +
        '"></b>' +
        escHtml(s.label) +
        '</span>'
      );
    }).join('');

    return (
      '<div class="tm-lv-lines">' +
      '<div class="tm-lv-lines-head"><span>各线身价</span>' +
      (formText
        ? '<span class="tm-lv-form">' + escHtml(formText) + '</span>'
        : '') +
      '</div>' +
      '<div class="tm-lv-stack-legend">' +
      legend +
      '</div>' +
      stackRowHtml(homeSegs, homeTotal, 'h', names.home) +
      stackRowHtml(awaySegs, awayTotal, 'a', names.away) +
      '</div>'
    );
  }

  function panelShellHtml(unit) {
    return (
      '<div class="tm-lv-head" role="button" tabindex="0" title="点击收起 (Esc)">' +
      '<span class="tm-lv-title">阵容身价对比</span>' +
      '<div class="tm-lv-head-actions">' +
      '<span class="tm-lv-mode" role="button" tabindex="0">身价</span>' +
      '<span class="tm-lv-force-nat" role="button" tabindex="0" title="' +
      escHtml(FORCE_NAT_TITLE) +
      '">国家队</span>' +
      '<span class="tm-lv-unit">单位：' +
      escHtml(formatUnitLabel(unit || '万英镑')) +
      '</span>' +
      '<span class="tm-lv-ver" title="阵容身价统计 ' +
      SCRIPT_VERSION +
      '">' +
      SCRIPT_VERSION +
      '</span>' +
      '<span class="tm-lv-toggle" aria-hidden="true">▾</span>' +
      '</div></div>' +
      '<div class="tm-lv-body"></div>'
    );
  }

  function setPanelCollapsed(panel, collapsed) {
    panelCollapsed = collapsed;
    panel.classList.toggle('tm-lv-collapsed', collapsed);
    const toggle = panel.querySelector('.tm-lv-toggle');
    if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
    const head = panel.querySelector('.tm-lv-head');
    if (head) head.title = collapsed ? '点击展开 (Esc)' : '点击收起 (Esc)';
    const title = panel.querySelector('.tm-lv-title');
    if (title) title.textContent = collapsed ? '身价' : '阵容身价对比';
  }

  function bindPanelToggle(panel) {
    if (panel.getAttribute('data-tm-toggle-bound')) return;
    panel.setAttribute('data-tm-toggle-bound', '1');

    const head = panel.querySelector('.tm-lv-head');
    if (!head) return;

    function toggle() {
      setPanelCollapsed(panel, !panel.classList.contains('tm-lv-collapsed'));
    }

    head.addEventListener('click', toggle);
    head.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  function toggleValuePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || panel.style.display === 'none') return false;
    setPanelCollapsed(panel, !panel.classList.contains('tm-lv-collapsed'));
    return true;
  }

  function bindValuePanelHotkey() {
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        if (e.repeat) return;
        const el = e.target;
        const tag = el && el.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (el && el.isContentEditable)
        ) {
          return;
        }
        if (!toggleValuePanel()) return;
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
  }

  function currentModeChipLabel() {
    const mode = currentMetricMode();
    if (mode.key === 'value' && valueWithAge) return '身价/年龄';
    return mode.label;
  }

  function metricClickTitle() {
    const mode = currentMetricMode();
    const next = nextMetricMode();
    let text;
    if (mode.key === 'club') {
      text = '当前俱乐部，点击切换' + next.label + '，右击切到身价/年龄，再右击回到俱乐部，双击回到身价';
    } else if (mode.key === 'value' && valueWithAge && clubRightBack) {
      text = '当前身价/年龄，右击回到俱乐部，点击切换' + next.label + '，双击回到身价';
    } else if (mode.key === 'value') {
      text = valueWithAge
        ? '当前身价/年龄，点击切换' + next.label + '，右击切回身价，双击回到身价'
        : '当前身价，点击切换' + next.label + '，右击显示身价/年龄，双击回到身价';
    } else {
      text =
        '当前' +
        mode.label +
        '，点击切换' +
        next.label +
        '，双击回到身价（' +
        modeCycleText() +
        '）';
    }
    if (nationalMatch !== true) text += '。Alt+点击标为本场国家队，再切到俱乐部才请求资料';
    return text;
  }

  function syncForceNatButton() {
    const show = nationalMatch !== true;
    document.querySelectorAll('.tm-lv-force-nat').forEach(function (btn) {
      btn.style.display = show ? 'inline-flex' : 'none';
      if (btn.getAttribute('data-tm-bound')) return;
      btn.setAttribute('data-tm-bound', '1');
      btn.title = FORCE_NAT_TITLE;
      const run = function (e) {
        e.preventDefault();
        e.stopPropagation();
        forceNationalMatch();
      };
      btn.addEventListener('click', run);
      btn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        run(e);
      });
    });
  }

  function updatePanelModeChip() {
    const chip = document.querySelector('#' + PANEL_ID + ' .tm-lv-mode');
    if (chip) {
      chip.textContent = currentModeChipLabel();
      chip.setAttribute('title', metricClickTitle());
    }
    syncForceNatButton();
    const modeKey = currentMetricMode().key;
    document.querySelectorAll('#' + PANEL_ID + ' .tm-lv-chip').forEach(function (el) {
      el.classList.toggle('tm-lv-chip-on', el.getAttribute('data-tm-mode') === modeKey);
    });
  }

  let metricClickTimer = null;
  let clubRightBack = false;
  let valueWithAgeBeforeClubFlip = false;
  const METRIC_CLICK_DELAY = 260;

  function clubModeAvailable() {
    return activeMetricModes().some(function (m) {
      return m.key === 'club';
    });
  }

  function cancelClubAgeFlip() {
    if (!clubRightBack) return;
    clubRightBack = false;
    valueWithAge = !!valueWithAgeBeforeClubFlip;
    saveValueWithAge();
  }

  function stopMetricClickTimer() {
    if (!metricClickTimer) return;
    window.clearTimeout(metricClickTimer);
    metricClickTimer = null;
  }

  function onMetricPointerClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (metricClickTimer) {
      stopMetricClickTimer();
      return;
    }
    metricClickTimer = window.setTimeout(function () {
      metricClickTimer = null;
      cycleMetricMode();
    }, METRIC_CLICK_DELAY);
  }

  function onMetricPointerDblClick(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    stopMetricClickTimer();
    clubRightBack = false;
    valueWithAge = false;
    saveValueWithAge();
    if (currentMetricMode().key === 'value') {
      lastMetricSig = '';
      renderStarterMetrics();
      return;
    }
    setMetricModeByKey('value');
  }

  function onMetricContextMenu(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    stopMetricClickTimer();
    const key = currentMetricMode().key;
    if (key === 'club' && clubModeAvailable()) {
      if (!clubRightBack) valueWithAgeBeforeClubFlip = valueWithAge;
      clubRightBack = true;
      valueWithAge = true;
      saveValueWithAge();
      setMetricModeByKey('value');
      return;
    }
    if (key === 'value' && valueWithAge && clubRightBack && clubModeAvailable()) {
      clubRightBack = false;
      valueWithAge = !!valueWithAgeBeforeClubFlip;
      saveValueWithAge();
      setMetricModeByKey('club');
      return;
    }
    clubRightBack = false;
    if (key !== 'value') return;
    valueWithAge = !valueWithAge;
    saveValueWithAge();
    lastMetricSig = '';
    renderStarterMetrics();
  }

  function bindPanelModeChip(panel) {
    const chip = panel.querySelector('.tm-lv-mode');
    if (!chip || chip.getAttribute('data-tm-bound')) return;
    chip.setAttribute('data-tm-bound', '1');
    chip.addEventListener('click', onMetricPointerClick);
    chip.addEventListener('dblclick', onMetricPointerDblClick);
    chip.addEventListener('contextmenu', onMetricContextMenu);
    chip.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        cycleMetricMode();
      }
    });
  }

  function bindMetricClick(box) {
    if (!box || box.getAttribute('data-tm-metric-bound')) return;
    box.setAttribute('data-tm-metric-bound', '1');
    box.addEventListener(
      'click',
      function (e) {
        const badge = e.target.closest && e.target.closest('.tm-lv-metric');
        if (!badge || !box.contains(badge)) return;
        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          forceNationalMatch();
          return;
        }
        onMetricPointerClick(e);
      },
      true
    );
    box.addEventListener(
      'dblclick',
      function (e) {
        const badge = e.target.closest && e.target.closest('.tm-lv-metric');
        if (!badge || !box.contains(badge)) return;
        onMetricPointerDblClick(e);
      },
      true
    );
    box.addEventListener(
      'contextmenu',
      function (e) {
        const badge = e.target.closest && e.target.closest('.tm-lv-metric');
        if (!badge || !box.contains(badge)) return;
        onMetricContextMenu(e);
      },
      true
    );
  }

  function clearStarterMetrics() {
    document.querySelectorAll('#matchBox2 .tm-lv-metric').forEach(function (el) {
      el.remove();
    });
    lastMetricSig = '';
  }

  function lineupMetricRoots(box) {
    if (!box) return [];
    return [
      box.querySelector('.plays'),
      box.querySelector('.backupPlay2'),
      box.querySelector('.hurtPlay'),
    ].filter(Boolean);
  }

  function ensureMetricBadge(playEl, inline) {
    const nameEl = playEl.querySelector('.name');
    if (!nameEl) return null;
    let badge = null;
    for (let i = 0; i < playEl.children.length; i++) {
      const c = playEl.children[i];
      if (c.classList && c.classList.contains('tm-lv-metric')) {
        badge = c;
        break;
      }
    }
    if (!badge && nameEl.nextElementSibling &&
        nameEl.nextElementSibling.classList &&
        nameEl.nextElementSibling.classList.contains('tm-lv-metric')) {
      badge = nameEl.nextElementSibling;
    }
    if (!badge) badge = playEl.querySelector('.tm-lv-metric');
    if (!badge) {
      badge = document.createElement('b');
      badge.className = 'tm-lv-metric';
      nameEl.insertAdjacentElement('afterend', badge);
    }
    badge.classList.toggle('tm-lv-metric-inline', !!inline);
    return badge;
  }

  function starterMetricSignature(box, modeKey, unit) {
    const parts = [modeKey, valueWithAge ? '1' : '0'];
    lineupMetricRoots(box).forEach(function (root) {
      root.querySelectorAll('.play').forEach(function (playEl) {
        parts.push(
          (playerId(playEl) || '') +
            ':' +
            formatPlayerMetric(playEl, modeKey, unit)
        );
      });
    });
    return parts.join('|');
  }

  function isScriptNode(n) {
    if (!n || !n.classList) return false;
    return (
      n.classList.contains('tm-lv-metric') ||
      n.classList.contains('tm-lv-hover-age') ||
      n.classList.contains('tm-lv-bday') ||
      n.classList.contains('tm-lv-subout') ||
      n.classList.contains('tm-lv-subout-num') ||
      n.classList.contains('tm-lv-subout-name') ||
      n.classList.contains('tm-lv-nat') ||
      n.classList.contains('tm-lv-goal') ||
      n.classList.contains('tm-lv-goal-sum') ||
      n.classList.contains('tm-lv-goal-btn') ||
      n.classList.contains('tm-lv-pitch-btn')
    );
  }

  function isMetricMutation(record) {
    const lists = [record.addedNodes, record.removedNodes];
    for (let i = 0; i < lists.length; i++) {
      const nodes = lists[i];
      if (!nodes) continue;
      for (let j = 0; j < nodes.length; j++) {
        const n = nodes[j];
        if (n && n.nodeType === 1 && !isScriptNode(n)) return false;
      }
    }
    const t = record.target;
    if (isScriptNode(t)) return true;
    if (
      t &&
      t.closest &&
      (t.closest('.tm-lv-metric') ||
        t.closest('.tm-lv-hover-age') ||
        t.closest('.tm-lv-subout') ||
        t.closest('.tm-lv-nat') ||
        t.closest('.tm-lv-goal') ||
        t.closest('.tm-lv-goal-sum'))
    ) {
      return true;
    }
    for (let i = 0; i < lists.length; i++) {
      const nodes = lists[i];
      if (!nodes) continue;
      for (let j = 0; j < nodes.length; j++) {
        if (isScriptNode(nodes[j])) return true;
      }
    }
    return false;
  }

  function metricsMissing(box, modeKey, unit) {
    const roots = lineupMetricRoots(box);
    for (let i = 0; i < roots.length; i++) {
      const plays = roots[i].querySelectorAll('.play');
      for (let j = 0; j < plays.length; j++) {
        const playEl = plays[j];
        const text = formatPlayerMetric(playEl, modeKey, unit);
        if (modeKey !== 'club' && (!text || text === '-' || text === '-/-')) continue;
        if (!playEl.querySelector('.tm-lv-metric')) return true;
      }
    }
    return false;
  }

  function renderStarterMetrics() {
    const box = document.getElementById('matchBox2');
    if (!box) {
      clearStarterMetrics();
      return;
    }
    const roots = lineupMetricRoots(box);
    if (!roots.length) {
      clearStarterMetrics();
      return;
    }

    const unit = detectUnit(box);
    const mode = currentMetricMode();
    const sig = starterMetricSignature(box, mode.key, unit);
    if (sig === lastMetricSig && !metricsMissing(box, mode.key, unit)) {
      updatePanelModeChip();
      bindMetricClick(box);
      return;
    }

    const title = metricClickTitle();
    const prevRefreshing = refreshing;
    refreshing = true;
    try {
      const playsRoot = box.querySelector('.plays');
      roots.forEach(function (root) {
        const inline = root !== playsRoot;
        root.querySelectorAll('.play').forEach(function (playEl) {
          const text = formatPlayerMetric(playEl, mode.key, unit);
          if (mode.key !== 'club' && (!text || text === '-' || text === '-/-')) return;
          const badge = ensureMetricBadge(playEl, inline);
          if (!badge) return;
          badge.textContent = text || '-';
          badge.setAttribute(
            'title',
            mode.key === 'club' && text && text !== '…' && text !== '-'
              ? text + '。' + title
              : title
          );
          badge.setAttribute('data-tm-mode', mode.key);
        });
      });
      lastMetricSig = sig;
    } finally {
      refreshing = prevRefreshing;
    }
    updatePanelModeChip();
    bindMetricClick(box);
  }

  function setMetricModeByKey(key) {
    const modes = activeMetricModes();
    const found = modes.some(function (m) {
      return m.key === key;
    });
    if (!found) return;
    if (metricModeKey === key) return;
    metricModeKey = key;
    saveMetricModeKey();
    if (key === 'club') ensureClubs();
    else renderStarterMetrics();
  }

  function cycleMetricMode() {
    cancelClubAgeFlip();
    metricModeKey = nextMetricMode().key;
    saveMetricModeKey();
    if (metricModeKey === 'club') ensureClubs();
    else renderStarterMetrics();
  }

  function injectStyle() {
    const old = document.getElementById(STYLE_ID);
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#' +
      PANEL_ID +
      ' {' +
      'position: fixed;' +
      'left: 16px;' +
      'bottom: 20px;' +
      'z-index: 999998;' +
      'width: min(360px, calc(100vw - 32px));' +
      'border: 1px solid #d8e2ec;' +
      'border-radius: 10px;' +
      'background: linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%);' +
      'overflow: hidden;' +
      'font-size: 12px;' +
      'color: #1e293b;' +
      'box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);' +
      'box-sizing: border-box;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-collapsed {' +
      'width: auto;' +
      'min-width: 0;' +
      'max-width: none;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-head {' +
      'display: flex;' +
      'align-items: center;' +
      'justify-content: space-between;' +
      'gap: 8px;' +
      'padding: 8px 12px;' +
      'background: #e8eef5;' +
      'border-bottom: 1px solid #d8e2ec;' +
      'font-weight: 600;' +
      'font-size: 12px;' +
      'color: #475569;' +
      'cursor: pointer;' +
      'user-select: none;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-collapsed .tm-lv-head {' +
      'border-bottom: none;' +
      'padding: 6px 10px;' +
      'gap: 4px;' +
      'justify-content: center;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-head-actions {' +
      'display: flex;' +
      'align-items: center;' +
      'gap: 8px;' +
      'flex-shrink: 0;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-collapsed .tm-lv-mode,' +
      '#' +
      PANEL_ID +
      '.tm-lv-collapsed .tm-lv-unit {' +
      'display: none;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-ver {' +
      'font-weight: 500;' +
      'font-size: 10px;' +
      'line-height: 1;' +
      'color: #94a3b8;' +
      'flex-shrink: 0;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-toggle {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'width: 18px;' +
      'height: 18px;' +
      'font-size: 14px;' +
      'line-height: 1;' +
      'color: #64748b;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-title {' +
      'overflow: hidden;' +
      'text-overflow: ellipsis;' +
      'white-space: nowrap;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-collapsed .tm-lv-title {' +
      'flex: none;' +
      'max-width: none;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-collapsed .tm-lv-body {' +
      'display: none;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-unit {' +
      'font-weight: 500;' +
      'color: #64748b;' +
      'font-size: 11px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-body {' +
      'padding: 10px 12px 12px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-chart {' +
      'background: rgba(255,255,255,0.72);' +
      'border: 1px solid #e2e8f0;' +
      'border-radius: 8px;' +
      'padding: 8px 10px 10px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-legend {' +
      'display: flex;' +
      'flex-wrap: wrap;' +
      'gap: 8px 14px;' +
      'margin-bottom: 8px;' +
      'font-size: 10px;' +
      'color: #64748b;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-chart .tm-lv-ages {' +
      'display: flex;' +
      'align-items: baseline;' +
      'gap: 4px;' +
      'margin: -2px 0 8px;' +
      'font-size: 12px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-chart .tm-lv-ages b {' +
      'margin-right: 2px;' +
      'font-weight: 600;' +
      'color: #475569;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-chart .tm-lv-sum-h {' +
      'font-weight: 700;' +
      'color: #15803d;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-chart .tm-lv-sum-a {' +
      'font-weight: 700;' +
      'color: #0369a1;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-chart .tm-lv-sum-sep {' +
      'color: #94a3b8;' +
      'font-size: 11px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-leg {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'gap: 4px;' +
      'max-width: 100%;' +
      'overflow: hidden;' +
      'text-overflow: ellipsis;' +
      'white-space: nowrap;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-leg i {' +
      'display: inline-block;' +
      'width: 8px;' +
      'height: 8px;' +
      'border-radius: 2px;' +
      'flex-shrink: 0;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-leg-home i {' +
      'background: linear-gradient(180deg, #bbf7d0, #86efac);' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-leg-away i {' +
      'background: linear-gradient(180deg, #bae6fd, #7dd3fc);' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-clusters {' +
      'display: flex;' +
      'align-items: flex-end;' +
      'justify-content: center;' +
      'gap: ' +
      CHART_GROUP_GAP_PX +
      'px;' +
      'padding: 0 4px 0;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-cluster {' +
      'flex: 0 0 auto;' +
      'display: flex;' +
      'flex-direction: column;' +
      'align-items: center;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-bars {' +
      'display: flex !important;' +
      'flex-direction: row !important;' +
      'align-items: flex-end !important;' +
      'justify-content: center;' +
      'gap: ' +
      CHART_BAR_GAP_PX +
      'px;' +
      'border-bottom: 1px solid #cbd5e1;' +
      'box-sizing: border-box;' +
      'padding-top: ' +
      CHART_LABEL_TOP_PX +
      'px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-item {' +
      'display: flex !important;' +
      'flex-direction: column !important;' +
      'align-items: center !important;' +
      'justify-content: flex-end !important;' +
      'gap: 2px;' +
      'flex: none;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-slot {' +
      'position: relative;' +
      'width: ' +
      CHART_BAR_WIDTH_PX +
      'px;' +
      'height: ' +
      CHART_BAR_MAX_PX +
      'px;' +
      'flex: none;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vval,' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vval-sizer {' +
      'margin: 0;' +
      'padding: 0;' +
      'font-size: 11px;' +
      'font-weight: 700;' +
      'line-height: 1.15;' +
      'text-align: center;' +
      'white-space: nowrap;' +
      'font-variant-numeric: tabular-nums;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vval-sizer {' +
      'display: block;' +
      'height: 0;' +
      'overflow: hidden;' +
      'visibility: hidden;' +
      'pointer-events: none;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vval {' +
      'position: absolute;' +
      'left: 50%;' +
      'bottom: calc(var(--bh, 0px) + 2px);' +
      'transform: translateX(-50%);' +
      'z-index: 1;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-unit {' +
      'font-size: 9px;' +
      'font-weight: 600;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vval-h {' +
      'color: #15803d;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vval-a {' +
      'color: #0369a1;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vbar {' +
      'position: absolute;' +
      'left: 0;' +
      'bottom: 0;' +
      'margin: 0;' +
      'padding: 0;' +
      'width: ' +
      CHART_BAR_WIDTH_PX +
      'px;' +
      'border-radius: 3px 3px 0 0;' +
      'box-sizing: border-box;' +
      'transition: height 0.35s ease;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vbar-h {' +
      'background: linear-gradient(180deg, #bbf7d0, #86efac);' +
      'border: 1px solid #4ade80;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-vbar-a {' +
      'background: linear-gradient(180deg, #bae6fd, #7dd3fc);' +
      'border: 1px solid #38bdf8;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-xlabel {' +
      'margin-top: 6px;' +
      'font-size: 11px;' +
      'font-weight: 600;' +
      'color: #334155;' +
      'text-align: center;' +
      'white-space: nowrap;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-xsub {' +
      'display: block;' +
      'margin-top: 1px;' +
      'font-size: 9px;' +
      'font-weight: 400;' +
      'color: #94a3b8;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-ratio {' +
      'display: block;' +
      'margin-top: 3px;' +
      'font-size: 11px;' +
      'font-weight: 700;' +
      'line-height: 1.2;' +
      'color: #64748b;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-ratio-h {' +
      'color: #15803d;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-ratio-a {' +
      'color: #0369a1;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-lines {' +
      'margin-top: 8px;' +
      'background: rgba(255,255,255,0.72);' +
      'border: 1px solid #e2e8f0;' +
      'border-radius: 8px;' +
      'padding: 8px 10px 10px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-lines-head {' +
      'display: flex;' +
      'align-items: baseline;' +
      'justify-content: space-between;' +
      'gap: 8px;' +
      'margin-bottom: 4px;' +
      'font-size: 11px;' +
      'font-weight: 600;' +
      'color: #334155;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-form {' +
      'font-size: 10px;' +
      'font-weight: 500;' +
      'color: #64748b;' +
      'flex-shrink: 0;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-legend {' +
      'display: flex;' +
      'flex-wrap: wrap;' +
      'gap: 6px 10px;' +
      'margin-bottom: 8px;' +
      'font-size: 10px;' +
      'color: #64748b;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-leg {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'gap: 4px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-leg b {' +
      'display: inline-block;' +
      'width: 8px;' +
      'height: 8px;' +
      'border-radius: 2px;' +
      'flex-shrink: 0;' +
      'font-weight: 400;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-row {' +
      'display: grid;' +
      'grid-template-columns: 18px minmax(0,1fr) 64px;' +
      'align-items: center;' +
      'gap: 6px;' +
      'margin-top: 6px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-side {' +
      'font-size: 11px;' +
      'font-weight: 700;' +
      'line-height: 20px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-side-h,' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-total-h {' +
      'color: #15803d;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-side-a,' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-total-a {' +
      'color: #0369a1;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-total {' +
      'font-size: 11px;' +
      'font-weight: 700;' +
      'text-align: right;' +
      'white-space: nowrap;' +
      'line-height: 20px;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-track {' +
      'height: 18px !important;' +
      'min-height: 18px !important;' +
      'line-height: 0 !important;' +
      'background: transparent;' +
      'overflow: hidden;' +
      'text-align: left;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-svg {' +
      'display: block !important;' +
      'width: 100% !important;' +
      'height: 18px !important;' +
      'max-height: 18px !important;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-gk,' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-leg b.tm-lv-stack-gk {' +
      'background: #fbbf24;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-def,' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-leg b.tm-lv-stack-def {' +
      'background: #34d399;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-mid,' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-leg b.tm-lv-stack-mid {' +
      'background: #60a5fa;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-fw,' +
      '#' +
      PANEL_ID +
      ' .tm-lv-stack-leg b.tm-lv-stack-fw {' +
      'background: #fb7185;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-mode {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'min-width: 36px;' +
      'padding: 1px 7px;' +
      'border-radius: 999px;' +
      'border: 1px solid #93c5fd;' +
      'background: #eff6ff;' +
      'color: #1d4ed8;' +
      'font-size: 11px;' +
      'font-weight: 700;' +
      'line-height: 16px;' +
      'cursor: pointer;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-mode:hover {' +
      'background: #dbeafe;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-force-nat {' +
      'display: inline-flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'padding: 1px 7px;' +
      'border-radius: 999px;' +
      'border: 1px dashed #94a3b8;' +
      'background: #fff;' +
      'color: #64748b;' +
      'font-size: 11px;' +
      'font-weight: 600;' +
      'line-height: 16px;' +
      'cursor: pointer;' +
      'user-select: none;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-force-nat:hover {' +
      'border-color: #64748b;' +
      'color: #334155;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-force-nat {' +
      'pointer-events: auto;' +
      '}' +
      '#matchBox2 .plays .playBox .play > span {' +
      'height: auto;' +
      'min-height: 60px;' +
      '}' +
      '#matchBox2 .plays .playBox .play {' +
      'height: auto;' +
      'min-height: 80px;' +
      'position: relative;' +
      'overflow: visible;' +
      '}' +
      '#matchBox2 .plays .playBox .play [id^="playerTech_"] {' +
      'position: absolute !important;' +
      'top: 2px !important;' +
      'left: calc(50% + 26px) !important;' +
      'right: auto !important;' +
      'bottom: auto !important;' +
      'width: auto !important;' +
      'max-width: 42px;' +
      'height: auto !important;' +
      'min-height: 0 !important;' +
      'line-height: 0 !important;' +
      'margin: 0 !important;' +
      'padding: 0 !important;' +
      'display: flex !important;' +
      'flex-direction: column;' +
      'align-items: flex-start;' +
      'gap: 1px;' +
      'z-index: 4;' +
      'overflow: hidden !important;' +
      'font-size: 0 !important;' +
      'color: transparent !important;' +
      'pointer-events: none;' +
      '}' +
      '#matchBox2 .plays .guest .playBox .play [id^="playerTech_"] {' +
      'left: auto !important;' +
      'right: calc(50% + 26px) !important;' +
      'align-items: flex-end;' +
      '}' +
      '#matchBox2 .plays .playBox .play [id^="playerTech_"] img {' +
      'display: block !important;' +
      'width: 14px !important;' +
      'height: 14px !important;' +
      'margin: 0 !important;' +
      'float: none !important;' +
      '}' +
      '#matchBox2 .plays .playBox .play .tm-lv-metric {' +
      'display: table;' +
      'box-sizing: border-box;' +
      'position: relative;' +
      'z-index: 5;' +
      'margin: 1px auto 0;' +
      'padding: 0 3px;' +
      'width: auto;' +
      'max-width: none;' +
      'min-height: 0;' +
      'height: auto;' +
      'min-height: 15px;' +
      'line-height: 15px;' +
      'font-size: 10px;' +
      'font-weight: 700;' +
      'font-style: normal;' +
      'text-align: center;' +
      'white-space: nowrap;' +
      'overflow: visible;' +
      'text-overflow: clip;' +
      'color: #15803d;' +
      'background: rgba(255,255,255,0.18);' +
      'border: none;' +
      'border-radius: 3px;' +
      'box-shadow: none;' +
      'text-shadow: 0 0 3px rgba(255,255,255,0.95), 0 1px 1px rgba(255,255,255,0.8);' +
      'cursor: pointer;' +
      'user-select: none;' +
      '}' +
      '#matchBox2 .plays .guest .playBox .play .tm-lv-metric {' +
      'color: #0369a1;' +
      '}' +
      '#matchBox2 .backupPlay2 .home,' +
      '#matchBox2 .backupPlay2 .guest {' +
      'display: grid !important;' +
      'grid-template-columns: repeat(3, minmax(0, 1fr));' +
      'align-items: start;' +
      '}' +
      '#matchBox2 .backupPlay2 .play {' +
      'width: auto !important;' +
      'height: auto !important;' +
      'float: none !important;' +
      'margin: 1px 2px !important;' +
      '}' +
      '#matchBox2 .backupPlay .play,' +
      '#matchBox2 .hurtPlay .play {' +
      'display: flex !important;' +
      'flex-wrap: wrap;' +
      'align-items: center;' +
      'gap: 1px 3px;' +
      '}' +
      '#matchBox2 .backupPlay .play .name,' +
      '#matchBox2 .hurtPlay .play .name {' +
      'display: inline-flex !important;' +
      'align-items: center;' +
      'flex: 1 1 auto;' +
      'width: auto !important;' +
      'max-width: none;' +
      'min-width: 0;' +
      'float: none !important;' +
      'vertical-align: middle;' +
      'overflow: hidden;' +
      '}' +
      '#matchBox2 .backupPlay2 .play > span {' +
      'display: flex;' +
      'flex-wrap: wrap;' +
      'align-items: center;' +
      'gap: 1px 3px;' +
      'width: 100%;' +
      'height: auto !important;' +
      '}' +
      '#matchBox2 .backupPlay2 .play > span .name {' +
      'display: inline-flex !important;' +
      'align-items: center;' +
      'flex: 1 1 auto;' +
      'width: auto !important;' +
      'max-width: none;' +
      'min-width: 0;' +
      'margin: 0;' +
      'overflow: hidden;' +
      '}' +
      '#matchBox2 .backupPlay2 .play,' +
      '#matchBox2 .hurtPlay .play {' +
      'color: #333;' +
      '}' +
      '#matchBox2 .backupPlay2 .play > span .eventicon,' +
      '#matchBox2 .backupPlay2 [id^="playerTech_"] {' +
      'position: static !important;' +
      'top: auto !important;' +
      'left: auto !important;' +
      'right: auto !important;' +
      'flex: 0 0 100%;' +
      'width: auto !important;' +
      'max-width: none !important;' +
      'height: auto !important;' +
      'min-height: 0 !important;' +
      'margin: 0 !important;' +
      'line-height: 14px !important;' +
      'font-size: 12px !important;' +
      'color: #64748b !important;' +
      'overflow: visible !important;' +
      '}' +
      '#matchBox2 .backupPlay .play .tm-lv-metric,' +
      '#matchBox2 .hurtPlay .play .tm-lv-metric,' +
      '#matchBox2 .tm-lv-metric-inline {' +
      'display: inline-block;' +
      'flex: 0 0 auto;' +
      'box-sizing: border-box;' +
      'position: relative;' +
      'z-index: 5;' +
      'margin: 0;' +
      'padding: 0 2px;' +
      'width: auto;' +
      'max-width: none;' +
      'min-height: 0;' +
      'height: 13px;' +
      'line-height: 13px;' +
      'font-size: 9px;' +
      'font-weight: 600;' +
      'font-style: normal;' +
      'text-align: center;' +
      'white-space: nowrap;' +
      'vertical-align: middle;' +
      'color: #15803d;' +
      'background: rgba(255,255,255,0.55);' +
      'border-radius: 3px;' +
      'cursor: pointer;' +
      'user-select: none;' +
      '}' +
      '#matchBox2 .backupPlay .guest .play .tm-lv-metric,' +
      '#matchBox2 .hurtPlay .guest .play .tm-lv-metric {' +
      'color: #0369a1;' +
      '}' +
      '#matchBox2 .plays .playBox .play span ul,' +
      '#matchBox2 .backupPlay2 .play span ul {' +
      'width: 250px !important;' +
      'min-width: 250px !important;' +
      'box-sizing: content-box !important;' +
      '}' +
      '#matchBox2 .plays .playBox .play span ul {' +
      'pointer-events: none;' +
      '}' +
      '#matchBox2 .plays .playBox .play span ul li,' +
      '#matchBox2 .backupPlay2 .play span ul li {' +
      'width: 160px !important;' +
      'max-width: none !important;' +
      'overflow: visible !important;' +
      'text-overflow: clip !important;' +
      '}' +
      '#matchBox2 .plays .playBox .play span ul li.icon,' +
      '#matchBox2 .backupPlay2 .play span ul li.icon {' +
      'width: 75px !important;' +
      'overflow: hidden !important;' +
      '}' +
      '#matchBox2 .plays .playBox .play .tm-lv-metric:hover ~ ul {' +
      'display: none !important;' +
      '}' +
      '#matchBox2 .play ul li.tm-lv-bday .tm-lv-hover-age {' +
      'display: inline;' +
      'margin-left: 4px;' +
      'font-weight: 600;' +
      'white-space: nowrap;' +
      '}' +
      '#matchBox2 .plays {' +
      'position: relative;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame {' +
      'position: absolute !important;' +
      'top: 22px;' +
      'left: 50% !important;' +
      'right: auto !important;' +
      'bottom: auto !important;' +
      'transform: translateX(-50%);' +
      'width: auto !important;' +
      'max-width: none;' +
      'margin: 0;' +
      'padding: 6px 8px;' +
      'display: flex;' +
      'flex-direction: column;' +
      'align-items: center;' +
      'gap: 4px;' +
      'z-index: 20;' +
      'border: 1px solid rgba(226, 232, 240, 0.95);' +
      'border-radius: 6px;' +
      'background: rgba(255, 255, 255, 0.92);' +
      'box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);' +
      'overflow: visible;' +
      'font-size: 12px;' +
      'line-height: 1.4;' +
      'pointer-events: none;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum {' +
      'display: flex;' +
      'align-items: baseline;' +
      'gap: 4px;' +
      'white-space: nowrap;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum b {' +
      'font-weight: 600;' +
      'color: #475569;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum-h,' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum-a {' +
      'font-size: 16px;' +
      'font-weight: 700;' +
      'line-height: 1.2;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum-h {' +
      'color: #15803d;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum-a {' +
      'color: #0369a1;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum-sep {' +
      'color: #94a3b8;' +
      'font-size: 12px;' +
      'font-weight: 600;' +
      '}' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum-x,' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum-x-h,' +
      '#' +
      PANEL_ID +
      '.tm-lv-frame .tm-lv-sum-x-a {' +
      'color: #dc2626;' +
      'font-weight: 700;' +
      '}' +
      '#tm-lv-corner-h,' +
      '#tm-lv-corner-a {' +
      'position: absolute;' +
      'bottom: 2px;' +
      'z-index: 6;' +
      'width: 32%;' +
      'height: 16px;' +
      'pointer-events: auto;' +
      '}' +
      '#tm-lv-corner-h { left: auto; right: calc(50% + 16px); }' +
      '#tm-lv-corner-a { left: calc(50% + 16px); right: auto; }' +
      '#tm-lv-corner-h svg,' +
      '#tm-lv-corner-a svg {' +
      'display: block;' +
      'width: 100%;' +
      'height: 16px;' +
      'border-radius: 3px;' +
      '}' +
      '#matchBox2 .backupPlay2 .eventicon:has(.tm-lv-subout),' +
      '#matchBox2 .backupPlay .eventicon:has(.tm-lv-subout) {' +
      'width: auto !important;' +
      'min-width: 0 !important;' +
      'height: 14px !important;' +
      'line-height: 14px !important;' +
      'overflow: visible !important;' +
      '}' +
      '#matchBox2 .plays .tm-lv-subout {' +
      'display: none !important;' +
      '}' +
      '#matchBox2 .backupPlay2 .eventicon .tm-lv-subout,' +
      '#matchBox2 .backupPlay .eventicon .tm-lv-subout {' +
      'display: inline-flex !important;' +
      'align-items: center !important;' +
      'vertical-align: middle !important;' +
      'width: auto !important;' +
      'height: 14px !important;' +
      'min-width: 0 !important;' +
      'position: static !important;' +
      'margin-left: 3px;' +
      'font-size: 10px !important;' +
      'font-weight: 400 !important;' +
      'line-height: 14px !important;' +
      'color: #73866c;' +
      'white-space: nowrap;' +
      'pointer-events: none;' +
      '}' +
      '#matchBox2 .backupPlay2 .eventicon .tm-lv-subout-num,' +
      '#matchBox2 .backupPlay2 .eventicon .tm-lv-subout-name,' +
      '#matchBox2 .backupPlay .eventicon .tm-lv-subout-num,' +
      '#matchBox2 .backupPlay .eventicon .tm-lv-subout-name {' +
      'display: block !important;' +
      'width: auto !important;' +
      'height: auto !important;' +
      'min-width: 0 !important;' +
      'position: static !important;' +
      'vertical-align: baseline !important;' +
      'margin: 0 !important;' +
      'padding: 0 !important;' +
      'font-size: 10px !important;' +
      'font-weight: 400 !important;' +
      'line-height: 14px !important;' +
      '}' +
      '#matchBox2 .backupPlay2 .eventicon .tm-lv-subout-num,' +
      '#matchBox2 .backupPlay .eventicon .tm-lv-subout-num {' +
      'margin-right: 2px !important;' +
      '}' +
      '.tm-lv-nat-btn {' +
      'position: absolute;' +
      'left: calc(50% + 46px);' +
      'top: 50%;' +
      'transform: translateY(-50%);' +
      'z-index: 8;' +
      'display: inline-flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'width: 22px;' +
      'height: 22px;' +
      'margin: 0;' +
      'padding: 0;' +
      'border: 1px solid #cbd5e1;' +
      'border-radius: 6px;' +
      'background: #fff;' +
      'color: #64748b;' +
      'cursor: pointer;' +
      'user-select: none;' +
      'line-height: 0;' +
      '}' +
      '.tm-lv-nat-btn:hover {' +
      'border-color: #94a3b8;' +
      'color: #1e293b;' +
      '}' +
      '.tm-lv-nat-btn.tm-lv-nat-on {' +
      'background: #f1f5f9;' +
      'border-color: #334155;' +
      'color: #0f172a;' +
      '}' +
      '.tm-lv-nat-btn.tm-lv-nat-on:hover {' +
      'background: #e2e8f0;' +
      'border-color: #0f172a;' +
      'color: #0f172a;' +
      '}' +
      '.tm-lv-nat-btn svg {' +
      'display: block;' +
      'width: 14px;' +
      'height: 14px;' +
      '}' +
      '.tm-lv-goal-btn {' +
      'position: absolute;' +
      'left: calc(50% + 72px);' +
      'top: 50%;' +
      'transform: translateY(-50%);' +
      'z-index: 8;' +
      'display: inline-flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'width: 22px;' +
      'height: 22px;' +
      'margin: 0;' +
      'padding: 0;' +
      'border: 1px solid #cbd5e1;' +
      'border-radius: 6px;' +
      'background: #fff;' +
      'color: #64748b;' +
      'cursor: pointer;' +
      'user-select: none;' +
      'line-height: 22px;' +
      'font-size: 14px;' +
      '}' +
      '.tm-lv-goal-btn:hover {' +
      'border-color: #94a3b8;' +
      'color: #1e293b;' +
      '}' +
      '.tm-lv-goal-btn.tm-lv-goal-on {' +
      'background: #f0fdf4;' +
      'border-color: #166534;' +
      'color: #166534;' +
      '}' +
      '.tm-lv-goal-btn.tm-lv-goal-league {' +
      'background: #eff6ff;' +
      'border-color: #1d4ed8;' +
      'color: #1d4ed8;' +
      '}' +
      '.tm-lv-goal-btn.tm-lv-goal-loading {' +
      'opacity: 0.55;' +
      'cursor: progress;' +
      '}' +
      '.tm-lv-pitch-btn {' +
      'position: absolute;' +
      'left: calc(50% + 98px);' +
      'top: 50%;' +
      'transform: translateY(-50%);' +
      'z-index: 8;' +
      'display: inline-flex;' +
      'align-items: center;' +
      'justify-content: center;' +
      'width: 22px;' +
      'height: 22px;' +
      'margin: 0;' +
      'padding: 0;' +
      'border: 1px solid #cbd5e1;' +
      'border-radius: 6px;' +
      'background: #fff;' +
      'color: #64748b;' +
      'cursor: pointer;' +
      'user-select: none;' +
      'line-height: 0;' +
      '}' +
      '.tm-lv-pitch-btn:hover {' +
      'border-color: #94a3b8;' +
      'color: #1e293b;' +
      '}' +
      '.tm-lv-pitch-btn.tm-lv-pitch-on {' +
      'background: #eff6ff;' +
      'border-color: #1d4ed8;' +
      'color: #1d4ed8;' +
      '}' +
      '.tm-lv-pitch-btn svg {' +
      'display: block;' +
      'width: 14px;' +
      'height: 14px;' +
      '}' +
      '#matchBox2 .plays > .tm-lv-goal-sum {' +
      'position: absolute;' +
      'top: 8px;' +
      'z-index: 8;' +
      'display: inline-flex;' +
      'align-items: center;' +
      'gap: 1px;' +
      'margin: 0;' +
      'padding: 1px 6px 1px 3px;' +
      'border-radius: 10px;' +
      'background: rgba(255,255,255,0.92);' +
      'color: #166534;' +
      'font-size: 13px;' +
      'font-weight: 700;' +
      'line-height: 16px;' +
      'white-space: nowrap;' +
      'pointer-events: none;' +
      'box-shadow: 0 1px 2px rgba(15,23,42,0.16);' +
      '}' +
      '#matchBox2 .plays > .tm-lv-goal-sum-home {' +
      'left: 10px;' +
      '}' +
      '#matchBox2 .plays > .tm-lv-goal-sum-away {' +
      'right: 10px;' +
      '}' +
      '#matchBox2 .plays > .tm-lv-goal-sum span {' +
      'display: inline !important;' +
      'position: static !important;' +
      'width: auto !important;' +
      'height: auto !important;' +
      'min-height: 0 !important;' +
      '}' +
      '#matchBox2 .plays .playBox .play span > .tm-lv-goal {' +
      'position: absolute !important;' +
      'left: 50% !important;' +
      'top: 0 !important;' +
      'z-index: 6;' +
      'transform: translate(-50%, -88%);' +
      'display: inline-flex !important;' +
      'align-items: center;' +
      'gap: 1px;' +
      'width: auto !important;' +
      'height: 16px !important;' +
      'min-width: 0 !important;' +
      'min-height: 0 !important;' +
      'padding: 0 4px 0 1px;' +
      'border-radius: 8px;' +
      'background: rgba(255,255,255,0.94);' +
      'color: #166534;' +
      'font-size: 12px;' +
      'font-weight: 700;' +
      'font-style: normal;' +
      'line-height: 16px !important;' +
      'vertical-align: top !important;' +
      'white-space: nowrap;' +
      'pointer-events: none;' +
      'box-shadow: 0 1px 2px rgba(15,23,42,0.18);' +
      '}' +
      '#matchBox2 .plays .playBox .play .tm-lv-goal span {' +
      'display: inline !important;' +
      'position: static !important;' +
      'width: auto !important;' +
      'height: auto !important;' +
      'min-height: 0 !important;' +
      'vertical-align: baseline !important;' +
      '}' +
      '#matchBox2 .backupPlay .tm-lv-goal,' +
      '#matchBox2 .hurtPlay .tm-lv-goal {' +
      'display: inline-flex !important;' +
      'position: static !important;' +
      'flex: 0 0 auto;' +
      'align-items: center;' +
      'gap: 1px;' +
      'width: auto !important;' +
      'height: auto !important;' +
      'min-width: 0 !important;' +
      'min-height: 0 !important;' +
      'margin: 0 4px 0 1px;' +
      'padding: 0;' +
      'color: #166534;' +
      'font-size: 12px;' +
      'font-weight: 700;' +
      'line-height: 16px !important;' +
      'vertical-align: middle;' +
      'white-space: nowrap;' +
      'pointer-events: none;' +
      '}' +
      '#matchBox2 .backupPlay .tm-lv-goal span,' +
      '#matchBox2 .hurtPlay .tm-lv-goal span {' +
      'display: inline !important;' +
      'position: static !important;' +
      'width: auto !important;' +
      'height: auto !important;' +
      'min-height: 0 !important;' +
      'line-height: 16px !important;' +
      'vertical-align: baseline !important;' +
      '}' +
      '#matchBox2 .plays .play .tm-lv-nat {' +
      'display: block;' +
      'box-sizing: border-box;' +
      'position: relative;' +
      'z-index: 5;' +
      'width: max-content;' +
      'max-width: 96px;' +
      'margin: 0 auto;' +
      'padding: 0 1px;' +
      'height: 12px;' +
      'line-height: 12px;' +
      'font-size: 10px;' +
      'font-weight: 700;' +
      'font-style: normal;' +
      'text-align: center;' +
      'white-space: nowrap;' +
      'overflow: hidden;' +
      'text-overflow: ellipsis;' +
      'color: #1e293b;' +
      'background: transparent;' +
      'text-shadow: 0 0 3px rgba(255,255,255,0.95), 0 1px 1px rgba(255,255,255,0.85);' +
      'pointer-events: none;' +
      '}' +
      '#matchBox2 .backupPlay .play .tm-lv-nat,' +
      '#matchBox2 .hurtPlay .play .tm-lv-nat,' +
      '#matchBox2 .backupPlay2 .play .tm-lv-nat {' +
      'display: inline-block;' +
      'flex: 0 0 auto;' +
      'position: relative;' +
      'z-index: 5;' +
      'width: auto;' +
      'max-width: 72px;' +
      'margin: 0;' +
      'padding: 0 2px;' +
      'height: 13px;' +
      'line-height: 13px;' +
      'font-size: 9px;' +
      'font-weight: 600;' +
      'font-style: normal;' +
      'text-align: center;' +
      'white-space: nowrap;' +
      'vertical-align: middle;' +
      'overflow: hidden;' +
      'text-overflow: ellipsis;' +
      'color: #334155;' +
      'background: rgba(255,255,255,0.7);' +
      'border-radius: 3px;' +
      'text-shadow: none;' +
      'pointer-events: none;' +
      '}' +
      '#matchBox2 .plays .playBox .play .tm-lv-metric[data-tm-mode="club"] {' +
      'max-width: 76px;' +
      '}' +
      '#matchBox2 .backupPlay .play .tm-lv-metric[data-tm-mode="club"],' +
      '#matchBox2 .hurtPlay .play .tm-lv-metric[data-tm-mode="club"],' +
      '#matchBox2 .tm-lv-metric-inline[data-tm-mode="club"] {' +
      'max-width: 64px;' +
      'overflow: hidden;' +
      'text-overflow: ellipsis;' +
      '}';
    (document.body || document.head || document.documentElement).appendChild(style);
  }

  function frameRatioMark(home, away) {
    const ratio = formatRatio(home, away);
    if (!ratio.side) return { side: '', text: '' };
    const raw = String(ratio.text).replace(/^[主客]\s*/, '');
    return { side: ratio.side, text: /倍$/.test(raw) ? raw : raw + '倍' };
  }

  function frameSumHtml(label, key, stats, names) {
    const unit = stats.unit;
    const home = stats.home[key];
    const away = stats.away[key];
    const mark = frameRatioMark(home, away);
    const markHtml = mark.text
      ? '<span class="tm-lv-sum-x tm-lv-sum-x-' + mark.side + '">' + escHtml(mark.text) + '</span>'
      : '';
    return (
      '<span class="tm-lv-sum" title="' +
      escHtml(names.home + ' / ' + names.away) +
      '"><b>' +
      escHtml(label) +
      '</b><span class="tm-lv-sum-h" title="' +
      escHtml(names.home) +
      '">' +
      escHtml(formatMoney(home, unit)) +
      '</span>' +
      (mark.side === 'h' ? markHtml : '') +
      '<span class="tm-lv-sum-sep">vs</span><span class="tm-lv-sum-a" title="' +
      escHtml(names.away) +
      '">' +
      escHtml(formatMoney(away, unit)) +
      '</span>' +
      (mark.side === 'a' ? markHtml : '') +
      '</span>'
    );
  }

  function ageTip(stat, teamName) {
    const base = (teamName || '') + ' 首发平均年龄';
    if (!stat || !stat.n) return base;
    return base + ' ' + formatAvgAge(stat) + '（' + stat.n + '人，按比赛日计算）';
  }

  function ageLineHtml(stats, names) {
    const home = stats.home && stats.home.age;
    const away = stats.away && stats.away.age;
    return (
      '<span class="tm-lv-sum tm-lv-ages" title="首发平均年龄，按比赛日计算，无生日的不计">' +
      '<b>均龄</b><span class="tm-lv-sum-h" title="' +
      escHtml(ageTip(home, names.home)) +
      '">' +
      escHtml(formatAvgAge(home)) +
      '</span><span class="tm-lv-sum-sep">vs</span><span class="tm-lv-sum-a" title="' +
      escHtml(ageTip(away, names.away)) +
      '">' +
      escHtml(formatAvgAge(away)) +
      '</span></span>'
    );
  }

  function frameStripInnerHtml(stats) {
    const names = teamNames();
    return (
      frameSumHtml('首发', 'starter', stats, names) +
      frameSumHtml('上场', 'onField', stats, names) +
      ageLineHtml(stats, names) +
      '<span class="tm-lv-force-nat" role="button" tabindex="0" title="' +
      escHtml(FORCE_NAT_TITLE) +
      '">国家队</span>'
    );
  }

  const FRAME_LINES = [
    { key: 'gk', label: '门将', color: '#3b82f6' },
    { key: 'def', label: '后卫', color: '#facc15' },
    { key: 'mid', label: '中场', color: '#22c55e' },
    { key: 'fw', label: '前锋', color: '#ef4444' },
  ];

  function frameLineSegs(lines) {
    return FRAME_LINES.map(function (s) {
      const cell = (lines && lines[s.key]) || { val: 0, n: 0 };
      return { label: s.label, color: s.color, val: cell.val || 0, n: cell.n || 0 };
    }).filter(function (s) {
      return s.val > 0 || s.n > 0;
    });
  }

  function frameLineTotal(lines) {
    return frameLineSegs(lines).reduce(function (sum, s) {
      return sum + s.val;
    }, 0);
  }

  /** fromRight：客队从右下角向中场排，门将贴右端。长度相对两队较大一方。 */
  function frameCornerInner(lines, teamName, unit, maxTotal, fromRight) {
    const segs = frameLineSegs(lines);
    const total = segs.reduce(function (sum, s) {
      return sum + s.val;
    }, 0);
    if (!(total > 0)) return null;
    const vbW = 1000;
    const vbH = 16;
    const cap = maxTotal > 0 ? maxTotal : total;
    const barW = Math.max(1, Math.round((total / cap) * vbW));
    // 内端贴中线：主队色块靠容器右侧，客队色块靠容器左侧。
    let x = fromRight ? barW : vbW - barW;
    const titles = [];
    const rects = segs
      .map(function (s) {
        if (!(s.val > 0)) return '';
        let w = Math.round((s.val / total) * barW);
        if (w < 1) w = 1;
        if (fromRight) {
          if (x - w < 0) w = Math.max(0, x);
          x -= w;
        } else if (x + w > vbW) {
          w = Math.max(0, vbW - x);
        }
        const left = x;
        if (!fromRight) x += w;
        const pct = (s.val / total) * 100;
        const title =
          s.label +
          ' ' +
          formatMoney(s.val, unit) +
          '（' +
          s.n +
          '人，' +
          (pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)) +
          '%）';
        titles.push(title);
        return (
          '<rect x="' +
          left +
          '" y="0" width="' +
          w +
          '" height="' +
          vbH +
          '" fill="' +
          s.color +
          '"><title>' +
          escHtml(title) +
          '</title></rect>'
        );
      })
      .join('');
    return {
      title: (teamName || '') + ' ' + titles.join(' · '),
      svg:
        '<svg viewBox="0 0 ' +
        vbW +
        ' ' +
        vbH +
        '" preserveAspectRatio="none">' +
        rects +
        '</svg>',
    };
  }

  function mountFrameCorner(host, id, className, lines, teamName, unit, maxTotal, fromRight) {
    const built = frameCornerInner(lines, teamName, unit, maxTotal, fromRight);
    let el = document.getElementById(id);
    if (!built) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      host.appendChild(el);
    } else if (el.parentNode !== host) {
      host.appendChild(el);
    }
    el.className = className;
    el.title = built.title;
    if (el.getAttribute('data-html') !== built.svg) {
      el.innerHTML = built.svg;
      el.setAttribute('data-html', built.svg);
    }
  }

  function mountFrameCorners(stats, host) {
    const names = teamNames();
    const unit = stats.unit;
    const maxTotal = Math.max(frameLineTotal(stats.home.lines), frameLineTotal(stats.away.lines), 1);
    mountFrameCorner(host, 'tm-lv-corner-h', 'tm-lv-corner tm-lv-corner-h', stats.home.lines, names.home, unit, maxTotal, false);
    mountFrameCorner(host, 'tm-lv-corner-a', 'tm-lv-corner tm-lv-corner-a', stats.away.lines, names.away, unit, maxTotal, true);
  }

  /** 主教练所在标题行。没有则退回整块阵容，避免只露出球场、裁掉教练。 */
  function lineupPinAnchor() {
    const box = document.getElementById('matchBox2');
    const pitch = box && box.querySelector('.plays');
    const coach = document.querySelector(
      '#matchBox2 a.coach, .homeN a.coach, .guestN a.coach, #matchBox2 .coach'
    );
    const target = pitch || box;
    if (coach && target) {
      let row = coach;
      while (row.parentElement && row.parentElement !== document.body) {
        const parent = row.parentElement;
        const holdsPitch = parent.contains(target);
        const rowHoldsPitch = row.contains(target) || (pitch && pitch.contains(row));
        if (holdsPitch && !rowHoldsPitch) return row;
        row = parent;
      }
    }
    return box || pitch;
  }

  /** 把主教练标题连同首发图顶到 iframe 可视区。不隐藏其它区块。 */
  function pinPitchToTop() {
    if (!inFrame) return;
    const anchor = lineupPinAnchor();
    if (!anchor) return;
    const y = anchor.getBoundingClientRect().top;
    if (Math.abs(y) < 8) return;
    const root = document.documentElement;
    const prev = parseFloat(root.style.marginTop) || 0;
    root.style.marginTop = prev - y + 'px';
  }

  let pinTimerStarted = false;
  function schedulePinLineup() {
    pinPitchToTop();
    if (pinTimerStarted) return;
    pinTimerStarted = true;
    [400, 1200, 2500].forEach(function (ms) {
      window.setTimeout(pinPitchToTop, ms);
    });
  }

  function mountFrameStrip(stats) {
    const pitch = document.querySelector('#matchBox2 .plays');
    const host = pitch || document.getElementById('matchBox2');
    if (!host) return;
    const html = frameStripInnerHtml(stats);
    mountFrameCorners(stats, host);
    if (html === lastHtml && document.getElementById(PANEL_ID)) {
      schedulePinLineup();
      return;
    }

    refreshing = true;
    try {
      let panel = document.getElementById(PANEL_ID);
      if (!panel) {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
      }
      panel.className = 'tm-lv-frame';
      if (panel.parentNode !== host) host.appendChild(panel);
      panel.innerHTML = html;
      panel.style.display = 'flex';
      lastHtml = html;
      schedulePinLineup();
    } finally {
      refreshing = false;
    }
  }

  function mountPanel(stats) {
    if (inFrame) {
      mountFrameStrip(stats);
      return;
    }
    const bodyHtml = panelBodyHtml(stats);
    if (bodyHtml === lastHtml) return;

    refreshing = true;
    try {
      let panel = document.getElementById(PANEL_ID);
      const collapsed = panel
        ? panel.classList.contains('tm-lv-collapsed')
        : panelCollapsed;

      if (!panel) {
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = panelShellHtml(stats.unit);
        (document.body || document.documentElement).appendChild(panel);
        bindPanelToggle(panel);
        bindPanelModeChip(panel);
      } else if (panel.parentNode !== document.body && document.body) {
        document.body.appendChild(panel);
        bindPanelToggle(panel);
        bindPanelModeChip(panel);
      } else {
        const unitEl = panel.querySelector('.tm-lv-unit');
        if (unitEl) unitEl.textContent = '单位：' + formatUnitLabel(stats.unit);
        bindPanelModeChip(panel);
      }

      const body = panel.querySelector('.tm-lv-body');
      if (body) body.innerHTML = bodyHtml;

      setPanelCollapsed(panel, collapsed);
      updatePanelModeChip();
      panel.style.display = 'block';
      lastHtml = bodyHtml;
    } finally {
      refreshing = false;
    }
  }

  function hidePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';
    lastHtml = '';
    clearStarterMetrics();
  }

  function bindLineupObserver(box) {
    if (!box || (lineupObserver && observedBox === box)) return;

    if (lineupObserver) {
      lineupObserver.disconnect();
      lineupObserver = null;
    }

    observedBox = box;
    lineupObserver = new MutationObserver(function (records) {
      if (pitchSuppress || refreshing) return;
      let relevant = false;
      for (let i = 0; i < records.length; i++) {
        const t = records[i].target;
        if (!t) continue;
        if (t.id === PANEL_ID) continue;
        if (t.closest && t.closest('#' + PANEL_ID)) continue;
        if (isMetricMutation(records[i])) continue;
        relevant = true;
        break;
      }
      if (relevant) scheduleRefresh();
    });
    lineupObserver.observe(box, { childList: true, subtree: true });
  }

  function bindEventObserver() {
    const el = document.getElementById('teamEventDiv');
    if (!el || el.__tmLvEventWatch) return;
    el.__tmLvEventWatch = true;
    new MutationObserver(function () {
      if (refreshing) return;
      scheduleRefresh();
    }).observe(el, { childList: true, subtree: true });
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(function () {
      refreshTimer = null;
      refresh();
    }, 400);
  }

  function refresh() {
    try {
      const box = document.getElementById('matchBox2');
      capturePlayOrig(box);
      restoreOriginalLineup(box);
      stampCoachNewPage(document);
      const stats = computeStats();
      if (!stats) {
        hidePanel();
        placeSubsOnPitch(box);
        ensureNatToggle();
        ensurePitchSubsToggle();
        renderNationality(box);
        refreshGoalMarks(false);
        return;
      }

      mountPanel(stats);
      placeSubsOnPitch(box);
      renderStarterMetrics();
      ensureNatToggle();
      ensurePitchSubsToggle();
      renderNationality(document.getElementById('matchBox2'));
      refreshGoalMarks(false);
      annotateAllHoverAges(document.getElementById('matchBox2'));
      annotateSubOut(document.getElementById('matchBox2'));
      bindLineupObserver(document.getElementById('matchBox2'));
      bindEventObserver();
      refreshNationalClubMode();
    } catch (err) {
      console.warn('[Titan007 阵容身价统计]', err);
    }
  }

  function waitForLineup() {
    let tries = 0;
    const timer = window.setInterval(function () {
      tries += 1;
      const box = document.getElementById('matchBox2');
      if (box) {
        window.clearInterval(timer);
        refresh();
        bindLineupObserver(box);
      } else if (tries >= 20) {
        window.clearInterval(timer);
      }
    }, 1000);
  }

  function init() {
    metricModeKey = loadMetricModeKey();
    valueWithAge = loadValueWithAge();
    showNat = loadShowNat();
    showGoals = loadShowGoals();
    goalLeagueOnly = showGoals && loadGoalLeagueOnly();
    showPitchSubs = loadPitchSubs();
    if (isRememberedNational()) {
      nationalForced = true;
      nationalMatch = true;
    }
    bindCoachNewPage();
    if (!inFrame) {
      bindValuePanelHotkey();
      watchQuickCoachButton();
    }
    stampCoachNewPage(document);
    injectStyle();
    const legacy = document.getElementById('tm-lineup-value-inline');
    if (legacy) legacy.remove();
    refresh();
    waitForLineup();
    window.addEventListener('load', refresh, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
