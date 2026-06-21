// ==UserScript==
// @name         Titan007 CupMatch 杯赛导出
// @namespace    https://titan007.com/
// @version      1.3.1
// @description  解析 CupMatch 分组赛+淘汰赛，多公司胜平负/亚让/总进球，自动解析，提供面板与下载
// @match        https://info.titan007.com/cn/CupMatch/*
// @match        http://info.titan007.com/cn/CupMatch/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const LOG_PREFIX = '[Titan CupMatch Export]';
  const PANEL_ID = 'tm-cupmatch-group-panel';
  const SCRIPT_VER = '1.3.1';
  const GROUP_LETTERS = 'ABCDEFGH';
  /** 胜平负（欧指 eodds）与亚让/大小（lodds）公司 ID 不同，见 LeagueOdds.js */
  const ODDS_BOOKS = {
    wdl: [
      { key: 'jingcai', id: 1129, name: '竞彩官方' },
      { key: 'hkjc', id: 432, name: '香港马*' },
      { key: 'macau', id: 80, name: '澳*' },
      { key: 'william', id: 115, name: '威廉希*' },
      { key: 'interwetten', id: 104, name: 'Interwet*' },
    ],
    asianHandicap: [
      { key: 'macau', id: 1, name: '澳*' },
      { key: 'ladbrokes', id: 4, name: '立*' },
      { key: 'bet365', id: 8, name: '36*' },
    ],
    totalGoals: [
      { key: 'macau', id: 1, name: '澳*' },
      { key: 'ladbrokes', id: 4, name: '立*' },
      { key: 'bet365', id: 8, name: '36*' },
    ],
  };
  const MACAU_WDL_COMPANY_ID = ODDS_BOOKS.wdl.find((b) => b.key === 'macau').id;
  const DATA_POLL_MS = 300;
  const DATA_TIMEOUT_MS = 45000;

  let lastPayload = null;
  let parsePromise = null;
  let oddsCache = null;
  let collapsed = false;

  function parsePageMeta() {
    const m = location.pathname.match(/\/CupMatch\/(\d+)\/(\d+)\.html/i);
    if (!m) return null;
    return { season: m[1], sclassId: Number(m[2]) };
  }

  function findGroupStageKind(arrCupKind) {
    if (!Array.isArray(arrCupKind)) return null;
    return (
      arrCupKind.find((k) => k[2] === '分组赛' || /group\s*stage/i.test(String(k[4] || ''))) ||
      null
    );
  }

  function listKnockoutStages(arrCupKind, groupStage) {
    if (!Array.isArray(arrCupKind)) return [];
    const groupId = groupStage?.[0];
    return arrCupKind.filter((k) => k[0] !== groupId);
  }

  function buildTeamMap(arrTeam) {
    const map = new Map();
    for (const t of arrTeam || []) {
      if (!Array.isArray(t) || t.length < 4) continue;
      map.set(t[0], {
        id: t[0],
        name: t[1],
        nameTw: t[2],
        nameEn: t[3],
      });
    }
    return map;
  }

  function teamName(teamMap, id) {
    return teamMap.get(id)?.name || String(id);
  }

  function getOddsRows(type, matchId) {
    const key = `${type}_${matchId}`;
    const src =
      oddsCache || (typeof oddsData !== 'undefined' && oddsData ? oddsData : null);
    const rows = src && src[key] ? src[key] : null;
    return Array.isArray(rows) ? rows : null;
  }

  function hasMacauWdlInSource(matchId, src) {
    const rows = src?.[`O_${matchId}`];
    return (
      Array.isArray(rows) && rows.some((r) => Number(r[0]) === MACAU_WDL_COMPANY_ID)
    );
  }

  function oddsSourceReady(matchIds, src) {
    return matchIds.length > 0 && matchIds.every((id) => hasMacauWdlInSource(id, src));
  }

  function collectMatchIds() {
    const ids = new Set();
    const groupStage = findGroupStageKind(
      typeof arrCupKind !== 'undefined' ? arrCupKind : null
    );
    if (!groupStage) return [];

    for (const letter of GROUP_LETTERS) {
      const rows = typeof jh !== 'undefined' ? jh[`G${groupStage[0]}${letter}`] : null;
      if (rows) rows.forEach((r) => ids.add(r[0]));
    }
    for (const stage of listKnockoutStages(arrCupKind, groupStage)) {
      const rows = typeof jh !== 'undefined' ? jh[`G${stage[0]}`] : null;
      if (rows) rows.forEach((r) => ids.add(r[0]));
    }
    return [...ids];
  }

  function parseOddsAjaxText(text) {
    const fn = new Function('oddsData', `${text}; return oddsData;`);
    return fn({});
  }

  async function fetchOddsAjax(season, sclassId) {
    const url =
      `/League/LeagueOddsAjax?sclassId=${encodeURIComponent(sclassId)}` +
      `&subSclassId=&matchSeason=${encodeURIComponent(season)}&round=1`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`赔率接口 HTTP ${res.status}`);
    const text = await res.text();
    if (!/oddsData\["O_/.test(text)) throw new Error('赔率接口返回异常');
    return parseOddsAjaxText(text);
  }

  async function ensureOddsData(meta, matchIds) {
    const pageOdds = typeof oddsData !== 'undefined' ? oddsData : null;
    if (pageOdds && oddsSourceReady(matchIds, pageOdds)) {
      oddsCache = pageOdds;
      return;
    }

    const deadline = Date.now() + DATA_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const liveOdds = typeof oddsData !== 'undefined' ? oddsData : null;
      if (liveOdds && oddsSourceReady(matchIds, liveOdds)) {
        oddsCache = liveOdds;
        return;
      }
      await new Promise((r) => setTimeout(r, DATA_POLL_MS));
    }

    oddsCache = await fetchOddsAjax(meta.season, meta.sclassId);
    if (!oddsSourceReady(matchIds, oddsCache)) {
      const missing = matchIds.filter((id) => !hasMacauWdlInSource(id, oddsCache)).length;
      if (missing === matchIds.length) {
        throw new Error('澳门胜平负赔率加载失败');
      }
      console.warn(LOG_PREFIX, `有 ${missing} 场比赛缺少澳门胜平负`);
    }
  }

  function pickOddsRowById(rows, companyId) {
    if (!rows) return null;
    return rows.find((r) => Number(r[0]) === Number(companyId)) || null;
  }

  /**
   * Titan 原始盘口：正数=主队让球，负数=主队受让。
   * 导出为「主队视角」：正数=受让（如 +0.5 = 受半球），负数=让球（如 -1.5 = 让球半）。
   */
  function normalizeAsianHandicapLine(rawLine) {
    const raw = Number(rawLine);
    if (!isFinite(raw)) return null;
    if (Math.abs(raw) < 1e-9) return 0;
    return -raw;
  }

  const HANDICAP_CN = [
    [2.5, '两球半'],
    [2.25, '两球/两球半'],
    [2, '两球'],
    [1.75, '球半/两球'],
    [1.5, '球半'],
    [1.25, '一球/球半'],
    [1, '一球'],
    [0.75, '半球/一球'],
    [0.5, '半球'],
    [0.25, '平手/半球'],
    [0, '平手'],
  ];

  function handicapMagnitudeLabel(absVal) {
    const v = Math.abs(Number(absVal));
    if (!isFinite(v)) return '';
    for (const [n, label] of HANDICAP_CN) {
      if (Math.abs(v - n) < 1e-6) return label;
    }
    return String(v);
  }

  function formatAsianHandicapLabel(lineHome) {
    const line = Number(lineHome);
    if (!isFinite(line)) return '';
    if (Math.abs(line) < 1e-9) return '平手';
    const mag = handicapMagnitudeLabel(line);
    return line > 0 ? `受${mag}` : mag;
  }

  function formatAsianHandicapSignedDisplay(lineHome) {
    const line = Number(lineHome);
    if (!isFinite(line)) return '';
    if (Math.abs(line) < 1e-9) return '0';
    const abs = Math.abs(line);
    const text = Number.isInteger(abs) ? String(abs) : String(abs);
    return line > 0 ? `+${text}` : `-${text}`;
  }

  function mapAsianHandicapRow(row, book) {
    const line = normalizeAsianHandicapLine(row[2]);
    return {
      companyId: row[0],
      companyName: book.name,
      homeWater: row[1],
      line,
      lineLabel: formatAsianHandicapLabel(line),
      lineDisplay: formatAsianHandicapSignedDisplay(line),
      awayWater: row[3],
    };
  }

  function buildBookOdds(type, matchId, books, mapRow) {
    const rows = getOddsRows(type, matchId);
    const out = {};
    for (const book of books) {
      const row = pickOddsRowById(rows, book.id);
      out[book.key] = row ? mapRow(row, book) : null;
    }
    return out;
  }

  function buildMatchOdds(matchId) {
    return {
      wdl: buildBookOdds('O', matchId, ODDS_BOOKS.wdl, (row, book) => ({
        companyId: row[0],
        companyName: book.name,
        home: row[1],
        draw: row[2],
        away: row[3],
      })),
      asianHandicap: buildBookOdds('L', matchId, ODDS_BOOKS.asianHandicap, mapAsianHandicapRow),
      totalGoals: buildBookOdds('T', matchId, ODDS_BOOKS.totalGoals, (row, book) => ({
        companyId: row[0],
        companyName: book.name,
        overWater: row[1],
        line: row[2],
        underWater: row[3],
      })),
    };
  }

  function countOddsCoverage(matches) {
    const count = (books, getter) =>
      Object.fromEntries(
        books.map((b) => [b.key, matches.filter((m) => getter(m, b.key)).length])
      );
    return {
      wdl: count(ODDS_BOOKS.wdl, (m, k) => m.odds?.wdl?.[k]),
      asianHandicap: count(ODDS_BOOKS.asianHandicap, (m, k) => m.odds?.asianHandicap?.[k]),
      totalGoals: count(ODDS_BOOKS.totalGoals, (m, k) => m.odds?.totalGoals?.[k]),
    };
  }

  function formatKickoffDisplay(isoLike) {
    const s = String(isoLike || '').trim();
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (!m) return s;
    return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  }

  function analysisUrl(matchId) {
    return `${location.origin}/analysis/${matchId}cn.htm`;
  }

  function mapMatchRow(r, teamMap, ctx) {
    const matchId = r[0];

    return {
      matchId,
      stageId: ctx.stageId,
      stageName: ctx.stageName,
      stageNameEn: ctx.stageNameEn || '',
      phase: ctx.phase,
      group: ctx.group ?? null,
      groupLabel: ctx.groupLabel,
      round: ctx.round ?? null,
      roundLabel: ctx.roundLabel,
      kickoff: r[3],
      kickoffDisplay: formatKickoffDisplay(r[3]),
      homeTeamId: r[4],
      awayTeamId: r[5],
      home: teamName(teamMap, r[4]),
      away: teamName(teamMap, r[5]),
      score: r[6],
      halfScore: r[7],
      odds: buildMatchOdds(matchId),
      analysisUrl: analysisUrl(matchId),
    };
  }

  function assignGroupRounds(groupMatches) {
    const sorted = [...groupMatches].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    const dateRound = new Map();
    let roundNo = 0;
    for (const m of sorted) {
      const date = m.kickoff.slice(0, 10);
      if (!dateRound.has(date)) {
        roundNo += 1;
        dateRound.set(date, roundNo);
      }
      m.round = dateRound.get(date);
      m.roundLabel = `第${m.round}轮`;
    }
    return sorted;
  }

  function parseStandings(cupKindId, teamMap) {
    const groups = [];
    for (const letter of GROUP_LETTERS) {
      const key = `S${cupKindId}${letter}`;
      const rows = typeof jh !== 'undefined' && jh[key] ? jh[key] : null;
      if (!rows || !rows.length) continue;
      groups.push({
        group: letter,
        groupLabel: `${letter}组`,
        standings: rows.map((r) => ({
          rank: r[0],
          teamId: r[1],
          team: teamName(teamMap, r[1]),
          played: r[2],
          win: r[3],
          draw: r[4],
          loss: r[5],
          goalsFor: r[6],
          goalsAgainst: r[7],
          goalDiff: r[8],
          points: r[9],
        })),
      });
    }
    return groups;
  }

  function parseGroupMatches(cupKindId, teamMap) {
    const all = [];
    for (const letter of GROUP_LETTERS) {
      const key = `G${cupKindId}${letter}`;
      const rows = typeof jh !== 'undefined' && jh[key] ? jh[key] : null;
      if (!rows || !rows.length) continue;

      const groupMatches = rows.map((r) =>
        mapMatchRow(r, teamMap, {
          stageId: cupKindId,
          stageName: '分组赛',
          stageNameEn: 'Group stage',
          phase: 'group',
          group: letter,
          groupLabel: `${letter}组`,
        })
      );
      all.push(...assignGroupRounds(groupMatches));
    }
    return all.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }

  function parseKnockoutMatches(knockoutStages, teamMap) {
    const stages = [];
    const all = [];

    for (const stage of knockoutStages) {
      const cupKindId = stage[0];
      const key = `G${cupKindId}`;
      const rows = typeof jh !== 'undefined' && jh[key] ? jh[key] : null;
      if (!rows || !rows.length) continue;

      const stageName = stage[2];
      const matches = rows.map((r) =>
        mapMatchRow(r, teamMap, {
          stageId: cupKindId,
          stageName,
          stageNameEn: stage[4] || '',
          phase: 'knockout',
          group: null,
          groupLabel: stageName,
          round: null,
          roundLabel: stageName,
        })
      );

      stages.push({
        id: cupKindId,
        name: stageName,
        nameEn: stage[4] || '',
        matchCount: matches.length,
        matches,
      });
      all.push(...matches);
    }

    return {
      stages,
      matches: all.sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
    };
  }

  function isDataReady() {
    if (typeof jh === 'undefined' || typeof arrTeam === 'undefined' || !Array.isArray(arrCupKind)) {
      return false;
    }
    const group = findGroupStageKind(arrCupKind);
    if (!group) return false;
    if (!jh[`G${group[0]}A`]) return false;

    const knockouts = listKnockoutStages(arrCupKind, group);
    if (!knockouts.length) return true;
    return knockouts.every((k) => Array.isArray(jh[`G${k[0]}`]));
  }

  function waitForPageData() {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        if (isDataReady()) {
          resolve(true);
          return;
        }
        if (Date.now() - start > DATA_TIMEOUT_MS) {
          reject(new Error('资料库数据加载超时，请刷新页面后重试'));
          return;
        }
        setTimeout(tick, DATA_POLL_MS);
      };
      tick();
    });
  }

  function buildPayload() {
    const meta = parsePageMeta();
    if (!meta) throw new Error('无法从 URL 解析赛季/赛事 ID');

    const groupStage = findGroupStageKind(typeof arrCupKind !== 'undefined' ? arrCupKind : null);
    if (!groupStage) throw new Error('当前页面未找到「分组赛」阶段数据');

    const cupKindId = groupStage[0];
    const teamMap = buildTeamMap(typeof arrTeam !== 'undefined' ? arrTeam : []);
    const groupStandings = parseStandings(cupKindId, teamMap);
    const groupMatches = parseGroupMatches(cupKindId, teamMap);
    const knockout = parseKnockoutMatches(
      listKnockoutStages(arrCupKind, groupStage),
      teamMap
    );

    if (!groupStandings.length && !groupMatches.length && !knockout.matches.length) {
      throw new Error('积分榜与赛程均为空');
    }

    const competition =
      typeof arrCup !== 'undefined' && Array.isArray(arrCup)
        ? { sclassId: arrCup[0], name: arrCup[1] }
        : { sclassId: meta.sclassId, name: '' };

    const allMatches = [...groupMatches, ...knockout.matches].sort((a, b) =>
      a.kickoff.localeCompare(b.kickoff)
    );

    return {
      source: 'titan007',
      sourceUrl: location.href,
      parsedAt: new Date().toISOString(),
      scriptVersion: SCRIPT_VER,
      season: meta.season,
      sclassId: meta.sclassId,
      competition,
      groupStage: {
        id: cupKindId,
        name: groupStage[2],
        nameEn: groupStage[4],
        groupCount: groupStage[5] || groupStandings.length,
      },
      summary: {
        groupCount: groupStandings.length,
        groupMatchCount: groupMatches.length,
        knockoutStageCount: knockout.stages.length,
        knockoutMatchCount: knockout.matches.length,
        matchCount: allMatches.length,
        teamCount: new Set(allMatches.flatMap((m) => [m.homeTeamId, m.awayTeamId])).size,
        oddsCoverage: countOddsCoverage(allMatches),
      },
      oddsBooks: {
        wdl: ODDS_BOOKS.wdl.map(({ key, id, name }) => ({ key, companyId: id, companyName: name })),
        asianHandicap: ODDS_BOOKS.asianHandicap.map(({ key, id, name }) => ({
          key,
          companyId: id,
          companyName: name,
        })),
        totalGoals: ODDS_BOOKS.totalGoals.map(({ key, id, name }) => ({
          key,
          companyId: id,
          companyName: name,
        })),
      },
      groupStandings,
      groupMatches,
      knockoutStages: knockout.stages,
      knockoutMatches: knockout.matches,
      allMatches,
    };
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderStandingsHtml(groups) {
    if (!groups.length) return '<div class="empty">暂无积分榜</div>';
    return groups
      .map((g) => {
        const rows = g.standings
          .map(
            (t) =>
              `<tr><td>${t.rank}</td><td>${escapeHtml(t.team)}</td><td>${t.played}</td><td>${t.win}</td><td>${t.draw}</td><td>${t.loss}</td><td>${t.goalsFor}</td><td>${t.goalsAgainst}</td><td>${t.goalDiff}</td><td>${t.points}</td></tr>`
          )
          .join('');
        return `<div class="sec-title">${escapeHtml(g.groupLabel)}</div>
          <table class="mini"><thead><tr><th>#</th><th>球队</th><th>场</th><th>胜</th><th>平</th><th>负</th><th>得</th><th>失</th><th>净</th><th>分</th></tr></thead><tbody>${rows}</tbody></table>`;
      })
      .join('');
  }

  function fmtAh(m) {
    const ah = m.odds?.asianHandicap?.macau;
    if (!ah) return '-';
    const lineText = ah.lineLabel || ah.lineDisplay || ah.line;
    return `${ah.homeWater} / ${lineText} / ${ah.awayWater}`;
  }

  function fmtOu(m) {
    const ou = m.odds?.totalGoals?.macau;
    if (!ou) return '-';
    return `${ou.overWater} / ${ou.line} / ${ou.underWater}`;
  }

  function fmtWdl(m) {
    const w = m.odds?.wdl?.macau;
    if (!w) return '-';
    return `${w.home} / ${w.draw} / ${w.away}`;
  }

  function renderMatchesHtml(matches, { showGroup = true } = {}) {
    if (!matches.length) return '<div class="empty">暂无赛程</div>';
    const labelHead = showGroup ? '小组' : '阶段';
    const rows = matches
      .map(
        (m) =>
          `<tr>
            <td>${escapeHtml(m.kickoffDisplay)}</td>
            <td>${escapeHtml(m.groupLabel || m.stageName || '-')}</td>
            <td>${escapeHtml(m.roundLabel || m.round || '-')}</td>
            <td>${escapeHtml(m.home)}</td>
            <td>${escapeHtml(m.score)}</td>
            <td>${escapeHtml(m.away)}</td>
            <td>${fmtWdl(m)}</td>
            <td>${fmtAh(m)}</td>
            <td>${fmtOu(m)}</td>
            <td><a href="${escapeHtml(m.analysisUrl)}" target="_blank" rel="noopener">析</a></td>
          </tr>`
      )
      .join('');
    return `<table class="wide">
      <thead><tr>
        <th>时间</th><th>${labelHead}</th><th>轮次</th><th>主队</th><th>比分</th><th>客队</th>
        <th>胜平负(澳)</th><th>亚让(澳)</th><th>总进球(澳)</th><th>析</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  }

  function setDownloadEnabled(enabled) {
    const btn = document.getElementById(PANEL_ID)?.querySelector('[data-action="download"]');
    if (btn) {
      btn.disabled = !enabled;
      btn.title = enabled ? '' : '数据加载中…';
    }
  }

  function renderPanelBody(payload, statusText) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const statusEl = panel.querySelector('.status');
    const summaryEl = panel.querySelector('.summary');
    const standingsEl = panel.querySelector('.standings-wrap');
    const groupEl = panel.querySelector('.group-wrap');
    const knockoutEl = panel.querySelector('.knockout-wrap');
    const jsonEl = panel.querySelector('.json-pre');

    if (statusEl) statusEl.textContent = statusText || '';
    if (!payload) {
      if (summaryEl) summaryEl.textContent = '正在加载数据…';
      if (standingsEl) standingsEl.innerHTML = '<div class="empty">正在解析…</div>';
      if (groupEl) groupEl.innerHTML = '';
      if (knockoutEl) knockoutEl.innerHTML = '';
      if (jsonEl) jsonEl.textContent = '';
      return;
    }

    const s = payload.summary;
    const oc = s.oddsCoverage;
    if (summaryEl) {
      summaryEl.textContent =
        `${payload.competition.name || '赛事'} ${payload.season} · ` +
        `小组 ${s.groupMatchCount} 场 · 淘汰 ${s.knockoutMatchCount} 场 · 共 ${s.matchCount} 场 · ` +
        `胜平负(澳) ${oc.wdl.macau}/${s.matchCount} · 亚让(澳) ${oc.asianHandicap.macau}/${s.matchCount}`;
    }
    if (standingsEl) standingsEl.innerHTML = renderStandingsHtml(payload.groupStandings);
    if (groupEl) groupEl.innerHTML = renderMatchesHtml(payload.groupMatches, { showGroup: true });
    if (knockoutEl) {
      knockoutEl.innerHTML = renderMatchesHtml(payload.knockoutMatches, { showGroup: false });
    }
    if (jsonEl) jsonEl.textContent = JSON.stringify(payload, null, 2);
  }

  function downloadPayload(payload) {
    if (!payload) return;
    const name = `titan-cupmatch-${payload.season}-s${payload.sclassId}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runParse(showStatus = true) {
    const panel = ensurePanel();
    const statusEl = panel.querySelector('.status');
    if (showStatus && statusEl) statusEl.textContent = '等待页面数据…';
    setDownloadEnabled(false);

    try {
      const meta = parsePageMeta();
      if (!meta) throw new Error('非 CupMatch 页面');
      await waitForPageData();
      const matchIds = collectMatchIds();
      if (showStatus && statusEl) statusEl.textContent = '加载赔率数据…';
      await ensureOddsData(meta, matchIds);
      lastPayload = buildPayload();
      renderPanelBody(lastPayload, `已就绪 · ${new Date().toLocaleTimeString()}`);
      setDownloadEnabled(true);
      console.info(LOG_PREFIX, lastPayload.summary, lastPayload);
      return lastPayload;
    } catch (err) {
      lastPayload = null;
      renderPanelBody(null, `解析失败：${err.message || err}`);
      setDownloadEnabled(false);
      console.warn(LOG_PREFIX, err);
      throw err;
    }
  }

  function ensureParsed() {
    if (lastPayload) return Promise.resolve(lastPayload);
    if (!parsePromise) {
      parsePromise = runParse(false).finally(() => {
        parsePromise = null;
      });
    }
    return parsePromise;
  }

  async function handleDownload() {
    const btn = document.getElementById(PANEL_ID)?.querySelector('[data-action="download"]');
    if (btn) btn.disabled = true;
    try {
      const payload = await ensureParsed();
      if (payload) downloadPayload(payload);
    } catch (_) {
      /* status already shown */
    } finally {
      setDownloadEnabled(!!lastPayload);
    }
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = PANEL_ID;

    const style = document.createElement('style');
    style.textContent = `
      #${PANEL_ID}{
        position:fixed;right:12px;bottom:12px;z-index:2147483646;
        width:min(980px,calc(100vw - 24px));height:min(72vh,620px);
        background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:10px;
        box-shadow:0 8px 32px rgba(0,0,0,.45);font:12px/1.45 system-ui,sans-serif;
        display:flex;flex-direction:column;overflow:hidden
      }
      #${PANEL_ID}.collapsed{height:auto;width:min(520px,calc(100vw - 24px))}
      #${PANEL_ID}.collapsed .body{display:none}
      #${PANEL_ID} .hdr{
        display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;
        padding:8px 12px;background:#1e293b;border-bottom:1px solid #334155
      }
      #${PANEL_ID} .hdr strong{font-size:13px}
      #${PANEL_ID} .hdr .sub{font-size:11px;color:#94a3b8;margin-left:6px}
      #${PANEL_ID} .hdr .status{font-size:11px;color:#64748b;flex:1 1 100%}
      #${PANEL_ID} .hdr button{
        margin-left:4px;padding:4px 10px;border-radius:6px;border:1px solid #475569;
        background:#334155;color:#fff;cursor:pointer
      }
      #${PANEL_ID} .hdr button:disabled{opacity:.5;cursor:not-allowed}
      #${PANEL_ID} .summary{padding:6px 12px;background:#172033;border-bottom:1px solid #1e293b;color:#cbd5e1}
      #${PANEL_ID} .tabs{display:flex;gap:4px;padding:6px 12px;background:#172033;border-bottom:1px solid #1e293b}
      #${PANEL_ID} .tabs button{
        padding:3px 10px;border-radius:999px;border:1px solid #475569;background:#0f172a;color:#cbd5e1;cursor:pointer
      }
      #${PANEL_ID} .tabs button.active{background:#2563eb;border-color:#3b82f6;color:#fff}
      #${PANEL_ID} .body{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 12px}
      #${PANEL_ID} .pane{display:none}
      #${PANEL_ID} .pane.active{display:block}
      #${PANEL_ID} table{border-collapse:collapse;width:100%;margin-bottom:12px}
      #${PANEL_ID} table.mini th,#${PANEL_ID} table.mini td{padding:4px 6px;border-bottom:1px solid #1e293b;text-align:center}
      #${PANEL_ID} table.mini th:first-child,#${PANEL_ID} table.mini td:first-child,
      #${PANEL_ID} table.mini th:nth-child(2),#${PANEL_ID} table.mini td:nth-child(2){text-align:left}
      #${PANEL_ID} table.wide th,#${PANEL_ID} table.wide td{padding:5px 6px;border-bottom:1px solid #1e293b;vertical-align:top;word-break:break-word}
      #${PANEL_ID} table.wide th{position:sticky;top:0;background:#0f172a;color:#94a3b8;z-index:1}
      #${PANEL_ID} .sec-title{margin:8px 0 4px;font-weight:600;color:#93c5fd}
      #${PANEL_ID} a{color:#38bdf8;text-decoration:none}
      #${PANEL_ID} .empty{padding:12px;color:#94a3b8}
      #${PANEL_ID} .json-pre{
        margin:0;padding:10px;background:#020617;border:1px solid #1e293b;border-radius:8px;
        white-space:pre-wrap;word-break:break-word;font:11px/1.45 ui-monospace,Consolas,monospace;color:#cbd5e1
      }
    `;

    const hdr = document.createElement('div');
    hdr.className = 'hdr';
    hdr.innerHTML = `
      <div>
        <strong>Titan007 杯赛导出</strong>
        <span class="sub">v${SCRIPT_VER}</span>
        <div class="status">正在加载…</div>
      </div>
      <span>
        <button type="button" data-action="refresh">刷新</button>
        <button type="button" data-action="download" disabled>下载 JSON</button>
        <button type="button" data-action="toggle">${collapsed ? '展开' : '折叠'}</button>
      </span>
    `;

    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.textContent = '正在加载数据…';

    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    tabs.innerHTML = `
      <button type="button" data-tab="standings" class="active">积分榜</button>
      <button type="button" data-tab="group">小组赛</button>
      <button type="button" data-tab="knockout">淘汰赛</button>
      <button type="button" data-tab="json">JSON</button>
    `;

    const body = document.createElement('div');
    body.className = 'body';
    body.innerHTML = `
      <div class="pane active" data-pane="standings"><div class="standings-wrap"><div class="empty">正在解析…</div></div></div>
      <div class="pane" data-pane="group"><div class="group-wrap"></div></div>
      <div class="pane" data-pane="knockout"><div class="knockout-wrap"></div></div>
      <div class="pane" data-pane="json"><pre class="json-pre"></pre></div>
    `;

    panel.append(style, hdr, summary, tabs, body);
    document.body.appendChild(panel);

    hdr.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'refresh') {
        parsePromise = null;
        oddsCache = null;
        runParse(true);
      } else if (action === 'download') {
        handleDownload();
      } else if (action === 'toggle') {
        collapsed = !collapsed;
        panel.classList.toggle('collapsed', collapsed);
        btn.textContent = collapsed ? '展开' : '折叠';
      }
    });

    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      const tab = btn.dataset.tab;
      tabs.querySelectorAll('button[data-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      body.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
    });

    return panel;
  }

  function boot() {
    ensurePanel();
    parsePromise = runParse(false).finally(() => {
      parsePromise = null;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
