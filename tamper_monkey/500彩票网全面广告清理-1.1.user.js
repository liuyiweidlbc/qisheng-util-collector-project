// ==UserScript==
// @name         500彩票网全面广告清理
// @namespace    http://tampermonkey.net/
// @version      1.9.20
// @run-at       document-idle
// @description  删除500彩票网分析页面中的特定广告图片行、轮播图和悬浮广告；数据分析(shuju)交战历史赛果条+盘路条、备注初盘盘口、快捷筛选、主客相同复制盘口（含联赛）；点击勾选框旁文字等同点击勾选框；盘路堆叠段等高；近期战绩「同联赛」左侧赛果序列；任一点击六表同联赛同步
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
        const homeEm = document.querySelector('#team_jiaozhan #home_jz');
        const raw = homeEm && homeEm.getAttribute('val');
        const cur = raw != null && raw !== '' ? String(raw) : '0';
        host.querySelectorAll('button[data-jz]').forEach(function(btn) {
            const v = btn.getAttribute('data-jz');
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

    function triggerJiaozhanFilter(val) {
        const homeEm = document.querySelector('#team_jiaozhan #home_jz');
        if (!homeEm) return;
        const seltBox = homeEm.closest('.selt_box');
        if (!seltBox) return;
        const ul = seltBox.querySelector('ul.selt_list');
        if (!ul) return;
        const li = ul.querySelector('li[val="' + val + '"]');
        if (!li || typeof window.getJiaozhan !== 'function') return;
        window.getJiaozhan(li, 'home_jz');
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

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = '复制盘口';
        copyBtn.setAttribute('data-jz', 'copy');
        copyBtn.setAttribute('title', '复制主客相同场次：联赛|日期|比分|初盘|终盘（盘口为数值，如 1.04 -2.25 0.82|0.82 -1.75 1.04）');
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
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        const raw = [];
        rows.forEach(function(tr) {
            if (tr.classList.contains('bmatch')) return;
            const st = tr.getAttribute('style') || '';
            if (/display\s*:\s*none/i.test(st)) return;
            const tds = tr.querySelectorAll('td');
            if (tds.length < 5) return;
            const sg = (tds[4].textContent || '').replace(/\s/g, '');
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
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            if (tr.classList.contains('bmatch')) return;
            const st = tr.getAttribute('style') || '';
            if (/display\s*:\s*none/i.test(st)) return;
            const tds = tr.querySelectorAll('td');
            if (tds.length < 8) return;
            const sg = (tds[4].textContent || '').replace(/\s/g, '');
            if (sg === '-' || sg === '') return;
            if (sg !== '胜' && sg !== '平' && sg !== '负') return;
            const pl = (tds[7].textContent || '').replace(/\s/g, '');
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

    function getJiaozhanYapanBeizhuIndices(table) {
        const trs = table.querySelectorAll('tr');
        let n = 0;
        let i;
        for (i = 0; i < trs.length; i++) {
            if (trs[i].querySelector('th')) {
                n = trs[i].querySelectorAll('th').length;
                break;
            }
        }
        if (n >= 10) return { yapan: 6, beizhu: 9 };
        if (n < 2) return { yapan: 6, beizhu: 9 };
        return { yapan: Math.max(0, n - 4), beizhu: n - 1 };
    }

    const JZ_BEIZHU_STYLE_ID = 'tm500-jz-beizhu-style-194';
    const JZ_TABLE_WIDE_STYLE_ID = 'tm500-jz-table-wide-198';

    /** 解除站点 table/colgroup/th 定宽，否则仅改 CSS 无法撑开备注列 */
    function relaxJiaozhanPubTableWidths(table) {
        if (!table) return;
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
    function injectJiaozhanTableWideStyle() {
        const legacy192 = document.getElementById('tm500-jz-table-wide-192');
        const legacy193 = document.getElementById('tm500-jz-table-wide-193');
        const legacy195 = document.getElementById('tm500-jz-table-wide-195');
        const legacy196 = document.getElementById('tm500-jz-table-wide-196');
        if (legacy192) legacy192.remove();
        if (legacy193) legacy193.remove();
        if (legacy195) legacy195.remove();
        if (legacy196) legacy196.remove();
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
            '}';
        document.head.appendChild(s);
    }

    function injectJiaozhanBeizhuStyle() {
        const legacy189 = document.getElementById('tm500-jz-beizhu-style-189');
        const legacy190 = document.getElementById('tm500-jz-beizhu-style-190');
        if (legacy189) legacy189.remove();
        if (legacy190) legacy190.remove();
        if (document.getElementById(JZ_BEIZHU_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = JZ_BEIZHU_STYLE_ID;
        s.textContent =
            '#team_jiaozhan table.pub_table th.tm500-jz-bz-col,' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell{' +
            'min-width:128px!important;width:auto!important;max-width:none!important;' +
            'padding:5px 6px!important;white-space:normal;word-break:break-word;' +
            'vertical-align:middle;line-height:1.38;font-size:12px;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-bz-pk{' +
            'display:inline-block;margin:0 2px;padding:1px 5px;border-radius:3px;' +
            'font-size:10px!important;line-height:1.25;font-weight:600;' +
            'background:#e7f1ff;color:#0d47a1;' +
            'border:1px solid #b6d4fe;' +
            '}' +
            '#team_jiaozhan table.pub_table td.tm500-jz-bz-cell .tm500-jz-bz-odds{' +
            'font-size:11px;font-weight:600;color:#333;' +
            '}';
        document.head.appendChild(s);
    }

    function tagJiaozhanBeizhuHeaderTh(table, cols) {
        if (cols.beizhu < 0) return;
        const trs = table.querySelectorAll('tr');
        let i, thRow;
        for (i = 0; i < trs.length; i++) {
            if (trs[i].querySelector('th')) {
                thRow = trs[i];
                break;
            }
        }
        if (!thRow) return;
        const ths = thRow.querySelectorAll('th');
        if (ths[cols.beizhu]) ths[cols.beizhu].classList.add('tm500-jz-bz-col');
    }

    function widenJiaozhanBeizhuColumnCells(table, cols) {
        if (cols.beizhu < 0) return;
        const rows = table.querySelectorAll('tr');
        let ri;
        for (ri = 0; ri < rows.length; ri++) {
            const tr = rows[ri];
            const tds = tr.querySelectorAll('td');
            if (!tds.length) continue;
            if (tds.length > cols.beizhu) tds[cols.beizhu].classList.add('tm500-jz-bz-cell');
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

    function renderJiaozhanBeizhuCell(bTd, txt) {
        bTd.classList.add('tm500-jz-bz-cell');
        const seg = splitJiaozhanRemarkDisplayParts(txt);
        if (!seg) {
            bTd.textContent = txt;
            return;
        }
        bTd.textContent = '';
        const spL = document.createElement('span');
        spL.className = 'tm500-jz-bz-odds';
        spL.textContent = seg.left;
        const spM = document.createElement('span');
        spM.className = 'tm500-jz-bz-pk';
        spM.textContent = seg.mid;
        bTd.appendChild(spL);
        bTd.appendChild(document.createTextNode(' '));
        bTd.appendChild(spM);
        if (seg.right) {
            bTd.appendChild(document.createTextNode(' '));
            const spR = document.createElement('span');
            spR.className = 'tm500-jz-bz-odds';
            spR.textContent = seg.right;
            bTd.appendChild(spR);
        }
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

    function extractJiaozhanChupanYapanText(yapanTd) {
        if (!yapanTd) return '';
        const ti = (yapanTd.getAttribute('title') || '').trim();
        const mid = yapanTd.querySelector('.pub_table_pl .table_pl_center');
        const midTxt = mid ? (mid.textContent || '').trim() : '';
        if (ti && midTxt && ti !== midTxt) return ti + ' ' + midTxt;
        if (ti) return ti;
        if (midTxt) return midTxt;
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

    /** 与站点初盘 ajax 一致：fenxi1/inc/ajax.php（fid[]/sid[] 与各行 tr 对应） */
    function collectJiaozhanRemarkAjaxPairs(table) {
        const out = [];
        const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
            return tr.querySelector('td') && !tr.querySelector('th');
        });
        rows.forEach(function(tr) {
            if (tr.classList.contains('bmatch')) return;
            const st = tr.getAttribute('style') || '';
            if (/display\s*:\s*none/i.test(st)) return;
            const fid = getJiaozhanTrFid(tr);
            if (!fid) return;
            out.push({ tr: tr, fid: fid, sid: getJiaozhanTrSid(tr) });
        });
        return out;
    }

    /** 与站点亚盘 ajax 一致：t=yapan；p_t 1=初盘 0=终盘；fid[]/sid[] 各两轮 */
    function buildJiaozhanYapanChupanAjaxQuery(cid, pairs, pT) {
        const pt = pT == null || pT === '' ? '1' : String(pT);
        const ts = Date.now();
        const enc = encodeURIComponent;
        const c = enc(String(cid));
        const parts = ['_=' + ts, 't=yapan', 'cid=' + c];
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
        });
    }

    function formatJiaozhanYapanAjaxRemark(o) {
        if (!o || typeof o !== 'object') return '';
        const h = String(o.HOMEMONEYLINE != null ? o.HOMEMONEYLINE : '').trim();
        const a = String(o.AWAYMONEYLINE != null ? o.AWAYMONEYLINE : '').trim();
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
                onDone(chuMap, zhongMap);
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
        const homeEm = document.querySelector('#team_jiaozhan #home_jz');
        const cur = homeEm ? String(homeEm.getAttribute('val') || '0') : '0';
        if (cur !== '2') {
            triggerJiaozhanFilter('2');
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

    function fillJiaozhanRemarkFromChupanYapanDomFallback(root, table, pk, cols, done, reqId) {
        const prev = String(pk.value);
        const needSwitch = prev !== '1';
        if (needSwitch) document.documentElement.dataset.tm500JzJzCpBusy = '1';

        function applyRows() {
            const rows = Array.from(table.querySelectorAll('tr')).filter(function(tr) {
                return tr.querySelector('td') && !tr.querySelector('th');
            });
            rows.forEach(function(tr) {
                if (tr.classList.contains('bmatch')) return;
                const st = tr.getAttribute('style') || '';
                if (/display\s*:\s*none/i.test(st)) return;
                const tds = tr.querySelectorAll('td');
                if (tds.length <= cols.beizhu) return;
                const yTd = tds[cols.yapan];
                const bTd = tds[cols.beizhu];
                const txt = extractJiaozhanChupanYapanText(yTd);
                if (txt) {
                    renderJiaozhanBeizhuCell(bTd, txt);
                    bTd.setAttribute('data-tm500-jz-bz-cp', '1');
                }
            });
        }

        function finish() {
            if (needSwitch) document.documentElement.dataset.tm500JzJzCpBusy = '';
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
        if (!pk) return;
        const cols = getJiaozhanYapanBeizhuIndices(table);
        if (cols.yapan < 0 || cols.beizhu < 0) return;
        injectJiaozhanTableWideStyle();
        relaxJiaozhanPubTableWidths(table);
        injectJiaozhanBeizhuStyle();
        tagJiaozhanBeizhuHeaderTh(table, cols);
        widenJiaozhanBeizhuColumnCells(table, cols);

        const pairs = collectJiaozhanRemarkAjaxPairs(table);
        if (!pairs.length) return;

        const yp = table.querySelector('select[name="yapan"][data-t="yp"]');
        let cid = (yp && yp.value !== undefined && yp.value !== null && String(yp.value).trim() !== '') ? String(yp.value).trim() : '5';
        if (cid === '0' || cid === '') cid = '5';

        const reqId = ++jiaozhanRemarkAjaxReqId;
        const origin = location.origin || (location.protocol + '//' + location.host);
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
            const n = applyJiaozhanRemarkFromAjaxPayload(table, cols, pairs, chuMap);
            if (n === 0) runFallback(chuMap);
            else jiaozhanYapanFetchZhongAndApplyMarks(table, cols, pairs, cid, reqId, chuMap);
        });
    }

    const debounceFillJiaozhanChupanRemark = debounce(fillJiaozhanRemarkFromChupanYapan, 320);

    /** 站点 getJiaozhan 异步替换表格行时，仅靠 Mutation 防抖可能在空表阶段执行或不再触发；与 yapan/pk 下拉一致多拍补拉初盘备注 */
    function scheduleFillJiaozhanChupanRemarkAfterJiaozhanNav() {
        debounceFillJiaozhanChupanRemark();
        window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 40);
        window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 200);
        window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 520);
        window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 1100);
        window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 2100);
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
        const root = document.getElementById('team_jiaozhan');
        if (!root) return;
        const table = root.querySelector('table.pub_table');
        if (!table) return;
        injectJiaozhanTableWideStyle();
        relaxJiaozhanPubTableWidths(table);
        injectJiaozhanSaiguoStripStyle();
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

    function startJiaozhanChupanRemarkPolling() {
        if (document.documentElement.dataset.tm500JzCpRemark) return;
        document.documentElement.dataset.tm500JzCpRemark = '1';
        const deb = debounce(fillJiaozhanRemarkFromChupanYapan, 360);
        const root = document.getElementById('team_jiaozhan');
        if (root && !root.dataset.tm500JzCpRemarkMo) {
            root.dataset.tm500JzCpRemarkMo = '1';
            new MutationObserver(deb).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'val', 'class', 'fid', 'sid'] });
        }
        window.addEventListener('load', deb);
        window.addEventListener('load', function() {
            window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 350);
            window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 1100);
        });
        let n = 0;
        const iv = setInterval(function() {
            deb();
            if (++n >= 100) clearInterval(iv);
        }, 400);
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
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 40);
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 480);
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 1200);
                    return;
                }
                if (n === 'yapan' && dt === 'pk') {
                    debounceFillJiaozhanChupanRemark();
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 80);
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 550);
                    return;
                }
                if (n === 'oupei' && dt === 'op') {
                    debounceFillJiaozhanChupanRemark();
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 260);
                    window.setTimeout(fillJiaozhanRemarkFromChupanYapan, 900);
                }
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

    const ZJ_SL_STYLE_ID = 'tm500-zj-same-league-style-180';

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
            '.tm500-zj-sl-right{' +
            'margin-left:auto;margin-right:10px;display:inline-flex;align-items:center;' +
            'gap:8px;flex-shrink:0;flex-wrap:nowrap;' +
            '}' +
            '.tm500-zj-same-league-wrap{' +
            'margin-left:0;margin-right:0;display:inline-flex;justify-content:flex-end;flex-shrink:0;' +
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
            const st = tr.getAttribute('style') || '';
            if (/display\s*:\s*none/i.test(st)) return;
            const tds = tr.querySelectorAll('td');
            if (tds.length <= idx) return;
            const sg = (tds[idx].textContent || '').replace(/\s/g, '');
            if (sg === '-' || sg === '') return;
            if (sg !== '胜' && sg !== '平' && sg !== '负') return;
            raw.push(sg);
        });
        return raw.slice().reverse();
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

    function ensureZhanjiSameLeagueButtons() {
        if (!isShujuFenxiPage()) return;
        injectJiaozhanSaiguoStripStyle();
        injectZhanjiSameLeagueStyle();
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
        syncZhanjiSameLeagueButtonsActive();
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
