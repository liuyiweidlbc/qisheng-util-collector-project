// ==UserScript==
// @name         500彩票网全面广告清理
// @namespace    http://tampermonkey.net/
// @version      1.9.80
// @run-at       document-idle
// @description  删除500彩票网分析页面中的特定广告图片行、轮播图和悬浮广告；数据分析(shuju)交战历史赛果条+盘路条、欧赔实时(相对初盘升降)、亚盘初盘/实时终盘、快捷筛选、主客相同两态(同联=home2仅本联赛；全联=home2全联赛；优先.zhu)、相同赛事再点恢复全部、复制盘口同切换；联赛勾选后重填欧赔/备注/亚盘；点击勾选框旁文字等同点击勾选框；盘路堆叠段等高；近期战绩「同联赛」默认开启+左侧赛果序列；主客场块置顶、近期战绩表/图下移；近期战绩/主客场表增亚盘列；队名定宽省略悬停全称；目标队主场胜左边框/客场胜右边框；主客场表默认6场可展开10场（两侧同步）；任一点击六表同联赛同步；交战列表头语义定位兼容登录多列；隐藏原生平均欧指/亚盘/盘路/大小/盘口列；交战史主客队名加宽；战绩表队名超长省略、亚盘定宽三列对齐不溢出
// @author       YourName
// @match        https://odds.500.com/fenxi/*
// @match        https://www.odds.500.com/fenxi/*
// @include      /^https?:\/\/(www\.)?odds\.500\.com\/fenxi(\/|$|\?|#)/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 配置参数
    const config = {
        // 要删除的表格行图片
        tableRowImg: "https://tradeimg.500.com/upimages/wap/img/20250523175956500.png",
        // 要删除的轮播图图片
        bannerImg: "https://tradeimg.500.com/upimages/wap/img/20250523171952490.png",
        // 要删除的悬浮广告图片
        floatImg: "https://tradeimg.500.com/upimages/wap/img/20250430124427006.png",
        // 检查间隔(毫秒)
        checkInterval: 1000
    };

    const JZ_STYLE_ID = 'tm500-jz-quick-style-167';
    const JZ_WRAP_ID = 'tm500-jz-quick-filters';
    /** 快捷按钮相对表格右缘外推的间距（避免与表格可点区域重叠） */
    const JZ_LEFT_GAP = 16;
    /** 快捷按钮相对表格顶部的下移像素（略低于表头对齐线） */
    const JZ_TOP_OFFSET = 42;

    function isShujuFenxiPage() {
        return /\/fenxi\/shuju-\d+\.shtml$/i.test(location.pathname);
    }

    function debounce(fn, ms) {
        let t;
        return function() {
            clearTimeout(t);
            const args = arguments;
            const self = this;
            t = setTimeout(function() { fn.apply(self, args); }, ms);
        };
    }

    function injectJiaozhanQuickStyle() {
        const legacy = document.getElementById('tm500-jz-quick-style');
        const legacy166 = document.getElementById('tm500-jz-quick-style-166');
        if (legacy) legacy.remove();
        if (legacy166) legacy166.remove();
        if (document.getElementById(JZ_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = JZ_STYLE_ID;
        s.textContent =
            '#' + JZ_WRAP_ID + '{' +
            'position:fixed;' +
            'z-index:99999;' +
            'isolation:isolate;' +
            'transform:translateZ(0);' +
            'display:flex;' +
            'flex-direction:column;' +
            'gap:6px;' +
            'align-items:stretch;' +
            'min-width:82px;' +
            'pointer-events:auto;' +
            '}' +
            '#' + JZ_WRAP_ID + ' button{' +
            'position:relative;' +
            'z-index:1;' +
            'box-sizing:border-box;' +
            'width:100%;' +
            'min-width:0;' +
            'padding:6px 10px;' +
            'font-size:12px;' +
            'line-height:1.35;' +
            'cursor:pointer;' +
            'border:none;' +
            'border-radius:4px;' +
            'color:#fff;' +
            'pointer-events:auto;' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(0,0,0,.08);' +
            'transition:opacity .18s ease,box-shadow .18s ease,filter .18s ease,background .18s ease;' +
            'opacity:.72;' +
            'filter:saturate(.68) brightness(.98);' +
            'font-weight:400;' +
            '}' +
            '#' + JZ_WRAP_ID + ' button.tm500-jz-on{' +
            'opacity:1;' +
            'filter:saturate(1) brightness(1);' +
            'font-weight:600;' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="0"]{' +
            'color:#f0f0f0;' +
            'background:linear-gradient(180deg,#b5b5b5 0%,#9a9a9a 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="0"]:hover:not(.tm500-jz-on){' +
            'background:linear-gradient(180deg,#c0c0c0 0%,#a3a3a3 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="0"].tm500-jz-on{' +
            'color:#fff;' +
            'background:linear-gradient(180deg,#7a7a7a 0%,#555 100%);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -1px 0 rgba(0,0,0,.12),' +
            '0 3px 12px rgba(0,0,0,.22);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="0"].tm500-jz-on:hover{' +
            'background:linear-gradient(180deg,#868686 0%,#636363 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="1"]{' +
            'color:#3d6b4d;' +
            'background:linear-gradient(180deg,#cfe9d8 0%,#b5dcc4 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="1"]:hover:not(.tm500-jz-on){' +
            'background:linear-gradient(180deg,#d8efe2 0%,#c0e4ce 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="1"].tm500-jz-on{' +
            'color:#163a24;' +
            'background:linear-gradient(180deg,#8fd4a8 0%,#5cb87e 100%);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 0 rgba(0,0,0,.08),' +
            '0 4px 14px rgba(34,120,72,.32);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="1"].tm500-jz-on:hover{' +
            'background:linear-gradient(180deg,#9cddb3 0%,#68c48a 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="2"]{' +
            'color:#3a5a78;' +
            'background:linear-gradient(180deg,#d4e8f6 0%,#bddcf0 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="2"]:hover:not(.tm500-jz-on){' +
            'background:linear-gradient(180deg,#deeff9 0%,#cae4f5 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="2"].tm500-jz-on{' +
            'color:#142a3d;' +
            'background:linear-gradient(180deg,#9bc5eb 0%,#6ba6d8 100%);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 0 rgba(0,0,0,.08),' +
            '0 4px 14px rgba(48,110,168,.32);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="2"].tm500-jz-on:hover{' +
            'background:linear-gradient(180deg,#aacff0 0%,#7ab0df 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="copy"]{' +
            'color:#5c4a28;' +
            'background:linear-gradient(180deg,#fff3d4 0%,#ffe8a8 100%);' +
            'opacity:1;filter:saturate(1) brightness(1);font-weight:600;' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="copy"]:hover:not(:disabled){' +
            'background:linear-gradient(180deg,#fff8e6 0%,#ffefb8 100%);' +
            '}' +
            '#' + JZ_WRAP_ID + ' button[data-jz="copy"]:disabled{' +
            'opacity:.55;cursor:wait;' +
            '}';
        document.head.appendChild(s);
    }

    function syncJiaozhanQuickPosition() {
        const host = document.getElementById(JZ_WRAP_ID);
        const root = document.getElementById('team_jiaozhan');
        if (!host || !root) return;

        if (host.parentNode !== document.body) {
            document.body.appendChild(host);
        }

        const table = root.querySelector('.M_content table.pub_table') || root.querySelector('table.pub_table');

        if (table) {
            const tr = table.getBoundingClientRect();
            host.style.position = 'fixed';
            host.style.right = 'auto';
            host.style.left = Math.round(tr.right + JZ_LEFT_GAP) + 'px';
            host.style.top = Math.round(tr.top + JZ_TOP_OFFSET) + 'px';
            return;
        }

        const holder = root.closest('.odds_content');
        if (!holder) return;
        const mc = root.querySelector('.M_content');
        const ref = mc || root;
        const rr = ref.getBoundingClientRect();
        host.style.position = 'fixed';
        host.style.left = 'auto';
        host.style.right = '10px';
        host.style.top = Math.round(rr.top + JZ_TOP_OFFSET) + 'px';
    }

    function updateJiaozhanQuickButtonsActive() {
        const host = document.getElementById(JZ_WRAP_ID);
        if (!host) return;
        syncJiaozhanHomeSameButtonLabel();
        const homeEm = document.querySelector('#team_jiaozhan #home_jz');
        const raw = homeEm && homeEm.getAttribute('val');
        let cur = raw != null && raw !== '' ? String(raw) : '0';
        // 主客相同两态都高亮 data-jz=2
        if (isJiaozhanWantHomeSame()) cur = '2';
        host.querySelectorAll('button[data-jz]').forEach(function(btn) {
            const v = btn.getAttribute('data-jz');
            if (v === 'copy') return;
            if (v === cur) {
                btn.classList.add('tm500-jz-on');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.classList.remove('tm500-jz-on');
                btn.setAttribute('aria-pressed', 'false');
            }
        });
    }

    function syncJiaozhanQuickBar() {
        syncJiaozhanQuickPosition();
        updateJiaozhanQuickButtonsActive();
    }

    /**
     * 主客相同 = 先按「相同赛事」(home=1) 拉数，再客户端强制：同联赛 + 同主客。
     * 绝不回退原生 home=2（会跨联赛）；后续场次/勾选在此模式下也强制 home=1 请求。
     */
    function normalizeJiaozhanTeamName(s) {
        return String(s || '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\s+/g, '')
            .trim();
    }

    /** 简单编辑距离（队名别字：土尔库/图尔库） */
    function jiaozhanLevenshtein(a, b) {
        const s = String(a || '');
        const t = String(b || '');
        const n = s.length;
        const m = t.length;
        if (n === 0) return m;
        if (m === 0) return n;
        const row = new Array(m + 1);
        let i;
        let j;
        for (j = 0; j <= m; j++) row[j] = j;
        for (i = 1; i <= n; i++) {
            let prev = row[0];
            row[0] = i;
            for (j = 1; j <= m; j++) {
                const tmp = row[j];
                const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
                row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
                prev = tmp;
            }
        }
        return row[m];
    }

    /** 队名宽松相等：全等 / 拉丁前缀相同+中文近形 / 短编辑距离 */
    function jiaozhanTeamNamesLooselyEqual(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        const la = (a.match(/^[A-Za-z0-9.+_-]+/) || [''])[0];
        const lb = (b.match(/^[A-Za-z0-9.+_-]+/) || [''])[0];
        if (la && lb && la.toUpperCase() === lb.toUpperCase() && la.length >= 2) {
            const ca = a.slice(la.length);
            const cb = b.slice(lb.length);
            if (!ca || !cb) return true;
            if (jiaozhanLevenshtein(ca, cb) <= 1) return true;
        }
        const maxLen = Math.max(a.length, b.length);
        if (maxLen <= 0) return false;
        const dist = jiaozhanLevenshtein(a, b);
        if (maxLen <= 4) return dist <= 1;
        return dist <= 2;
    }

    function getJiaozhanHomeLiVal(li) {
        if (!li) return '';
        if (typeof li.getAttribute === 'function') {
            const v = li.getAttribute('val');
            if (v != null && v !== '') return String(v);
        }
        if (window.jQuery && li.jquery != null) {
            const v = window.jQuery(li).attr('val');
            if (v != null && v !== '') return String(v);
        }
        return '';
    }

    function findJiaozhanHomeFilterLi(val) {
        const homeEm = document.querySelector('#team_jiaozhan #home_jz') || document.getElementById('home_jz');
        if (!homeEm) return null;
        const seltBox = homeEm.closest('.selt_box');
        if (!seltBox) return null;
        const ul = seltBox.querySelector('ul.selt_list');
        if (!ul) return null;
        return ul.querySelector('li[val="' + val + '"]');
    }

    /**
     * 主客相同模式：
     * ''       未开启
     * 'league' 同联赛 + 同主客（相同赛事请求 + 行过滤）
     * 'all'    全部联赛 + 同主客（原生 home=2 + 仅主客行过滤）
     * 按钮两态：同联主客 ↔ 全联主客（不切全部赛事；退出请点全部赛事/相同赛事）
     */
    function getJiaozhanHomeSameMode() {
        return document.documentElement.dataset.tm500JzHomeSameMode || '';
    }

    function setJiaozhanHomeSameMode(mode) {
        const m = mode === 'league' || mode === 'all' ? mode : '';
        document.documentElement.dataset.tm500JzHomeSameMode = m;
        // 兼容旧标记
        document.documentElement.dataset.tm500JzWantHomeSame = m === 'league' ? '1' : '';
    }

    function isJiaozhanWantHomeSame() {
        const m = getJiaozhanHomeSameMode();
        return m === 'league' || m === 'all';
    }

    function isJiaozhanHomeSameLeagueMode() {
        return getJiaozhanHomeSameMode() === 'league';
    }

    function isJiaozhanHomeSameAllMode() {
        return getJiaozhanHomeSameMode() === 'all';
    }

    function syncJiaozhanHomeSameButtonLabel() {
        const btn = document.querySelector('#' + JZ_WRAP_ID + ' button[data-jz="2"]');
        if (!btn) return;
        const mode = getJiaozhanHomeSameMode();
        if (mode === 'league') {
            btn.textContent = '同联主客';
            btn.setAttribute('title', '同联赛+同主客；再点切换为全部联赛主客');
        } else if (mode === 'all') {
            btn.textContent = '全联主客';
            btn.setAttribute('title', '全部联赛+同主客；再点切换为同联赛主客');
        } else {
            btn.textContent = '主客相同';
            btn.setAttribute('title', '点按在「同联主客 / 全联主客」间切换');
        }
    }

    function injectJiaozhanHomeSameFilterStyle() {
        const id = 'tm500-jz-ha-filter-style';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent =
            '#team_jiaozhan tr.tm500-jz-ha-hide{display:none!important;}';
        document.head.appendChild(s);
    }

    function clearJiaozhanHomeSameRowFilter() {
        const root = document.getElementById('team_jiaozhan');
        if (!root) return;
        root.querySelectorAll('tr.tm500-jz-ha-hide').forEach(function(tr) {
            tr.classList.remove('tm500-jz-ha-hide');
        });
    }

    function restoreJiaozhanAllLeagueCheckboxes() {
        const boxes = document.querySelectorAll('input.jz');
        let i;
        for (i = 0; i < boxes.length; i++) {
            const cb = boxes[i];
            cb.checked = true;
            if (window.jQuery) {
                const $cb = window.jQuery(cb);
                $cb.attr('checked', 'checked');
                if (typeof $cb.prop === 'function') $cb.prop('checked', true);
            } else {
                cb.setAttribute('checked', 'checked');
            }
        }
    }

    /** 同联主客：只勾本场 matchid 联赛（配合原生 home=2，避免先相同赛事再滤主客被场次上限吃掉） */
    function applyJiaozhanSameLeagueCheckboxesOnly() {
        const midEl = document.getElementById('matchid');
        const mid = midEl ? String(midEl.value || midEl.getAttribute('value') || '') : '';
        if (!mid) return false;
        const boxes = document.querySelectorAll('input.jz');
        if (!boxes.length) return false;
        let hit = false;
        let i;
        for (i = 0; i < boxes.length; i++) {
            if (String(boxes[i].value) === mid) {
                hit = true;
                break;
            }
        }
        if (!hit) return false;
        for (i = 0; i < boxes.length; i++) {
            const cb = boxes[i];
            const on = String(cb.value) === mid;
            cb.checked = on;
            if (window.jQuery) {
                const $cb = window.jQuery(cb);
                if (on) $cb.attr('checked', 'checked');
                else $cb.removeAttr('checked');
                if (typeof $cb.prop === 'function') $cb.prop('checked', on);
            } else if (on) {
                cb.setAttribute('checked', 'checked');
            } else {
                cb.removeAttribute('checked');
            }
        }
        return true;
    }

    /** home=2 请求时强制 match 仅本场联赛（防 jQuery attr(checked) 仍全选） */
    function forceJiaozhanPostMatchSameLeague(v) {
        const midEl = document.getElementById('matchid');
        const mid = midEl ? String(midEl.value || midEl.getAttribute('value') || '') : '';
        if (!mid || !v || typeof v !== 'object') return;
        if (!v.match || typeof v.match !== 'object') v.match = {};
        const match = v.match;
        let k;
        for (k in match) {
            if (!Object.prototype.hasOwnProperty.call(match, k)) continue;
            match[k] = String(k) === mid ? 1 : -1;
        }
        match[mid] = 1;
    }

    function withJiaozhanLeagueOnlyPostMatchPatch(enable, fn) {
        if (!enable || !window.jQuery || typeof window.jQuery.post !== 'function') {
            return fn();
        }
        const $ = window.jQuery;
        const saved = $.post;
        let restored = false;
        const restore = function() {
            if (!restored) {
                $.post = saved;
                restored = true;
            }
        };
        $.post = function(url, v, success, dataType) {
            if (v && typeof v === 'object' && String(v.home) === '2') {
                forceJiaozhanPostMatchSameLeague(v);
            }
            restore();
            return saved.call(this, url, v, success, dataType);
        };
        try {
            return fn();
        } finally {
            restore();
        }
    }

    function setJiaozhanHomeJzUiAsHomeSame() {
        const homeEm = document.getElementById('home_jz');
        if (!homeEm) return;
        homeEm.setAttribute('val', '2');
        const li2 = findJiaozhanHomeFilterLi('2');
        const label = li2 ? (li2.textContent || '主客相同') : '主客相同';
        homeEm.textContent = label;
        if (window.jQuery) {
            window.jQuery(homeEm).attr('val', '2').text(label);
        }
    }

    /** 本场联赛简称：matchid 对应 .jz 勾选旁文字，其次本场行首列 */
    function getJiaozhanFixtureLeagueName() {
        const midEl = document.getElementById('matchid');
        const mid = midEl ? String(midEl.value || midEl.getAttribute('value') || '') : '';
        if (mid) {
            const boxes = document.querySelectorAll('input.jz');
            let i;
            for (i = 0; i < boxes.length; i++) {
                if (String(boxes[i].value) !== mid) continue;
                const wrap = boxes[i].closest('span.mar_right15') || boxes[i].parentElement;
                if (!wrap) continue;
                let t = '';
                let j;
                for (j = 0; j < wrap.childNodes.length; j++) {
                    const n = wrap.childNodes[j];
                    if (n.nodeType === 3) t += n.textContent || '';
                }
                t = normalizeJiaozhanTeamName(t);
                if (t) return t;
            }
        }
        const bmTd = document.querySelector('#team_jiaozhan tr.bmatch td');
        if (bmTd) {
            const t = normalizeJiaozhanTeamName(bmTd.textContent);
            if (t) return t;
        }
        return null;
    }

    /** 交战表里出现过的队名（与历史行同一套写法，优先于页头） */
    function collectJiaozhanTableTeamNames() {
        const root = document.getElementById('team_jiaozhan');
        if (!root) return [];
        const seen = {};
        const out = [];
        root.querySelectorAll('table.pub_table tr').forEach(function(tr) {
            const pair = getJiaozhanRowHomeAwayNames(tr);
            if (!pair) return;
            [pair.home, pair.away].forEach(function(name) {
                if (!name || seen[name]) return;
                seen[name] = 1;
                out.push(name);
            });
        });
        return out;
    }

    function resolveJiaozhanNameAgainstTable(name, tableNames) {
        if (!name) return name;
        if (!tableNames || !tableNames.length) return name;
        let i;
        for (i = 0; i < tableNames.length; i++) {
            if (tableNames[i] === name) return tableNames[i];
        }
        for (i = 0; i < tableNames.length; i++) {
            if (jiaozhanTeamNamesLooselyEqual(name, tableNames[i])) return tableNames[i];
        }
        return name;
    }

    /** 本场主客队名：优先交战表 bmatch/表内写法，再页头/标题，并映射到表内队名 */
    function getJiaozhanFixtureHomeAwayNames() {
        const tableNames = collectJiaozhanTableTeamNames();
        let home = '';
        let away = '';

        const bmatch = document.querySelector('#team_jiaozhan tr.bmatch');
        if (bmatch) {
            const bp = getJiaozhanRowHomeAwayNames(bmatch);
            if (bp && bp.home && bp.away) {
                home = bp.home;
                away = bp.away;
            }
        }

        if (!home || !away) {
            const nodes = document.querySelectorAll('.odds_hd_cont .team_name');
            if (nodes.length >= 2) {
                function pick(el) {
                    let t = '';
                    let i;
                    for (i = 0; i < el.childNodes.length; i++) {
                        const n = el.childNodes[i];
                        if (n.nodeType === 3) t += n.textContent || '';
                    }
                    if (!t) t = el.textContent || '';
                    return normalizeJiaozhanTeamName(t);
                }
                home = home || pick(nodes[0]);
                away = away || pick(nodes[1]);
            }
        }

        if (!home || !away) {
            const h4 = document.querySelector('#team_jiaozhan .M_title h4');
            const title = (h4 && h4.textContent) || document.title || '';
            const m = String(title).match(/^\s*(.+?)\s*VS\s*(.+?)(?:\s|（|\(|$)/i);
            if (m) {
                home = home || normalizeJiaozhanTeamName(m[1]);
                away = away || normalizeJiaozhanTeamName(m[2]);
            }
        }

        if (!home || !away) return null;
        return {
            home: resolveJiaozhanNameAgainstTable(home, tableNames),
            away: resolveJiaozhanNameAgainstTable(away, tableNames)
        };
    }

    function getJiaozhanRowHomeAwayNames(tr) {
        if (!tr) return null;
        const dz = tr.querySelector('td.dz') || tr.querySelector('.dz');
        if (!dz) return null;
        const left = dz.querySelector('.dz-l');
        const right = dz.querySelector('.dz-r');
        if (!left || !right) return null;
        return {
            home: normalizeJiaozhanTeamName(left.textContent),
            away: normalizeJiaozhanTeamName(right.textContent)
        };
    }

    function getJiaozhanRowLeagueName(tr) {
        if (!tr) return '';
        const td = tr.querySelector('td');
        return td ? normalizeJiaozhanTeamName(td.textContent) : '';
    }

    /**
     * 本场主客球队 ID（页头 odds_hd：liansai.500.com/team/{id}/）。
     * 交战历史行本身没有球队 ID，只有队名；站点用 .zhu 标记本场主队所在侧。
     */
    function getJiaozhanFixtureTeamIds() {
        const root = document.querySelector('.odds_hd_cont');
        if (!root) return null;
        const ids = [];
        const seen = {};
        root.querySelectorAll('a[href*="/team/"]').forEach(function(a) {
            const m = String(a.getAttribute('href') || '').match(/\/team\/(\d+)\/?/);
            if (!m) return;
            const id = m[1];
            if (seen[id]) return;
            seen[id] = 1;
            ids.push(id);
        });
        if (ids.length < 2) return null;
        return { homeId: ids[0], awayId: ids[1] };
    }

    /**
     * 主客是否与本场相同。
     * 优先用站点 .zhu（本场主队在历史对阵中的位置：在左边=主客相同）；
     * 无 .zhu 时回退队名宽松匹配。
     */
    function jiaozhanRowMatchesFixtureHomeAway(tr, fix) {
        if (!tr) return false;
        const left = tr.querySelector('.dz-l');
        const right = tr.querySelector('.dz-r');
        if (left && right) {
            const zhuL = left.classList.contains('zhu');
            const zhuR = right.classList.contains('zhu');
            if (zhuL || zhuR) return zhuL && !zhuR;
        }
        if (!fix || !fix.home || !fix.away) {
            fix = fix || getJiaozhanFixtureHomeAwayNames();
        }
        if (!fix || !fix.home || !fix.away) return false;
        const pair = getJiaozhanRowHomeAwayNames(tr);
        if (!pair || !pair.home || !pair.away) return false;
        return jiaozhanTeamNamesLooselyEqual(pair.home, fix.home) &&
            jiaozhanTeamNamesLooselyEqual(pair.away, fix.away);
    }

    /**
     * 在表上强制：同联赛（本场联赛名）+ 同主客位。
     * 即使请求仍带回杯赛/友谊赛行，也会被藏掉。
     */
    function applyJiaozhanHomeSameRowFilters() {
        injectJiaozhanHomeSameFilterStyle();
        const root = document.getElementById('team_jiaozhan');
        if (!root) return;
        const league = getJiaozhanFixtureLeagueName();
        const fix = getJiaozhanFixtureHomeAwayNames();
        const table = root.querySelector('table.pub_table');
        if (!table) return;
        const rows = table.querySelectorAll('tr');
        let i;
        for (i = 0; i < rows.length; i++) {
            const tr = rows[i];
            if (!tr.querySelector('td') || tr.querySelector('th')) continue;
            if (tr.classList.contains('bmatch')) {
                tr.classList.remove('tm500-jz-ha-hide');
                continue;
            }
            let ok = true;
            if (league) {
                const rowLeague = getJiaozhanRowLeagueName(tr);
                if (rowLeague !== league) ok = false;
            }
            if (ok && !jiaozhanRowMatchesFixtureHomeAway(tr, fix)) ok = false;
            if (ok) tr.classList.remove('tm500-jz-ha-hide');
            else tr.classList.add('tm500-jz-ha-hide');
        }
    }

    /** 相同赛事：只按本场联赛名藏行（含主客对调场次） */
    function applyJiaozhanSameLeagueRowFilterOnly() {
        injectJiaozhanHomeSameFilterStyle();
        const root = document.getElementById('team_jiaozhan');
        if (!root) return;
        const league = getJiaozhanFixtureLeagueName();
        const table = root.querySelector('table.pub_table');
        if (!table) return;
        if (!league) {
            clearJiaozhanHomeSameRowFilter();
            return;
        }
        const rows = table.querySelectorAll('tr');
        let i;
        for (i = 0; i < rows.length; i++) {
            const tr = rows[i];
            if (!tr.querySelector('td') || tr.querySelector('th')) continue;
            if (tr.classList.contains('bmatch')) {
                tr.classList.remove('tm500-jz-ha-hide');
                continue;
            }
            if (getJiaozhanRowLeagueName(tr) === league) tr.classList.remove('tm500-jz-ha-hide');
            else tr.classList.add('tm500-jz-ha-hide');
        }
    }

    /** 仅同主客位（不限联赛） */
    function applyJiaozhanHomeAwayOnlyRowFilter() {
        injectJiaozhanHomeSameFilterStyle();
        const root = document.getElementById('team_jiaozhan');
        if (!root) return;
        const fix = getJiaozhanFixtureHomeAwayNames();
        const table = root.querySelector('table.pub_table');
        if (!table) return;
        if (!fix || !fix.home || !fix.away) {
            clearJiaozhanHomeSameRowFilter();
            return;
        }
        const rows = table.querySelectorAll('tr');
        let i;
        for (i = 0; i < rows.length; i++) {
            const tr = rows[i];
            if (!tr.querySelector('td') || tr.querySelector('th')) continue;
            if (tr.classList.contains('bmatch')) {
                tr.classList.remove('tm500-jz-ha-hide');
                continue;
            }
            if (jiaozhanRowMatchesFixtureHomeAway(tr, fix)) {
                tr.classList.remove('tm500-jz-ha-hide');
            } else {
                tr.classList.add('tm500-jz-ha-hide');
            }
        }
    }

    /**
     * 表刷新后统一套用快捷筛选的行隐藏：
     * - 同联主客：同联赛 + 同主客
     * - 全联主客：仅同主客
     * - 相同赛事(home=1)：同联赛
     * - 全部赛事(home=0)：清隐藏
     * - home 仍为 2 的过渡态：不 clear
     */
    function finalizeJiaozhanFilterDom() {
        const mode = getJiaozhanHomeSameMode();
        if (mode === 'league') {
            setJiaozhanHomeJzUiAsHomeSame();
            applyJiaozhanHomeSameRowFilters();
            syncJiaozhanHomeSameButtonLabel();
            updateJiaozhanQuickButtonsActive();
            return;
        }
        if (mode === 'all') {
            setJiaozhanHomeJzUiAsHomeSame();
            applyJiaozhanHomeAwayOnlyRowFilter();
            syncJiaozhanHomeSameButtonLabel();
            updateJiaozhanQuickButtonsActive();
            return;
        }
        syncJiaozhanHomeSameButtonLabel();
        const homeEm = document.getElementById('home_jz');
        const homeVal = homeEm ? String(homeEm.getAttribute('val') || '0') : '0';
        if (homeVal === '1') {
            applyJiaozhanSameLeagueRowFilterOnly();
            updateJiaozhanQuickButtonsActive();
            return;
        }
        if (homeVal === '2') {
            // 过渡态：保持隐藏，勿 clear
            return;
        }
        clearJiaozhanHomeSameRowFilter();
        updateJiaozhanQuickButtonsActive();
    }

    /** @deprecated 兼容旧调用名 */
    function finalizeJiaozhanHomeSameAfterSameCompetition() {
        finalizeJiaozhanFilterDom();
    }

    /** 同联主客模式下发请求前，把 home 临时改回 1，让站点走相同赛事 match 逻辑 */
    function forceJiaozhanHomeAttrForSameCompetitionRequest() {
        const homeEm = document.getElementById('home_jz');
        if (!homeEm) return;
        homeEm.setAttribute('val', '1');
        if (window.jQuery) window.jQuery(homeEm).attr('val', '1');
    }

    /** 构造/取得「相同赛事」li，找不到时造一个，避免回退原生主客相同 */
    function resolveJiaozhanSameCompetitionLi() {
        const found = findJiaozhanHomeFilterLi('1');
        if (found) return found;
        const fake = document.createElement('li');
        fake.setAttribute('val', '1');
        fake.textContent = '相同赛事';
        return fake;
    }

    function triggerJiaozhanFilter(val) {
        const homeEm = document.querySelector('#team_jiaozhan #home_jz');
        if (!homeEm) return;
        const seltBox = homeEm.closest('.selt_box');
        if (!seltBox) return;
        const ul = seltBox.querySelector('ul.selt_list');
        if (!ul) return;
        let target = String(val);
        const cur = String(homeEm.getAttribute('val') || '0');
        const mode = getJiaozhanHomeSameMode();

        // 相同赛事再点 → 全部赛事
        if (target === '1' && cur === '1' && !mode) target = '0';

        // 主客相同两态循环：同联主客 ↔ 全联主客（不切全部赛事）
        if (target === '2') {
            if (mode === 'league') {
                setJiaozhanHomeSameMode('all');
            } else if (mode === 'all') {
                setJiaozhanHomeSameMode('league');
            } else {
                setJiaozhanHomeSameMode('league');
            }
            target = '2';
        }

        const li = ul.querySelector('li[val="' + target + '"]');
        if (!li || typeof window.getJiaozhan !== 'function') return;
        window.getJiaozhan(li, 'home_jz');
        syncJiaozhanHomeSameButtonLabel();
        updateJiaozhanQuickButtonsActive();
        scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav();
    }

    function tryAttachJiaozhanQuickFilters() {
        if (document.getElementById(JZ_WRAP_ID)) {
            syncJiaozhanQuickBar();
            return true;
        }
        const root = document.getElementById('team_jiaozhan');
        if (!root) return false;
        const homeEm = root.querySelector('#home_jz');
        if (!homeEm) return false;
        const selt = root.querySelector('#jiaozhan .selt');
        if (!selt || !homeEm.closest('.selt_box')) return false;
        if (typeof window.getJiaozhan !== 'function') return false;

        const holder = root.closest('.odds_content');
        if (!holder) return false;

        injectJiaozhanQuickStyle();

        const wrap = document.createElement('div');
        wrap.id = JZ_WRAP_ID;

        function bindBtn(val, label) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.setAttribute('data-jz', val);
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                triggerJiaozhanFilter(val);
            });
            wrap.appendChild(btn);
        }

        bindBtn('0', '全部赛事');
        bindBtn('1', '相同赛事');
        bindBtn('2', '主客相同');
        const sameCompBtn = wrap.querySelector('button[data-jz="1"]');
        if (sameCompBtn) {
            sameCompBtn.setAttribute('title', '只看本场联赛；再点一次恢复全部赛事');
        }
        const homeSameBtn = wrap.querySelector('button[data-jz="2"]');
        if (homeSameBtn) {
            homeSameBtn.setAttribute('title', '点按在「同联主客 / 全联主客」间切换');
        }

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = '复制盘口';
        copyBtn.setAttribute('data-jz', 'copy');
        copyBtn.setAttribute('title', '与主客相同同步切换（同联主客↔全联主客）后复制：联赛|日期|比分|初盘|终盘');
        copyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            triggerCopyJiaozhanHandicap(copyBtn);
        });
        wrap.appendChild(copyBtn);

        document.body.appendChild(wrap);

        const syncDebounced = debounce(syncJiaozhanQuickBar, 50);
        syncJiaozhanQuickBar();
        requestAnimationFrame(function() {
            syncJiaozhanQuickBar();
            setTimeout(syncJiaozhanQuickBar, 280);
        });

        const mo = new MutationObserver(syncDebounced);
        mo.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['val']
        });
        window.addEventListener('resize', syncDebounced);
        window.addEventListener('scroll', syncDebounced, { passive: true });

        requestAnimationFrame(function() {
            setTimeout(function() {
                triggerJiaozhanFilter('1');
            }, 150);
        });

        return true;
    }

    function startJiaozhanQuickFiltersPolling() {
        let tries = 0;
        const maxTries = 80;
        const t = setInterval(function() {
            tries++;
            if (tryAttachJiaozhanQuickFilters() || tries >= maxTries) clearInterval(t);
        }, 250);
    }

    const JZ_SG_STRIP_HOST_ID = 'tm500-jz-saiguo-strip-host';
    const JZ_SG_STRIP_STYLE_ID = 'tm500-jz-saiguo-strip-style-186';

    function injectJiaozhanSaiguoStripStyle() {
        const legacy174 = document.getElementById('tm500-jz-saiguo-strip-style-174');
        if (legacy174) legacy174.remove();
        const legacy175 = document.getElementById('tm500-jz-saiguo-strip-style-175');
        if (legacy175) legacy175.remove();
        const legacy176 = document.getElementById('tm500-jz-saiguo-strip-style-176');
        if (legacy176) legacy176.remove();
        const legacy177 = document.getElementById('tm500-jz-saiguo-strip-style-177');
        if (legacy177) legacy177.remove();
        const legacy178 = document.getElementById('tm500-jz-saiguo-strip-style-178');
        if (legacy178) legacy178.remove();
        const legacy179 = document.getElementById('tm500-jz-saiguo-strip-style-179');
        if (legacy179) legacy179.remove();
        const legacy180 = document.getElementById('tm500-jz-saiguo-strip-style-180');
        if (legacy180) legacy180.remove();
        const legacy181 = document.getElementById('tm500-jz-saiguo-strip-style-181');
        if (legacy181) legacy181.remove();
        const legacy182 = document.getElementById('tm500-jz-saiguo-strip-style-182');
        if (legacy182) legacy182.remove();
        const legacy183 = document.getElementById('tm500-jz-saiguo-strip-style-183');
        if (legacy183) legacy183.remove();
        const legacy184 = document.getElementById('tm500-jz-saiguo-strip-style-184');
        if (legacy184) legacy184.remove();
        const legacy185 = document.getElementById('tm500-jz-saiguo-strip-style-185');
        if (legacy185) legacy185.remove();
        if (document.getElementById(JZ_SG_STRIP_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = JZ_SG_STRIP_STYLE_ID;
        s.textContent =
            '#' + JZ_SG_STRIP_HOST_ID + '{' +
            'display:flex;justify-content:center;align-items:center;' +
            'width:100%;box-sizing:border-box;margin:4px 0 12px;padding:0;' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-jz-charts-wrap{' +
            'display:inline-flex;align-items:center;justify-content:center;' +
            'flex-wrap:wrap;gap:18px;' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-saiguo-strip{' +
            'display:inline-flex;align-items:center;flex-wrap:nowrap;gap:0;' +
            'box-sizing:border-box;height:32px;padding:4px 6px;' +
            'background:linear-gradient(180deg,#f6f6f6 0%,#e8e8e8 100%);' +
            'border:1px solid #cfcfcf;border-radius:8px;' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 1px 2px rgba(0,0,0,.06);' +
            'vertical-align:middle;overflow:hidden;' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-sg-cell{' +
            'box-sizing:border-box;width:22px;height:22px;min-width:22px;' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:11px;font-weight:700;line-height:1;' +
            'color:#fff;font-family:Microsoft YaHei,SimHei,sans-serif;' +
            'flex-shrink:0;border-radius:0;' +
            'text-shadow:0 1px 1px rgba(0,0,0,.22);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.18);' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-sg-empty{' +
            'background:linear-gradient(180deg,#ececec,#dedede);' +
            'color:transparent;' +
            'box-shadow:inset 0 1px 2px rgba(0,0,0,.06);' +
            'border:none;border-left:1px dashed rgba(0,0,0,.12);' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-sg-empty:first-child{border-left:none;}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-sg-win{' +
            'background:#f5c6cb;color:#333;text-shadow:none;' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-sg-draw{' +
            'background:#e2e3e5;color:#333;text-shadow:none;' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-sg-loss{' +
            'background:#d4edda;color:#333;text-shadow:none;' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-panlu-stack{' +
            'display:flex;flex-direction:column;justify-content:center;' +
            'box-sizing:border-box;height:32px;padding:4px 6px;' +
            'background:linear-gradient(180deg,#f6f6f6 0%,#e8e8e8 100%);' +
            'border:1px solid #cfcfcf;border-radius:8px;' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 1px 2px rgba(0,0,0,.06);' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-panlu-bar{' +
            'display:flex;flex-direction:row;align-items:stretch;' +
            'width:140px;height:22px;border-radius:4px;overflow:hidden;' +
            'background:#dadada;' +
            'box-shadow:inset 0 1px 2px rgba(0,0,0,.08);' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-pl-seg{' +
            'min-width:0;height:100%;min-height:100%;box-sizing:border-box;' +
            'display:flex;align-items:center;justify-content:center;' +
            'align-self:stretch;' +
            'overflow:hidden;' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-pl-num{' +
            'display:flex;align-items:center;justify-content:center;' +
            'height:100%;width:100%;margin:0;padding:0;' +
            'font-size:11px;font-weight:700;line-height:1;' +
            'font-family:Microsoft YaHei,SimHei,Arial,sans-serif;' +
            'color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.35);' +
            'white-space:nowrap;pointer-events:none;' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-pl-zou .tm500-jz-pl-num{' +
            'color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.45);' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-pl-empty{' +
            'flex:1 1 0;background:linear-gradient(180deg,#e8e8e8,#dcdcdc);' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-pl-ying{' +
            'background:linear-gradient(180deg,#f87870 0%,#ef5b51 50%,#e04a42 100%);' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-pl-zou{' +
            'background:linear-gradient(180deg,#c4c4c4 0%,#9a9a9a 50%,#7a7a7a 100%);' +
            '}' +
            '#' + JZ_SG_STRIP_HOST_ID + ' .tm500-jz-pl-shu{' +
            'background:linear-gradient(180deg,#7eb8ea 0%,#69a7e4 50%,#5294d6 100%);' +
            '}' +
            '#team_zhanji_0 form .M_content_t .tm500-jz-saiguo-strip.tm500-jz-zhanji-sg-strip,' +
            '#team_zhanji_1 form .M_content_t .tm500-jz-saiguo-strip.tm500-jz-zhanji-sg-strip,' +
            '#team_zhanji1_0 form .M_content_t .tm500-jz-saiguo-strip.tm500-jz-zhanji-sg-strip,' +
            '#team_zhanji1_1 form .M_content_t .tm500-jz-saiguo-strip.tm500-jz-zhanji-sg-strip,' +
            '#team_zhanji2_0 form .M_content_t .tm500-jz-saiguo-strip.tm500-jz-zhanji-sg-strip,' +
            '#team_zhanji2_1 form .M_content_t .tm500-jz-saiguo-strip.tm500-jz-zhanji-sg-strip{' +
            'display:inline-flex;align-items:center;flex-wrap:nowrap;gap:0;' +
            'box-sizing:border-box;height:26px;padding:2px 4px;' +
            'background:linear-gradient(180deg,#f6f6f6 0%,#e8e8e8 100%);' +
            'border:1px solid #cfcfcf;border-radius:6px;' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.85),0 1px 2px rgba(0,0,0,.06);' +
            'vertical-align:middle;overflow:hidden;' +
            '}' +
            '#team_zhanji_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-cell,' +
            '#team_zhanji_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-cell,' +
            '#team_zhanji1_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-cell,' +
            '#team_zhanji1_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-cell,' +
            '#team_zhanji2_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-cell,' +
            '#team_zhanji2_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-cell{' +
            'box-sizing:border-box;width:18px;height:18px;min-width:18px;' +
            'display:flex;align-items:center;justify-content:center;' +
            'font-size:10px;font-weight:700;line-height:1;' +
            'color:#fff;font-family:Microsoft YaHei,SimHei,sans-serif;' +
            'flex-shrink:0;border-radius:0;' +
            'text-shadow:0 1px 1px rgba(0,0,0,.22);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.18);' +
            '}' +
            '#team_zhanji_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-empty,' +
            '#team_zhanji_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-empty,' +
            '#team_zhanji1_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-empty,' +
            '#team_zhanji1_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-empty,' +
            '#team_zhanji2_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-empty,' +
            '#team_zhanji2_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-empty{' +
            'background:linear-gradient(180deg,#ececec,#dedede);' +
            'color:transparent;' +
            'box-shadow:inset 0 1px 2px rgba(0,0,0,.06);' +
            'border:none;border-left:1px dashed rgba(0,0,0,.12);' +
            '}' +
            '.tm500-jz-zhanji-sg-strip .tm500-jz-sg-empty:first-child{border-left:none;}' +
            '#team_zhanji_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-win,' +
            '#team_zhanji_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-win,' +
            '#team_zhanji1_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-win,' +
            '#team_zhanji1_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-win,' +
            '#team_zhanji2_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-win,' +
            '#team_zhanji2_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-win{' +
            'background:#f5c6cb;color:#333;text-shadow:none;' +
            '}' +
            '#team_zhanji_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-draw,' +
            '#team_zhanji_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-draw,' +
            '#team_zhanji1_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-draw,' +
            '#team_zhanji1_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-draw,' +
            '#team_zhanji2_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-draw,' +
            '#team_zhanji2_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-draw{' +
            'background:#e2e3e5;color:#333;text-shadow:none;' +
            '}' +
            '#team_zhanji_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-loss,' +
            '#team_zhanji_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-loss,' +
            '#team_zhanji1_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-loss,' +
            '#team_zhanji1_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-loss,' +
            '#team_zhanji2_0 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-loss,' +
            '#team_zhanji2_1 form .M_content_t .tm500-jz-zhanji-sg-strip .tm500-jz-sg-loss{' +
            'background:#d4edda;color:#333;text-shadow:none;' +
            '}';
        document.head.appendChild(s);
    }

    function collectJiaozhanSaiguoSeries(root) {
        const table = root.querySelector('table.pub_table');
        if (!table) return [];
        const cols = getJiaozhanYapanBeizhuIndices(table);
        const sgIdx = cols.saiguo >= 0 ? cols.saiguo : 4;
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        const raw = [];
        rows.forEach(function(tr) {
            if (tr.classList.contains('bmatch')) return;
            if (tr.classList.contains('tm500-jz-ha-hide')) return;
            const st = tr.getAttribute('style') || '';
            if (/display\s*:\s*none/i.test(st)) return;
            const tds = tr.querySelectorAll('td');
            if (tds.length <= sgIdx) return;
            const sg = (tds[sgIdx].textContent || '').replace(/\s/g, '');
            if (sg === '-' || sg === '') return;
            if (sg !== '胜' && sg !== '平' && sg !== '负') return;
            raw.push(sg);
        });
        return raw.slice().reverse();
    }

    function collectJiaozhanPanluCounts(root) {
        const c = { ying: 0, shu: 0, zou: 0 };
        const table = root.querySelector('table.pub_table');
        if (!table) return c;
        const cols = getJiaozhanYapanBeizhuIndices(table);
        const sgIdx = cols.saiguo >= 0 ? cols.saiguo : 4;
        const plIdx = cols.panlu >= 0 ? cols.panlu : 7;
        const need = Math.max(sgIdx, plIdx);
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            if (tr.classList.contains('bmatch')) return;
            if (tr.classList.contains('tm500-jz-ha-hide')) return;
            const st = tr.getAttribute('style') || '';
            if (/display\s*:\s*none/i.test(st)) return;
            const tds = tr.querySelectorAll('td');
            if (tds.length <= need) return;
            const sg = (tds[sgIdx].textContent || '').replace(/\s/g, '');
            if (sg === '-' || sg === '') return;
            if (sg !== '胜' && sg !== '平' && sg !== '负') return;
            const pl = (tds[plIdx].textContent || '').replace(/\s/g, '');
            if (pl === '赢') c.ying++;
            else if (pl === '输') c.shu++;
            else if (pl === '走') c.zou++;
        });
        return c;
    }

    function renderJiaozhanPanluStack(panluStackEl, counts) {
        panluStackEl.textContent = '';
        const bar = document.createElement('div');
        bar.className = 'tm500-jz-panlu-bar';
        const total = counts.ying + counts.shu + counts.zou;
        if (total < 1) {
            const seg = document.createElement('div');
            seg.className = 'tm500-jz-pl-seg tm500-jz-pl-empty';
            seg.style.flex = '1 1 0';
            bar.appendChild(seg);
            panluStackEl.setAttribute('aria-label', '盘路构成，暂无数据');
        } else {
            const parts = [
                { n: counts.ying, cls: 'tm500-jz-pl-ying', lab: '赢' },
                { n: counts.zou, cls: 'tm500-jz-pl-zou', lab: '走' },
                { n: counts.shu, cls: 'tm500-jz-pl-shu', lab: '输' }
            ];
            const tip = '盘路 赢' + counts.ying + ' 走' + counts.zou + ' 输' + counts.shu;
            panluStackEl.setAttribute('aria-label', tip);
            parts.forEach(function(p) {
                if (p.n < 1) return;
                const seg = document.createElement('div');
                seg.className = 'tm500-jz-pl-seg ' + p.cls;
                seg.style.flex = p.n + ' 1 0%';
                const ratio = p.n / total;
                if (ratio < 0.2) seg.style.minWidth = '16px';
                seg.title = p.lab + ' ' + p.n + '/' + total;
                const num = document.createElement('span');
                num.className = 'tm500-jz-pl-num';
                num.textContent = String(p.n);
                if (ratio < 0.22) num.style.fontSize = '10px';
                seg.appendChild(num);
                bar.appendChild(seg);
            });
        }
        panluStackEl.appendChild(bar);
    }

    function normalizeJiaozhanChartsHost(host) {
        const cap = host.querySelector('.tm500-jz-sg-caption');
        if (cap) cap.remove();
        let wrap = host.querySelector('.tm500-jz-jz-charts-wrap');
        let strip = host.querySelector('.tm500-jz-saiguo-strip');
        let panlu = host.querySelector('.tm500-jz-panlu-stack');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'tm500-jz-jz-charts-wrap';
            if (strip) {
                host.insertBefore(wrap, strip);
                wrap.appendChild(strip);
            } else {
                strip = document.createElement('div');
                strip.className = 'tm500-jz-saiguo-strip';
                wrap.appendChild(strip);
                host.appendChild(wrap);
            }
        }
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'tm500-jz-saiguo-strip';
            wrap.insertBefore(strip, wrap.firstChild);
        } else if (strip.parentNode !== wrap) {
            wrap.insertBefore(strip, wrap.firstChild);
        }
        if (!panlu) {
            panlu = document.createElement('div');
            panlu.className = 'tm500-jz-panlu-stack';
            wrap.appendChild(panlu);
        } else if (panlu.parentNode !== wrap) {
            wrap.appendChild(panlu);
        }
        return { wrap: wrap, strip: strip, panlu: panlu };
    }

    function getJiaozhanStripMaxSlots(seriesLen) {
        const em = document.querySelector('#team_jiaozhan #limit_jz');
        let v = em ? parseInt(em.getAttribute('val'), 10) : 10;
        if (!v || v < 1) v = 10;
        if (v === 999) return Math.min(25, Math.max(seriesLen, 1));
        return Math.min(Math.max(v, 1), 30);
    }

    function buildJiaozhanSaiguoStripInner(series, maxSlot) {
        let disp = series;
        if (disp.length > maxSlot) disp = disp.slice(disp.length - maxSlot);
        const pad = Math.max(0, maxSlot - disp.length);
        const frag = document.createDocumentFragment();
        let i;
        for (i = 0; i < disp.length; i++) {
            const ch = disp[i];
            const cell = document.createElement('span');
            cell.className = 'tm500-jz-sg-cell ' +
                (ch === '胜' ? 'tm500-jz-sg-win' : ch === '平' ? 'tm500-jz-sg-draw' : 'tm500-jz-sg-loss');
            cell.textContent = ch;
            cell.setAttribute('title', ch);
            frag.appendChild(cell);
        }
        for (i = 0; i < pad; i++) {
            const cell = document.createElement('span');
            cell.className = 'tm500-jz-sg-cell tm500-jz-sg-empty';
            cell.setAttribute('aria-hidden', 'true');
            frag.appendChild(cell);
        }
        return frag;
    }

    function findJiaozhanHeaderThRow(table) {
        const trs = table.querySelectorAll('tr');
        let i;
        for (i = 0; i < trs.length; i++) {
            if (trs[i].querySelector('th')) return trs[i];
        }
        return null;
    }

    function findJiaozhanBeizhuThIndex(table) {
        const thRow = findJiaozhanHeaderThRow(table);
        if (!thRow) return -1;
        const ths = thRow.querySelectorAll('th');
        let i, t;
        for (i = 0; i < ths.length; i++) {
            if (ths[i].classList.contains('tm500-jz-bz-col')) return i;
            t = (ths[i].textContent || '').replace(/\s+/g, '');
            // 仅精确匹配，避免误命中亚盘下拉里的「初盘」选项文案
            if (t === '备注' || t === '初盘') return i;
        }
        return ths.length ? ths.length - 1 : -1;
    }

    function insertAfterJiaozhanNode(newNode, refNode) {
        if (!refNode || !refNode.parentNode) return;
        if (refNode.nextSibling) refNode.parentNode.insertBefore(newNode, refNode.nextSibling);
        else refNode.parentNode.appendChild(newNode);
    }

    /**
     * 交战历史列地图：优先表头文案 / select / 脚本 class，兼容未登录少列与登录多列（平均欧指、*门等）。
     * 返回 { saiguo, panlu, daxiao, oupeiNative, yapan, beizhu, oupei, shishi }
     */
    function getJiaozhanYapanBeizhuIndices(table) {
        const thRow = findJiaozhanHeaderThRow(table);
        const ths = thRow ? thRow.querySelectorAll('th') : [];
        const n = ths.length;
        let saiguo = -1;
        let panlu = -1;
        let daxiao = -1;
        let oupeiNative = -1;
        let yapan = -1;
        let beizhu = -1;
        let shishi = -1;
        let oupei = -1;
        let i;
        let t;

        for (i = 0; i < n; i++) {
            const th = ths[i];
            t = (th.textContent || '').replace(/\s+/g, '');
            if (saiguo < 0 && t.indexOf('赛果') !== -1) saiguo = i;
            if (panlu < 0 && t.indexOf('盘路') !== -1) panlu = i;
            // 「大小」独立列；与「盘路大小」合并列时由 panlu 覆盖，不再重复
            if (daxiao < 0 && t.indexOf('大小') !== -1 && t.indexOf('盘路') === -1) daxiao = i;
            if (oupeiNative < 0 && th.querySelector('select[name="oupei"]')) oupeiNative = i;
            // 亚盘公司列：只认 data-t=yp，避免误命中「初盘/终盘」的 pk 下拉
            if (yapan < 0 && th.querySelector('select[name="yapan"][data-t="yp"]')) yapan = i;
            if (beizhu < 0 && (
                th.classList.contains('tm500-jz-bz-col') || t === '备注' || t === '初盘'
            )) beizhu = i;
            if (oupei < 0 && (
                th.classList.contains('tm500-jz-op-col') || t === '欧赔'
            )) oupei = i;
            if (shishi < 0 && (
                th.classList.contains('tm500-jz-ss-col') || t === '实时'
            )) shishi = i;
        }
        // 无 yp 时再退到任意 yapan select（登录 *门 列常见）
        if (yapan < 0) {
            for (i = 0; i < n; i++) {
                if (ths[i].querySelector('select[name="yapan"]')) {
                    yapan = i;
                    break;
                }
            }
        }

        // 兜底：旧版未登录少列 / 异常表头
        if (saiguo < 0) saiguo = n > 4 ? 4 : -1;
        if (panlu < 0) {
            if (yapan >= 0 && yapan + 1 < n) panlu = yapan + 1;
            else if (n >= 8) panlu = 7;
        }
        if (yapan < 0) {
            yapan = n >= 10 ? 6 : (n < 2 ? 6 : Math.max(0, n - 4));
        }
        if (beizhu < 0) {
            beizhu = findJiaozhanBeizhuThIndex(table);
            if (beizhu < 0) beizhu = n >= 10 ? 9 : (n < 2 ? 9 : n - 1);
        }
        if (oupeiNative < 0 && n > 5) {
            // 未登录常见固定欧指列；登录则已由 select 命中
            if (n < 10) oupeiNative = 5;
        }
        // 登录「平均欧指」无 select 时：表头文案兜底（勿命中脚本「欧赔」列）
        if (oupeiNative < 0) {
            for (i = 0; i < n; i++) {
                t = (ths[i].textContent || '').replace(/\s+/g, '');
                if (ths[i].classList.contains('tm500-jz-op-col') || t === '欧赔') continue;
                if (t.indexOf('平均欧指') !== -1 || t.indexOf('欧指') !== -1) {
                    oupeiNative = i;
                    break;
                }
            }
        }

        // 脚本插入列：相对备注列左右邻接再确认一次
        if (beizhu >= 0 && n > 0) {
            if (shishi < 0 && beizhu + 1 < n) {
                const nextTh = ths[beizhu + 1];
                const nt = nextTh ? (nextTh.textContent || '').replace(/\s+/g, '') : '';
                if (nt === '实时' || (nextTh && nextTh.classList.contains('tm500-jz-ss-col'))) {
                    shishi = beizhu + 1;
                }
            }
            if (shishi < 0 && beizhu > 0) {
                const prevTh = ths[beizhu - 1];
                const pt = prevTh ? (prevTh.textContent || '').replace(/\s+/g, '') : '';
                if (pt === '实时' || (prevTh && prevTh.classList.contains('tm500-jz-ss-col'))) {
                    shishi = beizhu - 1;
                }
            }
            if (oupei < 0 && beizhu > 0) {
                const leftTh = ths[beizhu - 1];
                const lt = leftTh ? (leftTh.textContent || '').replace(/\s+/g, '') : '';
                if (lt === '欧赔' || (leftTh && leftTh.classList.contains('tm500-jz-op-col'))) {
                    oupei = beizhu - 1;
                }
            }
        }

        return {
            saiguo: saiguo,
            panlu: panlu,
            daxiao: daxiao,
            oupeiNative: oupeiNative,
            yapan: yapan,
            shishi: shishi,
            beizhu: beizhu,
            oupei: oupei
        };
    }

    const HIDE_NATIVE_COL_STYLE_ID = 'tm500-hide-native-col-style-158';
    const HIDE_NATIVE_COL_CLASS = 'tm500-hide-native-col';

    function injectHideNativeColStyle() {
        if (document.getElementById(HIDE_NATIVE_COL_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = HIDE_NATIVE_COL_STYLE_ID;
        s.textContent =
            '.' + HIDE_NATIVE_COL_CLASS + '{' +
            'display:none!important;' +
            'width:0!important;min-width:0!important;max-width:0!important;' +
            'padding:0!important;margin:0!important;border:none!important;' +
            'overflow:hidden!important;font-size:0!important;line-height:0!important;' +
            '}';
        document.head.appendChild(s);
    }

    function clearPubTableHiddenNativeCols(table) {
        if (!table) return;
        const marked = table.querySelectorAll('.' + HIDE_NATIVE_COL_CLASS);
        let i;
        for (i = 0; i < marked.length; i++) {
            marked[i].classList.remove(HIDE_NATIVE_COL_CLASS);
        }
    }

    function hidePubTableColumnsByIndices(table, indices) {
        if (!table || !indices || !indices.length) return;
        const uniq = [];
        let i, j, idx;
        for (i = 0; i < indices.length; i++) {
            idx = indices[i];
            if (typeof idx !== 'number' || idx < 0 || uniq.indexOf(idx) !== -1) continue;
            uniq.push(idx);
        }
        if (!uniq.length) return;
        injectHideNativeColStyle();
        const rows = table.querySelectorAll('tr');
        for (i = 0; i < rows.length; i++) {
            const cells = [];
            const kids = rows[i].children;
            for (j = 0; j < kids.length; j++) {
                if (kids[j].tagName === 'TH' || kids[j].tagName === 'TD') cells.push(kids[j]);
            }
            for (j = 0; j < uniq.length; j++) {
                idx = uniq[j];
                if (cells[idx]) cells[idx].classList.add(HIDE_NATIVE_COL_CLASS);
            }
        }
        const cols = table.querySelectorAll('colgroup col');
        for (j = 0; j < uniq.length; j++) {
            idx = uniq[j];
            if (cols[idx]) cols[idx].classList.add(HIDE_NATIVE_COL_CLASS);
        }
    }

    /**
     * 交战历史：隐藏原生平均欧指 / 亚盘(*门) / 盘路 / 大小（DOM 保留，供 AJAX/读数）。
     * 不隐藏脚本插入的欧赔 / 初盘 / 实时。
     * 仅按表头/select 明确命中隐藏，不用列数兜底，避免未登录少列误伤。
     */
    function hideJiaozhanNativeOddsColumns(table) {
        if (!table) return;
        clearPubTableHiddenNativeCols(table);
        const thRow = findJiaozhanHeaderThRow(table);
        if (!thRow) return;
        const ths = thRow.querySelectorAll('th');
        const n = ths.length;
        const cols = getJiaozhanYapanBeizhuIndices(table);
        const keep = {};
        if (cols.oupei >= 0) keep[cols.oupei] = 1;
        if (cols.beizhu >= 0) keep[cols.beizhu] = 1;
        if (cols.shishi >= 0) keep[cols.shishi] = 1;
        const hideIdx = [];
        function pushHide(i) {
            if (i < 0 || keep[i] || hideIdx.indexOf(i) !== -1) return;
            hideIdx.push(i);
        }
        let i;
        let t;
        for (i = 0; i < n; i++) {
            if (keep[i]) continue;
            const th = ths[i];
            t = (th.textContent || '').replace(/\s+/g, '');
            if (th.querySelector('select[name="oupei"]')) {
                pushHide(i);
                continue;
            }
            if (th.querySelector('select[name="yapan"][data-t="yp"]') ||
                th.querySelector('select[name="yapan"]')) {
                pushHide(i);
                continue;
            }
            if (t.indexOf('平均欧指') !== -1 || (t.indexOf('欧指') !== -1 && t !== '欧赔')) {
                pushHide(i);
                continue;
            }
            if (t.indexOf('盘路') !== -1 || (t.indexOf('大小') !== -1 && t.indexOf('盘路') === -1)) {
                pushHide(i);
            }
        }
        hidePubTableColumnsByIndices(table, hideIdx);
    }

    function findZhanjiHeaderCellIndices(table) {
        const out = { panlu: -1, daxiao: -1, panikou: -1 };
        if (!table) return out;
        const trs = table.querySelectorAll('tr');
        let header = null;
        let i;
        for (i = 0; i < trs.length; i++) {
            if (trs[i].querySelector('th')) {
                header = trs[i];
                break;
            }
        }
        if (!header) return out;
        const cells = [];
        const kids = header.children;
        for (i = 0; i < kids.length; i++) {
            if (kids[i].tagName === 'TH' || kids[i].tagName === 'TD') cells.push(kids[i]);
        }
        for (i = 0; i < cells.length; i++) {
            const t = (cells[i].textContent || '').replace(/\s+/g, '');
            if (out.panlu < 0 && t.indexOf('盘路') !== -1) out.panlu = i;
            if (out.daxiao < 0 && t.indexOf('大小') !== -1 && t.indexOf('盘路') === -1) out.daxiao = i;
            if (out.panikou < 0 && t.indexOf('盘口') !== -1 &&
                !cells[i].classList.contains('tm500-zj-yp-col') &&
                !cells[i].classList.contains('tm500-zj2-yp-col')) {
                out.panikou = i;
            }
        }
        return out;
    }

    /** 近期战绩 / 主客场等表：隐藏原生盘路、大小、盘口列（不碰脚本「亚盘」列） */
    function hideZhanjiNativePanluDaxiaoColumns(table) {
        if (!table) return;
        clearPubTableHiddenNativeCols(table);
        const idx = findZhanjiHeaderCellIndices(table);
        const hideIdx = [];
        if (idx.panlu >= 0) hideIdx.push(idx.panlu);
        if (idx.daxiao >= 0) hideIdx.push(idx.daxiao);
        if (idx.panikou >= 0) hideIdx.push(idx.panikou);
        hidePubTableColumnsByIndices(table, hideIdx);
    }

    function hideAllZhanjiNativePanluDaxiaoColumns() {
        if (!isShujuFenxiPage()) return;
        const ids = [
            'team_zhanji_0', 'team_zhanji_1',
            'team_zhanji1_0', 'team_zhanji1_1',
            'team_zhanji2_0', 'team_zhanji2_1'
        ];
        ids.forEach(function(tid) {
            const root = document.getElementById(tid);
            if (!root) return;
            const table = findZhanjiPubTable(root);
            if (table) hideZhanjiNativePanluDaxiaoColumns(table);
        });
    }

    function relocateJiaozhanShishiColumnToRight(table, beizhuIdx) {
        const thRow = findJiaozhanHeaderThRow(table);
        if (!thRow || beizhuIdx <= 0) return;
        const ths = thRow.querySelectorAll('th');
        const ssTh = ths[beizhuIdx - 1];
        const bzTh = ths[beizhuIdx];
        if (!ssTh || !bzTh) return;
        insertAfterJiaozhanNode(ssTh, bzTh);
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            const tds = tr.querySelectorAll('td');
            const ssTd = tds[beizhuIdx - 1];
            const bzTd = tds[beizhuIdx];
            if (ssTd && bzTd) insertAfterJiaozhanNode(ssTd, bzTd);
        });
    }

    /** 在「备注」列左侧插入「欧赔」列（初盘 胜/平/负） */
    function ensureJiaozhanOupeiColumn(table) {
        let cols = getJiaozhanYapanBeizhuIndices(table);
        const beizhuIdx = cols.beizhu;
        if (beizhuIdx < 0) return cols;
        if (cols.oupei >= 0) return cols;
        const thRow = findJiaozhanHeaderThRow(table);
        if (!thRow) return cols;
        const ths = thRow.querySelectorAll('th');
        const refTh = ths[beizhuIdx];
        if (!refTh || !refTh.parentNode) return cols;
        const newTh = document.createElement('th');
        newTh.textContent = '欧赔';
        newTh.className = 'tm500-jz-op-col';
        newTh.setAttribute('title', '欧赔实时：胜 平 负；悬停赔率看初盘对比弹窗');
        refTh.parentNode.insertBefore(newTh, refTh);
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            const tds = tr.querySelectorAll('td');
            const refTd = tds[beizhuIdx];
            if (!refTd || !refTd.parentNode) return;
            const newTd = document.createElement('td');
            newTd.className = 'tm500-jz-op-cell';
            newTd.textContent = '-';
            refTd.parentNode.insertBefore(newTd, refTd);
        });
        table.dataset.tm500JzOupeiCol = '1';
        return getJiaozhanYapanBeizhuIndices(table);
    }

    /** 确保列顺序：… | 欧赔 | 备注 | 实时 */
    function ensureJiaozhanShishiColumn(table) {
        let cols = getJiaozhanYapanBeizhuIndices(table);
        const beizhuIdx = cols.beizhu;
        if (beizhuIdx < 0) return cols;
        // 旧版「实时」曾在备注左侧：先挪到右侧，再插欧赔
        if (cols.shishi >= 0 && cols.shishi === beizhuIdx - 1) {
            const thRow0 = findJiaozhanHeaderThRow(table);
            const ths0 = thRow0 ? thRow0.querySelectorAll('th') : [];
            const leftTh = ths0[beizhuIdx - 1];
            if (leftTh && (leftTh.classList.contains('tm500-jz-ss-col') ||
                ((leftTh.textContent || '').replace(/\s+/g, '') === '实时'))) {
                relocateJiaozhanShishiColumnToRight(table, beizhuIdx);
            }
        }
        ensureJiaozhanOupeiColumn(table);
        cols = getJiaozhanYapanBeizhuIndices(table);
        if (cols.shishi >= 0) return cols;
        const thRow = findJiaozhanHeaderThRow(table);
        if (!thRow) return cols;
        const ths = thRow.querySelectorAll('th');
        const refTh = ths[cols.beizhu];
        if (!refTh) return cols;
        const newTh = document.createElement('th');
        newTh.textContent = '实时';
        newTh.className = 'tm500-jz-ss-col';
        insertAfterJiaozhanNode(newTh, refTh);
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            const tds = tr.querySelectorAll('td');
            const refTd = tds[cols.beizhu];
            if (!refTd) return;
            const newTd = document.createElement('td');
            newTd.className = 'tm500-jz-ss-cell';
            newTd.textContent = '-';
            insertAfterJiaozhanNode(newTd, refTd);
        });
        table.dataset.tm500JzShishiCol = '1';
        return getJiaozhanYapanBeizhuIndices(table);
    }

    const JZ_BEIZHU_STYLE_ID = 'tm500-jz-beizhu-style-196';
    const JZ_SHISHI_STYLE_ID = 'tm500-jz-shishi-style-205';
    const JZ_OUPEI_STYLE_ID = 'tm500-jz-oupei-style-209';
    const JZ_OUPEI_TIP_ID = 'tm500-jz-op-tip';
    const JZ_TABLE_WIDE_STYLE_ID = 'tm500-jz-table-wide-198';

    /** 解除站点 table/colgroup/th 定宽，否则仅改 CSS 无法撑开备注列（每张表只执行一次，避免反复触发布局抖动） */
    function relaxJiaozhanPubTableWidths(table) {
        if (!table) return;
        if (table.dataset.tm500JzWidthsRelaxed === '1') return;
        table.dataset.tm500JzWidthsRelaxed = '1';
        table.removeAttribute('width');
        try {
            table.style.setProperty('width', '100%', 'important');
            table.style.setProperty('max-width', 'none', 'important');
            table.style.setProperty('table-layout', 'auto', 'important');
        } catch (eW) {}
        let cols, ci;
        try {
            cols = table.querySelectorAll('colgroup col');
            for (ci = 0; ci < cols.length; ci++) {
                cols[ci].removeAttribute('width');
                cols[ci].style.setProperty('width', 'auto', 'important');
            }
            if (cols.length) {
                cols[0].style.setProperty('min-width', '56px', 'important');
                cols[0].style.setProperty('max-width', '90px', 'important');
            }
        } catch (eC) {}
        try {
            const wCells = table.querySelectorAll('th[width], td[width]');
            for (ci = 0; ci < wCells.length; ci++) wCells[ci].removeAttribute('width');
        } catch (eT) {}
    }

    /** 放宽交战历史表格外层与 .M_content 的定宽，表格随可视区域变宽（为备注/盘口留空间） */
    const DZ_NAME_STYLE_ID = 'tm500-dz-name-style-212';

    /** 对阵列：战绩表主/客约6.5字超长省略（双表并排不挤爆亚盘）；交战历史约9字 */
    function injectDzTeamNameStyle() {
        const legacyIds = [
            'tm500-dz-name-style-199', 'tm500-dz-name-style-202',
            'tm500-dz-name-style-203', 'tm500-dz-name-style-204',
            'tm500-dz-name-style-205', 'tm500-dz-name-style-206',
            'tm500-dz-name-style-207', 'tm500-dz-name-style-208',
            'tm500-dz-name-style-209', 'tm500-dz-name-style-210',
            'tm500-dz-name-style-211'
        ];
        legacyIds.forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        if (document.getElementById(DZ_NAME_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = DZ_NAME_STYLE_ID;
        s.textContent =
            '.odds_zj_tubiao table.pub_table,' +
            '.M_box.record table.pub_table{' +
            'table-layout:fixed!important;width:100%!important;' +
            'border-collapse:collapse;' +
            'overflow:hidden!important;' +
            '}' +
            '.odds_zj_tubiao .pub_table th.th_one,' +
            '.odds_zj_tubiao .pub_table td.td_one,' +
            '.M_box.record .pub_table th.th_one,' +
            '.M_box.record .pub_table td.td_one{' +
            'width:48px!important;min-width:48px!important;max-width:48px!important;' +
            'white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;' +
            'box-sizing:border-box!important;' +
            '}' +
            '.odds_zj_tubiao .pub_table th:nth-child(2),' +
            '.odds_zj_tubiao .pub_table td:nth-child(2),' +
            '.M_box.record .pub_table th:nth-child(2),' +
            '.M_box.record .pub_table td:nth-child(2){' +
            'width:58px!important;min-width:58px!important;max-width:58px!important;' +
            'white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;' +
            'box-sizing:border-box!important;' +
            '}' +
            /* 战绩对阵格：主6.5 + 比分 + 客6.5，给亚盘留位 */
            '.odds_zj_tubiao .pub_table td.dz,' +
            '.odds_zj_tubiao .pub_table th .dz,' +
            '.M_box.record .pub_table td.dz,' +
            '.M_box.record .pub_table th .dz{' +
            'width:auto!important;' +
            'min-width:0!important;' +
            'max-width:none!important;' +
            'box-sizing:border-box!important;overflow:hidden!important;' +
            'padding-left:2px!important;padding-right:2px!important;' +
            '}' +
            '#team_jiaozhan .pub_table td.dz,' +
            '#team_jiaozhan .pub_table th .dz{' +
            'width:calc(18em + 44px)!important;' +
            'min-width:calc(18em + 44px)!important;' +
            'max-width:none!important;' +
            'box-sizing:border-box!important;overflow:hidden!important;' +
            'padding-left:4px!important;padding-right:4px!important;' +
            '}' +
            '.odds_zj_tubiao .pub_table td.dz > a,' +
            '.odds_zj_tubiao .pub_table th .dz,' +
            '.M_box.record .pub_table td.dz > a,' +
            '.M_box.record .pub_table th .dz,' +
            '#team_jiaozhan .pub_table td.dz > a,' +
            '#team_jiaozhan .pub_table th .dz{' +
            'display:flex!important;' +
            'flex-direction:row!important;' +
            'align-items:center!important;' +
            'justify-content:center!important;' +
            'width:100%!important;' +
            'max-width:100%!important;' +
            'box-sizing:border-box!important;' +
            'overflow:hidden!important;' +
            'gap:0;' +
            '}' +
            /* 战绩主/客：定宽 + 超长省略（悬停 title 看全称） */
            '.odds_zj_tubiao .pub_table .dz .dz-l,' +
            '.odds_zj_tubiao .pub_table .dz .dz-r,' +
            '.M_box.record .pub_table .dz .dz-l,' +
            '.M_box.record .pub_table .dz .dz-r{' +
            'float:none!important;' +
            'display:block!important;' +
            'flex:1 1 0!important;' +
            'width:0!important;' +
            'min-width:0!important;' +
            'max-width:6.5em!important;' +
            'white-space:nowrap!important;' +
            'word-break:keep-all!important;' +
            'overflow:hidden!important;' +
            'text-overflow:ellipsis!important;' +
            'box-sizing:border-box!important;' +
            '}' +
            '#team_jiaozhan .pub_table .dz .dz-l,' +
            '#team_jiaozhan .pub_table .dz .dz-r{' +
            'float:none!important;' +
            'display:block!important;' +
            'flex:0 0 9em!important;' +
            'width:9em!important;' +
            'min-width:9em!important;' +
            'max-width:9em!important;' +
            'white-space:nowrap!important;' +
            'word-break:keep-all!important;' +
            'overflow:hidden!important;' +
            'text-overflow:ellipsis!important;' +
            'box-sizing:border-box!important;' +
            '}' +
            '.odds_zj_tubiao .pub_table .dz .dz-l,' +
            '.M_box.record .pub_table .dz .dz-l,' +
            '#team_jiaozhan .pub_table .dz .dz-l{' +
            'text-align:right!important;' +
            '}' +
            '.odds_zj_tubiao .pub_table .dz .dz-r,' +
            '.M_box.record .pub_table .dz .dz-r,' +
            '#team_jiaozhan .pub_table .dz .dz-r{' +
            'text-align:left!important;' +
            '}' +
            '.odds_zj_tubiao .pub_table .dz em,' +
            '.M_box.record .pub_table .dz em,' +
            '#team_jiaozhan .pub_table .dz em{' +
            'float:none!important;' +
            'display:block!important;' +
            'flex:0 0 36px!important;' +
            'width:36px!important;min-width:36px!important;max-width:36px!important;' +
            'text-align:center!important;' +
            'box-sizing:border-box!important;' +
            'overflow:hidden!important;' +
            '}' +
            '.tm500-zj2-expand-wrap .tm500-zj2-expand{' +
            'width:auto!important;min-width:0!important;max-width:none!important;' +
            'display:inline-block!important;padding:2px 5px!important;' +
            '}';
        document.head.appendChild(s);
    }

    function ensureDzTeamNameTitles(scope) {
        const root = scope || document;
        root.querySelectorAll(
            '#team_jiaozhan td.dz .dz-l, #team_jiaozhan td.dz .dz-r,' +
            '.M_box.record td.dz .dz-l, .M_box.record td.dz .dz-r'
        ).forEach(function(el) {
            const name = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (name) el.setAttribute('title', name);
        });
    }

    function injectJiaozhanTableWideStyle() {
        const legacy192 = document.getElementById('tm500-jz-table-wide-192');
        const legacy193 = document.getElementById('tm500-jz-table-wide-193');
        const legacy195 = document.getElementById('tm500-jz-table-wide-195');
        const legacy196 = document.getElementById('tm500-jz-table-wide-196');
        if (legacy192) legacy192.remove();
        if (legacy193) legacy193.remove();
        if (legacy195) legacy195.remove();
        if (legacy196) legacy196.remove();
        injectDzTeamNameStyle();
        if (document.getElementById(JZ_TABLE_WIDE_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = JZ_TABLE_WIDE_STYLE_ID;
        s.textContent =
            '#team_jiaozhan,' +
            '#team_jiaozhan form#jiaozhan,' +
            '#team_jiaozhan .M_content_t,' +
            '.odds_content #team_jiaozhan{' +
            'max-width:none!important;' +
            'width:min(100%,calc(100vw - 120px))!important;' +
            'box-sizing:border-box;' +
            '}' +
            '#team_jiaozhan .M_content{' +
            'max-width:none!important;' +
            'width:100%!important;' +
            'box-sizing:border-box;' +
            '}' +
            '#team_jiaozhan table.pub_table{' +
            'width:100%!important;' +
            'max-width:none!important;' +
            'table-layout:auto!important;' +
            'box-sizing:border-box;' +
            '}' +
            '#team_jiaozhan table.pub_table col{' +
            'width:auto!important;' +
            '}' +
            '#team_jiaozhan table.pub_table col:first-child{' +
            'min-width:56px!important;max-width:90px!important;width:auto!important;' +
            '}' +
            '#team_jiaozhan table.pub_table th:first-child,' +
            '#team_jiaozhan table.pub_table td:first-child{' +
            'min-width:56px!important;max-width:90px!important;width:auto!important;' +
            'padding:4px 5px!important;box-sizing:border-box!important;' +
            'white-space:nowrap!important;writing-mode:horizontal-tb!important;' +
            'text-orientation:mixed!important;overflow:hidden;text-overflow:ellipsis;' +
            '}' +
            '#team_jiaozhan table.pub_table th.tm500-jz-bz-col,' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell{' +
            'width:auto!important;min-width:128px!important;max-width:none!important;' +
            '}' +
            '#team_jiaozhan table.pub_table th.tm500-jz-op-col,' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell{' +
            'width:auto!important;min-width:88px!important;max-width:none!important;' +
            '}' +
            '#team_jiaozhan table.pub_table th.tm500-jz-ss-col,' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell{' +
            'width:auto!important;min-width:96px!important;max-width:none!important;' +
            '}';
        document.head.appendChild(s);
    }

    function injectJiaozhanBeizhuStyle() {
        const legacy189 = document.getElementById('tm500-jz-beizhu-style-189');
        const legacy190 = document.getElementById('tm500-jz-beizhu-style-190');
        const legacy194 = document.getElementById('tm500-jz-beizhu-style-194');
        const legacy195 = document.getElementById('tm500-jz-beizhu-style-195');
        if (legacy189) legacy189.remove();
        if (legacy190) legacy190.remove();
        if (legacy194) legacy194.remove();
        if (legacy195) legacy195.remove();
        if (document.getElementById(JZ_BEIZHU_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = JZ_BEIZHU_STYLE_ID;
        s.textContent =
            '#team_jiaozhan table.pub_table th.tm500-jz-bz-col,' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell{' +
            'min-width:128px!important;width:auto!important;max-width:none!important;' +
            'padding:5px 4px!important;white-space:nowrap!important;word-break:keep-all!important;' +
            'vertical-align:middle;line-height:1.25;font-size:12px;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-yp-align{' +
            'display:inline-grid;grid-template-columns:2.6em 6.2em 2.6em;column-gap:2px;' +
            'align-items:center;white-space:nowrap;vertical-align:middle;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-yp-l{' +
            'text-align:right;justify-self:stretch;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-yp-m{' +
            'text-align:center;justify-self:stretch;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-yp-r{' +
            'text-align:left;justify-self:stretch;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-bz-pk{' +
            'display:inline-block;margin:0;padding:1px 3px;border-radius:3px;' +
            'font-size:10px!important;line-height:1.2;font-weight:600;' +
            'color:#66bb6a!important;background:transparent;border:none;' +
            'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
            'box-sizing:border-box;vertical-align:middle;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-bz-pk.tm500-jz-pk-shou{' +
            'color:#64b5f6!important;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-bz-odds{' +
            'font-size:11px;font-weight:600;color:#333;font-variant-numeric:tabular-nums;' +
            '}';
        document.head.appendChild(s);
    }

    function injectJiaozhanShishiStyle() {
        const legacy201 = document.getElementById('tm500-jz-shishi-style-201');
        const legacy202 = document.getElementById('tm500-jz-shishi-style-202');
        const legacy203 = document.getElementById('tm500-jz-shishi-style-203');
        const legacy204 = document.getElementById('tm500-jz-shishi-style-204');
        if (legacy201) legacy201.remove();
        if (legacy202) legacy202.remove();
        if (legacy203) legacy203.remove();
        if (legacy204) legacy204.remove();
        if (document.getElementById(JZ_SHISHI_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = JZ_SHISHI_STYLE_ID;
        s.textContent =
            '#team_jiaozhan table.pub_table th.tm500-jz-ss-col,' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell{' +
            'min-width:110px!important;width:auto!important;max-width:none!important;' +
            'padding:5px 4px!important;white-space:nowrap!important;word-break:keep-all!important;' +
            'vertical-align:middle;line-height:1.25;font-size:12px;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-yp-align{' +
            'display:inline-grid;grid-template-columns:2.6em 6.2em 2.6em;column-gap:2px;' +
            'align-items:center;white-space:nowrap;vertical-align:middle;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-yp-l{' +
            'text-align:right;justify-self:stretch;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-yp-m{' +
            'text-align:center;justify-self:stretch;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-yp-r{' +
            'text-align:left;justify-self:stretch;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-pk{' +
            'display:inline-block;margin:0;padding:1px 4px;border-radius:3px;' +
            'font-size:10px!important;line-height:1.2;font-weight:600;' +
            'color:#66bb6a!important;background:transparent;border:1px solid transparent;' +
            'max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' +
            'box-sizing:border-box;vertical-align:middle;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-pk.tm500-jz-pk-shou{' +
            'color:#64b5f6!important;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-pk.tm500-jz-ss-pk-up{' +
            'background:#fde2e4!important;border-color:#f5b5ba!important;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-pk.tm500-jz-ss-pk-down{' +
            'background:#e3f2fd!important;border-color:#90caf9!important;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-pk-arr{' +
            'display:inline-block;margin-left:1px;font-size:10px;font-weight:700;line-height:1;' +
            'color:inherit;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-odds{' +
            'font-size:11px;font-weight:600;color:#333;font-variant-numeric:tabular-nums;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-odds.tm500-jz-ss-odds-up{' +
            'color:#c62828!important;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-odds.tm500-jz-ss-odds-down{' +
            'color:#2e7d32!important;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-ss-cell .tm500-jz-ss-arr{' +
            'display:inline-block;margin-left:1px;font-size:10px;font-weight:700;line-height:1;' +
            '}';
        document.head.appendChild(s);
    }

    function injectJiaozhanOupeiStyle() {
        const legacy202 = document.getElementById('tm500-jz-oupei-style-202');
        const legacy203 = document.getElementById('tm500-jz-oupei-style-203');
        const legacy204 = document.getElementById('tm500-jz-oupei-style-204');
        const legacy205 = document.getElementById('tm500-jz-oupei-style-205');
        const legacy206 = document.getElementById('tm500-jz-oupei-style-206');
        const legacy207 = document.getElementById('tm500-jz-oupei-style-207');
        const legacy208 = document.getElementById('tm500-jz-oupei-style-208');
        if (legacy202) legacy202.remove();
        if (legacy203) legacy203.remove();
        if (legacy204) legacy204.remove();
        if (legacy205) legacy205.remove();
        if (legacy206) legacy206.remove();
        if (legacy207) legacy207.remove();
        if (legacy208) legacy208.remove();
        if (document.getElementById(JZ_OUPEI_STYLE_ID)) {
            bindJiaozhanOupeiTipOnce();
            return;
        }
        const s = document.createElement('style');
        s.id = JZ_OUPEI_STYLE_ID;
        s.textContent =
            '#team_jiaozhan table.pub_table th.tm500-jz-op-col,' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell{' +
            'min-width:96px!important;width:auto!important;max-width:none!important;' +
            'padding:5px 5px!important;white-space:nowrap;' +
            'vertical-align:middle;line-height:1.38;font-size:12px;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell .tm500-jz-op-odds{' +
            'display:inline-block;font-size:11px;font-weight:600;color:#333;cursor:help;' +
            'padding:1px 3px;border-radius:2px;line-height:1.25;box-sizing:border-box;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell .tm500-jz-op-odds + .tm500-jz-op-odds{' +
            'margin-left:3px;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell .tm500-jz-op-odds.tm500-jz-op-odds-up{' +
            'color:#c62828!important;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell .tm500-jz-op-odds.tm500-jz-op-odds-down{' +
            'color:#2e7d32!important;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell .tm500-jz-op-odds.tm500-jz-op-odds-bg-up{' +
            'color:#842029!important;background:#fde2e4!important;border:1px solid #f5b5ba;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell .tm500-jz-op-odds.tm500-jz-op-odds-bg-down{' +
            'color:#0f5132!important;background:#d1e7dd!important;border:1px solid #a3cfbb;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-op-cell .tm500-jz-op-arr{' +
            'display:inline-block;margin-left:1px;font-size:10px;font-weight:700;line-height:1;' +
            '}' +
            '#' + JZ_OUPEI_TIP_ID + '{' +
            'position:fixed;z-index:2147483000;display:none;pointer-events:none;' +
            'box-sizing:border-box;padding:8px 10px;border-radius:6px;' +
            'background:#fff;color:#222;' +
            'border:1px solid #e2e5ea;' +
            'box-shadow:0 6px 18px rgba(20,28,40,.12);' +
            'font:12px/1.45 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;' +
            '}' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table{' +
            'border-collapse:collapse;border-spacing:0;margin:0;' +
            '}' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table th,' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table td{' +
            'padding:2px 8px;white-space:nowrap;text-align:right;' +
            'font-variant-numeric:tabular-nums;' +
            '}' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table th{' +
            'font-weight:700;color:#111;border-bottom:1px solid #eef0f3;' +
            'padding-bottom:4px;margin-bottom:2px;' +
            '}' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table th:first-child,' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table td:first-child{' +
            'text-align:left;color:#6b7280;font-weight:500;padding-left:0;' +
            '}' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table td{' +
            'color:#111;font-weight:600;' +
            '}' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table td.up{color:#c62828;}' +
            '#' + JZ_OUPEI_TIP_ID + ' table.tm500-jz-op-tip-table td.down{color:#2e7d32;}';
        document.head.appendChild(s);
        bindJiaozhanOupeiTipOnce();
    }

    function tagJiaozhanBeizhuHeaderTh(table, cols) {
        if (cols.beizhu < 0) return;
        const thRow = findJiaozhanHeaderThRow(table);
        if (!thRow) return;
        const ths = thRow.querySelectorAll('th');
        if (cols.oupei >= 0 && ths[cols.oupei]) {
            ths[cols.oupei].classList.add('tm500-jz-op-col');
            ths[cols.oupei].setAttribute('title', '欧赔实时：胜 平 负；悬停赔率看初盘对比弹窗');
        }
        if (cols.shishi >= 0 && ths[cols.shishi]) ths[cols.shishi].classList.add('tm500-jz-ss-col');
        if (ths[cols.beizhu]) {
            const bzTh = ths[cols.beizhu];
            bzTh.classList.add('tm500-jz-bz-col');
            const cur = (bzTh.textContent || '').replace(/\s+/g, '');
            if (cur === '备注' || cur === '' || cur === '-') {
                bzTh.textContent = '初盘';
            }
            if (!bzTh.getAttribute('title')) bzTh.setAttribute('title', '亚盘初盘');
        }
    }

    function widenJiaozhanBeizhuColumnCells(table, cols) {
        const rows = table.querySelectorAll('tr');
        let ri;
        for (ri = 0; ri < rows.length; ri++) {
            const tr = rows[ri];
            const tds = tr.querySelectorAll('td');
            if (!tds.length) continue;
            if (cols.oupei >= 0 && tds.length > cols.oupei) tds[cols.oupei].classList.add('tm500-jz-op-cell');
            if (cols.shishi >= 0 && tds.length > cols.shishi) tds[cols.shishi].classList.add('tm500-jz-ss-cell');
            if (cols.beizhu >= 0 && tds.length > cols.beizhu) tds[cols.beizhu].classList.add('tm500-jz-bz-cell');
        }
    }
    function splitJiaozhanRemarkDisplayParts(txt) {
        const t = (txt || '').replace(/\s+/g, ' ').trim();
        if (!t || t === '-') return null;
        const parts = t.split(' ');
        const isDec = function(s) {
            return /^-?\d+(\.\d+)?$/.test(s);
        };
        if (parts.length >= 3 && isDec(parts[0]) && isDec(parts[parts.length - 1])) {
            return {
                left: parts[0],
                mid: parts.slice(1, -1).join(' '),
                right: parts[parts.length - 1]
            };
        }
        if (parts.length === 2 && isDec(parts[0]) && !isDec(parts[1])) {
            return { left: parts[0], mid: parts[1], right: '' };
        }
        return null;
    }

    function formatJiaozhanOddsTwoDecimals(val) {
        const s = String(val == null ? '' : val).trim().replace(/,/g, '.');
        if (!s || !/^\d+(\.\d+)?$/.test(s)) return s;
        const n = parseFloat(s);
        return isFinite(n) ? n.toFixed(2) : s;
    }

    function formatJiaozhanOddsPairInSeg(seg) {
        if (!seg) return seg;
        return {
            left: seg.left ? formatJiaozhanOddsTwoDecimals(seg.left) : seg.left,
            mid: seg.mid,
            right: seg.right ? formatJiaozhanOddsTwoDecimals(seg.right) : seg.right
        };
    }

    function parseJiaozhanOddsNumber(val) {
        const s = String(val == null ? '' : val).trim().replace(/,/g, '.');
        if (!s || !/^\d+(\.\d+)?$/.test(s)) return NaN;
        const n = parseFloat(s);
        return isFinite(n) ? n : NaN;
    }

    function getJiaozhanYapanOddsSegFromTd(td) {
        if (!td) return null;
        const raw = td.getAttribute('data-tm500-jz-cell-val') || (td.textContent || '');
        return splitJiaozhanRemarkDisplayParts(raw.replace(/\s+/g, ' ').trim());
    }

    /** 让球方：无「受/受让」= 主队让 → 主赔；否则客赔 */
    function getJiaozhanRangqiuFangSideByHandicapName(nameStr) {
        return isJiaozhanYapanHomeReceiving(nameStr) ? 'away' : 'home';
    }

    function getJiaozhanRangqiuFangOddsFromApi(o, side) {
        if (!o || typeof o !== 'object') return NaN;
        const raw = side === 'away' ? o.AWAYMONEYLINE : o.HOMEMONEYLINE;
        return parseJiaozhanOddsNumber(raw);
    }

    function getJiaozhanRangqiuFangOddsFromSeg(seg, side) {
        if (!seg) return NaN;
        return parseJiaozhanOddsNumber(side === 'away' ? seg.right : seg.left);
    }

    function clearJiaozhanShishiOddsChgMarks(sTd) {
        if (!sTd) return;
        const oddsEls = sTd.querySelectorAll('.tm500-jz-ss-odds');
        let i;
        for (i = 0; i < oddsEls.length; i++) {
            oddsEls[i].classList.remove('tm500-jz-ss-odds-up', 'tm500-jz-ss-odds-down');
            const arr = oddsEls[i].querySelector('.tm500-jz-ss-arr');
            if (arr) arr.remove();
        }
    }

    function markJiaozhanShishiRangqiuOddsChg(sTd, side, dir) {
        if (!sTd || !side || !dir) return;
        const oddsEls = sTd.querySelectorAll('.tm500-jz-ss-odds');
        if (!oddsEls.length) return;
        const sp = side === 'away' ? oddsEls[oddsEls.length - 1] : oddsEls[0];
        if (!sp) return;
        sp.classList.remove('tm500-jz-ss-odds-up', 'tm500-jz-ss-odds-down');
        sp.classList.add(dir === 'up' ? 'tm500-jz-ss-odds-up' : 'tm500-jz-ss-odds-down');
        let arr = sp.querySelector('.tm500-jz-ss-arr');
        if (!arr) {
            arr = document.createElement('span');
            arr.className = 'tm500-jz-ss-arr';
            sp.appendChild(arr);
        }
        arr.textContent = dir === 'up' ? '↑' : '↓';
    }

    function applyJiaozhanShishiRangqiuOddsChg(table, cols, pairs, chuMap, zhongMap) {
        if (cols.shishi < 0 || cols.beizhu < 0 || !pairs || !pairs.length) return;
        const EPS = 0.0005;
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.shishi || tds.length <= cols.beizhu) return;
            const sTd = tds[cols.shishi];
            const bTd = tds[cols.beizhu];
            clearJiaozhanShishiOddsChgMarks(sTd);
            const chu = chuMap && chuMap[p.fid];
            const zh = zhongMap && zhongMap[p.fid];
            let side;
            let chuOdds;
            let zhOdds;
            if (chu || zh) {
                const name = String((chu && chu.HANDICAPLINENAME) || (zh && zh.HANDICAPLINENAME) || '').trim();
                side = getJiaozhanRangqiuFangSideByHandicapName(name);
                chuOdds = getJiaozhanRangqiuFangOddsFromApi(chu, side);
                zhOdds = getJiaozhanRangqiuFangOddsFromApi(zh, side);
            } else {
                const bSeg = getJiaozhanYapanOddsSegFromTd(bTd);
                const sSeg = getJiaozhanYapanOddsSegFromTd(sTd);
                const pkName = stripJiaozhanNumericHandicapFromMid((bSeg && bSeg.mid) || (sSeg && sSeg.mid) || '');
                side = getJiaozhanRangqiuFangSideByHandicapName(pkName);
                chuOdds = getJiaozhanRangqiuFangOddsFromSeg(bSeg, side);
                zhOdds = getJiaozhanRangqiuFangOddsFromSeg(sSeg, side);
            }
            if (!isFinite(chuOdds) || !isFinite(zhOdds)) return;
            const diff = zhOdds - chuOdds;
            if (diff > EPS) markJiaozhanShishiRangqiuOddsChg(sTd, side, 'up');
            else if (diff < -EPS) markJiaozhanShishiRangqiuOddsChg(sTd, side, 'down');
        });
    }

    function renderJiaozhanYapanOddsCell(td, txt, opts) {
        opts = opts || {};
        const cellCls = opts.cellClass || 'tm500-jz-bz-cell';
        const oddsCls = opts.oddsClass || 'tm500-jz-bz-odds';
        const pkCls = opts.pkClass || 'tm500-jz-bz-pk';
        const align = opts.align !== false;
        const norm = (txt || '').replace(/\s+/g, ' ').trim();
        let seg = splitJiaozhanRemarkDisplayParts(txt);
        if (seg) seg = formatJiaozhanOddsPairInSeg(seg);
        const normKey = (seg ?
            [seg.left, seg.mid, seg.right].filter(function(x) { return x; }).join(' ') : norm) +
            (align ? '|a1' : '');
        if (td.getAttribute('data-tm500-jz-cell-val') === normKey) return;
        td.setAttribute('data-tm500-jz-cell-val', normKey);
        td.classList.add(cellCls);
        if (!seg) {
            td.textContent = txt;
            return;
        }
        td.textContent = '';
        const spL = document.createElement('span');
        spL.className = oddsCls + (align ? ' tm500-jz-yp-l' : '');
        spL.textContent = seg.left || '';
        const spM = document.createElement('span');
        spM.className = pkCls + (align ? ' tm500-jz-yp-m' : '');
        spM.textContent = seg.mid || '';
        if (seg.mid) spM.setAttribute('title', seg.mid);
        if ((seg.mid || '').indexOf('受') !== -1) spM.classList.add('tm500-jz-pk-shou');
        else spM.classList.add('tm500-jz-pk-rang');
        const spR = document.createElement('span');
        spR.className = oddsCls + (align ? ' tm500-jz-yp-r' : '');
        spR.textContent = seg.right || '';
        if (align) {
            const row = document.createElement('span');
            row.className = 'tm500-jz-yp-align';
            row.appendChild(spL);
            row.appendChild(spM);
            row.appendChild(spR);
            td.appendChild(row);
        } else {
            td.appendChild(spL);
            td.appendChild(document.createTextNode(' '));
            td.appendChild(spM);
            if (seg.right) {
                td.appendChild(document.createTextNode(' '));
                td.appendChild(spR);
            }
        }
    }

    function renderJiaozhanBeizhuCell(bTd, txt) {
        renderJiaozhanYapanOddsCell(bTd, txt, {
            cellClass: 'tm500-jz-bz-cell',
            oddsClass: 'tm500-jz-bz-odds',
            pkClass: 'tm500-jz-bz-pk',
            align: true
        });
    }

    function renderJiaozhanShishiCell(sTd, txt) {
        renderJiaozhanYapanOddsCell(sTd, txt, {
            cellClass: 'tm500-jz-ss-cell',
            oddsClass: 'tm500-jz-ss-odds',
            pkClass: 'tm500-jz-ss-pk',
            align: true
        });
    }

    function formatJiaozhanOupeiAjaxText(o) {
        if (!o || typeof o !== 'object') return '';
        const w = formatJiaozhanOddsTwoDecimals(String(o.WIN != null ? o.WIN : '').trim());
        const d = formatJiaozhanOddsTwoDecimals(String(o.DRAW != null ? o.DRAW : '').trim());
        const l = formatJiaozhanOddsTwoDecimals(String(o.LOST != null ? o.LOST : '').trim());
        if (!w && !d && !l) return '';
        const parts = [];
        if (w) parts.push(w);
        if (d) parts.push(d);
        if (l) parts.push(l);
        return parts.join(' ');
    }

    function formatJiaozhanOupeiSignedNum(n, digits) {
        if (!isFinite(n)) return '';
        const d = digits == null ? 2 : digits;
        const s = n.toFixed(d);
        if (n > 0) return '+' + s;
        return s;
    }

    /** 百分比 = 差额 / (初盘 - 1) */
    function formatJiaozhanOupeiPct(diff, chu) {
        if (!isFinite(diff) || !isFinite(chu)) return '';
        const den = chu - 1;
        if (Math.abs(den) < 1e-9) return '';
        return formatJiaozhanOupeiSignedNum(diff / den * 100, 1) + '%';
    }

    function buildJiaozhanOupeiTipMetric(chuN, zhN) {
        const m = {
            chu: isFinite(chuN) ? chuN.toFixed(2) : '-',
            zh: isFinite(zhN) ? zhN.toFixed(2) : '-',
            diff: '-',
            pct: '-',
            d: ''
        };
        if (isFinite(chuN) && isFinite(zhN)) {
            const diff = zhN - chuN;
            m.d = Math.abs(diff) < 0.0005 ? '' : (diff > 0 ? 'up' : 'down');
            m.diff = formatJiaozhanOupeiSignedNum(diff, 2);
            m.pct = formatJiaozhanOupeiPct(diff, chuN) || '-';
        }
        return m;
    }

    /**
     * 表格数据：表头 胜/平/负；行标签 初盘/实时/差额/百分比 只出现一次
     * { headers:['胜','平','负'], metrics:[{k:'初盘', cells:[{v,d},...]}, ...] }
     */
    function buildJiaozhanOupeiTipTable(chuObj, zhObj) {
        const keys = ['WIN', 'DRAW', 'LOST'];
        const labels = ['胜', '平', '负'];
        const headers = [];
        const mets = [];
        let i;
        for (i = 0; i < keys.length; i++) {
            const chuN = getJiaozhanOupeiOutcomeNum(chuObj, keys[i]);
            const zhN = getJiaozhanOupeiOutcomeNum(zhObj, keys[i]);
            const showN = isFinite(zhN) ? zhN : chuN;
            if (!isFinite(chuN) && !isFinite(showN)) continue;
            headers.push(labels[i]);
            mets.push(buildJiaozhanOupeiTipMetric(chuN, isFinite(zhN) ? zhN : showN));
        }
        if (!headers.length) return null;
        return {
            headers: headers,
            metrics: [
                { k: '初盘', cells: mets.map(function(m) { return { v: m.chu, d: '' }; }) },
                { k: '实时', cells: mets.map(function(m) { return { v: m.zh, d: '' }; }) },
                { k: '差额', cells: mets.map(function(m) { return { v: m.diff, d: m.d }; }) },
                { k: '百分比', cells: mets.map(function(m) { return { v: m.pct, d: m.d }; }) }
            ]
        };
    }

    function getJiaozhanOupeiOutcomeNum(o, key) {
        if (!o || typeof o !== 'object') return NaN;
        return parseJiaozhanOddsNumber(o[key]);
    }

    function ensureJiaozhanOupeiTipEl() {
        let tip = document.getElementById(JZ_OUPEI_TIP_ID);
        if (tip) return tip;
        tip = document.createElement('div');
        tip.id = JZ_OUPEI_TIP_ID;
        tip.setAttribute('role', 'tooltip');
        document.body.appendChild(tip);
        return tip;
    }

    function hideJiaozhanOupeiTip() {
        const tip = document.getElementById(JZ_OUPEI_TIP_ID);
        if (!tip) return;
        tip.style.display = 'none';
        tip.textContent = '';
    }

    function positionJiaozhanOupeiTip(tip, anchorEl) {
        const rect = anchorEl.getBoundingClientRect();
        const pad = 8;
        tip.style.display = 'block';
        tip.style.left = '0px';
        tip.style.top = '0px';
        const tw = tip.offsetWidth || 260;
        const th = tip.offsetHeight || 110;
        let left = rect.left + rect.width / 2 - tw / 2;
        let top = rect.top - th - pad;
        if (top < pad) top = rect.bottom + pad;
        if (left < pad) left = pad;
        if (left + tw > window.innerWidth - pad) left = window.innerWidth - tw - pad;
        if (top + th > window.innerHeight - pad) {
            top = Math.max(pad, window.innerHeight - th - pad);
        }
        tip.style.left = Math.round(left) + 'px';
        tip.style.top = Math.round(top) + 'px';
    }

    function showJiaozhanOupeiTip(anchorEl, tableData) {
        if (!anchorEl || !tableData || !tableData.headers || !tableData.metrics) return;
        injectJiaozhanOupeiStyle();
        const tip = ensureJiaozhanOupeiTipEl();
        tip.textContent = '';
        const table = document.createElement('table');
        table.className = 'tm500-jz-op-tip-table';
        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        const corner = document.createElement('th');
        corner.textContent = '';
        hr.appendChild(corner);
        let i;
        for (i = 0; i < tableData.headers.length; i++) {
            const th = document.createElement('th');
            th.textContent = tableData.headers[i];
            hr.appendChild(th);
        }
        thead.appendChild(hr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        let r;
        for (r = 0; r < tableData.metrics.length; r++) {
            const metric = tableData.metrics[r];
            const tr = document.createElement('tr');
            const lab = document.createElement('td');
            lab.textContent = metric.k;
            tr.appendChild(lab);
            const cells = metric.cells || [];
            for (i = 0; i < cells.length; i++) {
                const td = document.createElement('td');
                const c = cells[i] || {};
                td.textContent = c.v == null ? '-' : String(c.v);
                if (c.d === 'up') td.className = 'up';
                else if (c.d === 'down') td.className = 'down';
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        tip.appendChild(table);
        positionJiaozhanOupeiTip(tip, anchorEl);
    }

    function bindJiaozhanOupeiTipOnce() {
        if (document.documentElement.dataset.tm500JzOpTipBound === '1') return;
        document.documentElement.dataset.tm500JzOpTipBound = '1';
        document.addEventListener('mouseover', function(ev) {
            const t = ev.target;
            if (!t || !t.closest) return;
            const cell = t.closest('td.tm500-jz-op-cell');
            if (!cell || !cell.closest('#team_jiaozhan')) return;
            const raw = cell.getAttribute('data-tm500-jz-op-tip');
            if (!raw) return;
            let tableData;
            try {
                tableData = JSON.parse(raw);
            } catch (e0) {
                return;
            }
            if (!tableData || !tableData.headers || !tableData.metrics) return;
            showJiaozhanOupeiTip(cell, tableData);
        }, true);
        document.addEventListener('mouseout', function(ev) {
            const t = ev.target;
            if (!t || !t.closest) return;
            const cell = t.closest('td.tm500-jz-op-cell');
            if (!cell || !cell.closest('#team_jiaozhan')) return;
            const rel = ev.relatedTarget;
            if (rel && (cell === rel || cell.contains(rel))) return;
            hideJiaozhanOupeiTip();
        }, true);
        window.addEventListener('scroll', hideJiaozhanOupeiTip, true);
        window.addEventListener('resize', hideJiaozhanOupeiTip);
    }

    /**
     * 欧赔列显示实时(终盘)；相对初盘：升红↑、降绿↓。
     * 背景仅标在「比分」对应的 1X2 项：主队进球>客→主胜，相等→平，主<客→客胜。
     * （不用赛果列：赛果是关注队视角，会与欧赔主客相反。）
     * 悬停表格：行=初盘/实时/差额/百分比（各一次），列=胜/平/负
     */
    function parseJiaozhanDzScoreToOupeiKey(tr) {
        if (!tr) return '';
        const dz = tr.querySelector('td.dz em') || tr.querySelector('td.dz');
        if (!dz) return '';
        const raw = (dz.textContent || '').replace(/\s+/g, '');
        const m = raw.match(/(\d+)\s*[:：\-]\s*(\d+)/);
        if (!m) return '';
        const hg = parseInt(m[1], 10);
        const ag = parseInt(m[2], 10);
        if (!isFinite(hg) || !isFinite(ag)) return '';
        if (hg > ag) return 'WIN';
        if (hg < ag) return 'LOST';
        return 'DRAW';
    }

    function resolveJiaozhanOupeiResultKey(oTd) {
        if (!oTd) return '';
        const tr = oTd.closest ? oTd.closest('tr') : null;
        return parseJiaozhanDzScoreToOupeiKey(tr);
    }

    function renderJiaozhanOupeiCellWithChg(oTd, chuObj, zhObj) {
        if (!oTd) return;
        const keys = ['WIN', 'DRAW', 'LOST'];
        const EPS = 0.0005;
        const zhTxt = formatJiaozhanOupeiAjaxText(zhObj);
        const chuTxt = formatJiaozhanOupeiAjaxText(chuObj);
        const displayTxt = zhTxt || chuTxt;
        const resultKey = resolveJiaozhanOupeiResultKey(oTd);
        const normKey = (displayTxt || '-') + '|' + (chuTxt || '') + '|' + (zhTxt || '') + '|sc:' + resultKey;
        if (oTd.getAttribute('data-tm500-jz-cell-val') === normKey) return;
        oTd.setAttribute('data-tm500-jz-cell-val', normKey);
        oTd.classList.add('tm500-jz-op-cell');
        oTd.textContent = '';
        oTd.removeAttribute('title');
        if (!displayTxt) {
            oTd.removeAttribute('data-tm500-jz-op-tip');
            oTd.textContent = '-';
            return;
        }
        const tipTable = buildJiaozhanOupeiTipTable(chuObj, zhObj);
        if (tipTable) {
            oTd.setAttribute('data-tm500-jz-op-tip', JSON.stringify(tipTable));
        } else {
            oTd.removeAttribute('data-tm500-jz-op-tip');
        }
        let i;
        for (i = 0; i < keys.length; i++) {
            const chuN = getJiaozhanOupeiOutcomeNum(chuObj, keys[i]);
            const zhN = getJiaozhanOupeiOutcomeNum(zhObj, keys[i]);
            const showN = isFinite(zhN) ? zhN : chuN;
            if (!isFinite(showN)) continue;
            if (oTd.childNodes.length) oTd.appendChild(document.createTextNode(' '));
            const sp = document.createElement('span');
            sp.className = 'tm500-jz-op-odds';
            sp.textContent = showN.toFixed(2);
            if (isFinite(chuN) && isFinite(zhN)) {
                const diff = zhN - chuN;
                const isResult = resultKey && keys[i] === resultKey;
                if (diff > EPS) {
                    sp.classList.add('tm500-jz-op-odds-up');
                    if (isResult) sp.classList.add('tm500-jz-op-odds-bg-up');
                    const arr = document.createElement('span');
                    arr.className = 'tm500-jz-op-arr';
                    arr.textContent = '↑';
                    sp.appendChild(arr);
                } else if (diff < -EPS) {
                    sp.classList.add('tm500-jz-op-odds-down');
                    if (isResult) sp.classList.add('tm500-jz-op-odds-bg-down');
                    const arr = document.createElement('span');
                    arr.className = 'tm500-jz-op-arr';
                    arr.textContent = '↓';
                    sp.appendChild(arr);
                }
            }
            oTd.appendChild(sp);
        }
    }

    function renderJiaozhanOupeiCell(oTd, txt) {
        renderJiaozhanOupeiCellWithChg(oTd, null, {
            WIN: (txt || '').split(/\s+/)[0] || '',
            DRAW: (txt || '').split(/\s+/)[1] || '',
            LOST: (txt || '').split(/\s+/)[2] || ''
        });
    }

    function applyJiaozhanOupeiFromAjaxPayload(table, cols, pairs, chuMap, zhongMap) {
        if (cols.oupei < 0) return 0;
        chuMap = chuMap || {};
        zhongMap = zhongMap || {};
        let filled = 0;
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.oupei) return;
            const chu = chuMap[p.fid];
            const zh = zhongMap[p.fid];
            if (!formatJiaozhanOupeiAjaxText(chu) && !formatJiaozhanOupeiAjaxText(zh)) return;
            const oTd = tds[cols.oupei];
            renderJiaozhanOupeiCellWithChg(oTd, chu, zh);
            oTd.setAttribute('data-tm500-jz-op-cp', '1');
            filled++;
        });
        return filled;
    }

    function extractJiaozhanOupeiFromNativeTd(td) {
        if (!td) return '';
        const spans = td.querySelectorAll('.pub_table_pl span, p.pub_table_pl span');
        if (spans.length >= 3) {
            const w = formatJiaozhanOddsTwoDecimals((spans[0].textContent || '').trim());
            const d = formatJiaozhanOddsTwoDecimals((spans[1].textContent || '').trim());
            const l = formatJiaozhanOddsTwoDecimals((spans[2].textContent || '').trim());
            if (w || d || l) return [w, d, l].filter(function(x) { return x; }).join(' ');
        }
        const raw = (td.textContent || '').replace(/\s+/g, ' ').trim();
        if (!raw || raw === '-') return '';
        const nums = raw.match(/\d+(?:\.\d+)?/g);
        if (nums && nums.length >= 3) {
            return [
                formatJiaozhanOddsTwoDecimals(nums[0]),
                formatJiaozhanOddsTwoDecimals(nums[1]),
                formatJiaozhanOddsTwoDecimals(nums[2])
            ].join(' ');
        }
        return '';
    }

    function findJiaozhanNativeOupeiColIndex(table) {
        const cols = getJiaozhanYapanBeizhuIndices(table);
        if (cols.oupeiNative >= 0) return cols.oupeiNative;
        const thRow = findJiaozhanHeaderThRow(table);
        if (!thRow) return 5;
        const ths = thRow.querySelectorAll('th');
        let i;
        for (i = 0; i < ths.length; i++) {
            if (ths[i].querySelector('select[name="oupei"]')) return i;
        }
        return 5;
    }

    function fillJiaozhanOupeiFromNativeDom(table, cols, pairs) {
        if (cols.oupei < 0) return;
        const nativeIdx = findJiaozhanNativeOupeiColIndex(table);
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.oupei || tds.length <= nativeIdx) return;
            const oTd = tds[cols.oupei];
            if (oTd.getAttribute('data-tm500-jz-op-cp') === '1') return;
            const txt = extractJiaozhanOupeiFromNativeTd(tds[nativeIdx]);
            if (!txt) return;
            renderJiaozhanOupeiCell(oTd, txt);
            oTd.setAttribute('data-tm500-jz-op-dom', '1');
        });
    }

    function fetchAndApplyJiaozhanOupei(table, cols, pairs, reqId) {
        if (cols.oupei < 0 || !pairs || !pairs.length) return;
        const opSel = table.querySelector('select[name="oupei"][data-t="op"]');
        let opCid = (opSel && opSel.value !== undefined && opSel.value !== null && String(opSel.value).trim() !== '') ?
            String(opSel.value).trim() : '0';
        const origin = location.origin || (location.protocol + '//' + location.host);
        const urlChu = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanOddsAjaxQuery('oupei', opCid, pairs, '1');
        const urlZhong = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanOddsAjaxQuery('oupei', opCid, pairs, '0');

        function parseMap(text) {
            try {
                return sanitizeJiaozhanYapanAjaxMap(JSON.parse((text || '').replace(/^\uFEFF?\s*/, '')));
            } catch (e0) {
                return {};
            }
        }

        jiaozhanRemarkAjaxGet(urlChu, reqId, function(err1, text1) {
            if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
            const chuMap = (!err1 && text1) ? parseMap(text1) : {};
            jiaozhanRemarkAjaxGet(urlZhong, reqId, function(err2, text2) {
                if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
                const zhongMap = (!err2 && text2) ? parseMap(text2) : {};
                const n = applyJiaozhanOupeiFromAjaxPayload(table, cols, pairs, chuMap, zhongMap);
                if (n === 0) fillJiaozhanOupeiFromNativeDom(table, cols, pairs);
            });
        });
    }

    function setJiaozhanSelectValueAndNotify(sel, val) {
        if (!sel) return;
        sel.value = String(val);
        if (typeof window.jQuery === 'function' && window.jQuery.fn) {
            window.jQuery(sel).val(String(val)).trigger('change');
        } else {
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function extractJiaozhanYapanTripleFromTd(yapanTd) {
        if (!yapanTd) return null;
        const left = yapanTd.querySelector('.table_pl_left') ||
            yapanTd.querySelector('.pub_table_pl .table_pl_left');
        const midEl = yapanTd.querySelector('.table_pl_center') ||
            yapanTd.querySelector('.pub_table_pl .table_pl_center');
        const right = yapanTd.querySelector('.table_pl_right') ||
            yapanTd.querySelector('.pub_table_pl .table_pl_right');
        let h = left ? (left.textContent || '').trim() : '';
        let mid = midEl ? (midEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
        let a = right ? (right.textContent || '').trim() : '';
        // 站点本场行常见无 left/right class，仅三个并列 span
        if ((!h || !a) && midEl && midEl.parentNode) {
            const kids = midEl.parentNode.children;
            const spans = [];
            let si;
            for (si = 0; si < kids.length; si++) {
                if (kids[si].tagName === 'SPAN') spans.push(kids[si]);
            }
            if (spans.length >= 3) {
                if (!h) h = (spans[0].textContent || '').trim();
                if (!mid) mid = (spans[1].textContent || '').replace(/\s+/g, ' ').trim();
                if (!a) a = (spans[2].textContent || '').trim();
            }
        }
        if (!h && !mid && !a) {
            const p = yapanTd.querySelector('p.pub_table_pl') || yapanTd.querySelector('.pub_table_pl');
            if (p) {
                const spans = p.querySelectorAll('span');
                if (spans.length >= 3) {
                    h = (spans[0].textContent || '').trim();
                    mid = (spans[1].textContent || '').replace(/\s+/g, ' ').trim();
                    a = (spans[2].textContent || '').trim();
                }
            }
        }
        h = formatJiaozhanOddsTwoDecimals(h);
        a = formatJiaozhanOddsTwoDecimals(a);
        if (!h && !mid && !a) return null;
        return { left: h, mid: mid, right: a };
    }

    function extractJiaozhanChupanYapanText(yapanTd) {
        if (!yapanTd) return '';
        const triple = extractJiaozhanYapanTripleFromTd(yapanTd);
        if (triple && (triple.left || triple.right || triple.mid)) {
            // 有赔率时优先完整「主赔 盘口 客赔」；勿只返回盘名
            if (triple.left || triple.right) {
                const parts = [];
                if (triple.left) parts.push(triple.left);
                if (triple.mid) parts.push(triple.mid);
                if (triple.right) parts.push(triple.right);
                return parts.join(' ');
            }
        }
        const ti = (yapanTd.getAttribute('title') || '').trim();
        if (ti && triple && triple.mid && ti !== triple.mid) return ti + ' ' + triple.mid;
        if (ti) return ti;
        if (triple && triple.mid) return triple.mid;
        const p = yapanTd.querySelector('p.pub_table_pl');
        if (p) {
            const raw = (p.textContent || '').replace(/\s+/g, ' ').trim();
            if (raw && raw !== '-') return raw;
        }
        const all = (yapanTd.textContent || '').replace(/\s+/g, ' ').trim();
        return all && all !== '-' ? all : '';
    }

    let jiaozhanRemarkAjaxReqId = 0;

    function getJiaozhanTrFid(tr) {
        const fidAttr = tr.getAttribute('fid');
        if (fidAttr) return String(fidAttr);
        const link = tr.querySelector('a[href*="shuju-"]');
        if (!link) return '';
        const m = ((link.getAttribute('href') || '') + '').match(/shuju-(\d+)\.shtml/i);
        return m ? m[1] : '';
    }

    function getJiaozhanTrSid(tr) {
        const s = tr.getAttribute('sid');
        if (s !== null && s !== '') return String(s);
        return '5';
    }

    function isJiaozhanIncludeBmatchChecked(root) {
        const scope = root || document.getElementById('team_jiaozhan') || document;
        const cb = scope.querySelector('input[name="bhbc"]');
        if (!cb) return false;
        return !!(cb.checked || cb.getAttribute('checked'));
    }

    function isJiaozhanDataRowVisible(tr) {
        if (!tr) return false;
        const st = tr.getAttribute('style') || '';
        if (/display\s*:\s*none/i.test(st)) return false;
        try {
            if (typeof window.getComputedStyle === 'function' &&
                window.getComputedStyle(tr).display === 'none') return false;
        } catch (eVis) {}
        return true;
    }

    /** 与站点初盘 ajax 一致：fenxi1/inc/ajax.php（fid[]/sid[] 与各行 tr 对应；勾选「包含本场」时强制含 bmatch） */
    function collectJiaozhanRemarkAjaxPairs(table) {
        const out = [];
        const root = document.getElementById('team_jiaozhan');
        const includeBmatch = isJiaozhanIncludeBmatchChecked(root);
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            const isBmatch = tr.classList.contains('bmatch');
            if (isBmatch) {
                if (!includeBmatch && !isJiaozhanDataRowVisible(tr)) return;
            } else if (!isJiaozhanDataRowVisible(tr)) {
                return;
            }
            const fid = getJiaozhanTrFid(tr);
            if (!fid) return;
            out.push({ tr: tr, fid: fid, sid: getJiaozhanTrSid(tr) });
        });
        return out;
    }

    /** 与站点亚盘/欧赔 ajax 一致：t=yapan|oupei；p_t 1=初盘 0=终盘；fid[]/sid[] 各两轮 */
    function buildJiaozhanOddsAjaxQuery(tName, cid, pairs, pT) {
        const t = tName || 'yapan';
        const pt = pT == null || pT === '' ? '1' : String(pT);
        const ts = Date.now();
        const enc = encodeURIComponent;
        const c = enc(String(cid));
        const parts = ['_=' + ts, 't=' + enc(t), 'cid=' + c];
        let rep, i;
        for (rep = 0; rep < 2; rep++) {
            for (i = 0; i < pairs.length; i++) {
                parts.push('fid%5B%5D=' + enc(pairs[i].fid));
            }
        }
        parts.push('p_t=' + enc(pt));
        for (rep = 0; rep < 2; rep++) {
            for (i = 0; i < pairs.length; i++) {
                parts.push('sid%5B%5D=' + enc(pairs[i].sid));
            }
        }
        parts.push('r=1');
        return parts.join('&');
    }

    function buildJiaozhanYapanChupanAjaxQuery(cid, pairs, pT) {
        return buildJiaozhanOddsAjaxQuery('yapan', cid, pairs, pT);
    }

    function sanitizeJiaozhanYapanAjaxMap(raw) {
        if (!raw || typeof raw !== 'object') return {};
        const out = {};
        Object.keys(raw).forEach(function(k) {
            if (/^\d+$/.test(k)) out[k] = raw[k];
        });
        return out;
    }

    const JZ_YP_CHG_STYLE_ID = 'tm500-jz-yp-chg-style-199';

    function injectJiaozhanYapanChgStyle() {
        const legacy191 = document.getElementById('tm500-jz-yp-chg-style-191');
        const legacy197 = document.getElementById('tm500-jz-yp-chg-style-197');
        if (legacy191) legacy191.remove();
        if (legacy197) legacy197.remove();
        if (document.getElementById(JZ_YP_CHG_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = JZ_YP_CHG_STYLE_ID;
        s.textContent =
            '#team_jiaozhan table.pub_table p.pub_table_pl .table_pl_center.tm500-jz-yp-chg-up,' +
            '#team_jiaozhan table.pub_table .pub_table_pl .table_pl_center.tm500-jz-yp-chg-up,' +
            '#team_jiaozhan table.pub_table .table_pl_center.tm500-jz-yp-chg-up{' +
            'display:inline-block!important;margin:0!important;' +
            'padding:0 1px!important;line-height:1.15!important;border-radius:2px;' +
            'box-sizing:border-box!important;' +
            'background:#fde2e4!important;color:#842029!important;font-weight:600;' +
            'border:1px solid #f5b5ba!important;' +
            '}' +
            '#team_jiaozhan table.pub_table p.pub_table_pl .table_pl_center.tm500-jz-yp-chg-down,' +
            '#team_jiaozhan table.pub_table .pub_table_pl .table_pl_center.tm500-jz-yp-chg-down,' +
            '#team_jiaozhan table.pub_table .table_pl_center.tm500-jz-yp-chg-down{' +
            'display:inline-block!important;margin:0!important;' +
            'padding:0 1px!important;line-height:1.15!important;border-radius:2px;' +
            'box-sizing:border-box!important;' +
            'background:#d8f3dc!important;color:#0f5132!important;font-weight:600;' +
            'border:1px solid #b6e6c1!important;' +
            '}';
        document.head.appendChild(s);
    }

    function parseJiaozhanYapanHandicapLineNum(o) {
        if (!o || typeof o !== 'object') return NaN;
        const s = String(o.HANDICAPLINE != null ? o.HANDICAPLINE : '').trim().replace(/,/g, '.');
        if (!s) return NaN;
        const x = parseFloat(s);
        return isFinite(x) ? x : NaN;
    }

    /** 去掉盘名前缀「受让」或单字「受」（500 页面常用「受一球」等） */
    function stripJiaozhanYapanHandicapPrefix(raw) {
        let s = String(raw || '').replace(/\s+/g, '').replace(/／/g, '/');
        if (s.indexOf('受让') === 0) return s.slice(2);
        if (s.charAt(0) === '受') return s.slice(1);
        return s;
    }

    /** 主队是否受让（复制为正数；与站点「受*」展示一致） */
    function isJiaozhanYapanHomeReceiving(nameStr) {
        const name = String(nameStr || '').trim();
        return name.indexOf('受让') === 0 || name.charAt(0) === '受';
    }

    /** 单档盘口文案 → 让球绝对值（球），不含受让符号 */
    function parseJiaozhanYapanOneBallTerm(term) {
        const s = String(term || '').replace(/\s/g, '');
        if (!s) return NaN;
        const defs = [
            ['两球半', 2.5], ['三球半', 3.5], ['四球半', 4.5],
            ['两球', 2], ['三球', 3], ['四球', 4],
            ['球半', 1.5],
            ['半球', 0.5], ['一球', 1],
            ['平手', 0]
        ];
        let i;
        for (i = 0; i < defs.length; i++) {
            if (s === defs[i][0]) return defs[i][1];
        }
        return NaN;
    }

    /**
     * 从 HANDICAPLINENAME 解析可比较的盘口数值（四分之一盘取两档均值，如 平手/半球→0.25，半球/一球→0.75）。
     * 前缀「受让」记为负向档位（与站点常见展示一致，仅用于初终对比）。
     */
    function parseJiaozhanYapanHandicapNameToFloat(nameStr) {
        let raw = String(nameStr || '').replace(/\s+/g, '').replace(/／/g, '/');
        if (!raw) return NaN;
        let sign = 1;
        if (raw.indexOf('受让') === 0) {
            sign = -1;
            raw = raw.slice(2);
        } else if (raw.charAt(0) === '受') {
            sign = -1;
            raw = raw.slice(1);
        }
        if (!raw) return NaN;
        const parts = raw.split('/');
        if (parts.length >= 2) {
            const a = parseJiaozhanYapanOneBallTerm(parts[0]);
            const b = parseJiaozhanYapanOneBallTerm(parts[1]);
            if (isFinite(a) && isFinite(b)) return sign * (a + b) / 2;
            if (isFinite(a)) return sign * a;
            if (isFinite(b)) return sign * b;
            return NaN;
        }
        const single = parseJiaozhanYapanOneBallTerm(raw);
        return isFinite(single) ? sign * single : NaN;
    }

    /** 优先用盘名（四分之一盘），否则用 HANDICAPLINE 数值，供初终盘升降对比 */
    function parseJiaozhanYapanCompareLine(o) {
        if (!o || typeof o !== 'object') return NaN;
        const name = String(o.HANDICAPLINENAME != null ? o.HANDICAPLINENAME : '').trim();
        const byName = parseJiaozhanYapanHandicapNameToFloat(name);
        if (isFinite(byName)) return byName;
        return parseJiaozhanYapanHandicapLineNum(o);
    }

    /** 相对初盘：终盘档位更大视为升盘(浅红)，更小视为降盘(淡绿)；盘名与数值均可参与比较 */
    function applyJiaozhanYapanChgMarks(table, cols, pairs, chuMap, zhongMap) {
        if (!pairs || !pairs.length) return;
        const EPS = 1e-4;
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.yapan) return;
            const yTd = tds[cols.yapan];
            const ctr = yTd.querySelector('p.pub_table_pl .table_pl_center') ||
                yTd.querySelector('.pub_table_pl .table_pl_center') ||
                yTd.querySelector('.table_pl_center');
            if (ctr) {
                ctr.classList.remove('tm500-jz-yp-chg-up', 'tm500-jz-yp-chg-down');
            }
            if (!ctr) return;
            const chu = chuMap && chuMap[p.fid];
            const zh = zhongMap && zhongMap[p.fid];
            const a = parseJiaozhanYapanCompareLine(chu);
            const b = parseJiaozhanYapanCompareLine(zh);
            if (!isFinite(a) || !isFinite(b)) return;
            const diff = b - a;
            if (diff > EPS) ctr.classList.add('tm500-jz-yp-chg-up');
            else if (diff < -EPS) ctr.classList.add('tm500-jz-yp-chg-down');
        });
    }

    /** 读取盘口名（去掉升降箭头） */
    function getJiaozhanPkNameFromTd(td, pkSel) {
        if (!td) return '';
        const pk = td.querySelector(pkSel);
        if (!pk) return '';
        const clone = pk.cloneNode(true);
        const arrs = clone.querySelectorAll('.tm500-jz-ss-pk-arr, .tm500-jz-yp-chg-arr');
        let i;
        for (i = 0; i < arrs.length; i++) arrs[i].remove();
        return (clone.textContent || '').replace(/\s+/g, '').replace(/[↑↓]/g, '').trim();
    }

    function resolveJiaozhanYapanLineForCompare(ajaxObj, td, pkSel) {
        let n = parseJiaozhanYapanCompareLine(ajaxObj);
        if (isFinite(n)) return n;
        const name = getJiaozhanPkNameFromTd(td, pkSel);
        if (name) return parseJiaozhanYapanHandicapNameToFloat(name);
        return NaN;
    }

    function markJiaozhanShishiPkDir(pk, dir) {
        if (!pk) return;
        pk.classList.remove('tm500-jz-ss-pk-up', 'tm500-jz-ss-pk-down');
        const oldArr = pk.querySelector('.tm500-jz-ss-pk-arr');
        if (oldArr) oldArr.remove();
        if (dir !== 'up' && dir !== 'down') return;
        pk.classList.add(dir === 'up' ? 'tm500-jz-ss-pk-up' : 'tm500-jz-ss-pk-down');
        const arr = document.createElement('span');
        arr.className = 'tm500-jz-ss-pk-arr';
        arr.textContent = dir === 'up' ? '↑' : '↓';
        pk.appendChild(arr);
    }

    /**
     * 实时列盘口相对初盘：按「上盘让球绝对值」升降。
     * 升盘（让球加深，如 平手→受* / 半球→一球）→ 浅红↑；
     * 退盘（让球变浅，如 半球→平手/半球）→ 浅蓝↓。
     */
    function applyJiaozhanShishiPkChgMarks(table, cols, pairs, chuMap, zhongMap) {
        if (!pairs || !pairs.length || cols.shishi < 0) return;
        injectJiaozhanShishiStyle();
        const EPS = 1e-4;
        chuMap = chuMap || {};
        zhongMap = zhongMap || {};
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.shishi) return;
            const sTd = tds[cols.shishi];
            const bTd = cols.beizhu >= 0 && tds.length > cols.beizhu ? tds[cols.beizhu] : null;
            const pk = sTd.querySelector('.tm500-jz-ss-pk');
            if (!pk) return;
            const chuName = getJiaozhanPkNameFromTd(bTd, '.tm500-jz-bz-pk');
            const zhName = getJiaozhanPkNameFromTd(sTd, '.tm500-jz-ss-pk');
            let a = chuName ? parseJiaozhanYapanHandicapNameToFloat(chuName) : NaN;
            let b = zhName ? parseJiaozhanYapanHandicapNameToFloat(zhName) : NaN;
            if (!isFinite(a)) a = parseJiaozhanYapanCompareLine(chuMap[p.fid]);
            if (!isFinite(b)) b = parseJiaozhanYapanCompareLine(zhongMap[p.fid]);
            if (!isFinite(a) || !isFinite(b)) {
                markJiaozhanShishiPkDir(pk, '');
                return;
            }
            const absDiff = Math.abs(b) - Math.abs(a);
            if (absDiff > EPS) markJiaozhanShishiPkDir(pk, 'up');
            else if (absDiff < -EPS) markJiaozhanShishiPkDir(pk, 'down');
            else markJiaozhanShishiPkDir(pk, '');
        });
    }

    function jiaozhanYapanFetchChuZhongAndApplyMarks(table, cols, pairs, cid, reqId) {
        injectJiaozhanYapanChgStyle();
        const origin = location.origin || (location.protocol + '//' + location.host);
        const urlChu = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanYapanChupanAjaxQuery(cid, pairs, '1');
        jiaozhanRemarkAjaxGet(urlChu, reqId, function(err1, text1) {
            if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
            let chuMap = {};
            if (!err1 && text1) {
                try {
                    chuMap = sanitizeJiaozhanYapanAjaxMap(JSON.parse((text1 || '').replace(/^\uFEFF?\s*/, '')));
                } catch (e0) {}
            }
            const urlZhong = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanYapanChupanAjaxQuery(cid, pairs, '0');
            jiaozhanRemarkAjaxGet(urlZhong, reqId, function(err2, text2) {
                if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
                let zhongMap = {};
                if (!err2 && text2) {
                    try {
                        zhongMap = sanitizeJiaozhanYapanAjaxMap(JSON.parse((text2 || '').replace(/^\uFEFF?\s*/, '')));
                    } catch (e1) {}
                }
                applyJiaozhanYapanChgMarks(table, cols, pairs, chuMap, zhongMap);
                applyJiaozhanShishiFromAjaxPayload(table, cols, pairs, zhongMap);
                fillMissingJiaozhanShishiFromYapanDom(table, cols, pairs);
                fillMissingJiaozhanRemarkFromZhongMap(table, cols, pairs, zhongMap);
                applyJiaozhanShishiRangqiuOddsChg(table, cols, pairs, chuMap, zhongMap);
                applyJiaozhanShishiPkChgMarks(table, cols, pairs, chuMap, zhongMap);
            });
        });
    }

    function jiaozhanYapanFetchZhongAndApplyMarks(table, cols, pairs, cid, reqId, chuMap) {
        injectJiaozhanYapanChgStyle();
        const origin = location.origin || (location.protocol + '//' + location.host);
        const urlZhong = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanYapanChupanAjaxQuery(cid, pairs, '0');
        jiaozhanRemarkAjaxGet(urlZhong, reqId, function(err2, text2) {
            if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
            let zhongMap = {};
            if (!err2 && text2) {
                try {
                    zhongMap = sanitizeJiaozhanYapanAjaxMap(JSON.parse((text2 || '').replace(/^\uFEFF?\s*/, '')));
                } catch (e2) {}
            }
            applyJiaozhanYapanChgMarks(table, cols, pairs, chuMap || {}, zhongMap);
            applyJiaozhanShishiFromAjaxPayload(table, cols, pairs, zhongMap);
            fillMissingJiaozhanShishiFromYapanDom(table, cols, pairs);
            fillMissingJiaozhanRemarkFromZhongMap(table, cols, pairs, zhongMap);
            applyJiaozhanShishiRangqiuOddsChg(table, cols, pairs, chuMap || {}, zhongMap);
            applyJiaozhanShishiPkChgMarks(table, cols, pairs, chuMap || {}, zhongMap);
        });
    }

    function formatJiaozhanYapanAjaxRemark(o) {
        if (!o || typeof o !== 'object') return '';
        const h = formatJiaozhanOddsTwoDecimals(String(o.HOMEMONEYLINE != null ? o.HOMEMONEYLINE : '').trim());
        const a = formatJiaozhanOddsTwoDecimals(String(o.AWAYMONEYLINE != null ? o.AWAYMONEYLINE : '').trim());
        const line = String(o.HANDICAPLINE != null ? o.HANDICAPLINE : '').trim();
        const name = String(o.HANDICAPLINENAME != null ? o.HANDICAPLINENAME : '').trim();
        let mid = '';
        if (line && name) mid = line + ' ' + name;
        else mid = name || line;
        if (!h && !mid && !a) return '';
        const parts = [];
        if (h) parts.push(h);
        if (mid) parts.push(mid);
        if (a) parts.push(a);
        return parts.join(' ');
    }

    /** 实时列：仅中文盘名，不显示 -1.75 等数值盘口；赔率两位小数 */
    function formatJiaozhanYapanAjaxShishi(o) {
        if (!o || typeof o !== 'object') return '';
        const h = formatJiaozhanOddsTwoDecimals(String(o.HOMEMONEYLINE != null ? o.HOMEMONEYLINE : '').trim());
        const a = formatJiaozhanOddsTwoDecimals(String(o.AWAYMONEYLINE != null ? o.AWAYMONEYLINE : '').trim());
        const name = String(o.HANDICAPLINENAME != null ? o.HANDICAPLINENAME : '').trim();
        if (!h && !name && !a) return '';
        const parts = [];
        if (h) parts.push(h);
        if (name) parts.push(name);
        if (a) parts.push(a);
        return parts.join(' ');
    }

    function stripJiaozhanNumericHandicapFromMid(mid) {
        return String(mid || '')
            .replace(/^-?\d+(?:\.\d+)?\s*/g, '')
            .replace(/\s+-?\d+(?:\.\d+)?/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** 将亚盘 DOM 文本转为实时列展示（去掉数值盘口，保留中文盘名） */
    function sanitizeJiaozhanShishiDisplayText(txt) {
        const t = (txt || '').replace(/\s+/g, ' ').trim();
        if (!t || t === '-') return '';
        const seg = splitJiaozhanRemarkDisplayParts(t);
        if (seg) {
            const midClean = stripJiaozhanNumericHandicapFromMid(seg.mid);
            const parts = [];
            if (seg.left) parts.push(formatJiaozhanOddsTwoDecimals(seg.left));
            if (midClean) parts.push(midClean);
            if (seg.right) parts.push(formatJiaozhanOddsTwoDecimals(seg.right));
            return parts.join(' ');
        }
        const compact = t.match(/^(\d+(?:\.\d+)?)(.+?)(\d+(?:\.\d+)?)$/);
        if (compact && /[\u4e00-\u9fff]/.test(compact[2])) {
            const midClean = stripJiaozhanNumericHandicapFromMid(compact[2]);
            if (midClean) {
                return formatJiaozhanOddsTwoDecimals(compact[1]) + ' ' + midClean + ' ' +
                    formatJiaozhanOddsTwoDecimals(compact[3]);
            }
        }
        return stripJiaozhanNumericHandicapFromMid(t);
    }

    function extractJiaozhanShishiFromYapanTd(yapanTd) {
        if (!yapanTd) return '';
        const triple = extractJiaozhanYapanTripleFromTd(yapanTd);
        if (triple) {
            const mRaw = stripJiaozhanNumericHandicapFromMid(triple.mid || '');
            if (triple.left || mRaw || triple.right) {
                const parts = [];
                if (triple.left) parts.push(triple.left);
                if (mRaw) parts.push(mRaw);
                if (triple.right) parts.push(triple.right);
                return parts.join(' ');
            }
        }
        return sanitizeJiaozhanShishiDisplayText(extractJiaozhanChupanYapanText(yapanTd));
    }

    /** 复制用：正数盘口加 + 前缀（0.25→+0.25），0 与负数不变 */
    function formatJiaozhanHandicapSignedDisplay(val) {
        const s = String(val == null ? '' : val).trim().replace(/,/g, '.');
        if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return s;
        const n = parseFloat(s);
        if (!isFinite(n)) return s;
        if (n > 0) return '+' + s.replace(/^\+/, '');
        return s;
    }

    /** 中文盘名 → 让球绝对值（球），不含正负 */
    function parseJiaozhanYapanHandicapMagnitude(nameStr) {
        let raw = stripJiaozhanYapanHandicapPrefix(nameStr);
        if (!raw) return NaN;
        const parts = raw.split('/');
        if (parts.length >= 2) {
            const a = parseJiaozhanYapanOneBallTerm(parts[0]);
            const b = parseJiaozhanYapanOneBallTerm(parts[1]);
            if (isFinite(a) && isFinite(b)) return (a + b) / 2;
            if (isFinite(a)) return a;
            if (isFinite(b)) return b;
            return NaN;
        }
        const single = parseJiaozhanYapanOneBallTerm(raw);
        return isFinite(single) ? single : NaN;
    }

    /**
     * 复制用盘口符号（主队视角）：无「受/受让」= 主队让球 → 负；有「受/受让」= 主队受让 → 正。
     * 有名时以盘名为准（API 的 HANDICAPLINE 可能只有绝对值如 2.25）。
     */
    function formatJiaozhanYapanHandicapNum(o) {
        if (!o || typeof o !== 'object') return '';
        const name = String(o.HANDICAPLINENAME != null ? o.HANDICAPLINENAME : '').trim();
        const lineNum = parseJiaozhanYapanHandicapLineNum(o);
        const isShouRang = isJiaozhanYapanHomeReceiving(name);

        if (name) {
            const mag = parseJiaozhanYapanHandicapMagnitude(name);
            if (isFinite(mag)) {
                if (mag === 0) return '0';
                const signed = isShouRang ? mag : -mag;
                return formatJiaozhanHandicapSignedDisplay(String(signed));
            }
        }

        if (isFinite(lineNum)) {
            if (lineNum === 0) return '0';
            return formatJiaozhanHandicapSignedDisplay(String(lineNum));
        }

        return '';
    }

    function formatJiaozhanYapanCopyLine(o) {
        if (!o || typeof o !== 'object') return '';
        const h = String(o.HOMEMONEYLINE != null ? o.HOMEMONEYLINE : '').trim();
        const a = String(o.AWAYMONEYLINE != null ? o.AWAYMONEYLINE : '').trim();
        const mid = formatJiaozhanYapanHandicapNum(o);
        if (!h && !mid && !a) return '';
        const parts = [];
        if (h) parts.push(h);
        if (mid) parts.push(mid);
        if (a) parts.push(a);
        return parts.join(' ');
    }

    function normalizeJiaozhanHandicapMidForCopy(midText, td, homeOdds, awayOdds) {
        let m = (midText || '').trim();
        if (!m && td) {
            const ti = (td.getAttribute('title') || '').trim();
            if (/^-?\d+(\.\d+)?$/.test(ti)) return formatJiaozhanHandicapSignedDisplay(ti);
            const ctr = td.querySelector('.table_pl_center');
            if (ctr) {
                const ct = (ctr.getAttribute('title') || '').trim();
                if (/^-?\d+(\.\d+)?$/.test(ct)) return formatJiaozhanHandicapSignedDisplay(ct);
            }
        }
        if (/^-?\d+(\.\d+)?$/.test(m)) return formatJiaozhanHandicapSignedDisplay(m);
        const numLead = m.match(/^(-?\d+(?:\.\d+)?)(?:\s|$)/);
        if (numLead) return formatJiaozhanHandicapSignedDisplay(numLead[1]);
        if (/[\u4e00-\u9fff]/.test(m)) {
            return formatJiaozhanYapanHandicapNum({ HANDICAPLINENAME: m });
        }
        return m;
    }

    function buildJiaozhanYapanCopyTriple(h, midRaw, a, td) {
        const mid = normalizeJiaozhanHandicapMidForCopy(midRaw, td, h, a);
        const parts = [];
        if (h) parts.push(h);
        if (mid) parts.push(mid);
        if (a) parts.push(a);
        return parts.join(' ');
    }

    function parseJiaozhanYapanCopyLineText(txt, td) {
        const t = (txt || '').replace(/\s+/g, ' ').trim();
        if (!t || t === '-') return '';
        const parts = t.split(' ');
        const decs = [];
        const cn = [];
        let i;
        for (i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (/^-?\d+(\.\d+)?$/.test(p)) decs.push(p);
            else if (p && /[\u4e00-\u9fff]/.test(p)) cn.push(p);
        }
        if (decs.length >= 3) {
            return decs[0] + ' ' + formatJiaozhanHandicapSignedDisplay(decs[1]) + ' ' + decs[2];
        }
        if (decs.length === 2) {
            const midRaw = cn.length ? cn.join('') : '';
            return buildJiaozhanYapanCopyTriple(decs[0], midRaw, decs[1], td);
        }
        const seg = splitJiaozhanRemarkDisplayParts(t);
        if (seg) return buildJiaozhanYapanCopyTriple(seg.left, seg.mid, seg.right, td);
        return t;
    }

    /** 从亚盘/备注单元格提取「主赔 数值盘口 客赔」 */
    function extractJiaozhanYapanCopyFromTd(td) {
        if (!td) return '';
        const left = td.querySelector('.table_pl_left') ||
            td.querySelector('.pub_table_pl .table_pl_left');
        const mid = td.querySelector('.table_pl_center') ||
            td.querySelector('.pub_table_pl .table_pl_center');
        const right = td.querySelector('.table_pl_right') ||
            td.querySelector('.pub_table_pl .table_pl_right');
        const h = left ? (left.textContent || '').trim() : '';
        const mRaw = mid ? (mid.textContent || '').trim() : '';
        const a = right ? (right.textContent || '').trim() : '';
        if (h || mRaw || a) {
            const built = buildJiaozhanYapanCopyTriple(h, mRaw, a, td);
            if (built) return built;
        }
        const oddsEls = td.querySelectorAll('.tm500-jz-bz-odds');
        const pk = td.querySelector('.tm500-jz-bz-pk');
        if (pk || oddsEls.length) {
            const hl = oddsEls[0] ? (oddsEls[0].textContent || '').trim() : '';
            const pkT = pk ? (pk.textContent || '').trim() : '';
            const ar = oddsEls.length > 1 ? (oddsEls[oddsEls.length - 1].textContent || '').trim() : '';
            return buildJiaozhanYapanCopyTriple(hl, pkT, ar, td);
        }
        const p = td.querySelector('p.pub_table_pl');
        if (p) {
            const raw = (p.textContent || '').replace(/\s+/g, ' ').trim();
            if (raw && raw !== '-') return parseJiaozhanYapanCopyLineText(raw, td);
        }
        return parseJiaozhanYapanCopyLineText(extractJiaozhanChupanYapanText(td), td);
    }

    /** 第 0 列为赛事，第 1 列为比赛日期；比分取「主队 比分 客队」列的全场比分，排除半场列 */
    function extractJiaozhanRowDateScore(tr) {
        const tds = tr.querySelectorAll('td');
        let league = '';
        let date = '';
        let score = '';
        let i, t, dm, best;

        if (tds.length > 0) {
            league = (tds[0].textContent || '').replace(/\s+/g, ' ').trim();
        }

        for (i = 0; i < tds.length; i++) {
            t = (tds[i].textContent || '').replace(/\s+/g, ' ').trim();
            dm = t.match(/(\d{4}-\d{1,2}-\d{1,2})/);
            if (dm) {
                date = dm[1];
                break;
            }
        }

        best = null;
        for (i = 0; i < tds.length; i++) {
            t = (tds[i].textContent || '').replace(/\s+/g, ' ').trim();
            if (/^\d+\s*[:：]\s*\d+\s*[胜平负]\s*$/.test(t)) continue;
            dm = t.match(/(\d+)\s*[:：]\s*(\d+)/);
            if (!dm) continue;
            const sc = dm[1] + ':' + dm[2];
            const weight = t.length;
            if (!best || weight > best.weight) {
                best = { score: sc, weight: weight };
            }
        }
        if (best) score = best.score;

        return { league: league, date: date, score: score };
    }

    function jiaozhanRemarkAjaxReqActive(reqId) {
        return reqId < 0 || reqId === jiaozhanRemarkAjaxReqId;
    }

    function copyTextToClipboard(text, onDone) {
        function finish(ok) {
            if (onDone) onDone(!!ok);
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(function() {
                finish(true);
            }, function() {
                legacyCopy();
            });
            return;
        }
        legacyCopy();
        function legacyCopy() {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', '');
                ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
                document.body.appendChild(ta);
                ta.select();
                ta.setSelectionRange(0, text.length);
                const ok = document.execCommand('copy');
                ta.remove();
                finish(ok);
            } catch (e0) {
                finish(false);
            }
        }
    }

    function flashJiaozhanCopyBtn(btn, ok) {
        if (!btn) return;
        const orig = btn.dataset.tm500CopyLabel || btn.textContent;
        if (!btn.dataset.tm500CopyLabel) btn.dataset.tm500CopyLabel = orig;
        btn.textContent = ok ? '已复制' : '复制失败';
        window.setTimeout(function() {
            btn.textContent = orig;
            btn.disabled = false;
        }, 1400);
    }

    function fetchJiaozhanYapanMapsForCopy(pairs, cid, onDone) {
        const origin = location.origin || (location.protocol + '//' + location.host);
        const urlChu = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanYapanChupanAjaxQuery(cid, pairs, '1');
        jiaozhanRemarkAjaxGet(urlChu, -1, function(err1, text1) {
            let chuMap = {};
            if (!err1 && text1) {
                try {
                    chuMap = sanitizeJiaozhanYapanAjaxMap(JSON.parse((text1 || '').replace(/^\uFEFF?\s*/, '')));
                } catch (eCp1) {}
            }
            const urlZhong = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanYapanChupanAjaxQuery(cid, pairs, '0');
            jiaozhanRemarkAjaxGet(urlZhong, -1, function(err2, text2) {
                let zhongMap = {};
                if (!err2 && text2) {
                    try {
                        zhongMap = sanitizeJiaozhanYapanAjaxMap(JSON.parse((text2 || '').replace(/^\uFEFF?\s*/, '')));
                    } catch (eCp2) {}
                }
                const needYazhi = pairs.filter(function(p) {
                    return !formatJiaozhanYapanCopyLine(chuMap[p.fid]);
                });
                if (!needYazhi.length) {
                    onDone(chuMap, zhongMap);
                    return;
                }
                let pending = needYazhi.length;
                needYazhi.forEach(function(p) {
                    const yUrl = origin + '/fenxi1/inc/yazhiajax.php?fid=' + encodeURIComponent(p.fid) +
                        '&id=' + encodeURIComponent(String(cid || '5')) +
                        '&t=' + Date.now() + '&r=1';
                    jiaozhanRemarkAjaxGet(yUrl, -1, function(errY, textY) {
                        if (!errY && textY) {
                            const obj = parseJiaozhanYazhiAjaxOpeningObj(textY);
                            if (obj) chuMap[p.fid] = obj;
                        }
                        pending--;
                        if (pending <= 0) onDone(chuMap, zhongMap);
                    });
                });
            });
        });
    }

    function buildJiaozhanHandicapCopyText(table, pairs, chuMap, zhongMap) {
        const cols = getJiaozhanYapanBeizhuIndices(table);
        const lines = [];
        pairs.forEach(function(p) {
            const ds = extractJiaozhanRowDateScore(p.tr);
            const chu = chuMap[p.fid];
            const zh = zhongMap[p.fid];
            let chuLine = formatJiaozhanYapanCopyLine(chu);
            let zhongLine = formatJiaozhanYapanCopyLine(zh);
            const tds = p.tr.querySelectorAll('td');
            if (!chuLine && tds.length > cols.beizhu) {
                chuLine = extractJiaozhanYapanCopyFromTd(tds[cols.beizhu]);
            }
            if (!zhongLine && tds.length > cols.yapan) {
                zhongLine = extractJiaozhanYapanCopyFromTd(tds[cols.yapan]);
            }
            lines.push([ds.league, ds.date, ds.score, chuLine, zhongLine].join('|'));
        });
        return lines.join('\n');
    }

    function runCopyJiaozhanHandicap(btn) {
        const root = document.getElementById('team_jiaozhan');
        if (!root) {
            flashJiaozhanCopyBtn(btn, false);
            return;
        }
        const form = document.getElementById('jiaozhan');
        const table = (form && form.querySelector('table.pub_table')) || root.querySelector('table.pub_table');
        if (!table) {
            flashJiaozhanCopyBtn(btn, false);
            return;
        }
        const pairs = collectJiaozhanRemarkAjaxPairs(table);
        if (!pairs.length) {
            flashJiaozhanCopyBtn(btn, false);
            return;
        }
        const yp = table.querySelector('select[name="yapan"][data-t="yp"]');
        let cid = (yp && yp.value !== undefined && yp.value !== null && String(yp.value).trim() !== '') ?
            String(yp.value).trim() : '5';
        if (cid === '0' || cid === '') cid = '5';
        btn.disabled = true;
        const orig = btn.textContent;
        btn.textContent = '读取中…';
        fetchJiaozhanYapanMapsForCopy(pairs, cid, function(chuMap, zhongMap) {
            const text = buildJiaozhanHandicapCopyText(table, pairs, chuMap, zhongMap);
            copyTextToClipboard(text, function(ok) {
                btn.textContent = orig;
                flashJiaozhanCopyBtn(btn, ok);
            });
        });
    }

    function triggerCopyJiaozhanHandicap(btn) {
        // 与主客相同一样：同联主客 ↔ 全联主客，再复制当前可见行
        const mode = getJiaozhanHomeSameMode();
        if (mode === 'league') setJiaozhanHomeSameMode('all');
        else if (mode === 'all') setJiaozhanHomeSameMode('league');
        else setJiaozhanHomeSameMode('league');

        const li2 = findJiaozhanHomeFilterLi('2');
        if (li2 && typeof window.getJiaozhan === 'function') {
            window.getJiaozhan(li2, 'home_jz');
            syncJiaozhanHomeSameButtonLabel();
            updateJiaozhanQuickButtonsActive();
            scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav();
            window.setTimeout(function() {
                runCopyJiaozhanHandicap(btn);
            }, 1200);
            return;
        }
        runCopyJiaozhanHandicap(btn);
    }

    function applyJiaozhanRemarkFromAjaxPayload(table, cols, pairs, data) {
        if (!data || typeof data !== 'object') return;
        let filled = 0;
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.beizhu) return;
            const txt = formatJiaozhanYapanAjaxRemark(data[p.fid]);
            if (!txt) return;
            const bTd = tds[cols.beizhu];
            renderJiaozhanBeizhuCell(bTd, txt);
            bTd.setAttribute('data-tm500-jz-bz-cp', '1');
            filled++;
        });
        return filled;
    }

    function isJiaozhanBeizhuCellFilled(bTd) {
        if (!bTd) return false;
        const t = (bTd.getAttribute('data-tm500-jz-cell-val') || bTd.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!t || t === '-') return false;
        // 仅有盘名、无主客赔率数字 → 视为未填全（本场旧 DOM 兜底会踩中）
        if (!/\d+(?:\.\d+)?/.test(t)) return false;
        return true;
    }

    /** 初盘仍缺赔率时，用终盘 AJAX 数据补全（本场常见仅有即时盘） */
    function fillMissingJiaozhanRemarkFromZhongMap(table, cols, pairs, zhongMap) {
        if (cols.beizhu < 0 || !zhongMap || !pairs || !pairs.length) return;
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.beizhu) return;
            const bTd = tds[cols.beizhu];
            if (isJiaozhanBeizhuCellFilled(bTd)) return;
            const txt = formatJiaozhanYapanAjaxRemark(zhongMap[p.fid]);
            if (!txt) return;
            renderJiaozhanBeizhuCell(bTd, txt);
            bTd.setAttribute('data-tm500-jz-bz-cp', '1');
            bTd.setAttribute('data-tm500-jz-bz-zhong', '1');
        });
    }

    function collectJiaozhanPairsMissingBeizhu(cols, pairs) {
        const out = [];
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.beizhu) {
                out.push(p);
                return;
            }
            if (!isJiaozhanBeizhuCellFilled(tds[cols.beizhu])) out.push(p);
        });
        return out;
    }

    function stripJiaozhanHtmlText(raw) {
        return String(raw || '')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * yazhiajax 返回盘口变动（新→旧），末条为初盘。
     * 用于 p_t=1 无初盘数据时的备注列兜底。
     */
    function parseJiaozhanYazhiAjaxOpeningObj(text) {
        let arr;
        try {
            arr = JSON.parse((text || '').replace(/^\uFEFF?\s*/, ''));
        } catch (e0) {
            return null;
        }
        if (!Array.isArray(arr) || !arr.length) return null;
        const html = String(arr[arr.length - 1] || '');
        const m = html.match(/<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
        if (!m) return null;
        let h = stripJiaozhanHtmlText(m[1]);
        let name = stripJiaozhanHtmlText(m[2]);
        let a = stripJiaozhanHtmlText(m[3]);
        name = name.replace(/\s*[升降]\s*/g, ' ').replace(/\s+/g, ' ').trim();
        if (h === '-') h = '';
        if (name === '-') name = '';
        if (a === '-') a = '';
        if (!h && !name && !a) return null;
        return {
            HOMEMONEYLINE: h,
            HANDICAPLINE: '',
            AWAYMONEYLINE: a,
            HANDICAPLINENAME: name
        };
    }

    /** 对备注仍空的行，按公司 id 拉 yazhiajax 取末条初盘写入备注 */
    function fillMissingJiaozhanRemarkFromYazhiAjax(table, cols, pairs, cid, reqId, onDone) {
        const missing = collectJiaozhanPairsMissingBeizhu(cols, pairs);
        const extraMap = {};
        if (!missing.length) {
            if (onDone) onDone(extraMap);
            return;
        }
        const origin = location.origin || (location.protocol + '//' + location.host);
        const companyId = String(cid || '5');
        let pending = missing.length;
        let settled = false;
        function finishOne() {
            if (settled) return;
            pending--;
            if (pending > 0) return;
            settled = true;
            if (onDone) onDone(extraMap);
        }
        missing.forEach(function(p) {
            const url = origin + '/fenxi1/inc/yazhiajax.php?fid=' + encodeURIComponent(p.fid) +
                '&id=' + encodeURIComponent(companyId) +
                '&t=' + Date.now() + '&r=1';
            jiaozhanRemarkAjaxGet(url, reqId, function(err, text) {
                if (!jiaozhanRemarkAjaxReqActive(reqId)) {
                    finishOne();
                    return;
                }
                if (!err && text) {
                    const obj = parseJiaozhanYazhiAjaxOpeningObj(text);
                    if (obj) {
                        extraMap[p.fid] = obj;
                        const txt = formatJiaozhanYapanAjaxRemark(obj);
                        if (txt) {
                            const tds = p.tr.querySelectorAll('td');
                            if (tds.length > cols.beizhu) {
                                const bTd = tds[cols.beizhu];
                                renderJiaozhanBeizhuCell(bTd, txt);
                                bTd.setAttribute('data-tm500-jz-bz-cp', '1');
                                bTd.setAttribute('data-tm500-jz-bz-yazhi', '1');
                            }
                        }
                    }
                }
                finishOne();
            });
        });
    }

    function applyJiaozhanShishiFromAjaxPayload(table, cols, pairs, data) {
        if (cols.shishi < 0 || !data || typeof data !== 'object') return 0;
        let filled = 0;
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.shishi) return;
            const txt = formatJiaozhanYapanAjaxShishi(data[p.fid]);
            if (!txt) return;
            const sTd = tds[cols.shishi];
            renderJiaozhanShishiCell(sTd, txt);
            sTd.setAttribute('data-tm500-jz-ss-zp', '1');
            filled++;
        });
        return filled;
    }

    /** 从亚盘列 DOM 填充实时列（仅 AJAX 失败兜底时调用） */
    function fillJiaozhanShishiFromYapanDom(table, cols, pairs) {
        if (cols.shishi < 0) return;
        pairs.forEach(function(p) {
            if (!isJiaozhanDataRowVisible(p.tr) && !p.tr.classList.contains('bmatch')) return;
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.shishi || tds.length <= cols.yapan) return;
            const txt = extractJiaozhanShishiFromYapanTd(tds[cols.yapan]);
            if (!txt) return;
            const sTd = tds[cols.shishi];
            renderJiaozhanShishiCell(sTd, txt);
            sTd.setAttribute('data-tm500-jz-ss-dom', '1');
        });
        applyJiaozhanShishiRangqiuOddsChg(table, cols, pairs, null, null);
    }

    /** 仅补填仍空的实时格（避免其它行已有 AJAX 数据时跳过本场） */
    function fillMissingJiaozhanShishiFromYapanDom(table, cols, pairs) {
        if (cols.shishi < 0 || cols.yapan < 0 || !pairs || !pairs.length) return;
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.shishi || tds.length <= cols.yapan) return;
            const sTd = tds[cols.shishi];
            if (sTd.getAttribute('data-tm500-jz-ss-zp') === '1') return;
            const cur = (sTd.textContent || '').replace(/\s+/g, '').trim();
            if (cur && cur !== '-') return;
            const txt = extractJiaozhanShishiFromYapanTd(tds[cols.yapan]);
            if (!txt) return;
            renderJiaozhanShishiCell(sTd, txt);
            sTd.setAttribute('data-tm500-jz-ss-dom', '1');
        });
    }

    /** 备注仍空时，用当前亚盘列兜底（本场初盘接口常为空） */
    function fillMissingJiaozhanRemarkFromYapanDom(table, cols, pairs) {
        if (cols.beizhu < 0 || cols.yapan < 0 || !pairs || !pairs.length) return;
        pairs.forEach(function(p) {
            const tds = p.tr.querySelectorAll('td');
            if (tds.length <= cols.beizhu) return;
            const bTd = tds[cols.beizhu];
            if (isJiaozhanBeizhuCellFilled(bTd)) return;
            const txt = extractJiaozhanChupanYapanText(tds[cols.yapan]);
            if (!txt || txt === '-') return;
            renderJiaozhanBeizhuCell(bTd, txt);
            bTd.setAttribute('data-tm500-jz-bz-cp', '1');
            bTd.setAttribute('data-tm500-jz-bz-dom', '1');
        });
    }

    function fillJiaozhanShishiFromZhongpanDomFallback(root, table, pk, cols, done, reqId) {
        if (cols.shishi < 0) {
            if (done) done();
            return;
        }
        const prev = String(pk.value);
        const needSwitch = prev !== '0';
        if (needSwitch) document.documentElement.dataset.tm500JzJzZpBusy = '1';

        function applyRows() {
            const pairs = collectJiaozhanRemarkAjaxPairs(table);
            fillJiaozhanShishiFromYapanDom(table, cols, pairs);
        }

        function finish() {
            if (needSwitch) document.documentElement.dataset.tm500JzJzZpBusy = '';
            flushJiaozhanNeedRefillAfterBusy();
            if (done) done();
        }

        try {
            if (needSwitch) {
                setJiaozhanSelectValueAndNotify(pk, '0');
                window.setTimeout(function() {
                    if (!jiaozhanRemarkAjaxReqActive(reqId)) {
                        setJiaozhanSelectValueAndNotify(pk, prev);
                        finish();
                        return;
                    }
                    try {
                        applyRows();
                    } finally {
                        setJiaozhanSelectValueAndNotify(pk, prev);
                        finish();
                    }
                }, 620);
            } else {
                try {
                    if (jiaozhanRemarkAjaxReqActive(reqId)) applyRows();
                } finally {
                    finish();
                }
            }
        } catch (eZp) {
            if (needSwitch) setJiaozhanSelectValueAndNotify(pk, prev);
            finish();
        }
    }

    function fillJiaozhanRemarkFromChupanYapanDomFallback(root, table, pk, cols, done, reqId) {
        const prev = String(pk.value);
        const needSwitch = prev !== '1';
        if (needSwitch) document.documentElement.dataset.tm500JzJzCpBusy = '1';

        function applyRows() {
            const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
                return tr.querySelector('td') && !tr.querySelector('th');
            });
            rows.forEach(function(tr) {
                const st = tr.getAttribute('style') || '';
                if (/display\s*:\s*none/i.test(st)) return;
                const tds = tr.querySelectorAll('td');
                if (tds.length <= cols.beizhu) return;
                const yTd = tds[cols.yapan];
                const bTd = tds[cols.beizhu];
                if (bTd.getAttribute('data-tm500-jz-bz-cp') === '1') return;
                const txt = extractJiaozhanChupanYapanText(yTd);
                if (txt) {
                    renderJiaozhanBeizhuCell(bTd, txt);
                    bTd.setAttribute('data-tm500-jz-bz-cp', '1');
                }
            });
        }

        function finish() {
            if (needSwitch) document.documentElement.dataset.tm500JzJzCpBusy = '';
            flushJiaozhanNeedRefillAfterBusy();
            if (done) done();
        }

        try {
            if (needSwitch) {
                setJiaozhanSelectValueAndNotify(pk, '1');
                window.setTimeout(function() {
                    if (!jiaozhanRemarkAjaxReqActive(reqId)) {
                        setJiaozhanSelectValueAndNotify(pk, prev);
                        finish();
                        return;
                    }
                    try {
                        applyRows();
                    } finally {
                        setJiaozhanSelectValueAndNotify(pk, prev);
                        finish();
                    }
                }, 620);
            } else {
                try {
                    if (jiaozhanRemarkAjaxReqActive(reqId)) applyRows();
                } finally {
                    finish();
                }
            }
        } catch (e) {
            if (needSwitch) setJiaozhanSelectValueAndNotify(pk, prev);
            finish();
        }
    }

    /** 初盘 ajax GET：优先 fetch，失败再用 XHR（与站点同源 Cookie） */
    function jiaozhanRemarkAjaxGet(url, reqId, onDone) {
        if (typeof fetch === 'function') {
            fetch(url, {
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json, text/javascript, */*'
                }
            })
                .then(function(res) {
                    if (!res.ok) throw new Error('http');
                    return res.text();
                })
                .then(function(text) {
                    if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
                    onDone(null, text);
                })
                .catch(function() {
                    if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
                    jiaozhanRemarkAjaxGetXhr(url, reqId, onDone);
                });
            return;
        }
        jiaozhanRemarkAjaxGetXhr(url, reqId, onDone);
    }

    function jiaozhanRemarkAjaxGetXhr(url, reqId, onDone) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url, true);
            xhr.withCredentials = true;
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Accept', 'application/json, text/javascript, */*');
            xhr.onreadystatechange = function() {
                if (xhr.readyState !== 4) return;
                if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
                if (xhr.status >= 200 && xhr.status < 300) onDone(null, xhr.responseText || '');
                else onDone(new Error('xhr'), '');
            };
            xhr.send();
        } catch (e2) {
            if (jiaozhanRemarkAjaxReqActive(reqId)) onDone(e2, '');
        }
    }

    function fillJiaozhanRemarkFromChupanYapan() {
        const root = document.getElementById('team_jiaozhan');
        if (!root) return;
        const form = document.getElementById('jiaozhan');
        const table = (form && form.querySelector('table.pub_table')) || root.querySelector('table.pub_table');
        if (!table) return;
        const pk = table.querySelector('select[name="yapan"][data-t="pk"]');
        if (!pk) {
            hideJiaozhanNativeOddsColumns(table);
            return;
        }
        let cols = ensureJiaozhanShishiColumn(table);
        if (cols.yapan < 0 || cols.beizhu < 0) {
            hideJiaozhanNativeOddsColumns(table);
            return;
        }
        injectJiaozhanTableWideStyle();
        relaxJiaozhanPubTableWidths(table);
        injectJiaozhanBeizhuStyle();
        injectJiaozhanShishiStyle();
        injectJiaozhanOupeiStyle();
        tagJiaozhanBeizhuHeaderTh(table, cols);
        widenJiaozhanBeizhuColumnCells(table, cols);
        hideJiaozhanNativeOddsColumns(table);

        const pairs = collectJiaozhanRemarkAjaxPairs(table);
        if (!pairs.length) return;

        const yp = table.querySelector('select[name="yapan"][data-t="yp"]');
        let cid = (yp && yp.value !== undefined && yp.value !== null && String(yp.value).trim() !== '') ? String(yp.value).trim() : '5';
        if (cid === '0' || cid === '') cid = '5';

        const reqId = ++jiaozhanRemarkAjaxReqId;
        const origin = location.origin || (location.protocol + '//' + location.host);
        fetchAndApplyJiaozhanOupei(table, cols, pairs, reqId);
        const url = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanYapanChupanAjaxQuery(cid, pairs, '1');

        function runFallback(chuMapOpt) {
            fillJiaozhanRemarkFromChupanYapanDomFallback(root, table, pk, cols, function() {
                if (chuMapOpt && typeof chuMapOpt === 'object') {
                    const keys = Object.keys(chuMapOpt);
                    if (keys.length) {
                        jiaozhanYapanFetchZhongAndApplyMarks(table, cols, pairs, cid, reqId, chuMapOpt);
                        return;
                    }
                }
                jiaozhanYapanFetchChuZhongAndApplyMarks(table, cols, pairs, cid, reqId);
            }, reqId);
        }

        jiaozhanRemarkAjaxGet(url, reqId, function(err, text) {
            if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
            if (err) {
                runFallback();
                return;
            }
            let data = {};
            try {
                data = JSON.parse((text || '').replace(/^\uFEFF?\s*/, ''));
            } catch (e3) {
                runFallback();
                return;
            }
            const chuMap = sanitizeJiaozhanYapanAjaxMap(data);
            applyJiaozhanRemarkFromAjaxPayload(table, cols, pairs, chuMap);
            fillMissingJiaozhanRemarkFromYazhiAjax(table, cols, pairs, cid, reqId, function(extraChuMap) {
                if (!jiaozhanRemarkAjaxReqActive(reqId)) return;
                if (extraChuMap && typeof extraChuMap === 'object') {
                    Object.keys(extraChuMap).forEach(function(k) {
                        chuMap[k] = extraChuMap[k];
                    });
                }
                fillMissingJiaozhanRemarkFromYapanDom(table, cols, pairs);
                const stillMissing = collectJiaozhanPairsMissingBeizhu(cols, pairs);
                const filledAny = pairs.length > stillMissing.length;
                if (!filledAny) runFallback(chuMap);
                else jiaozhanYapanFetchZhongAndApplyMarks(table, cols, pairs, cid, reqId, chuMap);
            });
        });
    }

    const debounceFillJiaozhanChupanRemark = debounce(fillJiaozhanRemarkFromChupanYapan, 320);

    /** DomFallback 切换初/终盘期间若发生 getJiaozhan 整表替换，MO 会被 busy 挡住；结束后补一次 */
    function markJiaozhanNeedRefillAfterBusy() {
        document.documentElement.dataset.tm500JzNeedRefill = '1';
    }

    function flushJiaozhanNeedRefillAfterBusy() {
        if (document.documentElement.dataset.tm500JzNeedRefill !== '1') return;
        if (document.documentElement.dataset.tm500JzJzCpBusy === '1' ||
            document.documentElement.dataset.tm500JzJzZpBusy === '1') return;
        document.documentElement.dataset.tm500JzNeedRefill = '';
        scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav();
    }

    /** getJiaozhan 整表替换后：重新显示权益列 + 触发站点亚盘/欧指拉取 + 重插欧赔/备注 */
    function refreshJiaozhanAfterTableReplace() {
        const root = document.getElementById('team_jiaozhan');
        if (!root) return;
        try {
            if (window.UsergrowthRights && typeof window.UsergrowthRights.apply === 'function') {
                window.UsergrowthRights.apply(root);
            }
        } catch (eRights) {}
        try {
            if (typeof window.jQuery === 'function') {
                const $ = window.jQuery;
                const op = root.querySelector('select[name="oupei"][data-t="op"]');
                const yp = root.querySelector('select[name="yapan"][data-t="yp"]');
                // 站点 getOddsPL 用固定 td.eq(5/6)；须在插入欧赔列之前或之后均可（我们插在备注侧，不影响 5/6）
                if (op) $(op).trigger('change');
                if (yp) $(yp).trigger('change');
            }
        } catch (ePl) {}
        finalizeJiaozhanHomeSameAfterSameCompetition();
        ensureJiaozhanSaiguoStrip();
        fillJiaozhanRemarkFromChupanYapan();
        const form = document.getElementById('jiaozhan');
        const table = (form && form.querySelector('table.pub_table')) || root.querySelector('table.pub_table');
        if (table) hideJiaozhanNativeOddsColumns(table);
    }

    /** 站点 getJiaozhan 异步替换表格行时，仅靠 Mutation 防抖可能在空表阶段执行或不再触发；与 yapan/pk 下拉一致多拍补拉初盘备注 */
    function scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav() {
        debounceFillJiaozhanChupanRemark();
        window.setTimeout(function() {
            refreshJiaozhanAfterTableReplace();
        }, 280);
        window.setTimeout(function() {
            refreshJiaozhanAfterTableReplace();
        }, 700);
        window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 1200);
    }

    /** 挂钩 getJiaozhan：同联/全联主客都走原生 home=2；同联仅勾本场联赛（避免相同赛事+场次上限滤后只剩极少） */
    function hookJiaozhanTableRefresh() {
        if (document.documentElement.dataset.tm500JzGetHook === '7') return;
        function tryHook() {
            if (typeof window.getJiaozhan !== 'function') return false;
            if (window.getJiaozhan._tm500JzHookVer >= 7) {
                document.documentElement.dataset.tm500JzGetHook = '7';
                return true;
            }
            const orig = window.getJiaozhan;
            window.getJiaozhan = function(li, o) {
                // 作废进行中的备注/盘口请求与 DomFallback，避免写到已卸载的旧表并长期占 busy
                jiaozhanRemarkAjaxReqId++;
                document.documentElement.dataset.tm500JzJzCpBusy = '';
                document.documentElement.dataset.tm500JzJzZpBusy = '';

                if (o === 'home_jz') {
                    const v = getJiaozhanHomeLiVal(li);
                    if (v === '2') {
                        // 快捷按钮已设好 mode；原生下拉点主客相同默认进同联主客
                        if (!getJiaozhanHomeSameMode()) setJiaozhanHomeSameMode('league');
                        if (isJiaozhanHomeSameAllMode()) {
                            restoreJiaozhanAllLeagueCheckboxes();
                            const selfAll = this;
                            const argsAll = arguments;
                            const retAll = orig.apply(selfAll, argsAll);
                            scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav();
                            return retAll;
                        }
                        // 同联主客：仍请求 home=2（同主客），但只传本场联赛
                        setJiaozhanHomeSameMode('league');
                        applyJiaozhanSameLeagueCheckboxesOnly();
                        const selfL = this;
                        const argsL = arguments;
                        const retLeague = withJiaozhanLeagueOnlyPostMatchPatch(true, function() {
                            return orig.apply(selfL, argsL);
                        });
                        scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav();
                        return retLeague;
                    }
                    // 相同赛事/全部赛事：退出主客相同模式
                    setJiaozhanHomeSameMode('');
                } else if (isJiaozhanHomeSameLeagueMode()) {
                    // 同联主客下改场次/勾选：保持 home=2 + 仅本场联赛
                    const homeEm = document.getElementById('home_jz');
                    if (homeEm) {
                        homeEm.setAttribute('val', '2');
                        if (window.jQuery) window.jQuery(homeEm).attr('val', '2');
                    }
                    applyJiaozhanSameLeagueCheckboxesOnly();
                    const self2 = this;
                    const args2 = arguments;
                    const ret2 = withJiaozhanLeagueOnlyPostMatchPatch(true, function() {
                        return orig.apply(self2, args2);
                    });
                    scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav();
                    return ret2;
                } else if (isJiaozhanHomeSameAllMode()) {
                    // 全联主客下：保持 home=2，并全勾联赛
                    const homeEm = document.getElementById('home_jz');
                    if (homeEm) {
                        homeEm.setAttribute('val', '2');
                        if (window.jQuery) window.jQuery(homeEm).attr('val', '2');
                    }
                    restoreJiaozhanAllLeagueCheckboxes();
                }

                const ret = orig.apply(this, arguments);
                scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav();
                return ret;
            };
            window.getJiaozhan._tm500JzHookVer = 7;
            window.getJiaozhan._tm500Hooked = true;
            document.documentElement.dataset.tm500JzGetHook = '7';
            return true;
        }
        if (tryHook()) return;
        let n = 0;
        const iv = setInterval(function() {
            n++;
            if (tryHook() || n >= 40) clearInterval(iv);
        }, 250);
    }

    /** 赛果条+盘路条固定在表格区上方（.M_content_t 前），不插入筛选行 .selt，避免改动站点原有布局与序列观感 */
    function placeJiaozhanSaiguoStripHost(root, host) {
        const contentT = root.querySelector('.M_content_t');
        if (contentT && contentT.parentNode === root) {
            if (host.nextSibling !== contentT) root.insertBefore(host, contentT);
            return;
        }
        const mt = root.querySelector('.M_title');
        if (mt && mt.parentNode) {
            const ref = mt.nextSibling;
            if (ref === host) return;
            if (ref) mt.parentNode.insertBefore(host, ref);
            else mt.parentNode.appendChild(host);
            return;
        }
        if (!host.parentNode) root.appendChild(host);
    }

    function ensureJiaozhanSaiguoStrip() {
        if (!isShujuFenxiPage()) return;
        finalizeJiaozhanHomeSameAfterSameCompetition();
        const root = document.getElementById('team_jiaozhan');
        if (!root) return;
        const table = root.querySelector('table.pub_table');
        if (!table) return;
        injectJiaozhanTableWideStyle();
        relaxJiaozhanPubTableWidths(table);
        injectJiaozhanSaiguoStripStyle();
        ensureDzTeamNameTitles(root);
        const series = collectJiaozhanSaiguoSeries(root);
        const panluCounts = collectJiaozhanPanluCounts(root);
        const maxSlot = getJiaozhanStripMaxSlots(series.length);
        const inner = buildJiaozhanSaiguoStripInner(series, maxSlot);

        let host = document.getElementById(JZ_SG_STRIP_HOST_ID);
        if (!host) {
            host = document.createElement('div');
            host.id = JZ_SG_STRIP_HOST_ID;
            const wrap = document.createElement('div');
            wrap.className = 'tm500-jz-jz-charts-wrap';
            const strip = document.createElement('div');
            strip.className = 'tm500-jz-saiguo-strip';
            strip.setAttribute('role', 'img');
            strip.setAttribute('aria-label', '交战历史赛果序，左旧右新');
            const panlu = document.createElement('div');
            panlu.className = 'tm500-jz-panlu-stack';
            panlu.setAttribute('role', 'img');
            wrap.appendChild(strip);
            wrap.appendChild(panlu);
            host.appendChild(wrap);
            placeJiaozhanSaiguoStripHost(root, host);
        } else {
            placeJiaozhanSaiguoStripHost(root, host);
        }
        const parts = normalizeJiaozhanChartsHost(host);
        const bar = parts.strip;
        const panluEl = parts.panlu;
        if (bar && panluEl) {
            bar.textContent = '';
            bar.appendChild(inner);
            renderJiaozhanPanluStack(panluEl, panluCounts);
        }
        debounceFillJiaozhanChupanRemark();
    }

    function isJiaozhanRemarkMoNoise(mutations) {
        let i, m, t, el;
        for (i = 0; i < mutations.length; i++) {
            m = mutations[i];
            t = m.target;
            if (!t || t.nodeType !== 1) continue;
            el = t;
            if (el.classList && (el.classList.contains('tm500-jz-bz-cell') || el.classList.contains('tm500-jz-ss-cell') || el.classList.contains('tm500-jz-op-cell'))) {
                return true;
            }
            if (el.closest && el.closest('.tm500-jz-bz-cell, .tm500-jz-ss-cell, .tm500-jz-op-cell, .tm500-jz-bz-odds, .tm500-jz-ss-odds, .tm500-jz-op-odds, .tm500-jz-bz-pk, .tm500-jz-ss-pk, .tm500-jz-ss-arr, .tm500-jz-op-arr')) {
                return true;
            }
        }
        return false;
    }

    function startJiaozhanChupanRemarkPolling() {
        if (document.documentElement.dataset.tm500JzCpRemark) return;
        document.documentElement.dataset.tm500JzCpRemark = '1';
        const deb = debounce(fillJiaozhanRemarkFromChupanYapan, 360);
        const root = document.getElementById('team_jiaozhan');
        if (root && !root.dataset.tm500JzCpRemarkMo) {
            root.dataset.tm500JzCpRemarkMo = '1';
            new MutationObserver(function(muts) {
                if (document.documentElement.dataset.tm500JzJzCpBusy === '1' ||
                    document.documentElement.dataset.tm500JzJzZpBusy === '1') {
                    markJiaozhanNeedRefillAfterBusy();
                    return;
                }
                if (isJiaozhanRemarkMoNoise(muts)) return;
                deb();
            }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'val', 'class', 'fid', 'sid'] });
        }
        window.addEventListener('load', deb);
        window.addEventListener('load', function() {
            window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 400);
        });
        let n = 0;
        const iv = setInterval(function() {
            deb();
            if (++n >= 24) clearInterval(iv);
        }, 500);
        window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 180);
        function attachJiaozhanRemarkSelectListeners(jzRoot) {
            if (!jzRoot || jzRoot.dataset.tm500JzCpRemarkSelHook) return;
            jzRoot.dataset.tm500JzCpRemarkSelHook = '1';
            jzRoot.addEventListener('change', function(ev) {
                const t = ev.target;
                if (!t || t.tagName !== 'SELECT') return;
                const n = t.name;
                const dt = t.getAttribute('data-t');
                if (n === 'yapan' && dt === 'yp') {
                    debounceFillJiaozhanChupanRemark();
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 320);
                    return;
                }
                if (n === 'yapan' && dt === 'pk') {
                    debounceFillJiaozhanChupanRemark();
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 320);
                    return;
                }
                if (n === 'oupei' && dt === 'op') {
                    debounceFillJiaozhanChupanRemark();
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 260);
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 900);
                }
            }, true);
            jzRoot.addEventListener('click', function(ev) {
                const t = ev.target;
                if (!t) return;
                let cb = null;
                if (t.tagName === 'INPUT' && t.name === 'bhbc') cb = t;
                else if (t.closest) {
                    const wrap = t.closest('span, label');
                    if (wrap) cb = wrap.querySelector('input[name="bhbc"]');
                }
                if (!cb) return;
                window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 100);
                window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 450);
            }, true);
        }
        function ensureJiaozhanRemarkSelectHook() {
            const jz = document.getElementById('team_jiaozhan');
            if (jz) attachJiaozhanRemarkSelectListeners(jz);
        }
        ensureJiaozhanRemarkSelectHook();
        window.setTimeout(ensureJiaozhanRemarkSelectHook, 500);
        window.setTimeout(ensureJiaozhanRemarkSelectHook, 1800);
    }

    function startJiaozhanSaiguoStripPolling() {
        if (document.documentElement.dataset.tm500JzSgStrip) return;
        document.documentElement.dataset.tm500JzSgStrip = '1';
        const deb = debounce(ensureJiaozhanSaiguoStrip, 80);
        const root = document.getElementById('team_jiaozhan');
        if (root && !root.dataset.tm500JzSgStripMo) {
            root.dataset.tm500JzSgStripMo = '1';
            new MutationObserver(deb).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'val'] });
        }
        window.addEventListener('load', deb);
        let tries = 0;
        const maxTries = 90;
        const t = setInterval(function() {
            tries++;
            ensureJiaozhanSaiguoStrip();
            if (tries >= maxTries) clearInterval(t);
        }, 300);
    }

    const ZJ_SL_STYLE_ID = 'tm500-zj-same-league-style-204';

    /** 近期战绩三组：team_zhanji_* / getZhanji + zj0_；team_zhanji1_* / getZhanji1 + zj1_；team_zhanji2_* / getZhanji2 + zj2_（主场/客场块无 limit 下拉） */
    const ZHANJI_SAME_LEAGUE_PANELS = [
        { teamIds: ['team_zhanji_0', 'team_zhanji_1'], zjMid: '0', getFn: 'getZhanji' },
        { teamIds: ['team_zhanji1_0', 'team_zhanji1_1'], zjMid: '1', getFn: 'getZhanji1' },
        { teamIds: ['team_zhanji2_0', 'team_zhanji2_1'], zjMid: '2', getFn: 'getZhanji2' }
    ];

    function injectZhanjiSameLeagueStyle() {
        const legacySl = document.getElementById('tm500-zj-same-league-style');
        if (legacySl) legacySl.remove();
        const legacy171 = document.getElementById('tm500-zj-same-league-style-171');
        if (legacy171) legacy171.remove();
        const legacy172 = document.getElementById('tm500-zj-same-league-style-172');
        if (legacy172) legacy172.remove();
        const legacy173 = document.getElementById('tm500-zj-same-league-style-173');
        if (legacy173) legacy173.remove();
        const legacy180 = document.getElementById('tm500-zj-same-league-style-180');
        if (legacy180) legacy180.remove();
        const legacy201 = document.getElementById('tm500-zj-same-league-style-201');
        if (legacy201) legacy201.remove();
        const legacy202 = document.getElementById('tm500-zj-same-league-style-202');
        if (legacy202) legacy202.remove();
        const legacy203 = document.getElementById('tm500-zj-same-league-style-203');
        if (legacy203) legacy203.remove();
        if (document.getElementById(ZJ_SL_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = ZJ_SL_STYLE_ID;
        s.textContent =
            '#team_zhanji_0 form .M_content_t .selt,' +
            '#team_zhanji_1 form .M_content_t .selt,' +
            '#team_zhanji1_0 form .M_content_t .selt,' +
            '#team_zhanji1_1 form .M_content_t .selt,' +
            '#team_zhanji2_0 form .M_content_t .selt,' +
            '#team_zhanji2_1 form .M_content_t .selt{' +
            'display:flex;align-items:center;flex-wrap:wrap;gap:8px;width:100%;' +
            'justify-content:flex-start;' +
            '}' +
            /* 主客场：展开后赛果条变宽也不把按钮挤到下一行 */
            '#team_zhanji2_0 form .M_content_t .selt,' +
            '#team_zhanji2_1 form .M_content_t .selt{' +
            'flex-wrap:nowrap!important;' +
            '}' +
            '#team_zhanji2_0 .tm500-jz-zhanji-sg-strip,' +
            '#team_zhanji2_1 .tm500-jz-zhanji-sg-strip{' +
            'flex:1 1 auto;min-width:0;overflow:hidden;' +
            '}' +
            '.tm500-zj-sl-right{' +
            'margin-left:auto;margin-right:6px;display:inline-flex;align-items:center;' +
            'gap:4px;flex-shrink:0;flex-wrap:nowrap;' +
            '}' +
            '.tm500-zj-same-league-wrap,' +
            '.tm500-zj2-expand-wrap{' +
            'margin:0;display:inline-flex;justify-content:flex-end;flex-shrink:0;' +
            '}' +
            '.tm500-zj-same-league{' +
            'box-sizing:border-box;min-width:0;width:auto;padding:4px 8px;font-size:12px;line-height:1.35;' +
            'white-space:nowrap;' +
            'cursor:pointer;border:none;border-radius:4px;' +
            'transition:opacity .18s ease,box-shadow .18s ease,filter .18s ease,background .18s ease;' +
            'opacity:.72;filter:saturate(.68) brightness(.98);font-weight:400;' +
            'color:#3d6b4d;' +
            'background:linear-gradient(180deg,#cfe9d8 0%,#b5dcc4 100%);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(0,0,0,.08);' +
            'text-align:center;' +
            '}' +
            '.tm500-zj-same-league:hover:not(.tm500-zj-sl-on){' +
            'background:linear-gradient(180deg,#d8efe2 0%,#c0e4ce 100%);' +
            '}' +
            '.tm500-zj-same-league.tm500-zj-sl-on{' +
            'opacity:1;filter:saturate(1) brightness(1);font-weight:600;' +
            'color:#163a24;' +
            'background:linear-gradient(180deg,#8fd4a8 0%,#5cb87e 100%);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 0 rgba(0,0,0,.08),' +
            '0 4px 14px rgba(34,120,72,.32);' +
            '}' +
            '.tm500-zj-same-league.tm500-zj-sl-on:hover{' +
            'background:linear-gradient(180deg,#9cddb3 0%,#68c48a 100%);' +
            '}' +
            '.tm500-zj2-expand{' +
            'box-sizing:border-box;min-width:0!important;width:auto!important;max-width:none!important;' +
            'padding:2px 5px!important;font-size:11px;line-height:1.2;' +
            'white-space:nowrap;cursor:pointer;border:none;border-radius:3px;' +
            'transition:opacity .18s ease,box-shadow .18s ease,filter .18s ease,background .18s ease;' +
            'opacity:.85;filter:saturate(.8) brightness(1);font-weight:500;' +
            'color:#3a5a78;' +
            'background:linear-gradient(180deg,#d4e8f6 0%,#bddcf0 100%);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(0,0,0,.08);' +
            '}' +
            '.tm500-zj2-expand:hover{' +
            'background:linear-gradient(180deg,#deeff9 0%,#cae4f5 100%);' +
            '}' +
            '.tm500-zj2-expand.tm500-zj2-exp-on{' +
            'opacity:1;filter:saturate(1) brightness(1);font-weight:600;' +
            'color:#142a3d;' +
            'background:linear-gradient(180deg,#9bc5eb 0%,#6ba6d8 100%);' +
            'box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -1px 0 rgba(0,0,0,.08),' +
            '0 2px 8px rgba(48,110,168,.22);' +
            '}' +
            '#team_zhanji2_0:not([data-tm500-zj2-exp="1"]) tr.tm500-zj2-overflow,' +
            '#team_zhanji2_1:not([data-tm500-zj2-exp="1"]) tr.tm500-zj2-overflow,' +
            '#team_zhanji2_0 tr.tm500-zj2-overflow-max,' +
            '#team_zhanji2_1 tr.tm500-zj2-overflow-max{' +
            'display:none!important;' +
            '}';
        document.head.appendChild(s);
    }

    function getZhanjiFixtureLeagueId() {
        const mid = document.getElementById('matchid');
        if (mid) {
            const pv = mid.value;
            if (pv != null && String(pv) !== '') return String(pv);
            const av = mid.getAttribute('value');
            if (av != null && String(av) !== '') return String(av);
        }
        const jzOn = document.querySelector('#jiaozhan input.jz:checked');
        if (jzOn) return String(jzOn.value);
        const jzAny = document.querySelector('#jiaozhan input.jz');
        return jzAny ? String(jzAny.value) : null;
    }

    function restoreAllZhanjiLeagueCheckboxes() {
        ZHANJI_SAME_LEAGUE_PANELS.forEach(function(panel) {
            const fn = window[panel.getFn];
            if (typeof fn !== 'function') return;
            [0, 1].forEach(function(side) {
                const root = document.getElementById(panel.teamIds[side]);
                if (!root) return;
                const boxes = root.querySelectorAll('input.zj' + panel.zjMid + '_' + side);
                if (!boxes.length) return;
                boxes.forEach(function(cb) {
                    cb.checked = true;
                });
                fn(side);
            });
        });
    }

    function applyZhanjiSameLeagueOnly() {
        const lid = getZhanjiFixtureLeagueId();
        if (!lid) return;
        ZHANJI_SAME_LEAGUE_PANELS.forEach(function(panel) {
            const fn = window[panel.getFn];
            if (typeof fn !== 'function') return;
            [0, 1].forEach(function(side) {
                const root = document.getElementById(panel.teamIds[side]);
                if (!root) return;
                const boxes = root.querySelectorAll('input.zj' + panel.zjMid + '_' + side);
                if (!boxes.length) return;
                let hit = false;
                boxes.forEach(function(cb) {
                    if (String(cb.value) === lid) hit = true;
                });
                if (!hit) return;
                boxes.forEach(function(cb) {
                    cb.checked = String(cb.value) === lid;
                });
                fn(side);
            });
        });
    }

    function syncZhanjiSameLeagueButtonsActive() {
        const on = document.documentElement.dataset.tm500ZjSlFilter === '1';
        document.querySelectorAll('.tm500-zj-same-league').forEach(function(btn) {
            if (on) {
                btn.classList.add('tm500-zj-sl-on');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.classList.remove('tm500-zj-sl-on');
                btn.setAttribute('aria-pressed', 'false');
            }
        });
    }

    function toggleZhanjiSameLeagueFilter() {
        const on = document.documentElement.dataset.tm500ZjSlFilter === '1';
        if (on) {
            document.documentElement.dataset.tm500ZjSlFilter = '';
            restoreAllZhanjiLeagueCheckboxes();
        } else {
            if (!getZhanjiFixtureLeagueId()) {
                syncZhanjiSameLeagueButtonsActive();
                return;
            }
            document.documentElement.dataset.tm500ZjSlFilter = '1';
            applyZhanjiSameLeagueOnly();
        }
        syncZhanjiSameLeagueButtonsActive();
    }

    function createZhanjiSameLeagueButtonWrap() {
        const wrap = document.createElement('span');
        wrap.className = 'tm500-zj-same-league-wrap';
        wrap.setAttribute('data-tm500-zj-sl', '1');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tm500-zj-same-league';
        btn.textContent = '同联赛';
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleZhanjiSameLeagueFilter();
        });
        wrap.appendChild(btn);
        return wrap;
    }

    function findZhanjiPubTable(teamRoot) {
        return teamRoot.querySelector('.M_content table.pub_table') || teamRoot.querySelector('table.pub_table');
    }

    function getZhanjiTableSaiguoColumnIndex(table) {
        const trs = table.querySelectorAll('tr');
        let header = null;
        let i;
        for (i = 0; i < trs.length; i++) {
            if (trs[i].querySelector('th')) {
                header = trs[i];
                break;
            }
        }
        if (!header) return 5;
        const ths = header.querySelectorAll('th');
        for (i = 0; i < ths.length; i++) {
            if ((ths[i].textContent || '').indexOf('赛果') !== -1) return i;
        }
        return 5;
    }

    function collectZhanjiSaiguoSeries(teamRoot) {
        const table = findZhanjiPubTable(teamRoot);
        if (!table) return [];
        const idx = getZhanjiTableSaiguoColumnIndex(table);
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        const raw = [];
        rows.forEach(function(tr) {
            if (tr.classList.contains('bmatch')) return;
            if (!isJiaozhanDataRowVisible(tr)) return;
            const tds = tr.querySelectorAll('td');
            if (tds.length <= idx) return;
            const sg = (tds[idx].textContent || '').replace(/\s/g, '');
            if (sg === '-' || sg === '') return;
            if (sg !== '胜' && sg !== '平' && sg !== '负') return;
            raw.push(sg);
        });
        return raw.slice().reverse();
    }

    const ZJ2_COLLAPSE_DEFAULT = 6;
    const ZJ2_COLLAPSE_EXPANDED = 10;

    function getZhanji2DataRows(table) {
        return Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            if (!tr.querySelector('td') || tr.querySelector('th')) return false;
            if (tr.classList.contains('bmatch')) return false;
            if (tr.querySelector('.record_msg')) return false;
            return true;
        });
    }

    /** 仅识别站点联赛筛选的 inline display:none（不含本脚本折叠 class） */
    function isZhanji2RowLeagueHidden(tr) {
        const st = tr.getAttribute('style') || '';
        return /display\s*:\s*none/i.test(st);
    }

    function applyZhanji2OverflowMarks(teamRoot) {
        if (!teamRoot) return;
        const table = findZhanjiPubTable(teamRoot);
        if (!table) return;
        const rows = getZhanji2DataRows(table);
        rows.forEach(function(tr) {
            tr.classList.remove('tm500-zj2-overflow', 'tm500-zj2-overflow-max');
        });
        const candidates = rows.filter(function(tr) {
            return !isZhanji2RowLeagueHidden(tr);
        });
        candidates.forEach(function(tr, i) {
            if (i >= ZJ2_COLLAPSE_EXPANDED) {
                tr.classList.add('tm500-zj2-overflow-max');
            } else if (i >= ZJ2_COLLAPSE_DEFAULT) {
                tr.classList.add('tm500-zj2-overflow');
            }
        });
        return candidates.length;
    }

    function syncZhanji2ExpandButton(teamRoot, candidateCount) {
        if (!teamRoot) return;
        const n = typeof candidateCount === 'number'
            ? candidateCount
            : applyZhanji2OverflowMarks(teamRoot);
        const expanded = teamRoot.getAttribute('data-tm500-zj2-exp') === '1';
        const canExpand = n > ZJ2_COLLAPSE_DEFAULT;
        const label = expanded ? '收起' : '展开';
        const title = expanded
            ? ('收起为近' + ZJ2_COLLAPSE_DEFAULT + '场')
            : ('展开显示近' + ZJ2_COLLAPSE_EXPANDED + '场');
        teamRoot.querySelectorAll('.tm500-zj-sl-right button.tm500-zj2-expand').forEach(function(btn) {
            if (!canExpand) {
                btn.style.display = 'none';
                return;
            }
            btn.style.display = '';
            btn.textContent = label;
            btn.setAttribute('title', title);
            if (expanded) {
                btn.classList.add('tm500-zj2-exp-on');
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.classList.remove('tm500-zj2-exp-on');
                btn.setAttribute('aria-pressed', 'false');
            }
        });
    }

    function toggleZhanji2Expand(teamRoot) {
        const roots = ['team_zhanji2_0', 'team_zhanji2_1'].map(function(tid) {
            return document.getElementById(tid);
        }).filter(Boolean);
        if (!roots.length) return;
        // 以当前点击侧为准；两侧统一切换
        const cur = teamRoot && roots.indexOf(teamRoot) >= 0 ? teamRoot : roots[0];
        const nextOn = cur.getAttribute('data-tm500-zj2-exp') !== '1';
        roots.forEach(function(root) {
            if (nextOn) root.setAttribute('data-tm500-zj2-exp', '1');
            else root.removeAttribute('data-tm500-zj2-exp');
            syncZhanji2ExpandButton(root);
        });
        ensureZhanjiSameLeagueButtons();
    }

    function bindZhanji2ExpandClick(btn) {
        if (!btn || btn.dataset.tm500Zj2ExpBound === '1') return;
        btn.dataset.tm500Zj2ExpBound = '1';
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const root = btn.closest('[id^="team_zhanji2_"]');
            toggleZhanji2Expand(root);
        });
    }

    function createZhanji2ExpandButtonWrap() {
        const wrap = document.createElement('span');
        wrap.className = 'tm500-zj2-expand-wrap';
        wrap.setAttribute('data-tm500-zj2-exp-btn', '1');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tm500-zj2-expand';
        btn.textContent = '展开';
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('title', '展开显示近' + ZJ2_COLLAPSE_EXPANDED + '场');
        bindZhanji2ExpandClick(btn);
        wrap.appendChild(btn);
        return wrap;
    }

    function removeZhanji2ExpandFooters(teamRoot) {
        if (!teamRoot) return;
        teamRoot.querySelectorAll('.tm500-zj2-expand-foot').forEach(function(el) {
            el.remove();
        });
    }

    function ensureZhanji2Collapse(teamRoot) {
        if (!teamRoot || !/^team_zhanji2_/.test(teamRoot.id)) return;
        removeZhanji2ExpandFooters(teamRoot);
        const selt = teamRoot.querySelector('form .M_content_t .selt');
        if (!selt) return;
        const cluster = ensureZhanjiSameLeagueClusterInSelt(selt);
        if (!cluster.querySelector('[data-tm500-zj2-exp-btn="1"]')) {
            cluster.appendChild(createZhanji2ExpandButtonWrap());
        }
        const n = applyZhanji2OverflowMarks(teamRoot);
        syncZhanji2ExpandButton(teamRoot, n);
    }

    function ensureZhanji2CollapseAll() {
        ['team_zhanji2_0', 'team_zhanji2_1'].forEach(function(tid) {
            ensureZhanji2Collapse(document.getElementById(tid));
        });
    }

    const ZJ_WIN_BORDER_STYLE_ID = 'tm500-zj-win-border-style-200';

    function injectZhanjiWinBorderStyle() {
        if (document.getElementById(ZJ_WIN_BORDER_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = ZJ_WIN_BORDER_STYLE_ID;
        s.textContent =
            '.M_box.record table.pub_table td.dz.tm500-zj-win-home{' +
            'box-shadow:inset 3px 0 0 0 #f5a0a0;' +
            '}' +
            '.M_box.record table.pub_table td.dz.tm500-zj-win-away{' +
            'box-shadow:inset -3px 0 0 0 #f5a0a0;' +
            '}';
        document.head.appendChild(s);
    }

    /** 目标队取胜：主场 → 对阵格左边框浅红；客场 → 右边框浅红（覆盖主队主场/近期战绩等） */
    function markZhanjiWinSideBorders(teamRoot) {
        if (!teamRoot) return;
        const table = findZhanjiPubTable(teamRoot);
        if (!table) return;
        injectZhanjiWinBorderStyle();
        const sgIdx = getZhanjiTableSaiguoColumnIndex(table);
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            const dzTd = tr.querySelector('td.dz');
            if (!dzTd) return;
            dzTd.classList.remove('tm500-zj-win-home', 'tm500-zj-win-away');
            if (tr.classList.contains('bmatch')) return;
            const st = tr.getAttribute('style') || '';
            if (/display\s*:\s*none/i.test(st)) return;
            const tds = tr.querySelectorAll('td');
            if (tds.length <= sgIdx) return;
            const sg = (tds[sgIdx].textContent || '').replace(/\s/g, '');
            if (sg !== '胜') return;
            const left = dzTd.querySelector('.dz-l');
            const right = dzTd.querySelector('.dz-r');
            if (left && left.classList.contains('zhu')) {
                dzTd.classList.add('tm500-zj-win-home');
            } else if (right && right.classList.contains('zhu')) {
                dzTd.classList.add('tm500-zj-win-away');
            }
        });
    }

    function ensureZhanjiWinSideBorders() {
        ZHANJI_SAME_LEAGUE_PANELS.forEach(function(panel) {
            panel.teamIds.forEach(function(tid) {
                markZhanjiWinSideBorders(document.getElementById(tid));
            });
        });
    }

    function getZhanjiStripMaxSlots(teamRoot, panel) {
        if (panel.zjMid === '2') {
            const n = collectZhanjiSaiguoSeries(teamRoot).length;
            return Math.min(15, Math.max(n, 1));
        }
        const m = teamRoot.id.match(/_(\d+)$/);
        const side = m ? m[1] : '0';
        const emId = panel.zjMid === '0' ? 'limit_zj_' + side : 'limit_zj1_' + side;
        const em = document.getElementById(emId);
        let v = em ? parseInt(em.getAttribute('val'), 10) : 10;
        if (!v || v < 1) v = 10;
        return Math.min(Math.max(v, 1), 30);
    }

    function ensureZhanjiSameLeagueClusterInSelt(selt) {
        let cluster = selt.querySelector('[data-tm500-zj-sl-cluster="1"]');
        if (cluster) return cluster;
        const legacyWrap = selt.querySelector('.tm500-zj-same-league-wrap[data-tm500-zj-sl="1"]');
        cluster = document.createElement('div');
        cluster.className = 'tm500-zj-sl-right';
        cluster.setAttribute('data-tm500-zj-sl-cluster', '1');
        const strip = document.createElement('div');
        strip.className = 'tm500-jz-saiguo-strip tm500-jz-zhanji-sg-strip';
        strip.setAttribute('role', 'img');
        strip.setAttribute('aria-label', '近期战绩赛果序，左旧右新');
        if (legacyWrap) {
            selt.insertBefore(cluster, legacyWrap);
            cluster.appendChild(strip);
            cluster.appendChild(legacyWrap);
        } else {
            cluster.appendChild(strip);
            cluster.appendChild(createZhanjiSameLeagueButtonWrap());
            selt.appendChild(cluster);
        }
        return cluster;
    }

    /** 主客场(team_zhanji2) 置顶；近期战绩标题+图表/数据模块移到其下 */
    function reorderZhanjiRecordSections() {
        if (!isShujuFenxiPage()) return;
        const zjChart = document.getElementById('team_zhanji_1');
        const zjHome = document.getElementById('team_zhanji2_1');
        if (!zjChart || !zjHome) return;
        const box = zjChart.closest('.M_box.record');
        if (!box || box.getAttribute('data-tm500-zj-reordered') === '1') return;
        const title = box.querySelector('.M_title');
        const chartWrap = zjChart.closest('.odds_zj_tubiao');
        const homeAwayWrap = zjHome.closest('.odds_zj_tubiao');
        if (!title || !chartWrap || !homeAwayWrap || chartWrap === homeAwayWrap) return;
        if (title.parentNode !== box || homeAwayWrap.parentNode !== box) return;
        box.insertBefore(homeAwayWrap, title);
        box.setAttribute('data-tm500-zj-reordered', '1');
    }

    /** 页面就绪后默认开启「同联赛」（等同点击一次） */
    function ensureZhanjiSameLeagueDefaultOn() {
        if (document.documentElement.dataset.tm500ZjSlDefaultDone === '1') return;
        if (!getZhanjiFixtureLeagueId()) return;
        let ready = false;
        ZHANJI_SAME_LEAGUE_PANELS.forEach(function(panel) {
            [0, 1].forEach(function(side) {
                const root = document.getElementById(panel.teamIds[side]);
                if (!root) return;
                if (root.querySelector('input.zj' + panel.zjMid + '_' + side)) ready = true;
            });
        });
        if (!ready) return;
        document.documentElement.dataset.tm500ZjSlDefaultDone = '1';
        document.documentElement.dataset.tm500ZjSlFilter = '1';
        applyZhanjiSameLeagueOnly();
    }

    function ensureZhanjiSameLeagueButtons() {
        if (!isShujuFenxiPage()) return;
        injectJiaozhanSaiguoStripStyle();
        injectZhanjiSameLeagueStyle();
        injectDzTeamNameStyle();
        reorderZhanjiRecordSections();
        ensureZhanji2CollapseAll();
        ZHANJI_SAME_LEAGUE_PANELS.forEach(function(panel) {
            [0, 1].forEach(function(side) {
                const root = document.getElementById(panel.teamIds[side]);
                if (!root) return;
                const selt = root.querySelector('form .M_content_t .selt');
                if (!selt) return;
                const cluster = ensureZhanjiSameLeagueClusterInSelt(selt);
                if (!cluster.querySelector('.tm500-zj-same-league-wrap[data-tm500-zj-sl="1"]')) {
                    cluster.appendChild(createZhanjiSameLeagueButtonWrap());
                }
                const strip = cluster.querySelector('.tm500-jz-zhanji-sg-strip');
                if (!strip) return;
                const series = collectZhanjiSaiguoSeries(root);
                const maxSlot = getZhanjiStripMaxSlots(root, panel);
                const inner = buildJiaozhanSaiguoStripInner(series, maxSlot);
                strip.textContent = '';
                strip.appendChild(inner);
            });
        });
        ensureZhanjiSameLeagueDefaultOn();
        syncZhanjiSameLeagueButtonsActive();
        ensureDzTeamNameTitles(document);
        ensureZhanjiYapanColumns();
        ensureZhanjiWinSideBorders();
        hideAllZhanjiNativePanluDaxiaoColumns();
    }

    /** 近期战绩(team_zhanji_*) + 主场/客场(team_zhanji2_*)：插入脚本亚盘列；隐藏原生盘路/大小/盘口 */
    const ZHANJI_YP_TEAM_IDS = [
        'team_zhanji_0', 'team_zhanji_1',
        'team_zhanji2_0', 'team_zhanji2_1'
    ];
    const ZJ_YP_STYLE_ID = 'tm500-zj-yp-style-208';
    const ZHANJI_YP_ROOT_SEL = ZHANJI_YP_TEAM_IDS.map(function(id) { return '#' + id; }).join(',');

    function injectZhanjiYapanStyle() {
        const legacyIds = [
            'tm500-zj2-yp-style-194',
            'tm500-zj-yp-style-195', 'tm500-zj-yp-style-196', 'tm500-zj-yp-style-197',
            'tm500-zj-yp-style-205', 'tm500-zj-yp-style-206', 'tm500-zj-yp-style-207'
        ];
        legacyIds.forEach(function(id) {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        if (document.getElementById(ZJ_YP_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = ZJ_YP_STYLE_ID;
        s.textContent =
            /* 亚盘列定宽，双表并排不溢出；三列网格对齐 */
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table th.tm500-zj-yp-col,' + r + ' table.pub_table td.tm500-zj-yp-cell';
            }).join(',') + '{' +
            'width:142px!important;min-width:142px!important;max-width:142px!important;' +
            'padding:2px 2px!important;white-space:nowrap!important;word-break:keep-all!important;' +
            'vertical-align:middle;line-height:1.2;font-size:11px;' +
            'box-sizing:border-box!important;overflow:hidden!important;' +
            '}' +
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table td.tm500-zj-yp-cell .tm500-jz-yp-align';
            }).join(',') + '{' +
            'display:grid!important;grid-template-columns:2.3em 6em 2.3em;column-gap:2px;' +
            'align-items:center;white-space:nowrap;vertical-align:middle;' +
            'width:100%!important;max-width:100%!important;box-sizing:border-box;' +
            'overflow:hidden!important;' +
            '}' +
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table td.tm500-zj-yp-cell .tm500-jz-yp-l';
            }).join(',') + '{' +
            'text-align:right;justify-self:stretch;font-variant-numeric:tabular-nums;' +
            'overflow:hidden;min-width:0;' +
            '}' +
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table td.tm500-zj-yp-cell .tm500-jz-yp-m';
            }).join(',') + '{' +
            'text-align:center;justify-self:stretch;overflow:hidden;min-width:0;' +
            '}' +
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table td.tm500-zj-yp-cell .tm500-jz-yp-r';
            }).join(',') + '{' +
            'text-align:left;justify-self:stretch;font-variant-numeric:tabular-nums;' +
            'overflow:hidden;min-width:0;' +
            '}' +
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table td.tm500-zj-yp-cell .tm500-zj-yp-pk';
            }).join(',') + '{' +
            'display:block;margin:0;padding:0;' +
            'font-size:10px!important;line-height:1.2;font-weight:600;' +
            'color:#66bb6a!important;background:transparent;border:none;' +
            'max-width:100%!important;overflow:hidden!important;' +
            'text-overflow:ellipsis!important;white-space:nowrap!important;' +
            '}' +
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table td.tm500-zj-yp-cell .tm500-zj-yp-pk.tm500-jz-pk-shou';
            }).join(',') + '{' +
            'color:#64b5f6!important;' +
            '}' +
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table td.tm500-zj-yp-cell .tm500-zj-yp-odds';
            }).join(',') + '{' +
            'font-size:10px!important;font-weight:600;color:#333;white-space:nowrap!important;' +
            '}' +
            /* 独立「主队/客队」列（非 .dz 结构时）：定宽超长省略，避免挤爆亚盘 */
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table th.tm500-zj-home-col,' +
                    r + ' table.pub_table td.tm500-zj-home-col,' +
                    r + ' table.pub_table th.tm500-zj-away-col,' +
                    r + ' table.pub_table td.tm500-zj-away-col';
            }).join(',') + '{' +
            'width:6.5em!important;min-width:4em!important;max-width:6.5em!important;' +
            'white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;' +
            'box-sizing:border-box!important;' +
            '}' +
            ZHANJI_YP_ROOT_SEL.split(',').map(function(r) {
                return r + ' table.pub_table th.tm500-zj-score-col,' +
                    r + ' table.pub_table td.tm500-zj-score-col';
            }).join(',') + '{' +
            'width:36px!important;min-width:36px!important;max-width:36px!important;' +
            'white-space:nowrap!important;box-sizing:border-box!important;' +
            '}';
        document.head.appendChild(s);
    }

    /** 若表头为独立「主队/比分/客队」列，打标以便定宽省略 */
    function tagZhanjiHomeAwayScoreColumns(table) {
        if (!table) return;
        const trs = table.querySelectorAll('tr');
        let header = null;
        let i;
        for (i = 0; i < trs.length; i++) {
            if (trs[i].querySelector('th')) {
                header = trs[i];
                break;
            }
        }
        if (!header) return;
        const cells = Array.from(header.children).filter(function(el) {
            return el.tagName === 'TH' || el.tagName === 'TD';
        });
        let homeIdx = -1;
        let scoreIdx = -1;
        let awayIdx = -1;
        for (i = 0; i < cells.length; i++) {
            const t = (cells[i].textContent || '').replace(/\s+/g, '');
            if (homeIdx < 0 && t === '主队') homeIdx = i;
            else if (scoreIdx < 0 && t === '比分') scoreIdx = i;
            else if (awayIdx < 0 && t === '客队') awayIdx = i;
        }
        if (homeIdx < 0 && awayIdx < 0) return;
        function tagRow(tr, idx, cls) {
            if (idx < 0) return;
            const rowCells = Array.from(tr.children).filter(function(el) {
                return el.tagName === 'TH' || el.tagName === 'TD';
            });
            if (rowCells[idx]) rowCells[idx].classList.add(cls);
        }
        for (i = 0; i < trs.length; i++) {
            tagRow(trs[i], homeIdx, 'tm500-zj-home-col');
            tagRow(trs[i], scoreIdx, 'tm500-zj-score-col');
            tagRow(trs[i], awayIdx, 'tm500-zj-away-col');
        }
        if (homeIdx >= 0 || awayIdx >= 0) {
            const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
                return tr.querySelector('td') && !tr.querySelector('th');
            });
            rows.forEach(function(tr) {
                const rowCells = Array.from(tr.children).filter(function(el) {
                    return el.tagName === 'TD';
                });
                [homeIdx, awayIdx].forEach(function(idx) {
                    if (idx < 0 || !rowCells[idx]) return;
                    const el = rowCells[idx];
                    const name = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (name) el.setAttribute('title', name);
                });
            });
        }
    }

    function getDefaultYapanCompanyId() {
        const root = document.getElementById('team_jiaozhan');
        const yp = root && (root.querySelector('select[name="yapan"][data-t="yp"]') ||
            root.querySelector('select[name="yapan"]'));
        let cid = (yp && yp.value !== undefined && yp.value !== null && String(yp.value).trim() !== '')
            ? String(yp.value).trim() : '5';
        if (cid === '0' || cid === '') cid = '5';
        return cid;
    }

    function findZhanjiYapanTableHeaderRow(table) {
        const trs = table.querySelectorAll('tr');
        let i;
        for (i = 0; i < trs.length; i++) {
            if (trs[i].querySelector('th')) return trs[i];
        }
        return null;
    }

    function getZhanjiYapanColumnIndex(table) {
        const th = table.querySelector('th.tm500-zj-yp-col, th.tm500-zj2-yp-col');
        if (!th || !th.parentElement) return -1;
        const cells = Array.from(th.parentElement.children).filter(function(el) {
            return el.tagName === 'TH' || el.tagName === 'TD';
        });
        return cells.indexOf(th);
    }

    function insertZhanjiYapanCellAfter(tr, afterIdx, tagName) {
        const cells = Array.from(tr.children).filter(function(el) {
            return el.tagName === 'TH' || el.tagName === 'TD';
        });
        const ref = cells[afterIdx];
        const cell = document.createElement(tagName);
        if (ref && ref.nextSibling) tr.insertBefore(cell, ref.nextSibling);
        else if (ref) tr.appendChild(cell);
        else tr.appendChild(cell);
        return cell;
    }

    /** 近期战绩/主客场表：在「赛果」后插入可见「亚盘」列（脚本列，保留） */
    function ensureZhanjiYapanColumn(table) {
        if (!table) return -1;
        let ypIdx = getZhanjiYapanColumnIndex(table);
        if (ypIdx >= 0) {
            const th = table.querySelector('th.tm500-zj2-yp-col, th.tm500-zj-yp-col');
            if (th) {
                th.classList.remove('tm500-zj2-yp-col');
                th.classList.add('tm500-zj-yp-col');
                th.removeAttribute('width');
            }
            const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
                return tr.querySelector('td') && !tr.querySelector('th');
            });
            rows.forEach(function(tr) {
                const cells = Array.from(tr.children).filter(function(el) {
                    return el.tagName === 'TD';
                });
                if (cells.length > ypIdx &&
                    (cells[ypIdx].classList.contains('tm500-zj-yp-cell') ||
                        cells[ypIdx].classList.contains('tm500-zj2-yp-cell'))) {
                    cells[ypIdx].classList.remove('tm500-zj2-yp-cell');
                    cells[ypIdx].classList.add('tm500-zj-yp-cell');
                    return;
                }
                const sgIdx = Math.max(0, ypIdx - 1);
                const td = insertZhanjiYapanCellAfter(tr, Math.min(sgIdx, cells.length - 1), 'td');
                td.className = 'tm500-zj-yp-cell';
                td.textContent = '-';
            });
            return ypIdx;
        }
        const header = findZhanjiYapanTableHeaderRow(table);
        if (!header) return -1;
        const sgIdx = getZhanjiTableSaiguoColumnIndex(table);
        const th = insertZhanjiYapanCellAfter(header, sgIdx, 'th');
        th.className = 'tm500-zj-yp-col';
        th.removeAttribute('width');
        th.textContent = '亚盘';
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            const td = insertZhanjiYapanCellAfter(tr, sgIdx, 'td');
            td.className = 'tm500-zj-yp-cell';
            td.textContent = '-';
        });
        return getZhanjiYapanColumnIndex(table);
    }

    function collectZhanjiYapanAjaxPairs(table) {
        const out = [];
        const includeBmatch = isJiaozhanIncludeBmatchChecked(document.getElementById('team_jiaozhan'));
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            const isBmatch = tr.classList.contains('bmatch');
            if (isBmatch) {
                if (!includeBmatch && !isJiaozhanDataRowVisible(tr)) return;
            } else if (!isJiaozhanDataRowVisible(tr)) {
                return;
            }
            const fid = getJiaozhanTrFid(tr);
            if (!fid) return;
            out.push({ tr: tr, fid: fid, sid: getJiaozhanTrSid(tr) });
        });
        return out;
    }

    function getZhanjiYapanTd(tr, ypIdx) {
        if (!tr || ypIdx < 0) return null;
        const cells = Array.from(tr.children).filter(function(el) {
            return el.tagName === 'TD';
        });
        if (cells.length <= ypIdx) return null;
        const td = cells[ypIdx];
        if (td.classList.contains('tm500-zj2-yp-cell')) {
            td.classList.remove('tm500-zj2-yp-cell');
            td.classList.add('tm500-zj-yp-cell');
        }
        return td.classList.contains('tm500-zj-yp-cell') ? td : null;
    }

    function renderZhanjiYapanCell(td, txt) {
        renderJiaozhanYapanOddsCell(td, txt, {
            cellClass: 'tm500-zj-yp-cell',
            oddsClass: 'tm500-zj-yp-odds',
            pkClass: 'tm500-zj-yp-pk',
            align: true
        });
    }

    /** 终盘无数据时，用隐藏盘口 td 的 title/文本兜底（无主客赔） */
    function formatZhanjiYapanDomFallback(tr) {
        const hid = tr.querySelector('td[data-user-right="odds"][title]');
        if (!hid) return '';
        const name = (hid.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
        const num = (hid.textContent || '').replace(/\s+/g, ' ').trim();
        if (!name && !num) return '';
        if (name && num && name !== num) return num + ' ' + name;
        return name || num;
    }

    function applyZhanjiYapanFromAjaxMap(table, ypIdx, pairs, dataMap) {
        pairs.forEach(function(p) {
            const td = getZhanjiYapanTd(p.tr, ypIdx);
            if (!td) return;
            let txt = formatJiaozhanYapanAjaxShishi(dataMap[p.fid]);
            if (!txt) txt = formatJiaozhanYapanAjaxRemark(dataMap[p.fid]);
            if (!txt) txt = formatZhanjiYapanDomFallback(p.tr);
            if (!txt) {
                if (!td.getAttribute('data-tm500-jz-cell-val')) td.textContent = '-';
                return;
            }
            renderZhanjiYapanCell(td, txt);
        });
    }

    function zhanjiYapanRowsNeedFill(table, ypIdx, pairs) {
        let i;
        for (i = 0; i < pairs.length; i++) {
            const td = getZhanjiYapanTd(pairs[i].tr, ypIdx);
            if (!td) return true;
            if (!td.getAttribute('data-tm500-jz-cell-val')) return true;
        }
        return false;
    }

    function fillZhanjiYapanColumnForTeam(teamRoot) {
        if (!teamRoot) return;
        const table = findZhanjiPubTable(teamRoot);
        if (!table) return;
        injectZhanjiYapanStyle();
        tagZhanjiHomeAwayScoreColumns(table);
        const ypIdx = ensureZhanjiYapanColumn(table);
        hideZhanjiNativePanluDaxiaoColumns(table);
        if (ypIdx < 0) return;
        const pairs = collectZhanjiYapanAjaxPairs(table);
        if (!pairs.length) return;
        const cid = getDefaultYapanCompanyId();
        const sig = pairs.map(function(p) { return p.fid; }).join(',') + '|' + cid + '|' + pairs.length;
        if (table.getAttribute('data-tm500-zj-yp-sig') === sig &&
            !zhanjiYapanRowsNeedFill(table, ypIdx, pairs)) {
            return;
        }
        if (table.getAttribute('data-tm500-zj-yp-sig') === sig &&
            table.getAttribute('data-tm500-zj-yp-loading') === '1') {
            return;
        }
        table.setAttribute('data-tm500-zj-yp-sig', sig);
        table.setAttribute('data-tm500-zj-yp-loading', '1');
        const myReq = (Number(teamRoot.getAttribute('data-tm500-zj-yp-req')) || 0) + 1;
        teamRoot.setAttribute('data-tm500-zj-yp-req', String(myReq));
        const origin = location.origin || (location.protocol + '//' + location.host);
        const url = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanYapanChupanAjaxQuery(cid, pairs, '0');

        function stillMine() {
            return String(myReq) === teamRoot.getAttribute('data-tm500-zj-yp-req') &&
                table.isConnected;
        }

        function finishLoading() {
            if (stillMine()) table.removeAttribute('data-tm500-zj-yp-loading');
        }

        jiaozhanRemarkAjaxGet(url, -1, function(err, text) {
            if (!stillMine()) return;
            let dataMap = {};
            if (!err && text) {
                try {
                    dataMap = sanitizeJiaozhanYapanAjaxMap(JSON.parse((text || '').replace(/^\uFEFF?\s*/, '')));
                } catch (e0) {}
            }
            applyZhanjiYapanFromAjaxMap(table, ypIdx, pairs, dataMap);
            const missing = pairs.filter(function(p) {
                const td = getZhanjiYapanTd(p.tr, ypIdx);
                return !td || !td.getAttribute('data-tm500-jz-cell-val');
            });
            if (!missing.length) {
                finishLoading();
                return;
            }
            const urlChu = origin + '/fenxi1/inc/ajax.php?' + buildJiaozhanYapanChupanAjaxQuery(cid, missing, '1');
            jiaozhanRemarkAjaxGet(urlChu, -1, function(err2, text2) {
                if (!stillMine()) return;
                let chuMap = {};
                if (!err2 && text2) {
                    try {
                        chuMap = sanitizeJiaozhanYapanAjaxMap(JSON.parse((text2 || '').replace(/^\uFEFF?\s*/, '')));
                    } catch (e1) {}
                }
                applyZhanjiYapanFromAjaxMap(table, ypIdx, missing, chuMap);
                finishLoading();
            });
        });
    }

    function ensureZhanjiYapanColumns() {
        if (!isShujuFenxiPage()) return;
        ZHANJI_YP_TEAM_IDS.forEach(function(tid) {
            fillZhanjiYapanColumnForTeam(document.getElementById(tid));
        });
    }

    // 兼容旧函数名（若外部/热更新残留调用）
    function ensureZhanji2YapanColumns() {
        ensureZhanjiYapanColumns();
    }

    function startZhanjiSameLeaguePolling() {
        if (document.documentElement.dataset.tm500ZjSlInit) return;
        document.documentElement.dataset.tm500ZjSlInit = '1';
        const deb = debounce(ensureZhanjiSameLeagueButtons, 80);

        function tryAttachMo() {
            ZHANJI_SAME_LEAGUE_PANELS.forEach(function(panel) {
                panel.teamIds.forEach(function(tid) {
                    const el = document.getElementById(tid);
                    if (!el || el.dataset.tm500ZjSlMo) return;
                    el.dataset.tm500ZjSlMo = '1';
                    new MutationObserver(deb).observe(el, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['style', 'val']
                    });
                });
            });
        }

        window.addEventListener('load', deb);

        let tries = 0;
        const maxTries = 100;
        const t = setInterval(function() {
            tries++;
            ensureZhanjiSameLeagueButtons();
            tryAttachMo();
            if (tries >= maxTries) clearInterval(t);
        }, 300);
    }

    // 删除包含目标图片的表格行
    function removeTableRows() {
        const images = document.querySelectorAll(`img[src="${config.tableRowImg}"]`);
        images.forEach(img => {
            const row = img.closest('tr');
            if (row) row.remove();
        });
    }

    // 删除包含目标图片的轮播图容器
    function removeBannerContainer() {
        const targetImg = document.querySelector(`img.yunying-ad-banner[src="${config.bannerImg}"]`);
        if (targetImg) {
            const container = targetImg.closest('div.swiper-container.pc_odds_fenxi_banner');
            if (container) container.remove();
        }
    }

    // 删除悬浮广告div
    function removeFloatLayer() {
        const floatImg = document.querySelector(`img.floatLayer-pic[src="${config.floatImg}"]`);
        if (floatImg) {
            const container = floatImg.closest('div.floatLayer-container');
            if (container) container.remove();
        }
    }

    // 执行所有删除操作
    function executeRemoval() {
        removeTableRows();
        removeBannerContainer();
        removeFloatLayer();
    }

    if (isShujuFenxiPage()) {
        hookJiaozhanTableRefresh();
        startJiaozhanQuickFiltersPolling();
        startJiaozhanSaiguoStripPolling();
        startJiaozhanChupanRemarkPolling();
        startZhanjiSameLeaguePolling();
    }

    /** 点击勾选框旁文字时触发该勾选框（与站点 jQuery live 逻辑一致，适用于 mar_right15 / label） */
    function initCheckboxTextClick() {
        if (document.documentElement.dataset.tm500CheckboxText) return;
        document.documentElement.dataset.tm500CheckboxText = '1';
        document.addEventListener('click', function(e) {
            let el = e.target;
            if (el.nodeType !== 1) el = el.parentElement;
            if (!el || typeof el.closest !== 'function') return;
            if (el.closest('a')) return;
            if (el.closest('button,select,textarea')) return;
            if (el.tagName === 'INPUT' && el.type === 'checkbox') return;

            let cb = null;
            const span = el.closest('span.mar_right15');
            if (span) {
                cb = span.querySelector('input[type="checkbox"]');
            }
            if (!cb) {
                const label = el.closest('label');
                if (label) {
                    cb = label.querySelector('input[type="checkbox"]');
                    if (!cb && label.htmlFor) {
                        const linked = document.getElementById(label.htmlFor);
                        if (linked && linked.type === 'checkbox') cb = linked;
                    }
                }
            }
            if (!cb || cb.disabled) return;
            if (el === cb) return;
            cb.click();
        }, false);
    }
    initCheckboxTextClick();

    // 页面加载完成后执行
    window.addEventListener('load', function() {
        executeRemoval();
        // 定时检查动态加载内容
        setInterval(executeRemoval, config.checkInterval);
    });
})();
