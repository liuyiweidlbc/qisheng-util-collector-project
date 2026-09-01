// ==UserScript==
// @name 8868投注记录采集
// @namespace http://tampermonkey.net/
// @version 2026-09-01.10
// @description 投注记录上传；sportEvents / inplay 左侧计划比赛列表
// @author You
// @include /^https:\/\/[\w-]*8868[\w-]*\.(app|com)\/history/
// @include /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/history/
// @include /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/sportEvents/
// @icon https://www.google.com/s2/favicons?sz=64&domain=8868a34.app
// @grant GM_xmlhttpRequest
// @connect i.socbeta.xyz
// @connect socbeta.xyz
// @run-at document-end
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'tm-8868-upload-panel';
    const STYLE_ID = 'tm-8868-upload-style';
    const TIMEOUT = 30000;
    const BET_UPLOAD_DEBOUNCE = 800;
    const SITE_URL_RETRY_MAX = 8;
    const SITE_URL_RETRY_INTERVAL = 150;

    const UPLOAD_ORDER = ['bet', 'site', 'wallet'];

    const UPLOAD_TYPES = {
        bet: {
            label: '投注记录',
            apiUrl: 'http://192.168.31.168:9999/bet/records/upload',
            matchUrl: function (url) {
                return url.includes('platform/thirdparty-report/user/orders/sport?betStatus=');
            },
            buildPayload: function (response) {
                return { bet_records_json: response };
            },
            buildDetail: function (response, responseUrl) {
                return parseBetDetail(response, responseUrl);
            }
        },
        site: {
            label: '站点URL',
            apiUrl: 'http://192.168.31.168:9999/site/url',
            matchUrl: function (url) {
                return String(url || '').includes('/product/cashout/setting');
            },
            buildPayload: function (response, responseUrl) {
                return {
                    site_url: extractSiteApiBase(responseUrl),
                    app_url: window.location.origin
                };
            },
            buildDetail: function (response, responseUrl) {
                var siteUrl = extractSiteApiBase(responseUrl);
                var lines = [];
                if (!siteUrl) {
                    lines.push({ label: '状态', value: 'site_url 未获取，等待有效接口地址' });
                }
                lines.push({ label: 'site_url', value: siteUrl || '—' });
                lines.push({ label: 'app_url', value: window.location.origin || '—' });
                if (responseUrl) {
                    lines.push({ label: '接口URL', value: responseUrl });
                }
                return { lines: lines };
            }
        },
        wallet: {
            label: '钱包余额',
            apiUrl: 'http://192.168.31.168:9999/bet/wallet/upload',
            matchUrl: function (url) {
                return url.includes('platform/payment/wallets/list');
            },
            buildPayload: function (response) {
                return { wallet_records_json: response };
            },
            buildDetail: function (response) {
                return parseWalletDetail(response);
            }
        }
    };

    var cachedData = {};
    var uploadState = createEmptyUploadState();
    var lastRouteIsHistory = null;
    var routeWatchReady = false;
    var panelCollapsed = !isHistoryPage();
    var manualUploading = false;
    var siteRetryTimers = {};
    var betUploadTimer = null;
    var betUploadInFlight = false;
    var betAutoUploadDone = false;

    function isHistoryPage() {
        return (window.location.pathname || '').indexOf('/history') >= 0;
    }

    function isSportEventsPage() {
        return (window.location.pathname || '').indexOf('/sportEvents') >= 0;
    }

    function applyUploadPanelRoute() {
        var history = isHistoryPage();
        if (document.body) applyPlanListRoute();
        var panel = document.getElementById(PANEL_ID);
        if (!panel) {
            if (!document.body) return;
            panel = createPanel();
            if (!panel) return;
        }
        if (lastRouteIsHistory === history) return;
        lastRouteIsHistory = history;
        if (history) {
            setPanelCollapsed(panel, false);
            panel.classList.remove('tm-8868-dock-left');
            console.log('[8868-upload] 投注记录页，展开上传面板');
        } else {
            setPanelCollapsed(panel, true);
            panel.classList.add('tm-8868-dock-left');
            console.log('[8868-upload] 非记录页，收起上传面板');
        }
    }

    function setupUploadRouteWatcher() {
        if (routeWatchReady) return;
        routeWatchReady = true;
        var origPush = history.pushState;
        var origReplace = history.replaceState;
        history.pushState = function () {
            var ret = origPush.apply(this, arguments);
            applyUploadPanelRoute();
            return ret;
        };
        history.replaceState = function () {
            var ret = origReplace.apply(this, arguments);
            applyUploadPanelRoute();
            return ret;
        };
        window.addEventListener('popstate', function () {
            applyUploadPanelRoute();
        });
        window.addEventListener('tm-hty-quant-route', function () {
            applyUploadPanelRoute();
        });
        setInterval(applyUploadPanelRoute, 1000);
    }

    function createEmptyUploadState() {
        var state = {};
        UPLOAD_ORDER.forEach(function (key) {
            state[key] = {
                detail: null,
                uploadTime: '',
                result: '',
                status: 'idle'
            };
        });
        return state;
    }

    function parseUrlQuery(url) {
        var out = {};
        if (!url) return out;
        var qIndex = url.indexOf('?');
        if (qIndex < 0) return out;
        url.slice(qIndex + 1).split('&').forEach(function (part) {
            if (!part) return;
            var eq = part.indexOf('=');
            var k = eq >= 0 ? part.slice(0, eq) : part;
            var v = eq >= 0 ? part.slice(eq + 1) : '';
            try {
                out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
            } catch (e) {
                out[k] = v;
            }
        });
        return out;
    }

    /** 从 cashout 等接口完整 URL 提取 API 根地址，与入库 site_url 一致 */
    function extractSiteApiBase(responseUrl) {
        var text = String(responseUrl || '').trim();
        if (!text || text === 'undefined') return '';
        try {
            return new URL(text).origin;
        } catch (e) {
            var m = text.match(/^(https?:\/\/[^/?#]+)/i);
            return m ? m[1] : '';
        }
    }

    function resolveAbsoluteUrl(url) {
        var text = String(url || '').trim();
        if (!text || text === 'undefined') return '';
        if (/^https?:\/\//i.test(text)) return text;
        try {
            return new URL(text, window.location.origin).href;
        } catch (e) {
            return text;
        }
    }

    function xhrRequestUrl(xhr) {
        if (!xhr) return '';
        return resolveAbsoluteUrl(
            xhr.responseURL || xhr.responseUrl || xhr._tmRequestUrl || xhr.requestUrl || ''
        );
    }

    function isValidSiteApiUrl(responseUrl) {
        var base = extractSiteApiBase(responseUrl);
        return /^https?:\/\/[^/]+/i.test(base);
    }

    function getSiteUrlFromSource(source) {
        return extractSiteApiBase(normalizeSource(source).responseUrl);
    }

    function isSiteSourceReady(source) {
        return isValidSiteApiUrl(normalizeSource(source).responseUrl);
    }

    function pickFirst(obj, keys) {
        if (!obj) return null;
        for (var i = 0; i < keys.length; i++) {
            if (obj[keys[i]] != null && obj[keys[i]] !== '') return obj[keys[i]];
        }
        return null;
    }

    function normalizeDateText(value) {
        if (value == null || value === '') return null;
        if (typeof value === 'number') {
            var ms = value < 1e12 ? value * 1000 : value;
            var d = new Date(ms);
            return isNaN(d.getTime()) ? String(value) : formatTime(d);
        }
        var text = String(value).trim();
        if (/^\d{10,13}$/.test(text)) {
            var n = Number(text);
            var dt = new Date(n < 1e12 ? n * 1000 : n);
            return isNaN(dt.getTime()) ? text : formatTime(dt);
        }
        return text;
    }

    function pickCaseInsensitive(obj, keys) {
        if (!obj || typeof obj !== 'object') return null;
        var map = {};
        Object.keys(obj).forEach(function (key) {
            map[key.toLowerCase()] = obj[key];
        });
        for (var i = 0; i < keys.length; i++) {
            var val = map[String(keys[i]).toLowerCase()];
            if (val != null && val !== '') return val;
        }
        return null;
    }

    function isRecordLike(value) {
        return value && typeof value === 'object' && !Array.isArray(value);
    }

    function isRecordLikeArray(arr) {
        if (!Array.isArray(arr) || !arr.length) return false;
        return isRecordLike(arr[0]);
    }

    function scanObjectArrays(obj, best) {
        if (!obj || typeof obj !== 'object') return best;
        Object.keys(obj).forEach(function (key) {
            var val = obj[key];
            if (isRecordLikeArray(val) && val.length > best.length) {
                best = val;
                return;
            }
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                best = scanObjectArrays(val, best);
            }
        });
        return best;
    }

    function extractBetRecords(json) {
        if (!json) return [];
        if (Array.isArray(json)) return isRecordLikeArray(json) ? json : [];

        var paths = [
            ['data', 'settlement', 'data'],
            ['settlement', 'data'],
            ['data', 'list'],
            ['data', 'records'],
            ['data', 'orders'],
            ['data', 'orderList'],
            ['data', 'content'],
            ['data', 'items'],
            ['data', 'rows'],
            ['data', 'settlement', 'list'],
            ['data', 'settlement', 'records'],
            ['data', 'settlement', 'orders'],
            ['data', 'settlement', 'content'],
            ['data', 'settlement', 'items'],
            ['records'],
            ['orders'],
            ['list'],
            ['items']
        ];

        var best = [];
        paths.forEach(function (path) {
            var cur = json;
            var ok = true;
            for (var i = 0; i < path.length; i++) {
                if (!cur || typeof cur !== 'object') {
                    ok = false;
                    break;
                }
                cur = pickCaseInsensitive(cur, [path[i]]);
            }
            if (ok && isRecordLikeArray(cur) && cur.length > best.length) {
                best = cur;
            }
        });

        var data = pickCaseInsensitive(json, ['data']);
        if (data && typeof data === 'object') {
            best = scanObjectArrays(data, best);
        }
        best = scanObjectArrays(json, best);

        return best;
    }

    function getPagingTotal(json) {
        var data = json && pickCaseInsensitive(json, ['data']);
        if (!data || typeof data !== 'object') return null;

        var paging = pickCaseInsensitive(data, ['Paging', 'paging', 'pagination', 'pageInfo', 'page']);
        if (!paging || typeof paging !== 'object') return null;

        var total = pickFirst(paging, ['total', 'totalCount', 'count', 'recordCount', 'totalNum', 'totalRecords']);
        var n = Number(total);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function extractBetTotal(json, records) {
        var recordCount = records.length;
        var pagingTotal = getPagingTotal(json);

        if (recordCount > 0) {
            return pagingTotal != null && pagingTotal > recordCount ? pagingTotal : recordCount;
        }
        if (pagingTotal != null) return pagingTotal;

        var totals = [];
        var data = json && pickCaseInsensitive(json, ['data']);

        function pushTotal(value) {
            var n = Number(value);
            if (Number.isFinite(n) && n > 0) totals.push(n);
        }

        if (data && typeof data === 'object') {
            pushTotal(pickFirst(data, ['total', 'totalCount', 'count', 'recordCount', 'totalNum', 'totalRecords']));

            var settlement = pickCaseInsensitive(data, ['settlement', 'Settlement']);
            if (settlement && typeof settlement === 'object') {
                pushTotal(pickFirst(settlement, ['total', 'totalCount', 'count', 'recordCount', 'totalNum']));
                var settlementData = pickCaseInsensitive(settlement, ['data']);
                if (isRecordLikeArray(settlementData)) {
                    pushTotal(settlementData.length);
                }
            }

            var summary = pickCaseInsensitive(data, ['summary', 'Summary']);
            if (summary && typeof summary === 'object') {
                pushTotal(pickFirst(summary, ['total', 'totalCount', 'betCount', 'recordCount', 'totalNum']));
            }
        }

        var rootSettlement = pickCaseInsensitive(json, ['settlement', 'Settlement']);
        if (rootSettlement && typeof rootSettlement === 'object') {
            var rootData = pickCaseInsensitive(rootSettlement, ['data']);
            if (isRecordLikeArray(rootData)) {
                pushTotal(rootData.length);
            }
        }

        pushTotal(pickFirst(json, ['total', 'totalCount', 'count', 'recordCount']));

        if (totals.length) return Math.max.apply(null, totals);
        return recordCount;
    }

    function summarizeBetResponse(response, responseUrl) {
        var text = readResponseText(response);
        var query = parseUrlQuery(responseUrl);
        var summary = {
            text: text,
            count: 0,
            timeRange: '—',
            betStatus: pickFirst(query, ['betStatus', 'status']),
            responseLength: text.length
        };

        var start = pickFirst(query, [
            'startTime', 'startDate', 'beginTime', 'from', 'start',
            'startDateTime', 'beginDate', 'dateFrom'
        ]);
        var end = pickFirst(query, [
            'endTime', 'endDate', 'finishTime', 'to', 'end',
            'endDateTime', 'finishDate', 'dateTo'
        ]);
        if (start || end) {
            summary.timeRange = (normalizeDateText(start) || '—') + ' ~ ' + (normalizeDateText(end) || '—');
        }

        if (!text) return summary;

        try {
            var json = JSON.parse(text);
            var records = extractBetRecords(json);
            summary.count = extractBetTotal(json, records);

            if (summary.timeRange === '—') {
                var recordTimes = collectRecordTimes(records);
                if (recordTimes.length) {
                    summary.timeRange = recordTimes[recordTimes.length - 1] + ' ~ ' + recordTimes[0];
                }
            }
        } catch (e) {
            summary.parseError = true;
        }

        return summary;
    }

    function buildBetDetailLines(summary, responseUrl) {
        var lines = [];
        if (summary.betStatus != null) {
            lines.push({ label: 'betStatus', value: String(summary.betStatus) });
        }
        lines.push({ label: '时间范围', value: summary.timeRange || '—' });
        if (summary.parseError) {
            lines.push({ label: '记录数', value: '解析失败（' + summary.responseLength + ' 字符）' });
        } else {
            lines.push({ label: '记录数', value: String(summary.count) });
        }
        lines.push({ label: '数据大小', value: formatBytes(summary.responseLength) });
        if (responseUrl) {
            lines.push({ label: '来源URL', value: responseUrl });
        }
        return lines;
    }

    function formatBytes(size) {
        var n = Number(size) || 0;
        if (n < 1024) return n + ' 字符';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function readResponseText(response) {
        if (response == null) return '';
        if (typeof response === 'string') return response;
        try {
            return JSON.stringify(response);
        } catch (e) {
            return String(response);
        }
    }

    function readXhrResponse(xhr) {
        if (!xhr) return '';
        var text = xhr.response;
        if (text == null || text === '') text = xhr.responseText;
        return readResponseText(text);
    }

    function shouldReplaceBetCache(candidate, current) {
        if (!current) return true;
        if (candidate.responseUrl !== current.responseUrl) return true;
        if (candidate.response !== current.response) return true;
        var next = summarizeBetResponse(candidate.response, candidate.responseUrl);
        var prev = summarizeBetResponse(current.response, current.responseUrl);
        if (next.count > prev.count) return true;
        if (next.count === prev.count && next.responseLength > prev.responseLength) return true;
        return false;
    }

    function markBetDataChanged() {
        if (uploadState.bet.status === 'uploading') return;
        uploadState.bet.status = 'idle';
        uploadState.bet.result = '';
        uploadState.bet.uploadTime = '';
        betAutoUploadDone = false;
    }

    function collectRecordTimes(records) {
        var keys = [
            'betTime', 'orderTime', 'createTime', 'createdTime', 'placedTime',
            'settleTime', 'matchTime', 'eventTime', 'time', 'date'
        ];
        var times = [];
        records.forEach(function (row) {
            if (!row || typeof row !== 'object') return;
            var val = pickFirst(row, keys);
            var text = normalizeDateText(val);
            if (text) times.push(text);
        });
        return times;
    }

    function parseBetDetail(response, responseUrl) {
        var summary = summarizeBetResponse(response, responseUrl);
        return { lines: buildBetDetailLines(summary, responseUrl) };
    }

    function parseWalletDetail(response) {
        var text = String(response || '');
        var lines = [{ label: '响应大小', value: text.length + ' 字符' }];
        try {
            var json = JSON.parse(text);
            var wallets = extractBetRecords(json);
            if (!wallets.length && json && json.data && Array.isArray(json.data.wallets)) {
                wallets = json.data.wallets;
            }
            if (wallets.length) {
                lines.push({ label: '钱包数', value: String(wallets.length) });
                wallets.slice(0, 3).forEach(function (w, idx) {
                    var name = pickFirst(w, ['walletName', 'name', 'currency', 'coin']) || ('钱包' + (idx + 1));
                    var balance = pickFirst(w, ['balance', 'amount', 'availableBalance', 'totalBalance']);
                    if (balance != null) {
                        lines.push({ label: name, value: String(balance) });
                    }
                });
            }
        } catch (e) { /* ignore */ }
        return { lines: lines };
    }

    function formatTime(date) {
        var d = date || new Date();
        var pad = function (n) { return n < 10 ? '0' + n : String(n); };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function parseUploadResponse(res) {
        var body = (res && res.responseText != null) ? String(res.responseText) : '';
        if (res.status >= 200 && res.status < 300) {
            if (!body.trim()) {
                return { ok: true, data: { msg: 'ok', status: String(res.status) } };
            }
            try {
                return { ok: true, data: JSON.parse(body) };
            } catch (e) {
                return { ok: true, data: { msg: body.slice(0, 120), status: String(res.status) } };
            }
        }
        return {
            ok: false,
            error: new Error('Request failed with status: ' + res.status)
        };
    }

    function formatUploadResult(res) {
        if (res == null) return 'ok';
        var text = typeof res === 'object' ? JSON.stringify(res) : String(res);
        return text.length > 120 ? text.slice(0, 120) + '...' : text;
    }

    function uploadData(url, data, callback, timeoutMs) {
        var finished = false;
        function finish(err, res) {
            if (finished) return;
            finished = true;
            callback(err, res);
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: url,
            data: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' },
            timeout: timeoutMs || TIMEOUT,
            onload: function (res) {
                var parsed = parseUploadResponse(res);
                if (!parsed.ok) {
                    console.error(parsed.error.message);
                    finish(parsed.error);
                    return;
                }
                console.log(parsed.data);
                finish(null, parsed.data);
            },
            onerror: function (e) {
                console.error('Request error:', e);
                finish(e);
            },
            ontimeout: function () {
                finish(new Error('Request timed out'));
            }
        });
    }

    function setUploadState(typeKey, detail, status, result) {
        uploadState[typeKey] = {
            detail: detail,
            uploadTime: formatTime(),
            result: result || '',
            status: status
        };
        updatePanelView();
    }

    function normalizeSource(source) {
        if (!source) {
            return { response: '', responseUrl: '', siteUrl: '' };
        }
        var responseUrl = resolveAbsoluteUrl(
            source.responseUrl || source.responseURL || source.requestUrl || source._tmRequestUrl || ''
        );
        var response = source.response;
        if (source.responseText != null && (response == null || response === '')) {
            response = source.responseText;
        }
        return {
            response: readResponseText(response),
            responseUrl: responseUrl,
            siteUrl: extractSiteApiBase(responseUrl)
        };
    }

    function normalizeBetSource(xhr) {
        return {
            response: readXhrResponse(xhr),
            responseURL: xhr.responseURL,
            _tmRequestUrl: xhr._tmRequestUrl
        };
    }

    function markSitePending(detail, message) {
        uploadState.site.detail = detail;
        uploadState.site.status = 'pending';
        uploadState.site.result = message || 'site_url 未获取，等待重试...';
        updatePanelView();
    }

    function clearSiteRetry() {
        if (siteRetryTimers.timer) {
            clearTimeout(siteRetryTimers.timer);
            siteRetryTimers.timer = null;
        }
        siteRetryTimers.xhr = null;
        siteRetryTimers.attempt = 0;
    }

    function scheduleSiteUrlRetry(xhr) {
        siteRetryTimers.xhr = xhr;
        if (siteRetryTimers.timer) return;

        function retry() {
            var currentXhr = siteRetryTimers.xhr;
            if (!currentXhr) return;

            siteRetryTimers.attempt += 1;
            var normalized = normalizeSource({
                response: currentXhr.response,
                responseURL: currentXhr.responseURL,
                _tmRequestUrl: currentXhr._tmRequestUrl
            });
            cachedData.site = normalized;
            var detail = buildDetail('site', normalized);

            if (isSiteSourceReady(normalized)) {
                clearSiteRetry();
                console.log('站点URL 已获取:', normalized.siteUrl);
                doUpload('site', cachedData.site, function (err) {
                    if (err) console.error('Upload 站点URL failed:', err);
                });
                return;
            }

            if (siteRetryTimers.attempt >= SITE_URL_RETRY_MAX) {
                clearSiteRetry();
                markSitePending(detail, 'site_url 获取失败，请刷新页面或点击重试');
                console.warn('站点URL 多次重试仍未获取到有效地址');
                return;
            }

            markSitePending(
                detail,
                'site_url 未获取，重试 ' + siteRetryTimers.attempt + '/' + SITE_URL_RETRY_MAX + '...'
            );
            siteRetryTimers.timer = setTimeout(function () {
                siteRetryTimers.timer = null;
                retry();
            }, SITE_URL_RETRY_INTERVAL);
        }

        retry();
    }

    function handleSiteResponse(xhr) {
        var normalized = normalizeSource({
            response: xhr.response,
            responseURL: xhr.responseURL,
            _tmRequestUrl: xhr._tmRequestUrl
        });
        cachedData.site = normalized;
        uploadState.site.detail = buildDetail('site', normalized);
        updatePanelView();

        if (isSiteSourceReady(normalized)) {
            clearSiteRetry();
            doUpload('site', cachedData.site, function (err) {
                if (err) console.error('Upload 站点URL failed:', err);
            });
            return;
        }

        console.warn('站点URL 暂不可用，等待重新获取:', normalized.responseUrl || '(empty)');
        scheduleSiteUrlRetry(xhr);
    }

    function buildDetail(typeKey, source) {
        var cfg = UPLOAD_TYPES[typeKey];
        if (!cfg || !cfg.buildDetail) return { lines: [] };
        var normalized = normalizeSource(source);
        return cfg.buildDetail(normalized.response, normalized.responseUrl);
    }

    function doUpload(typeKey, source, callback) {
        var cfg = UPLOAD_TYPES[typeKey];
        if (!cfg) {
            callback(new Error('未知上传类型'));
            return;
        }

        var normalized = normalizeSource(source);
        var detail = buildDetail(typeKey, normalized);

        if (typeKey === 'site' && !isSiteSourceReady(normalized)) {
            markSitePending(detail, 'site_url 无效，无法上传');
            callback(new Error('site_url 无效，无法上传'));
            return;
        }

        uploadState[typeKey].detail = detail;
        uploadState[typeKey].status = 'uploading';
        updatePanelView();

        var payload = typeKey === 'site'
            ? cfg.buildPayload(normalized.response, normalized.responseUrl)
            : cfg.buildPayload(normalized.response);

        if (typeKey === 'site' && (!payload.site_url || payload.site_url === 'undefined')) {
            markSitePending(detail, 'site_url 无效，无法上传');
            callback(new Error('site_url 无效，无法上传'));
            return;
        }

        if (typeKey === 'bet') {
            var betSummary = summarizeBetResponse(normalized.response, normalized.responseUrl);
            console.log('上传 ' + cfg.label + ':', cfg.apiUrl, {
                count: betSummary.count,
                size: formatBytes(betSummary.responseLength),
                betStatus: betSummary.betStatus
            });
        } else {
            console.log('上传 ' + cfg.label + ':', cfg.apiUrl, payload);
        }

        uploadData(cfg.apiUrl, payload, function (err, res) {
            if (err) {
                setUploadState(typeKey, detail, 'error', err.message || String(err));
                callback(err);
                return;
            }
            setUploadState(typeKey, detail, 'success', formatUploadResult(res));
            callback(null, res);
        }, TIMEOUT);
    }

    function clearBetUploadSchedule() {
        if (betUploadTimer) {
            clearTimeout(betUploadTimer);
            betUploadTimer = null;
        }
    }

    function uploadBetRecords(done) {
        if (!cachedData.bet) {
            if (done) done(new Error('暂无投注记录缓存'));
            return;
        }
        if (betUploadInFlight) {
            if (done) done(null);
            return;
        }

        clearBetUploadSchedule();
        var detail = buildDetail('bet', cachedData.bet);
        var summary = summarizeBetResponse(cachedData.bet.response, cachedData.bet.responseUrl);

        betUploadInFlight = true;
        uploadState.bet.detail = detail;
        uploadState.bet.status = 'uploading';
        updatePanelView();

        console.log('上传投注记录 →', UPLOAD_TYPES.bet.apiUrl, summary.count + '条', formatBytes(summary.responseLength));

        uploadData(
            UPLOAD_TYPES.bet.apiUrl,
            { bet_records_json: cachedData.bet.response },
            function (err, res) {
                betUploadInFlight = false;
                if (err) {
                    setUploadState('bet', detail, 'error', err.message || String(err));
                    console.error('Upload 投注记录 failed:', err);
                } else {
                    setUploadState('bet', detail, 'success', formatUploadResult(res));
                    betAutoUploadDone = true;
                    console.log('end: upload bet history!<-----------------');
                }
                updatePanelView();
                if (done) done(err);
            },
            TIMEOUT
        );
    }

    function scheduleBetUpload() {
        if (betUploadInFlight) return;
        clearBetUploadSchedule();
        betUploadTimer = setTimeout(function () {
            betUploadTimer = null;
            if (betUploadInFlight || !cachedData.bet) return;
            uploadBetRecords();
        }, BET_UPLOAD_DEBOUNCE);
    }

    function cacheResponse(typeKey, xhr) {
        cachedData[typeKey] = normalizeSource(xhr);
        uploadState[typeKey].detail = buildDetail(typeKey, cachedData[typeKey]);
        updatePanelView();
    }

    function cacheBetResponse(xhr) {
        var normalized = normalizeSource(normalizeBetSource(xhr));
        if (!shouldReplaceBetCache(normalized, cachedData.bet)) {
            return false;
        }

        var isNewQuery = !cachedData.bet ||
            normalized.responseUrl !== cachedData.bet.responseUrl ||
            normalized.response !== cachedData.bet.response;

        cachedData.bet = normalized;
        uploadState.bet.detail = buildDetail('bet', normalized);

        if (isNewQuery) {
            markBetDataChanged();
        }

        if (uploadState.bet.status !== 'uploading') {
            updatePanelView();
        }
        return true;
    }

    function statusText(status) {
        if (status === 'success') return '成功';
        if (status === 'error') return '失败';
        if (status === 'uploading') return '上传中';
        if (status === 'pending') return '待获取';
        return '暂无';
    }

    function statusClass(status) {
        if (status === 'success') return 'tm-8868-status-ok';
        if (status === 'error') return 'tm-8868-status-err';
        if (status === 'uploading') return 'tm-8868-status-ing';
        if (status === 'pending') return 'tm-8868-status-pending';
        return 'tm-8868-status-idle';
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
            '#' + PANEL_ID + ' {' +
            'position: fixed;' +
            'right: 16px;' +
            'left: auto;' +
            'bottom: 20px;' +
            'z-index: 999998;' +
            'width: min(380px, calc(100vw - 32px));' +
            'border: 1px solid #d8e2ec;' +
            'border-radius: 10px;' +
            'background: linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%);' +
            'overflow: hidden;' +
            'font-size: 12px;' +
            'color: #1e293b;' +
            'box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);' +
            'box-sizing: border-box;' +
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;' +
            'transition: width 0.22s ease, height 0.22s ease, border-radius 0.22s ease, box-shadow 0.22s ease, transform 0.18s ease, left 0.18s ease, right 0.18s ease;' +
            '}' +
            '#' + PANEL_ID + '.tm-8868-collapsed {' +
            'width: 44px;' +
            'height: 44px;' +
            'min-width: 44px;' +
            'border: none;' +
            'border-radius: 50%;' +
            'background: radial-gradient(circle at 32% 28%, #ecfdf5 0%, #86efac 46%, #4ade80 100%);' +
            'box-shadow: 0 6px 18px rgba(22, 163, 74, 0.32), inset 0 -8px 12px rgba(21, 128, 61, 0.16), inset 4px 4px 10px rgba(255,255,255,0.5);' +
            'cursor: pointer;' +
            '}' +
            '#' + PANEL_ID + '.tm-8868-collapsed:hover {' +
            'transform: scale(1.08);' +
            'box-shadow: 0 8px 22px rgba(22, 163, 74, 0.4), inset 0 -8px 12px rgba(21, 128, 61, 0.16), inset 4px 4px 10px rgba(255,255,255,0.55);' +
            '}' +
            '#' + PANEL_ID + '.tm-8868-dock-left {' +
            'right: auto;' +
            'left: 16px;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-head {' +
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
            '#' + PANEL_ID + '.tm-8868-collapsed .tm-8868-head {' +
            'width: 100%;' +
            'height: 100%;' +
            'padding: 0;' +
            'background: transparent;' +
            'border-bottom: none;' +
            'justify-content: center;' +
            '}' +
            '#' + PANEL_ID + '.tm-8868-collapsed .tm-8868-title,' +
            '#' + PANEL_ID + '.tm-8868-collapsed .tm-8868-toggle {' +
            'display: none;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-ball-label {' +
            'display: none;' +
            '}' +
            '#' + PANEL_ID + '.tm-8868-collapsed .tm-8868-ball-label {' +
            'display: block;' +
            'font-size: 12px;' +
            'font-weight: 700;' +
            'line-height: 1;' +
            'letter-spacing: 0.5px;' +
            'color: #166534;' +
            'text-shadow: 0 1px 0 rgba(255,255,255,0.45);' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-toggle {' +
            'display: inline-flex;' +
            'align-items: center;' +
            'justify-content: center;' +
            'width: 18px;' +
            'height: 18px;' +
            'font-size: 14px;' +
            'line-height: 1;' +
            'color: #64748b;' +
            '}' +
            '#' + PANEL_ID + '.tm-8868-collapsed .tm-8868-body {' +
            'display: none;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-body {' +
            'padding: 10px 12px 12px;' +
            'max-height: min(70vh, 520px);' +
            'overflow-y: auto;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-section {' +
            'border: 1px solid #dbe3ee;' +
            'border-radius: 8px;' +
            'padding: 8px 10px;' +
            'margin-bottom: 8px;' +
            'background: rgba(255,255,255,0.72);' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-section-head {' +
            'display: flex;' +
            'align-items: center;' +
            'justify-content: space-between;' +
            'gap: 8px;' +
            'margin-bottom: 6px;' +
            'font-weight: 600;' +
            'color: #334155;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-section-actions {' +
            'display: flex;' +
            'align-items: center;' +
            'gap: 6px;' +
            'flex-shrink: 0;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-btn-section {' +
            'border: 1px solid #2563eb;' +
            'border-radius: 4px;' +
            'padding: 1px 8px;' +
            'font-size: 11px;' +
            'font-weight: 600;' +
            'line-height: 1.6;' +
            'cursor: pointer;' +
            'background: #fff;' +
            'color: #2563eb;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-btn-section:hover:not(:disabled) {' +
            'background: #eff6ff;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-btn-section:disabled {' +
            'opacity: 0.45;' +
            'cursor: not-allowed;' +
            'border-color: #cbd5e1;' +
            'color: #94a3b8;' +
            'background: #f8fafc;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-section-title {' +
            'font-size: 12px;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-detail-row {' +
            'display: flex;' +
            'gap: 6px;' +
            'margin-bottom: 4px;' +
            'line-height: 1.45;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-detail-label {' +
            'flex: 0 0 auto;' +
            'color: #64748b;' +
            'white-space: nowrap;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-detail-value {' +
            'flex: 1 1 auto;' +
            'word-break: break-all;' +
            'color: #0f172a;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-meta-row {' +
            'margin-top: 4px;' +
            'padding-top: 4px;' +
            'border-top: 1px dashed #e2e8f0;' +
            'font-size: 11px;' +
            'color: #64748b;' +
            'line-height: 1.45;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-row {' +
            'margin-bottom: 8px;' +
            'line-height: 1.5;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-label {' +
            'color: #64748b;' +
            'margin-right: 4px;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-content {' +
            'word-break: break-all;' +
            'color: #0f172a;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-status {' +
            'display: inline-block;' +
            'padding: 1px 6px;' +
            'border-radius: 999px;' +
            'font-size: 11px;' +
            'font-weight: 600;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-status-ok {' +
            'background: #dcfce7;' +
            'color: #166534;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-status-err {' +
            'background: #fee2e2;' +
            'color: #991b1b;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-status-ing {' +
            'background: #dbeafe;' +
            'color: #1d4ed8;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-status-pending {' +
            'background: #fef3c7;' +
            'color: #92400e;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-status-idle {' +
            'background: #e2e8f0;' +
            'color: #475569;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-section-empty {' +
            'color: #94a3b8;' +
            'font-size: 11px;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-actions {' +
            'margin-top: 10px;' +
            'display: flex;' +
            'gap: 8px;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-btn {' +
            'flex: 1;' +
            'border: none;' +
            'border-radius: 6px;' +
            'padding: 7px 10px;' +
            'font-size: 12px;' +
            'font-weight: 600;' +
            'cursor: pointer;' +
            'background: #2563eb;' +
            'color: #fff;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-btn:hover:not(:disabled) {' +
            'background: #1d4ed8;' +
            '}' +
            '#' + PANEL_ID + ' .tm-8868-btn:disabled {' +
            'opacity: 0.55;' +
            'cursor: not-allowed;' +
            '}';
        document.head.appendChild(style);
    }

    function setPanelCollapsed(panel, collapsed) {
        panelCollapsed = collapsed;
        panel.classList.toggle('tm-8868-collapsed', collapsed);
        var toggle = panel.querySelector('.tm-8868-toggle');
        if (toggle) toggle.textContent = collapsed ? '▸' : '▾';
        var head = panel.querySelector('.tm-8868-head');
        if (head) head.title = collapsed ? '点击展开' : '点击收起';
    }

    function renderDetailLines(detail) {
        if (!detail || !detail.lines || !detail.lines.length) {
            return '<div class="tm-8868-section-empty">暂无数据，等待页面请求...</div>';
        }
        return detail.lines.map(function (line) {
            return '<div class="tm-8868-detail-row">' +
                '<span class="tm-8868-detail-label">' + line.label + '：</span>' +
                '<span class="tm-8868-detail-value">' + escapeHtml(line.value) + '</span>' +
                '</div>';
        }).join('');
    }

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function sectionHtml(typeKey) {
        var cfg = UPLOAD_TYPES[typeKey];
        return '<div class="tm-8868-section" data-type="' + typeKey + '">' +
            '<div class="tm-8868-section-head">' +
            '<span class="tm-8868-section-title">' + cfg.label + '</span>' +
            '<div class="tm-8868-section-actions">' +
            '<span class="tm-8868-status tm-8868-section-status tm-8868-status-idle">暂无</span>' +
            '<button type="button" class="tm-8868-btn-section tm-8868-btn-section-upload" data-type="' + typeKey + '" disabled>上传</button>' +
            '</div>' +
            '</div>' +
            '<div class="tm-8868-section-detail"></div>' +
            '<div class="tm-8868-meta-row">' +
            '<div>上传时间：<span class="tm-8868-section-time">—</span></div>' +
            '<div>返回信息：<span class="tm-8868-section-result">—</span></div>' +
            '</div>' +
            '</div>';
    }

    function sectionUploadLabel(status) {
        if (status === 'uploading') return '上传中';
        if (status === 'pending') return '等待';
        if (status === 'error') return '重传';
        return '上传';
    }

    function canSectionUpload(typeKey) {
        if (!cachedData[typeKey] || manualUploading) {
            return false;
        }
        if (uploadState[typeKey].status === 'uploading' || (typeKey === 'bet' && betUploadInFlight)) {
            return false;
        }
        if (typeKey === 'site') {
            return isSiteSourceReady(cachedData.site);
        }
        return true;
    }

    function canIncludeInManualUploadAll(typeKey) {
        if (!cachedData[typeKey]) return false;
        if (typeKey === 'site') return isSiteSourceReady(cachedData.site);
        return true;
    }

    function updatePanelView() {
        var panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        UPLOAD_ORDER.forEach(function (typeKey) {
            var section = panel.querySelector('.tm-8868-section[data-type="' + typeKey + '"]');
            if (!section) return;

            var state = uploadState[typeKey];
            var detailEl = section.querySelector('.tm-8868-section-detail');
            var statusEl = section.querySelector('.tm-8868-section-status');
            var timeEl = section.querySelector('.tm-8868-section-time');
            var resultEl = section.querySelector('.tm-8868-section-result');

            if (detailEl) detailEl.innerHTML = renderDetailLines(state.detail);
            if (timeEl) timeEl.textContent = state.uploadTime || '—';
            if (resultEl) resultEl.textContent = state.result || '—';
            if (statusEl) {
                statusEl.textContent = statusText(state.status);
                statusEl.className = 'tm-8868-status tm-8868-section-status ' + statusClass(state.status);
            }

            var sectionBtn = section.querySelector('.tm-8868-btn-section-upload');
            if (sectionBtn) {
                sectionBtn.disabled = !canSectionUpload(typeKey);
                sectionBtn.textContent = sectionUploadLabel(state.status);
            }
        });

        var btn = panel.querySelector('.tm-8868-btn-upload');
        if (btn) {
            var readyKeys = UPLOAD_ORDER.filter(canIncludeInManualUploadAll);
            btn.disabled = manualUploading || !readyKeys.length;
            btn.textContent = manualUploading ? '上传中...' : '手动上传全部';
        }
    }

    function bindPanelEvents(panel) {
        if (panel.getAttribute('data-bound')) return;
        panel.setAttribute('data-bound', '1');

        var head = panel.querySelector('.tm-8868-head');
        if (head) {
            head.addEventListener('click', function () {
                setPanelCollapsed(panel, !panel.classList.contains('tm-8868-collapsed'));
            });
        }

        var btn = panel.querySelector('.tm-8868-btn-upload');
        if (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                manualUploadAll();
            });
        }

        panel.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || !target.classList || !target.classList.contains('tm-8868-btn-section-upload')) return;
            e.stopPropagation();
            var typeKey = target.getAttribute('data-type');
            if (typeKey) manualUploadOne(typeKey);
        });
    }

    function manualUploadOne(typeKey) {
        if (typeKey === 'bet') {
            if (betUploadInFlight) return;
            betAutoUploadDone = false;
            uploadBetRecords(function () {});
            return;
        }
        if (!canSectionUpload(typeKey)) return;
        doUpload(typeKey, cachedData[typeKey], function () {});
    }

    function createPanel() {
        injectStyle();
        var panel = document.getElementById(PANEL_ID);
        if (panel) {
            bindPanelEvents(panel);
            updatePanelView();
            return panel;
        }

        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML =
            '<div class="tm-8868-head">' +
            '<span class="tm-8868-title">8868 上传面板</span>' +
            '<span class="tm-8868-ball-label">上传</span>' +
            '<span class="tm-8868-toggle">▾</span>' +
            '</div>' +
            '<div class="tm-8868-body">' +
            UPLOAD_ORDER.map(sectionHtml).join('') +
            '<div class="tm-8868-actions">' +
            '<button type="button" class="tm-8868-btn tm-8868-btn-upload" disabled>手动上传全部</button>' +
            '</div>' +
            '</div>';

        (document.body || document.documentElement).appendChild(panel);
        bindPanelEvents(panel);
        setPanelCollapsed(panel, panelCollapsed);
        panel.classList.toggle('tm-8868-dock-left', !isHistoryPage());
        updatePanelView();
        return panel;
    }

    function manualUploadAll() {
        var keys = UPLOAD_ORDER.filter(canIncludeInManualUploadAll);
        if (!keys.length || manualUploading) return;

        manualUploading = true;
        keys.forEach(function (key) {
            uploadState[key].status = 'uploading';
        });
        updatePanelView();

        var index = 0;
        function next() {
            if (index >= keys.length) {
                manualUploading = false;
                updatePanelView();
                return;
            }
            var key = keys[index++];
            if (key === 'bet') {
                betAutoUploadDone = false;
                uploadBetRecords(function () {
                    next();
                });
                return;
            }
            doUpload(key, cachedData[key], function () {
                next();
            });
        }
        next();
    }

    function handleMatchedResponse(xhr) {
        if (!isHistoryPage()) return;
        var requestUrl = xhrRequestUrl(xhr);

        Object.keys(UPLOAD_TYPES).forEach(function (typeKey) {
            var cfg = UPLOAD_TYPES[typeKey];
            if (!cfg.matchUrl(requestUrl)) return;

            if (typeKey === 'site') {
                handleSiteResponse(xhr);
                return;
            }

            if (typeKey === 'bet') {
                if (cacheBetResponse(xhr)) {
                    scheduleBetUpload();
                }
                return;
            }

            cacheResponse(typeKey, xhr);

            doUpload(typeKey, cachedData[typeKey], function (err) {
                if (err) {
                    console.error('Upload ' + cfg.label + ' failed:', err);
                }
            });
        });
    }

    function initXhrHook() {
        if (XMLHttpRequest.prototype.open.__tm8868Open) return;

        var originalOpen = XMLHttpRequest.prototype.open;
        var wrappedOpen = function (method, url) {
            this._tmRequestUrl = resolveAbsoluteUrl(url);
            return originalOpen.apply(this, arguments);
        };
        wrappedOpen.__tm8868Open = true;
        XMLHttpRequest.prototype.open = wrappedOpen;

        var originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function () {
            var self = this;
            self.addEventListener('readystatechange', function () {
                if (self.readyState !== 4) return;
                if (!isHistoryPage()) return;

                var url = xhrRequestUrl(self);
                var matched = url.includes('platform/thirdparty-report/user/orders/sport?betStatus=') ||
                    url.includes('socbet') ||
                    url.includes('platform/payment/wallets/list') ||
                    url.includes('/product/cashout/setting');

                if (!matched) return;
                handleMatchedResponse(self);
            });

            originalSend.apply(this, arguments);
        };
    }

    var PLAN_PANEL_ID = 'tm-8868-plan-list';
    var PLAN_STYLE_ID = 'tm-8868-plan-style';
    var PLAN_API = 'http://i.socbeta.xyz/api/v1/soc/bet/plan/list';
    var PLAN_MATCH_ENTITY_API = 'http://socbeta.xyz/api/v1/soc/match/entity/';
    var PLAN_ID = '4';
    var PLAN_LIVE_MS = 150 * 60 * 1000;
    var PLAN_INPLAY_EARLY_MS = 60 * 1000;
    var PLAN_POLL_MS = 60000;
    var PLAN_GROUPS = [
        { key: 'live', label: '进行中' },
        { key: 'upcoming', label: '未开始' },
        { key: 'ended', label: '已经结束' }
    ];

    var planMatches = [];
    var planStatus = 'idle';
    var planError = '';
    var planCollapsed = false;
    var planGroupCollapsed = { live: false, upcoming: false, ended: true };
    var planPollTimer = null;
    var planTickTimer = null;
    var planFetchInFlight = false;
    var lastPlanListPath = null;
    var lastPlanRenderKey = '';
    var planMatchMetaCache = {};
    var planFilterQuery = '';
    var planDateBegin = '';
    var planDateEnd = '';
    var planFetchSeq = 0;
    var PLAN_FILTER_HISTORY_KEY = 'tm-8868-plan-filter-history';
    var PLAN_FILTER_HISTORY_MAX = 10;
    var PLAN_DATE_KEY = 'tm-8868-plan-date-range';
    var PLAN_DATE_MAX_SPAN = 31;

    function getPlanScriptVersion() {
        try {
            if (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) {
                return String(GM_info.script.version);
            }
        } catch (e) { /* ignore */ }
        return '2026-09-01.10';
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function formatYmd(date) {
        return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }

    function planToday() {
        var now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    function planAddDays(date, days) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
    }

    function parsePlanYmd(text) {
        var m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return isNaN(d.getTime()) ? null : d;
    }

    function defaultPlanDates() {
        var today = planToday();
        return {
            begin: formatYmd(planAddDays(today, -2)),
            end: formatYmd(planAddDays(today, 1))
        };
    }

    function loadPlanDates() {
        try {
            var raw = localStorage.getItem(PLAN_DATE_KEY);
            var obj = raw ? JSON.parse(raw) : null;
            var begin = obj && parsePlanYmd(obj.begin);
            var end = obj && parsePlanYmd(obj.end);
            if (begin && end) {
                if (begin > end) {
                    var tmp = begin;
                    begin = end;
                    end = tmp;
                }
                planDateBegin = formatYmd(begin);
                planDateEnd = formatYmd(end);
                return;
            }
        } catch (e) { /* ignore */ }
        var fallback = defaultPlanDates();
        planDateBegin = fallback.begin;
        planDateEnd = fallback.end;
    }

    function savePlanDates() {
        try {
            localStorage.setItem(PLAN_DATE_KEY, JSON.stringify({
                begin: planDateBegin,
                end: planDateEnd
            }));
        } catch (e) { /* ignore */ }
    }

    function normalizePlanDates(beginText, endText) {
        var begin = parsePlanYmd(beginText);
        var end = parsePlanYmd(endText);
        if (!begin || !end) return null;
        if (begin > end) {
            var tmp = begin;
            begin = end;
            end = tmp;
        }
        var span = Math.round((end - begin) / 86400000);
        if (span > PLAN_DATE_MAX_SPAN) {
            end = planAddDays(begin, PLAN_DATE_MAX_SPAN);
        }
        return { begin: formatYmd(begin), end: formatYmd(end) };
    }

    function buildPlanListUrl() {
        if (!planDateBegin || !planDateEnd) loadPlanDates();
        return PLAN_API +
            '?date_begin=' + encodeURIComponent(planDateBegin) +
            '&date_end=' + encodeURIComponent(planDateEnd) +
            '&plan_id=' + encodeURIComponent(PLAN_ID);
    }

    function parsePlanKickoffMs(kickoffTime) {
        var raw = String(kickoffTime || '').trim();
        if (!raw) return 0;
        var t = Date.parse(raw.replace(' ', 'T'));
        if (!isNaN(t)) return t;
        t = Date.parse(raw.replace(/-/g, '/'));
        return isNaN(t) ? 0 : t;
    }

    function classifyPlanMatch(item) {
        var status = String((item && (item.matchStatus || item.status || item.matchPhase)) || '').trim().toUpperCase();
        if (status === 'ENDED' || status === 'FINISHED' || status === '3' || status === '4') {
            return 'ended';
        }
        if (status === 'IN_PLAY' || status === 'INPLAY' || status === 'LIVE' || status === '1') {
            return 'live';
        }
        var ms = parsePlanKickoffMs(item && item.kickoffTime);
        if (!ms) return 'upcoming';
        var now = Date.now();
        if (now < ms) return 'upcoming';
        if (now < ms + PLAN_LIVE_MS) return 'live';
        return 'ended';
    }

    function shouldOpenInplay(item) {
        var ms = parsePlanKickoffMs(item && item.kickoffTime);
        if (!ms) return false;
        return Date.now() >= ms - PLAN_INPLAY_EARLY_MS;
    }

    function planMatchUrl(item) {
        var id = String((item && item.matchId) || '');
        if (!id) return '';
        var kind = shouldOpenInplay(item) ? 'inplay' : 'early';
        return window.location.origin + '/sportEvents/' + kind + '/football/match/' + id + '?type=market';
    }

    function getCurrentMatchId() {
        var m = (window.location.pathname || '').match(
            /\/sportEvents\/(?:early|inplay|incoming)\/football\/match\/(\d+)/i
        );
        return m ? m[1] : '';
    }

    function formatPlanKickoff(kick) {
        var m = String(kick || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
        if (m) return m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
        return String(kick || '');
    }

    function formatLiveElapsed(kickoffTime) {
        var ms = parsePlanKickoffMs(kickoffTime);
        if (!ms) return '';
        var mins = Math.floor((Date.now() - ms) / 60000);
        if (mins < 0) return '';
        if (mins > 180) return '';
        return mins + "'";
    }

    function shortTournamentName(name) {
        var raw = String(name || '').trim();
        if (!raw) return '';
        var normalized = raw.replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, ' ');
        var wcHosts = normalized.match(/^(\d{4})?世界杯\s*\(([^)]+)\)\s*$/);
        if (wcHosts) {
            var hosts = wcHosts[2] || '';
            if (/加拿大|墨西哥|美国|美加墨/.test(hosts)) {
                return (wcHosts[1] || '2026') + '美加墨';
            }
            return (wcHosts[1] || '') + '世界杯';
        }
        var rules = [
            [/世界杯\s*\([^)]+\)/, '世界杯'],
            [/俱乐部\s*友谊赛|国际\s*友谊赛|友谊赛/, '友谊赛'],
            [/英格兰\s*(超级|超)(联赛)?|英超/, '英超'],
            [/英格兰\s*冠军(联赛)?|英冠/, '英冠'],
            [/英格兰\s*甲级|英甲/, '英甲'],
            [/英格兰\s*乙级|英乙/, '英乙'],
            [/西班牙\s*(甲级|超)(联赛)?|西甲/, '西甲'],
            [/意大利\s*(甲级|超)(联赛)?|意甲/, '意甲'],
            [/德国\s*(甲级|超)(联赛)?|德甲/, '德甲'],
            [/德国\s*乙级|德乙/, '德乙'],
            [/法国\s*(甲级|超)(联赛)?|法甲/, '法甲'],
            [/法国\s*乙级|法乙/, '法乙'],
            [/荷兰\s*(甲级|超)|荷甲/, '荷甲'],
            [/葡萄牙\s*(超级|超)|葡超/, '葡超'],
            [/欧洲\s*冠军(联赛)?|欧冠/, '欧冠'],
            [/欧洲\s*联赛(?!协会)|欧联(?!合)/, '欧联'],
            [/欧洲\s*(协会|协会联赛|协会联)|欧协/, '欧协'],
            [/中超|中国\s*超级/, '中超']
        ];
        for (var i = 0; i < rules.length; i++) {
            if (rules[i][0].test(normalized)) return rules[i][1];
        }
        return normalized.length > 8 ? normalized.slice(0, 7) + '…' : normalized;
    }

    function planTournamentLabel(item) {
        return String((item && (item.tournamentShortName || '')) || '').trim()
            || shortTournamentName(item && item.tournamentName);
    }

    function planVsText(item) {
        var home = String((item && item.homeName) || '').trim();
        var away = String((item && item.awayName) || '').trim();
        if (home || away) return (home || '—') + ' VS ' + (away || '—');
        return '';
    }

    function applyMatchMeta(item, data) {
        if (!item || !data) return;
        item.tournamentName = item.tournamentName || data.tnName || data.tournamentName || '';
        if (!item.tournamentShortName) {
            item.tournamentShortName = shortTournamentName(item.tournamentName);
        }
        item.homeName = item.homeName || data.homeName || data.home_name || '';
        item.awayName = item.awayName || data.awayName || data.away_name || '';
        item.matchStatus = item.matchStatus || data.status || data.matchStatus || '';
        item.finalScore = item.finalScore || data.finalScore || data.final_score || '';
    }

    function planItemHasNames(item) {
        return !!(item && (item.homeName || item.awayName || item.tournamentName || item.tournamentShortName));
    }

    function fetchMatchEntity(matchId, callback) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: PLAN_MATCH_ENTITY_API + encodeURIComponent(matchId),
            timeout: 15000,
            onload: function (res) {
                try {
                    var json = JSON.parse(res.responseText || '{}');
                    callback(json && json.data ? json.data : null);
                } catch (e) {
                    callback(null);
                }
            },
            onerror: function () { callback(null); },
            ontimeout: function () { callback(null); }
        });
    }

    function enrichPlanMatchNames() {
        var missing = planMatches.filter(function (item) {
            return item && item.matchId && !planItemHasNames(item);
        });
        if (!missing.length) return;

        var pending = missing.length;
        missing.forEach(function (item) {
            var id = String(item.matchId);
            var cached = planMatchMetaCache[id];
            if (cached) {
                applyMatchMeta(item, cached);
                pending -= 1;
                if (pending <= 0) {
                    lastPlanRenderKey = '';
                    renderPlanList();
                }
                return;
            }
            fetchMatchEntity(id, function (data) {
                if (data) {
                    planMatchMetaCache[id] = data;
                    applyMatchMeta(item, data);
                }
                pending -= 1;
                if (pending <= 0) {
                    lastPlanRenderKey = '';
                    renderPlanList();
                }
            });
        });
    }

    function dedupePlanMatches(list) {
        var map = {};
        (list || []).forEach(function (item) {
            if (!item) return;
            var id = String(item.matchId || '');
            if (!id) return;
            var prev = map[id];
            if (!prev) {
                map[id] = item;
                return;
            }
            var prevTs = Date.parse(prev.updatedTime || prev.createdTime || '') || 0;
            var nextTs = Date.parse(item.updatedTime || item.createdTime || '') || 0;
            if (nextTs >= prevTs) map[id] = item;
        });
        return Object.keys(map).map(function (k) { return map[k]; });
    }

    function sortPlanGroup(list, key) {
        return list.slice().sort(function (a, b) {
            var ka = parsePlanKickoffMs(a.kickoffTime) || 0;
            var kb = parsePlanKickoffMs(b.kickoffTime) || 0;
            if (key === 'upcoming') return ka - kb;
            return kb - ka;
        });
    }

    function groupedPlanMatches() {
        var groups = { live: [], upcoming: [], ended: [] };
        filteredPlanMatches().forEach(function (item) {
            groups[classifyPlanMatch(item)].push(item);
        });
        PLAN_GROUPS.forEach(function (g) {
            groups[g.key] = sortPlanGroup(groups[g.key], g.key);
        });
        return groups;
    }

    function normalizePlanFilter(text) {
        return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function planFilterTokens() {
        var q = normalizePlanFilter(planFilterQuery);
        if (!q) return [];
        return q.split(' ').filter(Boolean);
    }

    function planFilterHaystack(item) {
        if (!item) return '';
        return [
            item.tournamentName,
            item.tournamentShortName,
            item.homeName,
            item.awayName,
            item.matchId,
            planVsText(item)
        ].join(' ').toLowerCase();
    }

    function fuzzySubseq(hay, token) {
        var from = 0;
        for (var i = 0; i < token.length; i++) {
            from = hay.indexOf(token.charAt(i), from);
            if (from < 0) return false;
            from += 1;
        }
        return true;
    }

    function matchPlanFilter(item, tokens) {
        if (!tokens.length) return true;
        var hay = planFilterHaystack(item);
        if (!hay) return false;
        return tokens.every(function (tok) {
            if (hay.indexOf(tok) >= 0) return true;
            return tok.length >= 2 && fuzzySubseq(hay, tok);
        });
    }

    function filteredPlanMatches() {
        var tokens = planFilterTokens();
        if (!tokens.length) return planMatches;
        return planMatches.filter(function (item) {
            return matchPlanFilter(item, tokens);
        });
    }

    function injectPlanListStyle() {
        var ver = getPlanScriptVersion();
        var old = document.getElementById(PLAN_STYLE_ID);
        if (old && old.getAttribute('data-ver') === ver) return;
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var style = document.createElement('style');
        style.id = PLAN_STYLE_ID;
        style.setAttribute('data-ver', ver);
        style.textContent =
            '#' + PLAN_PANEL_ID + ' {' +
            'position: fixed;' +
            'left: 12px;' +
            'top: 72px;' +
            'z-index: 999997;' +
            'width: 300px;' +
            'max-height: calc(100vh - 160px);' +
            'display: flex;' +
            'flex-direction: column;' +
            'border: 1px solid #d8e2ec;' +
            'border-radius: 10px;' +
            'background: linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%);' +
            'overflow: hidden;' +
            'font-size: 12px;' +
            'color: #1e293b;' +
            'box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);' +
            'box-sizing: border-box;' +
            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;' +
            'transition: width 0.2s ease, height 0.2s ease, left 0.2s ease, top 0.2s ease, border-radius 0.2s ease, box-shadow 0.2s ease;' +
            '}' +
            '#' + PLAN_PANEL_ID + '.tm-8868-plan-hidden {' +
            'display: none !important;' +
            '}' +
            '#' + PLAN_PANEL_ID + '.tm-8868-plan-collapsed {' +
            'left: 0;' +
            'top: 38%;' +
            'width: 32px;' +
            'max-height: none;' +
            'height: auto;' +
            'min-height: 96px;' +
            'border-radius: 0 12px 12px 0;' +
            'border-left: none;' +
            'background: radial-gradient(circle at 30% 24%, #ecfdf5 0%, #86efac 48%, #22c55e 100%);' +
            'box-shadow: 4px 0 14px rgba(22, 163, 74, 0.28), inset -6px 0 10px rgba(21, 128, 61, 0.16);' +
            'cursor: pointer;' +
            '}' +
            '#' + PLAN_PANEL_ID + '.tm-8868-plan-collapsed:hover {' +
            'width: 36px;' +
            'box-shadow: 6px 0 16px rgba(22, 163, 74, 0.38), inset -6px 0 10px rgba(21, 128, 61, 0.16);' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-head {' +
            'display: flex;' +
            'align-items: center;' +
            'justify-content: space-between;' +
            'gap: 8px;' +
            'padding: 8px 10px;' +
            'background: #e8eef5;' +
            'border-bottom: 1px solid #d8e2ec;' +
            'font-weight: 600;' +
            'font-size: 12px;' +
            'color: #475569;' +
            'user-select: none;' +
            'flex-shrink: 0;' +
            '}' +
            '#' + PLAN_PANEL_ID + '.tm-8868-plan-collapsed .tm-8868-plan-head {' +
            'flex: 1;' +
            'padding: 10px 0;' +
            'background: transparent;' +
            'border-bottom: none;' +
            'justify-content: center;' +
            'writing-mode: vertical-rl;' +
            'letter-spacing: 2px;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-title {' +
            'flex: 1 1 auto;' +
            'display: inline-flex;' +
            'align-items: baseline;' +
            'gap: 6px;' +
            'min-width: 0;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-ver {' +
            'font-size: 10px;' +
            'font-weight: 500;' +
            'color: #94a3b8;' +
            'letter-spacing: 0;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-head-actions {' +
            'display: inline-flex;' +
            'align-items: center;' +
            'gap: 2px;' +
            'flex-shrink: 0;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-icon-btn {' +
            'display: inline-flex;' +
            'align-items: center;' +
            'justify-content: center;' +
            'width: 22px;' +
            'height: 22px;' +
            'border: none;' +
            'background: transparent;' +
            'color: #64748b;' +
            'font-size: 14px;' +
            'line-height: 1;' +
            'cursor: pointer;' +
            'border-radius: 4px;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-icon-btn:hover {' +
            'background: rgba(148, 163, 184, 0.22);' +
            'color: #334155;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-ball-label {' +
            'display: none;' +
            '}' +
            '#' + PLAN_PANEL_ID + '.tm-8868-plan-collapsed .tm-8868-plan-title,' +
            '#' + PLAN_PANEL_ID + '.tm-8868-plan-collapsed .tm-8868-plan-head-actions,' +
            '#' + PLAN_PANEL_ID + '.tm-8868-plan-collapsed .tm-8868-plan-body {' +
            'display: none;' +
            '}' +
            '#' + PLAN_PANEL_ID + '.tm-8868-plan-collapsed .tm-8868-plan-ball-label {' +
            'display: block;' +
            'font-size: 13px;' +
            'font-weight: 700;' +
            'line-height: 1.25;' +
            'color: #14532d;' +
            'text-shadow: 0 1px 0 rgba(255,255,255,0.45);' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-body {' +
            'padding: 8px 8px 10px;' +
            'overflow-y: auto;' +
            'flex: 1 1 auto;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-status {' +
            'margin: 0 2px 8px;' +
            'font-size: 11px;' +
            'color: #64748b;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-dates {' +
            'display: flex;' +
            'align-items: stretch;' +
            'gap: 4px;' +
            'margin: 0 0 8px;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-date-fields {' +
            'flex: 1 1 auto;' +
            'min-width: 0;' +
            'display: flex;' +
            'flex-direction: column;' +
            'gap: 4px;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-dates input[type="date"] {' +
            'display: block;' +
            'width: 100%;' +
            'box-sizing: border-box;' +
            'height: 26px;' +
            'border: 1px solid #d8e2ec;' +
            'border-radius: 5px;' +
            'padding: 0 6px;' +
            'font-size: 12px;' +
            'color: #0f172a;' +
            'background: #fff;' +
            'font-family: inherit;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-dates input[type="date"]::-webkit-calendar-picker-indicator {' +
            'margin-left: 4px;' +
            'cursor: pointer;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-date-shift,' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-date-today {' +
            'flex: 0 0 auto;' +
            'width: 22px;' +
            'padding: 0;' +
            'border: 1px solid #d8e2ec;' +
            'border-radius: 5px;' +
            'background: #fff;' +
            'color: #334155;' +
            'cursor: pointer;' +
            'font-size: 12px;' +
            'line-height: 1;' +
            'font-family: inherit;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-date-shift:hover,' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-date-today:hover {' +
            'background: #f1f5f9;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-date-today {' +
            'width: 26px;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-filter {' +
            'margin: 0 0 8px;' +
            'position: relative;' +
            'z-index: 8;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-filter-input {' +
            'display: block;' +
            'width: 100%;' +
            'box-sizing: border-box;' +
            'border: 1px solid #d8e2ec;' +
            'border-radius: 6px;' +
            'padding: 5px 8px;' +
            'font-size: 12px;' +
            'line-height: 1.4;' +
            'color: #0f172a;' +
            'background: #fff;' +
            'outline: none;' +
            'font-family: inherit;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-filter-input:focus {' +
            'border-color: #94a3b8;' +
            'box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.25);' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-filter-input::placeholder {' +
            'color: #94a3b8;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-filter-history {' +
            'display: none;' +
            'position: absolute;' +
            'left: 0;' +
            'right: 0;' +
            'top: calc(100% - 2px);' +
            'z-index: 9;' +
            'max-height: 220px;' +
            'overflow-y: auto;' +
            'border: 1px solid #d8e2ec;' +
            'border-radius: 6px;' +
            'background: #fff;' +
            'box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-filter-history.is-open {' +
            'display: block;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-history-empty {' +
            'padding: 8px 10px;' +
            'font-size: 12px;' +
            'color: #94a3b8;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-history-item {' +
            'display: flex;' +
            'align-items: center;' +
            'gap: 6px;' +
            'padding: 0;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-history-use {' +
            'flex: 1 1 auto;' +
            'min-width: 0;' +
            'border: none;' +
            'background: transparent;' +
            'text-align: left;' +
            'padding: 6px 8px;' +
            'font-size: 12px;' +
            'color: #0f172a;' +
            'cursor: pointer;' +
            'font-family: inherit;' +
            'overflow: hidden;' +
            'text-overflow: ellipsis;' +
            'white-space: nowrap;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-history-use:hover {' +
            'background: #f1f5f9;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-history-del {' +
            'flex: 0 0 auto;' +
            'width: 22px;' +
            'height: 22px;' +
            'margin-right: 4px;' +
            'border: none;' +
            'border-radius: 4px;' +
            'background: transparent;' +
            'color: #94a3b8;' +
            'cursor: pointer;' +
            'font-size: 13px;' +
            'line-height: 1;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-history-del:hover {' +
            'background: #fee2e2;' +
            'color: #b91c1c;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-status[data-kind="err"] {' +
            'color: #b91c1c;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group {' +
            'border: 1px solid #dbe3ee;' +
            'border-radius: 8px;' +
            'margin-bottom: 8px;' +
            'background: rgba(255,255,255,0.78);' +
            'overflow: hidden;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group[data-group="live"] {' +
            'border-color: #bbf7d0;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group[data-group="ended"] {' +
            'opacity: 0.88;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group-head {' +
            'display: flex;' +
            'align-items: center;' +
            'justify-content: space-between;' +
            'padding: 6px 8px;' +
            'font-weight: 600;' +
            'font-size: 12px;' +
            'color: #334155;' +
            'cursor: pointer;' +
            'user-select: none;' +
            'background: #f8fafc;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group[data-group="live"] .tm-8868-plan-group-head {' +
            'color: #166534;' +
            'background: #f0fdf4;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group[data-group="ended"] .tm-8868-plan-group-head {' +
            'color: #64748b;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group-count {' +
            'font-weight: 600;' +
            'color: inherit;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group-arrow {' +
            'color: #94a3b8;' +
            'font-size: 12px;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group-list {' +
            'padding: 2px 4px 6px;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-group[data-collapsed="1"] .tm-8868-plan-group-list {' +
            'display: none;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-empty {' +
            'padding: 6px 8px;' +
            'color: #94a3b8;' +
            'font-size: 11px;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item {' +
            'display: flex;' +
            'align-items: flex-start;' +
            'gap: 6px;' +
            'padding: 6px 6px;' +
            'border-radius: 6px;' +
            'text-decoration: none;' +
            'color: inherit;' +
            'line-height: 1.35;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item:hover {' +
            'background: #eff6ff;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item.is-current {' +
            'background: #dbeafe;' +
            'box-shadow: inset 3px 0 0 #2563eb;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item.is-ended {' +
            'color: #64748b;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-dot {' +
            'flex: 0 0 auto;' +
            'width: 7px;' +
            'height: 7px;' +
            'margin-top: 5px;' +
            'border-radius: 50%;' +
            'background: #94a3b8;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item.is-live .tm-8868-plan-dot {' +
            'background: #22c55e;' +
            'box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item-main {' +
            'flex: 1 1 auto;' +
            'min-width: 0;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item-time {' +
            'font-weight: 600;' +
            'color: #0f172a;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item-kind {' +
            'margin-left: 6px;' +
            'font-weight: 500;' +
            'font-size: 11px;' +
            'color: #64748b;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item-vs {' +
            'display: block;' +
            'margin-top: 1px;' +
            'font-weight: 600;' +
            'font-size: 12px;' +
            'color: #0f172a;' +
            'line-height: 1.35;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item-tour {' +
            'display: inline-block;' +
            'margin-right: 6px;' +
            'padding: 0 5px;' +
            'border-radius: 4px;' +
            'background: #e2e8f0;' +
            'color: #334155;' +
            'font-size: 11px;' +
            'font-weight: 600;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item.is-ended .tm-8868-plan-item-time,' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item.is-ended .tm-8868-plan-item-vs {' +
            'color: #64748b;' +
            'font-weight: 500;' +
            '}' +
            '#' + PLAN_PANEL_ID + ' .tm-8868-plan-item-elapsed {' +
            'margin-left: 6px;' +
            'color: #16a34a;' +
            'font-weight: 600;' +
            '}';
        document.head.appendChild(style);
    }

    function setPlanPanelCollapsed(panel, collapsed) {
        planCollapsed = !!collapsed;
        panel.classList.toggle('tm-8868-plan-collapsed', planCollapsed);
        var toggle = panel.querySelector('.tm-8868-plan-toggle');
        if (toggle) toggle.textContent = planCollapsed ? '›' : '‹';
        var head = panel.querySelector('.tm-8868-plan-head');
        if (head) head.title = planCollapsed ? '点击展开比赛列表' : '点击收起到左侧';
    }

    function planRenderKey() {
        var currentId = getCurrentMatchId();
        var rows = planMatches.map(function (item) {
            return [
                item.matchId || '',
                item.kickoffTime || '',
                item.homeName || '',
                item.awayName || '',
                item.tournamentShortName || item.tournamentName || '',
                item.matchStatus || '',
                classifyPlanMatch(item)
            ].join(':');
        }).join(';');
        return [
            planStatus,
            planError,
            currentId,
            String(Math.floor(Date.now() / 60000)),
            planCollapsed ? '1' : '0',
            planGroupCollapsed.live ? '1' : '0',
            planGroupCollapsed.upcoming ? '1' : '0',
            planGroupCollapsed.ended ? '1' : '0',
            normalizePlanFilter(planFilterQuery),
            planDateBegin,
            planDateEnd,
            rows
        ].join('|');
    }

    function renderPlanItem(item, groupKey) {
        var id = String(item.matchId || '');
        var href = planMatchUrl(item);
        var currentId = getCurrentMatchId();
        var isCurrent = id && id === currentId;
        var kick = formatPlanKickoff(item.kickoffTime);
        var elapsed = groupKey === 'live' ? formatLiveElapsed(item.kickoffTime) : '';
        var tour = planTournamentLabel(item);
        var vsText = planVsText(item);
        var score = String(item.finalScore || '').trim();
        var cls = 'tm-8868-plan-item';
        if (isCurrent) cls += ' is-current';
        if (groupKey === 'live') cls += ' is-live';
        if (groupKey === 'ended') cls += ' is-ended';
        var elapsedHtml = elapsed
            ? '<span class="tm-8868-plan-item-elapsed">' + escapeHtml(elapsed) + '</span>'
            : '';
        var tourHtml = tour
            ? '<span class="tm-8868-plan-item-tour">' + escapeHtml(tour) + '</span>'
            : '';
        var vsHtml = vsText
            ? '<span class="tm-8868-plan-item-vs">' + tourHtml + escapeHtml(vsText) +
                (score ? ' ' + escapeHtml(score) : '') + '</span>'
            : '<span class="tm-8868-plan-item-vs">' + tourHtml + '#' + escapeHtml(id || '—') + '</span>';
        var kindHint = shouldOpenInplay(item) ? '滚球' : '早盘';
        if (isCurrent) kindHint = '当前 · ' + kindHint;
        var tag = href ? 'a' : 'div';
        var titleParts = [];
        if (tour) titleParts.push(tour);
        if (vsText) titleParts.push(vsText);
        titleParts.push(kindHint + ' #' + id);
        var hrefAttr = href
            ? ' href="' + escapeHtml(href) + '" title="' + escapeHtml(titleParts.join(' · ')) + '"'
            : '';
        return '<' + tag + ' class="' + cls + '"' + hrefAttr + ' data-match-id="' + escapeHtml(id) + '">' +
            '<span class="tm-8868-plan-dot"></span>' +
            '<span class="tm-8868-plan-item-main">' +
            vsHtml +
            '<span class="tm-8868-plan-item-time">' + escapeHtml(kick || '—') + elapsedHtml +
            '<span class="tm-8868-plan-item-kind">' + escapeHtml(kindHint) + '</span></span>' +
            '</span>' +
            '</' + tag + '>';
    }

    function renderPlanList() {
        var panel = document.getElementById(PLAN_PANEL_ID);
        if (!panel) return;

        var key = planRenderKey();
        if (key === lastPlanRenderKey) return;

        setPlanPanelCollapsed(panel, planCollapsed);

        var statusEl = panel.querySelector('.tm-8868-plan-status');
        var groups = groupedPlanMatches();
        var liveCount = groups.live.length;
        var upcomingCount = groups.upcoming.length;
        var endedCount = groups.ended.length;

        if (statusEl) {
            if (planStatus === 'loading' && !planMatches.length) {
                statusEl.textContent = '加载中…';
                statusEl.dataset.kind = 'info';
            } else if (planStatus === 'err' && !planMatches.length) {
                statusEl.textContent = planError || '加载失败';
                statusEl.dataset.kind = 'err';
            } else {
                var parts = [];
                var shown = liveCount + upcomingCount + endedCount;
                if (planFilterTokens().length) {
                    parts.push(shown + '/' + planMatches.length + ' 场');
                    parts.push('已筛选');
                } else {
                    parts.push(planMatches.length + ' 场');
                }
                if (liveCount) parts.push(liveCount + ' 进行中');
                if (upcomingCount) parts.push(upcomingCount + ' 未开始');
                if (endedCount) parts.push(endedCount + ' 已结束');
                if (planStatus === 'err') parts.push('刷新失败');
                statusEl.textContent = parts.join(' · ');
                statusEl.dataset.kind = planStatus === 'err' ? 'err' : 'info';
            }
        }

        var ball = panel.querySelector('.tm-8868-plan-ball-label');
        if (ball) {
            ball.textContent = liveCount ? ('比赛 ' + liveCount) : '比赛';
        }

        PLAN_GROUPS.forEach(function (g) {
            var section = panel.querySelector('.tm-8868-plan-group[data-group="' + g.key + '"]');
            if (!section) return;
            var rows = groups[g.key] || [];
            var filtering = planFilterTokens().length > 0;
            var collapsed = filtering ? (rows.length === 0) : !!planGroupCollapsed[g.key];
            section.dataset.collapsed = collapsed ? '1' : '0';
            var countEl = section.querySelector('.tm-8868-plan-group-count');
            var arrowEl = section.querySelector('.tm-8868-plan-group-arrow');
            var listEl = section.querySelector('.tm-8868-plan-group-list');
            if (countEl) countEl.textContent = g.label + ' (' + rows.length + ')';
            if (arrowEl) arrowEl.textContent = collapsed ? '▸' : '▾';
            if (!listEl) return;
            if (!rows.length) {
                listEl.innerHTML = '<div class="tm-8868-plan-empty">' +
                    (filtering ? '无匹配' : '暂无') + '</div>';
                return;
            }
            try {
                listEl.innerHTML = rows.map(function (item) {
                    return renderPlanItem(item, g.key);
                }).join('');
            } catch (e) {
                console.error('[8868-plan] 渲染比赛失败', e);
                listEl.innerHTML = rows.map(function (item) {
                    var id = escapeHtml(item && item.matchId ? item.matchId : '');
                    var kick = escapeHtml(formatPlanKickoff(item && item.kickoffTime));
                    return '<div class="tm-8868-plan-item">#' + id + ' ' + kick + '</div>';
                }).join('');
            }
        });
        lastPlanRenderKey = key;
    }

    function fetchPlanMatches(silent) {
        if (silent && planFetchInFlight) return;
        var seq = ++planFetchSeq;
        planFetchInFlight = true;
        if (!silent) {
            planStatus = 'loading';
            planError = '';
            lastPlanRenderKey = '';
            renderPlanList();
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: buildPlanListUrl(),
            timeout: TIMEOUT,
            onload: function (res) {
                if (seq !== planFetchSeq) return;
                planFetchInFlight = false;
                try {
                    var json = JSON.parse(res.responseText || '{}');
                    if (String(json.code) !== '200') {
                        throw new Error(json.msg || '接口返回错误');
                    }
                    planMatches = dedupePlanMatches(Array.isArray(json.data) ? json.data : []);
                    planStatus = 'ok';
                    planError = '';
                    lastPlanRenderKey = '';
                    renderPlanList();
                    enrichPlanMatchNames();
                    return;
                } catch (e) {
                    if (!planMatches.length) planStatus = 'err';
                    else planStatus = 'ok';
                    planError = (e && e.message) ? e.message : '解析失败';
                }
                lastPlanRenderKey = '';
                renderPlanList();
            },
            onerror: function () {
                if (seq !== planFetchSeq) return;
                planFetchInFlight = false;
                if (!planMatches.length) planStatus = 'err';
                planError = '网络错误';
                lastPlanRenderKey = '';
                renderPlanList();
            },
            ontimeout: function () {
                if (seq !== planFetchSeq) return;
                planFetchInFlight = false;
                if (!planMatches.length) planStatus = 'err';
                planError = '请求超时';
                lastPlanRenderKey = '';
                renderPlanList();
            }
        });
    }

    function eventElement(e) {
        var el = e && e.target;
        if (!el) return null;
        if (el.nodeType !== 1) el = el.parentElement;
        return el;
    }

    function startPlanListPoll() {
        if (!planPollTimer) {
            planPollTimer = setInterval(function () {
                if (!isSportEventsPage() || isHistoryPage()) return;
                fetchPlanMatches(true);
            }, PLAN_POLL_MS);
        }
        if (!planTickTimer) {
            planTickTimer = setInterval(function () {
                if (!isSportEventsPage() || isHistoryPage()) return;
                renderPlanList();
            }, 15000);
        }
    }

    function planFilterInnerHtml() {
        return '<input type="text" class="tm-8868-plan-filter-input" placeholder="联赛 / 球队" autocomplete="off" spellcheck="false">' +
            '<div class="tm-8868-plan-filter-history"></div>';
    }

    function loadPlanFilterHistory() {
        try {
            var raw = localStorage.getItem(PLAN_FILTER_HISTORY_KEY);
            var list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) return [];
            return list.map(function (x) {
                return String(x || '').trim();
            }).filter(Boolean).slice(0, PLAN_FILTER_HISTORY_MAX);
        } catch (e) {
            return [];
        }
    }

    function savePlanFilterHistory(list) {
        try {
            localStorage.setItem(
                PLAN_FILTER_HISTORY_KEY,
                JSON.stringify((list || []).slice(0, PLAN_FILTER_HISTORY_MAX))
            );
        } catch (e) { /* ignore quota */ }
    }

    function rememberPlanFilter(query) {
        var q = String(query || '').trim();
        if (!q) return;
        var list = loadPlanFilterHistory().filter(function (x) {
            return x.toLowerCase() !== q.toLowerCase();
        });
        list.unshift(q);
        savePlanFilterHistory(list);
    }

    function removePlanFilterHistory(query) {
        var q = String(query || '').toLowerCase();
        savePlanFilterHistory(loadPlanFilterHistory().filter(function (x) {
            return x.toLowerCase() !== q;
        }));
    }

    function closePlanFilterHistory(panel) {
        var box = panel && panel.querySelector('.tm-8868-plan-filter-history');
        if (box) box.classList.remove('is-open');
    }

    function renderPlanFilterHistory(panel) {
        var box = panel && panel.querySelector('.tm-8868-plan-filter-history');
        if (!box) return;
        var list = loadPlanFilterHistory();
        if (!list.length) {
            box.innerHTML = '<div class="tm-8868-plan-history-empty">暂无搜索记录</div>';
            return;
        }
        box.innerHTML = list.map(function (q) {
            return '<div class="tm-8868-plan-history-item">' +
                '<button type="button" class="tm-8868-plan-history-use" title="' + escapeHtml(q) + '">' +
                escapeHtml(q) + '</button>' +
                '<button type="button" class="tm-8868-plan-history-del" title="删除" aria-label="删除">×</button>' +
                '</div>';
        }).join('');
    }

    function openPlanFilterHistory(panel) {
        var box = panel && panel.querySelector('.tm-8868-plan-filter-history');
        if (!box) return;
        renderPlanFilterHistory(panel);
        box.classList.add('is-open');
    }

    function applyPlanFilter(panel, query) {
        var filterInput = panel && panel.querySelector('.tm-8868-plan-filter-input');
        planFilterQuery = String(query || '');
        if (filterInput) filterInput.value = planFilterQuery;
        rememberPlanFilter(planFilterQuery);
        closePlanFilterHistory(panel);
        lastPlanRenderKey = '';
        renderPlanList();
    }

    function bindPlanFilterEvents(panel) {
        var wrap = panel.querySelector('.tm-8868-plan-filter');
        var filterInput = panel.querySelector('.tm-8868-plan-filter-input');
        if (!wrap || !filterInput) return;
        if (planFilterQuery && filterInput.value !== planFilterQuery) {
            filterInput.value = planFilterQuery;
        }
        if (wrap.getAttribute('data-bound')) return;
        wrap.setAttribute('data-bound', '1');
        var hideTimer = null;
        var rememberTimer = null;

        wrap.addEventListener('click', function (e) {
            e.stopPropagation();
            var target = eventElement(e);
            if (!target || !target.closest) return;
            var del = target.closest('.tm-8868-plan-history-del');
            if (del) {
                var item = del.closest('.tm-8868-plan-history-item');
                var useBtn = item && item.querySelector('.tm-8868-plan-history-use');
                removePlanFilterHistory(useBtn ? useBtn.textContent : '');
                openPlanFilterHistory(panel);
                filterInput.focus();
                return;
            }
            var use = target.closest('.tm-8868-plan-history-use');
            if (use) {
                applyPlanFilter(panel, use.textContent);
                filterInput.focus();
            }
        });
        wrap.addEventListener('mousedown', function (e) {
            var target = eventElement(e);
            if (target && target.closest && target.closest('.tm-8868-plan-filter-history')) {
                e.preventDefault();
            }
        });
        filterInput.addEventListener('click', function (e) {
            e.stopPropagation();
            openPlanFilterHistory(panel);
        });
        filterInput.addEventListener('focus', function () {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            openPlanFilterHistory(panel);
        });
        filterInput.addEventListener('blur', function () {
            rememberPlanFilter(filterInput.value);
            hideTimer = setTimeout(function () {
                closePlanFilterHistory(panel);
            }, 180);
        });
        filterInput.addEventListener('keydown', function (e) {
            e.stopPropagation();
            var box = wrap.querySelector('.tm-8868-plan-filter-history');
            if (e.key === 'Escape') {
                if (box && box.classList.contains('is-open')) {
                    closePlanFilterHistory(panel);
                    return;
                }
                filterInput.value = '';
                planFilterQuery = '';
                lastPlanRenderKey = '';
                renderPlanList();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                rememberPlanFilter(filterInput.value);
                closePlanFilterHistory(panel);
            }
        });
        filterInput.addEventListener('input', function () {
            planFilterQuery = String(filterInput.value || '');
            lastPlanRenderKey = '';
            renderPlanList();
            if (rememberTimer) clearTimeout(rememberTimer);
            rememberTimer = setTimeout(function () {
                rememberPlanFilter(filterInput.value);
                if (document.activeElement === filterInput) openPlanFilterHistory(panel);
            }, 500);
        });
    }

    function ensurePlanFilter(panel) {
        if (!panel) return;
        var body = panel.querySelector('.tm-8868-plan-body');
        if (!body) return;
        var wrap = panel.querySelector('.tm-8868-plan-filter');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'tm-8868-plan-filter';
            wrap.innerHTML = planFilterInnerHtml();
            body.insertBefore(wrap, body.firstChild);
        } else if (!wrap.querySelector('.tm-8868-plan-filter-history')) {
            var box = document.createElement('div');
            box.className = 'tm-8868-plan-filter-history';
            wrap.appendChild(box);
        }
        var existingInput = wrap.querySelector('.tm-8868-plan-filter-input');
        if (existingInput && existingInput.getAttribute('type') === 'search') {
            existingInput.setAttribute('type', 'text');
        }
        bindPlanFilterEvents(panel);
    }

    function planDatesInnerHtml() {
        return '<button type="button" class="tm-8868-plan-date-shift" data-shift="-1" title="向前一天">‹</button>' +
            '<div class="tm-8868-plan-date-fields">' +
            '<input type="date" class="tm-8868-plan-date-begin" title="开始日期">' +
            '<input type="date" class="tm-8868-plan-date-end" title="结束日期">' +
            '</div>' +
            '<button type="button" class="tm-8868-plan-date-shift" data-shift="1" title="向后一天">›</button>' +
            '<button type="button" class="tm-8868-plan-date-today" title="默认范围（前天～明天）">今</button>';
    }

    function syncPlanDateInputs(panel) {
        panel = panel || document.getElementById(PLAN_PANEL_ID);
        if (!panel) return;
        var beginEl = panel.querySelector('.tm-8868-plan-date-begin');
        var endEl = panel.querySelector('.tm-8868-plan-date-end');
        if (beginEl) beginEl.value = planDateBegin;
        if (endEl) endEl.value = planDateEnd;
    }

    function applyPlanDateRange(beginText, endText) {
        var next = normalizePlanDates(beginText, endText);
        if (!next) {
            syncPlanDateInputs();
            return;
        }
        if (next.begin === planDateBegin && next.end === planDateEnd) {
            syncPlanDateInputs();
            return;
        }
        planDateBegin = next.begin;
        planDateEnd = next.end;
        savePlanDates();
        syncPlanDateInputs();
        planMatches = [];
        fetchPlanMatches(false);
    }

    function shiftPlanDateRange(deltaDays) {
        var begin = parsePlanYmd(planDateBegin);
        var end = parsePlanYmd(planDateEnd);
        if (!begin || !end) {
            loadPlanDates();
            begin = parsePlanYmd(planDateBegin);
            end = parsePlanYmd(planDateEnd);
        }
        if (!begin || !end) return;
        applyPlanDateRange(
            formatYmd(planAddDays(begin, deltaDays)),
            formatYmd(planAddDays(end, deltaDays))
        );
    }

    function bindPlanDateEvents(panel) {
        var wrap = panel.querySelector('.tm-8868-plan-dates');
        if (!wrap) return;
        syncPlanDateInputs(panel);
        if (wrap.getAttribute('data-bound')) return;
        wrap.setAttribute('data-bound', '1');

        wrap.addEventListener('click', function (e) {
            e.stopPropagation();
            var target = eventElement(e);
            if (!target || !target.closest) return;
            var todayBtn = target.closest('.tm-8868-plan-date-today');
            if (todayBtn) {
                var def = defaultPlanDates();
                applyPlanDateRange(def.begin, def.end);
                return;
            }
            var shiftBtn = target.closest('.tm-8868-plan-date-shift');
            if (shiftBtn) {
                shiftPlanDateRange(Number(shiftBtn.getAttribute('data-shift') || 0));
            }
        });
        wrap.addEventListener('change', function (e) {
            var target = eventElement(e);
            if (!target) return;
            if (target.classList && (target.classList.contains('tm-8868-plan-date-begin') ||
                target.classList.contains('tm-8868-plan-date-end'))) {
                applyPlanDateRange(
                    wrap.querySelector('.tm-8868-plan-date-begin').value,
                    wrap.querySelector('.tm-8868-plan-date-end').value
                );
            }
        });
    }

    function ensurePlanDates(panel) {
        if (!panel) return;
        if (!planDateBegin || !planDateEnd) loadPlanDates();
        var body = panel.querySelector('.tm-8868-plan-body');
        if (!body) return;
        var wrap = panel.querySelector('.tm-8868-plan-dates');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'tm-8868-plan-dates';
            wrap.innerHTML = planDatesInnerHtml();
            var filter = panel.querySelector('.tm-8868-plan-filter');
            if (filter && filter.nextSibling) body.insertBefore(wrap, filter.nextSibling);
            else body.insertBefore(wrap, body.firstChild);
        } else if (!wrap.querySelector('.tm-8868-plan-date-fields')) {
            wrap.innerHTML = planDatesInnerHtml();
            wrap.removeAttribute('data-bound');
        }
        bindPlanDateEvents(panel);
    }

    function bindPlanListEvents(panel) {
        ensurePlanFilter(panel);
        ensurePlanDates(panel);
        if (panel.getAttribute('data-bound')) return;
        panel.setAttribute('data-bound', '1');

        var head = panel.querySelector('.tm-8868-plan-head');
        if (head) {
            head.addEventListener('click', function (e) {
                var target = eventElement(e);
                if (target && target.closest && target.closest('.tm-8868-plan-refresh')) return;
                setPlanPanelCollapsed(panel, !planCollapsed);
                lastPlanRenderKey = '';
                renderPlanList();
            });
        }

        var refreshBtn = panel.querySelector('.tm-8868-plan-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                fetchPlanMatches(false);
            });
        }

        panel.addEventListener('click', function (e) {
            var target = eventElement(e);
            if (!target || !target.closest) return;
            var groupHead = target.closest('.tm-8868-plan-group-head');
            if (groupHead) {
                var section = groupHead.closest('.tm-8868-plan-group');
                if (!section) return;
                var key = section.getAttribute('data-group');
                if (!key) return;
                planGroupCollapsed[key] = !planGroupCollapsed[key];
                lastPlanRenderKey = '';
                renderPlanList();
            }
        });
    }

    function createPlanListPanel() {
        injectPlanListStyle();
        var panel = document.getElementById(PLAN_PANEL_ID);
        if (panel) {
            ensurePlanFilter(panel);
            ensurePlanDates(panel);
            bindPlanListEvents(panel);
            return panel;
        }

        panel = document.createElement('div');
        panel.id = PLAN_PANEL_ID;
        panel.innerHTML =
            '<div class="tm-8868-plan-head" title="点击收起到左侧">' +
            '<span class="tm-8868-plan-title">计划比赛<span class="tm-8868-plan-ver">v' +
            escapeHtml(getPlanScriptVersion()) + '</span></span>' +
            '<span class="tm-8868-plan-ball-label">比赛</span>' +
            '<span class="tm-8868-plan-head-actions">' +
            '<button type="button" class="tm-8868-plan-icon-btn tm-8868-plan-refresh" title="刷新">↻</button>' +
            '<button type="button" class="tm-8868-plan-icon-btn tm-8868-plan-toggle" title="收起到左侧">‹</button>' +
            '</span>' +
            '</div>' +
            '<div class="tm-8868-plan-body">' +
            '<div class="tm-8868-plan-filter">' +
            planFilterInnerHtml() +
            '</div>' +
            '<div class="tm-8868-plan-dates">' +
            planDatesInnerHtml() +
            '</div>' +
            '<div class="tm-8868-plan-status">加载中…</div>' +
            PLAN_GROUPS.map(function (g) {
                var collapsed = planGroupCollapsed[g.key] ? '1' : '0';
                return '<div class="tm-8868-plan-group" data-group="' + g.key + '" data-collapsed="' + collapsed + '">' +
                    '<div class="tm-8868-plan-group-head">' +
                    '<span class="tm-8868-plan-group-count">' + g.label + ' (0)</span>' +
                    '<span class="tm-8868-plan-group-arrow">' + (planGroupCollapsed[g.key] ? '▸' : '▾') + '</span>' +
                    '</div>' +
                    '<div class="tm-8868-plan-group-list"><div class="tm-8868-plan-empty">暂无</div></div>' +
                    '</div>';
            }).join('') +
            '</div>';

        (document.body || document.documentElement).appendChild(panel);
        bindPlanListEvents(panel);
        setPlanPanelCollapsed(panel, planCollapsed);
        return panel;
    }

    function applyPlanListRoute() {
        var panel = document.getElementById(PLAN_PANEL_ID);
        var show = isSportEventsPage() && !isHistoryPage();
        if (!show) {
            if (panel) panel.classList.add('tm-8868-plan-hidden');
            lastPlanListPath = window.location.pathname;
            return;
        }

        panel = createPlanListPanel();
        panel.classList.remove('tm-8868-plan-hidden');
        startPlanListPoll();

        var path = window.location.pathname;
        if (planStatus === 'idle') {
            fetchPlanMatches(false);
        } else if (path !== lastPlanListPath) {
            lastPlanRenderKey = '';
            renderPlanList();
        }
        lastPlanListPath = path;
    }

    function initPanel() {
        if (document.body) {
            applyUploadPanelRoute();
            setupUploadRouteWatcher();
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                applyUploadPanelRoute();
                setupUploadRouteWatcher();
            });
        }
    }

    initPanel();
    initXhrHook();
})();
