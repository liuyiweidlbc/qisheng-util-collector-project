// ==UserScript==
// @name         竞彩 赔率×支持率 返还率
// @namespace    https://www.sporttery.cn/
// @version      1.10.5
// @description  胜平负：返还率=赔率×支持率；止售后恢复赔率可点与单关标识；登录弹窗出现即关闭；允许同场 HAD+HHAD 及再选其他场；右击打开单场方案计算器（含复制出票）；目标含平均/保体/亏/盈分组；左击选中与目标 localStorage 持久化，无该场则清除
// @match        https://www.sporttery.cn/jc/jsq/zqspf/*
// @match        http://www.sporttery.cn/jc/jsq/zqspf/*
// @match        https://www.sporttery.cn/jc/jsq/zqspf
// @match        http://www.sporttery.cn/jc/jsq/zqspf
// @match        https://www.sporttery.cn/jc/jsq/zqzjq/*
// @match        http://www.sporttery.cn/jc/jsq/zqzjq/*
// @match        https://www.sporttery.cn/jc/jsq/zqbqc/*
// @match        http://www.sporttery.cn/jc/jsq/zqbqc/*
// @include      /^https?:\/\/(www\.)?sporttery\.cn\/jc\/jsq\/zqspf(\/|$|\?|#)/
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

    /**
     * 官网限制：
     * 1) 同场 HAD/HHAD 互斥（alert + return）
     * 2) 同场已选两玩法后，再选其他场也会被挡，并提示「同时选一场比赛的两个单关游戏，只能计算单关」
     * 做法：静默相关 alert；跨玩法/已有双玩法时自行写入选中；改写 optionDis 忽略 hasMulti。
     */
    function allowHadHhadSameMatch() {
        if (window.__tmSpfAllowHadHhad) return;
        window.__tmSpfAllowHadHhad = true;

        function injectPage() {
            if (!document.documentElement || document.documentElement.dataset.tmSpfAllowMulti) return;
            document.documentElement.dataset.tmSpfAllowMulti = '1';
            const s = document.createElement('script');
            s.textContent =
                '(function(){' +
                'var MSGS=["一场比赛只能选择一种游戏","只能计算单关","只允许选择一个游戏"];' +
                'var na=window.alert;' +
                'if(typeof na==="function"&&!window.__tmSpfAlertMuted){' +
                'window.alert=function(msg){' +
                'var s=String(msg||"");' +
                'for(var i=0;i<MSGS.length;i++){if(s.indexOf(MSGS[i])!==-1)return;}' +
                'return na.apply(window,arguments);' +
                '};' +
                'window.__tmSpfAlertMuted=1;' +
                '}' +
                'function hasMultiMatch(){' +
                'if(typeof selAry==="undefined")return false;' +
                'var cnt={};' +
                'for(var key in selAry){' +
                'var id=String(key).split("@")[0];' +
                'cnt[id]=(cnt[id]|0)+1;' +
                'if(cnt[id]>1)return true;' +
                '}' +
                'return false;' +
                '}' +
                'function applySelect(span){' +
                'if(typeof jQuery==="undefined"||typeof selAry==="undefined"||!window.lotFunc)return false;' +
                'var $=jQuery;' +
                'var $span=$(span);' +
                'if($span.hasClass("oddsDis")||$span.hasClass("oddsEffect"))return false;' +
                'var oddsTxt=($span.text()||"").trim();' +
                'if(!oddsTxt||oddsTxt==="--"||Number(oddsTxt)==0||isNaN(Number(oddsTxt)))return false;' +
                'var $tr=$span.closest("tr.listTr");' +
                'if(!$tr.length)return false;' +
                'var idStr=String($tr.attr("id")||"").replace(/^list_/,"");' +
                'if(!idStr)return false;' +
                'var poolStr=$span.closest("div.hadOdds").length?"had":($span.closest("div.hhadOdds").length?"hhad":"");' +
                'if(!poolStr)return false;' +
                'var oIndex=$span.closest("div").find("span.oddsItem").index($span);' +
                'if(oIndex<0)oIndex=$span.closest("div").find("span").index($span);' +
                'var index=$span.closest("td").find("span").index($span);' +
                'var uObj=$tr.find("td.uOddsTd span").eq(index);' +
                'var key=idStr+"@"+poolStr;' +
                'if($span.hasClass("oddsClk")){' +
                '$span.removeClass("oddsClk");uObj.removeClass("uOddsSel");' +
                'if(selAry[key]){selAry[key].odds[oIndex]="";' +
                'if(Number(selAry[key].odds.join(""))==0){delete selAry[key];selAryLen--;}}' +
                '}else{' +
                'if(!selAry[key]){' +
                'selAry[key]={odds:["","",""],dataIndex:$tr.attr("dataIndex")||$tr.attr("dataindex"),' +
                'pool:poolStr,single:false,matchNumDate:$tr.attr("matchNumDate"),taxDateNo:$tr.attr("taxDateNo")};' +
                'if($tr.find("."+poolStr+"GL").css("background-image")!="none")selAry[key].single=true;' +
                'selAryLen++;' +
                '}' +
                'selAry[key].odds[oIndex]=oddsTxt;' +
                'try{if(typeof voteList!=="undefined"&&typeof oddsName!=="undefined"&&typeof oddsIndex!=="undefined"){' +
                'var vn=oddsName[oddsIndex[oIndex]];' +
                'if(vn!=null&&voteList[idStr+poolStr+vn]==null){voteList[idStr+poolStr+vn]=1;' +
                'if(lotFunc.getVoteI)lotFunc.getVoteI(idStr,poolStr,vn);}' +
                '}}catch(ex){}' +
                '$span.addClass("oddsClk");uObj.addClass("uOddsSel");' +
                'try{if(lotFunc.animate)$span.offset()&&lotFunc.animate($span.offset().top,$span.offset().left,$span.width(),$span.height());}catch(ex2){}' +
                '}' +
                'try{lotFunc.calculate();}catch(ex3){}' +
                'return true;' +
                '}' +
                'function patchLotFunc(){' +
                'if(!window.lotFunc||lotFunc.__tmMultiPatched)return!!window.lotFunc;' +
                'if(typeof lotFunc.optionDis==="function"){' +
                'lotFunc.optionDis=function(){' +
                'var tipStr="";' +
                'var selCount=lotFunc.getSelMatchCount();' +
                'var hdr=$("#optionHeader :checked").attr("index");' +
                'var over=(hdr==0&&selCount>limitLen[curPool])||(hdr==1&&selCount>fLimitLen);' +
                'if(over){' +
                '$("#optionList input:gt(0)").prop("checked",false).attr("disabled",true);' +
                'if(hdr==0&&selCount>limitLen[curPool]){' +
                'var addStr="";' +
                'if(curPool=="ttg"||curPool=="crs"||curPool=="hafu"||curPool=="wnm")addStr="或自由过关";' +
                'tipStr=" 超过"+limitLen[curPool]+"场只能选择单关"+addStr+"进行计算！";' +
                '}else if(hdr==1&&selCount>fLimitLen){' +
                'tipStr=" 超过"+fLimitLen+"场只能选择单关进行计算！";' +
                '}' +
                '}else{' +
                '$("#optionList input:gt(0)").removeAttr("disabled");' +
                '$("#optionHeader input").removeAttr("disabled");' +
                '}' +
                '$("#optionTip").html(tipStr);' +
                'if(tipStr==="")$("#optionTip").width("auto");' +
                '};' +
                '}' +
                'lotFunc.__tmMultiPatched=1;' +
                'try{lotFunc.optionDis();}catch(e0){}' +
                'return true;' +
                '}' +
                'var tries=0;' +
                'var timer=setInterval(function(){if(patchLotFunc()||++tries>200)clearInterval(timer);},50);' +
                'document.addEventListener("click",function(e){' +
                'var t=e.target,el=t&&t.nodeType===1?t:(t&&t.parentElement);' +
                'if(!el||!el.closest)return;' +
                'var span=el.closest("span.oddsItem");' +
                'if(!span||!span.closest("#mainTbl"))return;' +
                'if(span.classList.contains("oddsClk"))return;' +
                'var tr=span.closest("tr.listTr");if(!tr||!tr.id)return;' +
                'var id=String(tr.id).replace(/^list_/,"");' +
                'var pool=span.closest("div.hadOdds")?"had":(span.closest("div.hhadOdds")?"hhad":"");' +
                'if(!pool)return;' +
                'if(typeof selAry==="undefined")return;' +
                'var other=pool==="had"?"hhad":"had";' +
                'var need=!!selAry[id+"@"+other]||hasMultiMatch();' +
                'if(!need)return;' +
                'e.preventDefault();e.stopPropagation();' +
                'if(e.stopImmediatePropagation)e.stopImmediatePropagation();' +
                'patchLotFunc();' +
                'applySelect(span);' +
                'try{document.dispatchEvent(new CustomEvent("tm-spf-sel-changed",{bubbles:true}));}catch(ex4){}' +
                '},true);' +
                '})();';
            (document.head || document.documentElement).appendChild(s);
        }

        if (document.documentElement) injectPage();
        else document.addEventListener('readystatechange', injectPage);

        document.addEventListener('tm-spf-sel-changed', function () {
            if (typeof spfScheduleSaveSelections === 'function') spfScheduleSaveSelections();
        });
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
        if (PAGE.enableReturnRate) {
            unwrapBrokenOddsLayout();
            ensureReturnHeader();
            fixDateRowColspan();
            document.querySelectorAll('#mainTbl tr.listTr').forEach(processRow);
            syncHeaderWidths();
        }
        if (PAGE.key === 'spf') spfScheduleRestoreSelections();
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
                    spfNeedRestore = true;
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
            initSpfPlanCalculator();
            initSpfSelectionPersist();
        }
        observeTable();
        scheduleProcess();
    }

    // document-start 尽早挂钩，避免首包数据漏改 single
    allowHadHhadSameMatch();
    hookCalculatorApiResponse();
    hookPoolListData();

    /* ========== 胜平负页：单场方案计算器 + 选中持久化 ========== */
    const SPF_CALC_STYLE_ID = 'tm-spf-plan-calc-style';
    const SPF_CALC_MODAL_ID = 'tm-spf-plan-calc-modal';
    const SPF_SEL_STORAGE_KEY = 'tm-sporttery-spf-sels-v1';
    const SCRIPT_VERSION = '1.10.5';
    const UNIT_YUAN = 2; // 竞彩：1倍 = 2元
    const ROLE_AVG = 'avg';
    const ROLE_BE = 'breakeven';
    const ROLE_LOSE_Q = 'lose_q';
    const ROLE_HALF = 'half';
    const ROLE_LOSE_TQ = 'lose_3q';
    const ROLE_WIN_Q = 'win_q';
    const ROLE_WIN_H = 'win_half';
    const ROLE_MAX = 'max';
    const ROLE_LABELS = {
        avg: '平均',
        breakeven: '保体',
        lose_q: '亏1/4',
        half: '亏1/2',
        lose_3q: '亏3/4',
        win_q: '赢1/4',
        win_half: '赢1/2',
        max: '最大化',
    };
    /** 固定返还目标（相对总预算 S 的倍数）；null 表示非固定项 */
    const ROLE_RETURN_MULT = {
        breakeven: 1,
        lose_q: 0.75,
        half: 0.5,
        lose_3q: 0.25,
        win_q: 1.25,
        win_half: 1.5,
    };
    const ROLE_GROUPS = [
        { id: 'avg', roles: [ROLE_AVG] },
        { id: 'be', roles: [ROLE_BE] },
        { id: 'lose', roles: [ROLE_LOSE_Q, ROLE_HALF, ROLE_LOSE_TQ] },
        { id: 'win', roles: [ROLE_WIN_Q, ROLE_WIN_H, ROLE_MAX] },
    ];
    const OUTCOME_LABELS = ['胜', '平', '负'];

    let spfCalcState = { total: 100, items: [], roles: {}, matchMeta: null, activePreset: 'avg' };
    let spfSelRestoring = false;
    let spfNeedRestore = true;
    let spfRestoreTimer = null;
    let spfSaveTimer = null;
    let spfPersistInited = false;
    let spfCalcInited = false;

    function spfRound2(n) {
        return Math.round(Number(n) * 100) / 100;
    }

    function spfFormatMoney(n) {
        if (!Number.isFinite(n)) return '-';
        return spfRound2(n).toFixed(2);
    }

    /** 预算取最近偶数元（至少 2 元 = 1 倍） */
    function spfNormalizeBudgetYuan(v) {
        let n = Math.round(Number(v));
        if (!(n > 0)) return 0;
        n = Math.round(n / UNIT_YUAN) * UNIT_YUAN;
        return Math.max(UNIT_YUAN, n);
    }

    function spfYuanToBei(yuan) {
        return Math.round(Number(yuan) / UNIT_YUAN);
    }

    function spfBeiToYuan(bei) {
        return Number(bei) * UNIT_YUAN;
    }

    function spfFormatBei(bei) {
        const n = Math.round(Number(bei) || 0);
        return n + '倍';
    }

    /** 按理想浮点倍，用最大余数法拆成整数倍，合计 = totalBei */
    function spfDistributeIntegerBei(keys, idealMap, totalBei) {
        const out = {};
        const fracs = [];
        let used = 0;
        keys.forEach(function (k) {
            const ideal = Math.max(0, Number(idealMap[k]) || 0);
            const fl = Math.floor(ideal);
            out[k] = fl;
            used += fl;
            fracs.push({ k: k, frac: ideal - fl });
        });
        let left = totalBei - used;
        fracs.sort(function (a, b) {
            return b.frac - a.frac;
        });
        for (let i = 0; i < fracs.length && left > 0; i++) {
            out[fracs[i].k]++;
            left--;
        }
        let i = 0;
        while (left > 0 && fracs.length) {
            out[fracs[i % fracs.length].k]++;
            left--;
            i++;
        }
        while (left < 0 && keys.length) {
            let victim = keys[0];
            keys.forEach(function (k) {
                if ((out[k] || 0) > (out[victim] || 0)) victim = k;
            });
            if ((out[victim] || 0) <= 0) break;
            out[victim]--;
            left++;
        }
        return out;
    }

    /**
     * 固定目标 → 整数倍。
     * 保体/赢：向上取整，避免因取整导致达不到目标（保体出现亏 1 元等）。
     * 亏：取返还更接近目标的一侧。
     */
    function spfFixedBeiForRole(role, odds, S) {
        const mult = ROLE_RETURN_MULT[role];
        if (mult == null || !(odds > 1) || !(S > 0)) return 0;
        const target = S * mult;
        const exact = target / (UNIT_YUAN * odds);
        if (role === ROLE_BE || role === ROLE_WIN_Q || role === ROLE_WIN_H) {
            return Math.max(0, Math.ceil(exact - 1e-12));
        }
        const flo = Math.max(0, Math.floor(exact + 1e-12));
        const cei = Math.max(0, Math.ceil(exact - 1e-12));
        if (flo === cei) return flo;
        const rF = flo * UNIT_YUAN * odds;
        const rC = cei * UNIT_YUAN * odds;
        return Math.abs(rF - target) <= Math.abs(rC - target) ? flo : cei;
    }

    function spfAllocateStakes(items, roles, total) {
        const S = spfNormalizeBudgetYuan(total);
        if (!(S > 0)) return { error: '请输入有效总预算（2 的倍数，1倍=2元）', stakes: {}, returns: {}, beis: {} };
        const totalBei = spfYuanToBei(S);

        const list = items.map(function (it) {
            return {
                key: it.key,
                odds: it.odds,
                role: roles[it.key] || ROLE_AVG,
            };
        });

        const beis = {};
        const stakes = {};
        const returns = {};
        let usedBei = 0;
        const fixed = list.filter(function (x) {
            return ROLE_RETURN_MULT[x.role] != null;
        });
        const avg = list.filter(function (x) {
            return x.role === ROLE_AVG;
        });
        const max = list.filter(function (x) {
            return x.role === ROLE_MAX;
        });

        for (let i = 0; i < fixed.length; i++) {
            const it = fixed[i];
            if (!(it.odds > 1)) {
                return { error: '赔率无效，无法计算固定目标', stakes: {}, returns: {}, beis: {} };
            }
            const bei = spfFixedBeiForRole(it.role, it.odds, S);
            beis[it.key] = bei;
            usedBei += bei;
        }

        let remainBei = totalBei - usedBei;
        if (remainBei < 0) {
            return {
                error:
                    '预算不足以满足保体/亏/盈约束（还需 ' +
                    -remainBei +
                    ' 倍 / ' +
                    spfBeiToYuan(-remainBei) +
                    ' 元）',
                stakes: stakes,
                returns: returns,
                beis: beis,
            };
        }

        if (max.length) {
            let cold = max[0];
            for (let j = 1; j < max.length; j++) {
                if (max[j].odds > cold.odds) cold = max[j];
            }
            for (let j = 0; j < max.length; j++) {
                beis[max[j].key] = max[j].key === cold.key ? remainBei : 0;
            }
            for (let j = 0; j < avg.length; j++) {
                beis[avg[j].key] = 0;
            }
            remainBei = 0;
        } else if (avg.length && remainBei > 0) {
            let sumInv = 0;
            for (let j = 0; j < avg.length; j++) sumInv += 1 / avg[j].odds;
            if (!(sumInv > 0)) {
                return { error: '平均优化计算失败', stakes: stakes, returns: returns, beis: beis };
            }
            // 理想：各项返还相等 → stake_i = R/odds_i，bei_i = R/(2*odds_i)，且 Σbei = remainBei
            // R = remainYuan / Σ(1/odds) = (remainBei*2) / sumInv
            const remainYuan = spfBeiToYuan(remainBei);
            const R = remainYuan / sumInv;
            const ideal = {};
            const keys = [];
            for (let j = 0; j < avg.length; j++) {
                const it = avg[j];
                keys.push(it.key);
                ideal[it.key] = R / (UNIT_YUAN * it.odds);
            }
            const dist = spfDistributeIntegerBei(keys, ideal, remainBei);
            for (let j = 0; j < keys.length; j++) {
                beis[keys[j]] = dist[keys[j]] || 0;
            }
            remainBei = 0;
        } else {
            for (let j = 0; j < avg.length; j++) {
                if (beis[avg[j].key] == null) beis[avg[j].key] = 0;
            }
        }

        list.forEach(function (it) {
            const bei = beis[it.key] != null ? beis[it.key] : 0;
            const yuan = spfBeiToYuan(bei);
            beis[it.key] = bei;
            stakes[it.key] = yuan;
            returns[it.key] = yuan * it.odds;
        });

        return {
            error: null,
            stakes: stakes,
            returns: returns,
            beis: beis,
            totalBei: totalBei,
            totalYuan: S,
            warn:
                max.length && avg.length
                    ? '同时存在「平均」与「最大化」时，剩余倍数优先给最大化（最高赔）'
                    : null,
        };
    }

    function spfEscapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function spfMatchIdFromTr(tr) {
        if (!tr || !tr.id) return '';
        return String(tr.id).replace(/^list_/, '');
    }

    function spfPoolFromOddsSpan(span) {
        if (!span) return '';
        if (span.closest('div.hadOdds')) return 'had';
        if (span.closest('div.hhadOdds')) return 'hhad';
        return '';
    }

    function spfOutcomeIndex(span) {
        const wrap = span && span.closest('div.hadOdds, div.hhadOdds');
        if (!wrap) return -1;
        const spans = wrap.querySelectorAll('span.oddsItem');
        for (let i = 0; i < spans.length; i++) {
            if (spans[i] === span) return i;
        }
        return -1;
    }

    function spfItemKey(pool, index) {
        return pool + ':' + index;
    }

    function spfDescribeOddsSpan(span) {
        const pool = spfPoolFromOddsSpan(span);
        const index = spfOutcomeIndex(span);
        const odds = parseOdds(span && span.textContent);
        if (!pool || index < 0 || odds == null) return null;
        const tr = span.closest('tr.listTr');
        const goalLine =
            pool === 'hhad' && tr
                ? String((tr.querySelector('div.hhadGL') || {}).textContent || '')
                      .replace(/\s+/g, '')
                : '0';
        return {
            key: spfItemKey(pool, index),
            pool: pool,
            index: index,
            odds: odds,
            outcome: OUTCOME_LABELS[index] || String(index),
            market:
                pool === 'had'
                    ? 'HAD 胜平负'
                    : 'HHAD 让球' + (goalLine ? '(' + goalLine + ')' : ''),
            el: span,
        };
    }

    function spfCollectSelectedOnTr(tr, extraSpan) {
        const map = {};
        if (!tr) return [];
        tr.querySelectorAll('div.hadOdds span.oddsItem.oddsClk, div.hhadOdds span.oddsItem.oddsClk')
            .forEach(function (span) {
                const item = spfDescribeOddsSpan(span);
                if (item) map[item.key] = item;
            });
        if (extraSpan) {
            const item = spfDescribeOddsSpan(extraSpan);
            if (item) map[item.key] = item;
        }
        return Object.keys(map).map(function (k) {
            return map[k];
        });
    }

    function spfReadMatchMeta(tr) {
        if (!tr) return {};
        const vs = tr.querySelector('td.vsTd');
        const home =
            (vs && vs.querySelector('.team-left .vs-left-padding')) ||
            (vs && vs.querySelector('.team-left'));
        const away =
            (vs && vs.querySelector('.team-right .vs-right-padding')) ||
            (vs && vs.querySelector('.team-right'));
        const numTd = tr.querySelector('td');
        return {
            id: spfMatchIdFromTr(tr),
            matchNum: numTd ? String(numTd.innerText || '').replace(/\s+/g, '') : '',
            home: home ? String(home.textContent || '').trim() : '',
            away: away ? String(away.textContent || '').trim() : '',
            league: tr.querySelector('td.lname')
                ? String(tr.querySelector('td.lname').textContent || '').trim()
                : '',
            matchNumDate: tr.getAttribute('matchNumDate') || '',
            taxDateNo: tr.getAttribute('taxDateNo') || '',
            date: spfResolveMatchDate(tr),
        };
    }

    function spfResolveMatchDate(tr) {
        if (!tr) return '';
        let d =
            spfFormatTicketDate(tr.getAttribute('matchNumDate')) ||
            spfFormatTicketDate(tr.getAttribute('taxDateNo'));
        if (d) return d;
        let row = tr.previousElementSibling;
        while (row) {
            const td = row.querySelector && row.querySelector('td.bDateTd');
            if (td) {
                const t = String(td.textContent || '');
                let m = t.match(/(\d{4}-\d{2}-\d{2})/);
                if (m) return spfFormatTicketDate(m[1]);
                m = t.match(/(\d{2}-\d{2})/);
                if (m) return m[1];
                break;
            }
            row = row.previousElementSibling;
        }
        try {
            const di = tr.getAttribute('dataIndex') || tr.getAttribute('dataindex');
            if (di && typeof window.curData !== 'undefined' && window.curData) {
                const parts = String(di).split('_');
                const i = Number(parts[0]);
                const j = Number(parts[1]);
                const obj = window.curData[i] && window.curData[i][j];
                if (obj) {
                    d =
                        spfFormatTicketDate(obj.b_date) ||
                        spfFormatTicketDate(obj.match_num_date);
                    if (d) return d;
                }
            }
        } catch (e0) {}
        return '';
    }

    function spfApplyPreset(preset) {
        const items = spfCalcState.items;
        const roles = {};
        spfCalcState.activePreset = preset || '';
        if (!items.length) {
            spfCalcState.roles = roles;
            return;
        }
        if (preset === 'avg') {
            items.forEach(function (it) {
                roles[it.key] = ROLE_AVG;
            });
        } else if (preset === 'be_cold' || preset === 'be_hot') {
            const sorted = items.slice().sort(function (a, b) {
                return a.odds - b.odds;
            });
            if (preset === 'be_cold') {
                for (let i = 0; i < sorted.length - 1; i++) roles[sorted[i].key] = ROLE_BE;
                roles[sorted[sorted.length - 1].key] = ROLE_MAX;
                if (sorted.length === 1) roles[sorted[0].key] = ROLE_MAX;
            } else {
                roles[sorted[0].key] = ROLE_MAX;
                for (let i = 1; i < sorted.length; i++) roles[sorted[i].key] = ROLE_BE;
                if (sorted.length === 1) roles[sorted[0].key] = ROLE_MAX;
            }
        }
        spfCalcState.roles = roles;
    }

    function spfInjectCalcStyle() {
        let style = document.getElementById(SPF_CALC_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = SPF_CALC_STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = [
            '#' + SPF_CALC_MODAL_ID + '{',
            '  position:fixed;inset:0;z-index:2147483000;display:none;',
            '  align-items:center;justify-content:center;padding:12px;',
            '  background:rgba(0,0,0,.45);',
            '}',
            '#' + SPF_CALC_MODAL_ID + '.tm-show{display:flex;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-dlg{',
            '  width:min(920px,98vw);max-height:none;overflow:hidden;',
            '  background:#fff;border:1px solid #cfd8e3;border-radius:6px;',
            '  box-shadow:0 8px 28px rgba(0,0,0,.28);',
            '  font:12px/1.35 "Microsoft YaHei",system-ui,sans-serif;color:#222;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-dlg-hd{',
            '  display:flex;align-items:center;justify-content:space-between;',
            '  height:36px;padding:0 10px 0 12px;background:#2b4a7c;color:#fff;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-dlg-hd .tm-hd-left{',
            '  display:flex;align-items:baseline;gap:8px;min-width:0;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-dlg-hd .tm-title{font-size:13px;font-weight:700;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-dlg-hd .tm-ver{font-size:11px;opacity:.7;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-dlg-hd button[data-tm-close]{',
            '  width:24px;height:24px;border:0;border-radius:3px;background:transparent;',
            '  color:#fff;font-size:16px;line-height:1;cursor:pointer;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-dlg-hd button[data-tm-close]:hover{background:rgba(255,255,255,.15);}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-dlg-bd{padding:8px 10px 10px;overflow:hidden;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-bar{',
            '  display:flex;align-items:center;flex-wrap:nowrap;gap:8px;',
            '  margin-bottom:8px;min-height:28px;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-bar-match{',
            '  flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
            '  color:#333;font-weight:600;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-bar-match .tm-muted{color:#888;font-weight:400;margin-right:6px;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-budget{',
            '  display:flex;align-items:center;gap:4px;flex:none;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-budget label{color:#666;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-budget input{',
            '  width:64px;height:26px;padding:0 6px;box-sizing:border-box;',
            '  border:1px solid #c9d3e0;border-radius:3px;outline:none;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-budget input:focus{border-color:#2b4a7c;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-budget-hint{color:#888;margin-left:2px;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-presets{display:flex;gap:4px;flex:none;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-presets button{',
            '  height:26px;padding:0 8px;border:1px solid #c9d3e0;border-radius:3px;',
            '  background:#f7f9fc;color:#333;cursor:pointer;font:12px/26px "Microsoft YaHei",sans-serif;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-presets button:hover{background:#eef3fb;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-presets button.tm-on{',
            '  border-color:#2b4a7c;background:#2b4a7c;color:#fff;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl{',
            '  width:100%;border-collapse:collapse;table-layout:fixed;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl th,',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl td{',
            '  border:1px solid #e3e8ef;padding:4px 6px;text-align:left;',
            '  vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl td:has(.tm-goals){',
            '  overflow:visible;text-overflow:clip;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl th{',
            '  background:#f3f6fa;color:#556;font-weight:600;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl col.c-pool{width:10%;}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl col.c-out{width:11%;}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl col.c-odds{width:7%;}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl col.c-role{width:44%;}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl col.c-num{width:9%;}',
            '#' + SPF_CALC_MODAL_ID + ' table.tm-tbl td.tm-num{',
            '  text-align:right;font-variant-numeric:tabular-nums;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-outs{',
            '  display:flex;flex-wrap:nowrap;gap:2px;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-outs span{',
            '  flex:1;min-width:0;height:22px;padding:0 2px;border:1px solid transparent;',
            '  border-radius:2px;',
            '  text-align:center;font:11px/22px "Microsoft YaHei",sans-serif;',
            '}',
            /* 胜：淡红 */
            '#' + SPF_CALC_MODAL_ID + ' .tm-outs span.tm-o-w{',
            '  border-color:#e8b4b4;background:#fdeeee;color:#c07070;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-outs span.tm-o-w.tm-on{',
            '  border-color:#c62828;background:#e57373;color:#fff;font-weight:700;',
            '}',
            /* 平：浅绿 */
            '#' + SPF_CALC_MODAL_ID + ' .tm-outs span.tm-o-d{',
            '  border-color:#b5d9c0;background:#eef8f1;color:#5a9a6e;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-outs span.tm-o-d.tm-on{',
            '  border-color:#2e7d32;background:#66bb6a;color:#fff;font-weight:700;',
            '}',
            /* 负：浅蓝 */
            '#' + SPF_CALC_MODAL_ID + ' .tm-outs span.tm-o-l{',
            '  border-color:#b4c8e0;background:#eef4fb;color:#6a8ab0;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-outs span.tm-o-l.tm-on{',
            '  border-color:#1565c0;background:#64b5f6;color:#fff;font-weight:700;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals{',
            '  display:flex;flex-wrap:nowrap;align-items:center;gap:5px;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-g-group{',
            '  display:flex;flex-wrap:nowrap;gap:2px;padding:1px;',
            '  border:1px solid transparent;border-radius:3px;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-g-group[data-g="avg"]{background:#f3f6fa;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-g-group[data-g="be"]{background:#eef8f1;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-g-group[data-g="lose"]{background:#fff8e8;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-g-group[data-g="win"]{background:#fdf0f0;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button{',
            '  flex:none;min-width:0;height:22px;padding:0 4px;border:1px solid transparent;',
            '  border-radius:2px;cursor:pointer;',
            '  font:11px/22px "Microsoft YaHei",sans-serif;white-space:nowrap;',
            '}',
            /* 平均：灰蓝 */
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-avg{',
            '  border-color:#90a4c4;background:#edf2f8;color:#3d5a80;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-avg:hover{background:#dde7f3;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-avg.tm-on{',
            '  border-color:#3d5a80;background:#3d5a80;color:#fff;',
            '}',
            /* 保体：绿 */
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-be{',
            '  border-color:#7cb98a;background:#eaf6ee;color:#1b6b36;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-be:hover{background:#d8efdf;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-be.tm-on{',
            '  border-color:#1b6b36;background:#1b6b36;color:#fff;',
            '}',
            /* 亏：琥珀 */
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-lose{',
            '  border-color:#d4a017;background:#fff6e0;color:#8a5a00;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-lose:hover{background:#ffefc2;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-lose.tm-on{',
            '  border-color:#b07000;background:#b07000;color:#fff;',
            '}',
            /* 盈：红 */
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-win{',
            '  border-color:#d98080;background:#fdeeee;color:#a32020;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-win:hover{background:#fadada;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-goals button.tm-g-win.tm-on{',
            '  border-color:#b71c1c;background:#b71c1c;color:#fff;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-foot{',
            '  display:flex;justify-content:space-between;align-items:center;gap:8px;',
            '  margin-top:6px;color:#666;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-foot-left{',
            '  display:flex;align-items:center;gap:10px;min-width:0;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-copy-ticket{',
            '  height:26px;padding:0 10px;border:1px solid #2b4a7c;border-radius:3px;',
            '  background:#2b4a7c;color:#fff;cursor:pointer;',
            '  font:12px/26px "Microsoft YaHei",sans-serif;flex:none;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-copy-ticket:hover{background:#3a5f99;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-copy-ticket:disabled{',
            '  opacity:.55;cursor:not-allowed;',
            '}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-copy-ticket.tm-ok{background:#1b6b36;border-color:#1b6b36;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-copy-ticket.tm-fail{background:#b71c1c;border-color:#b71c1c;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-pos{color:#0a7a32;font-weight:700;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-neg{color:#c62828;font-weight:700;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-zero{color:#555;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-err{margin-top:6px;color:#b71c1c;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-warn{margin-top:6px;color:#8d6e00;}',
            '#' + SPF_CALC_MODAL_ID + ' .tm-empty{padding:12px 0;text-align:center;color:#888;}',
            '#mainTbl span.oddsItem{cursor:pointer;}',
        ].join('\n');
    }

    function spfEnsureModal() {
        spfInjectCalcStyle();
        let modal = document.getElementById(SPF_CALC_MODAL_ID);
        if (modal) {
            const ver = modal.querySelector('.tm-ver');
            if (ver) ver.textContent = 'v' + SCRIPT_VERSION;
            const title = modal.querySelector('.tm-title');
            if (title) title.textContent = '单场方案计算器';
            return modal;
        }
        modal = document.createElement('div');
        modal.id = SPF_CALC_MODAL_ID;
        modal.innerHTML =
            '<div class="tm-dlg" role="dialog" aria-modal="true">' +
            '<div class="tm-dlg-hd"><div class="tm-hd-left">' +
            '<span class="tm-title">单场方案计算器</span>' +
            '<span class="tm-ver">v' + SCRIPT_VERSION + '</span>' +
            '</div>' +
            '<button type="button" data-tm-close title="关闭">×</button></div>' +
            '<div class="tm-dlg-bd"></div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal || (e.target && e.target.getAttribute('data-tm-close') != null)) {
                modal.classList.remove('tm-show');
            }
        });
        return modal;
    }

    function spfOutcomeChipsHtml(selectedIndex) {
        const cls = ['tm-o-w', 'tm-o-d', 'tm-o-l'];
        return (
            '<div class="tm-outs">' +
            OUTCOME_LABELS.map(function (label, i) {
                return (
                    '<span class="' +
                    cls[i] +
                    (i === selectedIndex ? ' tm-on' : '') +
                    '">' +
                    spfEscapeHtml(label) +
                    '</span>'
                );
            }).join('') +
            '</div>'
        );
    }

    function spfGoalButtonsHtml(itemKey, selected) {
        const clsMap = {
            avg: 'tm-g-avg',
            breakeven: 'tm-g-be',
            lose_q: 'tm-g-lose',
            half: 'tm-g-lose',
            lose_3q: 'tm-g-lose',
            win_q: 'tm-g-win',
            win_half: 'tm-g-win',
            max: 'tm-g-win',
        };
        return (
            '<div class="tm-goals" data-role-key="' +
            spfEscapeHtml(itemKey) +
            '">' +
            ROLE_GROUPS.map(function (g) {
                return (
                    '<span class="tm-g-group" data-g="' +
                    g.id +
                    '">' +
                    g.roles
                        .map(function (r) {
                            return (
                                '<button type="button" data-role-value="' +
                                r +
                                '" class="' +
                                clsMap[r] +
                                (r === selected ? ' tm-on' : '') +
                                '">' +
                                ROLE_LABELS[r] +
                                '</button>'
                            );
                        })
                        .join('') +
                    '</span>'
                );
            }).join('') +
            '</div>'
        );
    }

    function spfPoolShort(it) {
        if (it.pool === 'hhad') {
            const m = String(it.market || '').match(/\(([^)]+)\)/);
            return m ? 'HHAD(' + m[1] + ')' : 'HHAD';
        }
        return 'HAD';
    }

    function spfRenderCalcBody() {
        const modal = spfEnsureModal();
        const bd = modal.querySelector('.tm-dlg-bd');
        const m = spfCalcState.matchMeta || {};
        const alloc = spfAllocateStakes(spfCalcState.items, spfCalcState.roles, spfCalcState.total);

        let usedBei = 0;
        Object.keys(alloc.beis || {}).forEach(function (k) {
            usedBei += Number(alloc.beis[k]) || 0;
        });
        const budgetYuan = alloc.totalYuan != null ? alloc.totalYuan : spfNormalizeBudgetYuan(spfCalcState.total);
        const budgetBei = alloc.totalBei != null ? alloc.totalBei : spfYuanToBei(budgetYuan);

        const matchLine =
            (m.matchNum ? m.matchNum + ' ' : '') +
            (m.league ? m.league + ' ' : '') +
            (m.home || '?') +
            ' vs ' +
            (m.away || '?');

        let html = '';
        html +=
            '<div class="tm-bar">' +
            '<div class="tm-bar-match" title="' +
            spfEscapeHtml(matchLine) +
            '">' +
            spfEscapeHtml(matchLine) +
            '</div>' +
            '<div class="tm-budget" title="竞彩最小 1 倍 = 2 元"><label>预算</label>' +
            '<input type="number" min="2" step="2" data-tm-total value="' +
            spfEscapeHtml(String(budgetYuan)) +
            '"><span class="tm-budget-hint">' +
            budgetBei +
            '倍</span></div>' +
            '<div class="tm-presets">' +
            '<button type="button" data-preset="avg"' +
            (spfCalcState.activePreset === 'avg' ? ' class="tm-on"' : '') +
            '>平均</button>' +
            '<button type="button" data-preset="be_cold"' +
            (spfCalcState.activePreset === 'be_cold' ? ' class="tm-on"' : '') +
            '>保本博冷</button>' +
            '<button type="button" data-preset="be_hot"' +
            (spfCalcState.activePreset === 'be_hot' ? ' class="tm-on"' : '') +
            '>保本博热</button>' +
            '</div></div>';

        if (!spfCalcState.items.length) {
            html += '<div class="tm-empty">先选中至少 2 项，再右击打开</div>';
            bd.innerHTML = html;
            bindCalcBodyEvents(bd);
            return;
        }

        html +=
            '<table class="tm-tbl"><colgroup>' +
            '<col class="c-pool"><col class="c-out"><col class="c-odds"><col class="c-role">' +
            '<col class="c-num"><col class="c-num"><col class="c-num">' +
            '</colgroup><thead><tr>' +
            '<th>玩法</th><th>项</th><th>赔率</th><th>目标</th>' +
            '<th>倍数</th><th>返还</th><th>盈亏</th>' +
            '</tr></thead><tbody>';

        spfCalcState.items.forEach(function (it) {
            const role = spfCalcState.roles[it.key] || ROLE_AVG;
            const bei = alloc.beis && alloc.beis[it.key] != null ? alloc.beis[it.key] : 0;
            const stake = alloc.stakes[it.key] != null ? alloc.stakes[it.key] : spfBeiToYuan(bei);
            const ret = alloc.returns[it.key] != null ? alloc.returns[it.key] : 0;
            const pnl = ret - budgetYuan;
            let cls = 'tm-zero';
            if (pnl > 0.005) cls = 'tm-pos';
            else if (pnl < -0.005) cls = 'tm-neg';
            html +=
                '<tr>' +
                '<td title="' +
                spfEscapeHtml(it.market || '') +
                '">' +
                spfEscapeHtml(spfPoolShort(it)) +
                '</td>' +
                '<td>' +
                spfOutcomeChipsHtml(it.index) +
                '</td>' +
                '<td class="tm-num">' +
                spfFormatMoney(it.odds) +
                '</td>' +
                '<td>' +
                spfGoalButtonsHtml(it.key, role) +
                '</td>' +
                '<td class="tm-num" title="' +
                spfEscapeHtml(spfFormatMoney(stake) + ' 元') +
                '">' +
                spfEscapeHtml(spfFormatBei(bei)) +
                '</td>' +
                '<td class="tm-num">' +
                spfFormatMoney(ret) +
                '</td>' +
                '<td class="tm-num ' +
                cls +
                '">' +
                (pnl >= 0 ? '+' : '') +
                spfFormatMoney(pnl) +
                '</td></tr>';
        });
        html += '</tbody></table>';

        if (alloc.error) html += '<div class="tm-err">' + spfEscapeHtml(alloc.error) + '</div>';
        else if (alloc.warn) html += '<div class="tm-warn">' + spfEscapeHtml(alloc.warn) + '</div>';

        html +=
            '<div class="tm-foot"><div class="tm-foot-left"><span>已分配 ' +
            usedBei +
            ' / ' +
            budgetBei +
            ' 倍（' +
            budgetYuan +
            ' 元）</span><span>' +
            spfCalcState.items.length +
            ' 项</span></div>' +
            '<button type="button" class="tm-copy-ticket" data-tm-copy-ticket' +
            (alloc.error ? ' disabled' : '') +
            '>复制出票</button></div>';

        bd.innerHTML = html;
        bindCalcBodyEvents(bd);
    }

    function spfTicketMatchCode(matchNum) {
        const s = String(matchNum || '').replace(/\s+/g, '');
        const m = s.match(/周([一二三四五六日天])(\d{3})/);
        if (m) {
            const dayMap = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 日: '7', 天: '7' };
            return (dayMap[m[1]] || '') + m[2];
        }
        const n = s.match(/(\d{4})/);
        return n ? n[1] : s;
    }

    function spfFormatTicketDate(raw) {
        const s = String(raw || '').replace(/\s+/g, '');
        let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[2] + '-' + m[3];
        m = s.match(/(\d{4})(\d{2})(\d{2})/);
        if (m) return m[2] + '-' + m[3];
        m = s.match(/^(\d{2})-(\d{2})$/);
        if (m) return m[1] + '-' + m[2];
        return '';
    }

    function spfTicketPlayLabel(items) {
        let had = false;
        let hhad = false;
        (items || []).forEach(function (it) {
            if (it.pool === 'hhad') hhad = true;
            else had = true;
        });
        if (had && hhad) return '胜平负/让球胜平负';
        if (hhad) return '让球胜平负';
        return '胜平负';
    }

    function spfTicketOutcomeLabel(it) {
        const base = OUTCOME_LABELS[it.index] || it.outcome || '';
        if (it.pool === 'hhad') {
            const m = String(it.market || '').match(/\(([^)]+)\)/);
            const h = m ? m[1] : '';
            return '让' + base + (h ? '(' + h + ')' : '');
        }
        return base;
    }

    function spfStakeToBei(stake) {
        const n = Number(stake);
        if (!(n > 0)) return 0;
        return Math.max(0, Math.round(n / UNIT_YUAN));
    }

    function spfPadTicketLabel(label, minWidth) {
        // 用全角空格补齐，贴近店主出票对齐习惯
        let w = 0;
        for (let i = 0; i < label.length; i++) {
            const c = label.charCodeAt(i);
            w += c > 127 ? 2 : 1;
        }
        let pad = '';
        while (w + pad.length * 2 < minWidth) pad += '\u3000';
        return label + pad;
    }

    function spfBuildTicketText(alloc) {
        const m = spfCalcState.matchMeta || {};
        const code = spfTicketMatchCode(m.matchNum);
        const dateStr =
            m.date ||
            spfFormatTicketDate(m.matchNumDate) ||
            spfFormatTicketDate(m.taxDateNo);
        const home = String(m.home || '').trim().replace(/\s+/g, '') || '?';
        const away = String(m.away || '').trim().replace(/\s+/g, '') || '?';
        const league = String(m.league || '').trim().replace(/\s+/g, '');
        const play = spfTicketPlayLabel(spfCalcState.items);
        const lines = [];
        lines.push('竞彩足球单场:');
        // 例：08-04  瑞超  佐加顿斯vs韦斯特罗  胜平负
        lines.push(
            [dateStr, league, home + 'vs' + away, play]
                .filter(function (x) {
                    return !!x;
                })
                .join('  ')
        );

        const beiList = [];
        let maxLabelW = 12;
        const rows = [];
        spfCalcState.items.forEach(function (it) {
            const bei =
                alloc.beis && alloc.beis[it.key] != null
                    ? Math.round(Number(alloc.beis[it.key]) || 0)
                    : spfStakeToBei(alloc.stakes[it.key]);
            if (!bei) return;
            // 例：1003   平
            const label = code + '   ' + spfTicketOutcomeLabel(it);
            let w = 0;
            for (let i = 0; i < label.length; i++) {
                w += label.charCodeAt(i) > 127 ? 2 : 1;
            }
            if (w > maxLabelW) maxLabelW = w;
            rows.push({ label: label, bei: bei });
            beiList.push(bei);
        });

        rows.forEach(function (row) {
            lines.push(spfPadTicketLabel(row.label, maxLabelW + 2) + '\u2002🟩' + row.bei + '倍');
        });

        const totalBei = beiList.reduce(function (a, b) {
            return a + b;
        }, 0);
        const yuan = totalBei * UNIT_YUAN;
        lines.push('');
        lines.push(
            '支付宝已转账:' +
                yuan +
                '元（共' +
                totalBei +
                '倍：' +
                beiList
                    .map(function (b) {
                        return b + '倍';
                    })
                    .join('， ') +
                '）'
        );
        return lines.join('\n');
    }

    function spfCopyText(text, onDone) {
        function finish(ok) {
            if (onDone) onDone(!!ok);
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(
                function () {
                    finish(true);
                },
                function () {
                    legacyCopy();
                }
            );
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

    function bindCalcBodyEvents(bd) {
        if (!bd) return;
        const totalInp = bd.querySelector('[data-tm-total]');
        if (totalInp) {
            const onTotal = function () {
                const v = spfNormalizeBudgetYuan(totalInp.value);
                if (v > 0) {
                    spfCalcState.total = v;
                    spfRenderCalcBody();
                }
            };
            totalInp.addEventListener('change', onTotal);
            totalInp.addEventListener('input', onTotal);
        }
        bd.querySelectorAll('[data-preset]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                spfApplyPreset(btn.getAttribute('data-preset'));
                spfSaveCalcGoalsForCurrentMatch();
                spfRenderCalcBody();
            });
        });
        bd.querySelectorAll('.tm-goals button[data-role-value]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const wrap = btn.closest('.tm-goals');
                const key = wrap && wrap.getAttribute('data-role-key');
                const val = btn.getAttribute('data-role-value');
                if (!key || !val) return;
                spfCalcState.roles[key] = val;
                spfCalcState.activePreset = '';
                spfSaveCalcGoalsForCurrentMatch();
                spfRenderCalcBody();
            });
        });
        const copyBtn = bd.querySelector('[data-tm-copy-ticket]');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                if (copyBtn.disabled) return;
                const alloc = spfAllocateStakes(
                    spfCalcState.items,
                    spfCalcState.roles,
                    spfCalcState.total
                );
                if (alloc.error || !spfCalcState.items.length) return;
                const text = spfBuildTicketText(alloc);
                copyBtn.disabled = true;
                spfCopyText(text, function (ok) {
                    copyBtn.classList.remove('tm-ok', 'tm-fail');
                    copyBtn.classList.add(ok ? 'tm-ok' : 'tm-fail');
                    copyBtn.textContent = ok ? '已复制' : '复制失败';
                    setTimeout(function () {
                        copyBtn.classList.remove('tm-ok', 'tm-fail');
                        copyBtn.textContent = '复制出票';
                        copyBtn.disabled = false;
                    }, 1200);
                });
            });
        }
    }

    function spfValidRole(v) {
        return !!ROLE_LABELS[v];
    }

    function spfPruneGoneMatchesInSaved(saved) {
        if (!saved) return saved;
        const allIds = spfCurDataMatchIds();
        if (allIds) {
            Object.keys(saved).forEach(function (id) {
                if (!allIds[id]) delete saved[id];
            });
            return saved;
        }
        const onPage = {};
        document.querySelectorAll('#mainTbl tr.listTr').forEach(function (tr) {
            const id = spfMatchIdFromTr(tr);
            if (id) onPage[id] = true;
        });
        if (Object.keys(onPage).length) {
            Object.keys(saved).forEach(function (id) {
                if (!onPage[id]) delete saved[id];
            });
        }
        return saved;
    }

    function spfSaveCalcGoalsForCurrentMatch() {
        const matchId = spfCalcState.matchMeta && spfCalcState.matchMeta.id;
        if (!matchId || PAGE.key !== 'spf') return;
        const saved = spfLoadSavedSelections();
        let entry = saved[matchId];
        if (!entry) {
            // 无选中记录时不单独存目标
            return;
        }
        const roles = {};
        (spfCalcState.items || []).forEach(function (it) {
            const r = spfCalcState.roles[it.key];
            roles[it.key] = spfValidRole(r) ? r : ROLE_AVG;
        });
        entry.roles = roles;
        entry.activePreset = spfCalcState.activePreset || '';
        saved[matchId] = entry;
        spfPruneGoneMatchesInSaved(saved);
        spfPersistSavedSelections(saved);
    }

    function spfOpenCalculator(tr, extraSpan) {
        const items = spfCollectSelectedOnTr(tr, extraSpan);
        spfCalcState.matchMeta = spfReadMatchMeta(tr);
        spfCalcState.items = items;
        const matchId = spfCalcState.matchMeta && spfCalcState.matchMeta.id;
        const saved = spfLoadSavedSelections();
        const entry = matchId ? saved[matchId] : null;
        const savedRoles = entry && entry.roles && typeof entry.roles === 'object' ? entry.roles : {};

        spfCalcState.roles = {};
        let restored = 0;
        items.forEach(function (it) {
            if (spfValidRole(savedRoles[it.key])) {
                spfCalcState.roles[it.key] = savedRoles[it.key];
                restored++;
            } else {
                spfCalcState.roles[it.key] = ROLE_AVG;
            }
        });

        if (restored > 0) {
            spfCalcState.activePreset = entry.activePreset || '';
        } else {
            const pools = {};
            items.forEach(function (it) {
                pools[it.pool] = (pools[it.pool] || 0) + 1;
            });
            const dualSame =
                (pools.had === 2 && !pools.hhad) || (pools.hhad === 2 && !pools.had);
            spfApplyPreset(items.length >= 2 && dualSame ? 'be_cold' : 'avg');
        }
        spfEnsureModal().classList.add('tm-show');
        spfRenderCalcBody();
    }

    function spfEventEl(e) {
        const t = e && e.target;
        if (!t) return null;
        if (t.nodeType === 1) return t;
        return t.parentElement || null;
    }

    function spfFindOddsSpanFromEvent(e) {
        const el = spfEventEl(e);
        if (!el || typeof el.closest !== 'function') return null;
        // 优先赔率格；点到 hadOdds/hhadOdds 容器时取最近子赔率
        let span = el.closest('span.oddsItem');
        if (!span) {
            const wrap = el.closest('div.hadOdds, div.hhadOdds');
            if (wrap) {
                // 按点击位置找子 span；找不到则取第一个有效赔率
                const spans = wrap.querySelectorAll('span.oddsItem');
                span = spans[0] || null;
                for (let i = 0; i < spans.length; i++) {
                    if (spfShouldHandleOddsContext(spans[i])) {
                        span = spans[i];
                        break;
                    }
                }
            }
        }
        if (!span) return null;
        if (!document.getElementById('mainTbl') || span.closest('#mainTbl') || span.closest('div.hadOdds, div.hhadOdds')) {
            return span;
        }
        return null;
    }

    function spfShouldHandleOddsContext(span) {
        if (!span) return false;
        // 止售后仍允许打开计算器（用当前显示赔率）
        const txt = String(span.textContent || '').trim().replace(/[^\d.]/g, '');
        if (!txt || txt === '--') return false;
        return parseOdds(txt) != null || parseOdds(span.textContent) != null;
    }

    let spfCalcOpenedAt = 0;

    function spfBlockEvent(e) {
        if (!e) return false;
        try {
            e.preventDefault();
        } catch (err0) {}
        try {
            e.stopPropagation();
        } catch (err1) {}
        try {
            if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        } catch (err2) {}
        try {
            e.cancelBubble = true;
            e.returnValue = false;
        } catch (err3) {}
        return false;
    }

    /** 只负责杀掉浏览器菜单（必须在 contextmenu 上调用） */
    function spfKillBrowserMenuIfOdds(e) {
        if (!spfFindOddsSpanFromEvent(e)) return false;
        spfBlockEvent(e);
        return true;
    }

    function spfTryOpenFromEvent(e) {
        const span = spfFindOddsSpanFromEvent(e);
        if (!span || !spfShouldHandleOddsContext(span)) return false;
        const tr = span.closest('tr.listTr') || span.closest('tr');
        if (!tr) return false;
        spfBlockEvent(e);
        const now = Date.now();
        if (now - spfCalcOpenedAt < 400) return true;
        spfCalcOpenedAt = now;
        try {
            spfOpenCalculator(tr, span);
        } catch (err) {
            console.error('[tm-spf] open calculator failed', err);
        }
        return true;
    }

    function spfOnOddsContextMenu(e) {
        // 先无条件拦截菜单，再打开计算器（切勿在 mousedown 里打开，否则菜单仍会弹出）
        if (!spfKillBrowserMenuIfOdds(e)) return;
        spfTryOpenFromEvent(e);
        return false;
    }

    /** 给每个赔率格挂原生 oncontextmenu（return false 压浏览器菜单） */
    function spfBindOddsItemContextHandlers(root) {
        const scope = root || document;
        if (!scope.querySelectorAll) return;
        const nodes = scope.querySelectorAll(
            '#mainTbl span.oddsItem, #mainTbl div.hadOdds, #mainTbl div.hhadOdds, #mainTbl td'
        );
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.__tmSpfCtx) continue;
            // 仅赔率相关 td：含 hadOdds/hhadOdds
            if (node.tagName === 'TD') {
                if (!node.querySelector('div.hadOdds, div.hhadOdds')) continue;
            }
            node.__tmSpfCtx = true;
            node.oncontextmenu = function (ev) {
                if (!spfFindOddsSpanFromEvent(ev)) return true;
                spfBlockEvent(ev);
                spfTryOpenFromEvent(ev);
                return false;
            };
        }
    }

    function initSpfPlanCalculator() {
        if (spfCalcInited || PAGE.key !== 'spf') return;
        spfCalcInited = true;
        spfInjectCalcStyle();
        try {
            console.info('[tm-spf] plan calculator v' + SCRIPT_VERSION + ' ready — right-click odds to open');
        } catch (e0) {}

        const opts = { capture: true, passive: false };
        // 只在 contextmenu 打开；mousedown 右键仅预标记，不弹窗
        window.addEventListener('contextmenu', spfOnOddsContextMenu, opts);
        document.addEventListener('contextmenu', spfOnOddsContextMenu, opts);

        const bindTbl = function () {
            const tbl = document.getElementById('mainTbl');
            if (tbl && !tbl.__tmSpfCtxBound) {
                tbl.__tmSpfCtxBound = true;
                tbl.addEventListener('contextmenu', spfOnOddsContextMenu, opts);
                tbl.oncontextmenu = function (ev) {
                    if (!spfFindOddsSpanFromEvent(ev)) return true;
                    spfBlockEvent(ev);
                    spfTryOpenFromEvent(ev);
                    return false;
                };
            }
            spfBindOddsItemContextHandlers(tbl || document);
        };
        bindTbl();

        const mo = new MutationObserver(function () {
            bindTbl();
        });
        const startMo = function () {
            const root = document.getElementById('mainTbl') || document.documentElement || document.body;
            if (!root) return false;
            mo.observe(root, { childList: true, subtree: true });
            bindTbl();
            return true;
        };
        if (!startMo()) {
            const wait = setInterval(function () {
                if (startMo()) clearInterval(wait);
            }, 200);
            setTimeout(function () {
                clearInterval(wait);
            }, 60000);
        }

        spfInjectPageContextHook();
    }

    function spfInjectPageContextHook() {
        const run = function () {
            if (!document.documentElement) return;
            // 允许重复注入时先移除旧脚本逻辑标记，改用 id 防重复
            if (document.getElementById('tm-spf-ctx-hook')) return;
            const s = document.createElement('script');
            s.id = 'tm-spf-ctx-hook';
            s.textContent =
                '(function(){' +
                'function findSpan(t){' +
                'if(!t)return null;' +
                'var el=t.nodeType===1?t:t.parentElement;' +
                'if(!el||!el.closest)return null;' +
                'var span=el.closest("span.oddsItem");' +
                'if(span)return span;' +
                'var wrap=el.closest("div.hadOdds,div.hhadOdds");' +
                'return wrap?wrap.querySelector("span.oddsItem"):null;' +
                '}' +
                'function onCtx(e){' +
                'var span=findSpan(e.target);' +
                'if(!span||!span.closest("#mainTbl"))return;' +
                'e.preventDefault();e.stopPropagation();' +
                'if(e.stopImmediatePropagation)e.stopImmediatePropagation();' +
                'e.returnValue=false;' +
                'var tr=span.closest("tr.listTr")||span.closest("tr");' +
                'if(!tr||!tr.id)return false;' +
                'var pool=span.closest("div.hadOdds")?"had":(span.closest("div.hhadOdds")?"hhad":"");' +
                'if(!pool)return false;' +
                'var spans=span.parentNode?span.parentNode.querySelectorAll("span.oddsItem"):[];' +
                'var index=-1;for(var i=0;i<spans.length;i++){if(spans[i]===span){index=i;break;}}' +
                'try{document.dispatchEvent(new CustomEvent("tm-spf-open-calc",{detail:{id:tr.id,pool:pool,index:index},bubbles:true}));}catch(err){}' +
                'return false;' +
                '}' +
                'window.addEventListener("contextmenu",onCtx,true);' +
                'document.addEventListener("contextmenu",onCtx,{capture:true,passive:false});' +
                'document.oncontextmenu=function(e){' +
                'if(!findSpan(e&&e.target))return true;' +
                'return onCtx(e),false;' +
                '};' +
                '})();';
            (document.head || document.documentElement).appendChild(s);
            document.documentElement.dataset.tmSpfCtxHook = '1';
        };
        if (document.documentElement) run();
        else document.addEventListener('readystatechange', run);

        document.addEventListener('tm-spf-open-calc', function (e) {
            const d = e && e.detail;
            if (!d || !d.id || !d.pool || d.index < 0) return;
            const tr = document.getElementById(d.id);
            if (!tr) return;
            const span = tr.querySelectorAll('div.' + d.pool + 'Odds span.oddsItem')[d.index];
            if (!span) return;
            const now = Date.now();
            if (now - spfCalcOpenedAt < 400) return;
            spfCalcOpenedAt = now;
            try {
                spfOpenCalculator(tr, span);
            } catch (err) {
                console.error('[tm-spf] open calculator failed', err);
            }
        });
    }

    function spfLoadSavedSelections() {
        try {
            const raw = localStorage.getItem(SPF_SEL_STORAGE_KEY);
            if (!raw) return {};
            const obj = JSON.parse(raw);
            return obj && typeof obj === 'object' ? obj : {};
        } catch (e) {
            return {};
        }
    }

    function spfPersistSavedSelections(map) {
        try {
            localStorage.setItem(SPF_SEL_STORAGE_KEY, JSON.stringify(map || {}));
        } catch (e) {}
    }

    function spfCurDataMatchIds() {
        const ids = {};
        const data = window.curData;
        if (!Array.isArray(data)) return null;
        let count = 0;
        data.forEach(function (day) {
            if (!Array.isArray(day)) return;
            day.forEach(function (match) {
                if (!match || match.id == null) return;
                ids[String(match.id)] = true;
                count++;
            });
        });
        return count ? ids : null;
    }

    function spfHasSingleMarker(tr, pool) {
        const gl = tr.querySelector('div.' + pool + 'GL');
        if (!gl) return false;
        const bg = window.getComputedStyle(gl).backgroundImage;
        return !!(bg && bg !== 'none');
    }

    function spfSaveSelectionsNow() {
        if (spfSelRestoring || PAGE.key !== 'spf') return;
        const saved = spfLoadSavedSelections();
        document.querySelectorAll('#mainTbl tr.listTr').forEach(function (tr) {
            const matchId = spfMatchIdFromTr(tr);
            if (!matchId) return;
            const prev = saved[matchId] || {};
            const entry = {
                had: [0, 0, 0],
                hhad: [0, 0, 0],
                meta: spfReadMatchMeta(tr),
                roles: prev.roles && typeof prev.roles === 'object' ? prev.roles : {},
                activePreset: prev.activePreset || '',
            };
            let any = false;
            ['had', 'hhad'].forEach(function (pool) {
                tr.querySelectorAll('div.' + pool + 'Odds span.oddsItem').forEach(function (span, i) {
                    if (i > 2) return;
                    if (span.classList.contains('oddsClk')) {
                        entry[pool][i] = 1;
                        any = true;
                    }
                });
            });
            if (any) {
                Object.keys(entry.roles).forEach(function (k) {
                    const parts = String(k).split(':');
                    const pool = parts[0];
                    const idx = Number(parts[1]);
                    if (pool !== 'had' && pool !== 'hhad') {
                        delete entry.roles[k];
                        return;
                    }
                    if (!(idx >= 0 && idx <= 2) || !entry[pool][idx]) {
                        delete entry.roles[k];
                    }
                });
                saved[matchId] = entry;
            } else {
                delete saved[matchId];
            }
        });

        spfPruneGoneMatchesInSaved(saved);
        spfPersistSavedSelections(saved);
    }

    function spfScheduleSaveSelections() {
        clearTimeout(spfSaveTimer);
        spfSaveTimer = setTimeout(spfSaveSelectionsNow, 80);
    }

    function spfRestoreSelectionsNow() {
        if (PAGE.key !== 'spf') return;
        if (!spfNeedRestore) return;
        const rows = document.querySelectorAll('#mainTbl tr.listTr');
        if (!rows.length) return;
        if (typeof window.selAry === 'undefined') return;

        const saved = spfLoadSavedSelections();
        const before = Object.keys(saved).join(',');
        spfPruneGoneMatchesInSaved(saved);
        const after = Object.keys(saved).join(',');
        if (before !== after) spfPersistSavedSelections(saved);

        // 表格已就绪：无论是否有可恢复项，本轮只恢复一次，避免清空后又被写回
        spfNeedRestore = false;

        if (!Object.keys(saved).length) return;
        // 用户已有选中则不覆盖
        if (window.selAryLen > 0) return;

        spfSelRestoring = true;
        try {
            Object.keys(saved).forEach(function (matchId) {
                const entry = saved[matchId];
                const tr = document.getElementById('list_' + matchId);
                if (!tr || !entry) return;
                ['had', 'hhad'].forEach(function (pool) {
                    const flags = entry[pool];
                    if (!flags || !flags.length) return;
                    const spans = tr.querySelectorAll('div.' + pool + 'Odds span.oddsItem');
                    for (let i = 0; i < 3; i++) {
                        if (!flags[i]) continue;
                        const span = spans[i];
                        if (!span || span.classList.contains('oddsDis')) continue;
                        const oddsTxt = String(span.textContent || '').trim();
                        const odds = parseOdds(oddsTxt);
                        if (odds == null) continue;
                        const key = matchId + '@' + pool;
                        if (!window.selAry[key]) {
                            window.selAry[key] = {
                                odds: ['', '', ''],
                                dataIndex:
                                    tr.getAttribute('dataIndex') || tr.getAttribute('dataindex'),
                                pool: pool,
                                single: spfHasSingleMarker(tr, pool),
                                matchNumDate: tr.getAttribute('matchNumDate'),
                                taxDateNo: tr.getAttribute('taxDateNo'),
                            };
                            window.selAryLen++;
                        }
                        window.selAry[key].odds[i] = oddsTxt;
                    }
                });
            });

            if (window.lotFunc && typeof window.lotFunc.applaySel === 'function') {
                window.lotFunc.applaySel();
            } else {
                Object.keys(window.selAry || {}).forEach(function (key) {
                    const tmp = window.selAry[key];
                    const listObj = document.getElementById('list_' + key.split('@')[0]);
                    if (!listObj || !tmp) return;
                    for (let i = 0; i < tmp.odds.length; i++) {
                        if (!tmp.odds[i]) continue;
                        const span = listObj.querySelectorAll(
                            'div.' + tmp.pool + 'Odds span.oddsItem'
                        )[i];
                        if (span) span.classList.add('oddsClk');
                    }
                });
            }
            if (window.lotFunc && typeof window.lotFunc.calculate === 'function') {
                window.lotFunc.calculate();
            }
        } finally {
            spfSelRestoring = false;
        }
    }

    function spfScheduleRestoreSelections() {
        clearTimeout(spfRestoreTimer);
        spfRestoreTimer = setTimeout(spfRestoreSelectionsNow, 200);
    }

    function initSpfSelectionPersist() {
        if (spfPersistInited || PAGE.key !== 'spf') return;
        spfPersistInited = true;
        spfNeedRestore = true;

        document.addEventListener(
            'click',
            function (e) {
                const span =
                    e.target && e.target.closest && e.target.closest('#mainTbl span.oddsItem');
                if (!span) return;
                setTimeout(spfScheduleSaveSelections, 0);
            },
            true
        );

        window.addEventListener('load', function () {
            spfNeedRestore = true;
            spfScheduleRestoreSelections();
        });
    }

    // 右键计算器：定义完成后立刻挂载（不等待 DOMContentLoaded）
    if (PAGE.key === 'spf') {
        initSpfPlanCalculator();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
