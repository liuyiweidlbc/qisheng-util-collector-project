// ==UserScript==
// @name         Titan007 阵容身价统计
// @namespace    https://titan007.com/
// @version      1.8.3
// @description  在 detail 阵容页解析并展示两队总身价、首发身价、上场身价（首发+换入替补），并显示主客身价倍数与各线（门将/后卫/中场/前锋）身价；首发球员标注默认身价，点击在身价/年龄/身高间循环。
// @match        https://live.titan007.com/detail/*
// @match        http://live.titan007.com/detail/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_ID = 'tm-lineup-value-panel';
  const STYLE_ID = 'tm-lineup-value-style';
  const METRIC_STORAGE_KEY = 'tm-lv-starter-metric-mode';
  const METRIC_MODES = [
    { key: 'value', label: '身价' },
    { key: 'age', label: '年龄' },
    { key: 'height', label: '身高' },
  ];
  let lineupObserver = null;
  let observedBox = null;
  let lastHtml = '';
  let lastMetricSig = '';
  let refreshing = false;
  let panelCollapsed = false;
  let refreshTimer = null;
  let metricModeIndex = 0;

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

  function parseBirthday(playEl) {
    const m = playBlob(playEl).match(/生日[：:]\s*(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
  }

  function parseHeightCm(playEl) {
    const m = playBlob(playEl).match(/身高[：:]\s*(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  function matchAsOfDate() {
    if (window.matchTime instanceof Date && !isNaN(window.matchTime.getTime())) {
      return window.matchTime;
    }
    if (typeof window.strTime === 'string' && window.strTime) {
      const d = new Date(String(window.strTime).replace(/-/g, '/'));
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

  function loadMetricModeIndex() {
    try {
      const saved = localStorage.getItem(METRIC_STORAGE_KEY);
      const i = METRIC_MODES.findIndex(function (m) {
        return m.key === saved;
      });
      return i >= 0 ? i : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveMetricModeIndex() {
    try {
      localStorage.setItem(METRIC_STORAGE_KEY, METRIC_MODES[metricModeIndex].key);
    } catch (e) {}
  }

  function currentMetricMode() {
    return METRIC_MODES[metricModeIndex] || METRIC_MODES[0];
  }

  function nextMetricMode() {
    return METRIC_MODES[(metricModeIndex + 1) % METRIC_MODES.length];
  }

  function formatPlayerMetric(playEl, modeKey, unit) {
    if (modeKey === 'age') {
      const age = calcAge(parseBirthday(playEl), matchAsOfDate());
      return Number.isFinite(age) ? age + '岁' : '-';
    }
    if (modeKey === 'height') {
      const h = parseHeightCm(playEl);
      return Number.isFinite(h) ? Math.round(h) + 'cm' : '-';
    }
    return formatMoney(parseValueWan(playEl), unit);
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
        lines: summarizeLines(box.querySelector('.plays .home'), true),
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
        lines: summarizeLines(box.querySelector('.plays .guest'), false),
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
      '<div class="tm-lv-head" role="button" tabindex="0" title="点击收起">' +
      '<span class="tm-lv-title">阵容身价对比</span>' +
      '<div class="tm-lv-head-actions">' +
      '<span class="tm-lv-mode" role="button" tabindex="0">身价</span>' +
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

  function metricClickTitle() {
    const mode = currentMetricMode();
    const next = nextMetricMode();
    return '当前' + mode.label + '，点击切换' + next.label + '（身价 → 年龄 → 身高）';
  }

  function updatePanelModeChip() {
    const chip = document.querySelector('#' + PANEL_ID + ' .tm-lv-mode');
    if (!chip) return;
    const mode = currentMetricMode();
    chip.textContent = mode.label;
    chip.setAttribute('title', metricClickTitle());
  }

  function bindPanelModeChip(panel) {
    const chip = panel.querySelector('.tm-lv-mode');
    if (!chip || chip.getAttribute('data-tm-bound')) return;
    chip.setAttribute('data-tm-bound', '1');
    chip.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      cycleMetricMode();
    });
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
        e.preventDefault();
        e.stopPropagation();
        cycleMetricMode();
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

  function starterMetricSignature(plays, modeKey, unit) {
    const parts = [modeKey];
    plays.querySelectorAll('.play').forEach(function (playEl) {
      parts.push(
        (playerId(playEl) || '') + ':' + formatPlayerMetric(playEl, modeKey, unit)
      );
    });
    return parts.join('|');
  }

  function isMetricMutation(record) {
    const t = record.target;
    if (t && t.classList && t.classList.contains('tm-lv-metric')) return true;
    if (t && t.closest && t.closest('.tm-lv-metric')) return true;
    const lists = [record.addedNodes, record.removedNodes];
    for (let i = 0; i < lists.length; i++) {
      const nodes = lists[i];
      if (!nodes || !nodes.length) continue;
      for (let j = 0; j < nodes.length; j++) {
        const n = nodes[j];
        if (n && n.classList && n.classList.contains('tm-lv-metric')) return true;
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
    const plays = box.querySelector('.plays');
    if (!plays) {
      clearStarterMetrics();
      return;
    }

    const unit = detectUnit(box);
    const mode = currentMetricMode();
    const sig = starterMetricSignature(plays, mode.key, unit);
    if (sig === lastMetricSig && plays.querySelector('.tm-lv-metric')) {
      updatePanelModeChip();
      bindMetricClick(box);
      return;
    }

    const title = metricClickTitle();
    const prevRefreshing = refreshing;
    refreshing = true;
    try {
      plays.querySelectorAll('.play').forEach(function (playEl) {
        const nameEl = playEl.querySelector('.name');
        if (!nameEl) return;
        let badge = playEl.querySelector('.tm-lv-metric');
        if (!badge) {
          badge = document.createElement('b');
          badge.className = 'tm-lv-metric';
          nameEl.insertAdjacentElement('afterend', badge);
        }
        badge.textContent = formatPlayerMetric(playEl, mode.key, unit);
        badge.setAttribute('title', title);
        badge.setAttribute('data-tm-mode', mode.key);
      });
      lastMetricSig = sig;
    } finally {
      refreshing = prevRefreshing;
    }
    updatePanelModeChip();
    bindMetricClick(box);
  }

  function cycleMetricMode() {
    metricModeIndex = (metricModeIndex + 1) % METRIC_MODES.length;
    saveMetricModeIndex();
    renderStarterMetrics();
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
      '#matchBox2 .plays .playBox .play > span {' +
      'height: auto;' +
      'min-height: 60px;' +
      '}' +
      '#matchBox2 .plays .playBox .play {' +
      'height: auto;' +
      'min-height: 80px;' +
      '}' +
      '#matchBox2 .plays .playBox .play .tm-lv-metric {' +
      'display: table;' +
      'box-sizing: border-box;' +
      'position: relative;' +
      'z-index: 10000;' +
      'margin: 1px auto 0;' +
      'padding: 0 3px;' +
      'width: auto;' +
      'max-width: none;' +
      'min-height: 0;' +
      'height: 15px;' +
      'line-height: 15px;' +
      'font-size: 10px;' +
      'font-weight: 700;' +
      'font-style: normal;' +
      'text-align: center;' +
      'white-space: nowrap;' +
      'overflow: hidden;' +
      'text-overflow: ellipsis;' +
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
      '#matchBox2 .plays .playBox .play span ul {' +
      'pointer-events: none;' +
      '}' +
      '#matchBox2 .plays .playBox .play .tm-lv-metric:hover ~ ul {' +
      'display: none !important;' +
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
      if (refreshing) return;
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

      mountPanel(stats);
      renderStarterMetrics();
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
    metricModeIndex = loadMetricModeIndex();
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
