// ==UserScript==
// @name         竞彩 赔率×支持率 返还率
// @namespace    https://www.sporttery.cn/
// @version      1.7.1
// @description  胜平负：返还率=赔率×支持率；止售后恢复赔率可点与单关标识；登录弹窗出现即关闭
// @match        https://www.sporttery.cn/jc/jsq/zqspf/*
// @match        http://www.sporttery.cn/jc/jsq/zqspf/*
// @match        https://www.sporttery.cn/jc/jsq/zqzjq/*
// @match        http://www.sporttery.cn/jc/jsq/zqzjq/*
// @match        https://www.sporttery.cn/jc/jsq/zqbqc/*
// @match        http://www.sporttery.cn/jc/jsq/zqbqc/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const LOGIN_UI_SEL =
        '#loginBenefitsFloat,.login-benefits-float,.login-modal-overlay,#loginModalOverlay,.login-tips-overlay,#loginTipsOverlay';
    const LOGIN_MARK = '登录后您可以';

    function blockLoginPopup() {
        function closeLoginPopup() {
            document.querySelectorAll(LOGIN_UI_SEL).forEach(function (el) {
                el.style.setProperty('display', 'none', 'important');
                el.remove();
            });

            document.querySelectorAll('.login-benefits-close,.login-modal-close,.login-tips-close').forEach(function (btn) {
                btn.click();
            });

            document.querySelectorAll('div').forEach(function (el) {
                if (el.id === 'tm-login-block-style') return;
                var text = (el.innerText || '').replace(/\s+/g, '');
                if (text.indexOf(LOGIN_MARK) === -1) return;
                if (text.indexOf('关注支持的球队') === -1 && text.indexOf('收藏精彩的赛事') === -1) return;
                el.style.setProperty('display', 'none', 'important');
                el.remove();
            });

            if (typeof window.hideLoginModal === 'function') {
                try {
                    window.hideLoginModal();
                } catch (e) {}
            }
            if (window.LoginModal && typeof window.LoginModal.hide === 'function') {
                try {
                    window.LoginModal.hide();
                } catch (e) {}
            }
        }

        if (!document.getElementById('tm-login-block-style')) {
            var css = document.createElement('style');
            css.id = 'tm-login-block-style';
            css.textContent =
                LOGIN_UI_SEL +
                '{display:none!important;height:0!important;width:0!important;visibility:hidden!important;' +
                'pointer-events:none!important;opacity:0!important;}';
            (document.documentElement || document.head || document).appendChild(css);
        }

        closeLoginPopup();

        function watchLoginPopup() {
            if (!document.documentElement || document.documentElement.__tmLoginWatch) return;
            new MutationObserver(closeLoginPopup).observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class'],
            });
            document.documentElement.__tmLoginWatch = true;
        }

        if (document.documentElement) {
            watchLoginPopup();
        } else {
            document.addEventListener('readystatechange', function onReady() {
                if (document.documentElement) {
                    document.removeEventListener('readystatechange', onReady);
                    watchLoginPopup();
                    closeLoginPopup();
                }
            });
        }

        document.addEventListener('DOMContentLoaded', closeLoginPopup);
        setInterval(closeLoginPopup, 200);
    }

    blockLoginPopup();

    const STYLE_ID = 'tm-spf-odds-support-style';
    const RETURN_HEADER_ID = 'tm-return-header';
    const RETURN_TD_CLASS = 'tm-returnTd';
    const RETURN_LITE_MIN = 1.0;
    const RETURN_LITE_MAX = 1.03;
    const RETURN_STRONG_MIN = 1.03;
    const RETURN_COL_WIDTH = 120;
    const BASE_TABLE_WIDTH = 1180;
    let processTimer = null;

    const PAGE = detectPage();

    function detectPage() {
        const path = location.pathname;
        if (/\/jc\/jsq\/zqbqc\//.test(path)) {
            return { key: 'hafu', enableReturnRate: false };
        }
        if (/\/jc\/jsq\/zqzjq\//.test(path)) {
            return { key: 'ttg', enableReturnRate: false };
        }
        return {
            key: 'spf',
            enableReturnRate: true,
            dateColspan: 11,
            tableWidth: BASE_TABLE_WIDTH + RETURN_COL_WIDTH,
            returnHeaderSubs: ['胜', '平', '负'],
        };
    }

    function expandPageLayout() {
        if (!PAGE.enableReturnRate) return;
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport && !viewport.dataset.tmSpfExpanded) {
            viewport.setAttribute(
                'content',
                'width=' + PAGE.tableWidth + ', maximum-scale=1.0, user-scalable=no'
            );
            viewport.dataset.tmSpfExpanded = '1';
        }

        document.querySelectorAll('#sel_pan table[width="1180"]').forEach(function (table) {
            table.setAttribute('width', String(PAGE.tableWidth));
        });
    }

    function injectStyle() {
        if (!PAGE.enableReturnRate || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.wrap {',
            '  width: ' + PAGE.tableWidth + 'px !important;',
            '}',
            '#headerTr {',
            '  width: ' + PAGE.tableWidth + 'px !important;',
            '}',
            '#sel_pan {',
            '  width: ' + PAGE.tableWidth + 'px !important;',
            '}',
            '#sel_pan > table {',
            '  width: ' + PAGE.tableWidth + 'px !important;',
            '}',
            '#mainTbl {',
            '  width: 100% !important;',
            '}',
            '#mainTbl span.oddsItem.tm-spf-hot::after {',
            '  content: "🔥";',
            '  margin-left: 1px;',
            '  font-size: 12px;',
            '  font-weight: normal;',
            '  line-height: normal;',
            '  vertical-align: middle;',
            '}',
            '#tm-return-header,',
            '#mainTbl td.tm-returnTd {',
            '  border-left: solid 1px #c9e1f0;',
            '}',
            '#mainTbl td.tm-returnTd span.tm-return-lite {',
            '  color: #f56c6c;',
            '  background-color: #fff1f0;',
            '}',
            '#mainTbl td.tm-returnTd span.tm-return-strong {',
            '  color: #e02020;',
            '  font-weight: bold;',
            '  background-color: #ffe7e7;',
            '}',
            '#mainTbl td.tm-returnTd span.tm-return-strong.tm-return-strong-max {',
            '  font-size: 15px;',
            '}',
        ].join('\n');
        document.head.appendChild(style);
    }

    function parseOdds(text) {
        const value = parseFloat(String(text || '').trim());
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    function parseSupportRate(text) {
        const raw = String(text || '').trim();
        if (!raw || raw === '--') return null;
        const percentMatch = raw.match(/([\d.]+)\s*%/);
        if (percentMatch) {
            const value = parseFloat(percentMatch[1]);
            return Number.isFinite(value) ? value / 100 : null;
        }
        const value = parseFloat(raw);
        if (!Number.isFinite(value)) return null;
        if (value > 1 && value <= 100) return value / 100;
        if (value >= 0 && value <= 1) return value;
        return null;
    }

    function calcReturnRate(odds, rate) {
        if (odds == null || rate == null) return null;
        return odds * rate;
    }

    function unwrapBrokenOddsLayout() {
        document.querySelectorAll('#mainTbl .tm-spf-col').forEach(function (wrap) {
            const oddsSpan = wrap.querySelector('span.oddsItem');
            const parent = wrap.parentElement;
            if (!oddsSpan || !parent) return;
            parent.insertBefore(oddsSpan, wrap);
            wrap.remove();
        });
        document.querySelectorAll('#mainTbl .tm-spf-fire').forEach(function (el) {
            el.remove();
        });
    }

    function isTruthyFlag(value) {
        return value === 1 || value === '1' || value === true;
    }

    // 止售后 API 常把 single 清成 0，真实单关在 bettingSingle。
    function isPoolSingle(pool) {
        return !!(pool && (isTruthyFlag(pool.single) || isTruthyFlag(pool.bettingSingle)));
    }

    function normalizePoolSingleFlags(pool, rawPool) {
        if (!pool) return;
        const bettingSingle = rawPool ? rawPool.bettingSingle : pool.bettingSingle;
        if (rawPool && rawPool.bettingSingle != null) {
            pool.bettingSingle = rawPool.bettingSingle;
        }
        if (isTruthyFlag(bettingSingle) || isTruthyFlag(pool.single)) {
            pool.single = '1';
            // 官网角标条件：single==1 && o_type==F
            if (pool.o_type !== 'F') pool.o_type = 'F';
        }
    }

    function normalizeMatchPoolsFromRaw(matchObj, rawMatch) {
        if (!matchObj || !rawMatch || !Array.isArray(rawMatch.poolList)) return;
        rawMatch.poolList.forEach(function (rawPool) {
            const key = String(rawPool.poolCode || '').toLowerCase();
            if (!key || !matchObj[key]) return;
            normalizePoolSingleFlags(matchObj[key], rawPool);
        });
    }

    function normalizeCurDataSingles() {
        const data = window.curData;
        if (!Array.isArray(data)) return;
        data.forEach(function (day) {
            if (!Array.isArray(day)) return;
            day.forEach(function (match) {
                if (!match) return;
                ['had', 'hhad', 'ttg', 'hafu', 'crs'].forEach(function (key) {
                    normalizePoolSingleFlags(match[key]);
                });
            });
        });
    }

    function getSingleMarkerStyle() {
        const domain =
            (window.jsCommonDataV1 && window.jsCommonDataV1.resDomain) ||
            '//static.sporttery.cn';
        return {
            backgroundImage:
                'url(' + domain + '/res_1_0/jcw/images/jc_calculator/single.gif)',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'left top',
        };
    }

    function applySingleMarker(el) {
        if (!el) return;
        const style = getSingleMarkerStyle();
        el.style.setProperty('background-image', style.backgroundImage, 'important');
        el.style.setProperty('background-repeat', style.backgroundRepeat, 'important');
        el.style.setProperty('background-position', style.backgroundPosition, 'important');
    }

    // 官网止售后：cbt=2 → oddsDis（灰且不可点）；single 被清零导致单关角标消失。
    function restoreClosedSaleUi() {
        document.querySelectorAll('#mainTbl span.oddsItem.oddsDis').forEach(function (span) {
            span.classList.remove('oddsDis');
        });

        normalizeCurDataSingles();

        const data = window.curData;
        if (!Array.isArray(data)) return;

        for (let i = 0; i < data.length; i++) {
            const day = data[i];
            if (!Array.isArray(day)) continue;
            for (let j = 0; j < day.length; j++) {
                const match = day[j];
                if (!match || match.id == null) continue;
                const tr = document.getElementById('list_' + match.id);
                if (!tr) continue;

                let anySingle = false;
                if (isPoolSingle(match.had)) {
                    applySingleMarker(tr.querySelector('div.hadGL'));
                    anySingle = true;
                }
                if (isPoolSingle(match.hhad)) {
                    applySingleMarker(tr.querySelector('div.hhadGL'));
                    anySingle = true;
                }
                if (isPoolSingle(match.ttg) || isPoolSingle(match.hafu)) {
                    applySingleMarker(tr.querySelector('td.vsTd'));
                    anySingle = true;
                }
                if (anySingle) {
                    tr.setAttribute('singleIndex', '1');
                }
            }
        }
    }

    function hookPoolListData() {
        let tries = 0;
        function tryHook() {
            const dt = window.dataTransferClass;
            if (dt && typeof dt.getPoolListData === 'function' && !dt.getPoolListData.__tmSpfWrapped) {
                const original = dt.getPoolListData;
                function wrapped(pData, tempMatchObj) {
                    const result = original.call(this, pData, tempMatchObj);
                    normalizeMatchPoolsFromRaw(result, pData);
                    return result;
                }
                wrapped.__tmSpfWrapped = true;
                dt.getPoolListData = wrapped;
                return;
            }
            if (++tries < 100) {
                setTimeout(tryHook, 50);
            }
        }
        tryHook();
    }

    function patchCalculatorApiPayload(payload) {
        if (!payload || !payload.value || !Array.isArray(payload.value.matchInfoList)) return false;
        let changed = false;
        payload.value.matchInfoList.forEach(function (day) {
            (day.subMatchList || []).forEach(function (match) {
                (match.poolList || []).forEach(function (pool) {
                    if (isTruthyFlag(pool.bettingSingle) && !isTruthyFlag(pool.single)) {
                        pool.single = 1;
                        changed = true;
                    }
                });
            });
        });
        return changed;
    }

    function hookCalculatorApiResponse() {
        if (window.__tmSpfApiHooked) return;
        window.__tmSpfApiHooked = true;

        const rawOpen = XMLHttpRequest.prototype.open;
        const rawSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this.__tmSpfUrl = url == null ? '' : String(url);
            return rawOpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function () {
            if (/getMatchCalculatorV1\.qry/i.test(this.__tmSpfUrl || '')) {
                const xhr = this;
                xhr.addEventListener('readystatechange', function () {
                    if (xhr.readyState !== 4 || xhr.__tmSpfPatched) return;
                    try {
                        const text = xhr.responseText;
                        if (!text) return;
                        const json = JSON.parse(text);
                        if (!patchCalculatorApiPayload(json)) return;
                        xhr.__tmSpfPatched = true;
                        const patched = JSON.stringify(json);
                        Object.defineProperty(xhr, 'responseText', {
                            configurable: true,
                            get: function () { return patched; },
                        });
                        Object.defineProperty(xhr, 'response', {
                            configurable: true,
                            get: function () {
                                return xhr.responseType && xhr.responseType !== '' && xhr.responseType !== 'text'
                                    ? json
                                    : patched;
                            },
                        });
                    } catch (e) {}
                });
            }
            return rawSend.apply(this, arguments);
        };
    }

    function buildReturnHeaderHtml() {
        const subs = PAGE.returnHeaderSubs.map(function (label, index) {
            const classes = ['uoOption', 'tLine'];
            if (index < PAGE.returnHeaderSubs.length - 1) classes.push('rLine');
            return '<span class="' + classes.join(' ') + '" style="width:33%">' + label + '</span>';
        }).join('');
        return [
            '<span style="cursor:default;width:' + RETURN_COL_WIDTH + 'px;">返还率</span>',
            '<br/>',
            subs,
        ].join('');
    }

    function buildReturnCellHtml() {
        return [
            '<div class="hadReturn bLine">',
            '<span class="rLine">--</span>',
            '<span class="rLine">--</span>',
            '<span>--</span>',
            '</div>',
            '<div class="hhadReturn">',
            '<span class="rLine">--</span>',
            '<span class="rLine">--</span>',
            '<span>--</span>',
            '</div>',
        ].join('');
    }

    function ensureReturnHeader() {
        if (document.getElementById(RETURN_HEADER_ID)) return;

        const supportHeader = document.getElementById('uOddsListbox');
        if (!supportHeader) return;

        const supportTd = supportHeader.closest('td');
        if (!supportTd) return;

        const td = document.createElement('td');
        td.id = RETURN_HEADER_ID;
        td.className = 'lLine';
        td.style.width = RETURN_COL_WIDTH + 'px';
        td.style.verticalAlign = 'bottom';
        td.innerHTML = buildReturnHeaderHtml();
        supportTd.insertAdjacentElement('afterend', td);
    }

    function fixDateRowColspan() {
        document.querySelectorAll('#mainTbl td.bDateTd').forEach(function (td) {
            if (td.getAttribute('colspan') !== String(PAGE.dateColspan)) {
                td.setAttribute('colspan', String(PAGE.dateColspan));
            }
        });
    }

    function ensureReturnCell(tr) {
        if (tr.querySelector('td.' + RETURN_TD_CLASS)) return;

        const supportTd = tr.querySelector('td.uOddsTd');
        if (!supportTd) return;

        const td = document.createElement('td');
        td.className = RETURN_TD_CLASS + ' uOddsTd lLine';
        td.style.width = RETURN_COL_WIDTH + 'px';
        td.innerHTML = buildReturnCellHtml();
        supportTd.insertAdjacentElement('afterend', td);
    }

    function getReturnLevel(product) {
        if (product == null) return '';
        if (product > RETURN_STRONG_MIN) return 'strong';
        if (product >= RETURN_LITE_MIN && product <= RETURN_LITE_MAX) return 'lite';
        return '';
    }

    function applyReturnLevel(span, level) {
        span.classList.remove('tm-return-lite', 'tm-return-strong', 'tm-return-strong-max');
        if (level === 'lite') span.classList.add('tm-return-lite');
        if (level === 'strong') span.classList.add('tm-return-strong');
    }

    function applyMaxStrongHighlight(spans) {
        const items = Array.from(spans || []).map(function (span) {
            return {
                span: span,
                value: parseFloat(span.getAttribute('data-tm-return-value')),
            };
        }).filter(function (item) {
            return item.span.classList.contains('tm-return-strong') && Number.isFinite(item.value);
        });

        spans.forEach(function (span) {
            span.classList.remove('tm-return-strong-max');
        });

        if (items.length < 2) return;

        const maxValue = Math.max.apply(null, items.map(function (item) {
            return item.value;
        }));

        items.forEach(function (item) {
            if (item.value === maxValue) {
                item.span.classList.add('tm-return-strong-max');
            }
        });
    }

    function renderReturnSpan(span, product) {
        if (!span) return;

        if (product == null) {
            span.textContent = '--';
            span.removeAttribute('data-tm-return-value');
            applyReturnLevel(span, '');
            span.removeAttribute('title');
            return;
        }

        const text = product.toFixed(2);
        const level = getReturnLevel(product);
        const title = '返还率=赔率×支持率=' + product.toFixed(3);

        span.setAttribute('data-tm-return-value', String(product));

        if (span.textContent === text &&
            span.classList.contains('tm-return-lite') === (level === 'lite') &&
            span.classList.contains('tm-return-strong') === (level === 'strong')) {
            span.title = title;
            return;
        }

        span.textContent = text;
        span.title = title;
        applyReturnLevel(span, level);
    }

    function renderOddsFire(oddsSpan, product) {
        if (!oddsSpan) return;
        const isHot = product != null && product > RETURN_STRONG_MIN;
        oddsSpan.classList.toggle('tm-spf-hot', isHot);
        if (isHot) {
            oddsSpan.title = '返还率=' + product.toFixed(3) + '（>1.03 过火）';
        } else if ((oddsSpan.getAttribute('title') || '').indexOf('过火') !== -1) {
            oddsSpan.removeAttribute('title');
        }
    }

    function processSpfRow(tr) {
        ensureReturnCell(tr);

        const supportSpans = tr.querySelectorAll('td.uOddsTd span');
        if (supportSpans.length < 6) return;

        const hadOdds = tr.querySelectorAll('div.hadOdds span.oddsItem');
        const hhadOdds = tr.querySelectorAll('div.hhadOdds span.oddsItem');
        const hadReturnSpans = tr.querySelectorAll('div.hadReturn > span');
        const hhadReturnSpans = tr.querySelectorAll('div.hhadReturn > span');

        for (let i = 0; i < 3; i++) {
            const hadProduct = calcReturnRate(
                parseOdds(hadOdds[i]?.textContent),
                parseSupportRate(supportSpans[i]?.textContent)
            );
            const hhadProduct = calcReturnRate(
                parseOdds(hhadOdds[i]?.textContent),
                parseSupportRate(supportSpans[i + 3]?.textContent)
            );

            renderReturnSpan(hadReturnSpans[i], hadProduct);
            renderReturnSpan(hhadReturnSpans[i], hhadProduct);
            renderOddsFire(hadOdds[i], hadProduct);
            renderOddsFire(hhadOdds[i], hhadProduct);
        }

        applyMaxStrongHighlight(hadReturnSpans);
        applyMaxStrongHighlight(hhadReturnSpans);
    }

    function processRow(tr) {
        processSpfRow(tr);
    }

    function syncHeaderWidths() {
        const firstRow = document.querySelector('#mainTbl tr.listTr');
        if (!firstRow || typeof window.jQuery !== 'function') return;

        const $ = window.jQuery;
        const hTdObj = $('#headerTr td');
        const mTdObj = $(firstRow).find('td');
        if (hTdObj.length !== mTdObj.length) return;

        hTdObj.each(function (i) {
            const width = mTdObj.eq(i).width();
            if (width > 0) {
                $(this).width(width);
            }
        });
    }

    function processAll() {
        restoreClosedSaleUi();
        if (!PAGE.enableReturnRate) return;

        unwrapBrokenOddsLayout();
        ensureReturnHeader();
        fixDateRowColspan();
        document.querySelectorAll('#mainTbl tr.listTr').forEach(processRow);
        syncHeaderWidths();
    }

    function scheduleProcess() {
        if (processTimer) clearTimeout(processTimer);
        processTimer = setTimeout(processAll, 120);
    }

    function hookSupportRateCallback() {
        let tries = 0;
        function tryHook() {
            const original = window.getReferData1;
            if (typeof original === 'function' && !original.__tmSpfWrapped) {
                function wrapped(backData) {
                    original.call(this, backData);
                    scheduleProcess();
                }
                wrapped.__tmSpfWrapped = true;
                window.getReferData1 = wrapped;
                return;
            }
            if (++tries < 50) {
                setTimeout(tryHook, 200);
            }
        }
        tryHook();
    }

    function hookInitData() {
        let tries = 0;
        function tryHook() {
            const original = window.initData;
            if (typeof original === 'function' && !original.__tmSpfWrapped) {
                function wrapped() {
                    original.apply(this, arguments);
                    scheduleProcess();
                }
                wrapped.__tmSpfWrapped = true;
                window.initData = wrapped;
                return;
            }
            if (++tries < 80) {
                setTimeout(tryHook, 100);
            }
        }
        tryHook();
    }

    function observeTable() {
        const table = document.getElementById('mainTbl');
        if (!table || table.__tmSpfObserved) return;

        const observer = new MutationObserver(function (mutations) {
            const needProcess = mutations.some(function (m) {
                if (m.type === 'characterData') return true;
                return Array.from(m.addedNodes).some(function (node) {
                    return node.nodeType === 1 &&
                        !node.classList?.contains(RETURN_TD_CLASS) &&
                        !node.closest?.('.' + RETURN_TD_CLASS);
                });
            });
            if (needProcess) scheduleProcess();
        });
        observer.observe(table, { childList: true, subtree: true, characterData: true });
        table.__tmSpfObserved = true;
    }

    function observeHeader() {
        const header = document.getElementById('headerTr');
        if (!header || header.__tmSpfObserved) return;

        const observer = new MutationObserver(scheduleProcess);
        observer.observe(header, { childList: true, subtree: true });
        header.__tmSpfObserved = true;
    }

    function bindRefreshButton() {
        const btn = document.getElementById('updateBtn');
        if (!btn || btn.__tmSpfBound) return;
        btn.addEventListener('click', scheduleProcess);
        btn.__tmSpfBound = true;
    }

    function init() {
        hookInitData();
        hookPoolListData();
        if (PAGE.enableReturnRate) {
            injectStyle();
            expandPageLayout();
            hookSupportRateCallback();
            observeHeader();
            bindRefreshButton();
        }
        observeTable();
        scheduleProcess();
    }

    // document-start 尽早挂钩，避免首包数据漏改 single
    hookCalculatorApiResponse();
    hookPoolListData();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
