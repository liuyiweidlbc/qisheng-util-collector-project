// ==UserScript==
// @name 8868投注记录采集
// @namespace http://tampermonkey.net/
// @version 2026-06-08.8
// @description try to take over the world! Enhanced with timeout and error logging.
// @author You
// @include /^https:\/\/[\w-]*8868[\w-]*\.(app|com)\/history/
// @include /^https:\/\/[\w-]*hty[\w-]*\.(app|com)\/history/
// @icon https://www.google.com/s2/favicons?sz=64&domain=8868a34.app
// @grant GM_xmlhttpRequest
// @run-at document-end
// ==/UserScript==

(function () {
    'use strict';

    if (!window.location.pathname.includes('/history')) {
        console.log('不是history页面，直接退出');
        return;
    }

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
    var panelCollapsed = false;
    var manualUploading = false;
    var siteRetryTimers = {};
    var betUploadTimer = null;
    var betUploadInFlight = false;
    var betAutoUploadDone = false;

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
            'border-bottom: none;' +
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
        var originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            this._tmRequestUrl = resolveAbsoluteUrl(url);
            return originalOpen.apply(this, arguments);
        };

        var originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function () {
            var self = this;

            this.onreadystatechange = function () {
                if (self.readyState !== 4) return;

                var url = xhrRequestUrl(self);
                var matched = url.includes('platform/thirdparty-report/user/orders/sport?betStatus=') ||
                    url.includes('socbet') ||
                    url.includes('platform/payment/wallets/list') ||
                    url.includes('/product/cashout/setting');

                if (!matched) return;
                handleMatchedResponse(self);
            };

            originalSend.apply(this, arguments);
        };
    }

    function initPanel() {
        if (document.body) {
            createPanel();
        } else {
            document.addEventListener('DOMContentLoaded', createPanel);
        }
    }

    initPanel();
    initXhrHook();
})();
