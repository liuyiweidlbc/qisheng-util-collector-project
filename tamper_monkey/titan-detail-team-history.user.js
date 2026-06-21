// ==UserScript==
// @name         Titan007 两队历史排名快捷入口
// @namespace    https://titan007.com/
// @version      1.3.6
// @description  在 detail 页面增加“两队历史排名”“联赛排名”等快捷按钮，并支持 F1–F4 快捷键；联赛排名链接附带 tm_home/tm_away 等参数，统计 Tab 经独立 Cookie 传递；detail 页 URL 含 tab 参数时自动打开联赛排名并定位对应统计 Tab。
// @match        https://live.titan007.com/detail/*
// @match        http://live.titan007.com/detail/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'tm-team-quick-panel';
  const STYLE_ID = 'tm-team-history-style';
  /** 与 titan-league-standings-mark.user.js 共用，跨子域传递主客参数 */
  const STANDINGS_MARK_COOKIE = 'tm_standings_mark';
  const STANDINGS_TABS_COOKIE = 'tm_standings_tabs';
  const STANDINGS_MARK_COOKIE_MAX_AGE = 300;
  const STANDINGS_TABS_COOKIE_MAX_AGE = 300;

  const TEAM_SUMMARY_HREF =
    'a[href*="team/Summary/"], a[href*="team/summary/"], a[href*="team/Summary."], a[href*="team/summary."]';
  const NAV_EXCLUDE_SEL =
    '#menu, .navigationMenu, .sitenav, #topMenuContent, #site-header-two, #userLoginInfo';
  /** 仅本场对阵区域，避免扫到推荐/导航里的其他球队 */
  const MATCH_HEADER_SEL = '#header .analyhead, #header > .header, #header';

  function parseTeamIdFromHref(href) {
    const m = String(href || '').match(/\/team\/summary\/(\d+)\.html/i);
    return m ? m[1] : null;
  }

  function parseTeamIdFromImgSrc(src) {
    const m = String(src || '').match(/\/Image\/team\/images\/(\d+)\//i);
    return m ? m[1] : null;
  }

  function teamNameFromLink(link) {
    if (!link) return '';
    const t = (link.textContent || '').replace(/\u00a0/g, ' ').trim();
    return t.replace(/\s+\d[\d-]*$/, '').trim();
  }

  function isTeamSummaryAnchor(a) {
    const href = a.getAttribute('href') || '';
    if (!href || /^javascript:/i.test(href)) return false;
    if (/\/team\/(?:player|coach)\//i.test(href)) return false;
    return !!parseTeamIdFromHref(href);
  }

  function isInsideExcludedNav(el) {
    return !!el.closest(NAV_EXCLUDE_SEL);
  }

  function walkRootsDeep(root, visit) {
    if (!root) return;
    visit(root);
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) walkRootsDeep(el.shadowRoot, visit);
    });
  }

  function collectTeamSummaryLinks(root) {
    if (!root) return [];
    const seen = new Set();
    const links = [];
    const addLink = (a) => {
      if (!isTeamSummaryAnchor(a)) return;
      if (isInsideExcludedNav(a)) return;
      const id = parseTeamIdFromHref(a.getAttribute('href'));
      if (!id || seen.has(id)) return;
      seen.add(id);
      links.push(a);
    };
    walkRootsDeep(root, (scope) => {
      scope.querySelectorAll(TEAM_SUMMARY_HREF).forEach(addLink);
    });
    return links;
  }

  /** 从 HTML 源码解析球队链接（DOM 在 iframe/Shadow 中不可访问时） */
  function extractFromHtmlAnchors(html) {
    const re =
      /<a\b[^>]*\bhref\s*=\s*(?:["']([^"']+)["']|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
    const seen = new Set();
    const pairs = [];
    let m;
    while ((m = re.exec(html))) {
      const href = m[1] || m[2] || '';
      const id = parseTeamIdFromHref(href);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const name = String(m[3])
        .replace(/<[^>]+>/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      pairs.push({ id, name });
      if (pairs.length >= 2) break;
    }
    if (pairs.length < 2) return { homeName: '', awayName: '', homeId: null, awayId: null };
    return {
      homeName: pairs[0].name,
      awayName: pairs[1].name,
      homeId: pairs[0].id,
      awayId: pairs[1].id,
    };
  }

  function sideFromDom(link) {
    if (link.closest('.home, .homeN, .homeTeam, [class*="homeTeam"]')) return 'home';
    if (link.closest('.guest, .guestN, .guestTeam, [class*="guestTeam"]')) return 'away';
    return null;
  }

  function metaFromLinks(homeLink, awayLink) {
    return {
      homeName: teamNameFromLink(homeLink),
      awayName: teamNameFromLink(awayLink),
      homeId: parseTeamIdFromHref(homeLink?.getAttribute('href')),
      awayId: parseTeamIdFromHref(awayLink?.getAttribute('href')),
    };
  }

  function extractFromInlineScript(html) {
    const homeNameM = html.match(/var\s+homeTeamName\s*=\s*['"]([^'"]+)['"]/);
    const awayNameM = html.match(/var\s+guestTeamName\s*=\s*['"]([^'"]+)['"]/);
    const homeIdM = html.match(/var\s+homeTeamFlg\s*=\s*['"][^'"]*\/images\/(\d+)\//i);
    const awayIdM = html.match(/var\s+guestTeamFlg\s*=\s*['"][^'"]*\/images\/(\d+)\//i);
    return {
      homeName: homeNameM ? homeNameM[1].trim() : '',
      awayName: awayNameM ? awayNameM[1].trim() : '',
      homeId: homeIdM ? homeIdM[1] : null,
      awayId: awayIdM ? awayIdM[1] : null,
    };
  }

  function extractFromTitle(doc) {
    const m = doc.title.match(/^(.+?)\s+VS\s+(.+?)(?:[(\-（\[]|$)/i);
    if (!m) return { homeName: '', awayName: '', homeId: null, awayId: null };
    return { homeName: m[1].trim(), awayName: m[2].trim(), homeId: null, awayId: null };
  }

  function extractFromFlashIframe(doc) {
    const iframe = doc.querySelector('#flashLive iframe, #liveDiv iframe');
    if (!iframe) return { homeName: '', awayName: '', homeId: null, awayId: null };
    try {
      const u = new URL(iframe.getAttribute('src') || '', doc.location?.href || window.location.href);
      const h = u.searchParams.get('h') || '';
      const g = u.searchParams.get('g') || '';
      return {
        homeName: h ? decodeURIComponent(h) : '',
        awayName: g ? decodeURIComponent(g) : '',
        homeId: null,
        awayId: null,
      };
    } catch (_) {
      return { homeName: '', awayName: '', homeId: null, awayId: null };
    }
  }

  function getMatchHeaderRoot(doc) {
    return doc.querySelector(MATCH_HEADER_SEL);
  }

  function extractMatchTeamsFromHeader(header, doc) {
    if (!header) return { homeName: '', awayName: '', homeId: null, awayId: null };

    const homeA = header.querySelector(
      '.home a[href*="team/Summary"], .home a[href*="team/summary"]'
    );
    const guestA = header.querySelector(
      '.guest a[href*="team/Summary"], .guest a[href*="team/summary"]'
    );
    if (isTeamSummaryAnchor(homeA) || isTeamSummaryAnchor(guestA)) {
      const m = metaFromLinks(
        isTeamSummaryAnchor(homeA) ? homeA : null,
        isTeamSummaryAnchor(guestA) ? guestA : null
      );
      if (m.homeId && m.awayId) return m;
    }

    const links = collectTeamSummaryLinks(header);
    if (links.length >= 2) {
      let homeLink = null;
      let awayLink = null;
      links.forEach((a) => {
        const side = sideFromDom(a);
        if (side === 'home') homeLink = a;
        if (side === 'away') awayLink = a;
      });
      if (homeLink && awayLink) return metaFromLinks(homeLink, awayLink);
      return metaFromLinks(links[0], links[1]);
    }

    const fromHeaderHtml = extractFromHtmlAnchors(header.innerHTML);
    if (fromHeaderHtml.homeId && fromHeaderHtml.awayId) return fromHeaderHtml;

    return { homeName: '', awayName: '', homeId: null, awayId: null };
  }

  function extractMatchTeamsFromDoc(doc) {
    const html = doc.documentElement?.innerHTML || '';

    const scriptMeta = extractFromInlineScript(html);
    if (scriptMeta.homeId && scriptMeta.awayId) return scriptMeta;

    const headerMeta = extractMatchTeamsFromHeader(getMatchHeaderRoot(doc), doc);
    if (headerMeta.homeId && headerMeta.awayId) return headerMeta;

    const lineupTitle = doc.querySelector('#matchData .title, #content .title');
    if (lineupTitle) {
      const homeN = lineupTitle.querySelector(
        '.homeN a[href*="team/Summary"], .homeN a[href*="team/summary"]'
      );
      const guestN = lineupTitle.querySelector(
        '.guestN a[href*="team/Summary"], .guestN a[href*="team/summary"]'
      );
      if (isTeamSummaryAnchor(homeN) && isTeamSummaryAnchor(guestN)) {
        return metaFromLinks(homeN, guestN);
      }
    }

    return mergeMeta(
      scriptMeta,
      headerMeta,
      extractFromFlashIframe(doc),
      extractFromTitle(doc)
    );
  }

  function extractMatchTeams() {
    return extractMatchTeamsFromDoc(document);
  }

  function mergeMeta(...parts) {
    const out = { homeName: '', awayName: '', homeId: null, awayId: null };
    for (const p of parts) {
      if (!p) continue;
      if (!out.homeName && p.homeName) out.homeName = p.homeName;
      if (!out.awayName && p.awayName) out.awayName = p.awayName;
      if (!out.homeId && p.homeId) out.homeId = p.homeId;
      if (!out.awayId && p.awayId) out.awayId = p.awayId;
    }
    return out;
  }

  function extractTeamIds() {
    const { homeId, awayId } = extractMatchTeams();
    const ids = [];
    if (homeId) ids.push(homeId);
    if (awayId && awayId !== homeId) ids.push(awayId);
    return ids;
  }

  function openPagesForBothTeams(urlBuilder, failMessage) {
    const ids = extractTeamIds();
    if (ids.length < 2) {
      alert(failMessage);
      return;
    }

    [...ids].reverse().forEach((id) => {
      window.open(urlBuilder(id), '_blank');
    });
  }

  function openTeamHistoryPages() {
    openPagesForBothTeams(
      (id) => `https://info.titan007.com/cn/team/TeamHistoryOrder/${id}.html`,
      '未能识别两队球队ID，无法打开历史排名页面。'
    );
  }

  function openTeamLineupPages() {
    openPagesForBothTeams(
      (id) => `https://info.titan007.com/cn/team/Lineup/${id}.html`,
      '未能识别两队球队ID，无法打开球员身价页面。'
    );
  }

  function openTeamPlayerDataPages() {
    openPagesForBothTeams(
      (id) => `https://info.titan007.com/cn/team/PlayerData/${id}.html`,
      '未能识别两队球队ID，无法打开球员数据页面。'
    );
  }

  function parseSclassIdFromHref(href) {
    const h = String(href || '');
    let m = h.match(/[?&]sclassid=(\d+)/i);
    if (m) return m[1];
    m = h.match(/\/(?:SubLeague|subleague|League)\/(\d+)\.html/i);
    return m ? m[1] : null;
  }

  function extractSclassId() {
    const header = getMatchHeaderRoot(document);
    if (header) {
      const lName = header.querySelector('a.LName[href*="sclassid="], a.LName[href*="/SubLeague/"]');
      if (lName) {
        const sid = parseSclassIdFromHref(lName.getAttribute('href'));
        if (sid) return sid;
      }
      for (const a of header.querySelectorAll('a[href*="sclassid="], a[href*="/SubLeague/"]')) {
        const sid = parseSclassIdFromHref(a.getAttribute('href'));
        if (sid) return sid;
      }
    }
    const headerHtml = header?.innerHTML || '';
    if (headerHtml) {
      let m = headerHtml.match(/[?&]sclassid=(\d+)/i);
      if (m) return m[1];
      m = headerHtml.match(/\/(?:SubLeague|subleague)\/(\d+)\.html/i);
      if (m) return m[1];
    }
    return null;
  }

  function normTabText(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .trim();
  }

  /** detail 页 tab 参数与联赛页统计 Tab 文案对齐 */
  function normalizeStatsTabForLeague(tab) {
    const t = normTabText(tab);
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

  function getDetailTabParam() {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      return tab ? normalizeStatsTabForLeague(decodeURIComponent(tab)) : '';
    } catch (_) {
      return '';
    }
  }

  /** 统一打开 league.aspx，主客参数写入 query；统计 Tab 仅经 Cookie 传递（URL hash/query 均会干扰页面加载） */
  function buildLeagueStandingsUrl(sid, teams) {
    const u = new URL('https://zq.titan007.com/cn/league.aspx');
    u.searchParams.set('sclassid', sid);
    if (teams.homeName) u.searchParams.set('tm_home', teams.homeName);
    if (teams.awayName) u.searchParams.set('tm_away', teams.awayName);
    if (teams.homeId) u.searchParams.set('tm_home_id', String(teams.homeId));
    if (teams.awayId) u.searchParams.set('tm_away_id', String(teams.awayId));
    return u.toString();
  }

  function saveStandingsMarkCookie(sclassid, teams) {
    const payload = {
      sclassid: String(sclassid),
      tm_home: teams.homeName || '',
      tm_away: teams.awayName || '',
      tm_home_id: teams.homeId ? String(teams.homeId) : '',
      tm_away_id: teams.awayId ? String(teams.awayId) : '',
      ts: Date.now(),
    };
    const val = encodeURIComponent(JSON.stringify(payload));
    document.cookie = `${STANDINGS_MARK_COOKIE}=${val}; path=/; domain=.titan007.com; max-age=${STANDINGS_MARK_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  function saveStandingsTabsCookie(sclassid, tabs) {
    const normalized = normalizeStatsTabForLeague(tabs);
    if (!normalized) return;
    const payload = {
      sclassid: String(sclassid),
      tabs: normalized,
      ts: Date.now(),
    };
    const val = encodeURIComponent(JSON.stringify(payload));
    document.cookie = `${STANDINGS_TABS_COOKIE}=${val}; path=/; domain=.titan007.com; max-age=${STANDINGS_TABS_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  function resolveLeagueStatsTab(tabOverride) {
    if (typeof tabOverride === 'string' && tabOverride.trim()) {
      return normalizeStatsTabForLeague(tabOverride);
    }
    return getDetailTabParam();
  }

  function openLeagueRankingPage(tabOverride) {
    const sid = extractSclassId();
    if (!sid) {
      alert('未能识别联赛ID（sclassid），无法打开联赛排名页面。');
      return false;
    }
    const { homeName, awayName, homeId, awayId } = extractMatchTeams();
    if (!homeId && !awayId) {
      alert('未能识别主客队信息，请确认页面上有球队名称链接后再试。');
      return false;
    }
    const tab = resolveLeagueStatsTab(tabOverride);
    saveStandingsMarkCookie(sid, { homeName, awayName, homeId, awayId });
    if (tab) saveStandingsTabsCookie(sid, tab);
    window.open(buildLeagueStandingsUrl(sid, { homeName, awayName, homeId, awayId }), '_blank');
    return true;
  }

  function tryAutoOpenLeagueRankingFromTab() {
    const tab = getDetailTabParam();
    if (!tab) return;

    const sessionKey = `tm_detail_auto_f4:${window.location.pathname}${window.location.search}`;
    try {
      if (sessionStorage.getItem(sessionKey) === '1') return;
    } catch (_) {
      /* noop */
    }

    let tries = 0;
    const maxTries = 40;
    const timer = window.setInterval(() => {
      tries += 1;
      const sid = extractSclassId();
      const { homeId, awayId } = extractMatchTeams();
      if (sid && (homeId || awayId)) {
        window.clearInterval(timer);
        if (openLeagueRankingPage(tab)) {
          try {
            sessionStorage.setItem(sessionKey, '1');
          } catch (_) {
            /* noop */
          }
        }
        return;
      }
      if (tries >= maxTries) window.clearInterval(timer);
    }, 300);
  }

  function injectButton() {
    if (!document.body || document.getElementById(PANEL_ID)) return;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${PANEL_ID} {
          position: fixed;
          right: 20px;
          bottom: 92px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        #${PANEL_ID} .tm-btn {
          position: relative;
          height: 40px;
          padding: 0 14px 0 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 10px;
          background: rgba(15, 23, 42, 0.92);
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.2px;
          cursor: pointer;
          box-shadow: 0 10px 26px rgba(2, 6, 23, 0.42);
          transition: transform 0.18s ease, box-shadow 0.22s ease, background 0.22s ease, color 0.22s ease;
          backdrop-filter: blur(6px);
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        #${PANEL_ID} .hotkey {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 20px;
          padding: 0;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          line-height: 1;
        }

        #${PANEL_ID} .label {
          white-space: nowrap;
          color: #f1f5f9;
        }

        #${PANEL_ID} .tm-btn:hover {
          transform: translateY(-1px);
          background: rgba(30, 41, 59, 0.96);
          color: #ffffff;
          box-shadow: 0 14px 30px rgba(2, 6, 23, 0.5);
        }

        #${PANEL_ID} .tm-btn:hover .hotkey {
          color: #ffffff;
        }

        #${PANEL_ID} .tm-btn:active {
          transform: translateY(0);
          box-shadow: 0 8px 20px rgba(2, 6, 23, 0.45);
        }
      `;
      document.head.appendChild(style);
    }

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    const buttonConfigs = [
      { hotkey: 'F1', label: '历史排名', title: '打开主客队历史排名 (F1)', onClick: openTeamHistoryPages },
      { hotkey: 'F2', label: '球员身价', title: '打开主客队球员身价 (F2)', onClick: openTeamLineupPages },
      { hotkey: 'F3', label: '球员数据', title: '打开主客队球员数据 (F3)', onClick: openTeamPlayerDataPages },
      { hotkey: 'F4', label: '联赛排名', title: '打开当前赛事联赛排名 (赛程资料统计) (F4)', onClick: () => openLeagueRankingPage() },
    ];

    buttonConfigs.forEach((cfg) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tm-btn';
      button.innerHTML = `<span class="hotkey">${cfg.hotkey}</span><span class="label">${cfg.label}</span>`;
      button.title = cfg.title;
      button.addEventListener('click', cfg.onClick);
      panel.appendChild(button);
    });

    document.body.appendChild(panel);
  }

  function bindHotkey() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        openTeamHistoryPages();
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        openTeamLineupPages();
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        openTeamPlayerDataPages();
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        openLeagueRankingPage();
      }
    });
  }

  function init() {
    injectButton();
    bindHotkey();
    tryAutoOpenLeagueRankingFromTab();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
