// ==UserScript==
// @name         Migu回放进球定位
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Migu video 进球快速跳转和自动播放全场回放
// @author       You
// @match        *://*.miguvideo.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Global variables
    let timeOffset = 15;
    let timeOffsetInputElement = null;
    let isScoreVisible = true;
    let isTimeOffsetVisible = true;
    let fullMatchReplayClicked = false;
    let replayClickInFlight = false;
    let replayClickAttempts = 0;
    let replayScanTimer = null;
    let replayObserver = null;
    let replayScanScheduled = false;
    const replayScanDeadlineMs = 90000;
    const maxReplayClickAttempts = 12;
    const FULL_REPLAY_MIN_DURATION = 70 * 60;
    const HIGHLIGHT_MAX_DURATION = 50 * 60;
    let cachedReplayRoot = null;
    // 添加时间偏移自动隐藏相关变量
    let timeOffsetHideTimer = null;
    const timeOffsetHideDelay = 7000; // 7秒后自动隐藏

    function isHighlightsTitle(text) {
        return /集锦|精华|花絮|短视频/.test(text || '');
    }

    function isFullMatchReplayTitle(text) {
        const t = (text || '').replace(/\s+/g, ' ').trim();
        return t.includes('全场回放') && !isHighlightsTitle(t);
    }

    function scoreFullMatchReplayTitle(text) {
        const t = (text || '').replace(/\s+/g, ' ').trim();
        if (!isFullMatchReplayTitle(t)) return -1;
        let score = 10;
        // 优先官方【全场回放】，其次无解说括号的全场回放
        if (t.includes('【全场回放】')) score += 50;
        if (/^全场回放/.test(t) && !t.includes('(')) score += 20;
        return score;
    }

    function findReplayListRoot() {
        if (cachedReplayRoot && document.contains(cachedReplayRoot)) {
            return cachedReplayRoot;
        }
        if (!document.body) return null;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.textContent.trim() !== '本场回放') continue;
            let el = node.parentElement;
            for (let i = 0; i < 8 && el && el !== document.body; i++) {
                const rect = el.getBoundingClientRect();
                if (rect.width >= 400 && rect.height >= 60) {
                    cachedReplayRoot = el;
                    return el;
                }
                el = el.parentElement;
            }
            cachedReplayRoot = node.parentElement && node.parentElement.parentElement
                ? node.parentElement.parentElement
                : document.body;
            return cachedReplayRoot;
        }
        return document.body;
    }

    function isReplayCardSize(rect) {
        return rect.width >= 90 && rect.width <= 420 && rect.height >= 70 && rect.height <= 300;
    }

    function findClickableReplayCard(fromEl) {
        let el = fromEl;
        let best = fromEl;
        for (let i = 0; i < 10 && el && el !== document.body; i++) {
            const rect = el.getBoundingClientRect();
            const cls = String(el.className || '');
            if (isReplayCardSize(rect)) {
                best = el;
                if (/\b[\w-]*(item|card)[\w-]*\b/i.test(cls)) {
                    return el;
                }
            }
            el = el.parentElement;
        }
        return best;
    }

    function collectReplayCardsByPredicate(predicate) {
        const root = findReplayListRoot();
        if (!root) return [];
        const candidates = new Map();

        function addCandidate(el, text) {
            const t = (text || '').replace(/\s+/g, ' ').trim();
            if (!el || !t || t.length > 120 || !predicate(t)) return;
            const card = findClickableReplayCard(el);
            if (!card || candidates.has(card)) return;
            candidates.set(card, { card: card, titleEl: el, text: t });
        }

        root.querySelectorAll('[title], [aria-label]').forEach((el) => {
            addCandidate(el, el.getAttribute('title') || el.getAttribute('aria-label') || '');
        });

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            if (!text || text.length > 120) continue;
            addCandidate(node.parentElement, text);
        }

        return Array.from(candidates.values());
    }

    function collectFullMatchReplayCards() {
        return collectReplayCardsByPredicate(isFullMatchReplayTitle)
            .map((item) => {
                item.score = scoreFullMatchReplayTitle(item.text);
                return item;
            })
            .sort((a, b) => b.score - a.score);
    }

    function findKickReplayCard(exceptCard) {
        const highlights = collectReplayCardsByPredicate((t) => isHighlightsTitle(t) && !t.includes('全场回放'));
        for (let i = 0; i < highlights.length; i++) {
            if (highlights[i].card !== exceptCard) return highlights[i];
        }
        const others = collectReplayCardsByPredicate((t) =>
            (t.includes('集锦') || t.includes('全场回放')) && true
        );
        for (let i = 0; i < others.length; i++) {
            if (others[i].card !== exceptCard) return others[i];
        }
        return null;
    }

    function isThumbImage(img) {
        if (!img || img.tagName !== 'IMG') return false;
        const rect = img.getBoundingClientRect();
        return rect.width >= 70 && rect.height >= 40;
    }

    function collectThumbImages(root) {
        return Array.from(root.querySelectorAll('img')).filter(isThumbImage);
    }

    function findCoverImage(card, titleEl) {
        const searchRoots = [card, titleEl && titleEl.parentElement, titleEl].filter(Boolean);
        for (let i = 0; i < searchRoots.length; i++) {
            const imgs = collectThumbImages(searchRoots[i]);
            if (imgs.length === 1) return imgs[0];
            if (imgs.length > 1) {
                imgs.sort((a, b) => {
                    const ra = a.getBoundingClientRect();
                    const rb = b.getBoundingClientRect();
                    return rb.width * rb.height - ra.width * ra.height;
                });
                return imgs[0];
            }
        }

        let el = titleEl || card;
        for (let i = 0; i < 8 && el; i++) {
            const rect = el.getBoundingClientRect();
            if (el.querySelector('img') && isReplayCardSize(rect)) {
                const imgs = collectThumbImages(el);
                if (imgs.length) return imgs[0];
            }
            el = el.parentElement;
        }

        const root = findReplayListRoot();
        if (!root) return null;
        const thumbs = collectThumbImages(root);
        const titleEls = [];
        const titleWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = titleWalker.nextNode())) {
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            if (!text || text.length > 120) continue;
            if (!text.includes('全场回放') && !text.includes('集锦')) continue;
            titleEls.push(node.parentElement);
        }
        const idx = titleEls.indexOf(titleEl);
        if (idx >= 0 && idx < thumbs.length) return thumbs[idx];
        return null;
    }

    function getPlaybackClickTargets(card, titleEl) {
        const targets = [];
        const img = findCoverImage(card, titleEl);
        if (img) {
            targets.push(img);
            if (img.parentElement) targets.push(img.parentElement);
            const cover = img.closest('[class*="cover"], [class*="pic"], [class*="thumb"], [class*="poster"], [class*="img"]');
            if (cover) targets.push(cover);
            const anchor = img.closest('a') || (card && card.querySelector('a'));
            if (anchor) targets.push(anchor);
        } else if (card && card.querySelector('a')) {
            targets.push(card.querySelector('a'));
        }
        if (card) targets.push(card);
        return Array.from(new Set(targets.filter(Boolean)));
    }

    function invokeFrameworkClick(el) {
        if (!el) return;
        const mouse = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            composed: true
        });
        const vei = el._vei;
        if (vei) {
            ['onClick', 'onMousedown', 'onPointerdown'].forEach((key) => {
                const inv = vei[key];
                const fn = typeof inv === 'function' ? inv : inv && inv.value;
                if (typeof fn === 'function') {
                    try { fn(mouse); } catch (e) { /* ignore */ }
                }
            });
        }

        const reactKey = Object.keys(el).find((k) =>
            k.indexOf('__reactProps$') === 0 || k.indexOf('__reactEventHandlers$') === 0
        );
        if (reactKey && el[reactKey] && typeof el[reactKey].onClick === 'function') {
            try {
                el[reactKey].onClick({
                    type: 'click',
                    target: el,
                    currentTarget: el,
                    bubbles: true,
                    cancelable: true,
                    isTrusted: true,
                    preventDefault: function () {},
                    stopPropagation: function () {}
                });
            } catch (e) { /* ignore */ }
        }

        if (el.__vueParentComponent) {
            const props = (el.__vueParentComponent.vnode && el.__vueParentComponent.vnode.props) || {};
            if (typeof props.onClick === 'function') {
                try { props.onClick(mouse); } catch (e) { /* ignore */ }
            }
        }
    }

    function simulateClick(el) {
        if (!el) return;
        try {
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (e) {
            el.scrollIntoView();
        }
        const rect = el.getBoundingClientRect();
        const x = rect.left + Math.max(rect.width / 2, 1);
        const y = rect.top + Math.max(rect.height / 2, 1);
        let hit = document.elementFromPoint(x, y);
        if (!hit || !(el === hit || el.contains(hit))) hit = el;
        const opts = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: x,
            clientY: y,
            buttons: 1
        };
        const events = ['pointerover', 'pointerenter', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        events.forEach((type) => {
            const Ctor = type.indexOf('pointer') === 0 && typeof PointerEvent === 'function'
                ? PointerEvent
                : MouseEvent;
            hit.dispatchEvent(new Ctor(type, opts));
        });
        if (typeof hit.click === 'function') hit.click();
        invokeFrameworkClick(hit);
        if (hit !== el) invokeFrameworkClick(el);
    }

    function clickReplayCardForPlayback(card, titleEl, attempt) {
        const targets = getPlaybackClickTargets(card, titleEl);
        if (!targets.length) return;
        const strategy = attempt % 3;
        if (strategy === 0) {
            simulateClick(targets[0]);
        } else if (strategy === 1) {
            targets.slice(0, 3).forEach(simulateClick);
        } else {
            targets.forEach(simulateClick);
        }
    }

    function getVideoFingerprint() {
        const video = document.querySelector('video');
        if (!video) return { exists: false, src: '', duration: NaN, readyState: 0 };
        return {
            exists: true,
            src: video.currentSrc || video.src || '',
            duration: video.duration,
            readyState: video.readyState
        };
    }

    function isPlayerReady() {
        const fp = getVideoFingerprint();
        if (!fp.exists || fp.readyState < 2) return false;
        return (isFinite(fp.duration) && fp.duration > 0) || !!fp.src;
    }

    function fingerprintsDiffer(before, after) {
        if (!before.exists || !after.exists) return false;
        if (before.src && after.src && before.src !== after.src) return true;
        if (isFinite(before.duration) && isFinite(after.duration) && Math.abs(after.duration - before.duration) > 20) {
            return true;
        }
        return false;
    }

    function classifyDuration(duration) {
        if (!isFinite(duration) || duration <= 0) return 'unknown';
        if (duration >= FULL_REPLAY_MIN_DURATION) return 'full';
        if (duration <= HIGHLIGHT_MAX_DURATION) return 'highlights';
        return 'unknown';
    }

    function waitForPlaybackResult(before, timeoutMs, playerWasReady) {
        return new Promise((resolve) => {
            let settled = false;
            let sawReload = false;
            let video = document.querySelector('video');
            let pollTimer = null;
            let timeoutTimer = null;

            const finish = (result) => {
                if (settled) return;
                settled = true;
                if (pollTimer) clearInterval(pollTimer);
                if (timeoutTimer) clearTimeout(timeoutTimer);
                if (video) {
                    video.removeEventListener('emptied', onReload);
                    video.removeEventListener('loadstart', onReload);
                    video.removeEventListener('durationchange', onCheck);
                    video.removeEventListener('loadedmetadata', onCheck);
                }
                resolve(result);
            };

            const onCheck = () => {
                const after = getVideoFingerprint();
                const kind = classifyDuration(after.duration);
                if (kind === 'full') {
                    finish('full');
                    return;
                }
                if (playerWasReady && fingerprintsDiffer(before, after)) {
                    if (kind === 'highlights') finish('highlights');
                    else finish('switched');
                }
            };

            const onReload = () => {
                sawReload = true;
                onCheck();
            };

            if (video) {
                video.addEventListener('emptied', onReload);
                video.addEventListener('loadstart', onReload);
                video.addEventListener('durationchange', onCheck);
                video.addEventListener('loadedmetadata', onCheck);
            }

            pollTimer = setInterval(() => {
                if (!video) {
                    video = document.querySelector('video');
                    if (video) {
                        video.addEventListener('emptied', onReload);
                        video.addEventListener('loadstart', onReload);
                        video.addEventListener('durationchange', onCheck);
                        video.addEventListener('loadedmetadata', onCheck);
                    }
                }
                onCheck();
            }, 100);

            timeoutTimer = setTimeout(() => {
                const after = getVideoFingerprint();
                const kind = classifyDuration(after.duration);
                if (kind === 'full') {
                    finish('full');
                    return;
                }
                if (kind === 'highlights') {
                    finish('highlights');
                    return;
                }
                if (playerWasReady && (sawReload || fingerprintsDiffer(before, after))) {
                    finish('switched');
                    return;
                }
                finish('unknown');
            }, timeoutMs);
        });
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function stopFullMatchReplayWatcher() {
        if (replayScanTimer) {
            clearInterval(replayScanTimer);
            replayScanTimer = null;
        }
        if (replayObserver) {
            replayObserver.disconnect();
            replayObserver = null;
        }
    }

    function getCurrentPageId() {
        const m = location.pathname.match(/\/p\/(?:live|video)\/(\d+)/);
        return m ? m[1] : '';
    }

    function extractItemId(el) {
        let cur = el;
        for (let i = 0; i < 10 && cur; i++) {
            const inst = cur.__vueParentComponent || cur.__vue__;
            if (inst) {
                const bags = [
                    inst.props,
                    inst.setupState,
                    inst.ctx,
                    inst.$props,
                    inst.vnode && inst.vnode.props,
                    inst.data
                ];
                for (let b = 0; b < bags.length; b++) {
                    const bag = bags[b];
                    if (!bag || typeof bag !== 'object') continue;
                    const item = bag.item || bag;
                    const id = item.pId || item.pid || item.contId || item.contid ||
                        item.mgdbId || item.contentId || item.contentID || bag.pId || bag.contId;
                    if (id) return String(id);
                }
            }
            if (cur.getAttribute) {
                const attrs = ['data-id', 'data-pid', 'data-contid', 'data-cid', 'data-mgdbid'];
                for (let a = 0; a < attrs.length; a++) {
                    const v = cur.getAttribute(attrs[a]);
                    if (v) return v;
                }
            }
            cur = cur.parentElement;
        }
        return '';
    }

    function tryNavigateToReplayItem(card, titleEl) {
        const img = findCoverImage(card, titleEl);
        const a = (img && img.closest('a')) || (card && card.querySelector('a[href]'));
        if (a && a.getAttribute('href') && a.getAttribute('href').indexOf('javascript') !== 0 && a.getAttribute('href') !== '#') {
            try {
                const url = new URL(a.href, location.href);
                if (url.origin === location.origin && (url.pathname + url.search) !== (location.pathname + location.search)) {
                    console.log('通过链接跳转到全场回放', url.href);
                    fullMatchReplayClicked = true;
                    location.assign(url.href);
                    return true;
                }
            } catch (e) { /* ignore */ }
        }
        const id = extractItemId(img || card) || extractItemId(titleEl);
        const currentId = getCurrentPageId();
        if (id && currentId && id !== currentId && /^\d+$/.test(id)) {
            const prefix = location.pathname.indexOf('/p/video/') >= 0 ? '/p/video/' : '/p/live/';
            const next = location.origin + prefix + id;
            console.log('按内容ID跳转到全场回放', next);
            fullMatchReplayClicked = true;
            location.assign(next);
            return true;
        }
        return false;
    }

    async function switchToFullMatchReplay() {
        if (fullMatchReplayClicked) return true;

        const cards = collectFullMatchReplayCards();
        if (!cards.length) {
            return false;
        }

        const fp = getVideoFingerprint();
        if (classifyDuration(fp.duration) === 'full') {
            fullMatchReplayClicked = true;
            stopFullMatchReplayWatcher();
            console.log('当前视频时长已是全场回放，无需切换');
            return true;
        }

        replayClickAttempts += 1;
        const target = cards[0];
        const playerWasReady = isPlayerReady();
        const before = getVideoFingerprint();
        console.log('尝试切换全场回放:', target.text, 'attempt', replayClickAttempts);

        if (replayClickAttempts > 1) {
            const kick = findKickReplayCard(target.card);
            if (kick) {
                clickReplayCardForPlayback(kick.card, kick.titleEl, 0);
                await sleep(180);
            }
        }

        clickReplayCardForPlayback(target.card, target.titleEl, replayClickAttempts);
        if (replayClickAttempts > 1) {
            await sleep(80);
            clickReplayCardForPlayback(target.card, target.titleEl, replayClickAttempts);
        }

        const waitMs = playerWasReady ? 800 : 1200;
        const result = await waitForPlaybackResult(before, waitMs, playerWasReady);
        if (result === 'full' || result === 'switched') {
            fullMatchReplayClicked = true;
            stopFullMatchReplayWatcher();
            console.log('已切换到全场回放视频');
            return true;
        }

        if (replayClickAttempts >= 2 && tryNavigateToReplayItem(target.card, target.titleEl)) {
            stopFullMatchReplayWatcher();
            return true;
        }

        if (replayClickAttempts >= maxReplayClickAttempts) {
            console.log('多次点击仍未切换播放源，停止尝试');
            stopFullMatchReplayWatcher();
        }
        return false;
    }

    function tryClickFullMatchReplay() {
        if (fullMatchReplayClicked || replayClickInFlight) return fullMatchReplayClicked;
        replayClickInFlight = true;
        switchToFullMatchReplay().finally(() => {
            replayClickInFlight = false;
        });
        return false;
    }

    function scheduleReplayScan() {
        if (fullMatchReplayClicked || replayScanScheduled) return;
        replayScanScheduled = true;
        setTimeout(() => {
            replayScanScheduled = false;
            tryClickFullMatchReplay();
        }, 50);
    }

    function startFullMatchReplayWatcher() {
        if (replayObserver || replayScanTimer || fullMatchReplayClicked) return;

        const deadline = Date.now() + replayScanDeadlineMs;
        console.log('开始监听本场回放列表，准备切换到全场回放');

        replayObserver = new MutationObserver(() => {
            scheduleReplayScan();
        });
        replayObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        tryClickFullMatchReplay();
        replayScanTimer = setInterval(() => {
            if (fullMatchReplayClicked || Date.now() > deadline) {
                if (!fullMatchReplayClicked) {
                    console.log('超时仍未切换到全场回放');
                }
                stopFullMatchReplayWatcher();
                return;
            }
            tryClickFullMatchReplay();
        }, 400);
    }

    // Global keyboard event listener
    function setupKeyboardListener() {
        document.removeEventListener('keydown', handleKeyDown);
        document.addEventListener('keydown', handleKeyDown);
    }

    // 重置时间偏移隐藏计时器
    function resetTimeOffsetHideTimer() {
        // 清除现有计时器
        if (timeOffsetHideTimer) {
            clearTimeout(timeOffsetHideTimer);
        }

        // 设置新计时器
        timeOffsetHideTimer = setTimeout(() => {
            isTimeOffsetVisible = false;
            toggleTimeOffsetVisibility(false);
        }, timeOffsetHideDelay);
    }

    // Keyboard event handler
    function handleKeyDown(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            isScoreVisible = !isScoreVisible;
            toggleScoreVisibility(isScoreVisible);
        }
        else if (e.ctrlKey) {
            e.preventDefault();
            isTimeOffsetVisible = !isTimeOffsetVisible;
            toggleTimeOffsetVisibility(isTimeOffsetVisible);
        }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // 显示时间偏移控件
            if (!isTimeOffsetVisible) {
                isTimeOffsetVisible = true;
                toggleTimeOffsetVisibility(true);
            }

            // 重置自动隐藏计时器
            resetTimeOffsetHideTimer();

            if (e.key === 'ArrowUp') {
                timeOffset += 1;
                if (timeOffsetInputElement) {
                    timeOffsetInputElement.textContent = timeOffset;
                }
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                timeOffset = Math.max(0, timeOffset - 1);
                if (timeOffsetInputElement) {
                    timeOffsetInputElement.textContent = timeOffset;
                }
                e.preventDefault();
            }
        }
    }

    // Toggle score visibility
    function toggleScoreVisibility(isVisible) {
        const homeOverlay = document.getElementById('score-overlay-home');
        const guestOverlay = document.getElementById('score-overlay-guest');
        if (homeOverlay) homeOverlay.style.display = isVisible ? 'flex' : 'none';
        if (guestOverlay) guestOverlay.style.display = isVisible ? 'flex' : 'none';
    }

    // Toggle time offset visibility
    function toggleTimeOffsetVisibility(isVisible) {
        const timeOffsetContainer = document.getElementById('time-offset-container');
        if (timeOffsetContainer) timeOffsetContainer.style.display = isVisible ? 'flex' : 'none';
    }

    // Create time offset input
    function createTimeOffsetInput() {
        const container = document.createElement('div');
        container.id = 'time-offset-container';
        Object.assign(container.style, {
            position: 'absolute',
            bottom: '20px',
            right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'row',
            gap: '4px',
            alignItems: 'center'
        });

        const label = document.createElement('div');
        label.textContent = '时间偏移';
        Object.assign(label.style, {
            fontSize: '12px'
        });

        const input = document.createElement('div');
        input.textContent = timeOffset;
        Object.assign(input.style, {
            textAlign: 'center',
            padding: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px'
        });

        container.appendChild(label);
        container.appendChild(input);
        timeOffsetInputElement = input;
        return container;
    }

    // Create score overlay
    function createScoreOverlay(position) {
        const overlay = document.createElement('div');
        overlay.id = `score-overlay-${position}`;
        Object.assign(overlay.style, {
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            [position === 'home' ? 'left' : 'right']: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: position === 'home' ? '#FFB366' : '#66B2FF',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            zIndex: '9999',
            pointerEvents: 'auto',
            display: 'none',
            flexDirection: 'column',
            gap: '8px',
            cursor: 'pointer'
        });

        return overlay;
    }

    // Calculate video time from match minute
    function calculateVideoTime(matchMinute) {
        const minute = parseInt(matchMinute, 10);
        if (isNaN(minute)) return null;

        const adjustedMinute = minute <= 45 ?
            minute + timeOffset :
            minute + timeOffset + 15;
        return adjustedMinute * 60;
    }

    // Jump to specific time in video
    function jumpToVideoTime(seconds) {
        const videoElement = document.querySelector('video');
        if (videoElement && !isNaN(seconds)) {
            videoElement.currentTime = seconds;
        }
    }

    // Find video container and add overlays
    function addOverlaysToVideo() {
        const videoElement = document.querySelector('video');
        if (videoElement) {
            const videoContainer = videoElement.parentElement;
            if (videoContainer) {
                if (getComputedStyle(videoContainer).position === 'static') {
                    videoContainer.style.position = 'relative';
                }

                const existingHomeOverlay = document.getElementById('score-overlay-home');
                const existingGuestOverlay = document.getElementById('score-overlay-guest');
                const existingOffsetInput = document.getElementById('time-offset-container');

                if (existingHomeOverlay) existingHomeOverlay.remove();
                if (existingGuestOverlay) existingGuestOverlay.remove();
                if (existingOffsetInput) existingOffsetInput.remove();

                const homeOverlay = createScoreOverlay('home');
                const guestOverlay = createScoreOverlay('guest');
                const offsetInput = createTimeOffsetInput();

                videoContainer.appendChild(homeOverlay);
                videoContainer.appendChild(guestOverlay);
                videoContainer.appendChild(offsetInput);

                return { homeOverlay, guestOverlay };
            }
        }
        return null;
    }

    // Check if player info has goal icons
    function hasGoalIcon(playerInfoDiv) {
        if (!playerInfoDiv) return false;
        const goalIconClasses = ['.icon.gold', '.icon.dqw-gold', '.icon.wl-gold'];
        return goalIconClasses.some(className =>
            playerInfoDiv.querySelector(className) !== null
        );
    }

    // Get goal details
    function getGoalDetails(scoreElement) {
        const playerInfoDiv = scoreElement.parentElement.querySelector('.player-info');
        const playerNameElement = playerInfoDiv?.querySelector('.player-name');
        const timeNumElement = scoreElement.parentElement.parentElement.querySelector('.time-num');
        const timeNumParent = timeNumElement?.parentElement?.parentElement;
        const isHome = timeNumParent?.classList.contains('home');
        const isGuest = timeNumParent?.classList.contains('guest');

        let time = timeNumElement ? timeNumElement.textContent.trim() : '';
        if (time && !time.includes("'")) {
            time += "'";
        }

        const scoreSpan = scoreElement.querySelector('span');
        const score = scoreSpan ? scoreSpan.textContent.trim().replace(/\s+/g, '') : '';

        return {
            playerName: playerNameElement ? playerNameElement.textContent.trim() : '',
            time: time,
            score: score,
            teamType: isHome ? 'home' : isGuest ? 'guest' : null
        };
    }

    // Create score entry
    function createScoreEntry(score, playerName, time) {
        const entryDiv = document.createElement('div');
        entryDiv.style.display = 'flex';
        entryDiv.style.flexDirection = 'column';
        entryDiv.style.gap = '4px';
        entryDiv.style.alignItems = 'flex-start';

        const scoreTimeDiv = document.createElement('div');
        scoreTimeDiv.textContent = `${score}  ${time}`;
        scoreTimeDiv.style.cursor = 'pointer';
        scoreTimeDiv.style.fontSize = '16px';
        scoreTimeDiv.style.fontWeight = 'bold';

        scoreTimeDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            const matchMinute = time.replace(/\D/g, '');
            const videoTime = calculateVideoTime(matchMinute);
            if (videoTime !== null) {
                jumpToVideoTime(videoTime);
            }
        });

        entryDiv.appendChild(scoreTimeDiv);

        if (playerName) {
            const playerNameDiv = document.createElement('div');
            const shortName = playerName.length > 7 ? playerName.slice(0, 7) + '...' : playerName;
            playerNameDiv.textContent = shortName;
            playerNameDiv.title = playerName;
            playerNameDiv.style.cursor = 'pointer';
            playerNameDiv.style.fontSize = '14px';
            playerNameDiv.style.fontWeight = 'normal';

            playerNameDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                const matchMinute = time.replace(/\D/g, '');
                const videoTime = calculateVideoTime(matchMinute);
                if (videoTime !== null) {
                    jumpToVideoTime(videoTime);
                }
            });

            entryDiv.appendChild(playerNameDiv);
        }

        return entryDiv;
    }

    // Update score
    function updateScore() {
        const scoreElements = document.querySelectorAll('.current-score');
        const overlays = addOverlaysToVideo();

        if (overlays) {
            const { homeOverlay, guestOverlay } = overlays;
            let hasHomeScore = false;
            let hasGuestScore = false;

            homeOverlay.innerHTML = '';
            guestOverlay.innerHTML = '';

            scoreElements.forEach(scoreElement => {
                const playerInfoDiv = scoreElement.parentElement.querySelector('.player-info');

                if (hasGoalIcon(playerInfoDiv)) {
                    const scoreSpan = scoreElement.querySelector('span');
                    if (scoreSpan) {
                        const score = scoreSpan.textContent.trim().replace(/\s+/g, '');
                        if (score && score !== '0:0') {
                            const { playerName, time, teamType } = getGoalDetails(scoreElement);
                            if (teamType) {
                                const scoreEntry = createScoreEntry(score, playerName, time);
                                if (teamType === 'home') {
                                    homeOverlay.appendChild(scoreEntry);
                                    hasHomeScore = true;
                                } else {
                                    guestOverlay.appendChild(scoreEntry);
                                    hasGuestScore = true;
                                }
                            }
                        }
                    }
                }
            });

            homeOverlay.style.display = (hasHomeScore && isScoreVisible) ? 'flex' : 'none';
            guestOverlay.style.display = (hasGuestScore && isScoreVisible) ? 'flex' : 'none';
        }
    }

    // Watch for video element changes
    const overlayObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                if (!document.getElementById('score-overlay-home') || !document.getElementById('score-overlay-guest')) {
                    addOverlaysToVideo();
                    updateScore();
                }
            }
        }
    });

    function observeOverlays() {
        if (!document.body) return;
        overlayObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Initialize
    function initialize() {
        console.log('初始化脚本');
        setupKeyboardListener();
        observeOverlays();
        startFullMatchReplayWatcher();

        addOverlaysToVideo();
        updateScore();

        // 初始显示时间偏移控件，并设置自动隐藏计时器
        isTimeOffsetVisible = true;
        toggleTimeOffsetVisibility(true);
        resetTimeOffsetHideTimer();
    }

    function whenBodyReady(cb) {
        if (document.body) {
            cb();
            return;
        }
        const readyObs = new MutationObserver(() => {
            if (document.body) {
                readyObs.disconnect();
                cb();
            }
        });
        readyObs.observe(document.documentElement, { childList: true });
    }

    whenBodyReady(initialize);

    // Update scores periodically
    setInterval(updateScore, 5000);

})();