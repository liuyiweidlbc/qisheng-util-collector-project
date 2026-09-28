// ==UserScript==
// @name         Sofa 进攻图抽屉
// @namespace    https://smartodds.xyz/
// @version      1.0.0
// @description  在 SofaScore 比赛页点击原始进攻图，从底部上拉抽屉，用源站接口绘制增强攻压图
// @match        https://www.sofascore.com/football/match/*
// @match        https://www.sofascore.com/*/football/match/*
// @match        https://sofascore.com/football/match/*
// @match        https://sofascore.com/*/football/match/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (!/\/football\/match\//.test(location.pathname)) {
    return;
  }

  const API = 'https://api.sofascore.com/api/v1';
  const SCALE = 0.58;
  /** 分钟格之间留约 1px 浅缝，对应源站条间细白线 */
  const GRAPH_W = 920;
  const CENTER_Y = 54;
  const MENU_FALLBACK_HEIGHT = 73;
  const DRAWER_EXTRA_HEIGHT = 132;
  const BIG_CHANCE_XG = 0.35;

  const SVG = {
    penalty: 'M8.07 5.45c2.63 0 4.77 2.14 4.77 4.77 0 2.63-2.14 4.77-4.77 4.77-2.63 0-4.77-2.14-4.77-4.77 0-2.63 2.14-4.77 4.77-4.77zm.19 1.2h-.2c-.92 0-1.75.35-2.39.92l.63.37-.45 1.69-1.37.49v.12c0 .45.08.89.24 1.29l.64-.33 1.06 1.18-.17.94c.54.32 1.16.5 1.82.5 1.98 0 3.59-1.61 3.59-3.59 0-1.04-.44-1.96-1.14-2.62l-.6.55-1.86-.78.2-.73zm1.52 2.78.95 1.73-1.42 1.56-1.41-.55v-2.06l1.88-.68zM15 1v6.75h-1.5V2.5h-11v5.25H1V1h14z',
    ownGoal: 'M5 1v2.25h8.75V7.1c.77.84 1.25 1.94 1.25 3.17 0 2.61-2.12 4.73-4.73 4.73a4.74 4.74 0 0 1-4.73-4.73c0-2.6 2.13-4.72 4.73-4.72.71 0 1.38.17 1.98.45V4.75H5V7H4L1 4l3-3h1zm5.46 5.73h-.19c-.91 0-1.73.35-2.36.91l.62.37-.45 1.67-1.36.48v.12c0 .45.09.88.24 1.28l.63-.32 1.05 1.17-.17.93c.53.31 1.14.49 1.8.49l.01-.01a3.55 3.55 0 0 0 3.55-3.55c0-1.02-.44-1.94-1.13-2.59l-.59.55-1.84-.78.19-.72zm1.5 2.75.94 1.72-1.4 1.55-1.4-.55v-2.04l1.86-.68z',
    missed: 'm10.6 7 1.399 1.524-2.522 2.474L12 13.474 10.6 15 8 12.448 5.399 15 4 13.474l2.522-2.476L4 8.524 5.399 7l2.6 2.549L10.6 7zM15 1v6.75h-1.5V2.5h-11v5.25H1V1h14z',
    regular: 'M8 1c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.14-7-7 3.14-7 7-7zm-.01 1.73c-1.35 0-2.57.52-3.5 1.35l.92.55-.66 2.48-2.01.72V8c0 .67.13 1.31.36 1.9l.94-.48 1.55 1.73-.25 1.38c.78.46 1.69.73 2.66.73a5.29 5.29 0 0 0 5.26-5.28c0-1.51-.65-2.87-1.67-3.83l-.88.81-2.72-1.15.29-1.07c-.1-.01-.19-.01-.29-.01zm2.51 4.1 1.39 2.54-2.07 2.29-2.08-.81V7.83l2.76-1z',
    red: 'M3 1h10v14H3z',
    yellowRed: 'M13.5 1v10.56H5.94V1h7.56z',
    'substitution-regular': 'M12.616 7.771c.735.972.885 2.439.34 3.581-.566 1.162-1.714 1.829-3.164 1.829H5.103v1.98l-3.766-2.666L5.103 9.83v2.21h4.689c1.299 0 1.883-.649 2.146-1.182.358-.762.283-1.752-.207-2.38zM10.714.838l3.766 2.667-3.766 2.666v-2.21H6.026c-1.3 0-1.883.649-2.147 1.182-.358.762-.282 1.752.207 2.38l-.885.706c-.753-.953-.885-2.439-.339-3.581.565-1.162 1.714-1.829 3.164-1.829h4.688V.839z',
  };
  const SHOT_OFF_PATH = 'M256 48C141.1 48 48 141.1 48 256s93.1 208 208 208 208-93.1 208-208S370.9 48 256 48zm52.7 283.3L256 278.6l-52.7 52.7c-6.2 6.2-16.4 6.2-22.6 0-3.1-3.1-4.7-7.2-4.7-11.3 0-4.1 1.6-8.2 4.7-11.3l52.7-52.7-52.7-52.7c-3.1-3.1-4.7-7.2-4.7-11.3 0-4.1 1.6-8.2 4.7-11.3 6.2-6.2 16.4-6.2 22.6 0l52.7 52.7 52.7-52.7c6.2-6.2 16.4-6.2 22.6 0 6.2 6.2 6.2 16.4 0 22.6L278.6 256l52.7 52.7c6.2 6.2 6.2 16.4 0 22.6-6.2 6.3-16.4 6.3-22.6 0z';
  const SHOT_CIRCLE = 'M8 1.2a6.8 6.8 0 1 0 0 13.6A6.8 6.8 0 0 0 8 1.2z';

  const state = {
    matchId: null,
    open: false,
    loading: false,
    showRegulationXg: false,
    showPeriodXgot: true,
    panelView: 'xg',
    timelineFilter: '',
    timelineRegulation: false,
    profilePeriod: 'ALL',
    distMode: '',
    goalDist: null,
    goalDistLoading: false,
    model: null,
    tips: [],
    pollTimer: null,
    drag: null,
  };

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function listOf(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : Object.values(value);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function readMatchId() {
    const hash = location.hash || '';
    const fromHash = hash.match(/(?:^|[#&])id:(\d+)/);
    if (fromHash) return fromHash[1];
    const query = new URLSearchParams(location.search).get('id');
    if (query && /^\d+$/.test(query)) return query;
    return null;
  }

  function matchMinute(item) {
    const time = num(item?.time);
    if (time == null) return null;
    const added = num(item?.addedTime);
    return time + (added != null && added > 0 ? added : 0);
  }

  function isShootoutIncident(item) {
    if (!item) return false;
    if (item.shootoutOrder != null) return true;
    const cls = String(item.incidentClass || '').toLowerCase();
    if (cls.includes('shootout')) return true;
    if (String(item.situation || '').toLowerCase() === 'shootout') return true;
    const minute = matchMinute(item);
    return minute != null && minute > 120;
  }

  function isShootoutShot(shot) {
    if (!shot) return false;
    if (shot.shootoutOrder != null) return true;
    return String(shot.situation || '').toLowerCase() === 'shootout';
  }

  function eventMinute(item) {
    const time = num(item?.time);
    if (time == null) return null;
    const added = num(item?.addedTime);
    if (added != null && added > 0) {
      if (time === 45) return 45.5;
      if (time === 90) return 90.5;
      if (time === 105) return 105.5;
      if (time === 120) return 120.5;
    }
    return time;
  }

  /** 45/90（及加时末）的 addedTime 是补时；节内时钟超过 90 才是加时 */
  function periodPhaseLabel(item) {
    const time = num(item?.time);
    const added = num(item?.addedTime);
    const stoppage = added != null && added > 0 && added < 100 && (time === 45 || time === 90 || time === 105 || time === 120);
    if (time != null && time > 90) return '加时';
    if (stoppage) return '补时';
    return '';
  }

  function formatClockMinute(item) {
    const time = item?.time;
    if (time == null || time === '') return '';
    const added = num(item?.addedTime);
    const clock = added != null && added > 0 && added < 100 ? `${time}+${added}'` : `${time}'`;
    const phase = periodPhaseLabel(item);
    return phase ? `${clock} ${phase}` : clock;
  }

  function hasExtraTime(points) {
    return points.some((point) => {
      const minute = num(point?.minute);
      return minute != null && minute >= 91;
    });
  }

  function slotCount(extra) {
    return extra ? 123 : 92;
  }

  function slotIndex(minute, extra) {
    const m = num(minute);
    if (m == null) return null;
    if (m < 45.5) return Math.floor(m);
    if (m === 45.5) return 45;
    if (m < 90.5) return Math.floor(m);
    if (m === 90.5) return 91;
    if (!extra) return null;
    if (m < 105.5) return 92 + Math.floor(m - 91);
    if (m === 105.5) return 105;
    if (m < 120.5) return 107 + Math.floor(m - 106);
    if (m === 120.5) return 122;
    return null;
  }

  function useSequentialSlots(points, extra) {
    if (!points.length) return false;
    const minutes = points.map((point) => num(point?.minute));
    if (!minutes.some((minute) => minute != null)) return true;
    if (extra) return false;
    const maxMinute = minutes.reduce((max, minute) => (minute == null ? max : Math.max(max, minute)), 0);
    return points.length > 47 && maxMinute <= 45.5;
  }

  function buildBars(points, extra) {
    const slots = slotCount(extra);
    const column = GRAPH_W / slots;
    const gap = 1.4;
    const width = column - gap;
    const sequential = useSequentialSlots(points, extra);
    const bars = [];
    points.forEach((point, index) => {
      const raw = num(point?.value);
      if (raw == null) return;
      const minute = num(point?.minute);
      const slot = sequential || minute == null ? index : slotIndex(minute, extra);
      if (slot == null || slot < 0 || slot >= slots) return;
      const value = Number((raw * SCALE).toFixed(2));
      const height = Math.abs(value);
      let y = CENTER_Y;
      let fill = '#374df5';
      if (value > 0) {
        y = CENTER_Y - height;
        fill = '#0bb32a';
      }
      const x = slot * column + gap / 2;
      const showMinute = minute != null ? minute : index + 1;
      bars.push({ x, y, width, height, fill, title: `${showMinute}' [press: ${height}]` });
    });
    return bars;
  }

  function slotLeft(slot, extra) {
    return 1 + slot * (GRAPH_W / slotCount(extra));
  }

  function iconX(minute, extra, iconWidth) {
    const slot = slotIndex(minute, extra);
    if (slot == null) return null;
    const left = slotLeft(slot, extra);
    return Math.min(left, Math.max(0, GRAPH_W - iconWidth));
  }

  function periodLines(extra) {
    const lines = [];
    const full = (x, width) => lines.push({ x1: x, x2: x, y1: 0, y2: 108, width, dash: '' });
    if (!extra) {
      full(slotLeft(46, false), 3);
      full(GRAPH_W + 0.5, 3);
    } else {
      const line4 = GRAPH_W + 0.5;
      const line2 = (line4 - 1.5) / 4 * 3;
      const line1 = (line2 - 0.5) / 2;
      const line3 = (line4 - 1.5) / 4 / 2 + line2;
      full(line4, 2);
      full(line3, 2);
      full(line2, 4);
      full(line1, 4);
      full(slotLeft(92, true), 2);
    }
    [15, 30, 60, 75].forEach((minute) => {
      const slot = slotIndex(minute, extra);
      if (slot == null) return;
      const x = slotLeft(slot, extra);
      lines.push({ x1: x, x2: x, y1: 2, y2: 78, width: 1, dash: '3 2' });
    });
    return lines;
  }

  function playerLabel(player, fallback) {
    if (player && typeof player === 'object') {
      const jersey = player.jerseyNumber ? `${player.jerseyNumber} ` : '';
      return `${jersey}${player.shortName || player.name || ''}`.trim();
    }
    return fallback || '';
  }

  function xgTier(value) {
    const v = Number(value) || 0;
    if (v >= BIG_CHANCE_XG) return 'high';
    if (v >= 0.15) return 'medium';
    return 'low';
  }

  function isOnTargetShot(shot) {
    const type = String(shot?.shotType || '').toLowerCase();
    return type === 'goal' || type === 'save';
  }

  function shotHighlight(shot) {
    if (!isOnTargetShot(shot)) return null;
    const xg = xgTier(shot?.xg);
    const xgot = shot?.xgot != null && shot?.xgot !== '' ? xgTier(shot.xgot) : 'low';
    const rank = { low: 0, medium: 1, high: 2 };
    const best = rank[xgot] > rank[xg] ? xgot : xg;
    return best === 'low' ? null : best;
  }

  function shotSize(highlight) {
    if (highlight === 'high') return 20;
    if (highlight === 'medium') return 18;
    return 16;
  }

  function shotY(shot, size) {
    const off = !isOnTargetShot(shot);
    if (shot?.isHome) {
      const anchorBottom = (off ? -28 : -16) + 16;
      return anchorBottom - size;
    }
    return off ? 132 : 120;
  }

  function formatXg(value) {
    return Number(value || 0).toFixed(2);
  }

  function sumXg(shots, regulationOnly) {
    const totals = { home: 0, away: 0, homeXgot: 0, awayXgot: 0 };
    shots.forEach((shot) => {
      if (isShootoutShot(shot)) return;
      const minute = num(shot?.time);
      if (minute == null || minute > 120) return;
      if (regulationOnly && minute > 90) return;
      const xg = Number(shot?.xg) || 0;
      const xgot = shot?.xgot != null && shot.xgot !== '' ? Number(shot.xgot) || 0 : 0;
      if (shot?.isHome) {
        totals.home += xg;
        totals.homeXgot += xgot;
      } else {
        totals.away += xg;
        totals.awayXgot += xgot;
      }
    });
    return totals;
  }

  function pageTeamImgSrc(teamId, teamName) {
    const idNeedle = teamId ? `/team/${teamId}` : '';
    let fallback = '';
    document.querySelectorAll('img').forEach((img) => {
      if (fallback && img.naturalWidth <= 0) return;
      if (img.closest('#sofa-atk-drawer, #sofa-atk-modal')) return;
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (!src) return;
      const matched = (idNeedle && src.includes(idNeedle)) || (teamName && img.alt === teamName);
      if (!matched) return;
      if (img.naturalWidth > 0) fallback = src;
      else if (!fallback) fallback = src;
    });
    return fallback || (teamId ? `https://img.sofascore.com/api/v1/team/${teamId}/image` : '');
  }

  function firstGoalSide(incidents) {
    const first = incidents
      .filter((item) => item?.incidentType === 'goal' && !isShootoutIncident(item))
      .map((item) => ({ item, minute: matchMinute(item) ?? num(item?.time) }))
      .filter((entry) => entry.minute != null)
      .sort((a, b) => a.minute - b.minute)[0];
    if (!first) return null;
    return first.item.isHome ? 'home' : 'away';
  }

  function plainIncident(item) {
    const minute = item.addedTime > 0 && item.addedTime < 100 ? `${item.time}+${item.addedTime}` : item.time;
    const rows = [`${minute}'`];
    if (item.incidentType === 'substitution') {
      const inn = playerLabel(item.playerIn, item.playerInName);
      const out = playerLabel(item.playerOut, item.playerOutName);
      if (inn) rows.push(`换上 ${inn}`);
      if (out) rows.push(`换下 ${out}`);
    } else {
      const name = playerLabel(item.player, item.playerName);
      if (name) rows.push(name);
      if (item.incidentType === 'goal' && item.homeScore != null) {
        rows.push(`${item.homeScore} - ${item.awayScore}`);
      }
    }
    return rows.join(' · ');
  }

  function tipJersey(player, extras) {
    const shirt = player?.shirtNumber;
    if (shirt != null && String(shirt).trim()) return String(shirt).trim();
    const jersey = player?.jerseyNumber;
    if (jersey != null && String(jersey).trim()) return String(jersey).trim();
    for (const value of extras || []) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 1 && n <= 99) return String(n);
    }
    const number = Number(player?.number);
    return Number.isFinite(number) && number >= 1 && number <= 99 ? String(number) : '';
  }

  function tipPlayer(player, nameFallback, extras) {
    const name = String(player?.name || player?.shortName || nameFallback || '').trim();
    const jersey = tipJersey(player, extras);
    if (name && jersey) return `${jersey}# ${name}`;
    return name || (jersey ? `${jersey}#` : '');
  }

  function xgQuality(value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v < 0) return { tier: 'minimal', hint: '偏小' };
    if (v >= BIG_CHANCE_XG) return { tier: 'high', hint: '绝佳' };
    if (v >= 0.15) return { tier: 'medium', hint: '较好' };
    if (v >= 0.05) return { tier: 'low', hint: '一般' };
    return { tier: 'minimal', hint: '偏小' };
  }

  function metricRow(label, value, tone) {
    const quality = xgQuality(value);
    return {
      label,
      value: Number(value).toFixed(2),
      tier: quality.tier,
      hint: quality.hint,
      metricTone: tone,
    };
  }

  function shotDetailRows(shot, incident) {
    const rows = [];
    const situation = enumLabel(shot?.situation || incident?.situation, SITUATION_LABELS);
    if (situation) rows.push({ label: '机会来源', value: situation });
    const body = enumLabel(shot?.bodyPart || incident?.bodyPart, BODY_LABELS);
    if (body) rows.push({ label: '射门方式', value: body });
    return rows;
  }

  function incidentTip(item, shots, home, away) {
    const type = item.incidentType;
    const cls = item.incidentClass;
    const meta = ({
      goal: { regular: ['⚽', '进球'], penalty: ['⚽', '点球进球'], ownGoal: ['⚽', '乌龙球'] },
      card: { red: ['🟥', '红牌'], yellowRed: ['🟥', '两黄变一红'] },
      inGamePenalty: { missed: ['✗', '点球未进'] },
      substitution: { regular: ['↔', '换人'] },
    }[type] || {})[cls] || ['•', '比赛事件'];
    const rows = [];
    if (type === 'substitution') {
      const inn = tipPlayer(item.playerIn, item.playerInName, [item.playerInShirtNumber, item.playerInJerseyNumber]);
      const out = tipPlayer(item.playerOut, item.playerOutName, [item.playerOutShirtNumber, item.playerOutJerseyNumber]);
      if (inn) rows.push({ label: '换上', value: inn, valueTone: 'player-name' });
      if (out) rows.push({ label: '换下', value: out });
    } else {
      const name = tipPlayer(item.player, item.playerName, [item.shirtNumber, item.jerseyNumber]);
      if (name) rows.push({ label: '球员', value: name, valueTone: 'player-name' });
      if (type === 'goal') {
        const assist = tipPlayer(item.assist1, item.assist1Name, [item.assist1ShirtNumber, item.assist1JerseyNumber]);
        if (assist) rows.push({ label: '助攻', value: assist, valueTone: 'assist-name' });
        const shot = findGoalShot(item, shots);
        rows.push(...shotDetailRows(shot, item));
        if (shot) {
          rows.push(metricRow('xG', shot.xg || 0, 'xg'));
          if (shot.xgot != null && shot.xgot !== '') rows.push(metricRow('xGOT', shot.xgot, 'xgot'));
        }
      }
    }
    if (type === 'goal' && item.homeScore != null && item.awayScore != null) {
      rows.push({ label: '比分', value: `${item.homeScore} - ${item.awayScore}` });
    }
    const reason = String(item.reason || item.description || '').trim();
    if (reason && reason !== 'undefined') rows.push({ label: '说明', value: reason });
    const shot = type === 'goal' ? findGoalShot(item, shots) : null;
    return {
      badge: meta[0],
      title: meta[1],
      minuteLabel: formatClockMinute(item),
      teamName: item.isHome ? (home.shortName || home.name || '主队') : (away.shortName || away.name || '客队'),
      isHome: !!item.isHome,
      location: shotLocation(shot),
      rows,
    };
  }

  function shotTip(shot, incidents, home, away) {
    const onTarget = isOnTargetShot(shot);
    const rows = [];
    const name = tipPlayer(shot.player, '', [shot.shirtNumber, shot.jerseyNumber]);
    if (name) rows.push({ label: '球员', value: name, valueTone: 'player-name' });
    const goal = shot.shotType === 'goal'
      ? (incidents || []).find((item) => item.incidentType === 'goal' && findGoalShot(item, [shot]))
      : null;
    const assist = tipPlayer(shot.assist1, shot.assist1Name, [shot.assist1ShirtNumber])
      || tipPlayer(goal?.assist1, goal?.assist1Name, [goal?.assist1ShirtNumber, goal?.assist1JerseyNumber]);
    if (assist) rows.push({ label: '助攻', value: assist, valueTone: 'assist-name' });
    rows.push(metricRow('xG', shot.xg || 0, 'xg'));
    if (shot.xgot != null && shot.xgot !== '') rows.push(metricRow('xGOT', shot.xgot, 'xgot'));
    const result = { miss: '射偏', block: '被封堵', goal: '进球' }[shot.shotType];
    if (result) rows.push({ label: '结果', value: result });
    return {
      badge: onTarget ? '✓' : '✗',
      title: onTarget ? '射正' : (shot.shotType === 'block' ? '被封堵' : '射偏'),
      titleTone: onTarget ? 'shot-on' : 'shot-off',
      minuteLabel: formatClockMinute(shot),
      teamName: shot.isHome ? (home.shortName || home.name || '主队') : (away.shortName || away.name || '客队'),
      isHome: !!shot.isHome,
      location: shotLocation(shot),
      rows,
    };
  }

  function buildModel(eventBody, graphBody, incidentBody, shotBody) {
    const event = eventBody?.event || {};
    const home = event.homeTeam || {};
    const away = event.awayTeam || {};
    const points = listOf(graphBody?.graphPoints);
    const extra = hasExtraTime(points);
    const incidents = listOf(incidentBody?.incidents);
    const shots = listOf(shotBody?.shotmap).filter((shot) => !isShootoutShot(shot));
    const fullXg = sumXg(shots, false);
    const regXg = sumXg(shots, true);
    const icons = [];
    const tips = [];

    function pushTip(text) {
      const id = tips.length;
      tips.push(text);
      return id;
    }

    incidents.forEach((item) => {
      if (item.incidentType === 'goal' && isShootoutIncident(item)) return;
      const allowed = item.incidentType === 'goal'
        || (item.incidentType === 'card' && (item.incidentClass === 'red' || item.incidentClass === 'yellowRed'))
        || (item.incidentType === 'inGamePenalty' && item.incidentClass === 'missed')
        || (item.incidentType === 'substitution' && item.incidentClass === 'regular');
      if (!allowed) return;
      const size = 16;
      const x = iconX(eventMinute(item), extra, size);
      if (x == null) return;
      let path = SVG[item.incidentClass];
      let y = item.isHome ? -4 : 104;
      if (item.incidentType === 'substitution') {
        path = SVG['substitution-regular'];
        y = item.isHome ? -16 : 120;
      }
      if (!path) return;
      let fill = item.isHome ? '#0bb32a' : '#374df5';
      if (['ownGoal', 'missed', 'red', 'yellowRed'].includes(item.incidentClass)) fill = '#c7361f';
      const extraTimeGoal = item.incidentType === 'goal' && num(item.time) > 90 && !isShootoutIncident(item);
      icons.push({
        kind: 'incident',
        x,
        y,
        size,
        viewBox: '0 0 16 16',
        opacity: extraTimeGoal ? 0.72 : 1,
        fill,
        paths: [{ d: path, fill }],
        tip: pushTip(incidentTip(item, shots, home, away)),
      });
    });

    const shotIcons = [];
    shots.forEach((shot) => {
      const highlight = shotHighlight(shot);
      const size = shotSize(highlight);
      const x = iconX(eventMinute(shot), extra, size);
      if (x == null) return;
      const off = !isOnTargetShot(shot);
      shotIcons.push({
        kind: 'shot',
        side: shot.isHome ? 'home' : 'away',
        x,
        y: shotY(shot, size),
        size,
        viewBox: off ? '0 0 512 512' : '0 0 16 16',
        opacity: 1,
        off,
        paths: off
          ? [{ d: SHOT_OFF_PATH, fill: 'rgba(0,0,0,0.5)', paint: 'off', fillRule: 'evenodd' }]
          : [
            { d: SHOT_CIRCLE, fill: 'rgb(255,110,64)', paint: 'on' },
            { d: 'M4.35 8.05 6.85 10.55 11.95 5.05', fill: 'none', stroke: '#fff', strokeWidth: 1.65, paint: 'mark' },
          ],
        tip: pushTip(shotTip(shot, incidents, home, away)),
      });
    });

    return {
      homeName: home.shortName || home.name || '主队',
      awayName: away.shortName || away.name || '客队',
      homeFullName: home.name || home.shortName || '主队',
      awayFullName: away.name || away.shortName || '客队',
      homeId: home.id || '',
      awayId: away.id || '',
      uniqueTournamentId: event.tournament?.uniqueTournament?.id || '',
      seasonId: event.season?.id || '',
      statsByKey: {},
      homeImg: pageTeamImgSrc(home.id, home.name || home.shortName),
      awayImg: pageTeamImgSrc(away.id, away.name || away.shortName),
      rawShots: shots,
      rawIncidents: incidents,
      graphPoints: points,
      homeScore: event.homeScore?.display ?? event.homeScore?.current ?? '',
      awayScore: event.awayScore?.display ?? event.awayScore?.current ?? '',
      statusType: event.status?.type || '',
      statusText: event.status?.description || '',
      extra,
      bars: buildBars(points, extra),
      lines: periodLines(extra),
      icons: icons.reverse(),
      shots: shotIcons.reverse(),
      tips,
      fullXg,
      regXg,
      hasXgToggle: Math.abs(fullXg.home - regXg.home) > 0.001 || Math.abs(fullXg.away - regXg.away) > 0.001,
      firstGoal: firstGoalSide(incidents),
      pointCount: points.length,
    };
  }

  const GOAL_BALL = 'M8 1c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.14-7-7 3.14-7 7-7zm-.01 1.73c-1.35 0-2.57.52-3.5 1.35l.92.55-.66 2.48-2.01.72V8c0 .67.13 1.31.36 1.9l.94-.48 1.55 1.73-.25 1.38c.78.46 1.69.73 2.66.73a5.29 5.29 0 0 0 5.26-5.28c0-1.51-.65-2.87-1.67-3.83l-.88.81-2.72-1.15.29-1.07c-.1-.01-.19-.01-.29-.01zm2.51 4.1 1.39 2.54-2.07 2.29-2.08-.81V7.83l2.76-1z';
  const GOAL_TITLES = { penalty: '点球进球', ownGoal: '乌龙球' };
  const SITUATION_LABELS = { assisted: '助攻', 'set-piece': '定位球', corner: '角球', 'free-kick': '任意球', penalty: '点球', 'throw-in-set-piece': '界外球定位', 'fast-break': '快攻' };
  const BODY_LABELS = { 'left-foot': '左脚', 'right-foot': '右脚', head: '头球', other: '其他' };

  function shortenName(label) {
    const text = String(label || '').trim();
    if (!text) return '';
    const match = text.match(/^(\d+\s+)([\s\S]*)$/);
    const prefix = match ? match[1] : '';
    const name = (match ? match[2] : text).trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return `${prefix}${name}`.trim();
    return `${prefix}${parts[parts.length - 1]}`.trim();
  }

  function enumLabel(value, map) {
    const text = String(value || '').trim();
    if (!text) return '';
    return map[text] || map[text.toLowerCase()] || text;
  }

  function shotLocation(shot) {
    if (!shot) return '';
    const situation = String(shot.situation || '').toLowerCase();
    if (situation === 'penalty' || situation === 'shootout') return '禁区内';
    const coords = shot.playerCoordinates || {};
    const x = Number(coords.x);
    const y = Number(coords.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return '';
    return x <= 17 && y >= 21 && y <= 79 ? '禁区内' : '禁区外';
  }

  function findGoalShot(incident, shots) {
    const incName = String(incident?.player?.name || incident?.player?.shortName || incident?.playerName || '').trim().toLowerCase();
    return (shots || []).find((shot) => {
      if (shot?.shotType !== 'goal' || !!shot.isHome !== !!incident.isHome) return false;
      const shotMinute = num(shot.time);
      const incMinute = num(incident.time);
      if (shotMinute == null || incMinute == null || Math.abs(shotMinute - incMinute) > 2) return false;
      const shotName = String(shot?.player?.name || shot?.player?.shortName || '').trim().toLowerCase();
      if (shotName && incName) return shotName === incName || shotName.includes(incName) || incName.includes(shotName);
      return Math.abs(shotMinute - incMinute) <= 1;
    }) || null;
  }

  function goalDetailItems(model) {
    const goals = (model.rawIncidents || [])
      .filter((item) => item.incidentType === 'goal' && !isShootoutIncident(item))
      .sort((a, b) => (matchMinute(a) ?? 0) - (matchMinute(b) ?? 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
    const counts = new Map();
    const seen = new Map();
    goals.forEach((item) => {
      const key = `${item.isHome ? 'h' : 'a'}:${item.player?.id || item.playerName || item.player?.name || ''}`;
      item._playerKey = key;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return goals.map((item) => {
      const shot = findGoalShot(item, model.rawShots);
      const total = counts.get(item._playerKey) || 0;
      const repeatIndex = total > 1 ? (seen.get(item._playerKey) || 0) + 1 : 0;
      if (total > 1) seen.set(item._playerKey, repeatIndex);
      const xg = shot ? Number(shot.xg) || 0 : null;
      const tier = xg == null ? '' : (xg >= BIG_CHANCE_XG ? 'high' : (xg >= 0.15 ? 'medium' : ''));
      const added = num(item.addedTime);
      const minute = num(item.time);
      const title = GOAL_TITLES[item.incidentClass] || '';
      let situation = /^regular$/i.test(String(shot?.situation || '')) ? '' : enumLabel(shot?.situation, SITUATION_LABELS);
      if (!situation || situation === 'Regular' || (title && title.includes(situation))) situation = '';
      return {
        isHome: !!item.isHome,
        minute: minute == null ? '—' : (added > 0 && added < 100 ? `${minute}+${added}′` : `${minute}′`),
        periodLabel: periodPhaseLabel(item),
        title,
        player: shortenName(playerLabel(item.player, item.playerName)),
        assist: shortenName(playerLabel(item.assist1, item.assist1Name || '')),
        score: item.homeScore != null ? `${item.homeScore}-${item.awayScore}` : '',
        xg: xg == null ? '' : xg.toFixed(2),
        tier,
        situation,
        body: enumLabel(shot?.bodyPart, BODY_LABELS),
        location: shotLocation(shot),
        repeatIndex,
        repeatTotal: total,
      };
    });
  }

  function renderGoalsPopup(model) {
    const items = goalDetailItems(model);
    const score = `${model.homeScore === '' || model.homeScore == null ? 0 : model.homeScore}-${model.awayScore === '' || model.awayScore == null ? 0 : model.awayScore}`;
    if (!items.length) return '';
    const rows = items.map((item) => {
      const card = `
        <div class="goals-popup__card">
          <div class="goals-popup__names">
            ${item.assist ? `<span class="goals-popup__assist">${esc(item.assist)}</span>` : ''}
            <span class="goals-popup__scorer">
              ${item.player ? `<span class="goals-popup__player">${esc(item.player)}</span>` : ''}
              ${item.repeatIndex ? `<span class="goals-popup__mark" title="本场第${item.repeatIndex}球，共${item.repeatTotal}球">${item.repeatIndex}</span>` : ''}
            </span>
          </div>
          <div class="goals-popup__meta">
            ${item.location ? `<span class="goals-popup__location is-${item.location === '禁区内' ? 'inside' : 'outside'}">${item.location}</span>` : ''}
            <span class="goals-popup__facts">
              ${item.title ? `<span>${esc(item.title)}</span>` : ''}
              ${item.periodLabel ? `<span>${esc(item.periodLabel)}</span>` : ''}
              ${item.situation ? `<span class="goals-popup__situation">[${esc(item.situation)}]</span>` : ''}
              ${item.body ? `<span>${esc(item.body)}</span>` : ''}
              ${item.xg ? `<span class="goals-popup__xg${item.tier ? ` is-${item.tier}` : ''}">xG ${item.xg}</span>` : ''}
            </span>
            ${item.score ? `<span class="goals-popup__item-score">${esc(item.score)}</span>` : ''}
          </div>
        </div>`;
      return `
        <div class="goals-popup__row ${item.isHome ? 'is-home' : 'is-away'}">
          <div class="goals-popup__side is-home">${item.isHome ? card : ''}</div>
          <div class="goals-popup__axis"><span class="goals-popup__minute">${esc(item.minute)}</span><span class="goals-popup__dot"></span></div>
          <div class="goals-popup__side is-away">${item.isHome ? '' : card}</div>
        </div>`;
    }).join('');
    return `
      <div class="goals-popup__head">
        <span class="goals-popup__head-team is-home">${esc(model.homeFullName)}</span>
        <span class="goals-popup__head-axis"><span class="goals-popup__title">进球</span><span class="goals-popup__score">${esc(score)}</span></span>
        <span class="goals-popup__head-team is-away">${esc(model.awayFullName)}</span>
      </div>
      <div class="goals-popup__scroll"><div class="goals-popup__timeline">${rows}</div></div>`;
  }

  function renderGraph(model) {
    const xg = state.showRegulationXg && model.hasXgToggle ? model.regXg : model.fullXg;
    const bars = model.bars.map((bar) => (
      `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" fill="${bar.fill}"><title>${esc(bar.title)}</title></rect>`
    )).join('');
    const lines = model.lines.map((line) => (
      `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="#fff" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="${line.dash}"></line>`
    )).join('');
    const iconSvg = (icon) => {
      const paths = icon.paths.map((path) => {
        const fill = path.fill || 'none';
        const stroke = path.stroke || 'none';
        const width = path.strokeWidth || 0;
        const style = `fill:${fill} !important;stroke:${stroke} !important;stroke-width:${width}`;
        if (path.tag === 'circle') {
          return `<circle data-paint="${path.paint || ''}" cx="${path.cx}" cy="${path.cy}" r="${path.r}" fill="${fill}" style="${style}"></circle>`;
        }
        const rule = path.fillRule ? ` fill-rule="${path.fillRule}"` : '';
        return `<path d="${path.d}"${rule} data-paint="${path.paint || ''}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" style="${style}"></path>`;
      }).join('');
      const left = ((icon.x / GRAPH_W) * 100).toFixed(3);
      let top = `top:${(((icon.y + 40) / 196) * 100).toFixed(3)}%`;
      if (icon.kind === 'shot' && icon.side === 'home') {
        const goalTop = ((-4 + 40) / 196) * 100;
        const gap = icon.off ? 16 : 0;
        top = `top:calc(${goalTop.toFixed(3)}% - ${icon.size + 3 + gap}px)`;
      } else if (icon.kind === 'shot' && icon.side === 'away') {
        const goalTop = ((104 + 40) / 196) * 100;
        const gap = icon.off ? 16 : 0;
        top = `top:calc(${goalTop.toFixed(3)}% + ${19 + gap}px)`;
      }
      return `<svg class="sofa-atk-icon is-${icon.kind}${icon.off ? ' is-off' : ''}" data-tip="${icon.tip}" viewBox="${icon.viewBox}" style="left:${left}%;${top}" width="${icon.size}" height="${icon.size}" opacity="${icon.opacity}">${paths}</svg>`;
    };
    const first = (side) => model.firstGoal === side
      ? `<svg class="sofa-atk-first is-${side}" viewBox="0 0 16 16"><path d="${SVG.regular}"></path></svg>`
      : '';
    const crest = (side, name, title) => {
      const letter = esc(String(name || '?').slice(0, 1));
      return `<span class="sofa-atk-crest is-${side} is-fallback" data-crest="${side}" title="${esc(title || name)}"><span class="sofa-atk-crest-fallback">${letter}</span>${first(side)}</span>`;
    };
    const xgClass = model.hasXgToggle ? 'is-toggle' : '';
    const xgTitle = model.hasXgToggle
      ? (state.showRegulationXg ? '点击切换全场 xG（含加时）' : '点击切换常规 90′ xG')
      : 'xG';
    const scoreText = `${model.homeScore === '' || model.homeScore == null ? 0 : model.homeScore}-${model.awayScore === '' || model.awayScore == null ? 0 : model.awayScore}`;
    return `
      <div class="sofa-atk-row">
        <div class="sofa-atk-side">
          <div class="sofa-atk-team is-home">
            ${crest('home', model.homeName, model.homeFullName)}
            <button type="button" class="sofa-atk-xg ${xgClass}" data-xg-toggle title="${esc(xgTitle)}">${formatXg(xg.home)}</button>
          </div>
          <div class="sofa-atk-team is-away">
            ${crest('away', model.awayName, model.awayFullName)}
            <button type="button" class="sofa-atk-xg ${xgClass}" data-xg-toggle title="${esc(xgTitle)}">${formatXg(xg.away)}</button>
          </div>
        </div>
        <div class="sofa-atk-plot" title="点击查看时段">
          <svg class="sofa-atk-svg" viewBox="0 -40 ${GRAPH_W} 196" preserveAspectRatio="none">
            <rect x="0" y="-33" width="${GRAPH_W}" height="33" fill="rgba(229,233,239,0.4)"></rect>
            <rect x="0" y="0" width="${GRAPH_W}" height="108" fill="#fff"></rect>
            <rect x="0" y="0" width="${GRAPH_W}" height="54" fill="rgba(11,179,42,0.15)"></rect>
            <rect x="0" y="54" width="${GRAPH_W}" height="54" fill="rgba(55,77,245,0.15)"></rect>
            <rect x="0" y="108" width="${GRAPH_W}" height="33" fill="rgba(229,233,239,0.4)"></rect>
            <g>${bars}</g>
            <g>${lines}</g>
          </svg>
          <div class="sofa-atk-icons">${model.shots.map(iconSvg).join('')}${model.icons.map(iconSvg).join('')}</div>
          ${(model.rawIncidents || []).some((item) => item.incidentType === 'goal' && !isShootoutIncident(item)) ? `<button type="button" class="sofa-atk-score-btn" data-goals aria-label="进球明细 ${esc(scoreText)}"><svg viewBox="0 0 16 16" class="sofa-atk-score-ball" aria-hidden="true"><path d="${GOAL_BALL}"></path></svg><b>${esc(scoreText)}</b></button>` : ''}
        </div>
      </div>`;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function ensureUi() {
    if ($('sofa-atk-drawer')) return;
    const style = document.createElement('style');
    style.textContent = `
      #sofa-atk-overlay {
        position: fixed; inset: 0; background: rgba(15,17,20,.45);
        z-index: 2147483000; opacity: 0; pointer-events: none; transition: opacity .25s ease;
      }
      #sofa-atk-overlay.open { opacity: 1; pointer-events: auto; }
      #sofa-atk-drawer {
        position: fixed; left: 0; right: 0; top: 0; height: 0; z-index: 2147483001;
        background: #fff; color: #222226; box-shadow: 0 8px 28px rgba(0,0,0,.28);
        display: flex; flex-direction: column; overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: height .28s ease;
      }
      #sofa-atk-drawer.dragging { transition: none; }
      #sofa-atk-drawer .sofa-atk-handle {
        height: 8px; flex: 0 0 8px; display: flex; align-items: center; justify-content: center;
        cursor: ns-resize; background: #f6f8fb; touch-action: none;
      }
      #sofa-atk-drawer .sofa-atk-handle::before {
        content: ""; width: 48px; height: 3px; border-radius: 2px; background: #c5cad3;
      }
      #sofa-atk-drawer .sofa-atk-main { position: relative; flex: 1; min-height: 0; display: flex; align-items: stretch; justify-content: center; }
      #sofa-atk-drawer .sofa-atk-head {
        position: absolute; right: 8px; top: 4px; z-index: 3;
        display: flex; align-items: center; gap: 6px; padding: 0;
        font-size: 12px; font-weight: 600; background: transparent;
      }
      #sofa-atk-drawer .sofa-atk-refresh {
        border: 0; background: transparent; padding: 2px; cursor: pointer; color: #667;
        display: inline-flex; line-height: 0;
      }
      #sofa-atk-drawer .sofa-atk-refresh:hover { color: #222; }
      #sofa-atk-drawer .sofa-atk-score { font-variant-numeric: tabular-nums; font-size: 16px; }
      #sofa-atk-drawer .sofa-atk-meta { margin-left: auto; display: flex; align-items: center; gap: 8px; font-weight: 500; color: rgba(34,34,38,.6); font-size: 12px; }
      #sofa-atk-drawer .sofa-atk-live { color: #cb1818; }
      #sofa-atk-drawer .sofa-atk-live-dot {
        display: none; width: 7px; height: 7px; border-radius: 50%; flex: 0 0 7px;
        background: #7ae88f; box-shadow: 0 0 0 2px rgba(122,232,143,.35);
      }
      #sofa-atk-drawer .sofa-atk-live-dot.is-on { display: block; animation: sofa-atk-live-pulse 1.6s ease-in-out infinite; }
      @keyframes sofa-atk-live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
      #sofa-atk-drawer .sofa-atk-btn {
        border: 1px solid #e1e5ec; background: #fff; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px;
      }
      #sofa-atk-drawer .sofa-atk-body {
        flex: 0 1 auto; min-width: 0; min-height: 0; height: 100%;
        display: flex; align-items: stretch; justify-content: center;
        padding: 0; overflow: hidden;
      }
      #sofa-atk-drawer .sofa-atk-msg { padding: 8px; color: rgba(34,34,38,.55); font-size: 12px; }
      .sofa-atk-row { display: flex; align-items: stretch; justify-content: center; height: 100%; min-height: 0; max-width: 100%; }
      .sofa-atk-side {
        flex: 0 0 auto; height: 100%; margin-right: 4px; box-sizing: border-box;
        display: flex; flex-direction: column; justify-content: center; gap: 2px;
      }
      .sofa-atk-team { display: flex; align-items: center; gap: 4px; height: 18px; }
      .sofa-atk-score-btn {
        position: absolute; left: 1px; bottom: calc(48 / 196 * 100% + 1px); z-index: 4;
        display: inline-flex; align-items: center; justify-content: center; gap: 3px;
        padding: 1px 4px 1px 3px; border: 0; border-radius: 9px;
        background: rgba(255,255,255,.88); box-shadow: 0 0 0 1px rgba(34,34,38,.14);
        color: #333; cursor: pointer; line-height: 1;
        opacity: 0; pointer-events: none; transition: opacity .15s ease;
      }
      .sofa-atk-plot:hover .sofa-atk-score-btn,
      .sofa-atk-score-btn.is-open { opacity: 1; pointer-events: auto; }
      .sofa-atk-score-btn:hover, .sofa-atk-score-btn.is-open { background: #fff; box-shadow: 0 0 0 1px rgba(34,34,38,.28); }
      .sofa-atk-score-ball { width: 12px; height: 12px; fill: #222; flex: 0 0 12px; }
      .sofa-atk-score-btn b { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .02em; }
      #sofa-atk-goals {
        position: fixed; z-index: 2147483004; display: none; width: min(92vw, 560px);
        padding: 10px 12px; border-radius: 8px; background: rgba(20,22,28,.96); color: #fff;
        box-shadow: 0 8px 28px rgba(0,0,0,.28); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #sofa-atk-goals.open { display: block; }
      .goals-popup__head { display: grid; grid-template-columns: minmax(0,1fr) 64px minmax(0,1fr); gap: 8px; align-items: baseline; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,.14); }
      .goals-popup__head-team { font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .goals-popup__head-team.is-home { color: #52b87a; text-align: right; }
      .goals-popup__head-team.is-away { color: #4a9fd9; text-align: left; }
      .goals-popup__head-axis { display: flex; flex-direction: column; align-items: center; gap: 1px; line-height: 1.2; }
      .goals-popup__title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.62); }
      .goals-popup__score { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .goals-popup__scroll { max-height: min(70vh, 420px); overflow: auto; scrollbar-width: none; }
      .goals-popup__scroll::-webkit-scrollbar { display: none; }
      .goals-popup__timeline { position: relative; }
      .goals-popup__timeline::before { content: ""; position: absolute; top: 16px; bottom: 10px; left: 50%; width: 1px; transform: translateX(-50%); background: rgba(255,255,255,.22); }
      .goals-popup__row { display: grid; grid-template-columns: minmax(0,1fr) 64px minmax(0,1fr); gap: 8px; align-items: stretch; min-height: 44px; }
      .goals-popup__side { min-width: 0; padding-bottom: 10px; display: flex; }
      .goals-popup__side.is-home { justify-content: flex-end; }
      .goals-popup__side.is-away { justify-content: flex-start; }
      .goals-popup__card { max-width: 100%; min-width: 0; }
      .goals-popup__row.is-home .goals-popup__card { text-align: right; }
      .goals-popup__axis { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-top: 1px; }
      .goals-popup__minute { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; line-height: 1.2; }
      .goals-popup__dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.45); z-index: 1; }
      .goals-popup__row.is-home .goals-popup__dot { background: #52b87a; box-shadow: 0 0 0 3px rgba(82,184,122,.18); }
      .goals-popup__row.is-away .goals-popup__dot { background: #4a9fd9; box-shadow: 0 0 0 3px rgba(74,159,217,.18); }
      .goals-popup__names { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
      .goals-popup__row.is-home .goals-popup__names { justify-content: flex-end; }
      .goals-popup__scorer { display: inline-flex; align-items: baseline; gap: 4px; min-width: 0; }
      .goals-popup__row.is-away .goals-popup__scorer { flex-direction: row-reverse; }
      .goals-popup__row.is-away .goals-popup__assist { order: 2; }
      .goals-popup__player { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .goals-popup__row.is-home .goals-popup__player { color: #52b87a; }
      .goals-popup__row.is-away .goals-popup__player { color: #4a9fd9; }
      .goals-popup__mark { flex: 0 0 13px; width: 13px; height: 13px; border-radius: 50%; font-size: 9px; font-weight: 600; line-height: 13px; text-align: center; color: rgba(255,255,255,.58); background: rgba(255,255,255,.12); box-shadow: inset 0 0 0 1px rgba(255,255,255,.16); }
      .goals-popup__assist { font-size: 12px; color: rgba(255,255,255,.42); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .goals-popup__meta { display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; margin-top: 3px; font-size: 11px; color: rgba(255,255,255,.58); }
      .goals-popup__row.is-home .goals-popup__meta { justify-content: flex-end; }
      .goals-popup__facts { display: inline-flex; flex-wrap: nowrap; align-items: center; gap: 5px 8px; white-space: nowrap; }
      .goals-popup__situation { font-weight: 600; color: rgba(255,255,255,.78); }
      .goals-popup__location { flex: 0 0 auto; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 500; line-height: 16px; }
      .goals-popup__location.is-inside { color: rgba(255,255,255,.78); background: rgba(255,255,255,.08); }
      .goals-popup__location.is-outside { color: rgba(255,255,255,.48); background: rgba(255,255,255,.05); }
      .goals-popup__item-score { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: rgba(255,255,255,.88); }
      .goals-popup__row.is-away .goals-popup__item-score { order: -1; }
      .goals-popup__xg.is-medium { color: #ffb347; font-weight: 600; }
      .goals-popup__xg.is-high { color: #ff7a45; font-weight: 700; }
      .sofa-atk-crest { position: relative; width: 18px; height: 18px; flex: 0 0 18px; overflow: hidden; border-radius: 50%; font-size: 0; line-height: 0; }
      .sofa-atk-crest img { width: 18px; height: 18px; display: block; object-fit: contain; }
      .sofa-atk-crest-fallback { display: none; width: 18px; height: 18px; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #fff; }
      .sofa-atk-crest.is-home .sofa-atk-crest-fallback { background: #0bb32a; }
      .sofa-atk-crest.is-away .sofa-atk-crest-fallback { background: #374df5; }
      .sofa-atk-crest.is-fallback img { display: none; }
      .sofa-atk-crest.is-fallback .sofa-atk-crest-fallback { display: flex; }
      .sofa-atk-crest-canvas { width: 18px; height: 18px; display: block; }
      .sofa-atk-first { position: absolute; right: -1px; bottom: -2px; width: 11px; height: 11px; background: #fff; border-radius: 50%; z-index: 1; }
      .sofa-atk-first.is-home { fill: #0bb32a; }
      .sofa-atk-first.is-away { fill: #374df5; }
      .sofa-atk-xg { border: 0; background: transparent; padding: 0; font: 600 13px/1 inherit; font-variant-numeric: tabular-nums; color: #222226; }
      .sofa-atk-xg.is-toggle { cursor: pointer; }
      .sofa-atk-plot {
        position: relative; flex: 0 1 calc(100vw * 6 / 13); width: calc(100vw * 6 / 13);
        max-width: calc(100vw - 520px); height: 100%; cursor: pointer;
      }
      .sofa-atk-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; overflow: hidden; }
      .sofa-atk-svg rect { shape-rendering: crispedges; }
      .sofa-atk-icons { position: absolute; inset: 0; pointer-events: none; }
      .sofa-atk-icons .sofa-atk-icon { position: absolute; pointer-events: auto; overflow: visible; z-index: 1; }
      #sofa-atk-drawer .sofa-atk-icon.is-off path { fill: rgba(0,0,0,0.5) !important; stroke: none !important; }
      #sofa-atk-drawer .sofa-atk-icon path[data-paint="on"] { fill: rgb(255,110,64) !important; stroke: none !important; }
      #sofa-atk-drawer .sofa-atk-icon path[data-paint="mark"] { fill: none !important; stroke: #fff !important; }
      .sofa-atk-icons .sofa-atk-icon.is-incident { z-index: 2; }
      #sofa-atk-modal {
        position: fixed; inset: 0; z-index: 2147483003; display: none;
        align-items: center; justify-content: center; background: rgba(15,17,20,.35); padding: 24px;
      }
      #sofa-atk-modal.open { display: flex; }
      #sofa-atk-modal .sofa-atk-modal-card {
        width: min(1040px, 98vw); max-height: min(88vh, 900px); overflow: auto;
        background: #fff; color: #222226; border-radius: 12px; box-shadow: 0 16px 48px rgba(0,0,0,.28);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        scrollbar-width: none; -ms-overflow-style: none;
      }
      #sofa-atk-modal .sofa-atk-modal-card::-webkit-scrollbar { width: 0; height: 0; display: none; }
      #sofa-atk-modal .sofa-atk-modal-head {
        position: sticky; top: 0; display: flex; align-items: center; gap: 12px;
        padding: 14px 16px; background: #fff; border-bottom: 1px solid #eef1f5; font-weight: 700;
      }
      #sofa-atk-modal .sofa-atk-modal-head button { margin-left: auto; }
      #sofa-atk-modal .sofa-atk-modal-body { padding: 14px 16px 18px; }
      .atk-sum { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); gap: 14px; align-items: stretch; margin-bottom: 12px; }
      .atk-sum-card { position: relative; border-radius: 12px; padding: 16px 16px 22px; border: 1px solid rgba(34,34,38,.08); box-shadow: 0 2px 8px rgba(34,34,38,.05); overflow: hidden; }
      .atk-sum-card.is-home { background: linear-gradient(160deg, rgba(11,179,42,.12), rgba(255,255,255,.92) 48%); border-color: rgba(11,179,42,.18); }
      .atk-sum-card.is-away { background: linear-gradient(160deg, rgba(55,77,245,.12), rgba(255,255,255,.92) 48%); border-color: rgba(55,77,245,.18); }
      .atk-sum-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
      .atk-accent { width: 4px; height: 18px; border-radius: 2px; flex-shrink: 0; }
      .atk-sum-card.is-home .atk-accent { background: linear-gradient(180deg, #0bb32a, #56d86a); }
      .atk-sum-card.is-away .atk-accent { background: linear-gradient(180deg, #374df5, #5a6ef7); }
      .atk-sum-name { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .atk-sum-card.is-home .atk-sum-name { color: #066b18; }
      .atk-sum-card.is-away .atk-sum-name { color: #2439a8; }
      .atk-stat-grid { display: grid; grid-template-columns: minmax(118px,1.05fr) 1.15fr 1fr; gap: 8px; }
      .atk-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 88px; padding: 8px 6px; border-radius: 9px; background: rgba(255,255,255,.72); border: 1px solid rgba(255,255,255,.95); }
      .atk-tile-label { font-size: 12px; color: #888; margin-bottom: 4px; }
      .atk-tile-xg { font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; border: 0; background: transparent; padding: 0; }
      .atk-sum-card.is-home .atk-tile-xg { color: #0a9a24; }
      .atk-sum-card.is-away .atk-tile-xg { color: #374df5; }
      .atk-tile-xg.is-toggle { cursor: pointer; }
      .atk-xgot-ref { margin-top: 6px; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; }
      .atk-sum-card.is-home .atk-xgot-ref { color: #2d7a3a; background: rgba(11,179,42,.1); }
      .atk-sum-card.is-away .atk-xgot-ref { color: #3f52b8; background: rgba(55,77,245,.1); }
      .atk-xgot-ref.is-higher { box-shadow: 0 0 0 1px currentColor; }
      .atk-goals { display: flex; align-items: center; justify-content: center; gap: 2px; min-height: 28px; }
      .atk-ball { width: 18px; height: 18px; flex-shrink: 0; }
      .atk-ball.is-home { fill: #0bb32a; }
      .atk-ball.is-away { fill: #374df5; }
      .atk-shots { margin-top: 4px; display: flex; gap: 6px; font-size: 12px; font-weight: 650; }
      .atk-sum-card.is-home .atk-shots { color: #0a9a24; }
      .atk-sum-card.is-away .atk-shots { color: #374df5; }
      .atk-shots b { padding: 0 5px; border-radius: 999px; background: rgba(255,255,255,.8); font-weight: 700; }
      .atk-gauge-wrap { width: 100%; min-width: 0; }
      .atk-gauge { width: 100%; height: auto; aspect-ratio: 220 / 176; display: block; overflow: visible; }
      .atk-gauge-team { margin-top: -8px; padding: 0 2px; font-size: 11px; font-weight: 600; line-height: 1.3; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .atk-gauge-team.is-home { color: #08861f; }
      .atk-gauge-team.is-away { color: #2c3ec4; }
      .atk-poss { position: absolute; left: 0; right: 0; bottom: 0; height: 18px; }
      .atk-poss-track { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(34,34,38,.08); }
      .atk-sum-card.is-home .atk-poss-track { direction: rtl; background: rgba(11,179,42,.16); }
      .atk-sum-card.is-away .atk-poss-track { background: rgba(55,77,245,.16); }
      .atk-poss-fill { height: 100%; }
      .atk-sum-card.is-home .atk-poss-fill { direction: ltr; background: linear-gradient(270deg, #0bb32a, #7ae88f); }
      .atk-sum-card.is-away .atk-poss-fill { background: linear-gradient(90deg, #5a6ef7, #374df5); }
      .atk-poss-meta { position: absolute; bottom: 5px; display: flex; gap: 4px; font-size: 12px; font-weight: 700; line-height: 1; white-space: nowrap; }
      .atk-sum-card.is-home .atk-poss-meta { left: 10px; color: #0a9a24; }
      .atk-sum-card.is-away .atk-poss-meta { right: 10px; color: #374df5; }
      .atk-poss-meta em { font-style: normal; font-size: 10px; font-weight: 600; opacity: .72; }
      .atk-vs { align-self: center; color: rgba(34,34,38,.45); font-size: 12px; font-weight: 700; }
      .atk-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; background: rgba(34,34,38,.035); font-size: 11px; color: #777; }
      .atk-legend-item { display: inline-flex; align-items: center; gap: 5px; }
      .atk-legend-bar { width: 16px; height: 6px; border-radius: 3px; }
      .atk-legend-bar.is-home { background: linear-gradient(90deg, #0bb32a, #7ae88f); }
      .atk-legend-bar.is-away { background: linear-gradient(90deg, #5a6ef7, #374df5); }
      .atk-legend-bar.is-press.is-home { height: 4px; background: repeating-linear-gradient(90deg, rgba(11,179,42,.7) 0 3px, transparent 3px 5px); }
      .atk-legend-bar.is-press.is-away { height: 4px; background: repeating-linear-gradient(90deg, rgba(55,77,245,.7) 0 3px, transparent 3px 5px); }
      .atk-legend-actions { margin-left: auto; display: inline-flex; gap: 6px; }
      .atk-chip { height: 22px; padding: 0 7px; border-radius: 6px; border: 1px solid rgba(34,34,38,.12); background: #fff; font-size: 11px; font-weight: 600; color: #666; cursor: pointer; }
      .atk-chip.is-time { color: #9a6400; border-color: rgba(180,120,20,.28); background: rgba(245,166,35,.08); }
      .atk-chip.is-profile { color: #0a9a24; border-color: rgba(11,179,42,.28); background: rgba(11,179,42,.08); }
      .atk-chip.is-active { box-shadow: inset 0 0 0 1px currentColor; }
      .atk-chip:disabled { opacity: .45; cursor: default; }
      .atk-period { display: grid; grid-template-columns: 52px 1fr 52px; gap: 8px; align-items: center; padding: 8px 0; }
      .atk-plabel { display: flex; flex-direction: column; align-items: center; gap: 2px; line-height: 1.15; }
      .atk-plabel b { font-size: 13px; font-weight: 700; color: #333; }
      .atk-plabel span { font-size: 10px; color: #999; }
      .atk-plabel.is-mirror { opacity: .42; }
      .atk-plabel.is-mirror.has-mark { opacity: 1; }
      .atk-rank { width: 14px; height: 14px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 9px; font-weight: 800; }
      .atk-rank.is-home { background: #0bb32a; }
      .atk-rank.is-away { background: #374df5; }
      .atk-pchart { display: grid; grid-template-columns: 1fr 2px 1fr; gap: 10px; align-items: start; min-width: 0; }
      .atk-axis { width: 2px; min-height: 48px; height: 100%; border-radius: 1px; background: rgba(34,34,38,.12); }
      .atk-side { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .atk-side.is-home { align-items: flex-end; }
      .atk-side.is-away { align-items: flex-start; }
      .atk-barrow { display: flex; align-items: center; gap: 6px; width: 100%; }
      .atk-side.is-home .atk-barrow { justify-content: flex-end; }
      .atk-values { display: flex; flex-direction: column; gap: 2px; min-width: 54px; flex-shrink: 0; }
      .atk-side.is-home .atk-values { align-items: flex-end; }
      .atk-side.is-away .atk-values { align-items: flex-start; }
      .atk-xg { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
      .atk-side.is-home .atk-xg { color: #08861f; }
      .atk-side.is-away .atk-xg { color: #2c3ec4; }
      .atk-xgot { display: inline-flex; gap: 3px; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 600; }
      .atk-xgot em { font-style: normal; font-size: 8px; font-weight: 700; }
      .atk-side.is-home .atk-xgot { color: #2d7a3a; background: rgba(11,179,42,.1); }
      .atk-side.is-away .atk-xgot { color: #3f52b8; background: rgba(55,77,245,.1); }
      .atk-side.is-home .atk-xgot.is-higher { box-shadow: 0 0 0 1px rgba(11,179,42,.18), 0 0 5px rgba(11,179,42,.22); }
      .atk-side.is-away .atk-xgot.is-higher { box-shadow: 0 0 0 1px rgba(55,77,245,.18), 0 0 5px rgba(55,77,245,.22); }
      .atk-stack { display: flex; flex-direction: column; gap: 3px; flex: 1 1 0; min-width: 48px; }
      .atk-track { height: 12px; border-radius: 6px; background: rgba(34,34,38,.06); overflow: hidden; }
      .atk-side.is-home .atk-track, .atk-side.is-home .atk-ptrack { direction: rtl; }
      .atk-fill { height: 100%; border-radius: 6px; direction: ltr; }
      .atk-side.is-home .atk-fill { background: linear-gradient(90deg, #0bb32a, #7ae88f); }
      .atk-side.is-away .atk-fill { background: linear-gradient(90deg, #5a6ef7, #374df5); }
      .atk-pwrap { position: relative; width: 100%; padding-bottom: 9px; }
      .atk-ptrack { height: 5px; border-radius: 999px; background: rgba(34,34,38,.05); overflow: hidden; }
      .atk-pfill { height: 100%; border-radius: 999px; direction: ltr; }
      .atk-side.is-home .atk-pfill { background: repeating-linear-gradient(90deg, rgba(11,179,42,.55) 0 4px, rgba(11,179,42,.28) 4px 7px); }
      .atk-side.is-away .atk-pfill { background: repeating-linear-gradient(90deg, rgba(55,77,245,.55) 0 4px, rgba(55,77,245,.28) 4px 7px); }
      .atk-press { position: absolute; top: 6px; z-index: 1; display: inline-flex; align-items: center; gap: 2px; font-size: 9px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; white-space: nowrap; }
      .atk-press.is-home { color: #08861f; }
      .atk-press.is-away { color: #2c3ec4; }
      .atk-press .atk-rank { width: 11px; height: 11px; font-size: 8px; }
      .atk-events { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; min-height: 18px; }
      .atk-side.is-home .atk-events { flex-direction: row-reverse; }
      .atk-sub { width: 14px; height: 14px; }
      .atk-sub.is-home { fill: #0bb32a; }
      .atk-sub.is-away { fill: #374df5; }
      .atk-red { font-size: 12px; line-height: 1; }
      .atk-half { display: flex; align-items: center; gap: 10px; margin: 4px 0 8px; color: #999; font-size: 11px; }
      .atk-half::before, .atk-half::after { content: ""; flex: 1; height: 1px; background: rgba(34,34,38,.12); }
      .atk-note { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 16px; margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: rgba(34,34,38,.035); font-size: 11px; color: #777; }
      .atk-note span { display: inline-flex; align-items: center; gap: 5px; }
      .atk-note .atk-ball { width: 13px; height: 13px; }
      .atk-hist-n { font-size: 10px; font-weight: 700; color: #666; }
      .atk-conceded { position: relative; width: 16px; height: 16px; display: inline-flex; }
      .atk-conceded .atk-ball { width: 16px; height: 16px; }
      .atk-conceded i { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #c7361f; font-style: normal; font-size: 11px; font-weight: 800; }
      .atk-timeline { display: flex; flex-direction: column; gap: 6px; }
      .atk-ev { display: grid; grid-template-columns: 1fr 54px 1fr; gap: 8px; align-items: center; font-size: 12px; }
      .atk-ev-min { text-align: center; color: #888; font-variant-numeric: tabular-nums; }
      .atk-ev-home { text-align: right; color: #066b18; }
      .atk-ev-away { text-align: left; color: #2439a8; }
      .atk-profile-sec { margin-bottom: 14px; }
      .atk-profile-sec h4 { margin: 0 0 8px; font-size: 13px; }
      .atk-stat-row { display: grid; grid-template-columns: 72px 1fr 120px 1fr 72px; gap: 8px; align-items: center; margin: 4px 0; font-size: 12px; }
      .atk-stat-row b { font-variant-numeric: tabular-nums; }
      .atk-stat-row b.is-home { text-align: right; color: #08861f; }
      .atk-stat-row b.is-away { color: #2c3ec4; }
      .atk-stat-name { text-align: center; color: #666; }
      .atk-stat-bar { height: 6px; border-radius: 4px; background: rgba(34,34,38,.06); overflow: hidden; }
      .atk-stat-bar i { display: block; height: 100%; border-radius: 4px; }
      .atk-stat-bar.is-home i { margin-left: auto; background: #0bb32a; }
      .atk-stat-bar.is-away i { background: #374df5; }
      .tl-head, .tl-row { display: grid; grid-template-columns: 1fr 72px 1fr; gap: 8px; align-items: start; }
      .tl-head { margin-bottom: 8px; font-size: 13px; font-weight: 700; }
      .tl-head .is-home { text-align: right; color: #066b18; }
      .tl-head .is-away { color: #2439a8; }
      .tl-filters { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 8px; }
      .tl-filter { display: inline-flex; align-items: center; gap: 3px; border: 0; background: transparent; cursor: pointer; font-size: 12px; font-weight: 700; }
      .tl-filter.is-dim { opacity: .35; }
      .tl-filter.is-scope { height: 22px; padding: 0 8px; border-radius: 6px; border: 1px solid rgba(34,34,38,.12); }
      .tl-filter.is-scope.is-on { color: #2c3ec4; border-color: rgba(55,77,245,.4); background: rgba(55,77,245,.08); }
      .tl-list { max-height: 420px; overflow: auto; scrollbar-width: none; }
      .tl-list::-webkit-scrollbar { display: none; }
      .tl-row { position: relative; min-height: 42px; padding: 6px 0; }
      .tl-axis { position: relative; display: flex; flex-direction: column; align-items: center; }
      .tl-min { font-size: 12px; font-weight: 700; color: #444; }
      .tl-phase { font-size: 10px; color: #999; }
      .tl-dot { width: 8px; height: 8px; border-radius: 50%; background: #c5cad3; margin-top: 4px; }
      .tl-dot.is-goal { background: #0bb32a; }
      .tl-dot.is-yellow { background: #f5c518; }
      .tl-dot.is-red { background: #e10600; }
      .tl-dot.is-sub { background: #374df5; }
      .tl-dot.is-chance { background: #f59e0b; }
      .tl-line { position: absolute; top: 28px; bottom: -8px; width: 1px; background: rgba(34,34,38,.12); }
      .tl-card { max-width: 280px; padding: 6px 8px; border-radius: 8px; background: #f7f8fa; font-size: 12px; line-height: 1.35; }
      .tl-row.is-home .tl-card { margin-left: auto; }
      .tl-card b { font-size: 13px; }
      .tl-sub-in { color: #0a9a24; }
      .tl-sub-out { color: #888; text-decoration: line-through; }
      .tl-impact { margin-top: 4px; color: #666; font-size: 11px; }
      .tl-up { color: #0a9a24; }
      .tl-down { color: #c7361f; }
      .pf-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-bottom: 10px; }
      .pf-head .is-home { color: #066b18; font-weight: 700; }
      .pf-head .is-away { color: #2439a8; font-weight: 700; text-align: right; }
      .pf-eyebrow { display: block; text-align: center; font-size: 10px; letter-spacing: .08em; color: #999; }
      .pf-title { font-weight: 700; }
      .pf-tabs { display: flex; justify-content: center; gap: 8px; margin-bottom: 12px; }
      .pf-tab { border: 0; background: transparent; border-bottom: 2px solid transparent; padding: 4px 8px; cursor: pointer; color: #777; font-weight: 650; }
      .pf-tab.is-on { color: #222; border-bottom-color: #374df5; }
      .pf-pressure { position: relative; display: grid; grid-template-columns: minmax(150px, 200px) minmax(0, 1fr) minmax(150px, 200px); gap: 8px 12px; align-items: center; padding: 8px 8px 4px; border: 1px solid rgba(34,34,38,.08); border-radius: 12px; overflow: hidden; }
      .pf-pressure.has-poss { padding-bottom: 28px; }
      .pf-row { display: grid; grid-template-columns: 84px minmax(0, 1fr) 84px; gap: 12px; align-items: center; min-height: 28px; }
      .pf-val { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: #999; white-space: nowrap; }
      .pf-val.is-home { text-align: right; }
      .pf-val.is-away { text-align: left; }
      .pf-val.is-leader.is-home { color: #08861f; }
      .pf-val.is-leader.is-away { color: #2c3ec4; }
      .pf-val.is-laggard { color: #c0392b; }
      .pf-core { display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; min-width: 0; }
      .pf-label { min-width: 5.5em; font-size: 12px; font-weight: 700; color: #555; text-align: center; white-space: nowrap; }
      .pf-side { height: 12px; border-radius: 999px; background: rgba(34,34,38,.06); overflow: hidden; display: flex; min-width: 0; }
      .pf-side.is-home { justify-content: flex-end; }
      .pf-side.is-away { justify-content: flex-start; }
      .pf-side i { display: block; height: 100%; border-radius: 999px; }
      .pf-side.is-home i { background: linear-gradient(270deg, #0bb32a, #7ae88f); }
      .pf-side.is-away i { background: linear-gradient(90deg, #5a6ef7, #374df5); }
      .pf-poss { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; }
      .pf-poss-track { display: flex; height: 100%; background: rgba(34,34,38,.08); overflow: hidden; }
      .pf-poss-track i { display: block; height: 100%; min-width: 0; }
      .pf-poss-track i.is-home { background: linear-gradient(90deg, #0bb32a, #7ae88f); }
      .pf-poss-track i.is-away { background: linear-gradient(90deg, #5a6ef7, #374df5); }
      .pf-poss b { position: absolute; bottom: 5px; font-size: 10px; font-weight: 700; line-height: 1; white-space: nowrap; pointer-events: none; }
      .pf-poss b.is-home { color: #0a9a24; }
      .pf-poss b.is-away { color: #374df5; }
      .pf-priority, .pf-sec { margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: rgba(34,34,38,.03); }
      .pf-sec h4, .pf-radar h4 { margin: 0 0 8px; font-size: 13px; }
      .pf-radars { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
      .pf-radar { padding: 8px; border-radius: 12px; background: #fff; border: 1px solid rgba(34,34,38,.06); }
      .pf-radar svg { width: 100%; height: 210px; display: block; }
      .pf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .sofa-atk-icon { cursor: pointer; shape-rendering: geometricPrecision; }
      .attack-momentum-graph__root { cursor: pointer !important; }
      #sofa-atk-tip {
        position: fixed; z-index: 2147483002; pointer-events: none; display: none;
        max-width: 280px; padding: 8px 10px; border-radius: 6px;
        background: rgba(20,22,28,.96); color: #fff; font-size: 12px; line-height: 1.45;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #sofa-atk-tip::after {
        content: ""; position: absolute; left: 50%; bottom: -5px; margin-left: -5px;
        border: 5px solid transparent; border-top-color: rgba(20,22,28,.96); border-bottom: 0;
      }
      .gt { min-width: 148px; max-width: 260px; text-align: left; }
      .gt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 5px; }
      .gt-min { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; flex-shrink: 0; }
      .gt-right { display: inline-flex; align-items: center; justify-content: flex-end; gap: 5px; margin-left: auto; }
      .gt-badge { font-size: 13px; line-height: 1; }
      .gt-title { font-weight: 600; color: rgba(255,255,255,.92); }
      .gt-right.is-shot-on .gt-badge, .gt-right.is-shot-on .gt-title { color: #ff8a65; }
      .gt-right.is-shot-off .gt-badge, .gt-right.is-shot-off .gt-title { color: rgba(255,255,255,.52); font-weight: 500; }
      .gt-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
      .gt-team { font-size: 11px; font-weight: 600; }
      .gt-team.is-home { color: #52b87a; }
      .gt-team.is-away { color: #4a9fd9; }
      .gt-loc { margin-left: auto; flex-shrink: 0; padding: 1px 6px; border-radius: 8px; font-size: 10px; font-weight: 500; line-height: 16px; }
      .gt-loc.is-in { color: rgba(255,255,255,.78); background: rgba(255,255,255,.08); }
      .gt-loc.is-out { color: rgba(255,255,255,.48); background: rgba(255,255,255,.05); }
      .gt-body { border-top: 1px solid rgba(255,255,255,.14); padding-top: 6px; }
      .gt-row { display: flex; justify-content: space-between; gap: 12px; margin-top: 4px; }
      .gt-row:first-child { margin-top: 0; }
      .gt-label { color: rgba(255,255,255,.58); flex-shrink: 0; }
      .gt-wrap { display: inline-flex; align-items: baseline; justify-content: flex-end; gap: 5px; text-align: right; }
      .gt-value { color: rgba(255,255,255,.92); font-variant-numeric: tabular-nums; }
      .gt-value.quality-minimal { color: rgba(255,255,255,.48); }
      .gt-value.quality-low { color: rgba(255,255,255,.78); }
      .gt-value.quality-medium { color: #ffe58f; font-weight: 600; }
      .gt-value.quality-high { color: #95de64; font-weight: 700; }
      .gt-value.metric-xg.quality-minimal, .gt-value.metric-xgot.quality-minimal { color: #91caff; font-weight: 400; }
      .gt-value.metric-xg.quality-low, .gt-value.metric-xgot.quality-low { color: #5b8def; font-weight: 500; }
      .gt-value.metric-xg.quality-medium { color: #ffb347; font-weight: 600; }
      .gt-value.metric-xgot.quality-medium { color: #ffc266; font-weight: 600; }
      .gt-value.metric-xg.quality-high { color: #ff7a45; font-weight: 700; }
      .gt-value.metric-xgot.quality-high { color: #fa8c16; font-weight: 700; }
      .gt-value.tone-player-name { color: #52b87a; font-weight: 600; }
      .gt-value.tone-assist-name { color: rgba(255,255,255,.52); font-weight: 400; }
      .gt-hint { font-size: 10px; color: rgba(255,255,255,.42); }
      .gt-hint.metric-xg { color: rgba(255,122,69,.58); }
      .gt-hint.metric-xgot { color: rgba(250,140,22,.58); }
    `;
    document.documentElement.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'sofa-atk-overlay';
    const drawer = document.createElement('div');
    drawer.id = 'sofa-atk-drawer';
    drawer.innerHTML = `
      <div class="sofa-atk-main">
        <div class="sofa-atk-body"><div class="sofa-atk-msg">加载中…</div></div>
        <div class="sofa-atk-head">
          <span class="sofa-atk-live-dot" title="进行中，每 40 秒更新"></span>
          <span class="sofa-atk-status"></span>
          <button type="button" class="sofa-atk-refresh" data-refresh aria-label="刷新" title="刷新">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13.6 8A5.6 5.6 0 1 1 12 4.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M13.7 1.8v3.2H10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
      <div class="sofa-atk-handle" title="向下拖动加高，点击收起"></div>
    `;
    const tip = document.createElement('div');
    tip.id = 'sofa-atk-tip';
    const goalsPop = document.createElement('div');
    goalsPop.id = 'sofa-atk-goals';
    const modal = document.createElement('div');
    modal.id = 'sofa-atk-modal';
    modal.innerHTML = `
      <div class="sofa-atk-modal-card" role="dialog" aria-label="战术部署与执行">
        <div class="sofa-atk-modal-head">
          <span class="sofa-atk-modal-title">战术部署与执行</span>
          <button type="button" class="sofa-atk-btn" data-modal-close>关闭</button>
        </div>
        <div class="sofa-atk-modal-body"></div>
      </div>
    `;
    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(drawer);
    document.documentElement.appendChild(tip);
    document.documentElement.appendChild(goalsPop);
    document.documentElement.appendChild(modal);

    overlay.addEventListener('click', closeDrawer);
    drawer.querySelector('[data-refresh]').addEventListener('click', () => loadGraph(true));
    drawer.querySelector('.sofa-atk-handle').addEventListener('pointerdown', onHandleDown);
    drawer.addEventListener('click', onDrawerClick);
    drawer.addEventListener('error', onCrestError, true);
    drawer.addEventListener('mousemove', onIconMove);
    drawer.addEventListener('mouseleave', hideTip);
    drawer.addEventListener('mouseover', onGoalsHover);
    drawer.addEventListener('mouseout', onGoalsHoverOut);
    goalsPop.addEventListener('mouseover', onGoalsHover);
    goalsPop.addEventListener('mouseout', onGoalsHoverOut);
    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-modal-close]')) {
        closePeriodModal();
        return;
      }
      const action = event.target.closest('[data-panel]')?.dataset.panel;
      if (!action) return;
      event.preventDefault();
      if (action === 'xg-scope') {
        if (!state.model?.hasXgToggle) return;
        state.showRegulationXg = !state.showRegulationXg;
        renderPeriodModal();
        return;
      }
      if (action === 'xgot') {
        state.showPeriodXgot = !state.showPeriodXgot;
        renderPeriodModal();
        return;
      }
      if (action === 'timeline') {
        state.panelView = state.panelView === 'timeline' ? 'xg' : 'timeline';
        renderPeriodModal();
        return;
      }
      if (action === 'profile') {
        state.panelView = state.panelView === 'profile' ? 'xg' : 'profile';
        renderPeriodModal();
        return;
      }
      if (action.startsWith('tl-')) {
        const key = action.slice(3);
        if (key === 'scope') state.timelineRegulation = !state.timelineRegulation;
        else state.timelineFilter = state.timelineFilter === key ? '' : key;
        renderPeriodModal();
        return;
      }
      if (action.startsWith('pf-')) {
        state.profilePeriod = action.slice(3);
        renderPeriodModal();
        return;
      }
      if (action.startsWith('dist-')) {
        const kind = action.slice(5);
        state.distMode = state.distMode === kind ? '' : kind;
        state.panelView = 'xg';
        if (state.distMode) {
          ensureGoalDist().then(() => {
            if ($('sofa-atk-modal')?.classList.contains('open')) renderPeriodModal();
          });
        }
        renderPeriodModal();
      }
    });
  }

  function onCrestError(event) {
    const img = event.target;
    if (img && img.tagName === 'IMG') img.closest('.sofa-atk-crest')?.classList.add('is-fallback');
  }

  function onDrawerClick(event) {
    if (event.target.closest('[data-xg-toggle]')) {
      if (!state.model?.hasXgToggle) return;
      state.showRegulationXg = !state.showRegulationXg;
      paint();
      return;
    }
    if (event.target.closest('.sofa-atk-icon, .sofa-atk-score-btn, #sofa-atk-goals')) return;
    if (event.target.closest('.sofa-atk-plot')) {
      hideGoals();
      openPeriodModal();
    }
  }

  function renderTipHtml(tip) {
    if (!tip || typeof tip === 'string') return esc(String(tip || ''));
    const tone = tip.titleTone ? ` is-${tip.titleTone}` : '';
    const rows = (tip.rows || []).map((row) => {
      const cls = [
        row.metricTone ? `metric-${row.metricTone}` : '',
        row.tier ? `quality-${row.tier}` : '',
        row.valueTone ? `tone-${row.valueTone}` : '',
      ].filter(Boolean).join(' ');
      const hint = row.hint ? `<span class="gt-hint${row.metricTone ? ` metric-${row.metricTone}` : ''}">${esc(row.hint)}</span>` : '';
      return `<div class="gt-row"><span class="gt-label">${esc(row.label)}</span><span class="gt-wrap"><span class="gt-value ${cls}">${esc(row.value)}</span>${hint}</span></div>`;
    }).join('');
    const meta = (tip.teamName || tip.location)
      ? `<div class="gt-meta">${tip.teamName ? `<span class="gt-team is-${tip.isHome ? 'home' : 'away'}">${esc(tip.teamName)}</span>` : ''}${tip.location ? `<span class="gt-loc is-${tip.location === '禁区内' ? 'in' : 'out'}">${esc(tip.location)}</span>` : ''}</div>`
      : '';
    return `<div class="gt"><div class="gt-head"><span class="gt-min">${esc(tip.minuteLabel || '')}</span><span class="gt-right${tone}"><span class="gt-badge">${esc(tip.badge || '')}</span><span class="gt-title">${esc(tip.title || '')}</span></span></div>${meta}${rows ? `<div class="gt-body">${rows}</div>` : ''}</div>`;
  }

  function onIconMove(event) {
    const icon = event.target.closest('.sofa-atk-icon');
    const tip = $('sofa-atk-tip');
    if (!icon || !tip) {
      hideTip();
      return;
    }
    const payload = state.tips[Number(icon.getAttribute('data-tip'))];
    if (!payload) {
      hideTip();
      return;
    }
    tip.innerHTML = renderTipHtml(payload);
    tip.style.display = 'block';
    const x = Math.min(event.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.max(8, event.clientY - tip.offsetHeight - 10);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function hideTip() {
    const tip = $('sofa-atk-tip');
    if (tip) tip.style.display = 'none';
  }

  function goalsHoverTarget(node) {
    if (!node || !node.closest) return false;
    if (node.closest('.sofa-atk-icon')) return false;
    return !!node.closest('.sofa-atk-score-btn, #sofa-atk-goals');
  }

  function showGoals() {
    const pop = $('sofa-atk-goals');
    const btn = document.querySelector('#sofa-atk-drawer .sofa-atk-score-btn');
    const goals = (state.model?.rawIncidents || []).filter((item) => item.incidentType === 'goal' && !isShootoutIncident(item));
    if (!pop || !btn || !goals.length) return;
    const rect = btn.getBoundingClientRect();
    pop.style.left = `${rect.right + 8}px`;
    pop.style.top = `${Math.max(8, rect.top - 12)}px`;
    pop.classList.add('open');
    btn.classList.add('is-open');
    const box = pop.getBoundingClientRect();
    if (box.right > window.innerWidth - 8) pop.style.left = `${Math.max(8, window.innerWidth - box.width - 8)}px`;
    if (box.bottom > window.innerHeight - 8) pop.style.top = `${Math.max(8, window.innerHeight - box.height - 8)}px`;
  }

  function hideGoals() {
    $('sofa-atk-goals')?.classList.remove('open');
    document.querySelector('#sofa-atk-drawer .sofa-atk-score-btn')?.classList.remove('is-open');
  }

  function onGoalsHover(event) {
    if (event.target.closest('.sofa-atk-icon')) {
      hideGoals();
      return;
    }
    if (goalsHoverTarget(event.target)) showGoals();
  }

  function onGoalsHoverOut(event) {
    if (goalsHoverTarget(event.relatedTarget)) return;
    hideGoals();
  }

  function setDrawerHeight(px) {
    const drawer = $('sofa-atk-drawer');
    if (!drawer) return;
    drawer.style.height = `${Math.max(0, px)}px`;
  }

  function openDrawer() {
    ensureUi();
    state.open = true;
    const drawer = $('sofa-atk-drawer');
    const overlay = $('sofa-atk-overlay');
    overlay.classList.add('open');
    drawer.classList.add('open');
    setDrawerHeight(menuCoverHeight());
    const id = readMatchId();
    if (id !== state.matchId || !state.model) {
      loadGraph(false);
    }
    schedulePoll();
  }

  function closeDrawer() {
    state.open = false;
    hideTip();
    hideGoals();
    closePeriodModal();
    const drawer = $('sofa-atk-drawer');
    const overlay = $('sofa-atk-overlay');
    if (overlay) overlay.classList.remove('open');
    if (drawer) {
      drawer.classList.remove('open');
      setDrawerHeight(0);
    }
    clearPoll();
  }

  function onHandleDown(event) {
    if (event.button != null && event.button !== 0) return;
    const drawer = $('sofa-atk-drawer');
    state.drag = {
      startY: event.clientY,
      startH: drawer.getBoundingClientRect().height,
      moved: false,
    };
    drawer.classList.add('dragging');
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.addEventListener('pointermove', onHandleMove);
    event.currentTarget.addEventListener('pointerup', onHandleUp);
  }

  function onHandleMove(event) {
    if (!state.drag) return;
    const next = state.drag.startH + (event.clientY - state.drag.startY);
    if (Math.abs(event.clientY - state.drag.startY) > 4) state.drag.moved = true;
    setDrawerHeight(Math.min(window.innerHeight * 0.86, Math.max(0, next)));
  }

  function onHandleUp(event) {
    const handle = event.currentTarget;
    handle.removeEventListener('pointermove', onHandleMove);
    handle.removeEventListener('pointerup', onHandleUp);
    const drawer = $('sofa-atk-drawer');
    drawer.classList.remove('dragging');
    const height = drawer.getBoundingClientRect().height;
    const drag = state.drag;
    state.drag = null;
    if (!drag?.moved) {
      if (height > 24) closeDrawer();
      else openDrawer();
      return;
    }
    if (height < 28) closeDrawer();
    else setDrawerHeight(Math.min(height, window.innerHeight * 0.86));
  }

  function menuCoverHeight() {
    const needles = ['Football', 'Tennis', 'TV schedule', 'Favourites', 'Dropping odds', 'SCORES', 'Scores'];
    let bottom = 0;
    document.querySelectorAll('a, button').forEach((el) => {
      if (el.closest('#sofa-atk-drawer, #sofa-atk-overlay, #sofa-atk-modal')) return;
      const text = (el.innerText || '').trim();
      if (!needles.some((name) => text === name || text.startsWith(name))) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.top > 180) return;
      bottom = Math.max(bottom, rect.bottom);
    });
    if (bottom >= 48) return Math.ceil(bottom) + DRAWER_EXTRA_HEIGHT;
    const header = document.querySelector('header');
    if (header) {
      const rect = header.getBoundingClientRect();
      if (rect.top < 8 && rect.bottom > 48) return Math.ceil(rect.bottom) + DRAWER_EXTRA_HEIGHT;
    }
    return MENU_FALLBACK_HEIGHT + DRAWER_EXTRA_HEIGHT;
  }

  async function fetchJson(path) {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return res.json();
  }

  async function loadGraph(force) {
    const matchId = readMatchId();
    if (!matchId) {
      paintMessage('地址里没有比赛 id');
      return;
    }
    if (state.matchId !== matchId) {
      state.goalDist = null;
      state.distMode = '';
      state.panelView = 'xg';
    }
    if (state.loading && !force) return;
    state.loading = true;
    state.matchId = matchId;
    if (!state.model) paintMessage('加载中…');
    try {
      const [eventBody, graphBody, incidentBody, shotBody, statsBody] = await Promise.all([
        fetchJson(`/event/${matchId}`),
        fetchJson(`/event/${matchId}/graph`),
        fetchJson(`/event/${matchId}/incidents`),
        fetchJson(`/event/${matchId}/shotmap`).catch(() => ({ shotmap: [] })),
        fetchJson(`/event/${matchId}/statistics`).catch(() => null),
      ]);
      if (readMatchId() !== matchId) return;
      state.model = buildModel(eventBody, graphBody, incidentBody, shotBody);
      state.model.statsPeriods = parseStatPeriods(statsBody);
      state.model.statsByKey = state.model.statsPeriods.ALL || parseStats(statsBody);
      state.tips = state.model.tips;
      paint();
      schedulePoll();
    } catch (error) {
      paintMessage(`源站接口失败：${error.message || error}`);
    } finally {
      state.loading = false;
    }
  }

  function paintMessage(text) {
    ensureUi();
    const body = document.querySelector('#sofa-atk-drawer .sofa-atk-body');
    if (body) body.innerHTML = `<div class="sofa-atk-msg">${esc(text)}</div>`;
  }

  function paint() {
    const model = state.model;
    if (!model) return;
    const status = document.querySelector('#sofa-atk-drawer .sofa-atk-status');
    const body = document.querySelector('#sofa-atk-drawer .sofa-atk-body');
    const goalsPop = $('sofa-atk-goals');
    if (goalsPop) goalsPop.innerHTML = renderGoalsPopup(model);
    hideGoals();
    const live = model.statusType === 'inprogress';
    document.querySelector('#sofa-atk-drawer .sofa-atk-live-dot')?.classList.toggle('is-on', live && state.open);
    if (status) {
      status.textContent = model.statusText || (live ? 'Live' : '');
      status.classList.toggle('sofa-atk-live', live);
    }
    if (!model.pointCount) {
      body.innerHTML = '<div class="sofa-atk-msg">这场还没有进攻图数据</div>';
      return;
    }
    body.innerHTML = renderGraph(model);
    mountPageCrests(body);
    if ($('sofa-atk-modal')?.classList.contains('open')) renderPeriodModal();
  }

  function momentumCrestSources() {
    const root = document.querySelector('.attack-momentum-graph__root');
    let scope = root;
    for (let depth = 0; depth < 6 && scope; depth += 1) {
      const imgs = [...scope.querySelectorAll('img')].filter((img) => {
        if (img.closest('#sofa-atk-drawer, #sofa-atk-modal')) return false;
        const rect = img.getBoundingClientRect();
        return rect.width >= 14 && rect.width <= 72 && rect.height >= 14 && rect.height <= 72;
      });
      if (imgs.length >= 2) {
        imgs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        return imgs.slice(0, 2);
      }
      scope = scope.parentElement;
    }
    return [];
  }

  function mountPageCrests(root) {
    const sources = momentumCrestSources();
    if (sources.length < 2 || !root) return;
    root.querySelectorAll('[data-crest]').forEach((slot) => {
      const source = slot.dataset.crest === 'away' ? sources[1] : sources[0];
      const sw = source.naturalWidth || source.width;
      const sh = source.naturalHeight || source.height;
      if (!sw || !sh) return;
      const size = 36;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas.className = 'sofa-atk-crest-canvas';
      canvas.getContext('2d').drawImage(source, 0, 0, sw, sh, 0, 0, size, size);
      slot.querySelector('canvas')?.remove();
      slot.classList.remove('is-fallback');
      slot.insertBefore(canvas, slot.firstChild);
    });
  }

  const PERIODS = [
    { label: '0-15', min: 0, max: 15 },
    { label: '16-30', min: 16, max: 30 },
    { label: '31-45', min: 31, max: 45 },
    { label: '46-60', min: 46, max: 60 },
    { label: '61-75', min: 61, max: 75 },
    { label: '76-90', min: 76, max: 90 },
  ];

  function regulationBucket(item) {
    const time = num(item?.time);
    if (time == null || time > 90) return null;
    const added = num(item?.addedTime);
    const add = added != null && added > 0 ? added : 0;
    if (time <= 45) return time === 45 && add > 0 ? 45 : Math.min(45, time + add);
    return time === 90 && add > 0 ? 90 : Math.min(90, time + add);
  }

  function buildPeriodRows(model) {
    const rows = PERIODS.map((period) => ({
      ...period,
      homeXg: 0,
      awayXg: 0,
      homeXgot: 0,
      awayXgot: 0,
      homePress: 0,
      awayPress: 0,
      homeGoals: 0,
      awayGoals: 0,
    }));
    const rowAt = (minute) => rows.find((row) => minute != null && minute >= row.min && minute <= row.max);
    (model.rawShots || []).forEach((shot) => {
      const row = rowAt(regulationBucket(shot));
      if (!row) return;
      const xg = Number(shot.xg) || 0;
      const xgot = shot.xgot != null && shot.xgot !== '' ? Number(shot.xgot) || 0 : 0;
      if (shot.isHome) {
        row.homeXg += xg;
        row.homeXgot += xgot;
      } else {
        row.awayXg += xg;
        row.awayXgot += xgot;
      }
    });
    (model.rawIncidents || []).forEach((item) => {
      if (item.incidentType !== 'goal' || isShootoutIncident(item)) return;
      const row = rowAt(regulationBucket(item));
      if (!row) return;
      if (item.isHome) row.homeGoals += 1;
      else row.awayGoals += 1;
    });
    (model.graphPoints || []).forEach((point) => {
      const minute = num(point?.minute);
      if (minute == null || minute > 90.5) return;
      const row = rows.find((item) => minute >= item.min && minute <= (item.max === 90 ? 90.5 : item.max));
      if (!row) return;
      const raw = num(point.value) || 0;
      const press = Math.abs(raw * SCALE);
      if (raw > 0) row.homePress += press;
      else if (raw < 0) row.awayPress += press;
    });
    return rows;
  }

  function sideShots(shots, isHome) {
    let all = 0;
    let on = 0;
    (shots || []).forEach((shot) => {
      if (isShootoutShot(shot) || !!shot.isHome !== isHome) return;
      const minute = num(shot.time);
      if (minute == null || minute > 120) return;
      all += 1;
      if (shot.shotType === 'goal' || shot.shotType === 'save') on += 1;
    });
    return { all, on };
  }

  function sideGoals(incidents, isHome) {
    return (incidents || []).filter((item) => item.incidentType === 'goal' && !isShootoutIncident(item) && !!item.isHome === isHome).length;
  }

  function barPct(value, max) {
    if (!max) return 0;
    return Math.max(0, Math.min(100, (value / max) * 100));
  }

  function parsePeriodBlock(block) {
    const byKey = {};
    (block?.groups || []).forEach((group) => {
      (group.statisticsItems || []).forEach((item) => {
        if (!item?.key || byKey[item.key]) return;
        byKey[item.key] = {
          key: item.key,
          name: item.name || item.key,
          home: item.home,
          away: item.away,
          homeValue: num(item.homeValue),
          awayValue: num(item.awayValue),
          homeTotal: num(item.homeTotal),
          awayTotal: num(item.awayTotal),
        };
      });
    });
    const passes = byKey.passes;
    const accurate = byKey.accuratePasses;
    if (passes && accurate) {
      const homePct = passes.homeValue > 0 ? (accurate.homeValue / passes.homeValue) * 100 : null;
      const awayPct = passes.awayValue > 0 ? (accurate.awayValue / passes.awayValue) * 100 : null;
      byKey.passAccuracy = {
        key: 'passAccuracy',
        home: homePct == null ? '—' : `${Math.round(homePct)}%`,
        away: awayPct == null ? '—' : `${Math.round(awayPct)}%`,
        homeValue: homePct,
        awayValue: awayPct,
      };
    }
    return byKey;
  }

  function parseStats(payload) {
    const statistics = payload?.statistics || [];
    const block = statistics.find((item) => item.period === 'ALL') || statistics[0];
    return parsePeriodBlock(block);
  }

  function parseStatPeriods(payload) {
    const periods = {};
    (payload?.statistics || []).forEach((block) => {
      if (block?.period) periods[block.period] = parsePeriodBlock(block);
    });
    if (!periods.ALL && payload) periods.ALL = parseStats(payload);
    return periods;
  }

  function statText(item, side) {
    if (!item) return '';
    const text = side === 'home' ? item.home : item.away;
    if (text != null && text !== '') return String(text);
    const value = side === 'home' ? item.homeValue : item.awayValue;
    return value == null ? '' : String(value);
  }

  function statValue(item, side) {
    if (!item) return null;
    const value = side === 'home' ? item.homeValue : item.awayValue;
    return value == null ? num(String(statText(item, side)).replace('%', '')) : value;
  }

  function minuteInStatPeriod(minute, period) {
    if (!period || period === 'ALL') return true;
    if (minute == null) return false;
    if (period === '1ST') return minute < 46;
    if (period === '2ND') return minute >= 46 && minute <= 90.5;
    if (period === 'ET1') return minute >= 91 && minute <= 105.5;
    if (period === 'ET2') return minute >= 106 && minute <= 120.5;
    return true;
  }

  function pressureShare(points, period) {
    let home = 0;
    let away = 0;
    let homeMinutes = 0;
    let awayMinutes = 0;
    let homePeak = 0;
    let awayPeak = 0;
    (points || []).forEach((point) => {
      if (!minuteInStatPeriod(num(point?.minute), period)) return;
      const raw = num(point?.value) || 0;
      const press = Math.abs(raw * SCALE);
      if (raw > 0) {
        home += press;
        homeMinutes += 1;
        homePeak = Math.max(homePeak, press);
      } else if (raw < 0) {
        away += press;
        awayMinutes += 1;
        awayPeak = Math.max(awayPeak, press);
      }
    });
    const total = home + away;
    if (!total) return null;
    return {
      home: (home / total) * 100,
      away: (away / total) * 100,
      homeTotal: home,
      awayTotal: away,
      homeAvg: homeMinutes ? home / homeMinutes : 0,
      awayAvg: awayMinutes ? away / awayMinutes : 0,
      homePeak: homePeak,
      awayPeak: awayPeak,
    };
  }

  function gaugePt(cx, cy, radius, deg) {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
  }

  function gaugeBand(cx, cy, rOuter, rInner, a0, a1) {
    const span = ((a1 - a0) % 360 + 360) % 360;
    if (span < 0.3) return '';
    const large = span > 180 ? 1 : 0;
    const at = (radius, deg) => {
      const [x, y] = gaugePt(cx, cy, radius, deg);
      return `${x.toFixed(2)} ${y.toFixed(2)}`;
    };
    const cap = ((rOuter - rInner) / 2).toFixed(2);
    return `M ${at(rOuter, a0)} A ${rOuter.toFixed(2)} ${rOuter.toFixed(2)} 0 ${large} 1 ${at(rOuter, a1)} A ${cap} ${cap} 0 0 1 ${at(rInner, a1)} A ${rInner.toFixed(2)} ${rInner.toFixed(2)} 0 ${large} 0 ${at(rInner, a0)} A ${cap} ${cap} 0 0 1 ${at(rOuter, a0)} Z`;
  }

  function gaugeSvg(side, share, teamLabel) {
    const pct = Math.max(0, Math.min(100, Number(share) || 0));
    const solid = side === 'home' ? '#0bb32a' : '#374df5';
    const soft = side === 'home' ? '#9de8ad' : '#adb8f7';
    const cx = 110;
    const cy = 105.6;
    const radius = 79.2;
    const width = 14;
    const start = -200;
    const sweep = 220;
    const end = start + sweep;
    const valueEnd = start + sweep * (pct / 100);
    const ticks = [];
    for (let index = 0; index <= 10; index += 1) {
      const deg = start + sweep * (index / 10);
      const majorOuter = gaugePt(cx, cy, radius + 11, deg);
      const majorInner = gaugePt(cx, cy, radius + 5, deg);
      ticks.push(`<line x1="${majorInner[0].toFixed(2)}" y1="${majorInner[1].toFixed(2)}" x2="${majorOuter[0].toFixed(2)}" y2="${majorOuter[1].toFixed(2)}" stroke="#999" stroke-width="1.5"></line>`);
      if (index % 2 === 0) {
        const labelAt = gaugePt(cx, cy, radius + 29, deg);
        const rad = (deg * Math.PI) / 180;
        const ux = Math.cos(rad);
        const uy = Math.sin(rad);
        const anchor = ux < -0.4 ? 'start' : ux > 0.4 ? 'end' : 'middle';
        const baseline = uy < -0.8 ? 'hanging' : uy > 0.8 ? 'auto' : 'middle';
        ticks.push(`<text x="${labelAt[0].toFixed(2)}" y="${labelAt[1].toFixed(2)}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="#999" font-size="9">${index * 10}</text>`);
      }
      if (index === 10) continue;
      for (let step = 1; step < 5; step += 1) {
        const tickDeg = start + sweep * ((index + step / 5) / 10);
        const outer = gaugePt(cx, cy, radius + 8, tickDeg);
        const inner = gaugePt(cx, cy, radius + 5, tickDeg);
        ticks.push(`<line x1="${inner[0].toFixed(2)}" y1="${inner[1].toFixed(2)}" x2="${outer[0].toFixed(2)}" y2="${outer[1].toFixed(2)}" stroke="#999" stroke-width="1"></line>`);
      }
    }
    const light = pct > 0.05 ? `<path d="${gaugeBand(cx, cy, radius, radius - width, start, valueEnd)}" fill="${soft}"></path>` : '';
    const dark = pct > 0.05 ? `<path d="${gaugeBand(cx, cy, radius, radius - 4, start, valueEnd)}" fill="${solid}"></path>` : '';
    const label = teamLabel ? `<div class="atk-gauge-team is-${side}">${esc(teamLabel)}</div>` : '';
    const team = teamLabel || (side === 'home' ? '主队' : '客队');
    return `<div class="atk-gauge-wrap"><svg class="atk-gauge" viewBox="0 0 220 176" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(team)} 攻压占比 ${pct.toFixed(1)}%">
      <path d="${gaugeBand(cx, cy, radius, radius - width, start, end)}" fill="#E6EBF8"></path>
      ${light}
      ${dark}
      ${ticks.join('')}
      <text x="${cx}" y="${(cy - radius * 0.12).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="${solid}" font-size="21" font-weight="700">${pct.toFixed(1)}%</text>
    </svg>${label}</div>`;
  }

  function normalizeGoalDist(raw) {
    const list = raw?.goalDistributions;
    if (!Array.isArray(list)) return null;
    const pick = (type) => {
      const block = list.find((item) => item?.type === type);
      if (!Array.isArray(block?.periods)) return null;
      const periods = [...block.periods].sort((a, b) => (Number(a.periodStart) || 0) - (Number(b.periodStart) || 0));
      return {
        scored: periods.slice(0, 6).map((item) => Number(item.scoredGoals) || 0),
        conceded: periods.slice(0, 6).map((item) => Number(item.concededGoals) || 0),
      };
    };
    return { all: pick('overall'), homeVenue: pick('home'), awayVenue: pick('away') };
  }

  function distBuckets(norm, teamSide, kind) {
    const empty = [0, 0, 0, 0, 0, 0];
    if (!norm) return empty;
    const field = kind === 'conceded' ? 'conceded' : 'scored';
    const block = teamSide === 'home' ? norm.homeVenue : norm.awayVenue;
    const values = (block || norm.all)?.[field];
    if (!Array.isArray(values)) return empty;
    return empty.map((_, index) => Number(values[index]) || 0);
  }

  async function ensureGoalDist() {
    const model = state.model;
    if (!model || state.goalDist || state.goalDistLoading) return state.goalDist;
    if (!model.uniqueTournamentId || !model.seasonId || !model.homeId || !model.awayId) return null;
    state.goalDistLoading = true;
    try {
      const path = (id) => `/team/${id}/unique-tournament/${model.uniqueTournamentId}/season/${model.seasonId}/goal-distributions`;
      const [home, away] = await Promise.all([
        fetchJson(path(model.homeId)).catch(() => null),
        fetchJson(path(model.awayId)).catch(() => null),
      ]);
      state.goalDist = { home: normalizeGoalDist(home), away: normalizeGoalDist(away) };
    } finally {
      state.goalDistLoading = false;
    }
    return state.goalDist;
  }

  function pressureLabelStyle(pct, side) {
    const n = Math.min(100, Math.max(0, Number(pct) || 0));
    const nearOuter = n >= 85;
    const nearInner = n <= 15;
    if (side === 'home') {
      const transform = nearOuter ? 'translateX(0)' : (nearInner ? 'translateX(-100%)' : 'translateX(-50%)');
      return `left:${100 - n}%;transform:${transform}`;
    }
    const transform = nearOuter ? 'translateX(-100%)' : (nearInner ? 'translateX(0)' : 'translateX(-50%)');
    return `left:${n}%;transform:${transform}`;
  }

  function periodEvents(model, row, isHome) {
    const goals = [];
    const subs = [];
    const reds = [];
    (model.rawIncidents || []).forEach((item) => {
      if (!!item.isHome !== isHome || isShootoutIncident(item)) return;
      const minute = regulationBucket(item);
      if (minute == null || minute < row.min || minute > row.max) return;
      const tip = esc(plainIncident(item));
      if (item.incidentType === 'goal') goals.push(tip);
      else if (item.incidentType === 'substitution' && item.incidentClass === 'regular') subs.push(tip);
      else if (item.incidentType === 'card' && (item.incidentClass === 'red' || item.incidentClass === 'yellowRed')) reds.push(tip);
    });
    return { goals, subs, reds };
  }

  function displayMinute(item) {
    const time = item?.time;
    const added = num(item?.addedTime);
    if (added != null && added > 0 && added < 100) return `${time}+${added}`;
    return time == null ? '' : String(time);
  }

  function windowSideStats(model, from, to, isHome) {
    let xg = 0;
    (model.rawShots || []).forEach((shot) => {
      if (!!shot.isHome !== isHome || isShootoutShot(shot)) return;
      const minute = eventMinute(shot);
      if (minute == null || minute < from || minute >= to) return;
      xg += Number(shot.xg) || 0;
    });
    let press = 0;
    (model.graphPoints || []).forEach((point) => {
      const minute = num(point?.minute);
      if (minute == null || minute < from || minute >= to) return;
      const raw = num(point.value) || 0;
      if (isHome && raw > 0) press += raw * SCALE;
      if (!isHome && raw < 0) press += Math.abs(raw * SCALE);
    });
    return { xg, press };
  }

  function deltaClass(value) {
    if (value > 0.05) return 'tl-up';
    if (value < -0.05) return 'tl-down';
    return '';
  }

  function signed(value, digits) {
    const text = Number(value || 0).toFixed(digits);
    return value > 0 ? `+${text}` : text;
  }

  function buildKeyEvents(model) {
    const events = [];
    (model.rawIncidents || []).forEach((item, index) => {
      if (isShootoutIncident(item)) return;
      const type = item.incidentType;
      const cls = item.incidentClass;
      const isHome = !!item.isHome;
      const minute = eventMinute(item) ?? 0;
      const base = {
        id: item.id || `${index}-${minute}`,
        minute,
        displayMinute: displayMinute(item),
        phase: periodPhaseLabel(item),
        isHome,
        isRegulation: minute <= 90.5,
        player: playerLabel(item.player, item.playerName),
        assist: type === 'goal' ? playerLabel(item.assist1, item.assist1Name) : '',
        score: type === 'goal' && item.homeScore != null ? `${item.homeScore}-${item.awayScore}` : '',
      };
      if (type === 'goal') {
        const titles = { penalty: '点球', ownGoal: '乌龙' };
        events.push({ ...base, kind: 'goal', badge: '⚽', title: titles[cls] || '进球', tone: 'goal', layout: 'goal' });
      } else if (type === 'card' && (cls === 'yellow' || cls === 'red' || cls === 'yellowRed')) {
        const yellow = cls === 'yellow';
        events.push({
          ...base,
          kind: yellow ? 'yellow' : 'red',
          badge: yellow ? '🟨' : '🟥',
          title: cls === 'yellowRed' ? '两黄变一红' : (yellow ? '黄牌' : '红牌'),
          tone: yellow ? 'yellow' : 'red',
          layout: 'inline',
        });
      } else if (type === 'substitution') {
        events.push({
          ...base,
          kind: 'sub',
          title: '换人',
          tone: 'sub',
          layout: 'sub',
          subIn: playerLabel(item.playerIn, item.playerInName),
          subOut: playerLabel(item.playerOut, item.playerOutName),
        });
      }
    });
    (model.rawShots || []).forEach((shot, index) => {
      if (isShootoutShot(shot)) return;
      const minute = eventMinute(shot) ?? 0;
      const xg = Number(shot.xg) || 0;
      if (shot.shotType === 'goal') {
        const goal = events.find((event) => event.layout === 'goal' && !!event.isHome === !!shot.isHome && Math.abs(event.minute - minute) <= 2);
        if (goal) {
          goal.xg = xg;
          if (xg >= BIG_CHANCE_XG) {
            goal.isBigChance = true;
            goal.kind = 'bigChance';
          }
        }
        return;
      }
      if (xg < BIG_CHANCE_XG) return;
      const results = { miss: '射偏', block: '被封堵', save: '被扑出' };
      events.push({
        id: `chance-${shot.id || index}`,
        minute,
        displayMinute: displayMinute(shot),
        phase: periodPhaseLabel(shot),
        isHome: !!shot.isHome,
        isRegulation: minute <= 90.5,
        kind: 'bigChance',
        badge: '◎',
        title: '错失绝佳',
        tone: 'chance',
        layout: 'inline',
        player: playerLabel(shot.player, ''),
        xg: Number(shot.xg) || 0,
        result: results[shot.shotType] || '未进',
      });
    });
    return events.sort((a, b) => b.minute - a.minute);
  }

  function renderKeyTimeline(model) {
    const all = buildKeyEvents(model).filter((event) => !state.timelineRegulation || event.isRegulation);
    const filters = [
      ['goal', '⚽', all.filter((event) => event.layout === 'goal' && event.kind === 'goal').length],
      ['bigChance', '◎', all.filter((event) => event.kind === 'bigChance').length],
      ['yellow', '🟨', all.filter((event) => event.kind === 'yellow').length],
      ['red', '🟥', all.filter((event) => event.kind === 'red').length],
      ['sub', '换', all.filter((event) => event.kind === 'sub').length],
    ];
    const visible = state.timelineFilter
      ? all.filter((event) => (state.timelineFilter === 'goal' ? event.layout === 'goal' && event.kind === 'goal' : event.kind === state.timelineFilter))
      : all;
    const card = (event) => {
      if (event.layout === 'sub') {
        const before = windowSideStats(model, event.minute - 15, event.minute, event.isHome);
        const after = windowSideStats(model, event.minute, event.minute + 15, event.isHome);
        const xgDelta = after.xg - before.xg;
        const pressDelta = after.press - before.press;
        return `<div class="tl-card">
          <div><svg viewBox="0 0 16 16" class="atk-sub ${event.isHome ? 'is-home' : 'is-away'}"><path d="${SVG['substitution-regular']}"></path></svg> <b>${event.title}</b></div>
          <div><span class="tl-sub-out">${esc(event.subOut)}</span> <span class="tl-sub-in">${esc(event.subIn)} ↑</span></div>
          <div class="tl-impact">前后15′ xG ${before.xg.toFixed(2)}→${after.xg.toFixed(2)} <span class="${deltaClass(xgDelta)}">${signed(xgDelta, 2)}</span> · 攻压 ${Math.round(before.press)}→${Math.round(after.press)} <span class="${deltaClass(pressDelta)}">${signed(pressDelta, 0)}</span></div>
        </div>`;
      }
      if (event.layout === 'inline') {
        return `<div class="tl-card"><b>${event.badge} ${esc(event.title)}</b> ${esc(event.player)} ${event.xg != null ? `xG ${event.xg.toFixed(2)}` : ''} ${esc(event.result || '')}</div>`;
      }
      return `<div class="tl-card">
        <div><b>${event.badge} ${esc(event.title)}</b> ${event.score ? `<b>${esc(event.score)}</b>` : ''} ${event.isBigChance ? '<span>绝佳</span>' : ''}</div>
        <div>${esc(event.player)} ${event.assist ? `助攻：${esc(event.assist)}` : ''} ${event.xg != null ? `xG ${event.xg.toFixed(2)}` : ''}</div>
      </div>`;
    };
    const rows = visible.map((event, index) => `
      <div class="tl-row ${event.isHome ? 'is-home' : 'is-away'}">
        <div>${event.isHome ? card(event) : ''}</div>
        <div class="tl-axis">
          <span class="tl-min">${esc(event.displayMinute)}′</span>
          ${event.phase ? `<span class="tl-phase">${event.phase}</span>` : ''}
          <span class="tl-dot is-${event.tone}"></span>
          ${index < visible.length - 1 ? '<span class="tl-line"></span>' : ''}
        </div>
        <div>${event.isHome ? '' : card(event)}</div>
      </div>`).join('');
    return `
      <div class="tl-head"><span class="is-home">${esc(model.homeFullName)}</span><span></span><span class="is-away">${esc(model.awayFullName)}</span></div>
      <div class="tl-filters">
        ${filters.map(([key, badge, count]) => `<button type="button" class="tl-filter${state.timelineFilter && state.timelineFilter !== key ? ' is-dim' : ''}" data-panel="tl-${key}" ${count ? '' : 'disabled'}>${badge} ${count}</button>`).join('')}
        <button type="button" class="tl-filter is-scope${state.timelineRegulation ? ' is-on' : ''}" data-panel="tl-scope">常规</button>
      </div>
      <div class="tl-list">${rows || '<div class="sofa-atk-msg">没有符合筛选的事件</div>'}</div>`;
  }

  function compareRow(label, homeText, awayText, homeValue, awayValue, mode) {
    const home = Math.abs(Number(homeValue) || 0);
    const away = Math.abs(Number(awayValue) || 0);
    let homePct = 0;
    let awayPct = 0;
    if (mode === 'percent') {
      homePct = Math.min(100, home);
      awayPct = Math.min(100, away);
    } else {
      const total = home + away;
      if (total > 0) {
        homePct = (home / total) * 100;
        awayPct = (away / total) * 100;
      }
    }
    const homeWins = mode === 'lower' ? home < away : home > away;
    const awayWins = mode === 'lower' ? away < home : away > home;
    const homeClass = homeWins ? 'is-leader' : (awayWins ? 'is-laggard' : '');
    const awayClass = awayWins ? 'is-leader' : (homeWins ? 'is-laggard' : '');
    const fill = (pct) => (pct > 0 ? `<i style="width:${pct.toFixed(1)}%"></i>` : '');
    return `<div class="pf-row">
      <span class="pf-val is-home ${homeClass}">${esc(homeText || '—')}</span>
      <div class="pf-core">
        <div class="pf-side is-home">${fill(homePct)}</div>
        <span class="pf-label">${esc(label)}</span>
        <div class="pf-side is-away">${fill(awayPct)}</div>
      </div>
      <span class="pf-val is-away ${awayClass}">${esc(awayText || '—')}</span>
    </div>`;
  }

  function radarSvg(axes) {
    const count = axes.length;
    if (count < 3) return '';
    const cx = 120;
    const cy = 108;
    const radius = 72;
    const point = (index, ratio) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
      return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio];
    };
    const ring = [0.25, 0.5, 0.75, 1].map((ratio) => {
      const pts = axes.map((_, index) => point(index, ratio).map((value) => value.toFixed(1)).join(',')).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="rgba(34,34,38,.12)" stroke-width="1"></polygon>`;
    }).join('');
    const spokes = axes.map((_, index) => {
      const end = point(index, 1);
      return `<line x1="${cx}" y1="${cy}" x2="${end[0].toFixed(1)}" y2="${end[1].toFixed(1)}" stroke="rgba(34,34,38,.12)"></line>`;
    }).join('');
    const shape = (key, color) => axes.map((axis, index) => {
      const ratio = Math.max(0, Math.min(1, (Number(axis[key]) || 0) / (axis.max || 1)));
      return point(index, ratio).map((value) => value.toFixed(1)).join(',');
    }).join(' ');
    const labels = axes.map((axis, index) => {
      const at = point(index, 1.18);
      return `<text x="${at[0].toFixed(1)}" y="${at[1].toFixed(1)}" text-anchor="middle" font-size="9" fill="#777">${esc(axis.label)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 240 220">
      ${ring}${spokes}
      <polygon points="${shape('away', '#374df5')}" fill="rgba(55,77,245,.16)" stroke="#374df5" stroke-width="1.5"></polygon>
      <polygon points="${shape('home', '#0bb32a')}" fill="rgba(11,179,42,.18)" stroke="#0bb32a" stroke-width="1.5"></polygon>
      ${labels}
    </svg>`;
  }

  function metric(label, home, away, max, homeText, awayText) {
    if (home == null && away == null) return null;
    return {
      label,
      home: Number(home) || 0,
      away: Number(away) || 0,
      max: max || Math.max(Number(home) || 0, Number(away) || 0, 1),
      homeText: homeText || String(home ?? '—'),
      awayText: awayText || String(away ?? '—'),
    };
  }

  function renderMatchProfile(model) {
    const periods = model.statsPeriods || {};
    const order = ['ALL', '1ST', '2ND', 'ET1', 'ET2'].filter((key) => periods[key]);
    const period = periods[state.profilePeriod] ? state.profilePeriod : 'ALL';
    const stats = periods[period] || model.statsByKey || {};
    const labels = { ALL: '全场', '1ST': '上半场', '2ND': '下半场', ET1: '加时上', ET2: '加时下' };
    const share = pressureShare(model.graphPoints, period);
    const sideNum = (key, side) => statValue(stats[key], side);
    const goals = (isHome) => (model.rawIncidents || []).filter((item) => item.incidentType === 'goal' && !isShootoutIncident(item) && !!item.isHome === isHome && minuteInStatPeriod(eventMinute(item), period)).length;
    const xgSum = (isHome) => (model.rawShots || []).reduce((sum, shot) => {
      if (!!shot.isHome !== isHome || isShootoutShot(shot) || !minuteInStatPeriod(eventMinute(shot), period)) return sum;
      return sum + (Number(shot.xg) || 0);
    }, 0);
    const priority = [
      ['控球率', statText(stats.ballPossession, 'home'), statText(stats.ballPossession, 'away'), sideNum('ballPossession', 'home'), sideNum('ballPossession', 'away'), 'percent'],
      ['传球成功率', statText(stats.passAccuracy, 'home'), statText(stats.passAccuracy, 'away'), sideNum('passAccuracy', 'home'), sideNum('passAccuracy', 'away'), 'percent'],
      ['成功传球', statText(stats.accuratePasses, 'home'), statText(stats.accuratePasses, 'away'), sideNum('accuratePasses', 'home'), sideNum('accuratePasses', 'away')],
      ['进入进攻三区', statText(stats.finalThirdEntries, 'home'), statText(stats.finalThirdEntries, 'away'), sideNum('finalThirdEntries', 'home'), sideNum('finalThirdEntries', 'away')],
      ['跑动距离', statText(stats.kilometersCovered, 'home'), statText(stats.kilometersCovered, 'away'), sideNum('kilometersCovered', 'home'), sideNum('kilometersCovered', 'away')],
      ['射正/射门', `${statText(stats.shotsOnGoal, 'home')}/${statText(stats.totalShotsOnGoal, 'home')}`, `${statText(stats.shotsOnGoal, 'away')}/${statText(stats.totalShotsOnGoal, 'away')}`, sideNum('totalShotsOnGoal', 'home'), sideNum('totalShotsOnGoal', 'away')],
      ['禁区内射门', statText(stats.totalShotsInsideBox, 'home'), statText(stats.totalShotsInsideBox, 'away'), sideNum('totalShotsInsideBox', 'home'), sideNum('totalShotsInsideBox', 'away')],
      ['禁区外射门', statText(stats.totalShotsOutsideBox, 'home'), statText(stats.totalShotsOutsideBox, 'away'), sideNum('totalShotsOutsideBox', 'home'), sideNum('totalShotsOutsideBox', 'away')],
      ['错失/绝佳', `${statText(stats.bigChanceMissed, 'home')}/${statText(stats.bigChanceCreated, 'home')}`, `${statText(stats.bigChanceMissed, 'away')}/${statText(stats.bigChanceCreated, 'away')}`, sideNum('bigChanceCreated', 'home'), sideNum('bigChanceCreated', 'away')],
      ['角球', statText(stats.cornerKicks, 'home'), statText(stats.cornerKicks, 'away'), sideNum('cornerKicks', 'home'), sideNum('cornerKicks', 'away')],
    ].filter((row) => row[1] || row[2]);
    const sections = [
      ['防守拼抢', [['interceptionWon', '拦截'], ['totalTackle', '抢断'], ['totalClearance', '解围'], ['ballRecovery', '夺回球权']]],
      ['对抗犯规', [['fouls', '犯规', 'lower'], ['yellowCards', '黄牌', 'lower'], ['redCards', '红牌', 'lower'], ['duelWonPercent', '对抗成功率', 'percent']]],
      ['门将', [['goalkeeperSaves', '扑救'], ['goalsPrevented', '阻止进球'], ['goalKicks', '球门球']]],
    ];
    const attackAxes = [
      metric('控球', sideNum('ballPossession', 'home'), sideNum('ballPossession', 'away'), 100),
      metric('传球成功率', sideNum('passAccuracy', 'home'), sideNum('passAccuracy', 'away'), 100),
      share ? metric('攻压', share.home, share.away, 100) : null,
      metric('射正', sideNum('shotsOnGoal', 'home'), sideNum('shotsOnGoal', 'away')),
      metric('进球', goals(true), goals(false)),
      metric('xG', xgSum(true), xgSum(false)),
    ].filter(Boolean);
    const transitionAxes = [
      metric('传球', sideNum('passes', 'home'), sideNum('passes', 'away')),
      metric('成功率', sideNum('passAccuracy', 'home'), sideNum('passAccuracy', 'away'), 100),
      metric('三区', sideNum('finalThirdEntries', 'home'), sideNum('finalThirdEntries', 'away')),
      metric('跑动', sideNum('kilometersCovered', 'home'), sideNum('kilometersCovered', 'away')),
    ].filter(Boolean);
    const defenseAxes = [
      metric('对抗', sideNum('duelWonPercent', 'home'), sideNum('duelWonPercent', 'away'), 100),
      metric('夺回', sideNum('ballRecovery', 'home'), sideNum('ballRecovery', 'away')),
      metric('拦截', sideNum('interceptionWon', 'home'), sideNum('interceptionWon', 'away')),
      metric('抢断', sideNum('totalTackle', 'home'), sideNum('totalTackle', 'away')),
      metric('解围', sideNum('totalClearance', 'home'), sideNum('totalClearance', 'away')),
    ].filter(Boolean);
    const pressureRows = share ? [
      compareRow('攻压占比', `${share.home.toFixed(1)}%`, `${share.away.toFixed(1)}%`, share.home, share.away, 'percent'),
      compareRow('累计攻压', String(Math.round(share.homeTotal)), String(Math.round(share.awayTotal)), share.homeTotal, share.awayTotal),
      compareRow('均分钟攻压', share.homeAvg.toFixed(1), share.awayAvg.toFixed(1), share.homeAvg, share.awayAvg),
      compareRow('峰值攻压', share.homePeak.toFixed(1), share.awayPeak.toFixed(1), share.homePeak, share.awayPeak),
    ].join('') : '';
    const poss = stats.ballPossession;
    const homePoss = Math.max(0, Math.min(100, sideNum('ballPossession', 'home') || 0));
    const awayPoss = Math.max(0, Math.min(100, sideNum('ballPossession', 'away') || 0));
    const possLabelPos = (side) => {
      if (side === 'home') {
        return homePoss <= 12
          ? `left:${homePoss}%;transform:translateX(0)`
          : `left:${homePoss / 2}%;transform:translateX(-50%)`;
      }
      return awayPoss <= 12
        ? `left:${homePoss + awayPoss}%;transform:translateX(-100%)`
        : `left:${homePoss + awayPoss / 2}%;transform:translateX(-50%)`;
    };
    const possFooter = poss ? `<div class="pf-poss" title="控球率 ${esc(model.homeFullName)} ${esc(statText(poss, 'home'))} · ${esc(model.awayFullName)} ${esc(statText(poss, 'away'))}"><b class="is-home" style="${possLabelPos('home')}">${esc(statText(poss, 'home'))}</b><b class="is-away" style="${possLabelPos('away')}">${esc(statText(poss, 'away'))}</b><div class="pf-poss-track"><i class="is-home" style="width:${homePoss}%"></i><i class="is-away" style="width:${awayPoss}%"></i></div></div>` : '';
    return `
      <header class="pf-head">
        <span class="is-home">${esc(model.homeFullName)}</span>
        <span><span class="pf-eyebrow">ANALYST DASHBOARD</span><span class="pf-title">${labels[period] || '全场'}统计对比</span></span>
        <span class="is-away">${esc(model.awayFullName)}</span>
      </header>
      ${order.length > 1 ? `<div class="pf-tabs">${order.map((key) => `<button type="button" class="pf-tab${key === period ? ' is-on' : ''}" data-panel="pf-${key}">${labels[key]}</button>`).join('')}</div>` : ''}
      ${share ? `<section class="pf-pressure${poss ? ' has-poss' : ''}">${gaugeSvg('home', share.home, model.homeName)}<div>${pressureRows}</div>${gaugeSvg('away', share.away, model.awayName)}${possFooter}</section>` : ''}
      <section class="pf-priority">${priority.map((row) => compareRow(row[0], row[1], row[2], row[3], row[4], row[5])).join('')}</section>
      <div class="pf-radars">
        <section class="pf-radar"><h4>进攻能力雷达</h4>${radarSvg(attackAxes)}</section>
        <section class="pf-radar"><h4>攻防转换雷达</h4>${radarSvg(transitionAxes)}</section>
        <section class="pf-radar"><h4>防守能力雷达</h4>${radarSvg(defenseAxes)}</section>
      </div>
      <div class="pf-grid">${sections.map(([title, rows]) => {
        const lines = rows.map(([key, label, mode]) => {
          const item = stats[key];
          if (!item) return '';
          return compareRow(label, statText(item, 'home'), statText(item, 'away'), statValue(item, 'home'), statValue(item, 'away'), mode);
        }).join('');
        return lines ? `<section class="pf-sec"><h4>${title}</h4>${lines}</section>` : '';
      }).join('')}</div>`;
  }

  function renderPeriodModal() {
    const model = state.model;
    const body = document.querySelector('#sofa-atk-modal .sofa-atk-modal-body');
    if (!model || !body) return;
    const xg = state.showRegulationXg && model.hasXgToggle ? model.regXg : model.fullXg;
    const rows = buildPeriodRows(model);
    const maxHomeXg = Math.max(0.05, ...rows.map((row) => row.homeXg));
    const maxAwayXg = Math.max(0.05, ...rows.map((row) => row.awayXg));
    const maxPress = Math.max(0.05, ...rows.flatMap((row) => [row.homePress, row.awayPress]));
    const homeTop = [...rows].filter((row) => row.homePress > 0).sort((a, b) => b.homePress - a.homePress || a.min - b.min).slice(0, 3);
    const awayTop = [...rows].filter((row) => row.awayPress > 0).sort((a, b) => b.awayPress - a.awayPress || a.min - b.min).slice(0, 3);
    rows.forEach((row) => {
      row.homeRank = homeTop.indexOf(row) + 1;
      row.awayRank = awayTop.indexOf(row) + 1;
      row.homeXgPct = barPct(row.homeXg, maxHomeXg);
      row.awayXgPct = barPct(row.awayXg, maxAwayXg);
      row.homePressPct = barPct(row.homePress, maxPress);
      row.awayPressPct = barPct(row.awayPress, maxPress);
    });
    const stats = model.statsByKey || {};
    const share = pressureShare(model.graphPoints);
    const card = (side, name, xgValue, xgotValue) => {
      const isHome = side === 'home';
      const shotStat = sideShots(model.rawShots, isHome);
      const onItem = stats.shotsOnGoal;
      const allItem = stats.totalShotsOnGoal;
      const onText = statText(onItem, side) || String(shotStat.on);
      const allText = statText(allItem, side) || String(shotStat.all);
      const onValue = statValue(onItem, side);
      const goals = sideGoals(model.rawIncidents, isHome);
      const convBase = onValue != null && onValue > 0 ? onValue : shotStat.on;
      const conv = convBase ? Math.round((goals / convBase) * 100) : 0;
      const higher = xgotValue > xgValue + 0.001 ? ' is-higher' : '';
      const goalMarks = goals
        ? Array.from({ length: Math.min(goals, 6) }, () => `<svg viewBox="0 0 16 16" class="atk-ball is-${side}"><path d="${SVG.regular}"></path></svg>`).join('') + (goals > 6 ? `<span>+${goals - 6}</span>` : '')
        : '<span class="atk-tile-xg" style="font-size:22px;opacity:.45">0</span>';
      const poss = stats.ballPossession;
      const km = stats.kilometersCovered;
      const possPct = statValue(poss, side);
      const possLabel = statText(poss, side);
      const kmLabel = km ? `${Math.round(statValue(km, side) || 0)} km` : '';
      const footer = (possLabel || kmLabel) ? `
        <div class="atk-poss">
          <div class="atk-poss-meta">${isHome ? `<span>${esc(possLabel)}</span><em>${esc(kmLabel)}</em>` : `<em>${esc(kmLabel)}</em><span>${esc(possLabel)}</span>`}</div>
          <div class="atk-poss-track"><div class="atk-poss-fill" style="width:${Math.max(0, Math.min(100, possPct || 0))}%"></div></div>
        </div>` : '';
      return `
        <div class="atk-sum-card is-${side}">
          <div class="atk-sum-head"><span class="atk-accent"></span><span class="atk-sum-name">${esc(name)}</span></div>
          <div class="atk-stat-grid">
            <div class="atk-tile"><span class="atk-tile-label">进攻压力</span>${share ? gaugeSvg(side, isHome ? share.home : share.away) : ''}</div>
            <div class="atk-tile">
              <span class="atk-tile-label">xG</span>
              <button type="button" class="atk-tile-xg${model.hasXgToggle ? ' is-toggle' : ''}" ${model.hasXgToggle ? 'data-panel="xg-scope"' : ''} title="${model.hasXgToggle ? (state.showRegulationXg ? '当前常规90′，点击看全场' : '当前全场，点击看常规90′') : 'xG'}">${formatXg(xgValue)}</button>
              <span class="atk-xgot-ref${higher}">射正 xGOT ${formatXg(xgotValue)}</span>
            </div>
            <div class="atk-tile">
              <span class="atk-tile-label">进球</span>
              <div class="atk-goals">${goalMarks}</div>
              <div class="atk-shots" title="射正/射门，以及射正转化率"><span>${esc(onText)}/${esc(allText)}</span><b>${conv}%</b></div>
            </div>
          </div>
          ${footer}
        </div>`;
    };
    const rankMark = (rank, side) => rank ? `<span class="atk-rank is-${side}" title="攻压 Top${rank}">${rank}</span>` : '';
    const eventRow = (events, side) => {
      if (!events.goals.length && !events.subs.length && !events.reds.length) return '';
      const goals = events.goals.slice(0, 6).map((tip) => `<svg viewBox="0 0 16 16" class="atk-ball is-${side}" title="${tip}"><path d="${SVG.regular}"></path></svg>`).join('');
      const extra = events.goals.length > 6 ? `<span>+${events.goals.length - 6}</span>` : '';
      const subs = events.subs.map((tip) => `<svg viewBox="0 0 16 16" class="atk-sub is-${side}" title="${tip}"><path d="${SVG['substitution-regular']}"></path></svg>`).join('');
      const reds = events.reds.map((tip) => `<span class="atk-red" title="${tip}">🟥</span>`).join('');
      return `<div class="atk-events">${goals}${extra}${subs}${reds}</div>`;
    };
    const histRow = (count, side, conceded) => {
      if (!count) return '';
      const marks = Array.from({ length: Math.min(count, 6) }, () => (
        conceded
          ? `<span class="atk-conceded"><svg viewBox="0 0 16 16" class="atk-ball is-${side}"><path d="${SVG.regular}"></path></svg><i>✗</i></span>`
          : `<svg viewBox="0 0 16 16" class="atk-ball is-${side}"><path d="${SVG.regular}"></path></svg>`
      )).join('');
      return `<div class="atk-events">${marks}<span class="atk-hist-n">${count}</span></div>`;
    };
    const sideBars = (side, row) => {
      const xgValue = side === 'home' ? row.homeXg : row.awayXg;
      const xgotValue = side === 'home' ? row.homeXgot : row.awayXgot;
      const press = side === 'home' ? row.homePress : row.awayPress;
      const xgPct = side === 'home' ? row.homeXgPct : row.awayXgPct;
      const pressPct = side === 'home' ? row.homePressPct : row.awayPressPct;
      const rank = side === 'home' ? row.homeRank : row.awayRank;
      const higher = xgotValue > xgValue && xgValue > 0 ? ' is-higher' : '';
      const xgot = state.showPeriodXgot ? `<span class="atk-xgot${higher}"><em>xGOT</em> ${formatXg(xgotValue)}</span>` : '';
      const values = `<div class="atk-values"><span class="atk-xg">${formatXg(xgValue)}</span>${xgot}</div>`;
      const stack = `
        <div class="atk-stack">
          <div class="atk-track"><div class="atk-fill" style="width:${xgValue > 0 ? xgPct : 0}%"></div></div>
          <div class="atk-pwrap">
            <div class="atk-ptrack"><div class="atk-pfill" style="width:${press > 0 ? pressPct : 0}%"></div></div>
            <span class="atk-press is-${side}" style="${pressureLabelStyle(pressPct, side)}">${rankMark(rank, side)}${Math.round(press)}</span>
          </div>
        </div>`;
      const events = periodEvents(model, row, side === 'home');
      const index = rows.indexOf(row);
      let hist = '';
      if (state.distMode && state.goalDist) {
        const homeNorm = state.goalDist.home;
        const awayNorm = state.goalDist.away;
        if (state.distMode === 'scored' || state.distMode === 'both') {
          const buckets = distBuckets(side === 'home' ? homeNorm : awayNorm, side, 'scored');
          hist += histRow(buckets[index] || 0, side, false);
        }
        if (state.distMode === 'conceded' || state.distMode === 'both') {
          const buckets = distBuckets(side === 'home' ? homeNorm : awayNorm, side, 'conceded');
          hist += histRow(buckets[index] || 0, side, true);
        }
      }
      return `
        <div class="atk-side is-${side}">
          <div class="atk-barrow">${side === 'home' ? values + stack : stack + values}</div>
          ${hist}
          ${eventRow(events, side)}
        </div>`;
    };
    const periodHtml = rows.map((row) => `
      <div class="atk-period">
        <div class="atk-plabel">${rankMark(row.homeRank, 'home')}<b>${row.label}</b><span>分钟</span></div>
        <div class="atk-pchart">
          ${sideBars('home', row)}
          <div class="atk-axis"></div>
          ${sideBars('away', row)}
        </div>
        <div class="atk-plabel is-mirror${row.awayRank ? ' has-mark' : ''}">${rankMark(row.awayRank, 'away')}<b>${row.label}</b><span>分钟</span></div>
      </div>
      ${row.max === 45 ? '<div class="atk-half"><span>中场</span></div>' : ''}`).join('');
    const legend = state.panelView === 'timeline' ? `
      <span class="atk-legend-item">🟨 黄牌</span>
      <span class="atk-legend-item">◎ 绝佳机会</span>
      <span class="atk-legend-item">🟥 红牌</span>
      <span class="atk-legend-item"><svg viewBox="0 0 16 16" class="atk-sub is-home"><path d="${SVG['substitution-regular']}"></path></svg>换人</span>
      <span class="atk-legend-item"><svg viewBox="0 0 16 16" class="atk-ball is-home"><path d="${SVG.regular}"></path></svg>进球</span>` : `
      <span class="atk-legend-item"><i class="atk-legend-bar is-home"></i>主队 xG</span>
      <span class="atk-legend-item"><i class="atk-legend-bar is-away"></i>客队 xG</span>
      <span class="atk-legend-item"><i class="atk-legend-bar is-press is-home"></i>主队攻压</span>
      <span class="atk-legend-item"><i class="atk-legend-bar is-press is-away"></i>客队攻压</span>
      <button type="button" class="atk-chip${state.distMode === 'scored' ? ' is-active' : ''}" data-panel="dist-scored" ${state.goalDistLoading ? 'disabled' : ''}>进球分布</button>
      <button type="button" class="atk-chip${state.distMode === 'conceded' ? ' is-active' : ''}" data-panel="dist-conceded" ${state.goalDistLoading ? 'disabled' : ''}>失球分布</button>
      <button type="button" class="atk-chip${state.distMode === 'both' ? ' is-active' : ''}" data-panel="dist-both" ${state.goalDistLoading ? 'disabled' : ''}>进失球</button>`;
    const below = state.panelView === 'timeline'
      ? renderKeyTimeline(model)
      : `${periodHtml}
          <div class="atk-note">
            <span><i class="atk-legend-bar is-home"></i>色条 = 时段 xG</span>
            <span><svg viewBox="0 0 16 16" class="atk-ball is-home"><path d="${SVG.regular}"></path></svg>进球</span>
            <span><svg viewBox="0 0 16 16" class="atk-sub is-home"><path d="${SVG['substitution-regular']}"></path></svg>换人</span>
            <span>🟥 红牌</span>
            <span><button type="button" class="atk-chip${state.showPeriodXgot ? ' is-active' : ''}" data-panel="xgot">xGOT</button>射正威胁</span>
          </div>`;
    const title = document.querySelector('#sofa-atk-modal .sofa-atk-modal-title');
    if (title) {
      title.textContent = state.panelView === 'timeline' ? '比赛时间轴' : (state.panelView === 'profile' ? '比赛复盘' : '战术部署与执行');
    }
    if (state.panelView === 'profile') {
      body.innerHTML = `
        <div class="atk-legend">
          <div class="atk-legend-actions">
            <button type="button" class="atk-chip is-time" data-panel="timeline">比赛时间轴</button>
            <button type="button" class="atk-chip is-profile is-active" data-panel="profile">返回 xG</button>
          </div>
        </div>
        ${renderMatchProfile(model)}`;
      return;
    }
    body.innerHTML = `
      <div class="atk-sum">
        ${card('home', model.homeFullName, xg.home, xg.homeXgot)}
        <div class="atk-vs">VS</div>
        ${card('away', model.awayFullName, xg.away, xg.awayXgot)}
      </div>
      <div class="atk-legend">
        ${legend}
        <div class="atk-legend-actions">
          <button type="button" class="atk-chip ${state.panelView === 'timeline' ? 'is-active' : 'is-time'}" data-panel="timeline">${state.panelView === 'timeline' ? 'xG时段' : '比赛时间轴'}</button>
          <button type="button" class="atk-chip is-profile${state.panelView === 'profile' ? ' is-active' : ''}" data-panel="profile">比赛复盘</button>
        </div>
      </div>
      ${below}`;
  }

  function openPeriodModal() {
    if (!state.model) return;
    ensureUi();
    renderPeriodModal();
    $('sofa-atk-modal')?.classList.add('open');
  }

  function closePeriodModal() {
    $('sofa-atk-modal')?.classList.remove('open');
  }

  function clearPoll() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function schedulePoll() {
    clearPoll();
    if (!state.open || state.model?.statusType !== 'inprogress') return;
    state.pollTimer = setInterval(() => {
      if (state.open) loadGraph(true);
    }, 40000);
  }

  function markGraphs() {
    document.querySelectorAll('.attack-momentum-graph__root').forEach((el) => {
      if (el.dataset.sofaAtk) return;
      el.dataset.sofaAtk = '1';
      el.title = '点击上拉增强进攻图';
    });
  }

  function onPageClick(event) {
    if (event.target.closest('#sofa-atk-drawer, #sofa-atk-overlay')) return;
    const graph = event.target.closest('.attack-momentum-graph__root, svg.attack-momentum-graph__graph');
    if (!graph) return;
    openDrawer();
  }

  function onRouteChange() {
    const id = readMatchId();
    if (id === state.matchId) return;
    state.model = null;
    state.matchId = id;
    state.showRegulationXg = false;
    if (state.open) loadGraph(true);
  }

  function boot() {
    ensureUi();
    markGraphs();
    document.addEventListener('click', onPageClick, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closePeriodModal();
    });
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);
    const observer = new MutationObserver(() => markGraphs());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const wrapHistory = (name) => {
      const orig = history[name];
      history[name] = function () {
        const result = orig.apply(this, arguments);
        onRouteChange();
        return result;
      };
    };
    wrapHistory('pushState');
    wrapHistory('replaceState');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
