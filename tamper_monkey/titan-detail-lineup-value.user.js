// ==UserScript==
// @name         Titan007 阵容身价统计
// @namespace    https://titan007.com/
// @version      1.5.1
// @description  在 detail 阵容页解析并展示两队总身价、首发身价、上场身价（首发+换入替补）。
// @match        https://live.titan007.com/detail/*
// @match        http://live.titan007.com/detail/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'tm-lineup-value-panel';
  const STYLE_ID = 'tm-lineup-value-style';
  let lineupObserver = null;
  let observedBox = null;
  let lastHtml = '';
  let refreshing = false;
  let panelCollapsed = false;
  let refreshTimer = null;

  /** 页面格式：身价：600(万欧元) 或 身价：60(万英磅) */
  function parseValueWan(playEl) {
    const blob = (playEl.textContent || '').replace(/\u00a0/g, ' ');
    let m = blob.match(/身价[：:]\s*(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
    m = blob.match(/(\d+(?:\.\d+)?)\([^)]*万/);
    return m ? parseFloat(m[1]) : null;
  }

  function parseValueUnit(playEl) {
    const blob = (playEl.textContent || '').replace(/\u00a0/g, ' ');
    if (blob.indexOf('身价') === -1) return '';
    if (/欧元/.test(blob)) return '万欧元';
    if (/英镑|英磅/.test(blob)) return '万英镑';
    if (/美元|美金/.test(blob)) return '万美元';
    if (/万/.test(blob)) return '万';
    return '';
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

  function detectUnit(box) {
    const sample = box.querySelector('.play');
    if (sample) {
      const unit = parseValueUnit(sample);
      if (unit) return unit;
    }
    return '万英镑';
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
        (typeof window.homeTeamName === 'string' && window.homeTeamName) ||
        '主队',
      away:
        (awayEl && awayEl.textContent.trim()) ||
        (typeof window.guestTeamName === 'string' && window.guestTeamName) ||
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
        counts: {
          total: homeTotal.length,
          starter: homeStarters.length,
          onField: homeOnField.length,
        },
      },
      away: {
        total: sumValues(awayTotal),
        starter: sumValues(awayStarters),
        onField: sumValues(awayOnField),
        counts: {
          total: awayTotal.length,
          starter: awayStarters.length,
          onField: awayOnField.length,
        },
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
  const CHART_BAR_GAP_PX = 6;
  const CHART_GROUP_GAP_PX = 28;
  const CHART_LABEL_TOP_PX = 14;

  function barHeightPx(value, max) {
    if (!Number.isFinite(value) || max <= 0) return 0;
    return Math.max(3, Math.round((value / max) * CHART_BAR_MAX_PX));
  }

  function barItemHtml(val, unit, px, kind, title) {
    return (
      '<div class="tm-lv-item" style="--bh:' +
      px +
      'px">' +
      '<span class="tm-lv-vval tm-lv-vval-' +
      kind +
      '">' +
      escHtml(formatMoney(val, unit)) +
      '</span>' +
      '<div class="tm-lv-vbar tm-lv-vbar-' +
      kind +
      '" style="height:' +
      px +
      'px" title="' +
      escHtml(title) +
      '"></div></div>'
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
      '<div class="tm-lv-clusters">' +
      clusters +
      '</div></div>'
    );
  }

  function panelShellHtml(unit) {
    return (
      '<div class="tm-lv-head" role="button" tabindex="0" title="点击收起">' +
      '<span class="tm-lv-title">阵容身价对比</span>' +
      '<div class="tm-lv-head-actions">' +
      '<span class="tm-lv-unit">单位：' +
      escHtml(formatUnitLabel(unit || '万英镑')) +
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
    if (head) head.title = collapsed ? '点击展开' : '点击收起';
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
      'padding: ' +
      CHART_LABEL_TOP_PX +
      'px 4px 0;' +
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
      'display: flex;' +
      'flex-direction: row;' +
      'align-items: flex-end;' +
      'gap: ' +
      CHART_BAR_GAP_PX +
      'px;' +
      'height: ' +
      CHART_BAR_MAX_PX +
      'px;' +
      'border-bottom: 1px solid #cbd5e1;' +
      'box-sizing: border-box;' +
      '}' +
      '#' +
      PANEL_ID +
      ' .tm-lv-item {' +
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
      ' .tm-lv-vval {' +
      'position: absolute;' +
      'left: 50%;' +
      'transform: translateX(-50%);' +
      'bottom: calc(var(--bh, 3px) + 2px);' +
      'margin: 0;' +
      'padding: 0;' +
      'font-size: 9px;' +
      'font-weight: 600;' +
      'line-height: 1.1;' +
      'text-align: center;' +
      'white-space: nowrap;' +
      'pointer-events: none;' +
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
      '}';
    (document.head || document.documentElement).appendChild(style);
  }

  function mountPanel(stats) {
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
      } else if (panel.parentNode !== document.body && document.body) {
        document.body.appendChild(panel);
        bindPanelToggle(panel);
      } else {
        const unitEl = panel.querySelector('.tm-lv-unit');
        if (unitEl) unitEl.textContent = '单位：' + formatUnitLabel(stats.unit);
      }

      const body = panel.querySelector('.tm-lv-body');
      if (body) body.innerHTML = bodyHtml;

      setPanelCollapsed(panel, collapsed);
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
  }

  function bindLineupObserver(box) {
    if (!box || (lineupObserver && observedBox === box)) return;

    if (lineupObserver) {
      lineupObserver.disconnect();
      lineupObserver = null;
    }

    observedBox = box;
    lineupObserver = new MutationObserver(function (records) {
      if (refreshing) return;
      for (let i = 0; i < records.length; i++) {
        const t = records[i].target;
        if (t && t.id === PANEL_ID) return;
        if (t && t.closest && t.closest('#' + PANEL_ID)) return;
      }
      scheduleRefresh();
    });
    lineupObserver.observe(box, { childList: true, subtree: true });
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
      const stats = computeStats();
      if (!stats) {
        hidePanel();
        return;
      }

      const bodyHtml = panelBodyHtml(stats);
      if (bodyHtml === lastHtml) return;

      mountPanel(stats);
      bindLineupObserver(document.getElementById('matchBox2'));
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
