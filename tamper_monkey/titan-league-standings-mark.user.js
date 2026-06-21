// ==UserScript==
// @name         Titan007 联赛积分榜主客队标记
// @namespace    https://titan007.com/
// @version      2.5.2
// @description  读取 Cookie 中 tm_home / tm_away / tabs，积分榜/亚让/大小球主客标记与盘路/大球统计标签；增强 Tab 对比图表；积分榜数据就绪后再 showHtml 切换 Tab。
// @match        https://zq.titan007.com/cn/SubLeague/*
// @match        http://zq.titan007.com/cn/SubLeague/*
// @match        https://zq.titan007.com/cn/subleague/*
// @match        http://zq.titan007.com/cn/subleague/*
// @match        https://zq.titan007.com/cn/League/*
// @match        http://zq.titan007.com/cn/League/*
// @match        https://zq.titan007.com/cn/league.aspx*
// @match        http://zq.titan007.com/cn/league.aspx*
// @match        https://zq.titan007.com/cn/cupmatch.aspx*
// @match        http://zq.titan007.com/cn/cupmatch.aspx*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'tm-league-standings-mark-style';
  const ATTR_DONE = 'data-tm-standings-marked';
  const GOALS_PANEL_ID = 'tm-goals-compare-panel';
  const GOALS_ATTR_DONE = 'data-tm-goals-charted';
  const GOAL_TIME_PANEL_ID = 'tm-goal-time-compare-panel';
  const GOAL_TIME_ATTR_DONE = 'data-tm-goal-time-charted';
  const HALF_FULL_PANEL_ID = 'tm-half-full-compare-panel';
  const HALF_FULL_ATTR_DONE = 'data-tm-half-full-charted';
  const GOAL_COUNT_PANEL_ID = 'tm-goal-count-compare-panel';
  const GOAL_COUNT_ATTR_DONE = 'data-tm-goal-count-charted';
  const NET_MARGIN_PANEL_ID = 'tm-net-margin-compare-panel';
  const NET_MARGIN_ATTR_DONE = 'data-tm-net-margin-charted';
  const AH_ATTR_DONE = 'data-tm-asian-handicap-marked';
  const OU_ATTR_DONE = 'data-tm-over-under-marked';
  const TEAM_LINK_SEL = 'a[href*="/team/Summary/"], a[href*="/team/summary/"]';
  const STANDINGS_MARK_COOKIE = 'tm_standings_mark';
  const STANDINGS_TABS_COOKIE = 'tm_standings_tabs';
  const STANDINGS_MARK_COOKIE_MAX_AGE = 300;
  const STANDINGS_TABS_COOKIE_MAX_AGE = 300;
  /** 胜 / 平 / 负：红 / 灰 / 绿 */
  const WDL_COLORS = { w: '#ff4d4f', d: '#e2e3e5', l: '#52c41a' };
  /** 入球时间：5 分钟档合并为 7 个时段 */
  const GOAL_TIME_BUCKETS = [
    { label: '0-15', cols: [1, 2, 3] },
    { label: '16-30', cols: [4, 5, 6] },
    { label: '31-45', cols: [7, 8, 9] },
    { label: '46-60', cols: [10, 11, 12] },
    { label: '61-75', cols: [13, 14, 15] },
    { label: '76-86', cols: [16, 17] },
    { label: '86', cols: [18] },
  ];
  /** 半/全场 9 档列名 */
  const HF_LABELS = ['胜胜', '胜平', '胜负', '平胜', '平平', '平负', '负胜', '负平', '负负'];
  /** 按终场结果分组：胜胜/平胜/负胜→全场胜，胜平/平平/负平→全场平，胜负/平负/负负→全场负 */
  const HF_FINAL_GROUPS = [
    {
      title: '全场胜',
      color: WDL_COLORS.w,
      items: [
        { label: '胜胜', color: '#ff4d4f' },
        { label: '平胜', color: '#ff7875' },
        { label: '负胜', color: '#ffa39e' },
      ],
    },
    {
      title: '全场平',
      color: WDL_COLORS.d,
      items: [
        { label: '胜平', color: '#cbd5e1' },
        { label: '平平', color: '#e2e3e5' },
        { label: '负平', color: '#94a3b8' },
      ],
    },
    {
      title: '全场负',
      color: WDL_COLORS.l,
      items: [
        { label: '胜负', color: '#95de64' },
        { label: '平负', color: '#52c41a' },
        { label: '负负', color: '#389e0d' },
      ],
    },
  ];
  /** 按半场结果分组：胜胜/胜平/胜负→半场胜，平平/平胜/平负→半场平，负负/负平/负胜→半场负 */
  const HF_HALFTIME_GROUPS = [
    {
      title: '半场胜',
      color: WDL_COLORS.w,
      items: [
        { label: '胜胜', color: '#ff4d4f' },
        { label: '胜平', color: '#ff7875' },
        { label: '胜负', color: '#ffa39e' },
      ],
    },
    {
      title: '半场平',
      color: WDL_COLORS.d,
      items: [
        { label: '平平', color: '#e2e3e5' },
        { label: '平胜', color: '#cbd5e1' },
        { label: '平负', color: '#94a3b8' },
      ],
    },
    {
      title: '半场负',
      color: WDL_COLORS.l,
      items: [
        { label: '负负', color: '#389e0d' },
        { label: '负平', color: '#52c41a' },
        { label: '负胜', color: '#95de64' },
      ],
    },
  ];
  const HF_BAR_MODES = {
    half: {
      key: 'half',
      label: '按半场',
      headTitle: '半/全场 · 按半场胜 平 负分组',
      footer: [
        { cls: 'tm-wdl-win', text: '半场胜：胜胜 · 胜平 · 胜负' },
        { cls: 'tm-wdl-draw', text: '半场平：平平 · 平胜 · 平负' },
        { cls: 'tm-wdl-loss', text: '半场负：负负 · 负平 · 负胜' },
      ],
      groups: HF_HALFTIME_GROUPS,
    },
    final: {
      key: 'final',
      label: '按全场',
      headTitle: '半/全场 · 按全场胜 平 负分组',
      footer: [
        { cls: 'tm-wdl-win', text: '全场胜：胜胜 · 平胜 · 负胜' },
        { cls: 'tm-wdl-draw', text: '全场平：胜平 · 平平 · 负平' },
        { cls: 'tm-wdl-loss', text: '全场负：胜负 · 平负 · 负负' },
      ],
      groups: HF_FINAL_GROUPS,
    },
  };
  const HF_BAR_MODE_ORDER = ['half', 'final'];
  let hfBarGroupMode = 'half';
  let hfBarCache = null;
  /** 净胜/负：7 档净胜球分布 */
  const NET_MARGIN_BUCKETS = [
    { key: 'w3', label: '净胜3+', short: '+3', title: '净胜3球以上', color: '#cf1322' },
    { key: 'w2', label: '净胜2', short: '+2', title: '净胜2球', color: '#ff4d4f' },
    { key: 'w1', label: '净胜1', short: '+1', title: '净胜1球', color: '#ff7875' },
    { key: 'd0', label: '平手', short: '平', title: '平手', color: '#e2e3e5' },
    { key: 'l1', label: '净负1', short: '-1', title: '净负1球', color: '#95de64' },
    { key: 'l2', label: '净负2', short: '-2', title: '净负2球', color: '#52c41a' },
    { key: 'l3', label: '净负3+', short: '-3', title: '净负3球以上', color: '#389e0d' },
  ];
  const NET_MARGIN_GROUP_DUELS = [
    { key: 'win', label: '净胜', pick: (s) => s.w3 + s.w2 + s.w1 },
    { key: 'draw', label: '平手', pick: (s) => s.d0 },
    { key: 'loss', label: '净负', pick: (s) => s.l1 + s.l2 + s.l3 },
  ];
  const GOAL_COUNT_BUCKETS = [
    { key: 'first', label: '上半进球', hint: '上半场进球较多', color: '#597ef7' },
    { key: 'same', label: '一样进球', hint: '上下半场进球相同', color: '#bfbfbf' },
    { key: 'second', label: '下半进球', hint: '下半场进球较多', color: '#ff7a45' },
  ];
  /** 亚让 Tab：全场盘路统计 → 主表球队标签 */
  const AH_ROUTE_TAGS = [
    { key: 'avoid', short: '避投', title: '避免投注球队', className: 'tm-ah-tag-avoid' },
    { key: 'homeBest', short: '主佳', title: '主场最佳球队', className: 'tm-ah-tag-home-best' },
    { key: 'homeAvoid', short: '主避', title: '主场避免球队', className: 'tm-ah-tag-home-avoid' },
    { key: 'awayBest', short: '客佳', title: '客场最佳球队', className: 'tm-ah-tag-away-best' },
  ];
  /** 大小球 Tab：全场盘路统计 → 主表球队标签 */
  const OU_ROUTE_TAGS = [
    { key: 'overMost', short: '大多', title: '大球最多球队', className: 'tm-ou-tag-over-most' },
    { key: 'homeOverMost', short: '主多', title: '主场大球最多球队', className: 'tm-ou-tag-home-over' },
    { key: 'awayOverMost', short: '客多', title: '客场大球最多球队', className: 'tm-ou-tag-away-over' },
  ];
  const TM_TAB_MARKS = [
    { liId: 'li6', text: '入球数', level: 1, showIdx: 6 },
    { liId: 'li8', text: '入球时间', level: 2, showIdx: 8 },
    { liId: 'li11', text: '入/失球', level: 3, showIdx: 11 },
    { liId: 'li10', text: '净胜/负', level: 4, showIdx: 10 },
    { liId: 'li7', text: '半/全场', level: 5, showIdx: 7 },
  ];
  const STATS_TAB_SHOW_INDEX = {
    积分榜: 1,
    亚让: 2,
    大小球: 3,
    常见赛果: 4,
    单双数: 5,
    入球数: 6,
    '半/全场': 7,
    入球时间: 8,
    波胆: 9,
    '净胜/负': 10,
    '入/失球': 11,
  };
  let standingsTabEnsured = false;
  let statsTabFromUrlEnsured = false;
  let pendingStatsTab = '';
  let pendingTabSwitchStarted = false;
  const PENDING_TAB_POLL_MS = 800;
  const PENDING_TAB_MAX_ATTEMPTS = 90;

  function normalizeRequestedStatsTab(tab) {
    const t = String(tab || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .trim();
    if (!t) return '';
    const aliases = {
      进球时间: '入球时间',
      进球数: '入球数',
      进失球: '入/失球',
      入失球: '入/失球',
      半全场: '半/全场',
      半场全场: '半/全场',
      净胜负: '净胜/负',
      亚让球: '亚让',
      让球: '亚让',
      大小: '大小球',
    };
    return aliases[t] || t;
  }

  function readStandingsTabsCookie() {
    const re = new RegExp(`(?:^|;\\s*)${STANDINGS_TABS_COOKIE}=([^;]*)`);
    const m = document.cookie.match(re);
    if (!m) return null;
    try {
      return JSON.parse(decodeURIComponent(m[1]));
    } catch (_) {
      return null;
    }
  }

  function clearStandingsTabsCookie() {
    document.cookie = `${STANDINGS_TABS_COOKIE}=; path=/; domain=.titan007.com; max-age=0; SameSite=Lax`;
  }

  function clearLegacyStatsTabFromMarkCookie() {
    const stored = readStandingsMarkCookie();
    if (!stored || !stored.tabs) return;
    delete stored.tabs;
    const val = encodeURIComponent(JSON.stringify(stored));
    document.cookie = `${STANDINGS_MARK_COOKIE}=${val}; path=/; domain=.titan007.com; max-age=${STANDINGS_MARK_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  function readPendingStatsTabFromCookie() {
    const pageSid = getPageSclassId();
    const stored = readStandingsTabsCookie();
    if (stored?.tabs) {
      const storedSid = String(stored.sclassid || '').trim();
      const sidOk = !storedSid || !pageSid || storedSid === pageSid;
      if (sidOk) return normalizeRequestedStatsTab(String(stored.tabs));
    }

    const legacy = readStandingsMarkCookie();
    if (legacy?.tabs) {
      const storedSid = String(legacy.sclassid || '').trim();
      const sidOk = !storedSid || !pageSid || storedSid === pageSid;
      if (sidOk) return normalizeRequestedStatsTab(String(legacy.tabs));
    }
    return '';
  }

  function initPendingStatsTab() {
    if (pendingStatsTab) return pendingStatsTab;
    pendingStatsTab = readPendingStatsTabFromCookie();
    if (pendingStatsTab) {
      clearStandingsTabsCookie();
      clearLegacyStatsTabFromMarkCookie();
    }
    return pendingStatsTab;
  }

  function getRequestedStatsTab() {
    return pendingStatsTab;
  }

  function resolveStatsTabShowIndex(label) {
    const t = normalizeRequestedStatsTab(label);
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(STATS_TAB_SHOW_INDEX, t)) {
      return STATS_TAB_SHOW_INDEX[t];
    }
    for (const entry of TM_TAB_MARKS) {
      if (norm(entry.text) === norm(t)) return entry.showIdx;
    }
    return null;
  }

  function isStandingsBootstrapDone() {
    return typeof window.totalScore !== 'undefined';
  }

  function isRequestedStatsTabActive(requested) {
    const idx = resolveStatsTabShowIndex(requested);
    if (idx == null) return false;
    return !!document.getElementById(`li${idx}`)?.classList.contains('nav_on');
  }

  function refreshChartsForActiveTab() {
    applyGoalsCharts();
    applyGoalTimeCharts();
    applyHalfFullCharts();
    applyGoalCountCharts();
    applyNetMarginCharts();
    applyAsianHandicapMarks();
    applyOverUnderMarks();
    applyMarks();
  }

  function markPendingStatsTabDone() {
    statsTabFromUrlEnsured = true;
    pendingStatsTab = '';
    window.setTimeout(refreshChartsForActiveTab, 150);
    window.setTimeout(refreshChartsForActiveTab, 600);
  }

  /** 等积分榜 totalScore 就绪后再 showHtml；加载期间不碰 Tab */
  function startPendingTabAutoSwitch() {
    if (pendingTabSwitchStarted) return;
    const targetTab = initPendingStatsTab();
    if (!targetTab) return;

    const idx = resolveStatsTabShowIndex(targetTab);
    if (idx == null) {
      pendingStatsTab = '';
      return;
    }

    pendingTabSwitchStarted = true;
    let attempts = 0;

    const timer = window.setInterval(() => {
      attempts += 1;
      if (statsTabFromUrlEnsured || !pendingStatsTab) {
        window.clearInterval(timer);
        return;
      }
      if (attempts > PENDING_TAB_MAX_ATTEMPTS) {
        window.clearInterval(timer);
        pendingStatsTab = '';
        statsTabFromUrlEnsured = true;
        return;
      }
      if (!isStandingsBootstrapDone()) return;
      if (typeof window.showHtml !== 'function') return;

      if (isRequestedStatsTabActive(targetTab)) {
        window.clearInterval(timer);
        markPendingStatsTabDone();
        return;
      }

      try {
        window.showHtml(idx);
      } catch (_) {
        /* 下一轮重试 */
      }
    }, PENDING_TAB_POLL_MS);
  }

  function findStatsTabLiByLabel(label) {
    const target = norm(label);
    if (!target) return null;

    for (const entry of TM_TAB_MARKS) {
      if (norm(entry.text) === target) return findStatsTabLi(entry);
    }

    const knownTabs = ['积分榜', '亚让', '大小球'];
    for (const text of knownTabs) {
      if (norm(text) !== target) continue;
      const bar = findStatsTabBar();
      if (!bar) return null;
      for (const li of bar.querySelectorAll('li')) {
        if (tabLabelText(li) === target) return li;
      }
    }

    const bar = findStatsTabBar();
    if (!bar) return null;
    for (const li of bar.querySelectorAll('li')) {
      const tabText = tabLabelText(li);
      if (tabText === target || tabText.includes(target) || target.includes(tabText)) return li;
    }
    return null;
  }

  function readStandingsMarkCookie() {
    const re = new RegExp(`(?:^|;\\s*)${STANDINGS_MARK_COOKIE}=([^;]*)`);
    const m = document.cookie.match(re);
    if (!m) return null;
    try {
      return JSON.parse(decodeURIComponent(m[1]));
    } catch (_) {
      return null;
    }
  }

  function getPageSclassId() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get('sclassid') || params.get('SclassID') || '').trim();
    if (fromQuery) return fromQuery;
    const m = window.location.pathname.match(/\/(?:SubLeague|subleague|League)\/(\d+)\.html/i);
    return m ? m[1] : '';
  }

  function loadMarkFromHash() {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return null;
    try {
      const p = new URLSearchParams(raw);
      return {
        homeName: (p.get('tm_home') || '').trim(),
        awayName: (p.get('tm_away') || '').trim(),
        homeId: (p.get('tm_home_id') || '').trim(),
        awayId: (p.get('tm_away_id') || '').trim(),
      };
    } catch (_) {
      return null;
    }
  }

  function applyMarkFields(target, source) {
    if (!source) return;
    if (!target.cfgHomeName && source.homeName) target.cfgHomeName = source.homeName;
    if (!target.cfgAwayName && source.awayName) target.cfgAwayName = source.awayName;
    if (!target.cfgHomeId && source.homeId) target.cfgHomeId = source.homeId;
    if (!target.cfgAwayId && source.awayId) target.cfgAwayId = source.awayId;
  }

  function loadMarkConfig() {
    const params = new URLSearchParams(window.location.search);
    const pageSid = getPageSclassId();
    const cfg = {
      cfgHomeName: (params.get('tm_home') || '').trim(),
      cfgAwayName: (params.get('tm_away') || '').trim(),
      cfgHomeId: (params.get('tm_home_id') || '').trim(),
      cfgAwayId: (params.get('tm_away_id') || '').trim(),
    };

    applyMarkFields(cfg, loadMarkFromHash());

    const stored = readStandingsMarkCookie();
    if (stored) {
      const storedSid = String(stored.sclassid || '').trim();
      const sidOk = !storedSid || !pageSid || storedSid === pageSid;
      if (sidOk) {
        applyMarkFields(cfg, {
          homeName: String(stored.tm_home || '').trim(),
          awayName: String(stored.tm_away || '').trim(),
          homeId: String(stored.tm_home_id || '').trim(),
          awayId: String(stored.tm_away_id || '').trim(),
        });
      }
    }

    return cfg;
  }

  const { cfgHomeName, cfgAwayName, cfgHomeId, cfgAwayId } = loadMarkConfig();

  if (!cfgHomeName && !cfgAwayName && !cfgHomeId && !cfgAwayId) return;

  function ensureStandingsTabActiveOnce() {
    if (standingsTabEnsured) return;
    standingsTabEnsured = true;
    const candidates = document.querySelectorAll('a, li, span, label, div');
    for (const el of candidates) {
      const t = (el.textContent || '').replace(/\s+/g, '').trim();
      if (t !== '积分榜') continue;
      if (el.closest('#menu, .navigationMenu, .sitenav')) continue;
      try {
        el.click();
      } catch (_) {
        /* noop */
      }
      return;
    }
  }

  function findStatsTabBar() {
    return document.querySelector('#info .odds_com, .odds_com');
  }

  function findStatsTabLi(entry) {
    if (entry.liId) {
      const byId = document.getElementById(entry.liId);
      if (byId) return byId;
    }
    const bar = findStatsTabBar();
    if (!bar) return null;
    const target = norm(entry.text);
    for (const li of bar.querySelectorAll('li')) {
      if (tabLabelText(li) === target) return li;
    }
    return null;
  }

  function tabLabelText(li) {
    const a = li?.querySelector('a');
    if (!a) return norm(li?.textContent);
    const clone = a.cloneNode(true);
    clone.querySelectorAll('.tm-tab-mark-num').forEach((n) => n.remove());
    return norm(clone.textContent);
  }

  function statsTabLiFromEvent(ev) {
    return ev.target?.closest?.('.odds_com li') || null;
  }

  function applyTabMarks() {
    for (const entry of TM_TAB_MARKS) {
      const li = findStatsTabLi(entry);
      if (!li) continue;
      li.classList.add('tm-tab-mark', `tm-tab-mark-${entry.level}`);
      li.setAttribute('data-tm-tab-mark', String(entry.level));
      [1, 2, 3, 4, 5].forEach((lv) => {
        if (lv !== entry.level) li.classList.remove(`tm-tab-mark-${lv}`);
      });
      const a = li.querySelector('a');
      if (!a) continue;
      let badge = a.querySelector('.tm-tab-mark-num');
      if (!badge) {
        badge = document.createElement('sup');
        badge.className = 'tm-tab-mark-num';
        badge.setAttribute('aria-hidden', 'true');
        a.appendChild(badge);
      }
      badge.textContent = String(entry.level);
    }
  }

  /** 将 5 个增强 Tab 按标记序号 ①→⑤ 在 Tab 栏中连续排列 */
  function reorderStatsTabs() {
    const bar = findStatsTabBar();
    if (!bar) return false;

    const byLevel = [...TM_TAB_MARKS].sort((a, b) => a.level - b.level);
    const ordered = [];
    for (const entry of byLevel) {
      const li = findStatsTabLi(entry);
      if (!li || li.parentElement !== bar) return false;
      ordered.push(li);
    }
    if (ordered.length !== TM_TAB_MARKS.length) return false;

    const enhancedIds = new Set(ordered.map((li) => li.id));
    const allLis = [...bar.querySelectorAll(':scope > li')];
    const enhancedInDom = allLis.filter((li) => enhancedIds.has(li.id));
    const desiredKey = ordered.map((li) => li.id).join('|');
    const currentKey = enhancedInDom.map((li) => li.id).join('|');
    if (desiredKey === currentKey) {
      bar.setAttribute('data-tm-tabs-reordered', '1');
      return true;
    }

    const firstIdx = Math.min(...ordered.map((li) => allLis.indexOf(li)).filter((i) => i >= 0));
    const anchor = firstIdx > 0 ? allLis[firstIdx - 1] : null;
    const fragment = document.createDocumentFragment();
    ordered.forEach((li) => fragment.appendChild(li));

    if (anchor) {
      anchor.parentNode.insertBefore(fragment, anchor.nextSibling);
    } else {
      bar.insertBefore(fragment, bar.firstChild);
    }

    bar.setAttribute('data-tm-tabs-reordered', '1');
    return true;
  }

  function isStatsTabNavOn(liId) {
    const li = document.getElementById(liId);
    return !!(li && li.classList.contains('nav_on'));
  }

  function isGoalsTabActive() {
    return isStatsTabNavOn('li11');
  }

  function isGoalTimeTabActive() {
    return isStatsTabNavOn('li8');
  }

  function isHalfFullTabActive() {
    return isStatsTabNavOn('li7');
  }

  function isGoalCountTabActive() {
    return isStatsTabNavOn('li6');
  }

  function isNetMarginTabActive() {
    return isStatsTabNavOn('li10');
  }

  function isStandingsTabActive() {
    return isStatsTabNavOn('li1');
  }

  function isAsianHandicapTabActive() {
    return isStatsTabNavOn('li2');
  }

  function isOverUnderTabActive() {
    return isStatsTabNavOn('li3');
  }

  function isEnhancedStatsTabActive() {
    return isGoalsTabActive() || isGoalTimeTabActive() || isHalfFullTabActive() || isGoalCountTabActive() || isNetMarginTabActive();
  }

  function findGoalsTable() {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      if (table.closest('header') || table.closest('nav')) continue;
      const headerText = norm(table.textContent);
      if (!headerText.includes('先入球') || !headerText.includes('先失球')) continue;
      const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.querySelectorAll(TEAM_LINK_SEL).length === 1);
      if (rows.length >= 3) return table;
    }
    return null;
  }

  function parseGoalsInt(td) {
    const t = (td?.textContent || '').replace(/\u00a0/g, ' ').trim();
    const m = t.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  function goalsWdlFromRow(tr) {
    const n = tr.cells.length;
    if (n < 7) return null;
    return {
      scoredFirst: {
        w: parseGoalsInt(tr.cells[1]),
        d: parseGoalsInt(tr.cells[2]),
        l: parseGoalsInt(tr.cells[3]),
      },
      concededFirst: {
        w: parseGoalsInt(tr.cells[4]),
        d: parseGoalsInt(tr.cells[5]),
        l: parseGoalsInt(tr.cells[6]),
      },
    };
  }

  function goalsWdlTotal(stats) {
    return stats.w + stats.d + stats.l;
  }

  function goalsWinRate(stats) {
    const total = goalsWdlTotal(stats);
    return total ? stats.w / total : 0;
  }

  function pctText(rate) {
    return `${Math.round(rate * 100)}%`;
  }

  function donutPoint(cx, cy, r, degFromTop) {
    const rad = ((degFromTop - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function donutArcPath(cx, cy, r, startDeg, endDeg) {
    const start = donutPoint(cx, cy, r, startDeg);
    const end = donutPoint(cx, cy, r, endDeg);
    const delta = endDeg - startDeg;
    const large = Math.abs(delta) > 180 ? 1 : 0;
    const sweep = delta > 0 ? 1 : 0;
    return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${r} ${r} 0 ${large} ${sweep} ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
  }

  /** SVG arc cannot span 360° (start === end); use a stroked circle instead. */
  function donutRingSegment(cx, cy, r, stroke, startDeg, sweepDeg, color) {
    if (Math.abs(sweepDeg) >= 359.999) {
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" />`;
    }
    const endDeg = startDeg - sweepDeg;
    const d = donutArcPath(cx, cy, r, startDeg, endDeg);
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="butt" />`;
  }

  function buildDonutSvg(stats, opts) {
    const size = opts.size || 100;
    const stroke = 12;
    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const total = goalsWdlTotal(stats);
    const segs = [
      { v: stats.w, c: WDL_COLORS.w, cls: 'tm-wdl-win', label: '胜' },
      { v: stats.d, c: WDL_COLORS.d, cls: 'tm-wdl-draw', label: '平' },
      { v: stats.l, c: WDL_COLORS.l, cls: 'tm-wdl-loss', label: '负' },
    ].filter((s) => s.v > 0);

    let arcs = '';
    if (!total) {
      arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${stroke}" />`;
    } else {
      let cursor = 0;
      arcs = segs
        .map((s) => {
          const sweep = (s.v / total) * 360;
          const el = donutRingSegment(cx, cy, r, stroke, cursor, sweep, s.c);
          cursor -= sweep;
          return el;
        })
        .join('');
    }

    const centerMain = opts.centerMain || (total ? pctText(goalsWinRate(stats)) : '—');
    const centerSub = opts.centerSub || '胜率';
    const legend = segs
      .map((s) => `<span class="tm-goals-legend-item"><i class="${s.cls}"></i>${s.label} ${s.v}</span>`)
      .join('');

    return `
      <div class="tm-goals-donut-block">
        <div class="tm-goals-donut-wrap">
          <svg class="tm-goals-donut-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
            ${arcs}
          </svg>
          <div class="tm-goals-donut-center">
            <strong>${centerMain}</strong>
            <span>${centerSub}</span>
          </div>
        </div>
        <div class="tm-goals-legend">${legend || '<span class="tm-goals-legend-empty">—</span>'}</div>
      </div>
    `;
  }

  function segmentTotal(segments) {
    return segments.reduce((s, seg) => s + (seg.v || 0), 0);
  }

  function buildSegmentsDonut(segments, opts) {
    const size = opts.size || 100;
    const stroke = 12;
    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const total = segmentTotal(segments);
    const segs = segments.filter((s) => s.v > 0);

    let arcs = '';
    if (!total) {
      arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${stroke}" />`;
    } else {
      let cursor = 0;
      arcs = segs
        .map((s) => {
          const sweep = (s.v / total) * 360;
          const el = donutRingSegment(cx, cy, r, stroke, cursor, sweep, s.c);
          cursor -= sweep;
          return el;
        })
        .join('');
    }

    const centerMain = opts.centerMain || (total ? String(total) : '—');
    const centerSub = opts.centerSub || '场';
    const legend = segments
      .map((s) => `<span class="tm-goals-legend-item"><i style="background:${s.c}"></i>${s.label} ${s.v}</span>`)
      .join('');

    return `
      <div class="tm-goals-donut-block">
        <div class="tm-goals-donut-wrap">
          <svg class="tm-goals-donut-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
            ${arcs}
          </svg>
          <div class="tm-goals-donut-center">
            <strong>${centerMain}</strong>
            <span>${centerSub}</span>
          </div>
        </div>
        <div class="tm-goals-legend">${legend || '<span class="tm-goals-legend-empty">—</span>'}</div>
      </div>
    `;
  }

  function buildCompareDuel(label, homeRate, awayRate) {
    const homePct = Math.round(homeRate * 100);
    const awayPct = Math.round(awayRate * 100);
    const maxPct = Math.max(homePct, awayPct, 1);
    const homeLead = homeRate > awayRate;
    const awayLead = awayRate > homeRate;
    return `
      <div class="tm-duel">
        <div class="tm-duel-values">
          <span class="tm-duel-val tm-duel-val-home${homeLead ? ' tm-duel-lead' : ''}">${homePct}%</span>
          <span class="tm-duel-label">${label}</span>
          <span class="tm-duel-val tm-duel-val-away${awayLead ? ' tm-duel-lead' : ''}">${awayPct}%</span>
        </div>
        <div class="tm-duel-track" aria-hidden="true">
          <div class="tm-duel-half tm-duel-half-home"><i style="width:${(homePct / maxPct) * 100}%"></i></div>
          <div class="tm-duel-axis"></div>
          <div class="tm-duel-half tm-duel-half-away"><i style="width:${(awayPct / maxPct) * 100}%"></i></div>
        </div>
      </div>
    `;
  }

  function buildGoalsSection(title, homeStats, awayStats, centerSub) {
    return `
      <section class="tm-goals-section">
        <div class="tm-goals-section-head">${title}</div>
        <div class="tm-goals-section-grid">
          <div class="tm-goals-side tm-goals-side-home">
            ${buildDonutSvg(homeStats, { centerSub })}
            <div class="tm-goals-side-meta">${goalsWdlTotal(homeStats)} 场</div>
          </div>
          <div class="tm-goals-duel-wrap">
            ${buildCompareDuel('胜率', goalsWinRate(homeStats), goalsWinRate(awayStats))}
          </div>
          <div class="tm-goals-side tm-goals-side-away">
            ${buildDonutSvg(awayStats, { centerSub })}
            <div class="tm-goals-side-meta">${goalsWdlTotal(awayStats)} 场</div>
          </div>
        </div>
      </section>
    `;
  }

  function removeGoalsPanel() {
    document.getElementById(GOALS_PANEL_ID)?.remove();
    const table = findGoalsTable();
    if (table) table.removeAttribute(GOALS_ATTR_DONE);
  }

  function renderGoalsComparePanel(homeName, awayName, homeStats, awayStats) {
    const homeSf = homeStats.scoredFirst;
    const homeCf = homeStats.concededFirst;
    const awaySf = awayStats.scoredFirst;
    const awayCf = awayStats.concededFirst;

    const panel = document.createElement('div');
    panel.id = GOALS_PANEL_ID;
    panel.className = 'tm-goals-compare-panel';
    panel.innerHTML = `
      <header class="tm-goals-panel-head">
        <div class="tm-goals-panel-team tm-goals-panel-home">
          <span class="tm-goals-side-tag">主</span>
          <strong>${homeName}</strong>
        </div>
        <div class="tm-goals-panel-title">先入 / 失球 · 胜平负分布</div>
        <div class="tm-goals-panel-team tm-goals-panel-away">
          <strong>${awayName}</strong>
          <span class="tm-goals-side-tag">客</span>
        </div>
      </header>
      ${buildGoalsSection('先入球', homeSf, awaySf, '先入胜率')}
      ${buildGoalsSection('先失球', homeCf, awayCf, '逆转胜率')}
      <footer class="tm-goals-panel-foot">
        <span class="tm-wdl-key"><i class="tm-wdl-win"></i>胜</span>
        <span class="tm-wdl-key"><i class="tm-wdl-draw"></i>平</span>
        <span class="tm-wdl-key"><i class="tm-wdl-loss"></i>负</span>
      </footer>
    `;
    return panel;
  }

  function markStatsTeamRow(tr, side) {
    const td = tr.cells[0];
    if (!td) return;
    if (side === 'home') {
      td.classList.add('tm-league-band-home', 'tm-league-band-edge-home');
    } else {
      td.classList.add('tm-league-band-away', 'tm-league-band-edge-away');
    }
  }

  function markGoalsRow(tr) {
    const n = tr.cells.length;
    if (!n) return;
    for (let i = 0; i < n; i += 1) {
      const td = tr.cells[i];
      td.classList.add('tm-league-band-home');
      if (i === 0) td.classList.add('tm-league-band-edge-home');
    }
  }

  function markGoalsRowAway(tr) {
    const n = tr.cells.length;
    if (!n) return;
    for (let i = 0; i < n; i += 1) {
      const td = tr.cells[i];
      td.classList.add('tm-league-band-away');
      if (i === 0) td.classList.add('tm-league-band-edge-away');
    }
  }

  function applyGoalsCharts() {
    if (!isGoalsTabActive()) {
      removeGoalsPanel();
      return false;
    }

    const table = findGoalsTable();
    if (!table) return false;
    if (table.getAttribute(GOALS_ATTR_DONE) === '1' && document.getElementById(GOALS_PANEL_ID)) return true;

    clearMarks(table);
    let homeRow = null;
    let awayRow = null;
    let homeName = cfgHomeName;
    let awayName = cfgAwayName;
    let homeStats = null;
    let awayStats = null;

    for (const tr of table.querySelectorAll('tr')) {
      const links = tr.querySelectorAll(TEAM_LINK_SEL);
      if (links.length !== 1) continue;
      const link = links[0];
      const stats = goalsWdlFromRow(tr);
      if (!stats) continue;
      if (matchSide(link, cfgHomeName, cfgHomeId)) {
        homeRow = tr;
        homeName = linkDisplayName(link) || cfgHomeName;
        homeStats = stats;
        markGoalsRow(tr);
      }
      if (matchSide(link, cfgAwayName, cfgAwayId)) {
        awayRow = tr;
        awayName = linkDisplayName(link) || cfgAwayName;
        awayStats = stats;
        markGoalsRowAway(tr);
      }
    }

    if (!homeStats || !awayStats) {
      removeGoalsPanel();
      return false;
    }

    const host = document.getElementById('tableId') || table.parentElement || document.body;
    let panel = document.getElementById(GOALS_PANEL_ID);
    const nextPanel = renderGoalsComparePanel(homeName, awayName, homeStats, awayStats);
    if (panel) {
      panel.replaceWith(nextPanel);
    } else if (table.parentElement) {
      table.parentElement.insertBefore(nextPanel, table);
    } else {
      host.insertBefore(nextPanel, host.firstChild);
    }

    table.setAttribute(GOALS_ATTR_DONE, '1');
    return true;
  }

  function findGoalTimeTable() {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      if (table.closest('header') || table.closest('nav')) continue;
      const headerText = norm(table.textContent);
      if (!headerText.includes('1-5') || !headerText.includes('86-90')) continue;
      const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.querySelectorAll(TEAM_LINK_SEL).length === 1);
      if (rows.length >= 3) return table;
    }
    return null;
  }

  function parseGoalTimeInt(td) {
    const t = (td?.textContent || '').replace(/\u00a0/g, ' ').trim();
    const m = t.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  function goalTimeBucketsFromRow(tr) {
    if (tr.cells.length < 19) return null;
    return GOAL_TIME_BUCKETS.map((bucket) => ({
      label: bucket.label,
      value: bucket.cols.reduce((sum, colIdx) => sum + parseGoalTimeInt(tr.cells[colIdx]), 0),
    }));
  }

  function removeGoalTimePanel() {
    document.getElementById(GOAL_TIME_PANEL_ID)?.remove();
    const table = findGoalTimeTable();
    if (table) table.removeAttribute(GOAL_TIME_ATTR_DONE);
  }

  function removeAllComparePanels() {
    removeGoalsPanel();
    removeGoalTimePanel();
    removeHalfFullPanel();
    removeGoalCountPanel();
    removeNetMarginPanel();
  }

  const GOAL_TIME_X_TICKS = ["0'", "15'", "30'", 'HT', "60'", "75'", "86'", 'FT'];
  const GOAL_TIME_SVG = { w: 300, h: 172, ml: 34, mr: 6, mt: 16, mb: 28, gap: 2, rx: 2 };

  function goalTimeScaleMax(raw) {
    const v = Math.max(raw, 1);
    if (v <= 6) return 6;
    if (v <= 10) return 10;
    if (v <= 15) return 15;
    if (v <= 20) return 20;
    return Math.ceil(v / 5) * 5;
  }

  function goalTimeYTickValues(scaleMax) {
    const step = scaleMax <= 6 ? 2 : scaleMax <= 10 ? 2 : scaleMax <= 15 ? 3 : 5;
    const ticks = [];
    for (let v = 0; v <= scaleMax; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== scaleMax) ticks.push(scaleMax);
    return ticks;
  }

  function goalTimeTeamMax(buckets) {
    return Math.max(...buckets.map((b) => b.value), 1);
  }

  function goalTimeBarColor(value, teamMax, side) {
    if (!value) return 'none';
    const t = teamMax ? value / teamMax : 0;
    if (side === 'home') {
      if (t >= 0.66) return '#389e0d';
      if (t >= 0.33) return '#52c41a';
      return '#95de64';
    }
    if (t >= 0.66) return '#0958d9';
    if (t >= 0.33) return '#4096ff';
    return '#69b1ff';
  }

  function buildGoalTimeSvg(buckets, scaleMax, teamMax, side) {
    const { w, h, ml, mr, mt, mb, gap, rx } = GOAL_TIME_SVG;
    const pw = w - ml - mr;
    const ph = h - mt - mb;
    const baseY = mt + ph;
    const n = buckets.length;
    const barW = (pw - gap * (n - 1)) / n;
    const slot = barW + gap;
    const parts = [];

    parts.push(`<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="#fafbfc" rx="4"/>`);

    goalTimeYTickValues(scaleMax).forEach((v) => {
      const y = baseY - (v / scaleMax) * ph;
      parts.push(
        `<line x1="${ml}" y1="${y.toFixed(1)}" x2="${(ml + pw).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#eef2f6" stroke-width="1"/>`
      );
      parts.push(
        `<text x="${ml - 6}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#64748b" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">${v}</text>`
      );
    });

    parts.push(`<line x1="${ml}" y1="${baseY}" x2="${ml + pw}" y2="${baseY}" stroke="#cbd5e1" stroke-width="1"/>`);
    parts.push(`<line x1="${ml}" y1="${mt}" x2="${ml}" y2="${baseY}" stroke="#cbd5e1" stroke-width="1"/>`);

    buckets.forEach((b, i) => {
      const bh = scaleMax ? (b.value / scaleMax) * ph : 0;
      const x = ml + i * slot;
      const y = baseY - bh;
      if (b.value > 0) {
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" rx="${rx}" ry="${rx}" fill="${goalTimeBarColor(b.value, teamMax, side)}"><title>${b.label} · ${b.value} 球</title></rect>`
        );
        parts.push(
          `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#334155" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">${b.value}</text>`
        );
      }
    });

    GOAL_TIME_X_TICKS.forEach((label, i) => {
      const x = ml + i * slot;
      const mark = label === 'HT' || label === 'FT';
      parts.push(
        `<text x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle" font-size="9" font-weight="${mark ? 700 : 500}" fill="${mark ? '#ff4d4f' : '#64748b'}" font-family="system-ui,sans-serif">${label}</text>`
      );
    });

    return `<svg class="tm-gtime-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="入球时间分布"><g>${parts.join('')}</g></svg>`;
  }

  function buildGoalTimeCard(buckets, scaleMax, teamMax, side, teamName, tag, total) {
    const cls = side === 'home' ? 'tm-gtime-card-home' : 'tm-gtime-card-away';
    return `
      <div class="tm-gtime-card ${cls}">
        <div class="tm-gtime-card-head">
          <span class="tm-goals-side-tag">${tag}</span>
          <strong>${teamName}</strong>
          <span class="tm-gtime-card-total">${total} 球</span>
        </div>
        <div class="tm-gtime-chart-label">入球</div>
        ${buildGoalTimeSvg(buckets, scaleMax, teamMax, side)}
      </div>
    `;
  }

  function renderGoalTimePanel(homeName, awayName, homeBuckets, awayBuckets) {
    const rawMax = Math.max(
      ...homeBuckets.map((b) => b.value),
      ...awayBuckets.map((b) => b.value),
      1
    );
    const scaleMax = goalTimeScaleMax(rawMax);
    const homeTeamMax = goalTimeTeamMax(homeBuckets);
    const awayTeamMax = goalTimeTeamMax(awayBuckets);
    const totalHome = homeBuckets.reduce((s, b) => s + b.value, 0);
    const totalAway = awayBuckets.reduce((s, b) => s + b.value, 0);

    const panel = document.createElement('div');
    panel.id = GOAL_TIME_PANEL_ID;
    panel.className = 'tm-gtime-compare-panel';
    panel.innerHTML = `
      <header class="tm-gtime-panel-head">
        <span class="tm-gtime-head-title">入球时间 · 分时段分布</span>
        <span class="tm-gtime-scale-hint">统一 Y 轴 0–${scaleMax} · 柱色深浅按队内时段相对多少</span>
      </header>
      <div class="tm-gtime-split">
        ${buildGoalTimeCard(homeBuckets, scaleMax, homeTeamMax, 'home', homeName, '主', totalHome)}
        ${buildGoalTimeCard(awayBuckets, scaleMax, awayTeamMax, 'away', awayName, '客', totalAway)}
      </div>
      <footer class="tm-gtime-foot">
        <span class="tm-gtime-foot-item"><i class="tm-gtime-dot tm-gtime-dot-home"></i>主 · 绿</span>
        <span class="tm-gtime-foot-item"><i class="tm-gtime-dot tm-gtime-dot-away"></i>客 · 蓝</span>
        <span class="tm-gtime-foot-note">HT / FT 中场 · 终场</span>
      </footer>
    `;
    return panel;
  }

  function applyGoalTimeCharts() {
    if (!isGoalTimeTabActive()) {
      removeGoalTimePanel();
      return false;
    }

    const table = findGoalTimeTable();
    if (!table) return false;
    if (table.getAttribute(GOAL_TIME_ATTR_DONE) === '1' && document.getElementById(GOAL_TIME_PANEL_ID)) return true;

    clearMarks(table);
    let homeRow = null;
    let awayRow = null;
    let homeName = cfgHomeName;
    let awayName = cfgAwayName;
    let homeBuckets = null;
    let awayBuckets = null;

    for (const tr of table.querySelectorAll('tr')) {
      const links = tr.querySelectorAll(TEAM_LINK_SEL);
      if (links.length !== 1) continue;
      const link = links[0];
      const buckets = goalTimeBucketsFromRow(tr);
      if (!buckets) continue;
      if (matchSide(link, cfgHomeName, cfgHomeId)) {
        homeRow = tr;
        homeName = linkDisplayName(link) || cfgHomeName;
        homeBuckets = buckets;
        markGoalsRow(tr);
      }
      if (matchSide(link, cfgAwayName, cfgAwayId)) {
        awayRow = tr;
        awayName = linkDisplayName(link) || cfgAwayName;
        awayBuckets = buckets;
        markGoalsRowAway(tr);
      }
    }

    if (!homeBuckets || !awayBuckets) {
      removeGoalTimePanel();
      return false;
    }

    const nextPanel = renderGoalTimePanel(homeName, awayName, homeBuckets, awayBuckets);
    const panel = document.getElementById(GOAL_TIME_PANEL_ID);
    if (panel) {
      panel.replaceWith(nextPanel);
    } else if (table.parentElement) {
      table.parentElement.insertBefore(nextPanel, table);
    } else {
      (document.getElementById('tableId') || document.body).insertBefore(nextPanel, document.body.firstChild);
    }

    table.setAttribute(GOAL_TIME_ATTR_DONE, '1');
    return true;
  }

  function isHalfFullStatsTable(table) {
    const t = norm(table.textContent);
    if (!t.includes('半场') || !t.includes('全场')) return false;
    return t.includes('球队名称') || (t.includes('球队') && !t.includes('先入球'));
  }

  function isGoalsStatsTable(table) {
    const t = norm(table.textContent);
    return t.includes('先入球') && t.includes('先失球');
  }

  function isGoalTimeStatsTable(table) {
    const t = norm(table.textContent);
    return t.includes('1-5') && t.includes('86-90');
  }

  function findHalfFullTable() {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      if (table.closest('header') || table.closest('nav')) continue;
      if (!isHalfFullStatsTable(table)) continue;
      const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.querySelectorAll(TEAM_LINK_SEL).length === 1);
      if (rows.length >= 3) return table;
    }
    return null;
  }

  function resolveHalfFullColMap(table) {
    const scan = [...table.querySelectorAll('thead tr, tr')].slice(0, 8);
    for (const tr of scan) {
      const map = {};
      for (let i = 0; i < tr.cells.length; i += 1) {
        const t = norm(tr.cells[i].textContent);
        if (HF_LABELS.includes(t)) map[t] = i;
      }
      if (Object.keys(map).length >= 9) return map;
    }
    const sample = [...table.querySelectorAll('tr')].find((r) => r.querySelectorAll(TEAM_LINK_SEL).length === 1);
    if (sample && sample.cells.length >= 10) {
      const map = {};
      HF_LABELS.forEach((lb, idx) => {
        map[lb] = idx + 1;
      });
      return map;
    }
    const fallback = {};
    HF_LABELS.forEach((lb, i) => {
      fallback[lb] = i + 1;
    });
    return fallback;
  }

  function halfFullStatsFromRow(tr, colMap) {
    const vals = {};
    HF_LABELS.forEach((lb) => {
      const idx = colMap[lb];
      vals[lb] = idx != null && tr.cells[idx] ? parseGoalsInt(tr.cells[idx]) : 0;
    });
    const final = {
      w: vals['胜胜'] + vals['平胜'] + vals['负胜'],
      d: vals['胜平'] + vals['平平'] + vals['负平'],
      l: vals['胜负'] + vals['平负'] + vals['负负'],
    };
    const total = final.w + final.d + final.l;
    return { vals, final, total };
  }

  function hfGroupScaleMax(group, homeStats, awayStats) {
    const vals = group.items.flatMap((it) => [
      homeStats.vals[it.label] || 0,
      awayStats.vals[it.label] || 0,
    ]);
    return goalTimeScaleMax(Math.max(...vals, 1));
  }

  const HF_BAR_SVG = { w: 112, h: 90, ml: 4, mr: 4, mt: 8, mb: 22, gap: 4, rx: 2 };

  function buildHfGroupBarSvg(group, stats, scaleMax) {
    const { w, h, ml, mr, mt, mb, gap, rx } = HF_BAR_SVG;
    const items = group.items.map((it) => ({
      label: it.label,
      value: stats.vals[it.label] || 0,
      color: it.color,
    }));
    const pw = w - ml - mr;
    const ph = h - mt - mb;
    const baseY = mt + ph;
    const n = items.length;
    const barW = (pw - gap * (n - 1)) / n;
    const slot = barW + gap;
    const parts = [];

    parts.push(`<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="#fafbfc" rx="3"/>`);
    parts.push(`<line x1="${ml}" y1="${baseY}" x2="${ml + pw}" y2="${baseY}" stroke="#e2e8f0" stroke-width="1"/>`);

    items.forEach((item, i) => {
      const bh = scaleMax ? (item.value / scaleMax) * ph : 0;
      const x = ml + i * slot;
      const y = baseY - bh;
      if (item.value > 0) {
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" rx="${rx}" ry="${rx}" fill="${item.color}"><title>${item.label} · ${item.value} 场</title></rect>`
        );
        parts.push(
          `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#334155" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">${item.value}</text>`
        );
      }
      parts.push(
        `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 5}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${item.label}</text>`
      );
    });

    const sub = items.map((i) => i.value).join('/');
    return `<svg class="tm-hf-bar-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${group.title} ${sub}"><g>${parts.join('')}</g></svg>`;
  }

  function buildHfBarTeamRow(side, teamName, tag, stats, homeStats, awayStats, groups) {
    const teamCls = side === 'home' ? 'tm-hf-bar-team-home' : 'tm-hf-bar-team-away';
    const charts = groups.map((group) => {
      const scaleMax = hfGroupScaleMax(group, homeStats, awayStats);
      return `<div class="tm-hf-bar-cell">${buildHfGroupBarSvg(group, stats, scaleMax)}</div>`;
    }).join('');
    return `
      <div class="tm-hf-bar-team ${teamCls}">
        <div class="tm-hf-bar-team-main">
          <span class="tm-hf-bar-side">${tag}</span>
          <span class="tm-hf-bar-name">${teamName}</span>
        </div>
        <span class="tm-hf-bar-total">${stats.total} 场</span>
      </div>
      ${charts}
    `;
  }

  function buildHfModeSwitch(activeMode) {
    return HF_BAR_MODE_ORDER.map((key) => HF_BAR_MODES[key])
      .filter(Boolean)
      .map(
        (m) =>
          `<button type="button" class="tm-hf-bar-mode-btn${m.key === activeMode ? ' is-active' : ''}" data-mode="${m.key}" aria-pressed="${m.key === activeMode}">${m.label}</button>`
      )
      .join('');
  }

  function renderHalfFullPanel(homeName, awayName, homeStats, awayStats, modeKey = hfBarGroupMode) {
    const mode = HF_BAR_MODES[modeKey] || HF_BAR_MODES.half;
    const groups = mode.groups;
    const panel = document.createElement('div');
    panel.id = HALF_FULL_PANEL_ID;
    panel.className = 'tm-hf-compare-panel';
    const colHeads = groups.map(
      (g) => `<div class="tm-hf-bar-colhead" style="--tm-hf-accent:${g.color}">${g.title}</div>`
    ).join('');
    const footKeys = mode.footer
      .map((f) => `<span class="tm-wdl-key"><i class="${f.cls}"></i>${f.text}</span>`)
      .join('');
    panel.innerHTML = `
      <header class="tm-hf-bar-panel-head">
        <div class="tm-hf-bar-head-side" aria-hidden="true"></div>
        <span class="tm-hf-bar-head-title">${mode.headTitle}</span>
        <div class="tm-hf-bar-mode-switch" role="group" aria-label="柱状图分组方式">
          ${buildHfModeSwitch(mode.key)}
        </div>
      </header>
      <div class="tm-hf-bar-grid">
        <div class="tm-hf-bar-colhead tm-hf-bar-team-col"></div>
        ${colHeads}
        ${buildHfBarTeamRow('home', homeName, '主', homeStats, homeStats, awayStats, groups)}
        ${buildHfBarTeamRow('away', awayName, '客', awayStats, homeStats, awayStats, groups)}
      </div>
      <footer class="tm-hf-bar-foot">
        ${footKeys}
      </footer>
    `;
    return panel;
  }

  function removeHalfFullPanel() {
    document.getElementById(HALF_FULL_PANEL_ID)?.remove();
    hfBarCache = null;
    const table = findHalfFullTable();
    if (table) table.removeAttribute(HALF_FULL_ATTR_DONE);
  }

  function applyHalfFullCharts() {
    if (!isHalfFullTabActive()) {
      removeHalfFullPanel();
      return false;
    }

    const table = findHalfFullTable();
    if (!table) return false;
    if (table.getAttribute(HALF_FULL_ATTR_DONE) === '1' && document.getElementById(HALF_FULL_PANEL_ID)) return true;

    const colMap = resolveHalfFullColMap(table);
    clearMarks(table);
    let homeRow = null;
    let awayRow = null;
    let homeName = cfgHomeName;
    let awayName = cfgAwayName;
    let homeStats = null;
    let awayStats = null;

    for (const tr of table.querySelectorAll('tr')) {
      const links = tr.querySelectorAll(TEAM_LINK_SEL);
      if (links.length !== 1) continue;
      const link = links[0];
      const stats = halfFullStatsFromRow(tr, colMap);
      if (!stats.total) continue;
      if (matchSide(link, cfgHomeName, cfgHomeId)) {
        homeRow = tr;
        homeName = linkDisplayName(link) || cfgHomeName;
        homeStats = stats;
        markStatsTeamRow(tr, 'home');
      }
      if (matchSide(link, cfgAwayName, cfgAwayId)) {
        awayRow = tr;
        awayName = linkDisplayName(link) || cfgAwayName;
        awayStats = stats;
        markStatsTeamRow(tr, 'away');
      }
    }

    if (!homeStats || !awayStats) {
      removeHalfFullPanel();
      return false;
    }

    hfBarCache = { homeName, awayName, homeStats, awayStats };
    const nextPanel = renderHalfFullPanel(homeName, awayName, homeStats, awayStats, hfBarGroupMode);
    const panel = document.getElementById(HALF_FULL_PANEL_ID);
    if (panel) {
      panel.replaceWith(nextPanel);
    } else if (table.parentElement) {
      table.parentElement.insertBefore(nextPanel, table);
    } else {
      (document.getElementById('tableId') || document.body).insertBefore(nextPanel, document.body.firstChild);
    }

    table.setAttribute(HALF_FULL_ATTR_DONE, '1');
    return true;
  }

  function isGoalCountStatsTable(table) {
    const t = norm(table.textContent);
    return (
      t.includes('上半场入球数较多') &&
      t.includes('下半场入球数较多') &&
      (t.includes('球队名称') || t.includes('球队'))
    );
  }

  function findGoalCountTable() {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      if (table.closest('header') || table.closest('nav')) continue;
      if (!isGoalCountStatsTable(table)) continue;
      const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.querySelectorAll(TEAM_LINK_SEL).length === 1);
      if (rows.length >= 3) return table;
    }
    return null;
  }

  function resolveGoalCountColMap(table) {
    const scan = [...table.querySelectorAll('thead tr, tr')].slice(0, 8);
    let headerFirst = -1;
    let headerSame = -1;
    let headerSecond = -1;
    for (const tr of scan) {
      for (let i = 0; i < tr.cells.length; i += 1) {
        const t = norm(tr.cells[i].textContent);
        if (headerFirst < 0 && (t.includes('上半场入球数较多') || t === '上半场较多')) headerFirst = i;
        else if (headerSame < 0 && (t.includes('上下半场入球数相同') || t.includes('上下半相同'))) headerSame = i;
        else if (headerSecond < 0 && (t.includes('下半场入球数较多') || t === '下半场较多')) headerSecond = i;
      }
      if (headerFirst >= 0 && headerSame >= 0 && headerSecond >= 0) break;
    }
    if (headerFirst < 0) return { first: 1, same: 2, second: 3 };
    const sample = [...table.querySelectorAll('tr')].find((r) => r.querySelectorAll(TEAM_LINK_SEL).length === 1);
    let offset = 0;
    if (sample && headerFirst === 0) {
      const teamCell = sample.querySelector(TEAM_LINK_SEL)?.closest('td');
      const teamIdx = teamCell ? [...sample.cells].indexOf(teamCell) : -1;
      if (teamIdx === 0) offset = 1;
    }
    return {
      first: headerFirst + offset,
      same: headerSame + offset,
      second: headerSecond + offset,
    };
  }

  function resolveGoalCountColMaps(table) {
    const total = resolveGoalCountColMap(table);
    return {
      total,
      home: { first: total.first + 3, same: total.same + 3, second: total.second + 3 },
      away: { first: total.first + 6, same: total.same + 6, second: total.second + 6 },
    };
  }

  function goalCountStatsFromRow(tr, colMap) {
    const first = parseGoalsInt(tr.cells[colMap.first]);
    const same = parseGoalsInt(tr.cells[colMap.same]);
    const second = parseGoalsInt(tr.cells[colMap.second]);
    return { first, same, second, total: first + same + second };
  }

  function goalCountScaleMax(homeStats, awayStats) {
    const raw = Math.max(homeStats.first, homeStats.same, homeStats.second, awayStats.first, awayStats.same, awayStats.second, 1);
    return goalTimeScaleMax(raw);
  }

  const GOAL_COUNT_BAR_SVG = { w: 200, h: 92, ml: 8, mr: 8, mt: 10, mb: 22, gap: 8, rx: 2 };

  function buildGoalCountBarSvg(stats, scaleMax) {
    const { w, h, ml, mr, mt, mb, gap, rx } = GOAL_COUNT_BAR_SVG;
    const items = GOAL_COUNT_BUCKETS.map((b) => ({
      label: b.label,
      value: stats[b.key] || 0,
      color: b.color,
      hint: b.hint,
    }));
    const pw = w - ml - mr;
    const ph = h - mt - mb;
    const baseY = mt + ph;
    const n = items.length;
    const barW = (pw - gap * (n - 1)) / n;
    const slot = barW + gap;
    const parts = [];

    parts.push(`<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="#fafbfc" rx="4"/>`);
    parts.push(`<line x1="${ml}" y1="${baseY}" x2="${ml + pw}" y2="${baseY}" stroke="#e2e8f0" stroke-width="1"/>`);

    items.forEach((item, i) => {
      const bh = scaleMax ? (item.value / scaleMax) * ph : 0;
      const x = ml + i * slot;
      const y = baseY - bh;
      if (item.value > 0) {
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" rx="${rx}" ry="${rx}" fill="${item.color}"><title>${item.hint} · ${item.value} 场</title></rect>`
        );
        parts.push(
          `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#334155" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">${item.value}</text>`
        );
      }
      parts.push(
        `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 5}" text-anchor="middle" font-size="9" fill="#64748b" font-family="system-ui,sans-serif">${item.label}</text>`
      );
    });

    return `<svg class="tm-gcnt-bar-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="上下半入球分布"><g>${parts.join('')}</g></svg>`;
  }

  function goalCountAllStatsFromRow(tr, colMaps) {
    return {
      total: goalCountStatsFromRow(tr, colMaps.total),
      home: goalCountStatsFromRow(tr, colMaps.home),
      away: goalCountStatsFromRow(tr, colMaps.away),
    };
  }

  function buildGoalCountDuels(homeStats, awayStats) {
    const duels = GOAL_COUNT_BUCKETS.map((b) =>
      buildCompareDuel(
        b.label,
        homeStats.total ? homeStats[b.key] / homeStats.total : 0,
        awayStats.total ? awayStats[b.key] / awayStats.total : 0
      )
    ).join('');
    return `<div class="tm-gcnt-duel-wrap">${duels}</div>`;
  }

  function buildGoalCountSide(side, teamName, tag, scopeLabel, stats, scaleMax) {
    const teamCls = side === 'home' ? 'tm-hf-bar-team-home' : 'tm-hf-bar-team-away';
    return `
      <div class="tm-gcnt-side">
        <div class="tm-hf-bar-team ${teamCls}">
          <div class="tm-hf-bar-team-main">
            <span class="tm-hf-bar-side">${tag}</span>
            <span class="tm-hf-bar-name">${teamName}<em class="tm-gcnt-scope">（${scopeLabel}）</em></span>
          </div>
          <span class="tm-hf-bar-total">${stats.total} 场</span>
        </div>
        <div class="tm-gcnt-bar-cell">${buildGoalCountBarSvg(stats, scaleMax)}</div>
      </div>
    `;
  }

  function buildGoalCountCompareRow(rowTitle, homeName, awayName, homeStats, awayStats, homeScope, awayScope) {
    const scaleMax = goalCountScaleMax(homeStats, awayStats);
    return `
      <section class="tm-gcnt-compare-row">
        <div class="tm-gcnt-row-head">${rowTitle}</div>
        <div class="tm-gcnt-vs-grid">
          ${buildGoalCountSide('home', homeName, '主', homeScope, homeStats, scaleMax)}
          <div class="tm-gcnt-vs-mark" aria-hidden="true">VS</div>
          ${buildGoalCountSide('away', awayName, '客', awayScope, awayStats, scaleMax)}
        </div>
        ${buildGoalCountDuels(homeStats, awayStats)}
      </section>
    `;
  }

  function renderGoalCountPanel(homeName, awayName, homeAll, awayAll) {
    const panel = document.createElement('div');
    panel.id = GOAL_COUNT_PANEL_ID;
    panel.className = 'tm-gcnt-compare-panel';
    panel.innerHTML = `
      <header class="tm-hf-bar-panel-head">
        <span class="tm-hf-bar-head-title">入球数 · 上下半入球对比</span>
        <span class="tm-hf-bar-head-hint">主/客对决 · 总计对决</span>
      </header>
      ${buildGoalCountCompareRow('主队（主）vs 客队（客）', homeName, awayName, homeAll.home, awayAll.away, '主', '客')}
      ${buildGoalCountCompareRow('主队 vs 客队（总）', homeName, awayName, homeAll.total, awayAll.total, '总', '总')}
      <footer class="tm-hf-bar-foot">
        ${GOAL_COUNT_BUCKETS.map((b) => `<span class="tm-wdl-key"><i style="background:${b.color}"></i>${b.label} · ${b.hint}</span>`).join('')}
      </footer>
    `;
    return panel;
  }

  function removeGoalCountPanel() {
    document.getElementById(GOAL_COUNT_PANEL_ID)?.remove();
    const table = findGoalCountTable();
    if (table) table.removeAttribute(GOAL_COUNT_ATTR_DONE);
  }

  function applyGoalCountCharts() {
    if (!isGoalCountTabActive()) {
      removeGoalCountPanel();
      return false;
    }

    const table = findGoalCountTable();
    if (!table) return false;
    if (table.getAttribute(GOAL_COUNT_ATTR_DONE) === '1' && document.getElementById(GOAL_COUNT_PANEL_ID)) return true;

    const colMaps = resolveGoalCountColMaps(table);
    clearMarks(table);
    let homeName = cfgHomeName;
    let awayName = cfgAwayName;
    let homeAll = null;
    let awayAll = null;

    for (const tr of table.querySelectorAll('tr')) {
      const links = tr.querySelectorAll(TEAM_LINK_SEL);
      if (links.length !== 1) continue;
      const link = links[0];
      const allStats = goalCountAllStatsFromRow(tr, colMaps);
      if (!allStats.total.total) continue;
      if (matchSide(link, cfgHomeName, cfgHomeId)) {
        homeName = linkDisplayName(link) || cfgHomeName;
        homeAll = allStats;
        markStatsTeamRow(tr, 'home');
      }
      if (matchSide(link, cfgAwayName, cfgAwayId)) {
        awayName = linkDisplayName(link) || cfgAwayName;
        awayAll = allStats;
        markStatsTeamRow(tr, 'away');
      }
    }

    if (!homeAll || !awayAll) {
      removeGoalCountPanel();
      return false;
    }

    const nextPanel = renderGoalCountPanel(homeName, awayName, homeAll, awayAll);
    const panel = document.getElementById(GOAL_COUNT_PANEL_ID);
    if (panel) {
      panel.replaceWith(nextPanel);
    } else if (table.parentElement) {
      table.parentElement.insertBefore(nextPanel, table);
    } else {
      (document.getElementById('tableId') || document.body).insertBefore(nextPanel, document.body.firstChild);
    }

    table.setAttribute(GOAL_COUNT_ATTR_DONE, '1');
    return true;
  }

  function isNetMarginStatsTable(table) {
    const t = norm(table.textContent);
    return t.includes('净胜3球') && t.includes('净负3球') && t.includes('平手');
  }

  function findNetMarginTable() {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      if (table.closest('header') || table.closest('nav')) continue;
      if (!isNetMarginStatsTable(table)) continue;
      const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.querySelectorAll(TEAM_LINK_SEL).length === 1);
      if (rows.length >= 3) return table;
    }
    return null;
  }

  function resolveNetMarginColMap(table) {
    const scan = [...table.querySelectorAll('thead tr, tr')].slice(0, 8);
    const labelToKey = [
      ['净胜3球以上', 'w3'],
      ['净胜2球', 'w2'],
      ['净胜1球', 'w1'],
      ['平手', 'd0'],
      ['净负1球', 'l1'],
      ['净负2球', 'l2'],
      ['净负3球以上', 'l3'],
    ];
    for (const tr of scan) {
      const map = {};
      for (let i = 0; i < tr.cells.length; i += 1) {
        const t = norm(tr.cells[i].textContent);
        labelToKey.forEach(([lb, key]) => {
          if (t === lb || t.includes(lb.replace('以上', ''))) map[key] = i;
        });
      }
      if (Object.keys(map).length >= 7) return map;
    }
    return { w3: 1, w2: 2, w1: 3, d0: 4, l1: 5, l2: 6, l3: 7 };
  }

  function netMarginStatsFromRow(tr, colMap) {
    const stats = {};
    NET_MARGIN_BUCKETS.forEach((b) => {
      const idx = colMap[b.key];
      stats[b.key] = idx != null && tr.cells[idx] ? parseGoalsInt(tr.cells[idx]) : 0;
    });
    stats.total = NET_MARGIN_BUCKETS.reduce((sum, b) => sum + (stats[b.key] || 0), 0);
    return stats;
  }

  function netMarginScaleMax(homeStats, awayStats) {
    const raw = Math.max(
      ...NET_MARGIN_BUCKETS.flatMap((b) => [homeStats[b.key] || 0, awayStats[b.key] || 0]),
      1
    );
    return goalTimeScaleMax(raw);
  }

  const NET_MARGIN_BAR_SVG = { w: 296, h: 96, ml: 6, mr: 6, mt: 10, mb: 24, gap: 3, rx: 2 };

  function buildNetMarginBarSvg(stats, scaleMax) {
    const { w, h, ml, mr, mt, mb, gap, rx } = NET_MARGIN_BAR_SVG;
    const items = NET_MARGIN_BUCKETS.map((b) => ({
      short: b.short,
      title: b.title,
      value: stats[b.key] || 0,
      color: b.color,
    }));
    const pw = w - ml - mr;
    const ph = h - mt - mb;
    const baseY = mt + ph;
    const n = items.length;
    const barW = (pw - gap * (n - 1)) / n;
    const slot = barW + gap;
    const parts = [];

    parts.push(`<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="#fafbfc" rx="4"/>`);
    parts.push(`<line x1="${ml}" y1="${baseY}" x2="${ml + pw}" y2="${baseY}" stroke="#e2e8f0" stroke-width="1"/>`);

    items.forEach((item, i) => {
      const bh = scaleMax ? (item.value / scaleMax) * ph : 0;
      const x = ml + i * slot;
      const y = baseY - bh;
      if (item.value > 0) {
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(2)}" rx="${rx}" ry="${rx}" fill="${item.color}"><title>${item.title} · ${item.value} 场</title></rect>`
        );
        parts.push(
          `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="#334155" font-family="system-ui,sans-serif" font-variant-numeric="tabular-nums">${item.value}</text>`
        );
      }
      const mark = item.short === '平';
      parts.push(
        `<text x="${(x + barW / 2).toFixed(1)}" y="${h - 5}" text-anchor="middle" font-size="9" font-weight="${mark ? 600 : 500}" fill="${mark ? '#64748b' : '#64748b'}" font-family="system-ui,sans-serif">${item.short}</text>`
      );
    });

    return `<svg class="tm-nmargin-bar-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="净胜球分布"><g>${parts.join('')}</g></svg>`;
  }

  function buildNetMarginSide(side, teamName, tag, stats, scaleMax) {
    const teamCls = side === 'home' ? 'tm-hf-bar-team-home' : 'tm-hf-bar-team-away';
    return `
      <div class="tm-gcnt-side">
        <div class="tm-hf-bar-team ${teamCls}">
          <div class="tm-hf-bar-team-main">
            <span class="tm-hf-bar-side">${tag}</span>
            <span class="tm-hf-bar-name">${teamName}</span>
          </div>
          <span class="tm-hf-bar-total">${stats.total} 场</span>
        </div>
        <div class="tm-nmargin-bar-cell">${buildNetMarginBarSvg(stats, scaleMax)}</div>
      </div>
    `;
  }

  function buildNetMarginDuels(homeStats, awayStats) {
    const duels = NET_MARGIN_GROUP_DUELS.map((g) =>
      buildCompareDuel(
        g.label,
        homeStats.total ? g.pick(homeStats) / homeStats.total : 0,
        awayStats.total ? g.pick(awayStats) / awayStats.total : 0
      )
    ).join('');
    return `<div class="tm-gcnt-duel-wrap tm-nmargin-duel-wrap">${duels}</div>`;
  }

  function renderNetMarginPanel(homeName, awayName, homeStats, awayStats) {
    const scaleMax = netMarginScaleMax(homeStats, awayStats);
    const panel = document.createElement('div');
    panel.id = NET_MARGIN_PANEL_ID;
    panel.className = 'tm-gcnt-compare-panel tm-nmargin-compare-panel';
    panel.innerHTML = `
      <header class="tm-hf-bar-panel-head">
        <span class="tm-hf-bar-head-title">净胜/负 · 净胜球分布对比</span>
        <span class="tm-hf-bar-head-hint">+3 → 平 → -3 · 主客对决</span>
      </header>
      <section class="tm-gcnt-compare-row">
        <div class="tm-gcnt-row-head">主队 vs 客队</div>
        <div class="tm-gcnt-vs-grid">
          ${buildNetMarginSide('home', homeName, '主', homeStats, scaleMax)}
          <div class="tm-gcnt-vs-mark" aria-hidden="true">VS</div>
          ${buildNetMarginSide('away', awayName, '客', awayStats, scaleMax)}
        </div>
        ${buildNetMarginDuels(homeStats, awayStats)}
      </section>
      <footer class="tm-hf-bar-foot">
        <span class="tm-wdl-key"><i class="tm-wdl-win"></i>净胜（+1/+2/+3）</span>
        <span class="tm-wdl-key"><i class="tm-wdl-draw"></i>平手</span>
        <span class="tm-wdl-key"><i class="tm-wdl-loss"></i>净负（-1/-2/-3）</span>
      </footer>
    `;
    return panel;
  }

  function removeNetMarginPanel() {
    document.getElementById(NET_MARGIN_PANEL_ID)?.remove();
    const table = findNetMarginTable();
    if (table) table.removeAttribute(NET_MARGIN_ATTR_DONE);
  }

  function applyNetMarginCharts() {
    if (!isNetMarginTabActive()) {
      removeNetMarginPanel();
      return false;
    }

    const table = findNetMarginTable();
    if (!table) return false;
    if (table.getAttribute(NET_MARGIN_ATTR_DONE) === '1' && document.getElementById(NET_MARGIN_PANEL_ID)) return true;

    const colMap = resolveNetMarginColMap(table);
    clearMarks(table);
    let homeName = cfgHomeName;
    let awayName = cfgAwayName;
    let homeStats = null;
    let awayStats = null;

    for (const tr of table.querySelectorAll('tr')) {
      const links = tr.querySelectorAll(TEAM_LINK_SEL);
      if (links.length !== 1) continue;
      const link = links[0];
      const stats = netMarginStatsFromRow(tr, colMap);
      if (!stats.total) continue;
      if (matchSide(link, cfgHomeName, cfgHomeId)) {
        homeName = linkDisplayName(link) || cfgHomeName;
        homeStats = stats;
        markStatsTeamRow(tr, 'home');
      }
      if (matchSide(link, cfgAwayName, cfgAwayId)) {
        awayName = linkDisplayName(link) || cfgAwayName;
        awayStats = stats;
        markStatsTeamRow(tr, 'away');
      }
    }

    if (!homeStats || !awayStats) {
      removeNetMarginPanel();
      return false;
    }

    const nextPanel = renderNetMarginPanel(homeName, awayName, homeStats, awayStats);
    const panel = document.getElementById(NET_MARGIN_PANEL_ID);
    if (panel) {
      panel.replaceWith(nextPanel);
    } else if (table.parentElement) {
      table.parentElement.insertBefore(nextPanel, table);
    } else {
      (document.getElementById('tableId') || document.body).insertBefore(nextPanel, document.body.firstChild);
    }

    table.setAttribute(NET_MARGIN_ATTR_DONE, '1');
    return true;
  }

  function injectStyle() {
    const ver = '2.4.0';
    let style = document.getElementById(STYLE_ID);
    if (style && style.getAttribute('data-tm-ver') === ver) return;
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.setAttribute('data-tm-ver', ver);
    style.textContent = `
      /* 主队：绿系；客队：蓝系（与现场 detail 主客习惯一致） */
      td.tm-league-band-home {
        background-color: rgba(21, 128, 61, 0.16) !important;
      }
      td.tm-league-band-away {
        background-color: rgba(29, 78, 216, 0.16) !important;
      }
      td.tm-league-band-edge-home {
        box-shadow: inset 4px 0 0 0 #15803d;
      }
      td.tm-league-band-edge-away {
        box-shadow: inset 4px 0 0 0 #1d4ed8;
      }
      td.tm-league-band-home a[href*="Summary"],
      td.tm-league-band-home a[href*="summary"] {
        font-weight: 700;
        text-decoration: underline;
        text-decoration-style: dashed;
        text-decoration-color: rgba(21, 128, 61, 0.95);
        text-underline-offset: 3px;
      }
      td.tm-league-band-away a[href*="Summary"],
      td.tm-league-band-away a[href*="summary"] {
        font-weight: 700;
        text-decoration: underline;
        text-decoration-style: dashed;
        text-decoration-color: rgba(29, 78, 216, 0.95);
        text-underline-offset: 3px;
      }
      /* 净、总分：柔和外发光，避免高饱和刺眼 */
      td.tm-league-band-home.tm-league-stat-emphasis {
        background-color: rgba(21, 128, 61, 0.1) !important;
        font-weight: 600;
        box-shadow:
          inset 0 0 0 1px rgba(34, 197, 94, 0.28),
          0 0 6px 1px rgba(34, 197, 94, 0.16),
          0 0 14px 3px rgba(34, 197, 94, 0.07);
        text-shadow: 0 0 5px rgba(34, 197, 94, 0.2);
      }
      td.tm-league-band-away.tm-league-stat-emphasis {
        background-color: rgba(29, 78, 216, 0.1) !important;
        font-weight: 600;
        box-shadow:
          inset 0 0 0 1px rgba(96, 165, 250, 0.28),
          0 0 6px 1px rgba(96, 165, 250, 0.16),
          0 0 14px 3px rgba(96, 165, 250, 0.07);
        text-shadow: 0 0 5px rgba(96, 165, 250, 0.2);
      }
      td.tm-league-band-home.tm-league-avg-bold {
        font-weight: 700 !important;
        text-shadow: 0 0 6px rgba(34, 197, 94, 0.28);
      }
      td.tm-league-band-away.tm-league-avg-bold {
        font-weight: 700 !important;
        text-shadow: 0 0 6px rgba(96, 165, 250, 0.28);
      }
      .tm-ah-route-tags {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 3px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .tm-ah-route-tag {
        display: inline-block;
        padding: 0 4px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        line-height: 1.35;
        letter-spacing: 0.02em;
        white-space: nowrap;
        cursor: pointer;
        transition: box-shadow 0.15s ease, filter 0.15s ease;
      }
      .tm-ah-route-tag:hover {
        filter: brightness(0.96);
        box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
      }
      .tm-ah-route-tag:active {
        transform: scale(0.96);
      }
      table.tdlink tr.tm-ah-summary-flash td {
        transition: background-color 0.12s ease;
      }
      .tm-ah-tag-avoid {
        background: #fff1f0;
        color: #cf1322;
        border: 1px solid #ffccc7;
      }
      .tm-ah-tag-home-best {
        background: #f6ffed;
        color: #389e0d;
        border: 1px solid #b7eb8f;
      }
      .tm-ah-tag-home-avoid {
        background: #fff7e6;
        color: #d46b08;
        border: 1px solid #ffd591;
      }
      .tm-ah-tag-away-best {
        background: #e6f4ff;
        color: #0958d9;
        border: 1px solid #91caff;
      }
      .tm-ou-route-tags {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 3px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .tm-ou-route-tag {
        display: inline-block;
        padding: 0 4px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: 600;
        line-height: 1.35;
        letter-spacing: 0.02em;
        white-space: nowrap;
        cursor: pointer;
        transition: box-shadow 0.15s ease, filter 0.15s ease;
      }
      .tm-ou-route-tag:hover {
        filter: brightness(0.96);
        box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.12);
      }
      .tm-ou-tag-over-most {
        background: #fff2e8;
        color: #d4380d;
        border: 1px solid #ffbb96;
      }
      .tm-ou-tag-home-over {
        background: #f6ffed;
        color: #389e0d;
        border: 1px solid #b7eb8f;
      }
      .tm-ou-tag-away-over {
        background: #e6f4ff;
        color: #0958d9;
        border: 1px solid #91caff;
      }
      table.tdlink tr.tm-ou-summary-flash td {
        transition: background-color 0.12s ease;
      }
      /* 资料 Tab 标记：淡色底 + 上标序号 */
      .odds_com li.tm-tab-mark {
        position: relative;
      }
      .odds_com li.tm-tab-mark > a {
        position: relative;
        transition: background-color 0.16s ease, color 0.16s ease;
      }
      .odds_com li.tm-tab-mark-1:not(.nav_on) > a,
      .odds_com li.tm-tab-mark-2:not(.nav_on) > a,
      .odds_com li.tm-tab-mark-3:not(.nav_on) > a,
      .odds_com li.tm-tab-mark-4:not(.nav_on) > a,
      .odds_com li.tm-tab-mark-5:not(.nav_on) > a {
        background: #edf7ed !important;
      }
      .odds_com li.tm-tab-mark-1:not(.nav_on) > a:hover,
      .odds_com li.tm-tab-mark-2:not(.nav_on) > a:hover,
      .odds_com li.tm-tab-mark-3:not(.nav_on) > a:hover,
      .odds_com li.tm-tab-mark-4:not(.nav_on) > a:hover,
      .odds_com li.tm-tab-mark-5:not(.nav_on) > a:hover {
        background: #e3f3e3 !important;
      }
      .odds_com li.tm-tab-mark-3:not(.nav_on) > a {
        font-weight: 500;
      }
      .odds_com li.tm-tab-mark .tm-tab-mark-num {
        display: inline;
        margin-left: 2px;
        padding: 0;
        min-width: 0;
        width: auto;
        height: auto;
        border: none;
        border-radius: 0;
        background: none;
        font-size: 0.72em;
        font-weight: 600;
        line-height: 0;
        vertical-align: super;
        opacity: 0.72;
        color: #475569;
        pointer-events: none;
        letter-spacing: 0;
      }
      .odds_com li.tm-tab-mark-1:not(.nav_on) .tm-tab-mark-num {
        opacity: 0.58;
        color: #64748b;
      }
      .odds_com li.tm-tab-mark-2:not(.nav_on) .tm-tab-mark-num {
        opacity: 0.82;
        color: #334155;
      }
      .odds_com li.tm-tab-mark-3:not(.nav_on) .tm-tab-mark-num {
        opacity: 0.68;
        color: #475569;
      }
      .odds_com li.tm-tab-mark-4:not(.nav_on) .tm-tab-mark-num {
        opacity: 0.68;
        color: #475569;
      }
      .odds_com li.tm-tab-mark-5:not(.nav_on) .tm-tab-mark-num {
        opacity: 0.68;
        color: #475569;
      }
      #info .odds_com li.tm-tab-mark.nav_on .tm-tab-mark-num {
        opacity: 0.92;
        color: #fff;
        font-weight: 700;
      }
      .tm-wdl-win { background: ${WDL_COLORS.w}; }
      .tm-wdl-draw { background: ${WDL_COLORS.d}; }
      .tm-wdl-loss { background: ${WDL_COLORS.l}; }
      .tm-hf-compare-panel {
        margin: 0 0 14px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .tm-hf-bar-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 14px;
        background: #f8fafc;
        border-bottom: 1px solid #e8edf2;
      }
      .tm-hf-compare-panel .tm-hf-bar-panel-head {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        column-gap: 8px;
      }
      .tm-hf-compare-panel .tm-hf-bar-head-side {
        grid-column: 1;
        min-width: 0;
      }
      .tm-hf-compare-panel .tm-hf-bar-head-title {
        grid-column: 2;
        text-align: center;
        white-space: nowrap;
      }
      .tm-hf-compare-panel .tm-hf-bar-mode-switch {
        grid-column: 3;
        justify-self: end;
      }
      .tm-hf-bar-mode-switch {
        display: inline-flex;
        flex: 0 0 auto;
        gap: 2px;
        padding: 2px;
        border: 1px solid #dbe3ec;
        border-radius: 8px;
        background: #eef2f6;
      }
      .tm-hf-bar-mode-btn {
        border: 0;
        margin: 0;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        background: transparent;
        cursor: pointer;
        line-height: 1.4;
        font-family: inherit;
        border-radius: 6px;
        transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
      }
      .tm-hf-bar-mode-btn + .tm-hf-bar-mode-btn {
        border-left: 0;
      }
      .tm-hf-bar-mode-btn.is-active {
        color: #166534;
        background: #fff;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(22, 101, 52, 0.12);
      }
      .tm-hf-bar-mode-btn:hover:not(.is-active) {
        color: #475569;
        background: rgba(255, 255, 255, 0.72);
      }
      .tm-hf-bar-mode-btn:focus-visible {
        outline: 2px solid rgba(22, 101, 52, 0.35);
        outline-offset: 1px;
      }
      .tm-hf-bar-head-title {
        font-size: 13px;
        font-weight: 600;
        color: #334155;
        min-width: 0;
      }
      .tm-hf-bar-head-hint {
        font-size: 10px;
        color: #94a3b8;
        text-align: right;
      }
      .tm-hf-bar-grid {
        display: grid;
        grid-template-columns: minmax(108px, 148px) repeat(3, minmax(96px, 1fr));
        gap: 10px 12px;
        padding: 12px 14px 10px;
        align-items: end;
      }
      .tm-hf-bar-colhead {
        text-align: center;
        font-size: 11px;
        font-weight: 600;
        color: #475569;
        padding-bottom: 6px;
        border-bottom: 2px solid var(--tm-hf-accent, #e2e8f0);
      }
      .tm-hf-bar-team-col {
        border-bottom-color: transparent;
      }
      .tm-hf-bar-team {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 9px 11px;
        border-radius: 6px;
        border: 1px solid #e8edf2;
        background: #fff;
        min-width: 0;
        align-self: center;
      }
      .tm-hf-bar-team-home {
        border-left: 3px solid #52c41a;
      }
      .tm-hf-bar-team-away {
        border-left: 3px solid #4096ff;
      }
      .tm-hf-bar-team-main {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
      }
      .tm-hf-bar-side {
        flex: 0 0 auto;
        width: 22px;
        height: 22px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }
      .tm-hf-bar-team-home .tm-hf-bar-side {
        color: #389e0d;
        background: #f6ffed;
        border: 1px solid #d9f7be;
      }
      .tm-hf-bar-team-away .tm-hf-bar-side {
        color: #0958d9;
        background: #e6f4ff;
        border: 1px solid #bae0ff;
      }
      .tm-hf-bar-name {
        font-size: 13px;
        font-weight: 600;
        color: #1e293b;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tm-hf-bar-total {
        flex: 0 0 auto;
        font-size: 11px;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .tm-hf-bar-cell {
        display: flex;
        justify-content: center;
        min-width: 0;
      }
      .tm-hf-bar-svg {
        display: block;
        width: 100%;
        max-width: 120px;
        height: auto;
      }
      .tm-hf-bar-foot {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px 16px;
        padding: 8px 14px 10px;
        border-top: 1px solid #f1f5f9;
        font-size: 10px;
        color: #64748b;
      }
      @media (max-width: 720px) {
        .tm-hf-bar-grid {
          grid-template-columns: 1fr 1fr;
        }
        .tm-hf-bar-colhead:not(.tm-hf-bar-team-col) {
          grid-column: span 1;
        }
        .tm-hf-bar-team {
          grid-column: 1 / -1;
        }
        .tm-hf-bar-cell {
          grid-column: span 1;
        }
      }
      .tm-gcnt-compare-panel {
        margin: 0 0 14px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .tm-gcnt-compare-row + .tm-gcnt-compare-row {
        border-top: 1px solid #eef2f6;
      }
      .tm-gcnt-row-head {
        padding: 10px 14px 0;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
      }
      .tm-gcnt-vs-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        gap: 8px 10px;
        padding: 8px 14px 4px;
        align-items: end;
      }
      .tm-gcnt-side {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .tm-gcnt-vs-mark {
        align-self: center;
        padding-bottom: 36px;
        font-size: 11px;
        font-weight: 700;
        color: #cbd5e1;
        letter-spacing: 0.06em;
      }
      .tm-gcnt-scope {
        font-style: normal;
        font-weight: 500;
        font-size: 11px;
        color: #94a3b8;
        margin-left: 2px;
      }
      .tm-gcnt-bar-cell {
        display: flex;
        justify-content: center;
        min-width: 0;
      }
      .tm-gcnt-bar-svg {
        display: block;
        width: 100%;
        max-width: 200px;
        height: auto;
      }
      .tm-gcnt-compare-row .tm-gcnt-duel-wrap {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px 10px;
        padding: 2px 14px 12px;
      }
      @media (max-width: 720px) {
        .tm-gcnt-vs-grid {
          grid-template-columns: 1fr;
        }
        .tm-gcnt-vs-mark {
          padding: 0;
          text-align: center;
        }
        .tm-gcnt-compare-row .tm-gcnt-duel-wrap {
          grid-template-columns: 1fr;
        }
      }
      .tm-nmargin-bar-cell {
        display: flex;
        justify-content: center;
        min-width: 0;
      }
      .tm-nmargin-bar-svg {
        display: block;
        width: 100%;
        max-width: 320px;
        height: auto;
      }
      .tm-nmargin-duel-wrap {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .tm-goals-compare-panel {
        margin: 0 0 14px;
        padding: 0;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .tm-goals-panel-head {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
      }
      .tm-goals-panel-team {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        font-size: 14px;
        line-height: 1.25;
        color: #0f172a;
      }
      .tm-goals-panel-team strong {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tm-goals-panel-home { justify-content: flex-start; }
      .tm-goals-panel-away { justify-content: flex-end; }
      .tm-goals-panel-title {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: #64748b;
        white-space: nowrap;
      }
      .tm-goals-side-tag {
        flex: 0 0 auto;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.5;
      }
      .tm-goals-panel-home .tm-goals-side-tag {
        color: #166534;
        background: rgba(22, 101, 52, 0.08);
      }
      .tm-goals-panel-away .tm-goals-side-tag {
        color: #1d4ed8;
        background: rgba(29, 78, 216, 0.08);
      }
      .tm-goals-section + .tm-goals-section {
        border-top: 1px solid #eef2f6;
      }
      .tm-goals-section-head {
        padding: 10px 16px 0;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        letter-spacing: 0.06em;
      }
      .tm-goals-section-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 168px minmax(0, 1fr);
        gap: 8px 12px;
        align-items: center;
        padding: 8px 16px 14px;
      }
      .tm-goals-side {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }
      .tm-goals-side-meta {
        font-size: 11px;
        color: #94a3b8;
      }
      .tm-goals-duel-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 4px;
      }
      .tm-goals-donut-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .tm-goals-donut-wrap {
        position: relative;
        width: 100px;
        height: 100px;
      }
      .tm-goals-donut-center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        text-align: center;
      }
      .tm-goals-donut-center strong {
        font-size: 17px;
        font-weight: 700;
        line-height: 1.1;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }
      .tm-goals-donut-center span {
        margin-top: 2px;
        font-size: 10px;
        color: #94a3b8;
      }
      .tm-goals-legend {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 2px 8px;
        font-size: 10px;
        color: #64748b;
        font-variant-numeric: tabular-nums;
      }
      .tm-goals-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }
      .tm-goals-legend-item i,
      .tm-wdl-key i {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 1px;
        flex: 0 0 auto;
      }
      .tm-goals-legend-empty {
        color: #cbd5e1;
      }
      .tm-duel {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .tm-duel-values {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: baseline;
        gap: 6px;
      }
      .tm-duel-val {
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: #64748b;
      }
      .tm-duel-val-home { text-align: right; }
      .tm-duel-val-away { text-align: left; }
      .tm-duel-val-home.tm-duel-lead { color: #166534; font-weight: 700; }
      .tm-duel-val-away.tm-duel-lead { color: #1d4ed8; font-weight: 700; }
      .tm-duel-label {
        font-size: 10px;
        color: #94a3b8;
        text-align: center;
        white-space: nowrap;
      }
      .tm-duel-track {
        display: flex;
        align-items: center;
        height: 8px;
      }
      .tm-duel-half {
        flex: 1;
        height: 100%;
        display: flex;
        align-items: center;
      }
      .tm-duel-half-home {
        justify-content: flex-end;
      }
      .tm-duel-half-away {
        justify-content: flex-start;
      }
      .tm-duel-half i {
        display: block;
        height: 6px;
        min-width: 0;
        transition: width 0.2s ease;
      }
      .tm-duel-half-home i {
        background: #166534;
        border-radius: 3px 1px 1px 3px;
      }
      .tm-duel-half-away i {
        background: #2563eb;
        border-radius: 1px 3px 3px 1px;
      }
      .tm-duel-axis {
        flex: 0 0 1px;
        align-self: stretch;
        margin: 1px 0;
        background: #cbd5e1;
      }
      .tm-goals-panel-foot {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding: 8px 16px 10px;
        border-top: 1px solid #eef2f6;
        background: #fafbfc;
      }
      .tm-wdl-key {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        color: #64748b;
      }
      .tm-gtime-compare-panel {
        margin: 0 0 14px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .tm-gtime-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 14px;
        background: #f8fafc;
        border-bottom: 1px solid #e8edf2;
      }
      .tm-gtime-head-title {
        font-size: 13px;
        font-weight: 600;
        color: #334155;
      }
      .tm-gtime-scale-hint {
        font-size: 10px;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .tm-gtime-split {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: flex-start;
        gap: 20px;
        padding: 12px 16px 8px;
      }
      .tm-gtime-card {
        flex: 0 0 auto;
        width: 300px;
        max-width: 100%;
        padding: 10px 10px 8px;
        border: 1px solid #e8edf2;
        border-radius: 8px;
        background: #fff;
        box-sizing: border-box;
      }
      .tm-gtime-card-home {
        background: linear-gradient(180deg, #f6ffed 0%, #fff 42%);
        box-shadow: inset 0 2px 0 0 #52c41a;
      }
      .tm-gtime-card-away {
        background: linear-gradient(180deg, #f0f7ff 0%, #fff 42%);
        box-shadow: inset 0 2px 0 0 #4096ff;
      }
      .tm-gtime-card-head {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 2px;
        font-size: 12px;
        color: #0f172a;
      }
      .tm-gtime-card-head strong {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tm-gtime-card-total {
        font-size: 11px;
        color: #64748b;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .tm-gtime-chart-label {
        font-size: 10px;
        color: #94a3b8;
        margin: 0 0 4px 2px;
        letter-spacing: 0.02em;
      }
      .tm-gtime-svg {
        display: block;
        width: 100%;
        height: auto;
        max-width: 300px;
      }
      .tm-gtime-foot {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 14px 18px;
        padding: 6px 14px 10px;
        border-top: 1px solid #f1f5f9;
        font-size: 10px;
        color: #64748b;
      }
      .tm-gtime-foot-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .tm-gtime-foot-note {
        color: #94a3b8;
      }
      .tm-gtime-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 2px;
      }
      .tm-gtime-dot-home {
        background: #52c41a;
      }
      .tm-gtime-dot-away {
        background: #4096ff;
      }
      @media (max-width: 760px) {
        .tm-goals-panel-head {
          grid-template-columns: 1fr;
          text-align: center;
        }
        .tm-goals-panel-home,
        .tm-goals-panel-away {
          justify-content: center;
        }
        .tm-goals-section-grid {
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .tm-goals-duel-wrap {
          order: -1;
          padding-bottom: 4px;
          border-bottom: 1px dashed #e2e8f0;
        }
        .tm-gtime-split {
          flex-direction: column;
          align-items: center;
        }
        .tm-gtime-card {
          width: 100%;
          max-width: 320px;
        }
      }
    `;
  }

  function norm(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .trim();
  }

  /** 积分榜球队链常见 “皇家马德里 6” 形式，去掉末尾独立数字 */
  function linkDisplayName(link) {
    let t = (link.textContent || '').replace(/\u00a0/g, ' ').trim();
    t = t.replace(/\s+\d+$/, '').trim();
    return t;
  }

  function hrefTeamId(href) {
    const m = String(href || '').match(/\/team\/summary\/(\d+)\.html/i);
    return m ? m[1] : null;
  }

  function matchSide(link, name, id) {
    const href = link.getAttribute('href') || '';
    const linkId = hrefTeamId(href);
    // 有 ID 时只按 ID 匹配，避免「哥德堡」误匹配「哥德堡盖斯」
    if (id) return linkId === id;
    if (!name) return false;
    const a = norm(name);
    const b = norm(linkDisplayName(link));
    return !!a && a === b;
  }

  /**
   * 积分榜：每行通常只有一个球队 Summary 链接；赛程表每行两个。
   * 取「仅含一个球队链接」且行数最多的 table 作为积分榜主体。
   */
  function isAsianHandicapStatsTable(table) {
    const t = norm(table.textContent);
    return t.includes('上盘') && t.includes('下盘') && t.includes('盘路');
  }

  function isOverUnderStatsTable(table) {
    const t = norm(table.textContent);
    return t.includes('大球') && t.includes('小球') && t.includes('盘路') && !t.includes('上盘');
  }

  function isStandingsStatsTable(table) {
    const t = norm(table.textContent);
    if (
      isHalfFullStatsTable(table) ||
      isGoalsStatsTable(table) ||
      isGoalTimeStatsTable(table) ||
      isGoalCountStatsTable(table) ||
      isNetMarginStatsTable(table) ||
      isAsianHandicapStatsTable(table) ||
      isOverUnderStatsTable(table)
    ) {
      return false;
    }
    return (t.includes('积分') || t.includes('总分')) && t.includes('净');
  }

  function findTeamStatsTable(matchTable) {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      if (table.closest('header') || table.closest('nav')) continue;
      if (!matchTable(table)) continue;
      const rows = [...table.querySelectorAll('tr')].filter((tr) => tr.querySelectorAll(TEAM_LINK_SEL).length === 1);
      if (rows.length >= 3) return table;
    }
    return null;
  }

  function findAsianHandicapTable() {
    return findTeamStatsTable(isAsianHandicapStatsTable);
  }

  function findOverUnderTable() {
    return findTeamStatsTable(isOverUnderStatsTable);
  }

  function teamColIdxFromCells(cells) {
    for (let i = 0; i < cells.length; i += 1) {
      const t = norm(cells[i].textContent);
      if (t.includes('球队名称')) return i;
      if (t === '球队' || (t.includes('球队') && t.length <= 4)) return i;
      if (t.includes('队名')) return i;
    }
    return -1;
  }

  function teamColRangeFromSample(table, endFromTail) {
    const sample = [...table.querySelectorAll('tr')].find((r) => r.querySelectorAll(TEAM_LINK_SEL).length === 1);
    if (!sample) return null;
    const link = sample.querySelector(TEAM_LINK_SEL);
    const nameTd = link?.closest('td');
    if (!nameTd) return null;
    const start = [...sample.cells].indexOf(nameTd);
    if (start < 0) return null;
    const n = sample.cells.length;
    return { start, end: Math.max(start, n - endFromTail) };
  }

  function resolveAsianHandicapColRange(table) {
    const scan = [...table.querySelectorAll('thead tr, tr')].slice(0, 8);
    for (const tr of scan) {
      const cells = [...tr.cells];
      if (cells.length < 8) continue;
      const teamIdx = teamColIdxFromCells(cells);
      let netIdx = -1;
      let winPctIdx = -1;
      let routeIdx = -1;
      cells.forEach((cell, i) => {
        const t = norm(cell.textContent);
        if (t === '净' || t === '净胜' || t === '净胜球') netIdx = i;
        if (t === '胜%' || t.includes('胜%')) winPctIdx = i;
        if (t === '盘路') routeIdx = i;
      });
      if (teamIdx < 0 || netIdx < 0) continue;
      const end = routeIdx > teamIdx ? routeIdx - 1 : Math.max(netIdx, winPctIdx);
      return {
        start: teamIdx,
        end: Math.max(end, netIdx),
        netIdx,
        pointsIdx: winPctIdx >= 0 ? winPctIdx : netIdx,
        avgForIdx: -1,
        avgAgainstIdx: -1,
      };
    }
    const fb = teamColRangeFromSample(table, 2);
    if (!fb) return null;
    return {
      ...fb,
      netIdx: fb.end - 4,
      pointsIdx: fb.end - 3,
      avgForIdx: -1,
      avgAgainstIdx: -1,
    };
  }

  function resolveOverUnderColRange(table) {
    const scan = [...table.querySelectorAll('thead tr, tr')].slice(0, 8);
    for (const tr of scan) {
      const cells = [...tr.cells];
      if (cells.length < 7) continue;
      const teamIdx = teamColIdxFromCells(cells);
      let bigPctIdx = -1;
      let smallPctIdx = -1;
      let routeIdx = -1;
      cells.forEach((cell, i) => {
        const t = norm(cell.textContent);
        if (t === '大球%' || t.includes('大球%')) bigPctIdx = i;
        if (t === '小球%' || t.includes('小球%')) smallPctIdx = i;
        if (t === '盘路') routeIdx = i;
      });
      if (teamIdx < 0 || bigPctIdx < 0 || smallPctIdx < 0) continue;
      const end = routeIdx > teamIdx ? routeIdx - 1 : smallPctIdx;
      return {
        start: teamIdx,
        end: Math.max(end, smallPctIdx),
        netIdx: bigPctIdx,
        pointsIdx: smallPctIdx,
        avgForIdx: -1,
        avgAgainstIdx: -1,
      };
    }
    const fb = teamColRangeFromSample(table, 2);
    if (!fb) return null;
    return {
      ...fb,
      netIdx: fb.end - 2,
      pointsIdx: fb.end - 1,
      avgForIdx: -1,
      avgAgainstIdx: -1,
    };
  }

  function applyTeamTableMarks(isTabActive, findTable, attrDone, resolveColRange) {
    if (!isTabActive()) {
      const stale = findTable();
      if (stale) stale.removeAttribute(attrDone);
      return false;
    }

    const table = findTable();
    if (!table) return false;
    if (table.getAttribute(attrDone) === '1') return true;

    let hitHome = false;
    let hitAway = false;
    let scrolled = false;

    clearMarks(table);
    const colRange = resolveColRange(table);
    if (!colRange) return false;

    for (const tr of table.querySelectorAll('tr')) {
      const links = tr.querySelectorAll(TEAM_LINK_SEL);
      if (links.length !== 1) continue;
      const link = links[0];
      const isHome = matchSide(link, cfgHomeName, cfgHomeId);
      const isAway = matchSide(link, cfgAwayName, cfgAwayId);
      if (isHome) {
        markBandForRow(tr, colRange, 'home');
        hitHome = true;
      }
      if (isAway) {
        markBandForRow(tr, colRange, 'away');
        hitAway = true;
      }
      if ((isHome || isAway) && !scrolled) {
        scrolled = true;
        try {
          tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (_) {
          tr.scrollIntoView(true);
        }
      }
    }

    if (hitHome || hitAway) {
      table.setAttribute(attrDone, '1');
      return true;
    }
    return false;
  }

  function ahSummaryLabelKey(labelText) {
    const t = norm(labelText);
    if (t.includes('主场最佳')) return 'homeBest';
    if (t.includes('主场避免')) return 'homeAvoid';
    if (t.includes('客场最佳')) return 'awayBest';
    if (t.includes('避免投注') || (t.includes('避免') && t.includes('投注'))) return 'avoid';
    return null;
  }

  function parseTeamNameList(text) {
    return String(text || '')
      .replace(/详情/g, '')
      .split(/[,，、/|]+/)
      .map((s) => norm(s))
      .filter(Boolean);
  }

  function findAsianHandicapSummaryTable() {
    const root = document.getElementById('allTongJi1');
    const table = root?.querySelector('table.tdlink, table');
    if (!table || !norm(table.textContent).includes('避免投注')) return null;
    return table;
  }

  function findAsianHandicapSummaryRow(tagKey) {
    const table = findAsianHandicapSummaryTable();
    if (!table || !tagKey) return null;
    for (const tr of table.querySelectorAll('tr')) {
      if (ahSummaryLabelKey(tr.cells[0]?.textContent) === tagKey) return tr;
    }
    return null;
  }

  let summaryFlashInterval = 0;
  let summaryFlashCleanup = null;

  const SUMMARY_FLASH_ON = '#ffc53d';
  const SUMMARY_FLASH_OFF = '#fffbe6';
  const SUMMARY_FLASH_HALF_MS = 400;
  const SUMMARY_FLASH_CYCLES = 5;

  function stopSummaryRowFlash() {
    window.clearInterval(summaryFlashInterval);
    summaryFlashInterval = 0;
    if (summaryFlashCleanup) {
      summaryFlashCleanup();
      summaryFlashCleanup = null;
    }
  }

  function flashStatsSummaryRow(table, target, flashClass) {
    if (!table || !target) return false;

    stopSummaryRowFlash();
    table.querySelectorAll(`.${flashClass}`).forEach((tr) => tr.classList.remove(flashClass));

    const cells = [...target.cells];
    if (!cells.length) return false;
    const styleSnapshot = cells.map((td) => td.getAttribute('style'));

    const paint = (bright) => {
      const color = bright ? SUMMARY_FLASH_ON : SUMMARY_FLASH_OFF;
      cells.forEach((td) => td.style.setProperty('background-color', color, 'important'));
    };

    const restore = () => {
      cells.forEach((td, idx) => {
        const prev = styleSnapshot[idx];
        if (prev == null || prev === '') {
          td.style.removeProperty('background-color');
          td.removeAttribute('style');
        } else {
          td.setAttribute('style', prev);
        }
      });
      target.classList.remove(flashClass);
    };

    summaryFlashCleanup = restore;
    target.classList.add(flashClass);
    try {
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (_) {
      target.scrollIntoView(true);
    }

    let step = 0;
    paint(true);
    summaryFlashInterval = window.setInterval(() => {
      step += 1;
      if (step >= SUMMARY_FLASH_CYCLES * 2) {
        stopSummaryRowFlash();
        return;
      }
      paint(step % 2 === 0);
    }, SUMMARY_FLASH_HALF_MS);

    return true;
  }

  function flashAsianHandicapSummaryRow(tagKey) {
    const table = findAsianHandicapSummaryTable();
    const target = findAsianHandicapSummaryRow(tagKey);
    return flashStatsSummaryRow(table, target, 'tm-ah-summary-flash');
  }

  let routeTagClickBound = false;
  let hfModeClickBound = false;

  function bindHalfFullModeSwitch() {
    if (hfModeClickBound) return;
    hfModeClickBound = true;
    document.addEventListener(
      'click',
      (ev) => {
        const btn = ev.target?.closest?.('.tm-hf-bar-mode-btn[data-mode]');
        if (!btn || !isHalfFullTabActive() || !hfBarCache) return;
        const mode = btn.getAttribute('data-mode');
        if (!HF_BAR_MODES[mode] || mode === hfBarGroupMode) return;
        ev.preventDefault();
        hfBarGroupMode = mode;
        const nextPanel = renderHalfFullPanel(
          hfBarCache.homeName,
          hfBarCache.awayName,
          hfBarCache.homeStats,
          hfBarCache.awayStats,
          mode
        );
        document.getElementById(HALF_FULL_PANEL_ID)?.replaceWith(nextPanel);
      },
      true
    );
  }

  function bindRouteTagClicks() {
    if (routeTagClickBound) return;
    routeTagClickBound = true;
    document.addEventListener(
      'click',
      (ev) => {
        const ahTag = ev.target?.closest?.('.tm-ah-route-tag[data-tm-ah-key]');
        if (ahTag && isAsianHandicapTabActive()) {
          ev.preventDefault();
          ev.stopPropagation();
          flashAsianHandicapSummaryRow(ahTag.getAttribute('data-tm-ah-key'));
          return;
        }
        const ouTag = ev.target?.closest?.('.tm-ou-route-tag[data-tm-ou-key]');
        if (ouTag && isOverUnderTabActive()) {
          ev.preventDefault();
          ev.stopPropagation();
          flashOverUnderSummaryRow(ouTag.getAttribute('data-tm-ou-key'));
        }
      },
      true
    );
  }

  function resolveRouteTagsFromMap(link, tagMap) {
    if (!tagMap.size) return null;
    for (const [name, keys] of tagMap.entries()) {
      if (matchSide(link, name, null)) return keys;
    }
    return null;
  }

  function parseAsianHandicapRouteTagMap() {
    const table = findAsianHandicapSummaryTable();
    const tagMap = new Map();
    if (!table) return tagMap;

    for (const tr of table.querySelectorAll('tr')) {
      const labelCell = tr.cells[0];
      const teamsCell = tr.cells[1];
      if (!labelCell || !teamsCell) continue;
      const key = ahSummaryLabelKey(labelCell.textContent);
      if (!key) continue;
      parseTeamNameList(teamsCell.textContent).forEach((name) => {
        if (!tagMap.has(name)) tagMap.set(name, new Set());
        tagMap.get(name).add(key);
      });
    }
    return tagMap;
  }

  function resolveAsianHandicapRouteTags(link, tagMap) {
    return resolveRouteTagsFromMap(link, tagMap);
  }

  function clearAsianHandicapRouteTags(table) {
    table?.querySelectorAll('.tm-ah-route-tags').forEach((el) => el.remove());
  }

  function markAsianHandicapRouteTags(tr, link, tagKeys) {
    const td = link.closest('td') || tr.cells[1] || tr.cells[0];
    if (!td) return;
    let wrap = td.querySelector('.tm-ah-route-tags');
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'tm-ah-route-tags';
      wrap.setAttribute('aria-label', '亚让盘路标签');
      td.appendChild(wrap);
    } else {
      wrap.innerHTML = '';
    }
    AH_ROUTE_TAGS.filter((tag) => tagKeys.has(tag.key)).forEach((tag) => {
      const el = document.createElement('span');
      el.className = `tm-ah-route-tag ${tag.className}`;
      el.title = `${tag.title} · 点击查看下方统计行`;
      el.textContent = tag.short;
      el.setAttribute('role', 'button');
      el.setAttribute('data-tm-ah-key', tag.key);
      wrap.appendChild(el);
    });
  }

  function applyAsianHandicapMarks() {
    if (!isAsianHandicapTabActive()) {
      const stale = findAsianHandicapTable();
      if (stale) {
        stale.removeAttribute(AH_ATTR_DONE);
        clearAsianHandicapRouteTags(stale);
      }
      return false;
    }

    const table = findAsianHandicapTable();
    if (!table) return false;

    const tagMap = parseAsianHandicapRouteTagMap();
    const colRange = resolveAsianHandicapColRange(table);
    if (!colRange) return false;

    const markedAlready = table.getAttribute(AH_ATTR_DONE) === '1';
    if (markedAlready) {
      const needRouteTags = tagMap.size > 0;
      const hasRouteTags = !!table.querySelector('.tm-ah-route-tags');
      if (!needRouteTags || hasRouteTags) return true;
    }

    let hitHome = false;
    let hitAway = false;
    let hitRoute = false;
    let scrolled = false;

    clearMarks(table);
    clearAsianHandicapRouteTags(table);

    for (const tr of table.querySelectorAll('tr')) {
      const links = tr.querySelectorAll(TEAM_LINK_SEL);
      if (links.length !== 1) continue;
      const link = links[0];
      const isHome = matchSide(link, cfgHomeName, cfgHomeId);
      const isAway = matchSide(link, cfgAwayName, cfgAwayId);
      if (isHome) {
        markBandForRow(tr, colRange, 'home');
        hitHome = true;
      }
      if (isAway) {
        markBandForRow(tr, colRange, 'away');
        hitAway = true;
      }

      const routeKeys = resolveAsianHandicapRouteTags(link, tagMap);
      if (routeKeys?.size) {
        markAsianHandicapRouteTags(tr, link, routeKeys);
        hitRoute = true;
      }

      if ((isHome || isAway) && !scrolled) {
        scrolled = true;
        try {
          tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (_) {
          tr.scrollIntoView(true);
        }
      }
    }

    if (hitHome || hitAway || hitRoute) {
      table.setAttribute(AH_ATTR_DONE, '1');
      return true;
    }
    return false;
  }

  function ouSummaryLabelKey(labelText) {
    const t = norm(labelText);
    if (t.includes('主场大球最多')) return 'homeOverMost';
    if (t.includes('客场大球最多')) return 'awayOverMost';
    if (t.includes('大球最多')) return 'overMost';
    return null;
  }

  function findOverUnderSummaryTable() {
    const root = document.getElementById('allTongJi1');
    const table = root?.querySelector('table.tdlink, table');
    if (!table || !norm(table.textContent).includes('大球最多')) return null;
    return table;
  }

  function findOverUnderSummaryRow(tagKey) {
    const table = findOverUnderSummaryTable();
    if (!table || !tagKey) return null;
    for (const tr of table.querySelectorAll('tr')) {
      if (ouSummaryLabelKey(tr.cells[0]?.textContent) === tagKey) return tr;
    }
    return null;
  }

  function flashOverUnderSummaryRow(tagKey) {
    const table = findOverUnderSummaryTable();
    const target = findOverUnderSummaryRow(tagKey);
    return flashStatsSummaryRow(table, target, 'tm-ou-summary-flash');
  }

  function parseOverUnderRouteTagMap() {
    const table = findOverUnderSummaryTable();
    const tagMap = new Map();
    if (!table) return tagMap;

    for (const tr of table.querySelectorAll('tr')) {
      const labelCell = tr.cells[0];
      const teamsCell = tr.cells[1];
      if (!labelCell || !teamsCell) continue;
      const key = ouSummaryLabelKey(labelCell.textContent);
      if (!key) continue;
      parseTeamNameList(teamsCell.textContent).forEach((name) => {
        if (!tagMap.has(name)) tagMap.set(name, new Set());
        tagMap.get(name).add(key);
      });
    }
    return tagMap;
  }

  function clearOverUnderRouteTags(table) {
    table?.querySelectorAll('.tm-ou-route-tags').forEach((el) => el.remove());
  }

  function markOverUnderRouteTags(tr, link, tagKeys) {
    const td = link.closest('td') || tr.cells[1] || tr.cells[0];
    if (!td) return;
    let wrap = td.querySelector('.tm-ou-route-tags');
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'tm-ou-route-tags';
      wrap.setAttribute('aria-label', '大小球盘路标签');
      td.appendChild(wrap);
    } else {
      wrap.innerHTML = '';
    }
    OU_ROUTE_TAGS.filter((tag) => tagKeys.has(tag.key)).forEach((tag) => {
      const el = document.createElement('span');
      el.className = `tm-ou-route-tag ${tag.className}`;
      el.title = `${tag.title} · 点击查看下方统计行`;
      el.textContent = tag.short;
      el.setAttribute('role', 'button');
      el.setAttribute('data-tm-ou-key', tag.key);
      wrap.appendChild(el);
    });
  }

  function applyOverUnderMarks() {
    if (!isOverUnderTabActive()) {
      const stale = findOverUnderTable();
      if (stale) {
        stale.removeAttribute(OU_ATTR_DONE);
        clearOverUnderRouteTags(stale);
      }
      return false;
    }

    const table = findOverUnderTable();
    if (!table) return false;

    const tagMap = parseOverUnderRouteTagMap();
    const colRange = resolveOverUnderColRange(table);
    if (!colRange) return false;

    const markedAlready = table.getAttribute(OU_ATTR_DONE) === '1';
    if (markedAlready) {
      const needRouteTags = tagMap.size > 0;
      const hasRouteTags = !!table.querySelector('.tm-ou-route-tags');
      if (!needRouteTags || hasRouteTags) return true;
    }

    let hitHome = false;
    let hitAway = false;
    let hitRoute = false;
    let scrolled = false;

    clearMarks(table);
    clearOverUnderRouteTags(table);

    for (const tr of table.querySelectorAll('tr')) {
      const links = tr.querySelectorAll(TEAM_LINK_SEL);
      if (links.length !== 1) continue;
      const link = links[0];
      const isHome = matchSide(link, cfgHomeName, cfgHomeId);
      const isAway = matchSide(link, cfgAwayName, cfgAwayId);
      if (isHome) {
        markBandForRow(tr, colRange, 'home');
        hitHome = true;
      }
      if (isAway) {
        markBandForRow(tr, colRange, 'away');
        hitAway = true;
      }

      const routeKeys = resolveRouteTagsFromMap(link, tagMap);
      if (routeKeys?.size) {
        markOverUnderRouteTags(tr, link, routeKeys);
        hitRoute = true;
      }

      if ((isHome || isAway) && !scrolled) {
        scrolled = true;
        try {
          tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (_) {
          tr.scrollIntoView(true);
        }
      }
    }

    if (hitHome || hitAway || hitRoute) {
      table.setAttribute(OU_ATTR_DONE, '1');
      return true;
    }
    return false;
  }

  function findStandingsTable() {
    const tables = document.querySelectorAll('table');
    let best = null;
    let bestCount = 0;
    for (const table of tables) {
      if (table.closest('header') || table.closest('nav')) continue;
      if (!isStandingsStatsTable(table)) continue;
      const rows = [...table.querySelectorAll('tr')].filter((tr) => {
        const links = tr.querySelectorAll(TEAM_LINK_SEL);
        return links.length === 1;
      });
      if (rows.length > bestCount) {
        bestCount = rows.length;
        best = table;
      }
    }
    return bestCount >= 3 ? best : null;
  }

  function parseCellNumber(td) {
    const t = (td?.textContent || '').replace(/\u00a0/g, ' ').trim();
    const m = t.match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }

  /** 表头定位「球队名称」列～「总分」列（含），并记录「净」「总分」「均得」「均失」列下标 */
  function resolveStandingsColRange(table) {
    const scan = [...table.querySelectorAll('thead tr, tr')].slice(0, 10);
    for (const tr of scan) {
      const cells = [...tr.cells];
      if (cells.length < 6) continue;
      let teamIdx = -1;
      let netIdx = -1;
      let pointsIdx = -1;
      let avgForIdx = -1;
      let avgAgainstIdx = -1;
      let recentIdx = -1;
      cells.forEach((cell, i) => {
        const t = norm(cell.textContent);
        if (teamIdx < 0) {
          if (t.includes('球队名称')) teamIdx = i;
          else if (t === '球队' || (t.includes('球队') && t.length <= 4)) teamIdx = i;
          else if (t.includes('队名')) teamIdx = i;
        }
        if (t === '净' || t === '净胜' || t === '净胜球') netIdx = i;
        if (t === '总分' || t === '积分') pointsIdx = i;
        if (t === '均得' || t.includes('均得')) avgForIdx = i;
        if (t === '均失' || t.includes('均失')) avgAgainstIdx = i;
        if (t.includes('近六') || t.includes('近6') || t.includes('近轮')) recentIdx = i;
      });
      if (teamIdx < 0 || netIdx < 0 || netIdx < teamIdx) continue;
      if (pointsIdx < 0 && recentIdx > 0) pointsIdx = recentIdx - 1;
      if (pointsIdx < 0 && avgAgainstIdx >= 0) pointsIdx = avgAgainstIdx + 1;
      if (pointsIdx < 0) continue;
      const end = Math.max(pointsIdx, netIdx);
      return {
        start: teamIdx,
        end,
        netIdx,
        pointsIdx,
        avgForIdx,
        avgAgainstIdx,
      };
    }

    const sample = [...table.querySelectorAll('tr')].find((r) => r.querySelectorAll(TEAM_LINK_SEL).length === 1);
    if (!sample) return null;
    const link = sample.querySelector(TEAM_LINK_SEL);
    const nameTd = link?.closest('td');
    if (!nameTd) return null;
    const idx = [...sample.cells].indexOf(nameTd);
    if (idx < 0) return null;
    const n = sample.cells.length;
    return {
      start: idx,
      end: Math.max(n - 2, idx),
      netIdx: Math.max(n - 7, idx + 1),
      pointsIdx: Math.max(n - 2, idx + 1),
      avgForIdx: Math.max(n - 4, idx + 1),
      avgAgainstIdx: Math.max(n - 3, idx + 1),
    };
  }

  /** 主客行：均得、均失较大者加粗（相等则不加粗） */
  function applyAvgForAgainstBold(tr, range) {
    const { avgForIdx, avgAgainstIdx } = range;
    if (avgForIdx < 0 || avgAgainstIdx < 0) return;
    const n = tr.cells.length;
    const tdFor = tr.cells[Math.min(avgForIdx, n - 1)];
    const tdAgainst = tr.cells[Math.min(avgAgainstIdx, n - 1)];
    if (!tdFor || !tdAgainst) return;
    const vFor = parseCellNumber(tdFor);
    const vAgainst = parseCellNumber(tdAgainst);
    if (!Number.isFinite(vFor) || !Number.isFinite(vAgainst) || vFor === vAgainst) return;
    if (vFor > vAgainst) tdFor.classList.add('tm-league-avg-bold');
    else tdAgainst.classList.add('tm-league-avg-bold');
  }

  function clearMarks(table) {
    const rm = [
      'tm-league-band-home',
      'tm-league-band-away',
      'tm-league-band-edge-home',
      'tm-league-band-edge-away',
      'tm-league-stat-emphasis',
      'tm-league-avg-bold',
    ];
    table.querySelectorAll(rm.map((c) => `.${c}`).join(',')).forEach((td) => {
      rm.forEach((c) => td.classList.remove(c));
    });
  }

  function markBandForRow(tr, range, side) {
    const { start, end, netIdx, pointsIdx } = range;
    const n = tr.cells.length;
    if (!n || start < 0 || end < start) return;
    const s = Math.min(start, n - 1);
    const e = Math.min(end, n - 1);
    const emphasis = new Set(
      [netIdx, pointsIdx].filter((i) => i != null && i >= 0).map((i) => Math.min(i, n - 1))
    );
    const isHome = side === 'home';
    for (let i = s; i <= e; i++) {
      const td = tr.cells[i];
      if (isHome) td.classList.add('tm-league-band-home');
      else td.classList.add('tm-league-band-away');
      if (emphasis.has(i)) td.classList.add('tm-league-stat-emphasis');
    }
    const edgeCell = tr.cells[s];
    if (edgeCell) {
      if (isHome) edgeCell.classList.add('tm-league-band-edge-home');
      else edgeCell.classList.add('tm-league-band-edge-away');
    }
    applyAvgForAgainstBold(tr, range);
  }

  function applyMarks() {
    return applyTeamTableMarks(isStandingsTabActive, findStandingsTable, ATTR_DONE, resolveStandingsColRange);
  }

  function runMarkEnhancements() {
    const pendingTab = getRequestedStatsTab();
    const bootstrapDone = isStandingsBootstrapDone();

    if (!pendingTab || bootstrapDone || statsTabFromUrlEnsured) {
      reorderStatsTabs();
      applyTabMarks();
    }

    if (!pendingTab && !isEnhancedStatsTabActive() && !isStandingsTabActive()) {
      ensureStandingsTabActiveOnce();
    }

    applyMarks();
    applyAsianHandicapMarks();
    applyOverUnderMarks();
    applyGoalsCharts();
    applyGoalTimeCharts();
    applyHalfFullCharts();
    applyGoalCountCharts();
    applyNetMarginCharts();
  }

  function tryMarkLoop() {
    startPendingTabAutoSwitch();
    injectStyle();
    bindRouteTagClicks();
    bindHalfFullModeSwitch();
    runMarkEnhancements();

    let tries = 0;
    const maxTries = 150;
    const timer = window.setInterval(() => {
      tries += 1;
      runMarkEnhancements();
      if (tries >= maxTries) window.clearInterval(timer);
    }, 350);

    let debounce;
    const obs = new MutationObserver(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        reorderStatsTabs();
        applyTabMarks();
        if (isGoalsTabActive()) {
          applyGoalsCharts();
        } else if (isGoalTimeTabActive()) {
          applyGoalTimeCharts();
        } else if (isHalfFullTabActive()) {
          applyHalfFullCharts();
        } else if (isGoalCountTabActive()) {
          applyGoalCountCharts();
        } else if (isNetMarginTabActive()) {
          applyNetMarginCharts();
        } else if (isAsianHandicapTabActive()) {
          applyAsianHandicapMarks();
        } else if (isOverUnderTabActive()) {
          applyOverUnderMarks();
        } else {
          removeAllComparePanels();
          if (isStandingsTabActive()) {
            const table = findStandingsTable();
            if (table && table.getAttribute(ATTR_DONE) !== '1') applyMarks();
          }
        }
      }, 200);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    document.querySelector('.odds_com')?.addEventListener(
      'click',
      (ev) => {
        const li = statsTabLiFromEvent(ev);
        const tabId = li?.id || '';
        if (tabId === 'li11') {
          removeGoalTimePanel();
          removeHalfFullPanel();
          removeGoalCountPanel();
          removeNetMarginPanel();
          window.setTimeout(() => applyGoalsCharts(), 120);
          window.setTimeout(() => applyGoalsCharts(), 450);
          window.setTimeout(() => applyGoalsCharts(), 900);
        } else if (tabId === 'li8') {
          removeGoalsPanel();
          removeHalfFullPanel();
          removeGoalCountPanel();
          removeNetMarginPanel();
          window.setTimeout(() => applyGoalTimeCharts(), 120);
          window.setTimeout(() => applyGoalTimeCharts(), 450);
          window.setTimeout(() => applyGoalTimeCharts(), 900);
        } else if (tabId === 'li7') {
          removeGoalsPanel();
          removeGoalTimePanel();
          removeGoalCountPanel();
          removeNetMarginPanel();
          window.setTimeout(() => applyHalfFullCharts(), 120);
          window.setTimeout(() => applyHalfFullCharts(), 450);
          window.setTimeout(() => applyHalfFullCharts(), 900);
        } else if (tabId === 'li6') {
          removeGoalsPanel();
          removeGoalTimePanel();
          removeHalfFullPanel();
          removeNetMarginPanel();
          window.setTimeout(() => applyGoalCountCharts(), 120);
          window.setTimeout(() => applyGoalCountCharts(), 450);
          window.setTimeout(() => applyGoalCountCharts(), 900);
        } else if (tabId === 'li10') {
          removeGoalsPanel();
          removeGoalTimePanel();
          removeHalfFullPanel();
          removeGoalCountPanel();
          window.setTimeout(() => applyNetMarginCharts(), 120);
          window.setTimeout(() => applyNetMarginCharts(), 450);
          window.setTimeout(() => applyNetMarginCharts(), 900);
        } else if (tabId === 'li2') {
          removeAllComparePanels();
          window.setTimeout(() => {
            const table = findAsianHandicapTable();
            if (table) table.removeAttribute(AH_ATTR_DONE);
            applyAsianHandicapMarks();
          }, 120);
          window.setTimeout(() => applyAsianHandicapMarks(), 450);
          window.setTimeout(() => applyAsianHandicapMarks(), 900);
        } else if (tabId === 'li3') {
          removeAllComparePanels();
          window.setTimeout(() => {
            const table = findOverUnderTable();
            if (table) table.removeAttribute(OU_ATTR_DONE);
            applyOverUnderMarks();
          }, 120);
          window.setTimeout(() => applyOverUnderMarks(), 450);
          window.setTimeout(() => applyOverUnderMarks(), 900);
        } else if (tabId === 'li1') {
          window.setTimeout(() => {
            removeAllComparePanels();
            const table = findStandingsTable();
            if (table) {
              table.removeAttribute(ATTR_DONE);
              applyMarks();
            }
          }, 120);
        } else {
          window.setTimeout(() => removeAllComparePanels(), 120);
        }
      },
      true
    );

    window.setTimeout(() => {
      window.clearInterval(timer);
      window.clearTimeout(debounce);
      try {
        obs.disconnect();
      } catch (_) {
        /* noop */
      }
    }, 120000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryMarkLoop, { once: true });
  } else {
    tryMarkLoop();
  }
})();
